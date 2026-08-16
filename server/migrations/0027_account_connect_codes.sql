-- Short-lived, one-use account connection codes. The persistent API key is
-- generated only after an explicit connection exchange, so it never appears
-- in browser HTML, email, or the human handoff paste.

CREATE TABLE account_connect_codes (
  code_hash TEXT PRIMARY KEY,
  account_key TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL
);

CREATE INDEX idx_account_connect_codes_expiry ON account_connect_codes(expires_at);
CREATE INDEX idx_account_connect_codes_account ON account_connect_codes(account_key);
