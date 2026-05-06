/**
 * General compounding — append-only event log.
 *
 * Every tool call produces one JSONL line. No user data. No content.
 * No tokens. Just event type, timestamp, and open-ended metadata.
 *
 * Storage: KV namespace with daily keys (events:YYYY-MM-DD).
 * In-memory summary for fast /analytics reads (warm between requests).
 */

import { appendEvent, getAllEvents, getRecentDaysEvents, getKV } from './kv.js';
import { getDB } from './db.js';
import { formatPT } from './time.js';

// Metrics epoch — dashboard counts events from this date forward.
// Set 2026-04-14: clean-slate after fixing all event sources (session_id, event types, test noise).
const METRICS_EPOCH = '2026-04-14T11:00:00.000Z';

// ---------------------------------------------------------------------------
// Types — intentionally open-ended
// ---------------------------------------------------------------------------

/** Any string key-value pairs. No fixed schema. Evolves with the system. */
export type EventMeta = Record<string, string>;

// ---------------------------------------------------------------------------
// In-memory summary (fast reads for /analytics, warm between requests)
// ---------------------------------------------------------------------------

interface Summary {
  total: number;
  by_key: Record<string, number>;
  since: string;
  last_event: string | null;
}

const summary: Summary = {
  total: 0,
  by_key: {},
  since: new Date().toISOString(),
  last_event: null,
};

// ---------------------------------------------------------------------------
// Core functions
// ---------------------------------------------------------------------------

// Pending JSONL lines — collected during request, flushed as one KV write.
// Batching avoids read-modify-write races between concurrent appends.
const pendingLines: string[] = [];

/**
 * Log an event. One JSONL line queued in memory, update in-memory summary.
 * KV write happens in flushEvents() — call via ctx.waitUntil() to ensure completion.
 */
export function logEvent(type: string, meta?: EventMeta): void {
  const now = new Date().toISOString();

  // In-memory summary
  summary.total++;
  summary.last_event = now;
  const stableMetaParts = Object.entries(meta || {})
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([k, v]) => `${k}=${v}`);
  const parts: string[] = [type, ...stableMetaParts];
  const key = parts.join(':');
  summary.by_key[key] = (summary.by_key[key] || 0) + 1;

  // JSONL entry — flat, open-ended
  const entry: Record<string, string> = { t: now, e: type, ...meta };
  pendingLines.push(JSON.stringify(entry) + '\n');
}

/**
 * Flush all pending event lines as one KV write. Call via ctx.waitUntil(flushEvents())
 * to ensure KV writes complete before the Worker isolate is killed.
 * Single write per flush eliminates read-modify-write races between events.
 */
export function flushEvents(): Promise<void> {
  if (pendingLines.length === 0) return Promise.resolve();
  const batch = pendingLines.splice(0).join('');
  return appendEvent(batch).catch((err) => {
    console.error('[analytics] Failed to flush events:', err);
  });
}

/**
 * Get summary counts (fast, in-memory).
 */
export function getAnalytics(): Summary {
  return { ...summary, by_key: { ...summary.by_key } };
}

/**
 * Get full event log as raw JSONL string.
 */
export async function getEventLog(): Promise<string> {
  try {
    return await getAllEvents();
  } catch {
    return '';
  }
}

/**
 * Monitoring dashboard — verification signals.
 */
export async function getDashboard(): Promise<Record<string, unknown> & { _events?: Record<string, string>[] }> {
  const events: Record<string, string>[] = [];
  let parseErrors = 0;
  try {
    const raw = await getRecentDaysEvents(30);
    if (!raw) return { status: 'no data', message: 'No events logged yet.' };
    const lines = raw.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        events.push(JSON.parse(line));
      } catch {
        parseErrors++;
      }
    }
    if (parseErrors > 0) {
      console.error(`[analytics] Skipped ${parseErrors} corrupted event log lines`);
    }
  } catch {
    return { status: 'no data', message: 'No events logged yet.' };
  }

  if (events.length === 0) {
    return { status: 'no data', message: 'No events logged yet.' };
  }

  // Filter automated/test traffic by prefix convention — no hardcoded list to maintain
  const isSmoke = (s: string) => /^(smoke_|test_|debug_|lifecycle-)/.test(s) || s === 'verification' || s === 'github_smoke';

  // Time range + staleness
  const firstEvent = events[0]?.t || null;
  const lastEvent = events[events.length - 1]?.t || null;
  const hoursSinceLastEvent = lastEvent
    ? Math.round((Date.now() - new Date(lastEvent).getTime()) / (1000 * 60 * 60) * 10) / 10
    : null;
  const stale = hoursSinceLastEvent !== null && hoursSinceLastEvent > 24;

  const now = Date.now();
  const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;
  const serverErrors24h = events.filter(
    e => e.e === 'server_error' && new Date(e.t).getTime() > twentyFourHoursAgo
  );
  const notFound24h = events.filter(
    e => e.e === 'server_not_found' && new Date(e.t).getTime() > twentyFourHoursAgo
  );
  const notFoundByPath: Record<string, number> = {};
  for (const ev of notFound24h) {
    const path = ev.path || '(unknown)';
    notFoundByPath[path] = (notFoundByPath[path] || 0) + 1;
  }
  const topNotFoundPaths = Object.entries(notFoundByPath)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([path, count]) => ({ path, count }));

  // Cron execution status
  const cronStatus: Record<string, unknown> = {};
  try {
    const kv = getKV();
    for (const job of ['health_digest']) {
      const raw = await kv.get(`cron:${job}`);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && typeof parsed === 'object' && parsed.t) parsed.t = formatPT(parsed.t);
        cronStatus[job] = parsed;
      } else {
        cronStatus[job] = { t: null, status: 'never_run' };
      }
    }
  } catch { /* non-fatal */ }

  // Per-author cross-event visibility.
  // Session lifecycle events (call/end/active) don't fire — hooks post to /call (D1)
  // rather than emitting events. Build a lightweight per-author roll-up from what
  // does fire: machine_signal, user_feedback. The ground truth for sessions is
  // protocol_calls.
  const authorStats: Record<string, {
    signals: number;
    feedback: number;
    last_seen: string;
    platforms: Set<string>;
  }> = {};
  for (const e of events) {
    const author = e.author;
    if (!author) continue;
    if (e.t < METRICS_EPOCH) continue;
    if (isSmoke(e.event) || isSmoke(e.platform)) continue;
    if (!authorStats[author]) {
      authorStats[author] = { signals: 0, feedback: 0, last_seen: e.t, platforms: new Set() };
    }
    const stat = authorStats[author];
    if (e.e === 'machine_signal') stat.signals++;
    if (e.e === 'user_feedback') stat.feedback++;
    if (e.t > stat.last_seen) stat.last_seen = e.t;
    if (e.platform) stat.platforms.add(e.platform);
  }

  const users = Object.entries(authorStats).map(([login, stat]) => ({
    login,
    signals: stat.signals,
    feedback: stat.feedback,
    last_seen: formatPT(stat.last_seen),
    hours_ago: Math.round((Date.now() - new Date(stat.last_seen).getTime()) / (1000 * 60 * 60) * 10) / 10,
    platforms: [...stat.platforms],
  })).sort((a, b) => a.hours_ago - b.hours_ago);

  const verification = {
    active_authors: users.length,
  };

  const invariantIssues: string[] = [];
  if (serverErrors24h.length > 5) invariantIssues.push(`server_errors_24h=${serverErrors24h.length}`);

  const status = invariantIssues.length > 0
    ? `degraded — ${invariantIssues.join(', ')}`
    : 'ok';

  return {
    status,
    invariant_issues: invariantIssues,
    time_range: { first: formatPT(firstEvent), last: formatPT(lastEvent), hours_since_last: hoursSinceLastEvent },
    telemetry_health: {
      stale,
      parse_errors: parseErrors,
      message: stale
        ? 'no events for 24+ hours, possible silent connector failure'
        : parseErrors > 0
          ? `${parseErrors} corrupted log lines skipped`
          : 'ok',
    },
    cron: cronStatus,
    users,
    total_events: events.length,
    parse_errors: parseErrors,
    errors: { log_parse_errors: parseErrors },
    runtime: {
      server_errors_24h: serverErrors24h.length,
      not_found_24h: notFound24h.length,
      top_not_found_paths: topNotFoundPaths,
    },
    verification,
    library: await getLibraryMetrics(events),
    marketplace: await getMarketplaceStatus(events),
    _events: events,
  };
}

/**
 * Marketplace status — is the cross-Author learning loop working?
 * Signals are relayed to alexandria-signal github repo. Liveness =
 * the repo's pushedAt timestamp (advances on every relay or factory drain).
 */
async function getMarketplaceStatus(events: Record<string, string>[]): Promise<Record<string, unknown>> {
  const signalEvents = events.filter(e => e.e === 'machine_signal');
  const signalsThisWeek = signalEvents.filter(e =>
    Date.now() - new Date(e.t).getTime() < 7 * 24 * 60 * 60 * 1000
  ).length;

  let lastPushedAt: string | null = null;
  try {
    const token = process.env.GITHUB_BOT_TOKEN;
    if (token) {
      const resp = await fetch('https://api.github.com/repos/mowinckelb/alexandria-signal', {
        headers: { Authorization: `Bearer ${token}`, 'User-Agent': 'alexandria-server' },
      });
      if (resp.ok) {
        const data = await resp.json() as { pushed_at: string };
        lastPushedAt = data.pushed_at;
      }
    }
  } catch { /* non-fatal */ }

  return {
    status: signalsThisWeek > 0 ? 'ok' : 'no signal this week',
    signals_this_week: signalsThisWeek,
    marketplace_repo_last_push: lastPushedAt,
  };
}

/**
 * Library metrics — pulled from D1 (structured) + event log (signal).
 */
async function getLibraryMetrics(events: Record<string, string>[]): Promise<Record<string, unknown>> {
  // Event-based metrics (from JSONL log)
  const libraryEvents = events.filter(e => e.e?.startsWith('library_'));
  const shadowViews = libraryEvents.filter(e => e.e === 'library_shadow_view').length;
  const pulseViews = libraryEvents.filter(e => e.e === 'library_pulse_view').length;
  const quizzesTaken = libraryEvents.filter(e => e.e === 'library_quiz_taken').length;
  const workViews = libraryEvents.filter(e => e.e === 'library_work_view').length;
  const paidAccess = libraryEvents.filter(e => e.e === 'library_paid_access').length;
  const publishes = libraryEvents.filter(e => e.e === 'library_publish_shadow').length;
  const purchases = libraryEvents.filter(e => e.e === 'library_purchase').length;

  // D1 metrics (if available)
  let d1Metrics: Record<string, unknown> = {};
  try {
    const db = getDB();
    const counts = await db.prepare(`
      SELECT
        (SELECT COUNT(*) FROM authors) as total_authors,
        (SELECT COUNT(*) FROM shadows) as total_shadows,
        (SELECT COUNT(*) FROM quizzes WHERE active = 1) as total_quizzes,
        (SELECT COUNT(*) FROM works) as total_works,
        (SELECT COUNT(*) FROM quiz_results) as total_quiz_completions,
        (SELECT COUNT(*) FROM referrals) as total_referrals
    `).first();
    if (counts) d1Metrics = counts as Record<string, unknown>;
  } catch {
    // D1 not available — ok, just return event-based metrics
  }

  // RL signal health — is the Library feedback loop working?
  let rlSignal: Record<string, unknown> = {};
  try {
    const db = getDB();
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // How many access_log entries have meta (enriched signal vs bare events)
    const metaStats = await db.prepare(`
      SELECT
        COUNT(*) as total_events,
        COUNT(meta) as events_with_meta,
        COUNT(DISTINCT author_id) as active_authors,
        COUNT(DISTINCT event) as event_types
      FROM access_log WHERE created_at > ?
    `).bind(thirtyDaysAgo).first();

    // Publish → engagement ratio per author (are published artifacts getting seen?)
    const publishCount = await db.prepare(
      `SELECT COUNT(*) as c FROM access_log WHERE event LIKE 'publish_%' AND created_at > ?`
    ).bind(thirtyDaysAgo).first<{ c: number }>();
    const engagementCount = await db.prepare(
      `SELECT COUNT(*) as c FROM access_log WHERE event NOT LIKE 'publish_%' AND created_at > ?`
    ).bind(thirtyDaysAgo).first<{ c: number }>();

    rlSignal = {
      status: (metaStats as any)?.total_events > 0 ? 'active' : 'no signal',
      last_30d: metaStats || {},
      publish_to_engagement_ratio: publishCount?.c && engagementCount?.c
        ? `${publishCount.c} publishes → ${engagementCount.c} engagements`
        : 'no data',
    };
  } catch {
    rlSignal = { status: 'd1 unavailable' };
  }

  return {
    events: { shadow_views: shadowViews, pulse_views: pulseViews, quizzes_taken: quizzesTaken, work_views: workViews, paid_access: paidAccess, publishes, purchases },
    rl_signal: rlSignal,
    ...d1Metrics,
  };
}

/**
 * Per-user event history — drill into a specific author's sessions and errors.
 */
export async function getUserEvents(login: string): Promise<Record<string, unknown>> {
  const events: Record<string, string>[] = [];
  try {
    const raw = await getRecentDaysEvents(30);
    if (!raw) return { status: 'no data', author: login };
    const lines = raw.trim().split('\n').filter(Boolean);
    for (const line of lines) {
      try {
        const ev = JSON.parse(line);
        if (ev.author === login) events.push(ev);
      } catch { continue; }
    }
  } catch {
    return { status: 'no data', author: login };
  }

  const sessionEvents = events.filter(e => e.e === 'prosumer_session');
  const feedback = events.filter(e => e.e === 'user_feedback');
  const signals = events.filter(e => e.e === 'machine_signal');
  const lastSession = sessionEvents.length > 0 ? sessionEvents[sessionEvents.length - 1] : null;

  return {
    author: login,
    total_events: events.length,
    sessions: {
      last: lastSession,
      platforms: [...new Set(sessionEvents.map(s => s.platform).filter(Boolean))],
    },
    feedback: feedback.slice(-10),
    machine_signals: signals.length,
    recent_events: events.slice(-20),
  };
}

// Signals + feedback are relayed straight to alexandria-signal github repo
// (no KV storage). Factory drains by deleting files in that repo.
