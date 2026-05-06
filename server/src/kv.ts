/**
 * KV persistence layer.
 *
 * Key structure:
 *   "account:{github_id}"  → encrypted individual account JSON
 *   "auth:{api_key_hash}"  → github_id (lookup index for O(1) auth)
 *   "events:YYYY-MM-DD"    → JSONL string of events for that day
 *   "cron:*"                → cron liveness markers (health digest reads these)
 * (marketplace signals + feedback live in the alexandria-signal github repo
 * now, not in KV — see marketplace.ts for the relay.)
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

/** Save a single account by github_id key. */
export async function saveAccount(githubKey: string, account: Record<string, unknown>): Promise<void> {
  const kv = getKV();
  await kv.put(`account:${githubKey}`, encrypt(JSON.stringify(account)));
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

/** Delete an account and its auth index. */
export async function deleteAccount(githubKey: string, apiKeyHash: string): Promise<void> {
  const kv = getKV();
  await kv.delete(`account:${githubKey}`);
  await kv.delete(`auth:${apiKeyHash}`);
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

function todayKey(): string {
  return `events:${new Date().toISOString().split('T')[0]}`;
}

/**
 * Append event line to daily key. Called by flushEvents() which batches
 * all events from a single request into one write. The race condition
 * (two concurrent requests appending to the same key) is acceptable at
 * low volume — flushEvents batching means each request writes once, so
 * races require two requests completing at the exact same millisecond.
 * At 1000+ concurrent users, migrate to per-event keys.
 */
export async function appendEvent(line: string): Promise<void> {
  const kv = getKV();
  const key = todayKey();
  const existing = await kv.get(key) || '';
  await kv.put(key, existing + line, { expirationTtl: 60 * 24 * 60 * 60 }); // 60-day TTL
}

/**
 * Get events for the last N days (default 30).
 * Each day = 1 KV read. 30 days = 30 reads.
 */
export async function getRecentDaysEvents(days: number = 30): Promise<string> {
  const kv = getKV();
  const keys: string[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
    keys.push(`events:${d.toISOString().split('T')[0]}`);
  }
  const results = await Promise.all(keys.map(k => kv.get(k)));
  return results.filter(Boolean).join('');
}

/**
 * Get ALL events across all time. Only use for explicit data export.
 */
export async function getAllEvents(): Promise<string> {
  const kv = getKV();
  const keys = await kv.list({ prefix: 'events:' });
  if (keys.keys.length === 0) return '';
  const sorted = keys.keys.sort((a, b) => a.name.localeCompare(b.name));
  const chunks: string[] = [];
  for (const key of sorted) {
    const data = await kv.get(key.name);
    if (data) chunks.push(data);
  }
  return chunks.join('');
}
