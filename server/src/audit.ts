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
const EPOCH = '1970-01-01T00:00:00.000Z';   // genesis cursor — no history yet
const DAY_MS = 24 * 60 * 60 * 1000;
// events:* keys carry a 60-day TTL (kv.ts appendEvent). Anything older than
// this horizon is already gone from KV and can never be chained — the hard
// ceiling on how far back an outage-recovery read can reach.
const READ_WINDOW_MAX_DAYS = 60;

// Events the audit mirror cares about. Anything else (analytics noise,
// internal smoke, etc.) is skipped — the audit is a record of *governance*
// events on protocol files: who accessed, and what credentials existed to
// grant access. Without the mint/revoke events, a bad actor could mint
// themselves a code, read every invite file, revoke the code, and only the
// read events would appear in the chain — making the provisioning that
// enabled the reads invisible. Cover both.
const AUDITED_EVENT_TYPES = new Set<string>([
  'library_protocol_file_view',
  'access_code_minted',
  'access_code_revoked',
]);

export interface AuditState {
  last_event_t: string;       // ISO — high-water-mark of source events mirrored
  last_event_key: string;     // content-hash tiebreaker of the last mirrored event — the second
                              // half of the (timestamp, key) cursor, so same-millisecond events
                              // at a batch boundary are never skipped
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
      last_event_t: EPOCH,
      last_event_key: '',
      head_hash: GENESIS_HASH,
      head_n: 0,
      last_run_at: EPOCH,
      last_commit_at: EPOCH,
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

/** Stable per-event tiebreaker: SHA-256 of the event's canonical JSON. Used as
 *  the second half of the (timestamp, key) cursor so two events sharing the
 *  exact same millisecond ISO timestamp still have a total order and neither is
 *  ever dropped at a batch boundary. Deterministic on any future verifier. */
async function eventKey(ev: Record<string, string>): Promise<string> {
  return sha256Hex(canonicalJson(ev));
}

/** Interval the cron missed so completely that its events aged out of KV before
 *  they could be chained — a permanent, unrecoverable hole. */
interface GapInfo { fromT: string; horizonT: string; }

/** Read recent event log lines from KV, parse, filter to audited types, and
 *  return those strictly after the (timestamp, key) cursor.
 *
 *  Two silent-drop bugs fixed here:
 *
 *  1. Batch-boundary drop. The cursor is a (timestamp, content-hash) pair, not
 *     a bare timestamp. An event is only skipped when its whole pair is <= the
 *     cursor, so same-millisecond events straddling two cron runs are kept.
 *     Migration note: legacy state has no `last_event_key` (treated as ''), so
 *     on the first run after deploy any event sharing the exact millisecond of
 *     the last-mirrored event is (re)admitted. That surfaces the previously
 *     dropped ones; at worst it re-emits the single boundary event once — a
 *     benign one-time duplicate (chain stays valid), never a drop.
 *
 *  2. Outage drop. The read window is widened to cover the cursor's age instead
 *     of a fixed 7 days, so a cron that paused for days/weeks still chains
 *     everything KV retains (events live 60 days). Only when the cursor predates
 *     the 60-day TTL — i.e. events truly expired — do we refuse to advance
 *     silently: a GapInfo is returned so the caller writes a loud, permanent
 *     gap marker into the chain and raises an alarm. */
async function fetchNewEvents(
  sinceT: string,
  sinceKey: string,
): Promise<{ events: Array<Record<string, string>>; gap: GapInfo | null }> {
  const sinceMs = Date.parse(sinceT);
  const ageMs = Date.now() - sinceMs;
  let readDays = 7;
  let gap: GapInfo | null = null;

  if (sinceT !== EPOCH && Number.isFinite(sinceMs) && ageMs > 7 * DAY_MS) {
    // Cron is behind. Widen the read to reach back to the cursor (capped at the
    // KV TTL horizon), so a paused/failed cron recovers instead of skipping.
    readDays = Math.min(READ_WINDOW_MAX_DAYS, Math.ceil(ageMs / DAY_MS) + 1);
    if (ageMs > READ_WINDOW_MAX_DAYS * DAY_MS) {
      // Cursor predates the TTL: events between it and the horizon have expired
      // and can never be chained. Flag the hole rather than advance past it.
      gap = {
        fromT: sinceT,
        horizonT: new Date(Date.now() - READ_WINDOW_MAX_DAYS * DAY_MS).toISOString(),
      };
    }
  }
  // NOTE (residual): getRecentDaysEvents caps its fan-out at 800 KV keys
  // (Worker subrequest ceiling). Under extreme event volume a widened read may
  // not reach all the way back to the cursor even within 60 days. Closing that
  // fully needs an uncapped, cursor-bounded reader in kv.ts (out of scope for
  // this one-file fix) — flagged to the founder.
  const raw = await getRecentDaysEvents(readDays);
  if (!raw) return { events: [], gap };

  const candidates: Array<{ ev: Record<string, string>; key: string }> = [];
  for (const line of raw.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    let parsed: Record<string, string>;
    try {
      parsed = JSON.parse(trimmed);
    } catch { continue; }
    if (typeof parsed.t !== 'string' || typeof parsed.e !== 'string') continue;
    if (!AUDITED_EVENT_TYPES.has(parsed.e)) continue;
    const key = await eventKey(parsed);
    // Strict (timestamp, key) cursor: keep iff t > sinceT, or t == sinceT and
    // key > sinceKey. Same-millisecond events differ by key and survive.
    if (parsed.t < sinceT) continue;
    if (parsed.t === sinceT && key <= sinceKey) continue;
    candidates.push({ ev: parsed, key });
  }
  // Total order matching the cursor: timestamp first, content-hash to break ties.
  candidates.sort((a, b) =>
    a.ev.t !== b.ev.t ? a.ev.t.localeCompare(b.ev.t) : a.key.localeCompare(b.key));
  return { events: candidates.map(c => c.ev), gap };
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
 * External anchor hook — residual trust, made minimal.
 *
 * RESIDUAL TRUST: /audit/head serves head_hash from operator-controlled KV, and
 * the same GITHUB_BOT_TOKEN writes the batch repo. An insider holding BOTH KV
 * write and that token can recompute the whole chain from genesis and overwrite
 * KV + repo consistently — undetectably — because nothing is pinned to a third
 * party the operator cannot rewrite. The hash chain proves internal consistency,
 * not that history wasn't wholesale rewritten.
 *
 * This hook is the minimal countermeasure: when AUDIT_ANCHOR_URL is set, each
 * mirror run POSTs the current head_hash + count to that external append-only
 * endpoint, timestamping the head somewhere the operator cannot silently edit.
 * A later divergence between the anchor's record and KV/repo exposes tampering.
 *
 * It is fail-safe: a down, slow, or misconfigured anchor NEVER breaks the mirror
 * (errors and timeouts are swallowed). When the env var is unset it is a no-op.
 *
 * To make tamper-evidence STRUCTURAL rather than trust-based, the founder must
 * configure AUDIT_ANCHOR_URL to a genuinely independent, append-only surface
 * the operator cannot rewrite — e.g. an OpenTimestamps calendar, a public
 * transparency log, or a notarising endpoint on infrastructure outside this
 * account. No such endpoint is invented or called here.
 */
async function anchorHead(headHash: string, headN: number): Promise<void> {
  const url = process.env.AUDIT_ANCHOR_URL;
  if (!url) return; // unset → no-op
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'User-Agent': 'alexandria-server' },
      body: JSON.stringify({ head_hash: headHash, head_n: headN, at: new Date().toISOString() }),
      signal: AbortSignal.timeout(5000),
    });
  } catch (err) {
    // Best-effort: the anchor is a safety net, never a dependency of the mirror.
    console.error('[audit] anchor POST failed (mirror unaffected):', err);
  }
}

/**
 * Cron entry point — mirrors any new audited events to the GitHub chain.
 * Updates `last_run_at` every call so /audit/head proves the cron is alive
 * even when there are no new events to commit.
 */
export async function mirrorPendingAuditBatch(): Promise<{ committed: number; head: string }> {
  const nowIso = new Date().toISOString();
  let state = await loadState();
  const { events, gap } = await fetchNewEvents(state.last_event_t, state.last_event_key ?? '');

  // Assemble the batch. A gap marker (if any) leads, then the recovered events.
  const toChain: Array<Record<string, string>> = [];
  if (gap) {
    // Loud, permanent record of the unrecoverable hole — never a silent advance.
    logEvent('audit_gap_detected', { from: gap.fromT, to: gap.horizonT });
    toChain.push({
      t: nowIso,
      e: 'audit_gap',
      gap_from: gap.fromT,
      gap_to: gap.horizonT,
      note: 'cron outage exceeded the KV 60-day TTL; audited events in [gap_from, gap_to] expired before being chained and are permanently omitted',
    });
  }
  toChain.push(...events);

  if (toChain.length === 0) {
    state = { ...state, last_run_at: nowIso };
    await saveState(state);
    await anchorHead(state.head_hash, state.head_n);
    logEvent('audit_mirror_run', { committed: '0' });
    return { committed: 0, head: state.head_hash };
  }

  const { entries, newHead, newN } = await chainEvents(toChain, state.head_hash, state.head_n);
  // Advance the cursor to the last *real* KV event (the synthetic gap marker is
  // never re-read, so it must not become the cursor). Gap-only batch → jump the
  // cursor to now so the same hole isn't re-flagged every run.
  const lastRealEvent = events.length > 0 ? events[events.length - 1] : null;
  const cursorT = lastRealEvent ? lastRealEvent.t : nowIso;
  const cursorKey = lastRealEvent ? await eventKey(lastRealEvent) : '';
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
    last_event_t: cursorT,
    last_event_key: cursorKey,
    head_hash: newHead,
    head_n: newN,
    last_run_at: nowIso,
    last_commit_at: nowIso,
  };
  await saveState(state);
  await anchorHead(newHead, newN);

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
