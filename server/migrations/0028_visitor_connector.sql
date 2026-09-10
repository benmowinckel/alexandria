-- Website registration contains public routing metadata only. The random DNS
-- challenge is stored hashed. Authorization codes hold only encrypted context.
CREATE TABLE IF NOT EXISTS visitor_connector_sites (
  author TEXT PRIMARY KEY,
  owner_id TEXT NOT NULL,
  site TEXT NOT NULL,
  manifest_path TEXT NOT NULL DEFAULT '/mirror/profile.json',
  -- Public-only mirrors have no server or visitor callback. Listing is an
  -- explicit discovery choice, separate from ownership verification.
  callback_path TEXT,
  listed INTEGER NOT NULL DEFAULT 0 CHECK (listed IN (0, 1)),
  version TEXT NOT NULL,
  challenge_hash TEXT NOT NULL,
  challenge_expires_at INTEGER NOT NULL,
  verified_at INTEGER
);
CREATE TABLE IF NOT EXISTS visitor_connector_codes (
  code_hash TEXT PRIMARY KEY,
  author TEXT NOT NULL,
  reader_id TEXT NOT NULL,
  site TEXT NOT NULL,
  challenge TEXT NOT NULL,
  context TEXT NOT NULL,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS visitor_connector_code_expiry ON visitor_connector_codes(expires_at);
CREATE INDEX IF NOT EXISTS visitor_connector_code_reader ON visitor_connector_codes(reader_id);
