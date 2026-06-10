/**
 * Unit tests for scanEventsForAlarms — pure function, no KV/D1/R2 deps.
 * Run: npx tsx server/test/cron-scanner.ts
 * No test framework needed; uses node:assert.
 */

import assert from 'node:assert';
import { scanEventsForAlarms } from '../src/cron.js';

const now = Date.now();
const inWindow = new Date(now - 60 * 1000).toISOString();            // 1 min ago
const outOfWindow = new Date(now - 25 * 60 * 60 * 1000).toISOString(); // 25h ago
const cutoff = now - 24 * 60 * 60 * 1000;

let passed = 0;
const test = (name: string, fn: () => void) => {
  fn();
  console.log(`  ✓ ${name}`);
  passed++;
};

test('counts each event type in window', () => {
  const log = [
    JSON.stringify({ t: inWindow, e: 'server_error' }),
    JSON.stringify({ t: inWindow, e: 'deprecated_hit', path: '/session' }),
    JSON.stringify({ t: inWindow, e: 'deprecated_hit', path: '/session' }),
    JSON.stringify({ t: inWindow, e: 'deprecated_hit', path: '/hooks/payload' }),
    JSON.stringify({ t: inWindow, e: 'client_version_seen', version: 'abc1234' }),
    JSON.stringify({ t: inWindow, e: 'client_version_seen', version: 'abc1234' }),
    JSON.stringify({ t: inWindow, e: 'client_version_seen', version: 'unset' }),
    JSON.stringify({ t: inWindow, e: 'setup_report', status: 'fetch_errors' }),
    JSON.stringify({ t: inWindow, e: 'setup_report', status: 'ok' }),
  ].join('\n');
  const r = scanEventsForAlarms(log, cutoff);
  assert.strictEqual(r.serverErrors, 1);
  assert.strictEqual(r.deprecatedHits, 3);
  assert.strictEqual(r.deprecatedByPath.get('/session'), 2);
  assert.strictEqual(r.deprecatedByPath.get('/hooks/payload'), 1);
  assert.strictEqual(r.staleClientCalls, 1);
  assert.strictEqual(r.clientVersions.get('abc1234'), 2);
  assert.strictEqual(r.clientVersions.get('unset'), 1);
  assert.strictEqual(r.setupFailures, 1);
  assert.strictEqual(r.setupFailuresByStatus.get('fetch_errors'), 1);
});

test('ignores events outside 24h cutoff', () => {
  const log = [
    JSON.stringify({ t: outOfWindow, e: 'server_error' }),
    JSON.stringify({ t: outOfWindow, e: 'deprecated_hit', path: '/old' }),
    JSON.stringify({ t: inWindow, e: 'server_error' }),
  ].join('\n');
  const r = scanEventsForAlarms(log, cutoff);
  assert.strictEqual(r.serverErrors, 1);
  assert.strictEqual(r.deprecatedHits, 0);
});

test('tolerates malformed JSON lines', () => {
  const log = [
    'not json at all',
    '{"broken',
    JSON.stringify({ t: inWindow, e: 'server_error' }),
    '',
    'another garbage line',
  ].join('\n');
  const r = scanEventsForAlarms(log, cutoff);
  assert.strictEqual(r.serverErrors, 1);
});

test('handles empty input', () => {
  const r = scanEventsForAlarms('', cutoff);
  assert.strictEqual(r.serverErrors, 0);
  assert.strictEqual(r.deprecatedHits, 0);
  assert.strictEqual(r.staleClientCalls, 0);
  assert.strictEqual(r.setupFailures, 0);
  assert.strictEqual(r.deprecatedByPath.size, 0);
  assert.strictEqual(r.clientVersions.size, 0);
  assert.strictEqual(r.setupFailuresByStatus.size, 0);
});

test('uses (unknown) when deprecated_hit has no path', () => {
  const log = JSON.stringify({ t: inWindow, e: 'deprecated_hit' });
  const r = scanEventsForAlarms(log, cutoff);
  assert.strictEqual(r.deprecatedByPath.get('(unknown)'), 1);
});

test('uses unset when client_version_seen has no version', () => {
  const log = JSON.stringify({ t: inWindow, e: 'client_version_seen' });
  const r = scanEventsForAlarms(log, cutoff);
  assert.strictEqual(r.clientVersions.get('unset'), 1);
  assert.strictEqual(r.staleClientCalls, 1);
});

test('skips smoke-tagged deprecated_hit events', () => {
  const log = [
    JSON.stringify({ t: inWindow, e: 'deprecated_hit', path: '/hooks/payload' }),
    JSON.stringify({ t: inWindow, e: 'deprecated_hit', path: '/hooks/payload', smoke: 'true' }),
    JSON.stringify({ t: inWindow, e: 'deprecated_hit', path: '/hooks/payload', smoke: 'true' }),
  ].join('\n');
  const r = scanEventsForAlarms(log, cutoff);
  assert.strictEqual(r.deprecatedHits, 1);
  assert.strictEqual(r.deprecatedByPath.get('/hooks/payload'), 1);
});

test('counts unset-curl as stale, unset-native as fine', () => {
  const log = [
    JSON.stringify({ t: inWindow, e: 'client_version_seen', version: 'unset-curl' }),
    JSON.stringify({ t: inWindow, e: 'client_version_seen', version: 'unset-curl' }),
    JSON.stringify({ t: inWindow, e: 'client_version_seen', version: 'unset-native' }),
    JSON.stringify({ t: inWindow, e: 'client_version_seen', version: 'unset-native' }),
    JSON.stringify({ t: inWindow, e: 'client_version_seen', version: 'unset-native' }),
  ].join('\n');
  const r = scanEventsForAlarms(log, cutoff);
  assert.strictEqual(r.staleClientCalls, 2);
  assert.strictEqual(r.clientVersions.get('unset-curl'), 2);
  assert.strictEqual(r.clientVersions.get('unset-native'), 3);
});

test('ignores unrelated event types without error', () => {
  const log = [
    JSON.stringify({ t: inWindow, e: 'waitlist_signup', type: 'author' }),
    JSON.stringify({ t: inWindow, e: 'morning_brief', author: 'mowinckelb' }),
    JSON.stringify({ t: inWindow, e: 'server_error' }),
  ].join('\n');
  const r = scanEventsForAlarms(log, cutoff);
  assert.strictEqual(r.serverErrors, 1);
  assert.strictEqual(r.deprecatedHits, 0);
  assert.strictEqual(r.clientVersions.size, 0);
});

test('treats missing setup_report status as unknown failure', () => {
  const log = JSON.stringify({ t: inWindow, e: 'setup_report' });
  const r = scanEventsForAlarms(log, cutoff);
  assert.strictEqual(r.setupFailures, 1);
  assert.strictEqual(r.setupFailuresByStatus.get('unknown'), 1);
});

// --- paid-without-warning mirror ---

const sixDaysAgo = new Date(now - 6 * 24 * 60 * 60 * 1000).toISOString();
const fifteenDaysAgo = new Date(now - 15 * 24 * 60 * 60 * 1000).toISOString();

test('paid charge with prior 7-day warning: not flagged', () => {
  const log = [
    JSON.stringify({ t: sixDaysAgo, e: 'kin_prebill_warning_sent', github_login: 'alice', amount: '10' }),
    JSON.stringify({ t: inWindow, e: 'billing_invoice_paid', github_login: 'alice', amount_cents: '1000' }),
  ].join('\n');
  const r = scanEventsForAlarms(log, cutoff);
  assert.strictEqual(r.paidWithoutWarning.length, 0);
});

test('paid charge with no prior warning: flagged', () => {
  const log = JSON.stringify({ t: inWindow, e: 'billing_invoice_paid', github_login: 'bob', amount_cents: '1000' });
  const r = scanEventsForAlarms(log, cutoff);
  assert.strictEqual(r.paidWithoutWarning.length, 1);
  assert.strictEqual(r.paidWithoutWarning[0].github_login, 'bob');
  assert.strictEqual(r.paidWithoutWarning[0].amount_cents, 1000);
});

test('paid charge with warning > 14 days prior: flagged (stale warning does not cover)', () => {
  const log = [
    JSON.stringify({ t: fifteenDaysAgo, e: 'kin_prebill_warning_sent', github_login: 'carol', amount: '10' }),
    JSON.stringify({ t: inWindow, e: 'billing_invoice_paid', github_login: 'carol', amount_cents: '1000' }),
  ].join('\n');
  const r = scanEventsForAlarms(log, cutoff);
  assert.strictEqual(r.paidWithoutWarning.length, 1);
  assert.strictEqual(r.paidWithoutWarning[0].github_login, 'carol');
});

test('paid charge for different user: warning for other user does not cover', () => {
  const log = [
    JSON.stringify({ t: sixDaysAgo, e: 'kin_prebill_warning_sent', github_login: 'alice', amount: '10' }),
    JSON.stringify({ t: inWindow, e: 'billing_invoice_paid', github_login: 'bob', amount_cents: '1000' }),
  ].join('\n');
  const r = scanEventsForAlarms(log, cutoff);
  assert.strictEqual(r.paidWithoutWarning.length, 1);
  assert.strictEqual(r.paidWithoutWarning[0].github_login, 'bob');
});

test('$0 paid charge (kin coupon): not flagged regardless of warning', () => {
  const log = JSON.stringify({ t: inWindow, e: 'billing_invoice_paid', github_login: 'dave', amount_cents: '0' });
  const r = scanEventsForAlarms(log, cutoff);
  assert.strictEqual(r.paidWithoutWarning.length, 0);
});

test('paid charge outside cutoff window: not flagged', () => {
  const log = JSON.stringify({ t: outOfWindow, e: 'billing_invoice_paid', github_login: 'eve', amount_cents: '1000' });
  const r = scanEventsForAlarms(log, cutoff);
  assert.strictEqual(r.paidWithoutWarning.length, 0);
});

test('first checkout invoice (subscription_create): not flagged — user is consciously paying', () => {
  const log = JSON.stringify({ t: inWindow, e: 'billing_invoice_paid', github_login: 'frank', amount_cents: '1000', billing_reason: 'subscription_create' });
  const r = scanEventsForAlarms(log, cutoff);
  assert.strictEqual(r.paidWithoutWarning.length, 0);
});

test('unwarned charge with a logged warning-skip: flagged with the skip reason as note', () => {
  const log = [
    JSON.stringify({ t: sixDaysAgo, e: 'kin_prebill_warning_skipped', github_login: 'grace', reason: 'no_email' }),
    JSON.stringify({ t: inWindow, e: 'billing_invoice_paid', github_login: 'grace', amount_cents: '1000', billing_reason: 'subscription_cycle' }),
  ].join('\n');
  const r = scanEventsForAlarms(log, cutoff);
  assert.strictEqual(r.paidWithoutWarning.length, 1);
  assert.strictEqual(r.paidWithoutWarning[0].note, 'warning skipped: no_email');
});

console.log(`\n${passed}/18 scanner tests passed.`);
