/** Company account management — billing, admin, key generation, account operations. */

import { randomBytes } from 'crypto';
import { getAuthIndex, getLoginIndex, setLoginIndex, deleteLoginIndex, loadAccount, loadAccounts, saveAccount } from './kv.js';
import { hashApiKey } from './crypto.js';
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
    if (account && (account.github_login || '').toLowerCase() === lower) {
      return { storeKey: indexedKey, account };
    }
    // Index points to a missing or renamed account — clean up.
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

export async function updateAccountBilling(identifier: string, billing: Partial<Pick<Account, 'stripe_customer_id' | 'subscription_status' | 'subscription_id' | 'current_period_end' | 'email'>>): Promise<void> {
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

export async function requireAdmin(c: { req: { header: (name: string) => string | undefined; query: (name: string) => string | undefined } }): Promise<{ key: string; account: Account } | null> {
  const auth = await requireAuth(c);
  if (!auth) return null;
  const adminLogin = process.env.ADMIN_GITHUB_LOGIN || 'mowinckelb';
  if (auth.account.github_login !== adminLogin) return null;
  return auth;
}
