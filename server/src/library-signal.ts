/**
 * Library RL signal — funnel/engagement aggregate for the factory.
 *
 * The factory autoloop reads this as one of its three inputs (alongside
 * marketplace signals and feedback). It used to be exposed as an HTTP
 * endpoint but the factory agent can't reach mcp.mowinckel.ai/admin/*,
 * so we publish a daily snapshot to alexandria-signal github repo
 * instead — read-via-gh, drained-on-overwrite (one file, not per-day).
 */
import { getDB } from './db.js';

export async function computeLibrarySignalText(days = 30): Promise<string> {
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  const db = getDB();

  const [publishEvents, engagementEvents, quizOutcomes, referrals, protocolFiles, moduleUsage, funnelCounts] = await Promise.all([
    db.prepare(
      `SELECT author_id, event, meta, created_at FROM access_log
       WHERE event LIKE 'publish_%' AND created_at > ? ORDER BY created_at`
    ).bind(since).all(),
    db.prepare(
      `SELECT author_id, event, COUNT(*) as count FROM access_log
       WHERE event NOT LIKE 'publish_%' AND created_at > ?
       GROUP BY author_id, event ORDER BY count DESC`
    ).bind(since).all(),
    db.prepare(
      `SELECT q.author_id, qr.quiz_id, qr.score_pct, qr.taken_at
       FROM quiz_results qr
       JOIN quizzes q ON qr.quiz_id = q.id
       WHERE qr.taken_at > ?
       ORDER BY qr.taken_at`
    ).bind(since).all(),
    db.prepare(
      `SELECT author_id, source_type, COUNT(*) as count FROM referrals
       WHERE created_at > ? GROUP BY author_id, source_type`
    ).bind(since).all(),
    db.prepare(
      `SELECT account_id, name, visibility, updated_at FROM protocol_files
       WHERE updated_at > ? ORDER BY updated_at`
    ).bind(since).all(),
    db.prepare(
      `SELECT module_id, COUNT(*) as count, COUNT(DISTINCT account_id) as accounts
       FROM protocol_calls WHERE time > ?
       GROUP BY module_id ORDER BY accounts DESC, count DESC LIMIT 100`
    ).bind(since).all(),
    db.prepare(
      `SELECT event, COUNT(*) as count, COUNT(DISTINCT author_id) as authors,
              COUNT(DISTINCT accessor_id) as unique_accessors
       FROM access_log WHERE created_at > ?
       GROUP BY event ORDER BY count DESC`
    ).bind(since).all(),
  ]);

  const lines: string[] = [
    `# Library RL Signal — last ${days} days (since ${since.slice(0, 10)})`,
    '',
    '## Funnel Overview',
  ];

  for (const row of (funnelCounts.results || []) as Array<{ event: string; count: number; authors: number; unique_accessors: number }>) {
    lines.push(`- ${row.event}: ${row.count} events, ${row.authors} authors, ${row.unique_accessors} unique accessors`);
  }

  const authorPublishes: Record<string, Array<{ event: string; meta: string | null; at: string }>> = {};
  for (const row of (publishEvents.results || []) as Array<{ author_id: string; event: string; meta: string | null; created_at: string }>) {
    if (!authorPublishes[row.author_id]) authorPublishes[row.author_id] = [];
    authorPublishes[row.author_id].push({ event: row.event, meta: row.meta, at: row.created_at });
  }

  const authorEngagement: Record<string, Record<string, number>> = {};
  for (const row of (engagementEvents.results || []) as Array<{ author_id: string; event: string; count: number }>) {
    if (!authorEngagement[row.author_id]) authorEngagement[row.author_id] = {};
    authorEngagement[row.author_id][row.event] = row.count;
  }

  const allAuthors = new Set([...Object.keys(authorPublishes), ...Object.keys(authorEngagement)]);
  if (allAuthors.size > 0) {
    lines.push('', '## Per-Author Signal');
    for (const author of allAuthors) {
      lines.push('', `### ${author}`);
      const pubs = authorPublishes[author] || [];
      if (pubs.length > 0) {
        lines.push('Published:');
        for (const p of pubs) {
          const meta = p.meta ? ` — ${p.meta}` : '';
          lines.push(`  ${p.event} at ${p.at}${meta}`);
        }
      }
      const eng = authorEngagement[author] || {};
      if (Object.keys(eng).length > 0) {
        lines.push('Engagement received:');
        for (const [event, count] of Object.entries(eng)) {
          lines.push(`  ${event}: ${count}`);
        }
      }
    }
  }

  const pfiles = (protocolFiles.results || []) as Array<{ account_id: string; name: string; visibility: string; updated_at: string }>;
  if (pfiles.length > 0) {
    lines.push('', '## Protocol Files Published');
    for (const f of pfiles.slice(-200)) {
      lines.push(`- account ${f.account_id}: ${f.name} (${f.visibility}) at ${f.updated_at}`);
    }
  }

  const modules = (moduleUsage.results || []) as Array<{ module_id: string; count: number; accounts: number }>;
  if (modules.length > 0) {
    lines.push('', '## Module Usage Signal');
    for (const m of modules) {
      lines.push(`- ${m.module_id}: ${m.accounts} accounts, ${m.count} calls`);
    }
  }

  const quizResults = (quizOutcomes.results || []) as Array<{ author_id: string; quiz_id: string; score_pct: number }>;
  if (quizResults.length > 0) {
    lines.push('', '## Quiz Score Distribution');
    const byQuiz: Record<string, number[]> = {};
    for (const r of quizResults) {
      const key = `${r.author_id}/${r.quiz_id}`;
      if (!byQuiz[key]) byQuiz[key] = [];
      byQuiz[key].push(r.score_pct);
    }
    for (const [key, scores] of Object.entries(byQuiz)) {
      const avg = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
      const min = Math.min(...scores);
      const max = Math.max(...scores);
      lines.push(`- ${key}: ${scores.length} takes, avg ${avg}%, range ${min}-${max}%`);
    }
  }

  const refs = (referrals.results || []) as Array<{ author_id: string; source_type: string; count: number }>;
  if (refs.length > 0) {
    lines.push('', '## Referral Conversions');
    for (const r of refs) {
      lines.push(`- ${r.author_id}: ${r.count} via ${r.source_type}`);
    }
  }

  lines.push('', '---', 'Raw structural signal. No content. The marketplace interprets patterns and updates canon defaults.');

  return lines.join('\n').slice(0, 50000);
}
