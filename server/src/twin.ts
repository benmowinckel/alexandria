/**
 * PLM — "ask this mind" twin inference. Two variants, one adapter.
 *
 * An Author's mind projects into the Library as up to TWO queryable twins
 * (plm.md § both-twin architecture):
 *
 *   • weights twin — a LoRA adapter compiled from the Author's substrate and
 *     sessions. Raw sources are absent at query time, but public release still
 *     requires the canary extraction gate: trained weights can memorize. NEVER
 *     uses tools (small fine-tuned open model; the seam below is inert).
 *
 *   • context twin — the FIDELITY CEILING. A frontier model receives only the
 *     exact Library scopes selected by Worker-side access gates, plus the active
 *     artifact and bounded visitor conversation. It never opens local files.
 *
 * Why an HTTP adapter and not a direct call: Tinker sampling is a Python SDK
 * (client-side tokenizer + renderer + disable-thinking template) and the
 * Worker. The ONE integration point is a small inference sidecar
 * (private/plm/twin_server.py) that fronts the model(s) and holds model keys.
 * The Worker holds only deliberately published Library bytes, the sidecar URL,
 * and a bearer secret—never Author source files or provider keys. Empty URL ⇒ the
 * feature reports "twin offline" — zero-regret: the surface stands, the engine
 * slots in when the founder points it at a live sidecar.
 *
 * Config is schemaless (bitter lesson): the Author's twins live in
 * `authors.settings.twin` as free JSON — no migration, no fixed columns. A flat
 * legacy `{enabled, checkpoint, base, ...}` blob is read as the weights twin
 * (back-compat with the single-twin version). Checkpoint/model handles are NOT
 * secrets (opaque handles; the weights behind them are Author-owned and served
 * under the Author's gate).
 */

import { authorizeFileRead, type FileReadDecision } from './file-access.js';
import { normalizeLibraryScope } from './library-scopes.js';

// ---------------------------------------------------------------------------
// Per-Author twin config — read from authors.settings.twin (schemaless JSON)
// ---------------------------------------------------------------------------

export type TwinVariant = 'weights' | 'context';

/** Visibility tiers reuse the EXISTING file-access lexicon — no parallel set. */
export type TwinVisibility = 'public' | 'authors' | 'paid' | 'invite';
const VISIBILITIES: readonly TwinVisibility[] = ['public', 'authors', 'paid', 'invite'];

/**
 * Fixed tool boundary for the context twin:
 *   • works — the "living page": retrieval over the Author's OWN published
 *     Library content, so the twin can discuss the Author's essays/projects AS
 *     the Author. Default ON — this is what makes the page come alive.
 *   • web   — always OFF while Author context is loaded; untrusted web input
 *     belongs in a separate dirty-zone process.
 * The weights twin is hard-forced both-off (no native tool-use). */
export interface TwinToolConfig {
  works: boolean;
  web: boolean;
}

/** True when the context twin has ANY tool enabled — drives the tool-use seam,
 *  the public "tools" badge, and the agent-vs-sampling endpoint choice. */
export function anyToolEnabled(t: TwinToolConfig): boolean {
  return t.works || t.web;
}

export interface WeightsTwinConfig {
  variant: 'weights';
  /** Published + enabled AND has a resolvable checkpoint. */
  enabled: boolean;
  /** Access tier drawn from the shared visibility system. Default: public. */
  visibility: TwinVisibility;
  /** tinker:// checkpoint handle (Author-owned weights). Not a secret. */
  checkpoint: string | null;
  /** Open-weight base the adapter rides. */
  base: string;
  /** Author-set public label (shown in the UI). */
  label: string | null;
  /** Always both-off — a small fine-tuned model has no native tool-use. */
  tools: TwinToolConfig;
}

export interface ContextTwinConfig {
  variant: 'context';
  /** Published + enabled AND has a resolvable frontier model. */
  enabled: boolean;
  /** Optional outer access gate for using this PLM. Document access remains the
   *  exact scopes intersection below. */
  visibility: TwinVisibility;
  /** Frontier model id. Not a secret. */
  model: string | null;
  /** Author-set public label (shown in the UI). */
  label: string | null;
  /** Fixed context capability: brokered Library retrieval on, live web off. */
  tools: TwinToolConfig;
  /** Exact Library scopes this PLM may ever receive. Parent scopes never imply
   * future cohorts. Missing legacy config fails closed to public only. */
  scopes: string[];
}

export type TwinConfig = WeightsTwinConfig | ContextTwinConfig;

export interface TwinVariants {
  weights: WeightsTwinConfig;
  context: ContextTwinConfig;
}

interface RawTwinSettings {
  // nested (current)
  weights?: unknown;
  context?: unknown;
  // flat (legacy single-twin — read as the weights variant)
  enabled?: unknown;
  checkpoint?: unknown;
  base?: unknown;
  label?: unknown;
  system?: unknown;
}

const DEFAULT_BASE = 'Qwen/Qwen3.6-35B-A3B';

function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function obj(value: unknown): Record<string, unknown> | null {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function vis(value: unknown): TwinVisibility | null {
  const v = str(value);
  return v && (VISIBILITIES as readonly string[]).includes(v) ? (v as TwinVisibility) : null;
}

function scopeConfig(value: unknown): string[] {
  if (!Array.isArray(value)) return ['public'];
  const out = new Set<string>();
  for (const raw of value.slice(0, 64)) {
    if (typeof raw !== 'string') continue;
    const scope = normalizeLibraryScope(raw, 'public');
    if (scope) out.add(scope);
  }
  return out.size ? [...out] : ['public'];
}

/** Extract the `twin` slot from an already-parsed settings object. */
export function readTwinSettings(settings: Record<string, unknown> | null | undefined): RawTwinSettings {
  const raw = settings?.twin;
  return raw && typeof raw === 'object' ? (raw as RawTwinSettings) : {};
}

export interface TwinEnv {
  DEFAULT_TWIN_CHECKPOINT?: string;
  DEFAULT_TWIN_BASE?: string;
  /** Frontier model used for brokered Library context. */
  DEFAULT_TWIN_CONTEXT_MODEL?: string;
}

/**
 * Resolve BOTH twin variants for an Author.
 *
 * Back-compat: if `settings.twin` has no nested `weights`/`context` keys, a flat
 * legacy blob (`{enabled, checkpoint, base, label}`) is read as the
 * weights variant — the single-twin config keeps working with zero migration.
 *
 * The checkpoint/base/model fall back to env defaults (the User-Zero path: the
 * founder can enable a twin with just `{ "enabled": true }` and let the
 * deploy-time default supply the current compile). Per-Author overrides win.
 */
export function resolveTwinVariants(
  settings: Record<string, unknown> | null | undefined,
  env: TwinEnv = {},
): TwinVariants {
  const t = readTwinSettings(settings);
  const nested = obj(t.weights) || obj(t.context);
  // Flat legacy blob maps to the weights variant ONLY when there are no nested keys.
  const wRaw = obj(t.weights) || (nested ? {} : (t as Record<string, unknown>));
  const cRaw = obj(t.context) || {};

  const checkpoint = str(wRaw.checkpoint) || str(env.DEFAULT_TWIN_CHECKPOINT);
  const base = str(wRaw.base) || str(env.DEFAULT_TWIN_BASE) || DEFAULT_BASE;
  const weights: WeightsTwinConfig = {
    variant: 'weights',
    enabled: wRaw.enabled === true && !!checkpoint,
    visibility: vis(wRaw.visibility) || 'public',
    checkpoint,
    base,
    label: str(wRaw.label),
    tools: { works: false, web: false },
  };

  const model = str(cRaw.model) || str(env.DEFAULT_TWIN_CONTEXT_MODEL);
  const context: ContextTwinConfig = {
    variant: 'context',
    enabled: cRaw.enabled === true && !!model,
    visibility: vis(cRaw.visibility) || 'invite',
    model,
    label: str(cRaw.label),
    tools: { works: true, web: false },
    scopes: scopeConfig(cRaw.scopes),
  };

  return { weights, context };
}

/** Back-compat shim: the weights variant only. Retained for any caller that
 *  wants the single (floor) twin without touching the variants shape. */
export function resolveTwinConfig(
  settings: Record<string, unknown> | null | undefined,
  env: TwinEnv = {},
): WeightsTwinConfig {
  return resolveTwinVariants(settings, env).weights;
}

// ---------------------------------------------------------------------------
// Public projections — never leak the checkpoint/model handle or system line
// ---------------------------------------------------------------------------

/** One variant's public shape. `accessible` is viewer-relative (gate applied by
 *  the route). `tools` surfaces the capability so the UI can badge a tool-using
 *  twin. */
export interface TwinVariantSummary {
  variant: TwinVariant;
  enabled: boolean;
  visibility: TwinVisibility;
  label: string | null;
  /** Per-tool capability, surfaced so the UI can badge what the twin can do
   *  (reference the Author's works / search the web). Never a model handle. */
  tools: TwinToolConfig;
  accessible: boolean;
  /** Enabled + invite-gated + this viewer isn't in yet: reachable by entering a
   *  valid invite code. Lets the page render an "unlock" field instead of hiding
   *  an invite-only twin entirely (otherwise an invited user sees nothing). */
  needsInvite: boolean;
}

/** Drives whether the website renders the ask box and how many variants it
 *  offers the current viewer. `accessibleFor` decides per-variant reachability
 *  (route passes the gate result). Only ENABLED variants are surfaced; the
 *  legacy `{enabled,label}` fields are kept for the old client. */
export function twinPublicSummary(
  variants: TwinVariants,
  accessibleFor: (v: TwinConfig) => boolean = () => true,
): {
  enabled: boolean;
  label: string | null;
  variants: TwinVariantSummary[];
} {
  const all: TwinConfig[] = [variants.weights, variants.context];
  const summaries: TwinVariantSummary[] = all
    .filter((cfg) => cfg.enabled)
    .map((cfg) => {
      const accessible = accessibleFor(cfg);
      return {
        variant: cfg.variant,
        enabled: cfg.enabled,
        visibility: cfg.visibility,
        label: cfg.label,
        tools: cfg.tools,
        accessible,
        // An invite-gated variant the viewer can't yet reach is UNLOCKABLE, not
        // hidden — the page offers an invite field. Without this, the invite-only
        // launch config (weights dark, deep=invite) renders nothing for an
        // invited user, hiding the flagship feature entirely.
        needsInvite: !accessible && cfg.visibility === 'invite',
      };
    });

  // Legacy top-level fields = the first variant this viewer can use OR unlock,
  // so the section renders (weights floor preferred) instead of vanishing when
  // the only twin is invite-gated.
  const primary = summaries.find((s) => s.accessible)
    || summaries.find((s) => s.needsInvite)
    || null;
  return {
    enabled: !!primary,
    label: primary?.label ?? null,
    variants: summaries,
  };
}

/** Compact machine-facing context for API clients. The website communicates
 *  this through the mirror label and does not render a standing disclaimer. */
export function twinDisclaimer(displayName: string): string {
  return `AI reflecting ${displayName}'s published thinking.`;
}

// ---------------------------------------------------------------------------
// Visibility gate — REUSES file-access.authorizeFileRead. No parallel system.
// ---------------------------------------------------------------------------

export interface TwinAccessContext {
  /** Accessor holds a valid invite code for this Author (route-validated). */
  inviteValid?: boolean;
  /** Accessor holds an active Alexandria subscription. For twins the "paid"
   *  tier is metered-per-query and rides the querier's subscription (plm.md §
   *  payment), so an active sub satisfies the file-gate's `purchaseValid`. */
  subscriberValid?: boolean;
}

/**
 * Decide whether the accessor may query this twin variant. Delegates the whole
 * decision to `authorizeFileRead` (the single visibility brain) by mapping the
 * twin's context onto the file gate's `{ inviteValid, purchaseValid }`:
 *   • invite → route-validated invite code
 *   • paid   → an active subscription (twins are metered, not one-time-bought)
 * public/authors/owner fall through identically. No twin-specific access rules.
 */
export function authorizeTwinAccess(opts: {
  visibility: TwinVisibility;
  authorGithubId: string | number;
  accessorGithubId: string | number | null;
  context?: TwinAccessContext;
}): FileReadDecision {
  return authorizeFileRead({
    visibility: opts.visibility,
    authorGithubId: opts.authorGithubId,
    accessorGithubId: opts.accessorGithubId,
    context: {
      inviteValid: opts.context?.inviteValid,
      purchaseValid: opts.context?.subscriberValid,
    },
  });
}

// ---------------------------------------------------------------------------
// Inference adapter — the single integration point (both variants)
// ---------------------------------------------------------------------------

/** One published piece the querier is allowed to see, pre-gated by the Worker.
 *  The sidecar never opens Author files or re-derives the permission decision. */
export interface TwinWork {
  scope: string;
  name: string;
  visibility: string;
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
  /** Sidecar URL. Empty/undefined ⇒ twin offline (503). */
  url?: string;
  /** Bearer secret the sidecar checks. */
  secret?: string;
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
 * The Worker holds one URL (TWIN_INFERENCE_URL, conventionally ".../infer");
 * derive the agent path from it so only one secret/URL is configured.
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

/** Cloudflare Access service-token headers for reaching an Access-protected
 *  sidecar tunnel. When set, "found the tunnel URL + bearer secret" is no longer
 *  enough — the request must ALSO carry the Worker's Access service identity, so
 *  network reachability becomes a structural second factor (invariant 5: network
 *  identity). Env-gated: absent → no-op, so this is safe before the founder
 *  provisions Access on the named tunnel. */
export function accessHeaders(): Record<string, string> {
  const id = process.env.TWIN_ACCESS_CLIENT_ID;
  const secret = process.env.TWIN_ACCESS_CLIENT_SECRET;
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
    // Offline is NOT "I don't know" — the mirror never ran. Say which, plainly,
    // because a reader can't tell an unreachable mind from a stumped one and
    // will read the failure as the answer (founder 2026-07-28, from production).
    return { ok: false, status: 503, reason: 'offline', error: 'this mirror is offline. your question wasn’t answered.' };
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
        ...accessHeaders(),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      return { ok: false, status: 502, reason: 'upstream_error', error: 'the mirror hit an error and couldn’t answer. your question wasn’t answered.' };
    }
    const respBody = (await res.json().catch(() => null)) as { answer?: unknown; error?: unknown } | null;
    const answer = typeof respBody?.answer === 'string' ? respBody.answer.trim() : '';
    if (!answer) {
      return { ok: false, status: 502, reason: 'empty', error: 'the mirror came back empty. your question wasn’t answered.' };
    }
    return { ok: true, answer };
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return aborted
      ? { ok: false, status: 504, reason: 'timeout', error: 'the mirror took too long and the question timed out. it wasn’t answered.' }
      : { ok: false, status: 502, reason: 'fetch_failed', error: 'couldn’t reach the mirror — it may be offline. your question wasn’t answered.' };
  } finally {
    clearTimeout(timeout);
  }
}
