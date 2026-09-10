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

export * from '../../shared/mirror-transport.js';
import type { TwinVariant, TwinVisibility, TwinToolConfig } from '../../shared/mirror-transport.js';

/** Visibility tiers reuse the EXISTING file-access lexicon — no parallel set. */
const VISIBILITIES: readonly TwinVisibility[] = ['public', 'authors', 'paid', 'invite'];

/**
 * Fixed tool boundary for the context twin:
 *   • works — the "living page": retrieval over the Author's OWN published
 *     Library content, so the mirror can discuss the Author's essays/projects
 *     while remaining explicitly separate from the Author. Default ON — this
 *     is what makes the page come alive.
 *   • web   — always OFF while Author context is loaded; untrusted web input
 *     belongs in a separate dirty-zone process.
 * The weights twin is hard-forced both-off (no native tool-use). */

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
 * Explicit caller-supplied defaults are available to standalone consumers.
 * The shared Library supplies no defaults: each Author configures their own
 * checkpoint or model. Per-Author settings win when a caller supplies defaults.
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
  return `ai reflecting ${displayName}'s published thinking.`;
}

// ---------------------------------------------------------------------------
// Visibility gate — REUSES file-access.authorizeFileRead. No parallel system.
// ---------------------------------------------------------------------------

export interface TwinAccessContext {
  /** Scoped visitor sessions never gain the Author's private owner bypass. */
  allowOwner?: boolean;
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
      allowOwner: opts.context?.allowOwner,
      inviteValid: opts.context?.inviteValid,
      purchaseValid: opts.context?.subscriberValid,
      subscriberValid: opts.context?.subscriberValid,
    },
  });
}
