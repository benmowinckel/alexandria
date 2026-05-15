/**
 * Marketplace signal substrate — stores anonymous machine signals, attributed
 * feedback, and the daily library-signal snapshot in Cloudflare KV.
 *
 * Migrated from `alexandria-signal` private GitHub repo to KV on 2026-05-15.
 * KV is the right primitive for ephemeral operational data: encrypted at rest,
 * private by default, TTL handles cleanup, no git noise.
 *
 * Key layout (in the DATA KV namespace):
 *   signal:{iso-ts}:{hash}     → JSON {t, signal}.   TTL 90d.
 *   feedback:{iso-ts}:{hash}   → JSON {author, t, text, context}.  No TTL.
 *   library-signal             → raw text body, single key, overwriting.
 *
 * Reads: founder inspects via `wrangler kv:key list --binding=DATA --prefix=...`
 * and `wrangler kv:key get`. No admin endpoint yet — add one if list/get via
 * CLI becomes painful.
 */
import { logEvent } from './analytics.js';
import { getKV } from './kv.js';

const SIGNAL_TTL_SECONDS = 90 * 24 * 60 * 60;

/** Stable short hash for key uniqueness. Not security-sensitive. */
async function shortHash(s: string): Promise<string> {
  const buf = new TextEncoder().encode(s);
  const digest = await crypto.subtle.digest('SHA-256', buf);
  const hex = [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  return hex.slice(0, 8);
}

/** Anonymous machine signal — author stripped at the relay boundary. */
export async function publishSignal(signal: string): Promise<void> {
  const t = new Date().toISOString();
  const hash = await shortHash(signal + t);
  const key = `signal:${t}:${hash}`;
  const value = JSON.stringify({ t, signal });
  await getKV().put(key, value, { expirationTtl: SIGNAL_TTL_SECONDS });
  logEvent('marketplace_signal_published', { key });
}

/** Feedback — keeps author attribution (factory needs it for context). */
export async function publishFeedback(payload: { author: string; t: string; text: string; context?: string }): Promise<void> {
  const hash = await shortHash(payload.text + payload.t);
  const key = `feedback:${payload.t}:${hash}`;
  const value = JSON.stringify(payload);
  await getKV().put(key, value);
  logEvent('feedback_published', { key });
}

/** Daily snapshot of library funnel/engagement. Single overwriting key — only
 *  the latest snapshot matters once the next lands. */
export async function publishLibrarySignalSnapshot(text: string): Promise<void> {
  await getKV().put('library-signal', text);
  logEvent('library_signal_snapshot_published', {});
}
