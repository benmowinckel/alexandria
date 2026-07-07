-- Account-based access grants: a grant means "this account may reach this
-- author's invite-visibility content" (twins + protocol files). Replaces the
-- re-typed shared-secret invite code with account-bound, individually-revocable
-- access. Keyed on the immutable numeric github_id. Also created lazily in
-- grants.ts (ensureGrantSchema) so the code works before this is applied.
CREATE TABLE IF NOT EXISTS access_grants (
  id TEXT PRIMARY KEY,
  author_id TEXT NOT NULL,
  account_github_id TEXT NOT NULL,
  code_id TEXT,
  label TEXT,
  created_at TEXT NOT NULL,
  revoked_at TEXT,
  UNIQUE(author_id, account_github_id)
);
CREATE INDEX IF NOT EXISTS idx_grants_lookup ON access_grants(author_id, account_github_id, revoked_at);
