/**
 * PLM — "ask this mind" twin inference. Two variants, one adapter.
 *
 * An Author's mind projects into the Library as up to TWO queryable twins
 * (plm.md § both-twin architecture — "both + router, always a floor"):
 *
 *   • weights twin — the PRIVACY FLOOR. A LoRA adapter compiled from the
 *     Author's substrate + sessions. The constitution is baked irreversibly
 *     into the weights, so nothing at query time exposes the Author's private
 *     thoughts and no prompt-injection can exfiltrate a system prompt that was
 *     never there. Cheap, always-safe → the stranger-facing default. Public by
 *     default. NEVER uses tools (small fine-tuned open model, no native
 *     tool-use; the seam below is inert for this variant).
 *
 *   • context twin — the FIDELITY CEILING. A frontier model reading the
 *     Author's substrate in context. Higher fidelity (≈human self-consistency
 *     in the pilot) but it EXPOSES the substrate at query time — whatever runs
 *     inference sees the raw constitution. So it defaults to `authors`
 *     visibility (authenticated Alexandria members, where seeing the substrate
 *     is acceptable) and can be tightened to invite/paid. Runs on a frontier
 *     model that can natively use tools → carries a `tools` capability flag and
 *     the tool-use seam in runTwinInference (execution is a separate epic).
 *
 * Why an HTTP adapter and not a direct call: Tinker sampling is a Python SDK
 * (client-side tokenizer + renderer + disable-thinking template) and the
 * context twin's substrate loading lives Author-side. A Worker cannot reproduce
 * either and MUST NOT hold TINKER_API_KEY or the substrate. So the ONE
 * integration point is a small inference sidecar (private/plm/twin_server.py)
 * that fronts the model(s) and holds the keys/substrate. The Worker holds only
 * the sidecar URL (TWIN_INFERENCE_URL) + a bearer secret. Empty URL ⇒ the
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

// ---------------------------------------------------------------------------
// Per-Author twin config — read from authors.settings.twin (schemaless JSON)
// ---------------------------------------------------------------------------

export type TwinVariant = 'weights' | 'context';

/** Visibility tiers reuse the EXISTING file-access lexicon — no parallel set. */
export type TwinVisibility = 'public' | 'authors' | 'paid' | 'invite';
const VISIBILITIES: readonly TwinVisibility[] = ['public', 'authors', 'paid', 'invite'];

/**
 * Per-tool capability for the context (deep) twin. Schemaless in
 * `authors.settings.twin.context.tools` (bitter lesson — free JSON, no
 * migration). Two tools today:
 *   • works — the "living page": retrieval over the Author's OWN published
 *     Library content, so the twin can discuss the Author's essays/projects AS
 *     the Author. Default ON — this is what makes the page come alive.
 *   • web   — web_search + fetch_url. Default OFF (needs a search key on the
 *     sidecar; degrades to "not configured" without one).
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
  /** Identity system line the twin was trained with. */
  system: string | null;
  /** Always both-off — a small fine-tuned model has no native tool-use. */
  tools: TwinToolConfig;
}

export interface ContextTwinConfig {
  variant: 'context';
  /** Published + enabled AND has a resolvable frontier model. */
  enabled: boolean;
  /** Access tier drawn from the shared visibility system. Default: INVITE —
   *  the context twin exposes the substrate, so the SAFE default is the tightest
   *  gate (a single injected authorized querier can extract the whole loaded
   *  context; blast radius must be the smallest set — security model in plm.md). */
  visibility: TwinVisibility;
  /** Frontier model id the substrate is read in context by. Not a secret. */
  model: string | null;
  /** Author-set public label (shown in the UI). */
  label: string | null;
  /** Identity system line. */
  system: string | null;
  /** Per-tool capability for the frontier model (native tool-use). Drives the
   *  agent loop in the sidecar. Default: { works: true, web: false } — the
   *  living page (own-works retrieval) is on, web search is opt-in. */
  tools: TwinToolConfig;
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

/**
 * Parse the context twin's `tools` slot. Back-compat + schemaless:
 *   • object `{ works?, web? }` → each field read as boolean, defaults applied.
 *   • legacy boolean `true`      → `{ works: true, web: false }` (old "tool-capable").
 *   • legacy boolean `false`     → `{ works: false, web: false }`.
 *   • absent                     → `{ works: true, web: false }` (living page on by default).
 */
function toolConfig(value: unknown): TwinToolConfig {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const o = value as Record<string, unknown>;
    return {
      works: typeof o.works === 'boolean' ? o.works : true,
      web: typeof o.web === 'boolean' ? o.web : false,
    };
  }
  if (value === true) return { works: true, web: false };
  if (value === false) return { works: false, web: false };
  return { works: true, web: false };
}

/** Extract the `twin` slot from an already-parsed settings object. */
export function readTwinSettings(settings: Record<string, unknown> | null | undefined): RawTwinSettings {
  const raw = settings?.twin;
  return raw && typeof raw === 'object' ? (raw as RawTwinSettings) : {};
}

export interface TwinEnv {
  DEFAULT_TWIN_CHECKPOINT?: string;
  DEFAULT_TWIN_BASE?: string;
  /** Frontier model the context twin reads substrate in context by. */
  DEFAULT_TWIN_CONTEXT_MODEL?: string;
}

/**
 * Resolve BOTH twin variants for an Author.
 *
 * Back-compat: if `settings.twin` has no nested `weights`/`context` keys, a flat
 * legacy blob (`{enabled, checkpoint, base, label, system}`) is read as the
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
    system: str(wRaw.system),
    tools: { works: false, web: false },
  };

  const model = str(cRaw.model) || str(env.DEFAULT_TWIN_CONTEXT_MODEL);
  const context: ContextTwinConfig = {
    variant: 'context',
    enabled: cRaw.enabled === true && !!model,
    visibility: vis(cRaw.visibility) || 'invite',
    model,
    label: str(cRaw.label),
    system: str(cRaw.system),
    tools: toolConfig(cRaw.tools),
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

/** The honest label. The visitor is talking to a compiled model / a model
 *  reading published substrate — not the person. Variant-aware so the context
 *  twin can be honest that it reads the Author's substrate. */
export function twinDisclaimer(displayName: string, variant: TwinVariant = 'weights'): string {
  if (variant === 'context') {
    return `this is ${displayName}'s twin — a top model reading everything they've published, not the person. it can be wrong, and may not reflect their real views.`;
  }
  return `this is ${displayName}'s trained twin — a model compiled from their published substrate, not the person. it can be wrong, and may not reflect their real views.`;
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

/** One published piece the querier is allowed to see, pre-gated by the Worker
 *  (the visibility authority). The sidecar's `search_my_works` tool retrieves
 *  over this corpus — it never re-derives the gate, so visibility is correct by
 *  construction. Content is the Author's PUBLISHED markdown, not private
 *  substrate (the substrate stays sidecar-loaded, never through the Worker). */
export interface TwinWork {
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
  /** Author id (github login) — lets the sidecar label the living-page tool and
   *  fall back to the public Library API if no works are passed inline. */
  author?: string | null;
  /** Pre-gated published works for the `search_my_works` tool (context only). */
  works?: TwinWork[];
  /** The twin's visibility tier (context only). The sidecar loads ONLY the
   *  shadow published at this tier as substrate — never the raw constitution —
   *  so it's a structural ceiling on what the twin can reveal (plm.md § tiered
   *  shadow). Worker-set from the twin's configured visibility, never the caller. */
  tier?: TwinVisibility;
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
 *   • context → the sidecar receives {variant, model, system, question,
 *     max_tokens, tools} and loads the Author's substrate ITSELF (Author-side,
 *     never through the Worker). This variant is substrate-exposing by design,
 *     which is why its visibility is gated up-front (default `authors`).
 *
 * The Worker stays stateless: it never holds the checkpoint weights, the
 * substrate, or the model keys — only the sidecar URL + bearer secret.
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

export async function runTwinInference(
  req: TwinInferenceRequest,
  opts: TwinInferenceOpts,
): Promise<TwinInferenceResult> {
  const url = opts.url?.trim();
  if (!url) {
    return { ok: false, status: 503, reason: 'offline', error: 'the twin is offline right now.' };
  }

  // -----------------------------------------------------------------------
  // Tool-use routing (context variant, frontier model).
  //
  // A frontier model can natively call tools. When ANY tool is enabled on a
  // context query, the request goes to the sidecar's /agent endpoint, which
  // runs a real tool-use loop (search_my_works over the Author's published
  // works, plus web_search/fetch_url when configured) and returns the final
  // answer the model gives AS the Author. Otherwise (no tools, or weights) it
  // goes to /infer for single-shot sampling. The weights variant never reaches
  // the agent path (config forces weights.tools all-off).
  const toolsRequested = req.variant === 'context' && !!req.tools && (req.tools.works || req.tools.web);
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
      // The tier the sidecar loads substrate at (structural ceiling). Worker-set,
      // fail closed to public if somehow unset.
      body.tier = req.tier ?? 'public';
      // Pre-gated published works for search_my_works (the Worker is the gate).
      if (req.works && req.works.length) body.works = req.works;
    }

    const res = await fetch(target, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(opts.secret ? { Authorization: `Bearer ${opts.secret}` } : {}),
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });

    if (!res.ok) {
      return { ok: false, status: 502, reason: 'upstream_error', error: 'the twin could not answer just now.' };
    }
    const respBody = (await res.json().catch(() => null)) as { answer?: unknown; error?: unknown } | null;
    const answer = typeof respBody?.answer === 'string' ? respBody.answer.trim() : '';
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
