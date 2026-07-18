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
 *   "library-signal"        → daily library-signal snapshot (single key)
 *
 * (Feedback used to live here under `feedback:` prefix; moved 2026-05-16 to
 * benmowinckel/alexandria-feedback github repo so the factory autoloop can
 * reach it. Existing `feedback:*` keys remain as orphans, harmless.)
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

/** Set login lookup index: github_login (lowercased) → github_id key.
 *
 * FIRST-CLAIM-WINS (sticky): once a login is bound to a github_id, it is NEVER
 * silently rebound to a different one. GitHub usernames are recyclable — a user
 * can rename or delete, freeing the handle for anyone to grab, while the numeric
 * github_id is permanent. Without stickiness, an attacker who claims a freed
 * handle would have this index repointed to THEIR account on sign-in, inheriting
 * the original owner's library, access-code secrets, twin config, and earnings
 * (account takeover). Sticky binding makes the login an immutable alias for the
 * one github_id that first claimed it; it is released only when THAT account is
 * deleted (see deleteAccount). A legit rename keeps the old binding AND adds a
 * new one for the new handle — the owner's resources stay reachable at the
 * original library handle. */
export async function setLoginIndex(login: string, githubKey: string): Promise<void> {
  if (!login) return;
  const kv = getKV();
  const key = LOGIN_INDEX_PREFIX + login.toLowerCase();
  const existing = await kv.get(key);
  if (existing && existing !== githubKey) return; // claimed by another id → never rebind
  if (existing === githubKey) return;             // already ours → no-op write avoided
  await kv.put(key, githubKey);
}

/** Save a single account by github_id key. Maintains login index. */
export async function saveAccount(githubKey: string, account: Record<string, unknown>): Promise<void> {
  const kv = getKV();
  await kv.put(`account:${githubKey}`, encrypt(JSON.stringify(account)));
  const login = account.github_login as string | undefined;
  if (login) await setLoginIndex(login, githubKey);
}

/** Set auth lookup index: api_key_hash → github_id key.
 *
 * `previousHash` (optional) is deleted as part of the same operation. Pass it
 * whenever rotating an Author's API key so the old key stops resolving —
 * without this, every key regeneration (install-nudge, OAuth re-login before
 * install) accumulates orphan auth: rows that grant permanent access until the
 * account is deleted. Idempotent when previousHash === apiKeyHash or absent. */
export async function setAuthIndex(apiKeyHash: string, githubKey: string, previousHash?: string | null): Promise<void> {
  const kv = getKV();
  await kv.put(`auth:${apiKeyHash}`, githubKey);
  if (previousHash && previousHash !== apiKeyHash) {
    await kv.delete(`auth:${previousHash}`);
  }
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
  // Release the login binding ONLY if it currently points at THIS account — the
  // sticky index means `login:x` may belong to a different id (e.g. this is a
  // recycled-handle account that never owned the binding); deleting it then
  // would wrongly free the real owner's handle.
  if (login) {
    const idx = await getLoginIndex(login);
    if (idx === githubKey) await deleteLoginIndex(login);
  }
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
