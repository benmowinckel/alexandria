/** Protocol auth — account type, key extraction, lookup. */

import { getAuthIndex, getKV, loadAccount, loadAccounts } from './kv.js';
import { hashApiKey } from './crypto.js';

export interface Account {
  github_id: number;
  github_login: string;
  github_name?: string | null;
  github_url?: string | null;
  website?: string | null;
  location?: string | null;
  email: string;
  api_key_hash: string;
  email_token: string;
  api_key?: string;
  created_at: string;
  last_session: string;
  installed_at?: string;
  engagement_opt_out?: boolean;
  stripe_customer_id?: string;
  subscription_status?: string;
  subscription_id?: string;
  current_period_end?: string;
  constitution_size?: number;
  week_one_email_sent_at?: string;
}

export type AccountStore = Record<string, Account>;

interface CookieSource {
  req: { header: (name: string) => string | undefined };
}

function parseCookieHeader(raw: string | undefined): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const pair of raw.split(';')) {
    const idx = pair.indexOf('=');
    if (idx <= 0) continue;
    const key = pair.slice(0, idx).trim();
    const value = pair.slice(idx + 1).trim();
    if (!key) continue;
    try {
      out[key] = decodeURIComponent(value);
    } catch {
      out[key] = value;
    }
  }
  return out;
}

export function extractApiKey(c: { req: { header: (name: string) => string | undefined } }): string | null {
  const auth = c.req.header('authorization');
  if (auth && auth.startsWith('Bearer alex_')) return auth.slice(7);
  return null;
}

export async function findByApiKey(key: string): Promise<Account | null> {
  const keyHash = hashApiKey(key);
  const githubKey = await getAuthIndex(keyHash);
  if (githubKey) {
    const account = await loadAccount(githubKey);
    if (account) return account as unknown as Account;
  }
  return null;
}

export function extractLibrarySessionToken(c: CookieSource): string | null {
  const cookies = parseCookieHeader(c.req.header('cookie'));
  const token = cookies.alex_library_session;
  return token && token.length >= 24 ? token : null;
}

export async function findByLibrarySessionToken(token: string): Promise<Account | null> {
  const raw = await getKV().get(`library:session:${token}`);
  if (!raw) return null;

  const parsed = (() => {
    try {
      return JSON.parse(raw) as { account_key?: string; github_login?: string };
    } catch {
      return {} as { account_key?: string; github_login?: string };
    }
  })();

  if (parsed.account_key) {
    const account = await loadAccount(parsed.account_key);
    if (account) return account as unknown as Account;
  }
  if (!parsed.github_login) return null;

  const all = await loadAccounts<AccountStore>();
  const key = Object.keys(all).find((k) => all[k]?.github_login === parsed.github_login);
  return key ? all[key] : null;
}

export async function requireAuth(c: { req: { header: (name: string) => string | undefined; query: (name: string) => string | undefined } }): Promise<{ key: string; account: Account } | null> {
  const key = extractApiKey(c);
  if (!key) return null;
  const account = await findByApiKey(key);
  if (!account) return null;
  return { key, account };
}
