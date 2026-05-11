/**
 * Unit tests for the file visibility gate — pure function, no KV/D1/R2 deps.
 * Run: npx tsx server/test/file-access.ts
 *
 * This is the structural guard: protocol_files content cannot leave the
 * server without going through `authorizeFileRead`. Every visibility ×
 * accessor combination is exercised here; any drift between this matrix
 * and the routes that consume the gate is a bug.
 */

import assert from 'node:assert';
import { authorizeFileRead, isInternalProtocolFileName } from '../src/file-access.js';

const OWNER = '233047998';
const STRANGER = '999999999';

let passed = 0;
const test = (name: string, fn: () => void) => {
  fn();
  console.log(`  ✓ ${name}`);
  passed++;
};

// ---------------------------------------------------------------------------
// public — anyone reads, with or without auth
// ---------------------------------------------------------------------------

test('public + no auth → allowed', () => {
  const d = authorizeFileRead({ visibility: 'public', authorGithubId: OWNER, accessorGithubId: null });
  assert.strictEqual(d.allowed, true);
  if (d.allowed) assert.strictEqual(d.reason, 'public');
});

test('public + stranger → allowed', () => {
  const d = authorizeFileRead({ visibility: 'public', authorGithubId: OWNER, accessorGithubId: STRANGER });
  assert.strictEqual(d.allowed, true);
});

// ---------------------------------------------------------------------------
// authors — any authenticated Author; unauth blocked
// ---------------------------------------------------------------------------

test('authors + no auth → 401', () => {
  const d = authorizeFileRead({ visibility: 'authors', authorGithubId: OWNER, accessorGithubId: null });
  assert.strictEqual(d.allowed, false);
  if (!d.allowed) {
    assert.strictEqual(d.status, 401);
    assert.strictEqual(d.reason, 'unauthenticated');
  }
});

test('authors + stranger authed → allowed', () => {
  const d = authorizeFileRead({ visibility: 'authors', authorGithubId: OWNER, accessorGithubId: STRANGER });
  assert.strictEqual(d.allowed, true);
  if (d.allowed) assert.strictEqual(d.reason, 'authors');
});

test('authors + owner → owner bypass', () => {
  const d = authorizeFileRead({ visibility: 'authors', authorGithubId: OWNER, accessorGithubId: OWNER });
  assert.strictEqual(d.allowed, true);
  if (d.allowed) assert.strictEqual(d.reason, 'owner');
});

// ---------------------------------------------------------------------------
// invite — owner always; others need inviteValid
// ---------------------------------------------------------------------------

test('invite + no auth → 401', () => {
  const d = authorizeFileRead({ visibility: 'invite', authorGithubId: OWNER, accessorGithubId: null });
  assert.strictEqual(d.allowed, false);
  if (!d.allowed) assert.strictEqual(d.status, 401);
});

test('invite + stranger authed, no token → 401 invite_required', () => {
  const d = authorizeFileRead({ visibility: 'invite', authorGithubId: OWNER, accessorGithubId: STRANGER });
  assert.strictEqual(d.allowed, false);
  if (!d.allowed) {
    assert.strictEqual(d.status, 401);
    assert.strictEqual(d.reason, 'invite_required');
    // The denial reason is also surfaced in the HTTP body so programmatic
    // clients can switch on it without parsing the status code.
    assert.strictEqual(d.body.reason, 'invite_required');
  }
});

test('invite + stranger authed, invalid token → 401', () => {
  const d = authorizeFileRead({
    visibility: 'invite',
    authorGithubId: OWNER,
    accessorGithubId: STRANGER,
    context: { inviteValid: false },
  });
  assert.strictEqual(d.allowed, false);
  if (!d.allowed) assert.strictEqual(d.status, 401);
});

test('invite + stranger authed, valid token → allowed', () => {
  const d = authorizeFileRead({
    visibility: 'invite',
    authorGithubId: OWNER,
    accessorGithubId: STRANGER,
    context: { inviteValid: true },
  });
  assert.strictEqual(d.allowed, true);
  if (d.allowed) assert.strictEqual(d.reason, 'invite');
});

test('invite + owner, no token → owner bypass', () => {
  const d = authorizeFileRead({ visibility: 'invite', authorGithubId: OWNER, accessorGithubId: OWNER });
  assert.strictEqual(d.allowed, true);
  if (d.allowed) assert.strictEqual(d.reason, 'owner');
});

// ---------------------------------------------------------------------------
// paid — owner always; others need purchaseValid
// ---------------------------------------------------------------------------

test('paid + no auth → 401 (not 402 — auth is the first requirement)', () => {
  const d = authorizeFileRead({ visibility: 'paid', authorGithubId: OWNER, accessorGithubId: null });
  assert.strictEqual(d.allowed, false);
  if (!d.allowed) assert.strictEqual(d.status, 401);
});

test('paid + stranger authed, no purchase → 402 payment_required', () => {
  const d = authorizeFileRead({ visibility: 'paid', authorGithubId: OWNER, accessorGithubId: STRANGER });
  assert.strictEqual(d.allowed, false);
  if (!d.allowed) {
    assert.strictEqual(d.status, 402);
    assert.strictEqual(d.reason, 'payment_required');
  }
});

test('paid + stranger authed, invalid purchase → 402', () => {
  const d = authorizeFileRead({
    visibility: 'paid',
    authorGithubId: OWNER,
    accessorGithubId: STRANGER,
    context: { purchaseValid: false },
  });
  assert.strictEqual(d.allowed, false);
  if (!d.allowed) assert.strictEqual(d.status, 402);
});

test('paid + stranger authed, valid purchase → allowed', () => {
  const d = authorizeFileRead({
    visibility: 'paid',
    authorGithubId: OWNER,
    accessorGithubId: STRANGER,
    context: { purchaseValid: true },
  });
  assert.strictEqual(d.allowed, true);
  if (d.allowed) assert.strictEqual(d.reason, 'paid');
});

test('paid + owner → owner bypass without purchase', () => {
  const d = authorizeFileRead({ visibility: 'paid', authorGithubId: OWNER, accessorGithubId: OWNER });
  assert.strictEqual(d.allowed, true);
  if (d.allowed) assert.strictEqual(d.reason, 'owner');
});

// ---------------------------------------------------------------------------
// Fail-closed defaults
// ---------------------------------------------------------------------------

test('unknown visibility + stranger → 403', () => {
  const d = authorizeFileRead({ visibility: 'secret-future-tier', authorGithubId: OWNER, accessorGithubId: STRANGER });
  assert.strictEqual(d.allowed, false);
  if (!d.allowed) {
    assert.strictEqual(d.status, 403);
    assert.strictEqual(d.reason, 'unknown_visibility');
  }
});

test('unknown visibility + owner → owner bypass (owner reads everything)', () => {
  const d = authorizeFileRead({ visibility: 'secret-future-tier', authorGithubId: OWNER, accessorGithubId: OWNER });
  assert.strictEqual(d.allowed, true);
});

test('empty-string visibility + stranger → 403', () => {
  const d = authorizeFileRead({ visibility: '', authorGithubId: OWNER, accessorGithubId: STRANGER });
  assert.strictEqual(d.allowed, false);
});

// ---------------------------------------------------------------------------
// Identity comparison — string vs number must not let a numeric owner slip
// ---------------------------------------------------------------------------

test('owner check normalises number vs string', () => {
  const d = authorizeFileRead({ visibility: 'paid', authorGithubId: 233047998, accessorGithubId: '233047998' });
  assert.strictEqual(d.allowed, true);
  if (d.allowed) assert.strictEqual(d.reason, 'owner');
});

test('similar-looking id is NOT owner', () => {
  const d = authorizeFileRead({ visibility: 'paid', authorGithubId: 233047998, accessorGithubId: '2330479980' });
  assert.strictEqual(d.allowed, false);
});

// ---------------------------------------------------------------------------
// Internal protocol filename filter
// ---------------------------------------------------------------------------

test('lifecycle-* is internal', () => {
  assert.strictEqual(isInternalProtocolFileName('lifecycle-1776360000861'), true);
  assert.strictEqual(isInternalProtocolFileName('lifecycle-0'), true);
});

test('ci-smoke variants are internal', () => {
  assert.strictEqual(isInternalProtocolFileName('ci-smoke'), true);
  assert.strictEqual(isInternalProtocolFileName('ci-smoke-3'), true);
});

test('smoke-test and test-check are internal', () => {
  assert.strictEqual(isInternalProtocolFileName('smoke-test'), true);
  assert.strictEqual(isInternalProtocolFileName('test-check'), true);
});

test('real Author file names are not internal', () => {
  for (const name of ['shadow', 'on-power', 'on-love', 'design', 'droplets-of-grace', 'lifecycle']) {
    assert.strictEqual(isInternalProtocolFileName(name), false, `${name} should not be internal`);
  }
});

console.log(`\n  ${passed} tests passed`);
