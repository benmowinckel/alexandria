/** Shared adapter transport: no account lookup, storage, provider keys or private files. */
export type TwinVariant = 'weights' | 'context';
export type TwinVisibility = 'public' | 'authors' | 'paid' | 'invite';
export interface TwinToolConfig { works: boolean; web: boolean }

/** Bound an adapter response before parsing it, on both Worker and own-site paths. */
export async function readMirrorJson(response: Response, limit = 131_072): Promise<Record<string, unknown>> {
  if (!response.body) throw new Error('Empty response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let length = 0;
  try {
    for (;;) {
      const item = await reader.read();
      if (item.done) break;
      length += item.value.length;
      if (length > limit) throw new Error('Response too large');
      chunks.push(item.value);
    }
  } finally { await reader.cancel(); }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.length; }
  const data = JSON.parse(new TextDecoder().decode(bytes));
  if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid response');
  return data;
}

/** One published piece the querier is allowed to see, pre-gated by the Worker.
 *  The sidecar never opens Author files or re-derives the permission decision. */
export interface TwinWork {
  scope: string;
  name: string;
  visibility: string;
  /** Author-owned presentation role. `shadows` is the mirror's always-loaded
   *  unified context; other categories remain available through retrieval. */
  category: string;
  content: string;
}

export interface TwinInferenceRequest {
  variant: TwinVariant;
  question: string;
  system: string;
  maxTokens: number;
  // weights variant
  checkpoint?: string | null;
  base?: string | null;
  // context variant
  model?: string | null;
  /** Per-tool capability (context variant only). Passed to the sidecar, which
   *  runs the tool-use agent loop. */
  tools?: TwinToolConfig;
  /** Author id (github login) — labels the brokered Library search tool. */
  author?: string | null;
  /** Pre-gated published works for the `search_my_works` tool (context only). */
  works?: TwinWork[];
  /** Bounded current visitor conversation. It is reader input, never Author substrate. */
  messages?: { role: 'user' | 'assistant'; content: string }[];
  /** Exact manifest hash and effective scopes chosen by the Worker. */
  contextHash?: string;
  contextScopes?: string[];
  /** Public links as shown on the profile. They are routing references only;
   *  neither the Worker nor sidecar crawls them for hidden context. */
  links?: { label: string; url: string }[];
  /** Coarse display tier derived from the exact effective scopes. */
  tier?: TwinVisibility;
  /** The piece the querier is reading (context only) — passed so the twin can
   *  discuss it. The sidecar injects it as delimited, explicitly-untrusted text
   *  in the USER turn (never the system prompt), so it can't reframe the twin. */
  focus?: { name: string; content: string };
}

export type TwinInferenceResult =
  | { ok: true; answer: string }
  | { ok: false; status: number; reason: string; error: string };

export interface TwinInferenceOpts {
  /** Owner request / overall operation deadline, including retries. */
  signal?: AbortSignal;
  /** Sidecar URL. Empty/undefined ⇒ twin offline (503). */
  url?: string;
  /** Bearer secret the sidecar checks. */
  secret?: string;
  /** Optional tunnel identity registered for this adapter, never global keys. */
  access_client_id?: string;
  access_client_secret?: string;
  timeoutMs?: number;
}

/**
 * Call the inference sidecar. The trust boundary differs by variant:
 *
 *   • weights → the sidecar receives ONLY {variant, checkpoint, base, system,
 *     question, max_tokens} — never any Author private data. An untrusted
 *     inference host sees a question and an opaque weights handle, nothing else.
 *
 *   • context → the sidecar receives the Worker's exact authorized Library
 *     slice, context manifest hash, active artifact, and bounded conversation.
 *     It has no local Author-file access and never widens the scope decision.
 *
 * The Worker never holds checkpoint weights, private local Author sources, or
 * model keys. Deliberately published Library files live in D1/R2; the Worker
 * materializes only this authorized slice in process for the current request.
 */
/**
 * The sidecar exposes two POST endpoints:
 *   • /infer — single-shot sampling (weights via Tinker, or context single-turn).
 *   • /agent — the context tool-use agent loop (frontier model + tools).
 * Each Author registers one URL (conventionally ".../infer"); derive the agent
 * path from it so each adapter needs only one secret/URL.
 */
export function agentEndpointFrom(url: string): string {
  const u = url.replace(/\/+$/, '');
  if (u.endsWith('/infer')) return `${u.slice(0, -'/infer'.length)}/agent`;
  return `${u}/agent`;
}

/** The sidecar's PUBLIC Alexandria-guide endpoint (the homepage "ask Alexandria"
 *  company twin), derived from the same base URL as /infer and /agent. Same
 *  transport (bearer + Access headers); the route reads only public product
 *  knowledge, never any substrate. */
export function guideEndpointFrom(url: string): string {
  const u = url.replace(/\/+$/, '');
  if (u.endsWith('/infer')) return `${u.slice(0, -'/infer'.length)}/guide`;
  return `${u}/guide`;
}

/** Only the identity explicitly attached to this adapter may reach its URL.
 *  A global company identity would leak company credentials to Author hosts. */
export function accessHeaders(connection: Pick<TwinInferenceOpts, 'access_client_id' | 'access_client_secret'>): Record<string, string> {
  const id = connection.access_client_id;
  const secret = connection.access_client_secret;
  return id && secret
    ? { 'CF-Access-Client-Id': id, 'CF-Access-Client-Secret': secret }
    : {};
}

/** The sidecar's liveness endpoint, derived from the configured inference URL —
 *  same base, `/health` path. Used by the online/offline check. */
export function healthEndpointFrom(url: string): string {
  const u = url.replace(/\/+$/, '');
  const base = u.endsWith('/infer') ? u.slice(0, -'/infer'.length) : u;
  return `${base}/health`;
}

/** Guard an Author-supplied sidecar URL before the Worker will call it. Must be
 *  https and must not point at a private/loopback host — otherwise a registered
 *  URL becomes an SSRF handle into internal infra. Returns an error string or null. */
export function validateSidecarUrl(raw: string): string | null {
  let u: URL;
  try { u = new URL(raw); } catch { return 'sidecar url must be a valid URL'; }
  if (u.protocol !== 'https:') return 'sidecar url must be https';
  if (u.username || u.password || u.search || u.hash) return 'sidecar url must not contain credentials, a query, or a fragment';
  // Strip IPv6 brackets ([::1] → ::1) so literal v6 addresses are checked too.
  const host = u.hostname.toLowerCase().replace(/^\[|\]$/g, '');
  const privateHost = host === 'localhost'
    || host === '127.0.0.1' || host === '::1' || host === '::' || host === '0.0.0.0'
    || host.endsWith('.local') || host.endsWith('.internal') || host.endsWith('.localhost')
    // IPv4 private / loopback / link-local / this-network
    || /^10\./.test(host) || /^192\.168\./.test(host)
    || /^172\.(1[6-9]|2\d|3[01])\./.test(host)
    || /^127\./.test(host) || /^169\.254\./.test(host) || /^0\./.test(host)
    // IPv6 loopback / unique-local (fc00::/7) / link-local (fe80::/10) /
    // IPv4-mapped (::ffff:a.b.c.d — catch the mapped-loopback/private forms)
    || /^f[cd][0-9a-f]{2}:/.test(host) || /^fe[89ab][0-9a-f]:/.test(host)
    || /^::ffff:(0*a\.|0*7f\.|0*c0\.0*a8\.|0*a9\.0*fe\.)/.test(host)
    || host.startsWith('::ffff:127.') || host.startsWith('::ffff:10.')
    || host.startsWith('::ffff:192.168.') || host.startsWith('::ffff:169.254.');
  if (privateHost) return 'sidecar url must be a public host (not localhost/private)';
  return null;
}

export async function runTwinInference(
  req: TwinInferenceRequest,
  opts: TwinInferenceOpts,
): Promise<TwinInferenceResult> {
  const url = opts.url?.trim();
  if (!url) {
    // Offline is the computer, not a broken product. The answering model
    // lives on the Author's machine; a sleeping Mac is the expected miss.
    return { ok: false, status: 503, reason: 'offline', error: 'This computer is offline, so the personal language model could not answer just now. Try again in a moment.' };
  }

  // -----------------------------------------------------------------------
  // Tool-use routing (context variant, frontier model).
  //
  // Every context query goes to the sidecar's /agent endpoint, which retrieves
  // only over the exact Library slice already brokered into this request. Live
  // web is fixed off. Weights go to /infer and never reach the agent path.
  const toolsRequested = req.variant === 'context';
  const target = toolsRequested ? agentEndpointFrom(url) : url;

  const ctrl = new AbortController();
  const cancel = () => ctrl.abort();
  if (opts.signal?.aborted) ctrl.abort();
  else opts.signal?.addEventListener('abort', cancel, { once: true });
  // Tool loops make several model round-trips — give the agent path more room.
  const timeout = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? (toolsRequested ? 120000 : 45000));
  try {
    const body: Record<string, unknown> = {
      variant: req.variant,
      system: req.system,
      question: req.question,
      max_tokens: req.maxTokens,
    };
    if (req.variant === 'weights') {
      body.checkpoint = req.checkpoint;
      body.base = req.base;
    } else {
      body.model = req.model;
      body.tools = req.tools ?? { works: false, web: false };
      body.author = req.author ?? null;
      // Coarse display tier; the exact context ceiling is context_scopes.
      body.tier = req.tier ?? 'public';
      body.context_hash = req.contextHash ?? null;
      body.context_scopes = req.contextScopes ?? [];
      if (req.messages?.length) body.messages = req.messages;
      // The piece being read (reader workspace) — sidecar puts it in a delimited
      // untrusted USER block so the twin can discuss it without being reframed.
      if (req.focus && req.focus.content) body.focus = req.focus;
      // Pre-gated published works for search_my_works (the Worker is the gate).
      if (req.works && req.works.length) body.works = req.works;
      // The declared links-out graph — routing floor for linked surfaces.
      if (req.links && req.links.length) body.links = req.links;
    }

    const res = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.secret ? { Authorization: `Bearer ${opts.secret}` } : {}),
        ...accessHeaders(opts),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
      // Manual mode works in both Workers and Node. Rejecting non-2xx below
      // prevents an adapter redirect from forwarding context or credentials.
      redirect: 'manual',
    });

    if (!res.ok) {
      if (res.status === 429) return { ok: false, status: 429, reason: 'allowance_spent', error: 'this mirror has reached its question limit. take the conversation with you or try again later.' };
      return { ok: false, status: 502, reason: 'upstream_error', error: 'The mirror could not answer just now. Try again in a moment.' };
    }
    const respBody = await readMirrorJson(res).catch(() => null);
    const answer = typeof respBody?.answer === 'string' ? respBody.answer.trim() : '';
    if (!answer) {
      return { ok: false, status: 502, reason: 'empty', error: 'The mirror could not answer just now. Try again in a moment.' };
    }
    return { ok: true, answer };
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return aborted
      ? { ok: false, status: 504, reason: 'timeout', error: 'The mirror could not answer just now. Try again in a moment.' }
      : { ok: false, status: 502, reason: 'fetch_failed', error: 'This computer is offline, so the personal language model could not answer just now. Try again in a moment.' };
  } finally {
    clearTimeout(timeout);
    opts.signal?.removeEventListener('abort', cancel);
  }
}
