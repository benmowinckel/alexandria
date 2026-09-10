/** The Connector decides live access without storing or reading published bytes. */
import assert from 'node:assert/strict';
import { DatabaseSync } from 'node:sqlite';
import { Hono } from 'hono';
import { type Account } from '../src/auth.js';
import { getStripe } from '../src/billing.js';
import { registerConnectorAccess } from '../src/connector-access.js';
import { encrypt, hashApiKey } from '../src/crypto.js';
import { grantAccess, revokeGrant } from '../src/grants.js';
import { setKV } from '../src/kv.js';
import { registerLibraryRoutes } from '../src/library.js';

process.env.ENCRYPTION_KEY = '24'.repeat(32);
process.env.STRIPE_SECRET_KEY = 'sk_test_connector_access';
process.env.WEBSITE_URL = 'https://alexandria-library.com';
getStripe().subscriptions.list = (async () => ({ data: [] })) as never;
getStripe().customers.list = (async () => ({ data: [] })) as never;
const db = new DatabaseSync(':memory:');
let revokeBeforeRedemption = '';
class Statement {
  private args: (string | number | null)[] = [];
  constructor(private sql: string) {}
  bind(...args: (string | number | null)[]) { this.args = args; return this; }
  async first() { return db.prepare(this.sql).get(...this.args) ?? null; }
  async all() { return { results: db.prepare(this.sql).all(...this.args) }; }
  async run() {
    if (revokeBeforeRedemption && /INSERT INTO access_grants/.test(this.sql) && /FROM access_codes/.test(this.sql)) {
      db.prepare('UPDATE access_codes SET revoked_at = ? WHERE id = ?').run(new Date().toISOString(), revokeBeforeRedemption);
      revokeBeforeRedemption = '';
    }
    const result = db.prepare(this.sql).run(...this.args);
    return { success: true, meta: { changes: result.changes } };
  }
}
let contentReads = 0;
Object.assign(globalThis, {
  __d1: { prepare: (sql: string) => new Statement(sql) },
  __r2: { async get() { contentReads++; throw new Error('No hosted content is required for a permission decision'); } },
});
const records = new Map<string, string>();
setKV({
  get: async (key: string) => records.get(key) ?? null,
  put: async (key: string, value: string) => { records.set(key, value); },
  delete: async (key: string) => { records.delete(key); },
} as unknown as KVNamespace);
const account = (id: number, login: string, status = 'beta'): Account => ({ github_id: id, github_login: login,
  email: `${login}@example.com`, api_key_hash: hashApiKey(`alex_test_${login}`), email_token: 'fixture-token',
  created_at: '2026-09-08', last_session: '2026-09-08', subscription_status: status });
const publisher = account(1, 'author');
records.set('account:1', encrypt(JSON.stringify(publisher)));
records.set('login:author', '1');
let reader: Account | null = null;
const app = new Hono();
// The separately tested visitor middleware supplies this restricted identity.
app.use('*', async (c, next) => {
  if (reader) c.set('connectorViewer', { ...reader, library_reader_only: true });
  await next();
});
registerConnectorAccess(app);
registerLibraryRoutes(app);
const read = (scope: string, invite?: string, author = 'author') => app.request(`/connect/access/${author}?${new URLSearchParams({ scope, ...(invite ? { invite } : {}) })}`);
let response = await read('public');
assert.equal(response.status, 200);
assert.deepEqual(await response.json(), { allowed: true, author: 'author', scope: 'public', reason: 'public' });
assert.match(response.headers.get('cache-control') || '', /no-store/);
for (const scope of ['invite/room', 'paid/course', 'authors']) assert.equal((await read(scope)).status, 401);
for (const scope of ['', ' ', ' invite/room', 'invite/room/', 'invite/../secret', 'unknown']) assert.equal((await read(scope)).status, 400);

reader = account(2, 'reader', 'canceled');
assert.equal((await read('authors')).status, 402);
await grantAccess('author', reader.github_id, { scope: 'invite/room', sourceType: 'owner' });
assert.equal((await read('invite/room')).status, 200, 'invited readers do not need their own paid membership');
for (const scope of ['invite', 'invite/sibling', 'invite/room/child', 'paid/room']) assert.notEqual((await read(scope)).status, 200);
await revokeGrant('author', reader.github_id, 'invite/room');
assert.equal((await read('invite/room')).status, 401, 'revocation applies on the next request');
await grantAccess('author', reader.github_id, { scope: 'paid/course', sourceType: 'purchase' });
assert.equal((await read('paid/course')).status, 200);
await revokeGrant('author', reader.github_id, 'paid/course');
assert.equal((await read('paid/course')).status, 402);
reader = account(3, 'member');
assert.equal((await read('authors/special')).status, 200);
assert.equal((await read('invite/room')).status, 401, 'membership cannot replace an invite');
assert.equal((await read('paid/course')).status, 402, 'membership cannot replace a purchase');
reader = publisher;
assert.equal((await read('invite/private')).status, 401, 'a delegated Author gets no owner bypass');
assert.equal((await read('paid/private')).status, 402);
assert.equal(contentReads, 0, 'all access checks are independent of R2 and protocol-file metadata');

// A stored grant is not a perpetual subscription to the operated Connector.
// Even a caller reaching this handler without visitor middleware must receive
// a current publisher-service check before an exact protected grant is used.
reader = account(2, 'reader', 'canceled');
await grantAccess('author', reader.github_id, { scope: 'invite/paid-service', sourceType: 'owner' });
records.set('account:1', encrypt(JSON.stringify({ ...publisher, subscription_status: 'canceled' })));
response = await read('invite/paid-service');
assert.equal(response.status, 402);
assert.equal((await response.json()).reason, 'connection_inactive');
assert.equal((await read('public')).status, 200, 'public bytes never require a subscription permission');
const originalError = console.error;
console.error = () => {};
getStripe().subscriptions.list = (async () => { throw new Error('fixture billing outage'); }) as never;
getStripe().customers.list = (async () => { throw new Error('fixture billing outage'); }) as never;
response = await read('invite/paid-service');
assert.equal(response.status, 503);
assert.equal((await response.json()).reason, 'connection_unavailable');
getStripe().subscriptions.list = (async () => ({ data: [] })) as never;
getStripe().customers.list = (async () => ({ data: [] })) as never;
console.error = originalError;
records.set('account:1', encrypt(JSON.stringify(publisher)));
assert.equal((await read('invite/paid-service')).status, 200, 'renewal restores service while preserving the exact author grant');

// An existing invite can establish one reader's exact grant from their website.
// These are the same code/grant records used by the hosted Library, not tokens
// granting access to arbitrary files or requiring a reader subscription.
db.exec(`CREATE TABLE access_codes (id TEXT PRIMARY KEY, author_id TEXT, code TEXT UNIQUE, scope TEXT, created_at TEXT, revoked_at TEXT);
  INSERT INTO access_codes VALUES ('room-code', 'author', 'room-invite', 'invite/new-room', '2026-09-08', NULL);
  INSERT INTO access_codes VALUES ('old-code', 'author', 'old-invite', 'invite/old-room', '2026-09-08', '2026-09-08');
  INSERT INTO access_codes VALUES ('race-code', 'author', 'race-invite', 'invite/race', '2026-09-08', NULL);`);
reader = null;
assert.equal((await read('invite/new-room', 'room-invite')).status, 401, 'a code without a delegated reader cannot redeem');
assert.equal(db.prepare("SELECT count(*) AS n FROM access_grants WHERE code_id='room-code'").get()?.n, 0);
reader = account(4, 'invited-reader', 'canceled');
const otherPublisher = account(5, 'another');
records.set('account:5', encrypt(JSON.stringify(otherPublisher)));
records.set('login:another', '5');
for (const scope of ['invite', 'invite/new-room/child', 'invite/sibling', 'paid/new-room']) {
  assert.notEqual((await read(scope, 'room-invite')).status, 200, 'a code grants only its exact invite scope');
}
assert.equal((await read('invite/new-room', 'room-invite', 'another')).status, 401, 'codes do not cross Authors');
assert.equal((await read('invite/old-room', 'old-invite')).status, 401, 'revoked codes cannot establish grants');
assert.equal((await read('invite/new-room', 'not-a-code')).status, 401);
assert.equal((await read('invite/new-room', 'x'.repeat(257))).status, 400);
assert.equal((await read('invite/new-room', 'room-invite')).status, 200, 'a nonmember can redeem an exact invite');
assert.deepEqual(db.prepare("SELECT scope, source_type, source_id, code_id FROM access_grants WHERE author_id='author' AND account_github_id='4'").get(),
  { __proto__: null, scope: 'invite/new-room', source_type: 'invite', source_id: 'room-code', code_id: 'room-code' });
assert.equal((await read('invite/new-room')).status, 200, 'the bound reader no longer needs the code');
await revokeGrant('author', '4', 'invite/new-room');
assert.equal((await read('invite/new-room', 'room-invite')).status, 401, 'reusing a valid code cannot undo account revocation');
revokeBeforeRedemption = 'race-code';
assert.equal((await read('invite/race', 'race-invite')).status, 401, 'code revocation cannot race validation and grant creation');
assert.equal(db.prepare("SELECT count(*) AS n FROM access_grants WHERE code_id='race-code'").get()?.n, 0);
reader = account(6, 'second-reader', 'canceled');
assert.equal((await app.request('/connect/access/author?scope=invite%2Fnew-room&token=room-invite')).status, 200, 'legacy invite query is preserved');
records.set('library:session:owner-session-for-code-revocation', JSON.stringify({ account_key: '1' }));
response = await app.request('/library/author/access-code/room-code', { method: 'DELETE', headers: { cookie: 'alex_library_session=owner-session-for-code-revocation' } });
assert.equal(response.status, 200, 'the existing owner code-revocation route remains authoritative');
assert.equal((await read('invite/new-room')).status, 401, 'revoking a code cuts off readers who already redeemed it');
assert.equal((await read('invite/new-room', 'room-invite')).status, 401);
assert.equal(contentReads, 0, 'redemption and revocation never fetch hosted content');

// A stale checkout URL cannot restore a revoked grant through hosted reads.
db.exec(`CREATE TABLE protocol_files (account_id TEXT, scope TEXT, name TEXT, text TEXT, visibility TEXT, updated_at TEXT, content_type TEXT);
  INSERT INTO protocol_files VALUES ('1', 'paid/course', 'lesson', '', 'paid', '2026-09-08', 'text/markdown; charset=utf-8');`);
reader = account(2, 'reader', 'canceled');
records.set('library:access:old-checkout', JSON.stringify({ author_id: 'author', artifact_id: 'lesson', scope: 'paid/course', artifact_type: 'protocol_file', buyer_github_login: 'reader' }));
response = await app.request('/library/author/file/lesson?scope=paid%2Fcourse&session_id=old-checkout');
assert.equal(response.status, 402);
const checkout = new URL((await response.json()).checkout_url);
assert.equal(checkout.origin, 'https://alexandria-library.com', 'hosted checkout always uses the company website');
assert.equal(checkout.pathname, '/library/author/checkout/file/lesson');
assert.equal(checkout.searchParams.get('scope'), 'paid/course', 'checkout keeps the exact paid scope');
assert.notEqual(db.prepare("SELECT revoked_at FROM access_grants WHERE author_id='author' AND account_github_id='2' AND scope='paid/course'").get()?.revoked_at, null);
assert.equal(contentReads, 0, 'revoked checkout replay must not reach file bytes');
console.log('PASS: exact delegated invite redemption, live grant/code revocation, atomic code validation, nonmember access, credential boundaries, company checkout and no checkout replay.');
