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
  /^lifecycle-\d+$/,
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
// Protocol file reader — the ONLY function that returns protocol_file bytes.
// ---------------------------------------------------------------------------

import { getDB, getR2 } from './db.js';

export interface ProtocolFileMetadata {
  account_id: string;
  name: string;
  text: string | null;
  visibility: string;
  updated_at: string;
}

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

  // Internal/test names are never resolvable from any read route — same 404
  // shape as a genuinely missing file, so existence isn't leaked.
  if (isInternalProtocolFileName(name)) {
    return { ok: false, status: 404, reason: 'not_found', body: { error: 'File not found' } };
  }

  const file = await getDB().prepare(
    'SELECT account_id, name, text, visibility, updated_at FROM protocol_files WHERE account_id = ? AND name = ?'
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

  // Content-type detection — try the known extension order. Markdown is the
  // PUT-handler default; PDFs are uploaded out-of-band today (e.g. on-love).
  // The first candidate that resolves wins.
  const candidates: Array<{ key: string; contentType: string }> = name === 'on-love'
    ? [
        { key: `protocol/${accountId}/${name}.pdf`, contentType: 'application/pdf' },
        { key: `protocol/${accountId}/${name}.md`, contentType: 'text/markdown; charset=utf-8' },
      ]
    : [
        { key: `protocol/${accountId}/${name}.md`, contentType: 'text/markdown; charset=utf-8' },
        { key: `protocol/${accountId}/${name}.pdf`, contentType: 'application/pdf' },
      ];

  for (const c of candidates) {
    const obj = await getR2().get(c.key);
    if (obj) {
      return { ok: true, reason: decision.reason, file, obj, contentType: c.contentType };
    }
  }

  return { ok: false, status: 404, reason: 'content_missing', body: { error: 'File content not found' } };
}
