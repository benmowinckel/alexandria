/**
 * Tamper-evident access audit log.
 *
 * Every file-view event (success or denial) gets mirrored to a private
 * GitHub repo (alexandria-audit) as a hash-chained JSONL entry. The
 * chain links every entry to the previous via SHA-256, so any retroactive
 * tampering with a single entry invalidates every entry that came after.
 *
 * Threat model: even a Cloudflare-admin or company insider who accesses
 * R2 directly (bypassing the gate) would still be visible via the R2-side
 * Logpush integration (deferred — needs dashboard work). For application-
 * layer access (the normal path), every gate decision is already logged
 * via `logEvent('library_protocol_file_view', …)` in library.ts. This
 * module mirrors those events to the audit chain on a 10-minute cron.
 *
 * Why the chain matters: events live in KV with 60-day TTL. The audit
 * repo is long-term tamper-evident storage. Hash chain ensures someone
 * with admin access cannot quietly rewrite a historic entry — they'd
 * have to recompute every downstream hash AND match the publicly-exposed
 * /audit/head, which is observed by anyone polling it.
 *
 * State:
 *   - KV `audit:state` → { last_event_t, head_hash, head_n, last_run_at, last_commit_at }
 *   - Repo: `audit/YYYY-MM-DD/HH-mm-ss-{rand}.jsonl` (one batch per non-empty cron run)
 *   - Repo: `HEAD.json` (mirrors head_hash/head_n — convenience for external observers)
 *
 * Entry format (each line of every JSONL batch):
 *   { t, n, prev_hash, hash, e, ...meta }
 *   - t: ISO timestamp
 *   - n: monotonic chain index (0 = genesis)
 *   - prev_hash: hash of entry n-1 (zeros for genesis)
 *   - hash: SHA-256(prev_hash || canonical_json(entry minus hash))
 *   - e: event type (library_protocol_file_view, etc.)
 *   - meta: open-ended key/value pairs from the source logEvent call
 *
 * Verification: walk entries forward, recompute each hash, compare to
 * stored hash. Final hash must equal /audit/head.
 */

import { logEvent } from './analytics.js';
import { getKV, getRecentDaysEvents } from './kv.js';

const AUDIT_REPO = 'mowinckelb/alexandria-audit';
const GITHUB_API = 'https://api.github.com';
const GENESIS_HASH = '0'.repeat(64);

// Events the audit mirror cares about. Anything else (analytics noise,
// internal smoke, etc.) is skipped — the audit is a record of *access*
// decisions on protocol files, not a copy of the whole event log.
const AUDITED_EVENT_TYPES = new Set<string>([
  'library_protocol_file_view',
]);

export interface AuditState {
  last_event_t: string;       // ISO — high-water-mark of source events mirrored
  head_hash: string;          // current chain head
  head_n: number;             // current chain length (genesis = 0, first real entry = 1)
  last_run_at: string;        // ISO — last time the cron handler ran (even if it committed nothing)
  last_commit_at: string;     // ISO — last time the cron committed a batch
}

export interface AuditEntry {
  t: string;
  n: number;
  prev_hash: string;
  hash: string;
  e: string;
  [key: string]: string | number;
}

function getGithubToken(): string {
  const t = process.env.GITHUB_BOT_TOKEN;
  if (!t) throw new Error('GITHUB_BOT_TOKEN unset — audit mirror disabled');
  return t;
}

/** Canonical JSON for hashing: sorted keys, no whitespace. Identical input
 *  on any future verifier must produce the same hash. */
function canonicalJson(obj: Record<string, unknown>): string {
  const sortedKeys = Object.keys(obj).sort();
  const parts = sortedKeys.map(k => `${JSON.stringify(k)}:${JSON.stringify(obj[k])}`);
  return `{${parts.join(',')}}`;
}

async function sha256Hex(input: string): Promise<string> {
  const buf = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
}

/** Compute the hash field of an entry. The entry passed in must NOT contain
 *  `hash` itself — only `prev_hash` and the rest of the fields. */
async function computeEntryHash(entryWithoutHash: Record<string, unknown>): Promise<string> {
  const prevHash = String(entryWithoutHash.prev_hash || GENESIS_HASH);
  return sha256Hex(prevHash + '\n' + canonicalJson(entryWithoutHash));
}

async function loadState(): Promise<AuditState> {
  const raw = await getKV().get('audit:state');
  if (!raw) {
    return {
      last_event_t: '1970-01-01T00:00:00.000Z',
      head_hash: GENESIS_HASH,
      head_n: 0,
      last_run_at: '1970-01-01T00:00:00.000Z',
      last_commit_at: '1970-01-01T00:00:00.000Z',
    };
  }
  try {
    return JSON.parse(raw) as AuditState;
  } catch {
    // Corrupted checkpoint — fail loud rather than silently start a new chain
    // that would orphan the repo's existing entries.
    throw new Error('audit:state in KV is corrupted — manual intervention required');
  }
}

async function saveState(state: AuditState): Promise<void> {
  await getKV().put('audit:state', JSON.stringify(state));
}

/** Read recent event log lines from KV, parse, filter to audited types,
 *  and return those with `t` strictly greater than the high-water-mark. */
async function fetchNewEvents(sinceT: string): Promise<Array<Record<string, string>>> {
  // 60-day TTL on events:* keys is the floor — anything older is already gone
  // from KV. The audit repo retains history beyond that window.
  const raw = await getRecentDaysEvents(7);
  if (!raw) return [];
  const out: Array<Record<string, string>> = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(trimmed);
    } catch { continue; }
    if (typeof parsed.t !== 'string' || typeof parsed.e !== 'string') continue;
    if (!AUDITED_EVENT_TYPES.has(parsed.e)) continue;
    if (parsed.t <= sinceT) continue;
    out.push(parsed);
  }
  // Stable order: by timestamp, then by stringified event for ties.
  out.sort((a, b) => {
    if (a.t !== b.t) return a.t.localeCompare(b.t);
    return JSON.stringify(a).localeCompare(JSON.stringify(b));
  });
  return out;
}

/** Build hash-chained AuditEntries from raw events, continuing from the given
 *  chain head. Returns the list of entries plus the new head hash + index. */
async function chainEvents(
  events: Array<Record<string, string>>,
  prevHashStart: string,
  startN: number,
): Promise<{ entries: AuditEntry[]; newHead: string; newN: number }> {
  let prevHash = prevHashStart;
  let n = startN;
  const entries: AuditEntry[] = [];
  for (const ev of events) {
    n += 1;
    const withoutHash: Record<string, string | number> = { ...ev, n, prev_hash: prevHash };
    const hash = await computeEntryHash(withoutHash);
    entries.push({ ...withoutHash, hash } as AuditEntry);
    prevHash = hash;
  }
  return { entries, newHead: prevHash, newN: n };
}

/** PUT a file to the audit repo. Encodes content as base64 per GitHub API. */
async function putRepoFile(path: string, content: string, message: string): Promise<void> {
  const token = getGithubToken();
  const url = `${GITHUB_API}/repos/${AUDIT_REPO}/contents/${path}`;

  // GitHub's Contents API requires the current `sha` of an existing file
  // before overwriting. New files omit it. HEAD.json is the only file we
  // ever overwrite; batch files are write-once.
  let existingSha: string | undefined;
  if (path === 'HEAD.json') {
    const getResp = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'alexandria-server',
      },
    });
    if (getResp.ok) {
      const data = await getResp.json() as { sha?: string };
      existingSha = data.sha;
    }
  }

  const body: Record<string, unknown> = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
    branch: 'main',
  };
  if (existingSha) body.sha = existingSha;

  const resp = await fetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'alexandria-server',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`github put ${path} failed: ${resp.status} ${errText.slice(0, 200)}`);
  }
}

function batchPath(now: Date): string {
  const date = now.toISOString().slice(0, 10);            // YYYY-MM-DD
  const time = now.toISOString().slice(11, 19).replace(/:/g, '-');  // HH-mm-ss
  const rand = Math.floor(Math.random() * 0xffff).toString(16).padStart(4, '0');
  return `audit/${date}/${time}-${rand}.jsonl`;
}

/**
 * Cron entry point — mirrors any new audited events to the GitHub chain.
 * Updates `last_run_at` every call so /audit/head proves the cron is alive
 * even when there are no new events to commit.
 */
export async function mirrorPendingAuditBatch(): Promise<{ committed: number; head: string }> {
  const nowIso = new Date().toISOString();
  let state = await loadState();
  const events = await fetchNewEvents(state.last_event_t);

  if (events.length === 0) {
    state = { ...state, last_run_at: nowIso };
    await saveState(state);
    logEvent('audit_mirror_run', { committed: '0' });
    return { committed: 0, head: state.head_hash };
  }

  const { entries, newHead, newN } = await chainEvents(events, state.head_hash, state.head_n);
  const lastT = entries[entries.length - 1].t;
  const jsonl = entries.map(e => JSON.stringify(e)).join('\n') + '\n';

  const path = batchPath(new Date());
  await putRepoFile(path, jsonl, `audit batch ${path.split('/').pop()} (${entries.length} entries)`);

  const newHeadJson = JSON.stringify({
    head_hash: newHead,
    head_n: newN,
    last_t: lastT,
    last_commit_at: nowIso,
  }, null, 2) + '\n';
  await putRepoFile('HEAD.json', newHeadJson, `HEAD → ${newHead.slice(0, 12)} (n=${newN})`);

  state = {
    last_event_t: lastT,
    head_hash: newHead,
    head_n: newN,
    last_run_at: nowIso,
    last_commit_at: nowIso,
  };
  await saveState(state);

  logEvent('audit_mirror_run', { committed: String(entries.length), head: newHead.slice(0, 12) });
  return { committed: entries.length, head: newHead };
}

/** Public head — exposed via /audit/head for external observers to poll. */
export async function getAuditHead(): Promise<{
  head_hash: string;
  head_n: number;
  last_run_at: string;
  last_commit_at: string;
}> {
  const state = await loadState();
  return {
    head_hash: state.head_hash,
    head_n: state.head_n,
    last_run_at: state.last_run_at,
    last_commit_at: state.last_commit_at,
  };
}

/** Per-author access log — returns the author's own audited events from the
 *  rolling KV window. Long-term history lives in the GitHub repo, accessible
 *  to the author by cloning. */
export async function getAuthorAuditEntries(authorLogin: string, limit = 200): Promise<Array<Record<string, string>>> {
  const raw = await getRecentDaysEvents(30);
  if (!raw) return [];
  const out: Array<Record<string, string>> = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const parsed = JSON.parse(trimmed) as Record<string, string>;
      if (!AUDITED_EVENT_TYPES.has(parsed.e)) continue;
      if (parsed.author !== authorLogin) continue;
      out.push(parsed);
    } catch { continue; }
  }
  // Most recent first — author wants to see what just happened.
  out.sort((a, b) => b.t.localeCompare(a.t));
  return out.slice(0, limit);
}

// Exposed for testing.
export const _internal = {
  canonicalJson,
  sha256Hex,
  computeEntryHash,
  chainEvents,
  GENESIS_HASH,
};
