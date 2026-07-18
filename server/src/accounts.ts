/** Company account management — billing, admin, key generation, account operations. */

import { randomBytes } from 'crypto';
import { getAuthIndex, getLoginIndex, setLoginIndex, deleteLoginIndex, loadAccount, loadAccounts, saveAccount } from './kv.js';
import { hashApiKey } from './crypto.js';
import { getDB } from './db.js';
import { requireAuth } from './auth.js';
import type { Account, AccountStore } from './auth.js';

export async function getAccounts(): Promise<AccountStore> {
  return await loadAccounts<AccountStore>();
}

/**
 * Look up an account by github_login. O(1) via the login index, with self-healing
 * fallback to a full scan if the index is missing or stale (lazy-backfills the index
 * when the scan finds a match). Use this for any single-login lookup — never
 * Object.values(accounts).find(...).
 */
export async function getAccountByLogin(login: string): Promise<{ storeKey: string; account: Account } | null> {
  if (!login) return null;
  const lower = login.toLowerCase();

  const indexedKey = await getLoginIndex(lower);
  if (indexedKey) {
    const account = await loadAccount(indexedKey) as Account | null;
    // Trust the STICKY binding: return the bound owner even if their current
    // github_login now differs (a legit rename) — the login is a permanent alias
    // for the id that first claimed it. Do NOT delete+rescan on a login mismatch;
    // that was the rebind vector — a recycled handle would rescan to the attacker's
    // account and repoint the index to them (takeover). Only clean up when the
    // bound account is genuinely gone.
    if (account) return { storeKey: indexedKey, account };
    await deleteLoginIndex(lower);
  }

  // Fallback: full scan (legacy accounts created before the index existed, or
  // an index entry was lost). Backfills the index on success so the next call is O(1).
  const accounts = await loadAccounts<AccountStore>();
  const storeKey = Object.keys(accounts).find(k => (accounts[k].github_login || '').toLowerCase() === lower);
  if (!storeKey) return null;
  await setLoginIndex(lower, storeKey);
  return { storeKey, account: accounts[storeKey] as Account };
}

export async function updateAccountBilling(identifier: string, billing: Partial<Pick<Account, 'stripe_customer_id' | 'subscription_status' | 'subscription_id' | 'current_period_end' | 'email' | 'stripe_connect_account_id' | 'connect_payouts_enabled'>>): Promise<void> {
  // Fast path: API key lookup is indexed (auth:{hash} -> github key)
  if (identifier.startsWith('alex_')) {
    const keyHash = hashApiKey(identifier);
    const storeKey = await getAuthIndex(keyHash);
    if (storeKey) {
      const account = await loadAccount(storeKey);
      if (account) {
        await saveAccount(storeKey, { ...account, ...billing });
        return;
      }
    }
  }

  // Fallback: identifier is a GitHub login (legacy/webhook metadata path)
  const result = await getAccountByLogin(identifier);
  if (!result) return;
  Object.assign(result.account, billing);
  await saveAccount(result.storeKey, result.account as unknown as Record<string, unknown>);
}

export async function getBillingSummary(): Promise<Record<string, number>> {
  const accounts = await getAccounts();
  const counts: Record<string, number> = { total_accounts: 0 };
  for (const acct of Object.values(accounts)) {
    counts.total_accounts++;
    const status = acct.subscription_status || 'none';
    counts[`billing_${status}`] = (counts[`billing_${status}`] || 0) + 1;
    if (acct.installed_at) counts.installed = (counts.installed || 0) + 1;
  }
  return counts;
}

export function generateApiKey(): string {
  return `alex_${randomBytes(16).toString('hex')}`;
}

// ---------------------------------------------------------------------------
// Founding-member numbers (alexandrian #N)
// ---------------------------------------------------------------------------

// Lazily ensure the counter table exists, so #N works even before migration
// 0024 is applied (mirrors ensureRateLimitSchema in worker.ts). Memoized per
// isolate; on failure the flag stays false so the next call retries.
let _counterSchemaReady = false;
async function ensureCounterSchema(db: D1Database): Promise<void> {
  if (_counterSchemaReady) return;
  await db.prepare(
    `CREATE TABLE IF NOT EXISTS counters (name TEXT PRIMARY KEY, value INTEGER NOT NULL)`
  ).run();
  _counterSchemaReady = true;
}

/**
 * Assign the founding-member number (alexandrian #N) — sequential, permanent,
 * idempotent. Called the first time an Author reaches the founding-member page
 * (post-checkout, or the skip-checkout good-standing path). Persisted on the
 * account (KV — the source of truth for display) and best-effort mirrored to
 * the Library profile (authors.number, live once migration 0024 is applied).
 *
 * The counter lives in D1 because SQLite serialises writes: `INSERT … ON
 * CONFLICT … RETURNING value` is atomic, where a KV read-modify-write would
 * race two concurrent joins onto the same number. Joins are human-paced and the
 * existing-number guard returns early, so a re-view never burns a number.
 */
export async function assignAuthorNumber(githubLogin: string): Promise<number | null> {
  if (!githubLogin) return null;
  const result = await getAccountByLogin(githubLogin);
  if (!result) return null;
  const { storeKey, account } = result;
  if (typeof account.number === 'number' && account.number > 0) return account.number;

  const db = getDB();
  try {
    await ensureCounterSchema(db);
    const row = await db.prepare(
      `INSERT INTO counters (name, value) VALUES ('author_number', 1)
       ON CONFLICT(name) DO UPDATE SET value = counters.value + 1
       RETURNING value`
    ).first<{ value: number }>();
    const n = row?.value;
    if (!n) return null;

    account.number = n;
    await saveAccount(storeKey, account as unknown as Record<string, unknown>);

    // Library-profile mirror — best-effort. The `number` column ships in
    // migration 0024; if it isn't applied yet the account-level number still
    // drives display, so swallow the missing-column error.
    try {
      await db.prepare(
        `UPDATE authors SET number = ?, updated_at = ? WHERE id = ? AND number IS NULL`
      ).bind(n, new Date().toISOString(), githubLogin).run();
    } catch (e) {
      console.error('[number] authors.number mirror failed (migration 0024 pending?):', e);
    }
    return n;
  } catch (e) {
    console.error('[number] assignAuthorNumber failed:', e);
    return null;
  }
}

export async function requireAdmin(c: { req: { header: (name: string) => string | undefined; query: (name: string) => string | undefined } }): Promise<{ key: string; account: Account } | null> {
  const auth = await requireAuth(c);
  if (!auth) return null;
  const adminLogin = process.env.ADMIN_GITHUB_LOGIN || 'benmowinckel';
  if (auth.account.github_login !== adminLogin) return null;
  return auth;
}
