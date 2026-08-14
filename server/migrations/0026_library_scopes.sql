-- Exact Library scopes: permission outermost, cohort leaf.
--
-- Existing direct-tier artifacts become public/<name>, authors/<name>,
-- invite/<name>, or paid/<name>. A nested cohort such as invite/friends is a
-- different scope and therefore needs its own exact grant. Parent grants never
-- include future child scopes.

CREATE TABLE protocol_files_v4 (
  account_id TEXT NOT NULL,
  scope TEXT NOT NULL DEFAULT 'authors',
  name TEXT NOT NULL,
  text TEXT,
  title TEXT,
  visibility TEXT NOT NULL DEFAULT 'authors',
  updated_at TEXT NOT NULL,
  content_type TEXT NOT NULL DEFAULT 'text/markdown; charset=utf-8',
  content_hash TEXT,
  price_cents INTEGER,
  PRIMARY KEY (account_id, scope, name)
);

INSERT INTO protocol_files_v4
  (account_id, scope, name, text, title, visibility, updated_at, content_type, content_hash, price_cents)
SELECT account_id, visibility, name, text, title, visibility, updated_at, content_type, content_hash, price_cents
FROM protocol_files;

DROP TABLE protocol_files;
ALTER TABLE protocol_files_v4 RENAME TO protocol_files;
CREATE INDEX idx_pfiles_account ON protocol_files(account_id);
CREATE INDEX idx_pfiles_scope ON protocol_files(account_id, scope, updated_at);

ALTER TABLE access_codes ADD COLUMN scope TEXT NOT NULL DEFAULT 'invite';

CREATE TABLE access_grants_v2 (
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
);

INSERT INTO access_grants_v2
  (id, author_id, account_github_id, scope, source_type, source_id, code_id, label, created_at, revoked_at)
SELECT id, author_id, account_github_id, 'invite', 'invite', code_id, code_id, label, created_at, revoked_at
FROM access_grants;

DROP TABLE access_grants;
ALTER TABLE access_grants_v2 RENAME TO access_grants;
CREATE INDEX idx_grants_lookup ON access_grants(author_id, account_github_id, scope, revoked_at);
CREATE INDEX idx_grants_source ON access_grants(author_id, source_type, source_id, revoked_at);
