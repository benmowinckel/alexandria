/**
 * Marketplace feedback substrate.
 *
 * Author-typed feedback (from ~/alexandria/system/.session_feedback and the
 * cancel screen) writes to the benmowinckel/alexandria-feedback private GitHub
 * repo so any rented agent can drain it through GitHub. Single source of truth
 * — no KV or email duplicate to keep in sync. Machine setup telemetry never
 * enters this queue; it has a purpose-built event-log path.
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

const FEEDBACK_REPO = 'benmowinckel/alexandria-feedback';
const GITHUB_API = 'https://api.github.com';

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

/** Commit a single file to the feedback repo via GitHub Contents API. */
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
  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`github put ${path} failed: ${resp.status} ${errText.slice(0, 200)}`);
  }
}

/** Author-explicit feedback. Single substrate: alexandria-feedback GitHub repo.
 *  Returns the item's **id** — `<date>-<hash>` — which is the addressing scheme
 *  for the return leg: a reply is a signed file named for the id it answers, so
 *  an unsolicited push has no landing site (see a2 § The bottom line). Without
 *  an id the channel is structurally one-way, which is what it was until now. */
export async function publishFeedback(payload: { author: string; t: string; text: string; context?: string }): Promise<string> {
  const hash = await shortHash(payload.text + payload.t);
  const id = `${payload.t.slice(0, 10)}-${hash.slice(0, 6)}`;
  const value = JSON.stringify({ ...payload, id }, null, 2) + '\n';
  const path = `feedback/${payload.t.replace(/[:.]/g, '-')}-${hash}.json`;
  await putFileToGithub(path, value, `feedback ${payload.t}`);
  logEvent('feedback_published', { hash });
  return id;
}

/** Daily snapshot of library funnel/engagement. Server-computed (no Author
 *  content). Single overwriting KV key — only the latest matters. */
export async function publishLibrarySignalSnapshot(text: string): Promise<void> {
  await getKV().put('library-signal', text);
  logEvent('library_signal_snapshot_published', {});
}
