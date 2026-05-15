/**
 * KV persistence layer.
 *
 * Key structure:
 *   "account:{github_id}"  → encrypted individual account JSON
 *   "auth:{api_key_hash}"  → github_id (lookup index for O(1) auth)
 *   "login:{github_login}" → github_id (lookup index for O(1) login → key, lowercased)
 *   "emailtoken:{token}"   → github_id (lookup index for O(1) email-token auth)
 *   "events:YYYY-MM-DD:HH-mm-ss-SSS-{rand}" → JSONL batch from one request
 *   "cron:*"                → cron liveness markers (health digest reads these)
 *   "signal:{t}:{hash}"     → anonymous machine signal (90d TTL)
 *   "feedback:{t}:{hash}"   → attributed feedback (no TTL)
 *   "library-signal"        → daily library-signal snapshot (single key)
 *
 * Each account is its own KV key — no concurrent write corruption,
 * no O(N) iteration for auth checks.
 */

import { encrypt, decrypt } from './crypto.js';

// Global KV reference — set by middleware on each request
let _kv: KVNamespace | null = null;

export function setKV(kv: KVNamespace): void {
  _kv = kv;
}

export function getKV(): KVNamespace {
  if (!_kv) throw new Error('KV not initialized — setKV() must be called first');
  return _kv;
}

// ---------------------------------------------------------------------------
// Accounts — per-key storage (no blob, no concurrency issues)
// ---------------------------------------------------------------------------

/** Load a single account by github_id key. */
export async function loadAccount(githubKey: string): Promise<Record<string, unknown> | null> {
  const kv = getKV();
  const encrypted = await kv.get(`account:${githubKey}`);
  if (!encrypted) return null;
  try {
    return JSON.parse(decrypt(encrypted));
  } catch (e) {
    console.error(`[kv] Decrypt failed for account:${githubKey}:`, e);
    return null;
  }
}

const LOGIN_INDEX_PREFIX = 'login:';

/** Set login lookup index: github_login (lowercased) → github_id key. */
export async function setLoginIndex(login: string, githubKey: string): Promise<void> {
  if (!login) return;
  const kv = getKV();
  await kv.put(LOGIN_INDEX_PREFIX + login.toLowerCase(), githubKey);
}

/** Save a single account by github_id key. Maintains login index. */
export async function saveAccount(githubKey: string, account: Record<string, unknown>): Promise<void> {
  const kv = getKV();
  await kv.put(`account:${githubKey}`, encrypt(JSON.stringify(account)));
  const login = account.github_login as string | undefined;
  if (login) await setLoginIndex(login, githubKey);
}

/** Set auth lookup index: api_key_hash → github_id key. */
export async function setAuthIndex(apiKeyHash: string, githubKey: string): Promise<void> {
  const kv = getKV();
  await kv.put(`auth:${apiKeyHash}`, githubKey);
}

/** Look up github_id key by api_key_hash. O(1). */
export async function getAuthIndex(apiKeyHash: string): Promise<string | null> {
  const kv = getKV();
  return await kv.get(`auth:${apiKeyHash}`);
}

/** Set email token lookup index: token → github_id key. */
export async function setEmailTokenIndex(token: string, githubKey: string): Promise<void> {
  const kv = getKV();
  await kv.put(`emailtoken:${token}`, githubKey);
}

/** Look up github_id key by email token. O(1). */
export async function getEmailTokenIndex(token: string): Promise<string | null> {
  const kv = getKV();
  return await kv.get(`emailtoken:${token}`);
}

/** Look up github_id key by github_login. O(1). Case-insensitive. */
export async function getLoginIndex(login: string): Promise<string | null> {
  if (!login) return null;
  const kv = getKV();
  return await kv.get(LOGIN_INDEX_PREFIX + login.toLowerCase());
}

/** Remove a stale login index entry. */
export async function deleteLoginIndex(login: string): Promise<void> {
  if (!login) return;
  const kv = getKV();
  await kv.delete(LOGIN_INDEX_PREFIX + login.toLowerCase());
}

/** Delete an account and its lookup indexes (auth, login). */
export async function deleteAccount(githubKey: string, apiKeyHash: string): Promise<void> {
  const kv = getKV();
  // Load before delete to recover login for index cleanup
  const existing = await loadAccount(githubKey);
  const login = existing?.github_login as string | undefined;
  await kv.delete(`account:${githubKey}`);
  await kv.delete(`auth:${apiKeyHash}`);
  if (login) await deleteLoginIndex(login);
}

/** List all accounts (for admin/cron — iterates KV keys). Batches reads per page. */
async function listAllAccounts(): Promise<Record<string, Record<string, unknown>>> {
  const kv = getKV();
  const result: Record<string, Record<string, unknown>> = {};
  let cursor: string | undefined;
  do {
    const page = await kv.list({ prefix: 'account:', cursor });
    const keys = page.keys.map(k => k.name.replace('account:', ''));
    const accounts = await Promise.all(keys.map(loadAccount));
    for (let i = 0; i < keys.length; i++) {
      if (accounts[i]) result[keys[i]] = accounts[i] as Record<string, unknown>;
    }
    cursor = page.list_complete ? undefined : page.cursor;
  } while (cursor);
  return result;
}

/** Load all accounts from per-key storage. */
export async function loadAccounts<T>(): Promise<T> {
  return await listAllAccounts() as T;
}

/** Save multiple accounts (convenience wrapper). */
export async function saveAccounts<T>(accounts: T): Promise<void> {
  for (const [key, account] of Object.entries(accounts as Record<string, Record<string, unknown>>)) {
    await saveAccount(key, account);
  }
}

// ---------------------------------------------------------------------------
// Events (JSONL log)
// ---------------------------------------------------------------------------

// Append event batch from one request to its own KV key. The earlier
// daily-key model did read-modify-write on `events:YYYY-MM-DD`, which lost
// concurrent writes under bursts (CI smoke probe step, scraper sweeps).
// Each request gets a unique key; reads list+concat by prefix.
export async function appendEvent(line: string): Promise<void> {
  const kv = getKV();
  const now = new Date().toISOString();
  const day = now.slice(0, 10);
  const stamp = now.slice(11, 23).replace(/[:.]/g, '-');
  const rand = crypto.randomUUID().slice(0, 8);
  await kv.put(`events:${day}:${stamp}-${rand}`, line, { expirationTtl: 60 * 24 * 60 * 60 });
}

// Walk days from most-recent backward, accumulating event keys until we have
// `cap` of them or hit `maxDays`. Cap bounds the subsequent get fan-out so we
// stay under the Worker subrequest ceiling (1000). Returns lex-sorted keys
// (chronological, since names are date-prefixed).
async function recentEventKeys(cap: number, maxDays: number = 60): Promise<string[]> {
  const kv = getKV();
  const collected: string[] = [];
  for (let i = 0; i < maxDays; i++) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    const day = d.toISOString().slice(0, 10);
    // `events:YYYY-MM-DD` = legacy daily-key (pre-2026-05-12 migration; expires
    // naturally over 60d). `events:YYYY-MM-DD:...` = current per-request keys.
    const dayKeys: string[] = [`events:${day}`];
    let cursor: string | undefined;
    do {
      const page = await kv.list({ prefix: `events:${day}:`, cursor });
      for (const k of page.keys) dayKeys.push(k.name);
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);
    collected.unshift(...dayKeys.sort());
    if (collected.length >= cap) break;
  }
  return collected.slice(-cap);
}

async function readEventKeys(names: string[]): Promise<string> {
  if (names.length === 0) return '';
  const kv = getKV();
  const values = await Promise.all(names.map(n => kv.get(n)));
  return values.filter(Boolean).join('');
}

export async function getRecentDaysEvents(days: number = 30): Promise<string> {
  return readEventKeys(await recentEventKeys(800, days));
}

export async function getAllEvents(): Promise<string> {
  return readEventKeys(await recentEventKeys(500));
}
