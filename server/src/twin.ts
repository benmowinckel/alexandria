/**
 * PLM — "ask this mind" twin inference.
 *
 * The public-safe projection of an Author's mind: a weights-twin (LoRA adapter
 * compiled from the Author's substrate + sessions) answers a stranger's
 * question. Weights, not context — the privacy floor (plm.md § both-twin
 * architecture): the raw constitution is baked irreversibly into the adapter,
 * so nothing at query time exposes the Author's private thoughts, and no
 * prompt-injection can exfiltrate a system prompt that was never there.
 *
 * Why an HTTP adapter and not a direct call: Tinker sampling is a Python SDK
 * (client-side tokenizer + renderer + disable-thinking template). A Worker
 * cannot reproduce that, and MUST NOT hold TINKER_API_KEY. So the ONE
 * integration point is a small inference sidecar (see private/plm/twin_server.py)
 * that fronts Tinker and holds the key. The Worker holds only the sidecar's URL
 * (TWIN_INFERENCE_URL) + a bearer secret (TWIN_INFERENCE_SECRET). Empty URL ⇒
 * the feature reports "twin offline" — zero-regret: the surface stands, the
 * engine behind it slots in when the founder points it at a live sidecar.
 *
 * Config is schemaless (bitter lesson): the Author's twin lives in
 * `authors.settings.twin` as free JSON — no migration, no fixed columns. The
 * checkpoint URI is NOT a secret (it's an opaque tinker:// handle; the weights
 * behind it are Author-owned and served under the Author's gate).
 */

// ---------------------------------------------------------------------------
// Per-Author twin config — read from authors.settings.twin (schemaless JSON)
// ---------------------------------------------------------------------------

export interface TwinConfig {
  /** Twin is published + enabled AND has a resolvable checkpoint. */
  enabled: boolean;
  /** tinker:// checkpoint handle (Author-owned weights). Not a secret. */
  checkpoint: string | null;
  /** Open-weight base the adapter rides. */
  base: string;
  /** Author-set public label for the twin (shown in the UI). */
  label: string | null;
  /** Identity system line the twin was trained with. */
  system: string | null;
}

interface RawTwinSettings {
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

/** Extract the `twin` slot from an already-parsed settings object. */
export function readTwinSettings(settings: Record<string, unknown> | null | undefined): RawTwinSettings {
  const raw = settings?.twin;
  return raw && typeof raw === 'object' ? (raw as RawTwinSettings) : {};
}

/**
 * Resolve the effective twin config for an Author.
 *
 * The checkpoint/base fall back to env defaults (DEFAULT_TWIN_CHECKPOINT /
 * DEFAULT_TWIN_BASE) — the User-Zero path: the founder can enable their twin
 * with `{ "enabled": true }` and let the deploy-time default supply the current
 * compile, rather than pasting a checkpoint into D1. Per-Author overrides win.
 */
export function resolveTwinConfig(
  settings: Record<string, unknown> | null | undefined,
  env: { DEFAULT_TWIN_CHECKPOINT?: string; DEFAULT_TWIN_BASE?: string } = {},
): TwinConfig {
  const t = readTwinSettings(settings);
  const checkpoint = str(t.checkpoint) || str(env.DEFAULT_TWIN_CHECKPOINT);
  const base = str(t.base) || str(env.DEFAULT_TWIN_BASE) || DEFAULT_BASE;
  const enabled = t.enabled === true && !!checkpoint;
  return { enabled, checkpoint, base, label: str(t.label), system: str(t.system) };
}

/** Public summary — never leaks the checkpoint handle. Drives whether the
 *  website renders the ask box, and with what label. */
export function twinPublicSummary(config: TwinConfig): { enabled: boolean; label: string | null } {
  return { enabled: config.enabled, label: config.label };
}

/** The honest label. The visitor is talking to a compiled model, not a person. */
export function twinDisclaimer(displayName: string): string {
  return `this is ${displayName}'s trained twin — a model compiled from their published substrate, not the person. it can be wrong, and may not reflect their real views.`;
}

// ---------------------------------------------------------------------------
// Inference adapter — the single integration point
// ---------------------------------------------------------------------------

export interface TwinInferenceRequest {
  question: string;
  checkpoint: string;
  base: string;
  system: string;
  maxTokens: number;
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
 * Call the inference sidecar. The sidecar receives ONLY {checkpoint, base,
 * system, question, max_tokens} — never any Author private data — runs the
 * Tinker sampling, and returns { answer }. This is the whole trust boundary:
 * an untrusted inference host sees a question and an opaque weights handle,
 * nothing else.
 */
export async function runTwinInference(
  req: TwinInferenceRequest,
  opts: TwinInferenceOpts,
): Promise<TwinInferenceResult> {
  const url = opts.url?.trim();
  if (!url) {
    return { ok: false, status: 503, reason: 'offline', error: 'the twin is offline right now.' };
  }

  const ctrl = new AbortController();
  const timeout = setTimeout(() => ctrl.abort(), opts.timeoutMs ?? 45000);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.secret ? { Authorization: `Bearer ${opts.secret}` } : {}),
      },
      body: JSON.stringify({
        checkpoint: req.checkpoint,
        base: req.base,
        system: req.system,
        question: req.question,
        max_tokens: req.maxTokens,
      }),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      return { ok: false, status: 502, reason: 'upstream_error', error: 'the twin could not answer just now.' };
    }
    const body = (await res.json().catch(() => null)) as { answer?: unknown; error?: unknown } | null;
    const answer = typeof body?.answer === 'string' ? body.answer.trim() : '';
    if (!answer) {
      return { ok: false, status: 502, reason: 'empty', error: 'the twin returned nothing.' };
    }
    return { ok: true, answer };
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    return aborted
      ? { ok: false, status: 504, reason: 'timeout', error: 'the twin took too long to answer.' }
      : { ok: false, status: 502, reason: 'fetch_failed', error: 'could not reach the twin.' };
  } finally {
    clearTimeout(timeout);
  }
}
