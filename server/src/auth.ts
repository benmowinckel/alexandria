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
  /** Every live machine connection. Legacy accounts have only api_key_hash. */
  api_key_hashes?: string[];
  email_token: string;
  api_key?: string;
  created_at: string;
  last_session: string;
  /** The existing local loop has completed the narrow account exchange. */
  connected_at?: string;
  /** First successful optional module call; separate from account connection. */
  installed_at?: string;
  engagement_opt_out?: boolean;
  stripe_customer_id?: string;
  /** Stripe Connect (Express) account id — where this Author's marketplace
   *  earnings are paid out. Set when they begin payout onboarding. */
  stripe_connect_account_id?: string;
  /** True once Stripe reports the connected account can receive payouts
   *  (synced from the account.updated webhook). Gates paid checkout. */
  connect_payouts_enabled?: boolean;
  subscription_status?: string;
  subscription_id?: string;
  /** Last time membership status was checked against Stripe (or written by a
   * signed Stripe webhook). Stored status is a cache; this timestamp says how
   * fresh that cache is. Grandfathered free/beta accounts do not need it. */
  membership_verified_at?: string;
  current_period_end?: string;
  constitution_size?: number;
  /** Founding-member number (alexandrian #N). Sequential, permanent, assigned
   *  on first join via assignAuthorNumber(). Source of truth for display. */
  number?: number;
  week_one_email_sent_at?: string;
  install_nudge_last_sent_at?: string;
  install_nudge_count?: number;
  installed_after_nudge?: boolean;
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

/**
 * Gate write endpoints (PUT /file, DELETE /file, POST /call) on an active
 * subscription. The deal is "$30/month after 30 days, or free while 3 kin stay active":
 * new GitHub sign-ins go through Stripe checkout at the OAuth callback (the
 * founding-member join). A cancelled/unpaid sub means neither condition is met, so writes
 * are blocked at 402 with a reactivate link. Reads remain open (see
 * /library/*) so users who lapse can still access their own data.
 *
 * Allowed statuses:
 *   - `free`      — grandfathered seeding-stage cohort (joined 2026-06-05 →
 *                   06-11 while signup was free); kept active until the gate
 *   - `trialing`  — first 30 days of a paid sub
 *   - `active`    — paying the current membership price or free via the kin coupon
 *   - `past_due`  — Stripe is retrying a failed card; grace period
 *   - `beta`      — legacy users from before live billing
 * Anything else (canceled, unpaid, incomplete, undefined) is inactive. This
 * set classifies a CURRENT status only; billing.resolveMembership is the sole
 * authority that may decide which current status applies to an account.
 */
export const ACTIVE_AUTHOR_STATUSES = new Set(['free', 'trialing', 'active', 'past_due', 'beta']);
