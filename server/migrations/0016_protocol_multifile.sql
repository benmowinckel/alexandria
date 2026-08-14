-- Protocol: multiple files per Author.
-- Primary key becomes (account_id, name). Drop published_at. Add visibility.

-- Recreate protocol_files with new schema
CREATE TABLE IF NOT EXISTS protocol_files_v3 (
  account_id TEXT NOT NULL,
  name TEXT NOT NULL,
  text TEXT,
  title TEXT,
  visibility TEXT DEFAULT 'authors',
  updated_at TEXT NOT NULL,
  price_cents INTEGER,
  PRIMARY KEY (account_id, name)
);

-- Migrate existing data (single file per author → named "shadow")
INSERT OR IGNORE INTO protocol_files_v3 (account_id, name, text, visibility, updated_at)
  SELECT account_id, 'shadow', text, 'authors', updated_at FROM protocol_files;

DROP TABLE IF EXISTS protocol_files;
ALTER TABLE protocol_files_v3 RENAME TO protocol_files;

CREATE INDEX IF NOT EXISTS idx_pfiles_account ON protocol_files(account_id);
