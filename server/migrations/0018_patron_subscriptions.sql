CREATE TABLE IF NOT EXISTS patron_subscriptions (
  stripe_subscription_id TEXT PRIMARY KEY,
  stripe_customer_id TEXT NOT NULL,
  email TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_patron_subscriptions_email ON patron_subscriptions(email);
CREATE INDEX IF NOT EXISTS idx_patron_subscriptions_status ON patron_subscriptions(status);
