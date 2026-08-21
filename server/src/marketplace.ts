/**
 * Marketplace feedback substrate.
 *
 * Feedback an Author directly chooses to send in the foreground, plus the
 * Alexandria-owned cancel screen, is saved durably in KV before Alexandria
 * relays it to the private benmowinckel/alexandria-feedback GitHub repo.
 * Session hooks never draft or send it. KV is a delivery outbox, not a second
 * editorial queue: successful GitHub delivery deletes the pending item.
 * Machine setup telemetry never enters this queue; it has a purpose-built
 * event-log path.
 *
 * Drain pattern: an active product agent processes files, `git rm`s them, pushes. File
 * presence = unprocessed, absence = processed. No separate marker.
 *
 * The daily library-signal snapshot (server-computed funnel data, no
 * Author content) stays in KV — it's a single overwriting key consumed
 * by the founder, not the autoloop.
 *
 * Anonymous machine signal was removed 2026-05-15 — sovereignty was
 * promissory (Engine instructed not to include Author content; Authors
 * had to trust the prompt). Replaced by Author-explicit feedback only.
 */
import { logEvent } from './analytics.js';
import { getKV } from './kv.js';
import { decrypt, encrypt } from './crypto.js';

const FEEDBACK_REPO = 'benmowinckel/alexandria-feedback';
const GITHUB_API = 'https://api.github.com';
const FEEDBACK_PENDING_PREFIX = 'feedback-pending:';

interface PendingFeedback {
  id: string;
  path: string;
  value: string;
  message: string;
}

function getGithubToken(): string {
  const t = process.env.GITHUB_BOT_TOKEN;
  if (!t) throw new Error('GITHUB_BOT_TOKEN unset — feedback relay disabled');
  return t;
}

/** Stable short hash for key/path uniqueness. Not security-sensitive. */
async function shortHash(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 8);
}

/** Commit a single file to the feedback repo via GitHub Contents API.
 * A retry after GitHub accepted the first request can return 422 because the
 * path already exists. Confirming that path exists makes delivery idempotent. */
async function putFileToGithub(path: string, content: string, message: string): Promise<void> {
  const token = getGithubToken();
  const url = `${GITHUB_API}/repos/${FEEDBACK_REPO}/contents/${path}`;
  const body = {
    message,
    content: btoa(unescape(encodeURIComponent(content))),
    branch: 'main',
  };
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
  if (resp.ok) return;
  if (resp.status === 422) {
    const existing = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'User-Agent': 'alexandria-server',
      },
    });
    if (existing.ok) return;
  }
  const errText = await resp.text();
  throw new Error(`github put ${path} failed: ${resp.status} ${errText.slice(0, 200)}`);
}

/** Author-explicit feedback. Durable substrate: a KV delivery outbox feeding
 *  the alexandria-feedback GitHub repo.
 *  Returns the item's **id** — `<date>-<hash>` — which is the addressing scheme
 *  for the return leg: a reply is a signed file named for the id it answers, so
 *  an unsolicited push has no landing site (see a2 § The bottom line). Without
 *  an id the channel is structurally one-way, which is what it was until now. */
export async function publishFeedback(payload: { author: string; t: string; text: string; context?: string }): Promise<string> {
  const hash = await shortHash(payload.text + payload.t);
  const id = `${payload.t.slice(0, 10)}-${hash.slice(0, 6)}`;
  const value = JSON.stringify({ ...payload, id }, null, 2) + '\n';
  const path = `feedback/${payload.t.replace(/[:.]/g, '-')}-${hash}.json`;
  const pending: PendingFeedback = { id, path, value, message: `feedback ${payload.t}` };
  const pendingKey = `${FEEDBACK_PENDING_PREFIX}${id}`;

  // Save before the external request. If the relay is unavailable the user
  // still gets a successful, addressable submission and cron finishes later.
  await getKV().put(pendingKey, encrypt(JSON.stringify(pending)));
  try {
    await putFileToGithub(path, value, pending.message);
    await getKV().delete(pendingKey);
    logEvent('feedback_published', { hash });
  } catch (err) {
    console.error('[feedback] queued for retry:', err);
    logEvent('feedback_queued', { hash });
  }
  return id;
}

/** Retry a bounded batch of saved feedback. One bad item never blocks the rest. */
export async function flushPendingFeedback(limit = 20): Promise<{ delivered: number; retained: number }> {
  const kv = getKV();
  const page = await kv.list({ prefix: FEEDBACK_PENDING_PREFIX, limit });
  let delivered = 0;
  let retained = 0;

  for (const item of page.keys) {
    try {
      const raw = await kv.get(item.name);
      if (!raw) continue;
      const pending = JSON.parse(decrypt(raw)) as PendingFeedback;
      if (!pending.path || !pending.value || !pending.message) throw new Error('invalid pending feedback');
      await putFileToGithub(pending.path, pending.value, pending.message);
      await kv.delete(item.name);
      delivered++;
      logEvent('feedback_published', { id: pending.id, source: 'retry' });
    } catch (err) {
      retained++;
      console.error(`[feedback] retry retained ${item.name}:`, err);
    }
  }
  if (retained > 0) logEvent('feedback_retry_incomplete', { retained: String(retained) });
  return { delivered, retained };
}

/** Daily snapshot of library funnel/engagement. Server-computed (no Author
 *  content). Single overwriting KV key — only the latest matters. */
export async function publishLibrarySignalSnapshot(text: string): Promise<void> {
  await getKV().put('library-signal', text);
  logEvent('library_signal_snapshot_published', {});
}
