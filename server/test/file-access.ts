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
import {
  authorizeFileRead,
  authorizeShadowRead,
  authorizeWorkRead,
  isInternalProtocolFileName,
  isPutWritableContentType,
  r2ExtensionForContentType,
} from '../src/file-access.js';
import type { Account } from '../src/auth.js';

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

test('lifecycle-* and lifecycle-test are internal', () => {
  assert.strictEqual(isInternalProtocolFileName('lifecycle-1776360000861'), true);
  assert.strictEqual(isInternalProtocolFileName('lifecycle-0'), true);
  assert.strictEqual(isInternalProtocolFileName('lifecycle-test'), true);
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

// ---------------------------------------------------------------------------
// Content-type extension + write-eligibility
// ---------------------------------------------------------------------------

test('extension map: markdown → md, pdf → pdf', () => {
  assert.strictEqual(r2ExtensionForContentType('text/markdown; charset=utf-8'), 'md');
  assert.strictEqual(r2ExtensionForContentType('application/pdf'), 'pdf');
});

test('extension map: unknown type defaults to md', () => {
  // Soft default — readProtocolFile uses the stored content_type, so an
  // unknown value would only land here if the DB got corrupted; failing to
  // markdown is the least-surprising recovery.
  assert.strictEqual(r2ExtensionForContentType('application/octet-stream'), 'md');
  assert.strictEqual(r2ExtensionForContentType(''), 'md');
});

test('PUT-writable: markdown and pdf both writable', () => {
  // Markdown via `body.content` (UTF-8 string). PDF via `body.content_b64`
  // (base64-encoded bytes) — both round-trip through the JSON PUT.
  assert.strictEqual(isPutWritableContentType('text/markdown; charset=utf-8'), true);
  assert.strictEqual(isPutWritableContentType('application/pdf'), true);
});

test('PUT-writable: rejects non-strings and unknown strings', () => {
  assert.strictEqual(isPutWritableContentType(null), false);
  assert.strictEqual(isPutWritableContentType(undefined), false);
  assert.strictEqual(isPutWritableContentType(42), false);
  assert.strictEqual(isPutWritableContentType('text/plain'), false);
  assert.strictEqual(isPutWritableContentType('TEXT/MARKDOWN'), false); // case-sensitive on purpose
});

// ---------------------------------------------------------------------------
// Shadow gate
// ---------------------------------------------------------------------------

const SHADOW_OWNER = 'benmowinckel';
const SHADOW_STRANGER = 'someone-else';

test('shadow public + unauth → allowed', () => {
  const d = authorizeShadowRead({ visibility: 'public', ownerLogin: SHADOW_OWNER, accessorLogin: null });
  assert.strictEqual(d.allowed, true);
  if (d.allowed) assert.strictEqual(d.reason, 'public');
});

test('shadow public + stranger → allowed', () => {
  const d = authorizeShadowRead({ visibility: 'public', ownerLogin: SHADOW_OWNER, accessorLogin: SHADOW_STRANGER });
  assert.strictEqual(d.allowed, true);
});

test('shadow authors + unauth → 401', () => {
  const d = authorizeShadowRead({ visibility: 'authors', ownerLogin: SHADOW_OWNER, accessorLogin: null });
  assert.strictEqual(d.allowed, false);
  if (!d.allowed) {
    assert.strictEqual(d.status, 401);
    assert.strictEqual(d.reason, 'authors_required');
  }
});

test('shadow authors + stranger authed → allowed', () => {
  const d = authorizeShadowRead({ visibility: 'authors', ownerLogin: SHADOW_OWNER, accessorLogin: SHADOW_STRANGER });
  assert.strictEqual(d.allowed, true);
});

test('shadow authors + owner → owner bypass', () => {
  const d = authorizeShadowRead({ visibility: 'authors', ownerLogin: SHADOW_OWNER, accessorLogin: SHADOW_OWNER });
  assert.strictEqual(d.allowed, true);
  if (d.allowed) assert.strictEqual(d.reason, 'owner');
});

test('shadow invite + stranger without token → 401', () => {
  const d = authorizeShadowRead({ visibility: 'invite', ownerLogin: SHADOW_OWNER, accessorLogin: SHADOW_STRANGER });
  assert.strictEqual(d.allowed, false);
  if (!d.allowed) assert.strictEqual(d.reason, 'invite_required');
});

test('shadow invite + stranger with valid token → allowed', () => {
  const d = authorizeShadowRead({ visibility: 'invite', ownerLogin: SHADOW_OWNER, accessorLogin: SHADOW_STRANGER, inviteValid: true });
  assert.strictEqual(d.allowed, true);
  if (d.allowed) assert.strictEqual(d.reason, 'invite');
});

test('shadow invite + owner without token → owner bypass', () => {
  const d = authorizeShadowRead({ visibility: 'invite', ownerLogin: SHADOW_OWNER, accessorLogin: SHADOW_OWNER });
  assert.strictEqual(d.allowed, true);
  if (d.allowed) assert.strictEqual(d.reason, 'owner');
});

test('shadow unknown visibility + stranger → 403', () => {
  const d = authorizeShadowRead({ visibility: 'mystery', ownerLogin: SHADOW_OWNER, accessorLogin: SHADOW_STRANGER });
  assert.strictEqual(d.allowed, false);
  if (!d.allowed) assert.strictEqual(d.status, 403);
});

// ---------------------------------------------------------------------------
// Work gate
// ---------------------------------------------------------------------------

function makeAccount(login: string, subscription_id?: string): Account {
  return {
    github_id: login === SHADOW_OWNER ? 1 : 2,
    github_login: login,
    email: `${login}@example.com`,
    api_key_hash: 'hash',
    email_token: 'tok',
    created_at: '2026-01-01',
    last_session: '2026-01-01',
    subscription_id,
  };
}

test('work free + unauth → allowed (no gate)', () => {
  const d = authorizeWorkRead({ tier: 'free', ownerLogin: SHADOW_OWNER, accessor: null });
  assert.strictEqual(d.allowed, true);
  if (d.allowed) assert.strictEqual(d.reason, 'public');
});

test('work paid + unauth → 401', () => {
  const d = authorizeWorkRead({ tier: 'paid', ownerLogin: SHADOW_OWNER, accessor: null });
  assert.strictEqual(d.allowed, false);
  if (!d.allowed) {
    assert.strictEqual(d.status, 401);
    assert.strictEqual(d.reason, 'auth_required');
  }
});

test('work paid + authed without subscription + not owner → 402', () => {
  const d = authorizeWorkRead({
    tier: 'paid',
    ownerLogin: SHADOW_OWNER,
    accessor: makeAccount(SHADOW_STRANGER),
  });
  assert.strictEqual(d.allowed, false);
  if (!d.allowed) {
    assert.strictEqual(d.status, 402);
    assert.strictEqual(d.reason, 'subscription_required');
  }
});

test('work paid + authed with subscription → allowed (subscriber)', () => {
  const d = authorizeWorkRead({
    tier: 'paid',
    ownerLogin: SHADOW_OWNER,
    accessor: makeAccount(SHADOW_STRANGER, 'sub_123'),
  });
  assert.strictEqual(d.allowed, true);
  if (d.allowed) assert.strictEqual(d.reason, 'subscriber');
});

test('work paid + owner without subscription → owner bypass', () => {
  const d = authorizeWorkRead({
    tier: 'paid',
    ownerLogin: SHADOW_OWNER,
    accessor: makeAccount(SHADOW_OWNER),
  });
  assert.strictEqual(d.allowed, true);
  if (d.allowed) assert.strictEqual(d.reason, 'owner');
});

test('work paid + unauth with validated purchase → allowed (purchase)', () => {
  const d = authorizeWorkRead({
    tier: 'paid',
    ownerLogin: SHADOW_OWNER,
    accessor: null,
    purchaseValid: true,
  });
  assert.strictEqual(d.allowed, true);
  if (d.allowed) assert.strictEqual(d.reason, 'purchase');
});

test('work paid + invalid purchase + unauth → still 401 (grant must validate)', () => {
  const d = authorizeWorkRead({
    tier: 'paid',
    ownerLogin: SHADOW_OWNER,
    accessor: null,
    purchaseValid: false,
  });
  assert.strictEqual(d.allowed, false);
  if (!d.allowed) assert.strictEqual(d.status, 401);
});

console.log(`\n  ${passed} tests passed`);
