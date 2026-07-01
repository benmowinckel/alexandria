/** Cron jobs — health digest. Called by worker scheduled handler. */

import { getKV, getRecentDaysEvents, loadAccounts, saveAccount, setAuthIndex } from './kv.js';
import { getDB } from './db.js';
import { sendEmail, sendEmailsBatched, sendWeekOneCheckIn, sendInstallNudge, sendOnboardFollowup, FOUNDER_EMAIL } from './email.js';
import { generateApiKey } from './accounts.js';
import { hashApiKey, generateToken } from './crypto.js';
import { formatPT } from './time.js';
import { publishLibrarySignalSnapshot } from './marketplace.js';
import { computeLibrarySignalText } from './library-signal.js';
import { reconcilePatronSubscriptions, syncStripeWebhookEvents } from './billing.js';
import type { AccountStore, Account } from './auth.js';

// ---------------------------------------------------------------------------
// Health digest — self-heal, only email the founder if he needs to log on
// ---------------------------------------------------------------------------

type Urgency = 'sprint' | 'stroll';
type Escalate = (u: Urgency, reason: string) => void;

/**
 * D1 health probe + schema/invariant checks. Extracted from runHealthDigest
 * because it's the longest subsection (multiple independent D1 queries) and
 * benefits most from being a named unit.
 */
async function probeD1(escalate: Escalate): Promise<void> {
  try {
    const db = (globalThis as any).__d1 as D1Database | undefined;
    if (!db) {
      escalate('sprint', 'D1 not bound');
      return;
    }
    await db.prepare('SELECT 1').first();

    // Schema verification — expected tables must exist
    const expectedTables = ['authors', 'shadows', 'quizzes', 'works', 'quiz_results', 'referrals', 'access_log', 'billing_tab', 'waitlist', 'stripe_webhook_events', 'protocol_files', 'protocol_calls', 'patron_subscriptions'];
    const { results: tables } = await db.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table'`
    ).all<{ name: string }>();
    const tableNames = new Set((tables || []).map(t => t.name));
    const missing = expectedTables.filter(t => !tableNames.has(t));
    if (missing.length > 0) escalate('sprint', `D1 missing tables: ${missing.join(', ')}`);

    // Billing invariant: no duplicate unsettled rows for the same artifact-month key.
    const duplicateRows = await db.prepare(
      `SELECT COUNT(*) as c
       FROM (
         SELECT accessor_id, author_id, artifact_type, artifact_id, month
         FROM billing_tab
         WHERE settled = 0 AND artifact_id != ''
         GROUP BY accessor_id, author_id, artifact_type, artifact_id, month
         HAVING COUNT(*) > 1
       )`
    ).first<{ c: number }>();
    if ((duplicateRows?.c || 0) > 0) escalate('sprint', `D1 billing duplicate unsettled rows: ${duplicateRows?.c}`);

    // Verification substrate present.
    const billingIndex = await db.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'index' AND name = 'idx_tab_unique_unsettled_artifact'`
    ).first<{ name: string }>();
    if (!billingIndex) escalate('stroll', 'D1 missing billing uniqueness index');

    const webhookTable = await db.prepare(
      `SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'stripe_webhook_events'`
    ).first<{ name: string }>();
    if (!webhookTable) escalate('stroll', 'D1 missing stripe_webhook_events table');
  } catch (e) {
    escalate('sprint', `D1 probe failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

export interface EventScanResult {
  serverErrors: number;
  deprecatedHits: number;
  staleClientCalls: number;
  setupFailures: number;
  followCheckoutFailed: number;
  deprecatedByPath: Map<string, number>;
  clientVersions: Map<string, number>;
  setupFailuresByStatus: Map<string, number>;
  /** Author charges in the last 24h with no matching kin_prebill_warning_sent
   *  in the prior 14 days. Mirror for the pre-bill warning loop — without it,
   *  "user got charged without warning" is a silent failure (the user just
   *  emails support). Cutoff drives "last 24h"; the 14-day lookback is fixed
   *  because the warning is structurally a 7-day-ahead notice. */
  paidWithoutWarning: { github_login: string; amount_cents: number; note?: string }[];
}

/**
 * Pure function: scan a JSONL event log for events that feed alarms.
 * Extracted from runHealthDigest so the counter logic is testable in
 * isolation — see server/test/cron-scanner.ts. Malformed lines are
 * skipped silently (logs can contain partial writes); events outside
 * [cutoff, now] are ignored.
 *
 * The paid-without-warning mirror needs a wider window than `cutoff` (which is
 * the 24h freshness boundary) — warnings fire 7 days before the charge, so we
 * accept warnings going back 14 days from each charge regardless of cutoff.
 */
export function scanEventsForAlarms(rawLog: string, cutoff: number): EventScanResult {
  const r: EventScanResult = {
    serverErrors: 0,
    deprecatedHits: 0,
    staleClientCalls: 0,
    setupFailures: 0,
    followCheckoutFailed: 0,
    deprecatedByPath: new Map(),
    clientVersions: new Map(),
    setupFailuresByStatus: new Map(),
    paidWithoutWarning: [],
  };
  // Buckets for the paid-without-warning correlation. Collect across the
  // whole log (no cutoff), then filter at the end.
  const warningTimes = new Map<string, number[]>(); // github_login → timestamps
  const warningSkips = new Map<string, string>(); // github_login → skip reason
  const recentPaidCharges: { github_login: string; t: number; amount_cents: number }[] = [];

  for (const line of rawLog.split('\n')) {
    if (!line) continue;
    try {
      const ev = JSON.parse(line);
      const tEv = new Date(ev.t).getTime();

      // Charge-without-warning correlation — collect across the full log,
      // not just the cutoff window, so 7-day-old warnings can cover 1-day-old
      // charges.
      if (ev.e === 'kin_prebill_warning_sent') {
        const login = (ev.github_login as string) || '';
        if (login) {
          if (!warningTimes.has(login)) warningTimes.set(login, []);
          warningTimes.get(login)!.push(tEv);
        }
        continue;
      }
      if (ev.e === 'kin_prebill_warning_skipped') {
        // Warning path declined with a reason (e.g. no_email). Carried into
        // the alarm line so an unwarned charge names its cause instead of
        // reading as a mystery.
        const login = (ev.github_login as string) || '';
        if (login) warningSkips.set(login, (ev.reason as string) || 'unknown');
        continue;
      }
      if (ev.e === 'billing_invoice_paid' && tEv >= cutoff) {
        // First checkout invoices (billing_reason=subscription_create) are the
        // user consciously paying right now — no warning owed. Renewals and
        // trial conversions (subscription_cycle) stay alarmed. Events from
        // before billing_reason was logged have it undefined → stay alarmed.
        if ((ev.billing_reason as string) === 'subscription_create') continue;
        const amount = parseInt((ev.amount_cents as string) || '0', 10);
        if (amount > 0) {
          recentPaidCharges.push({
            github_login: (ev.github_login as string) || '',
            t: tEv,
            amount_cents: amount,
          });
        }
        continue;
      }

      // Existing 24h-bounded counters
      if (tEv < cutoff) continue;
      if (ev.e === 'server_error') r.serverErrors++;
      else if (ev.e === 'deprecated_hit') {
        // CI smoke fires hits every 6h to verify the alarm path. Skip those —
        // they're verification noise, not real stuck installs.
        if (ev.smoke === 'true') continue;
        r.deprecatedHits++;
        const p = ev.path || '(unknown)';
        r.deprecatedByPath.set(p, (r.deprecatedByPath.get(p) || 0) + 1);
      } else if (ev.e === 'client_version_seen') {
        const v = ev.version || 'unset';
        r.clientVersions.set(v, (r.clientVersions.get(v) || 0) + 1);
        // Only the bash shim path is upgradeable from our side. Native MCP clients
        // (Claude Desktop/web) legitimately don't set X-Alexandria-Client.
        if (v === 'unset' || v === 'unset-curl') r.staleClientCalls++;
      } else if (ev.e === 'setup_report') {
        const status = ev.status || 'unknown';
        if (status !== 'ok') {
          r.setupFailures++;
          r.setupFailuresByStatus.set(status, (r.setupFailuresByStatus.get(status) || 0) + 1);
        }
      } else if (ev.e === 'follow_subscription_checkout_failed') {
        r.followCheckoutFailed++;
      }
    } catch { continue; }
  }

  // Resolve paid-without-warning: a charge is "warned" if any warning fired
  // for that github_login within 14 days before the charge.
  const fourteenDaysMs = 14 * 24 * 60 * 60 * 1000;
  for (const charge of recentPaidCharges) {
    const warns = warningTimes.get(charge.github_login) || [];
    const warned = warns.some(wt => wt < charge.t && wt >= charge.t - fourteenDaysMs);
    if (!warned) {
      const note = warningSkips.get(charge.github_login);
      r.paidWithoutWarning.push({
        github_login: charge.github_login,
        amount_cents: charge.amount_cents,
        ...(note ? { note: `warning skipped: ${note}` } : {}),
      });
    }
  }

  return r;
}

export async function runHealthDigest(opts: { sendEmailOnAlarm?: boolean } = { sendEmailOnAlarm: true }): Promise<void> {
  try {
    const kv = getKV();
    const issues: string[] = [];
    let urgency: Urgency | null = null;
    const escalate = (u: Urgency, reason: string) => {
      issues.push(`[${u}] ${reason}`);
      if (!urgency || u === 'sprint') urgency = u;
    };

    // --- Self-healing probes ---

    // KV
    try {
      const page = await kv.list({ prefix: 'account:' });
      if (page.keys.length === 0) {
        escalate('sprint', 'KV: zero accounts');
      }
    } catch (e) {
      escalate('sprint', `KV read failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    await probeD1(escalate);

    // R2 — Library content storage
    try {
      const r2 = (globalThis as any).__r2 as R2Bucket | undefined;
      if (!r2) {
        escalate('sprint', 'R2 not bound — Library content inaccessible');
      } else {
        // head() returns null for missing keys, throws only on binding failure
        await r2.head('.health-probe');
      }
    } catch (e) {
      escalate('sprint', `R2 probe failed: ${e instanceof Error ? e.message : String(e)}`);
    }

    // Canon now served from GitHub, not from this server. No KV cache to verify.

    // Event log analysis — delegate to the pure scanEventsForAlarms helper
    // (testable in isolation, see server/test/cron-scanner.ts). Test-tag
    // filtering stays here because drift semantics may evolve independently.
    // 15-day lookback because the paid-without-warning mirror needs to see
    // warnings up to 14 days before a charge; the other counters apply their
    // own 24h cutoff inside the scanner.
    try {
      const raw = await getRecentDaysEvents(15);
      if (raw) {
        const cutoff = Date.now() - 24 * 60 * 60 * 1000;
        const scan = scanEventsForAlarms(raw, cutoff);
        if (scan.serverErrors > 0) escalate('stroll', `${scan.serverErrors} server errors in 24h`);
        // deprecatedHits / staleClientCalls / stale-payload version drift
        // intentionally don't escalate. The shim self-updates payload from
        // GitHub on every session-start; "stuck" client versions resolve on
        // their own when the user next opens Claude Code. Counts still flow
        // into the cached digest marker for /analytics/dashboard visibility.
        if (scan.setupFailures > 0) {
          const dist = [...scan.setupFailuresByStatus.entries()].sort((a, b) => b[1] - a[1]).map(([s, n]) => `${s}=${n}`).join(', ');
          escalate('stroll', `${scan.setupFailures} setup reports with non-ok status in 24h (${dist})`);
        }
        if (scan.followCheckoutFailed > 0) {
          escalate('stroll', `${scan.followCheckoutFailed} patron checkout failures in 24h — Stripe down or misconfigured`);
        }
        if (scan.paidWithoutWarning.length > 0) {
          const summary = scan.paidWithoutWarning
            .map(p => `${p.github_login || '<unknown>'}=$${(p.amount_cents / 100).toFixed(2)}${p.note ? ` (${p.note})` : ''}`)
            .join(', ');
          escalate('sprint', `${scan.paidWithoutWarning.length} author charge(s) in 24h with no prior 7-day warning: ${summary}`);
        }
      }
    } catch { /* non-fatal */ }

    // Route probes removed — Workers can't reliably self-fetch during cron (522 errors).
    // Infrastructure is verified directly above (KV, D1, R2, env vars).
    // External route verification is handled by GitHub Actions smoke test (every 6 hours).

    // Resend (email delivery)
    try {
      if (!process.env.RESEND_API_KEY) {
        escalate('stroll', 'RESEND_API_KEY not set — email delivery broken');
      }
    } catch { /* non-fatal */ }

    // Env var completeness
    try {
      const required = ['ENCRYPTION_KEY', 'STRIPE_WEBHOOK_SECRET', 'GITHUB_CLIENT_ID', 'GITHUB_CLIENT_SECRET', 'STRIPE_SECRET_KEY', 'RESEND_API_KEY'];
      const missing = required.filter(k => !process.env[k]);
      if (missing.length > 0) escalate('sprint', `Missing env vars: ${missing.join(', ')}`);
    } catch { /* non-fatal */ }

    // Refresh the library-signal snapshot in KV. Daily refresh; founder reads
    // on weekly run. Non-fatal if it fails — just logged, no escalate (the
    // factory will see a stale snapshot but other signals still flow).
    try {
      const text = await computeLibrarySignalText(30);
      await publishLibrarySignalSnapshot(text);
    } catch (err) {
      console.error('[cron] library-signal snapshot failed:', err);
    }

    // Patron subscription reconcile — Stripe is source of truth, patron_subscriptions is index.
    // Self-healing: drift gets corrected without alarm. Only alarm if reconcile itself fails.
    try {
      await reconcilePatronSubscriptions();
    } catch (err) {
      escalate('stroll', `patron reconcile failed: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Stripe webhook enabled_events ↔ billing.ts HANDLED_EVENTS drift check.
    // Self-healing: auto-corrects on detection, strolls so the fix is visible.
    await syncStripeWebhookEvents(escalate);

    // Cron marker (proves the job ran — includes issue list for debugging)
    try {
      await kv.put('cron:health_digest', JSON.stringify({
        t: new Date().toISOString(),
        urgency,
        issues: issues.length > 0 ? issues : undefined,
      }), { expirationTtl: 30 * 24 * 60 * 60 });
    } catch { /* non-fatal */ }

    if (!urgency) return;
    if (opts.sendEmailOnAlarm === false) return;

    // Subject carries urgency; body carries the issue list. Awareness axiom:
    // a notification without actionable content is just a notification.
    const body = `<div style="font-family:'EB Garamond',Georgia,serif;max-width:520px;margin:0 auto;padding:40px 20px;color:#3d3630;">` +
      `<p style="margin:0 0 1rem;font-size:0.85rem;opacity:0.5">` + formatPT(new Date()) + `</p>` +
      issues.map(i => `<p style="margin:0 0 0.5rem;line-height:1.5;">${i.replace(/&/g, '&amp;').replace(/</g, '&lt;')}</p>`).join('') +
      `<p style="margin:2rem 0 0;font-size:0.75rem;opacity:0.4"><a href="https://api.alexandria-library.com/analytics/dashboard" style="color:#8a8078">dashboard</a></p>` +
      `</div>`;
    await sendEmail(FOUNDER_EMAIL, `alexandria. — ${urgency}`, body);
  } catch (err) {
    console.error('Health digest failed:', err);
  }
}

// ---------------------------------------------------------------------------
// Week-1 check-in — delayed welcome to active users at signup_at + 7d.
// One-shot per user (idempotent via week_one_email_sent_at). Surfaces the
// patron slider as the upside-capture path.
// ---------------------------------------------------------------------------

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

export async function runWeekOneCheckIns(
  opts: { dry?: boolean } = {},
): Promise<{ candidates: number; sent: number; failed: number; dry: boolean }> {
  const dry = opts.dry === true;
  try {
    const accounts = await loadAccounts<AccountStore>();
    const now = Date.now();
    const recipients: { key: string; account: Account }[] = [];
    for (const [key, acct] of Object.entries(accounts)) {
      if (!acct.email) continue;
      if (acct.engagement_opt_out) continue;
      if (acct.week_one_email_sent_at) continue;
      if (acct.subscription_status !== 'active' && acct.subscription_status !== 'beta' && acct.subscription_status !== 'trialing' && acct.subscription_status !== 'free') continue;
      if (!acct.installed_at) continue;
      if (!acct.created_at) continue;
      const age = now - new Date(acct.created_at).getTime();
      if (age < WEEK_MS) continue;
      // Upper bound: skip users older than 14d. Cron has 7-day window to catch
      // each cohort; outside it, "you signed up a week ago" stops being true.
      // Backfills (existing users past the window at deploy time) don't get this.
      if (age > 2 * WEEK_MS) continue;
      recipients.push({ key, account: acct });
    }

    if (dry) return { candidates: recipients.length, sent: 0, failed: 0, dry: true };
    if (recipients.length === 0) return { candidates: 0, sent: 0, failed: 0, dry: false };

    const { sent, failed } = await sendEmailsBatched(recipients, async ({ key, account }) => {
      const result = await sendWeekOneCheckIn(account.email, account.email_token);
      if (result.ok) {
        account.week_one_email_sent_at = new Date().toISOString();
        await saveAccount(key, account as unknown as Record<string, unknown>);
      }
      return result;
    });

    console.log(`[cron] week-1 check-in: sent=${sent} failed=${failed} total=${recipients.length}`);
    return { candidates: recipients.length, sent, failed, dry: false };
  } catch (err) {
    console.error('[cron] week-1 check-in failed:', err);
    return { candidates: 0, sent: 0, failed: 0, dry };
  }
}

// ---------------------------------------------------------------------------
// Install nudge — daily reminder to mobile-only signups (no installed_at) to
// finish setup on a computer. Stops once they install or after 7d. Symmetric
// to the week-one check-in: that one runs AFTER install, this runs BEFORE.
// Mirror: install_nudge_count tracks how many they got; installed_after_nudge
// gets set in protocol.ts when /call fires, enabling conversion-rate query.
// ---------------------------------------------------------------------------

const DAY_MS = 24 * 60 * 60 * 1000;

export async function runInstallNudges(
  opts: { dry?: boolean } = {},
): Promise<{ candidates: number; sent: number; failed: number; dry: boolean }> {
  const dry = opts.dry === true;
  try {
    const accounts = await loadAccounts<AccountStore>();
    const now = Date.now();
    const today = new Date().toISOString().slice(0, 10);
    const recipients: { key: string; account: Account }[] = [];
    for (const [key, acct] of Object.entries(accounts)) {
      if (!acct.email) continue;
      if (acct.engagement_opt_out) continue;
      if (acct.installed_at) continue;
      if (acct.subscription_status !== 'active' && acct.subscription_status !== 'beta' && acct.subscription_status !== 'trialing' && acct.subscription_status !== 'free') continue;
      if (!acct.created_at) continue;
      const age = now - new Date(acct.created_at).getTime();
      if (age < DAY_MS) continue;
      if (age > 7 * DAY_MS) continue;
      if (acct.install_nudge_last_sent_at?.slice(0, 10) === today) continue;
      recipients.push({ key, account: acct });
    }

    if (dry) return { candidates: recipients.length, sent: 0, failed: 0, dry: true };
    if (recipients.length === 0) return { candidates: 0, sent: 0, failed: 0, dry: false };

    const { sent, failed } = await sendEmailsBatched(recipients, async ({ key, account }) => {
      // Regenerate api_key per nudge (we don't store plaintext; this is how
      // the install page surfaces a runnable curl). Capture the previous hash
      // so setAuthIndex can rotate it out — without rotation, every nudge
      // would leave the prior key permanently valid, and any compromised
      // nudge email would grant access for the lifetime of the account.
      const previousHash = (account.api_key_hash as string | undefined) || null;
      const apiKey = generateApiKey();
      const apiKeyHash = hashApiKey(apiKey);
      account.api_key_hash = apiKeyHash;
      // Install token — magic link in the email maps to {api_key, login} so
      // /install/:token can render the onboarding page without OAuth. 14d TTL.
      const installToken = generateToken();
      await getKV().put(
        `install:${installToken}`,
        JSON.stringify({ api_key: apiKey, github_login: account.github_login }),
        { expirationTtl: 14 * 24 * 60 * 60 },
      );
      const result = await sendInstallNudge(account.email, account.email_token, installToken, account.github_login);
      if (result.ok) {
        await setAuthIndex(apiKeyHash, key, previousHash);
        account.install_nudge_last_sent_at = new Date().toISOString();
        account.install_nudge_count = (account.install_nudge_count || 0) + 1;
        await saveAccount(key, account as unknown as Record<string, unknown>);
      }
      return result;
    });

    console.log(`[cron] install nudges: sent=${sent} failed=${failed} total=${recipients.length}`);

    // Cron marker (proves the job ran). Awareness axiom — without this a
    // silent failure stays silent. 30d TTL matches health-digest pattern.
    try {
      await getKV().put('cron:install_nudges', JSON.stringify({
        t: new Date().toISOString(),
        candidates: recipients.length,
        sent,
        failed,
      }), { expirationTtl: 30 * 24 * 60 * 60 });
    } catch { /* non-fatal */ }

    return { candidates: recipients.length, sent, failed, dry: false };
  } catch (err) {
    console.error('[cron] install nudges failed:', err);
    return { candidates: 0, sent: 0, failed: 0, dry };
  }
}

// ---------------------------------------------------------------------------
// Onboard follow-ups — for mobile "send it to my computer" captures (keyless,
// no account; KV `onboard:` records written by POST /onboard). The user
// explicitly asked us to email them the install command; this finishes that
// delivery: first nudge at 2d, second and last at 5d, then silence. Stops the
// moment the tokenized command is run (GET /a/:token sets installed_at) or
// the waitlist unsubscribe fires.
// ---------------------------------------------------------------------------

interface OnboardCandidate {
  token: string;
  record: {
    email: string;
    unsubscribe_token: string;
    created_at: string;
    installed_at?: string;
    followups?: number;
    followup_last_sent_at?: string;
  };
}

const ONBOARD_FOLLOWUP_TTL = 90 * 24 * 60 * 60;

export async function runOnboardFollowups(
  opts: { dry?: boolean } = {},
): Promise<{ candidates: number; sent: number; failed: number; dry: boolean }> {
  const dry = opts.dry === true;
  try {
    const kv = getKV();
    const now = Date.now();

    // Full scan of onboard records (prefix excludes the onboard_email: index —
    // underscore ≠ colon). Volume is capture-scale, not account-scale.
    const candidates: OnboardCandidate[] = [];
    let cursor: string | undefined;
    do {
      const page = await kv.list({ prefix: 'onboard:', cursor });
      for (const key of page.keys) {
        const raw = await kv.get(key.name);
        if (!raw) continue;
        let record: OnboardCandidate['record'];
        try { record = JSON.parse(raw); } catch { continue; }
        if (!record.email || record.installed_at) continue;
        const followups = record.followups || 0;
        if (followups >= 2) continue;
        const age = now - new Date(record.created_at).getTime();
        // First nudge at 2d, second at 5d; nothing past 14d (a capture that
        // old is a decision, not a lapse).
        const due = followups === 0 ? 2 * DAY_MS : 5 * DAY_MS;
        if (age < due || age > 14 * DAY_MS) continue;
        // At least 2d between the two nudges even if the cron lagged.
        if (record.followup_last_sent_at && now - new Date(record.followup_last_sent_at).getTime() < 2 * DAY_MS) continue;
        candidates.push({ token: key.name.slice('onboard:'.length), record });
      }
      cursor = page.list_complete ? undefined : page.cursor;
    } while (cursor);

    // Honor /email/stop — opted-out waitlist rows kill the sequence.
    const eligible: OnboardCandidate[] = [];
    for (const cand of candidates) {
      try {
        const row = await getDB().prepare(
          'SELECT opted_out_at FROM waitlist WHERE email = ? LIMIT 1'
        ).bind(cand.record.email).first<{ opted_out_at: string | null }>();
        if (row?.opted_out_at) continue;
      } catch { /* if the check fails, err on not sending */ continue; }
      eligible.push(cand);
    }

    if (dry) return { candidates: eligible.length, sent: 0, failed: 0, dry: true };
    if (eligible.length === 0) return { candidates: 0, sent: 0, failed: 0, dry: false };

    const { sent, failed } = await sendEmailsBatched(eligible, async ({ token, record }) => {
      const nth = (record.followups || 0) + 1;
      const result = await sendOnboardFollowup(record.email, token, record.unsubscribe_token, nth);
      if (result.ok) {
        record.followups = nth;
        record.followup_last_sent_at = new Date().toISOString();
        await kv.put(`onboard:${token}`, JSON.stringify(record), { expirationTtl: ONBOARD_FOLLOWUP_TTL });
      }
      return result;
    });

    console.log(`[cron] onboard follow-ups: sent=${sent} failed=${failed} total=${eligible.length}`);

    try {
      await kv.put('cron:onboard_followups', JSON.stringify({
        t: new Date().toISOString(),
        candidates: eligible.length,
        sent,
        failed,
      }), { expirationTtl: 30 * 24 * 60 * 60 });
    } catch { /* non-fatal */ }

    return { candidates: eligible.length, sent, failed, dry: false };
  } catch (err) {
    console.error('[cron] onboard follow-ups failed:', err);
    return { candidates: 0, sent: 0, failed: 0, dry };
  }
}
