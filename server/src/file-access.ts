/**
 * File access gate — the single source of truth for protocol file visibility.
 *
 * Two exports do all the structural work:
 *
 *   1. `authorizeFileRead` — pure decision function. Given visibility + accessor
 *      identity + already-validated token context, returns allow/deny. No I/O.
 *      Unit-tested in `server/test/file-access.ts` across every combination.
 *
 *   2. `readProtocolFile` — the ONLY function that returns protocol_file bytes.
 *      Wraps the D1 metadata lookup, the gate decision, and the R2 fetch.
 *      Routes call this and shape the response; no route reaches `protocol/`
 *      R2 keys directly. New read routes added in the future cannot bypass
 *      the gate because they have no other path to the content.
 *
 * Token validation (invite codes in D1, Stripe purchases in KV) stays at the
 * route boundary — the route knows how its query params and cookies work.
 * It passes the validated booleans to `readProtocolFile` in `context`.
 */

// ---------------------------------------------------------------------------
// Internal test artifact filter
// ---------------------------------------------------------------------------
//
// Lifecycle / smoke / CI files are published by the same /file endpoint as
// real Author files, but they are infrastructure noise — they must never
// surface in Library directories, factory signal, or dashboards. Shared here
// so every consumer of `protocol_files` applies the same filter.

export const INTERNAL_PROTOCOL_FILE_PATTERNS: RegExp[] = [
  /^lifecycle-\d+$/,    // historical: lifecycle test used unique timestamps
  /^lifecycle-test$/,   // current: fixed name, overwritten each run
  /^ci-smoke(?:-\d+)?$/,
  /^smoke-test$/,
  /^test-check$/,
];

export function isInternalProtocolFileName(name: string): boolean {
  return INTERNAL_PROTOCOL_FILE_PATTERNS.some((p) => p.test(name));
}

// ---------------------------------------------------------------------------
// Visibility gate
// ---------------------------------------------------------------------------

export type AllowedReason = 'public' | 'owner' | 'authors' | 'invite' | 'paid';
export type DeniedReason = 'unauthenticated' | 'invite_required' | 'payment_required' | 'unknown_visibility';

export type FileReadDecision =
  | { allowed: true; reason: AllowedReason }
  | { allowed: false; status: 401 | 402 | 403; reason: DeniedReason; body: Record<string, unknown> };

export interface FileReadContext {
  /** Caller has validated a Stripe checkout session that grants access to THIS file. */
  purchaseValid?: boolean;
  /** Caller has validated an invite code that grants access to THIS author's files. */
  inviteValid?: boolean;
}

export interface AuthorizeFileReadOpts {
  visibility: string;
  /** Numeric github_id of the file's owner. Immutable; what protocol_files.account_id holds. */
  authorGithubId: string | number;
  /** Numeric github_id of the accessor, or null if unauthenticated. */
  accessorGithubId: string | number | null;
  context?: FileReadContext;
}

/**
 * Decide whether the accessor may read the file. Pure: no DB, no KV, no I/O.
 *
 * Order of checks (each visibility lands on exactly one branch):
 *   1. public          → anyone, no auth required
 *   2. owner           → file's own author always reads, regardless of visibility
 *   3. unauthenticated → everything below requires auth; deny with 401
 *   4. authors         → any authenticated Author
 *   5. invite          → context.inviteValid required
 *   6. paid            → context.purchaseValid required
 *   7. unknown         → fail closed with 403
 */
export function authorizeFileRead(opts: AuthorizeFileReadOpts): FileReadDecision {
  const v = opts.visibility;
  const accessorId = opts.accessorGithubId == null ? null : String(opts.accessorGithubId);
  const ownerId = String(opts.authorGithubId);
  const isAuthed = accessorId !== null;
  const isOwner = isAuthed && accessorId === ownerId;

  if (v === 'public') return { allowed: true, reason: 'public' };

  if (isOwner) return { allowed: true, reason: 'owner' };

  if (!isAuthed) {
    return {
      allowed: false,
      status: 401,
      reason: 'unauthenticated',
      body: { error: 'Sign in required', visibility: v, reason: 'unauthenticated' },
    };
  }

  if (v === 'authors') return { allowed: true, reason: 'authors' };

  if (v === 'invite') {
    if (opts.context?.inviteValid) return { allowed: true, reason: 'invite' };
    return {
      allowed: false,
      status: 401,
      reason: 'invite_required',
      body: { error: 'Invite code required', visibility: 'invite', reason: 'invite_required' },
    };
  }

  if (v === 'paid') {
    if (opts.context?.purchaseValid) return { allowed: true, reason: 'paid' };
    return {
      allowed: false,
      status: 402,
      reason: 'payment_required',
      body: { error: 'Payment required for this file', visibility: 'paid', reason: 'payment_required' },
    };
  }

  return {
    allowed: false,
    status: 403,
    reason: 'unknown_visibility',
    body: { error: 'Access denied', visibility: v, reason: 'unknown_visibility' },
  };
}

// ---------------------------------------------------------------------------
// Artifact readers — the ONLY functions that fetch content from R2.
//
// Every Library artifact type (protocol files, shadows, pulses, quizzes,
// works) has its visibility/access policy expressed as a pure decision
// function below, plus a reader that wraps DB lookup + the decision + the
// R2 fetch. Routes call the reader and shape the response. No route in
// server/src/ calls getR2().get directly — pre-commit + CI grep enforces
// the rule, so a new route cannot bypass any gate by adding its own R2
// read. Drift fails the build.
// ---------------------------------------------------------------------------

import type { Account } from './auth.js';
import { getDB, getR2 } from './db.js';

export interface ProtocolFileMetadata {
  account_id: string;
  name: string;
  text: string | null;
  visibility: string;
  updated_at: string;
  content_type: string;
}

// Map a stored content_type to the file extension used in the R2 key. The
// extension is presentation; content_type is the truth. Adding a new type
// only requires extending this map — no route code changes.
const EXTENSION_BY_CONTENT_TYPE: Record<string, string> = {
  'text/markdown; charset=utf-8': 'md',
  'application/pdf': 'pdf',
};

// Subset of the above the JSON PUT endpoint accepts. Markdown via the plain
// `body.content` (UTF-8 string). Binary formats (application/pdf, image/*)
// via `body.content_b64` (base64-encoded bytes) — extends to anything we
// can name a content_type for without needing multipart.
const PUT_WRITABLE_CONTENT_TYPES = new Set<string>([
  'text/markdown; charset=utf-8',
  'application/pdf',
]);

const DEFAULT_CONTENT_TYPE = 'text/markdown; charset=utf-8';

export function r2ExtensionForContentType(contentType: string): string {
  return EXTENSION_BY_CONTENT_TYPE[contentType] ?? 'md';
}

export function isPutWritableContentType(value: unknown): value is string {
  return typeof value === 'string' && PUT_WRITABLE_CONTENT_TYPES.has(value);
}

export { DEFAULT_CONTENT_TYPE, PUT_WRITABLE_CONTENT_TYPES };

export type ReadDenialStatus = 401 | 402 | 403 | 404;
export type ReadProtocolFileResult =
  | {
      ok: true;
      reason: AllowedReason;
      file: ProtocolFileMetadata;
      obj: R2ObjectBody;
      contentType: string;
    }
  | {
      ok: false;
      status: ReadDenialStatus;
      reason: DeniedReason | 'not_found' | 'content_missing';
      body: Record<string, unknown>;
    };

export interface ReadProtocolFileOpts {
  authorGithubId: string | number;
  fileName: string;
  accessorGithubId: string | number | null;
  context?: FileReadContext;
}

/**
 * Look up a protocol file, enforce visibility, and return its R2 content
 * if access is granted. This is the only path that touches `protocol/*`
 * R2 keys; routes call this and shape the response. New read routes added
 * later cannot reach the bytes without going through this function.
 */
export async function readProtocolFile(opts: ReadProtocolFileOpts): Promise<ReadProtocolFileResult> {
  const accountId = String(opts.authorGithubId);
  const name = opts.fileName;

  const file = await getDB().prepare(
    'SELECT account_id, name, text, visibility, updated_at, content_type FROM protocol_files WHERE account_id = ? AND name = ?'
  ).bind(accountId, name).first<ProtocolFileMetadata>();
  if (!file) {
    return { ok: false, status: 404, reason: 'not_found', body: { error: 'File not found' } };
  }

  const decision = authorizeFileRead({
    visibility: file.visibility,
    authorGithubId: opts.authorGithubId,
    accessorGithubId: opts.accessorGithubId,
    context: opts.context,
  });
  if (!decision.allowed) {
    return { ok: false, status: decision.status, reason: decision.reason, body: decision.body };
  }

  // Internal/CI artifacts (lifecycle-*, ci-smoke, smoke-test, test-check) are
  // filtered from public listings + factory signal + dashboards, but the
  // owner of the file MUST be able to read it back — CI smoke tests publish
  // and read these to verify the pipeline. Non-owners see 404, same as a
  // genuinely missing file (no existence-leak).
  if (decision.reason !== 'owner' && isInternalProtocolFileName(name)) {
    return { ok: false, status: 404, reason: 'not_found', body: { error: 'File not found' } };
  }

  // Content type lives on the row — derive the R2 extension from it. One
  // fetch, no probing, no per-file conditionals.
  const contentType = file.content_type || DEFAULT_CONTENT_TYPE;
  const ext = r2ExtensionForContentType(contentType);
  const obj = await getR2().get(`protocol/${accountId}/${name}.${ext}`);
  if (!obj) {
    return { ok: false, status: 404, reason: 'content_missing', body: { error: 'File content not found' } };
  }

  return { ok: true, reason: decision.reason, file, obj, contentType };
}

// ---------------------------------------------------------------------------
// Shadow access
// ---------------------------------------------------------------------------

export type ShadowAllowedReason = 'owner' | 'public' | 'authors' | 'invite';
export type ShadowDeniedReason = 'authors_required' | 'invite_required' | 'unknown_visibility';

export type ShadowDecision =
  | { allowed: true; reason: ShadowAllowedReason }
  | { allowed: false; status: 401 | 403; reason: ShadowDeniedReason; body: Record<string, unknown> };

/**
 * Pure visibility decision for shadows. Owner reads regardless; public is
 * open; authors requires an authenticated Author; invite requires a
 * pre-validated token. Symmetric with `authorizeFileRead` but with shadow's
 * own visibility lexicon and no paid tier.
 */
export function authorizeShadowRead(opts: {
  visibility: string;
  ownerLogin: string;
  accessorLogin: string | null;
  inviteValid?: boolean;
}): ShadowDecision {
  const isOwner = !!opts.accessorLogin && opts.accessorLogin === opts.ownerLogin;
  if (isOwner) return { allowed: true, reason: 'owner' };
  if (opts.visibility === 'public') return { allowed: true, reason: 'public' };
  if (opts.visibility === 'authors') {
    if (opts.accessorLogin) return { allowed: true, reason: 'authors' };
    return {
      allowed: false,
      status: 401,
      reason: 'authors_required',
      body: { error: 'Authors only — requires Alexandria API key', visibility: 'authors', reason: 'authors_required' },
    };
  }
  if (opts.visibility === 'invite') {
    if (opts.inviteValid) return { allowed: true, reason: 'invite' };
    return {
      allowed: false,
      status: 401,
      reason: 'invite_required',
      body: { error: 'Invite only — requires access token', visibility: 'invite', reason: 'invite_required' },
    };
  }
  return {
    allowed: false,
    status: 403,
    reason: 'unknown_visibility',
    body: { error: 'Access denied', visibility: opts.visibility, reason: 'unknown_visibility' },
  };
}

interface ShadowRow {
  id: string;
  author_id: string;
  r2_key: string;
  visibility: string;
}

export type ShadowReadResult =
  | { ok: true; reason: ShadowAllowedReason; obj: R2ObjectBody }
  | { ok: false; status: 401 | 403 | 404; reason: string; body: Record<string, unknown> };

/** Shadow by ID, gated by visibility. Owner bypasses. Invite path increments
 * the shadow_tokens counter on success so analytics stay accurate. */
export async function readShadow(opts: {
  authorId: string;
  shadowId: string;
  accessorLogin: string | null;
  inviteToken: string | null;
}): Promise<ShadowReadResult> {
  const db = getDB();
  const shadow = await db.prepare(
    'SELECT id, author_id, r2_key, visibility FROM shadows WHERE id = ? AND author_id = ?'
  ).bind(opts.shadowId, opts.authorId).first<ShadowRow>();
  if (!shadow) return { ok: false, status: 404, reason: 'not_found', body: { error: 'Shadow not found' } };

  // Token validation lives outside the gate (the gate stays pure).
  let inviteValid = false;
  let inviteTokenId: string | null = null;
  if (shadow.visibility === 'invite' && opts.inviteToken) {
    const row = await db.prepare(
      'SELECT id FROM shadow_tokens WHERE token = ? AND author_id = ? AND revoked_at IS NULL'
    ).bind(opts.inviteToken, opts.authorId).first<{ id: string }>();
    if (row?.id) {
      inviteValid = true;
      inviteTokenId = row.id;
    }
  }

  const decision = authorizeShadowRead({
    visibility: shadow.visibility,
    ownerLogin: shadow.author_id,
    accessorLogin: opts.accessorLogin,
    inviteValid,
  });
  if (!decision.allowed) {
    return { ok: false, status: decision.status, reason: decision.reason, body: decision.body };
  }

  // Successful invite read → bump the token counter. Side-effect of the read;
  // belongs with the read.
  if (decision.reason === 'invite' && inviteTokenId) {
    await db.prepare(
      'UPDATE shadow_tokens SET access_count = access_count + 1, last_used_at = ? WHERE id = ?'
    ).bind(new Date().toISOString(), inviteTokenId).run();
  }

  const obj = await getR2().get(shadow.r2_key);
  if (!obj) return { ok: false, status: 404, reason: 'content_missing', body: { error: 'Shadow content not found' } };
  return { ok: true, reason: decision.reason, obj };
}

/** Free shortcut — fetches the Author's public-visibility shadow if any. */
export async function readShadowFree(opts: { authorId: string }): Promise<ShadowReadResult> {
  const db = getDB();
  const shadow = await db.prepare(
    `SELECT id, author_id, r2_key, visibility FROM shadows WHERE author_id = ? AND visibility = 'public' LIMIT 1`
  ).bind(opts.authorId).first<ShadowRow>();
  if (!shadow) return { ok: false, status: 404, reason: 'not_found', body: { error: 'No public shadow' } };

  const obj = await getR2().get(shadow.r2_key);
  if (!obj) return { ok: false, status: 404, reason: 'content_missing', body: { error: 'Shadow content not found' } };
  return { ok: true, reason: 'public', obj };
}

// ---------------------------------------------------------------------------
// Pulse access — no gate, public artifact
// ---------------------------------------------------------------------------

export type PulseReadResult =
  | { ok: true; obj: R2ObjectBody }
  | { ok: false; status: 404; body: Record<string, unknown> };

export async function readPulse(opts: {
  authorId: string;
  month?: string;
}): Promise<PulseReadResult> {
  const db = getDB();
  const pulse = opts.month
    ? await db.prepare('SELECT r2_key_pulse FROM pulses WHERE author_id = ? AND month = ?')
        .bind(opts.authorId, opts.month).first<{ r2_key_pulse: string }>()
    : await db.prepare('SELECT r2_key_pulse FROM pulses WHERE author_id = ? ORDER BY month DESC LIMIT 1')
        .bind(opts.authorId).first<{ r2_key_pulse: string }>();
  if (!pulse) return { ok: false, status: 404, body: { error: 'No pulse found' } };

  const obj = await getR2().get(pulse.r2_key_pulse);
  if (!obj) return { ok: false, status: 404, body: { error: 'Pulse content not found' } };
  return { ok: true, obj };
}

// ---------------------------------------------------------------------------
// Quiz access — public if active, returns parsed JSON (not raw bytes)
// ---------------------------------------------------------------------------

interface QuizMeta {
  id: string;
  author_id: string;
  r2_key: string;
}

export type QuizDefinitionResult =
  | { ok: true; quiz: QuizMeta; data: Record<string, unknown> }
  | { ok: false; status: 404 | 500; body: Record<string, unknown> };

/** Quiz definition — checks active flag, fetches R2, parses JSON. */
export async function readQuizDefinition(opts: { quizId: string }): Promise<QuizDefinitionResult> {
  const db = getDB();
  const quiz = await db.prepare(
    'SELECT id, author_id, r2_key FROM quizzes WHERE id = ? AND active = 1'
  ).bind(opts.quizId).first<QuizMeta>();
  if (!quiz) return { ok: false, status: 404, body: { error: 'Quiz not found' } };

  const obj = await getR2().get(quiz.r2_key);
  if (!obj) return { ok: false, status: 404, body: { error: 'Quiz data not found' } };

  try {
    const data = JSON.parse(await obj.text()) as Record<string, unknown>;
    return { ok: true, quiz, data };
  } catch {
    return { ok: false, status: 500, body: { error: 'Quiz data malformed' } };
  }
}

// ---------------------------------------------------------------------------
// Work access
// ---------------------------------------------------------------------------

export type WorkAllowedReason = 'public' | 'owner' | 'subscriber';
export type WorkDeniedReason = 'auth_required' | 'subscription_required';

export type WorkDecision =
  | { allowed: true; reason: WorkAllowedReason }
  | { allowed: false; status: 401 | 402; reason: WorkDeniedReason; body: Record<string, unknown> };

/**
 * Pure access decision for works. Non-paid tier is open; paid requires
 * either ownership or an active subscription.
 */
export function authorizeWorkRead(opts: {
  tier: string;
  ownerLogin: string;
  accessor: Account | null;
}): WorkDecision {
  if (opts.tier !== 'paid') return { allowed: true, reason: 'public' };
  if (!opts.accessor) {
    return {
      allowed: false,
      status: 401,
      reason: 'auth_required',
      body: { error: 'Authentication required for paid works', tier: 'paid', reason: 'auth_required' },
    };
  }
  if (opts.accessor.github_login === opts.ownerLogin) return { allowed: true, reason: 'owner' };
  if (opts.accessor.subscription_id) return { allowed: true, reason: 'subscriber' };
  return {
    allowed: false,
    status: 402,
    reason: 'subscription_required',
    body: { error: 'Subscription required for paid works', tier: 'paid', reason: 'subscription_required' },
  };
}

interface WorkRow {
  id: string;
  author_id: string;
  r2_key: string;
  tier: string;
}

export type WorkReadResult =
  | { ok: true; reason: WorkAllowedReason; work: WorkRow; obj: R2ObjectBody }
  | { ok: false; status: 401 | 402 | 404; reason: string; body: Record<string, unknown> };

export async function readWork(opts: {
  authorId: string;
  workId: string;
  accessor: Account | null;
}): Promise<WorkReadResult> {
  const db = getDB();
  const work = await db.prepare(
    'SELECT id, author_id, r2_key, tier FROM works WHERE id = ? AND author_id = ?'
  ).bind(opts.workId, opts.authorId).first<WorkRow>();
  if (!work) return { ok: false, status: 404, reason: 'not_found', body: { error: 'Work not found' } };

  const decision = authorizeWorkRead({
    tier: work.tier,
    ownerLogin: opts.authorId,
    accessor: opts.accessor,
  });
  if (!decision.allowed) {
    return { ok: false, status: decision.status, reason: decision.reason, body: decision.body };
  }

  const obj = await getR2().get(work.r2_key);
  if (!obj) return { ok: false, status: 404, reason: 'content_missing', body: { error: 'Work content not found' } };
  return { ok: true, reason: decision.reason, work, obj };
}
