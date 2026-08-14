/** Exact, account-bound Library scope grants. */
import { getDB, generateId } from './db.js';
import { normalizeLibraryScope, visibilityForScope } from './library-scopes.js';

let ensured = false;
async function ensureGrantSchema(): Promise<void> {
  if (ensured) return;
  // Fresh databases get the current shape here. Deployed databases are rebuilt
  // by migration 0026; the lazy create keeps local/test boot order harmless.
  await getDB().prepare(
    `CREATE TABLE IF NOT EXISTS access_grants (
       id TEXT PRIMARY KEY,
       author_id TEXT NOT NULL,
       account_github_id TEXT NOT NULL,
       scope TEXT NOT NULL DEFAULT 'invite',
       source_type TEXT NOT NULL DEFAULT 'invite',
       source_id TEXT,
       code_id TEXT,
       label TEXT,
       created_at TEXT NOT NULL,
       revoked_at TEXT,
       UNIQUE(author_id, account_github_id, scope)
     )`,
  ).run().catch(() => {});
  await getDB().prepare(
    `CREATE INDEX IF NOT EXISTS idx_grants_lookup ON access_grants(author_id, account_github_id, scope, revoked_at)`,
  ).run().catch(() => {});
  ensured = true;
}

export type GrantState = 'live' | 'revoked' | 'none';
export type GrantSource = 'invite' | 'purchase' | 'owner';

function validGrantScope(value: string): string | null {
  const visibility = visibilityForScope(value);
  if (visibility !== 'invite' && visibility !== 'paid') return null;
  return normalizeLibraryScope(value, visibility);
}

/** Exact means exact: `invite` never answers for `invite/friends`. */
export async function hasGrantForScope(
  authorId: string,
  accountGithubId: string | number | null,
  scope: string,
): Promise<boolean> {
  if (accountGithubId == null || !validGrantScope(scope)) return false;
  await ensureGrantSchema();
  const row = await getDB().prepare(
    `SELECT id FROM access_grants
      WHERE author_id = ? AND account_github_id = ? AND scope = ? AND revoked_at IS NULL
      LIMIT 1`,
  ).bind(authorId, String(accountGithubId), scope).first<{ id: string }>().catch(() => null);
  return !!row?.id;
}

/** All exact live scopes held by an account for this Author. */
export async function listGrantedScopes(
  authorId: string,
  accountGithubId: string | number | null,
): Promise<string[]> {
  if (accountGithubId == null) return [];
  await ensureGrantSchema();
  const rows = await getDB().prepare(
    `SELECT scope FROM access_grants
      WHERE author_id = ? AND account_github_id = ? AND revoked_at IS NULL
      ORDER BY scope`,
  ).bind(authorId, String(accountGithubId)).all<{ scope: string }>().catch(() => ({ results: [] as { scope: string }[] }));
  return (rows.results || []).map((row) => row.scope).filter((scope) => !!validGrantScope(scope));
}

/** Back-compatible base invite check. It deliberately does not include cohorts. */
export async function hasGrant(authorId: string, accountGithubId: string | number | null): Promise<boolean> {
  return hasGrantForScope(authorId, accountGithubId, 'invite');
}

export async function grantState(
  authorId: string,
  accountGithubId: string | number | null,
  scope = 'invite',
): Promise<GrantState> {
  if (accountGithubId == null || !validGrantScope(scope)) return 'none';
  await ensureGrantSchema();
  const row = await getDB().prepare(
    `SELECT revoked_at FROM access_grants
      WHERE author_id = ? AND account_github_id = ? AND scope = ? LIMIT 1`,
  ).bind(authorId, String(accountGithubId), scope).first<{ revoked_at: string | null }>().catch(() => null);
  if (!row) return 'none';
  return row.revoked_at ? 'revoked' : 'live';
}

export async function grantAccess(
  authorId: string,
  accountGithubId: string | number,
  opts?: {
    scope?: string;
    sourceType?: GrantSource;
    sourceId?: string;
    codeId?: string;
    label?: string;
    reactivate?: boolean;
  },
): Promise<void> {
  const scope = opts?.scope || 'invite';
  if (!validGrantScope(scope)) throw new Error(`Invalid grant scope: ${scope}`);
  await ensureGrantSchema();
  const now = new Date().toISOString();
  const sourceType = opts?.sourceType || (opts?.codeId ? 'invite' : 'owner');
  const sourceId = opts?.sourceId || opts?.codeId || null;
  const onConflict = opts?.reactivate
    ? `DO UPDATE SET revoked_at = NULL,
                     source_type = excluded.source_type,
                     source_id = COALESCE(excluded.source_id, access_grants.source_id),
                     code_id = COALESCE(excluded.code_id, access_grants.code_id),
                     label = COALESCE(excluded.label, access_grants.label)`
    : `DO NOTHING`;
  await getDB().prepare(
    `INSERT INTO access_grants
       (id, author_id, account_github_id, scope, source_type, source_id, code_id, label, created_at, revoked_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
     ON CONFLICT(author_id, account_github_id, scope) ${onConflict}`,
  ).bind(
    generateId(), authorId, String(accountGithubId), scope, sourceType, sourceId,
    opts?.codeId ?? null, opts?.label ?? null, now,
  ).run();
}

export interface GrantRow {
  account_github_id: string;
  scope: string;
  source_type: string;
  source_id: string | null;
  label: string | null;
  created_at: string;
  revoked_at: string | null;
}

export async function listGrants(authorId: string): Promise<GrantRow[]> {
  await ensureGrantSchema();
  const res = await getDB().prepare(
    `SELECT account_github_id, scope, source_type, source_id, label, created_at, revoked_at
       FROM access_grants WHERE author_id = ? ORDER BY created_at DESC LIMIT 500`,
  ).bind(authorId).all<GrantRow>().catch(() => ({ results: [] as GrantRow[] }));
  return res.results || [];
}

export async function revokeGrant(authorId: string, accountGithubId: string, scope = 'invite'): Promise<void> {
  if (!validGrantScope(scope)) return;
  await ensureGrantSchema();
  await getDB().prepare(
    `UPDATE access_grants SET revoked_at = ?
      WHERE author_id = ? AND account_github_id = ? AND scope = ? AND revoked_at IS NULL`,
  ).bind(new Date().toISOString(), authorId, String(accountGithubId), scope).run();
}
