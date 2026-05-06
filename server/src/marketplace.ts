/**
 * Marketplace signal substrate — relays signals/feedback to a private GitHub repo.
 *
 * Why github not KV: the factory agent runs on Anthropic's CCR runtime which can't
 * reach mcp.mowinckel.ai/* but CAN reach github via gh. So github is the only
 * substrate where both the server (writer) and agent (reader+drainer) overlap.
 *
 * Server is a thin relay. No data lives on the server long-term.
 *
 * Failure mode: if GITHUB_BOT_TOKEN is unset or github is down, the relay throws.
 * Callers should let the POST fail loudly — silent loss is worse than 502 to the
 * Machine, which will retry on its next session.
 */
import { logEvent } from './analytics.js';

const REPO = 'mowinckelb/alexandria-signal';
const API = 'https://api.github.com';

function getToken(): string {
  const t = process.env.GITHUB_BOT_TOKEN;
  if (!t) throw new Error('GITHUB_BOT_TOKEN unset — marketplace relay disabled');
  return t;
}

/** Stable short hash for filename uniqueness. Not security-sensitive. */
async function shortHash(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 8);
}

/** Commit a single file to the marketplace repo via Contents API. */
async function putFile(path: string, content: string, message: string): Promise<void> {
  const token = getToken();
  const url = `${API}/repos/${REPO}/contents/${path}`;
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

/** Anonymous machine signal — author stripped at the relay boundary. */
export async function publishSignal(signal: string): Promise<void> {
  const t = new Date().toISOString();
  const hash = await shortHash(signal + t);
  const path = `signals/${t.replace(/[:.]/g, '-')}-${hash}.json`;
  const content = JSON.stringify({ t, signal }, null, 2) + '\n';
  await putFile(path, content, `signal ${t}`);
  logEvent('marketplace_signal_published', { path });
}

/** Feedback — keeps author attribution (factory needs it for context). */
export async function publishFeedback(payload: { author: string; t: string; text: string; context?: string }): Promise<void> {
  const hash = await shortHash(payload.text + payload.t);
  const path = `feedback/${payload.t.replace(/[:.]/g, '-')}-${hash}.json`;
  const content = JSON.stringify(payload, null, 2) + '\n';
  await putFile(path, content, `feedback ${payload.t}`);
  logEvent('feedback_published', { path });
}

/** Daily snapshot of library funnel/engagement so the factory has the full input set.
 * Single overwriting file (library-signal.md) — yesterday's snapshot is irrelevant
 * once today's lands. PUT auto-handles the existing-file SHA dance via getFileSha. */
export async function publishLibrarySignalSnapshot(text: string): Promise<void> {
  const path = 'library-signal.md';
  const sha = await getFileSha(path);
  const token = getToken();
  const body: Record<string, unknown> = {
    message: `library-signal ${new Date().toISOString()}`,
    content: btoa(unescape(encodeURIComponent(text))),
    branch: 'main',
  };
  if (sha) body.sha = sha;
  const resp = await fetch(`${API}/repos/${REPO}/contents/${path}`, {
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
    throw new Error(`github put library-signal failed: ${resp.status} ${errText.slice(0, 200)}`);
  }
  logEvent('library_signal_snapshot_published', {});
}

async function getFileSha(path: string): Promise<string | null> {
  const token = getToken();
  const resp = await fetch(`${API}/repos/${REPO}/contents/${path}?ref=main`, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'User-Agent': 'alexandria-server',
    },
  });
  if (resp.status === 404) return null;
  if (!resp.ok) throw new Error(`github get sha ${path} failed: ${resp.status}`);
  const data = await resp.json() as { sha: string };
  return data.sha;
}
