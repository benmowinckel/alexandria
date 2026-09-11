/** Real delegated middleware and the same PLM gate as hosted inference. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Hono } from 'hono';
import { encrypt, hashApiKey } from '../src/crypto.js';
import { setKV } from '../src/kv.js';
import { getStripe } from '../src/billing.js';
import { type Account } from '../src/auth.js';
import { resolveConnectorViewer } from '../src/visitor-connector.js';
import { registerLibraryRoutes } from '../src/library.js';
import { grantAccess, revokeGrant, grantState } from '../src/grants.js';

process.env.ENCRYPTION_KEY = '72'.repeat(32);
process.env.STRIPE_SECRET_KEY = 'sk_test_no_network_checkout';
process.env.SERVER_URL = 'https://api.alexandria-library.com';
process.env.WEBSITE_URL = 'https://alexandria-library.com';
const SITE = 'https://personal.example.com';
const db = new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('../migrations/0028_visitor_connector.sql', import.meta.url), 'utf8'));
db.exec(`CREATE TABLE protocol_files (account_id TEXT, scope TEXT, name TEXT, visibility TEXT, price_cents INTEGER);
 CREATE TABLE authors (id TEXT, settings TEXT);
 INSERT INTO protocol_files VALUES ('1', 'paid/course', 'lesson', 'paid', 700),
 ('1', 'paid/other', 'lesson', 'paid', 900), ('1', 'public', 'free', 'public', NULL);`);
let revokeDuringRedemption = '';
class Statement {
  private args: (string | number | null)[] = [];
  constructor(private sql: string) {}
  bind(...args: (string | number | null)[]) { this.args = args; return this; }
  async first() { return db.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: db.prepare(this.sql).all(...this.args) }; }
  async run() {
 if (revokeDuringRedemption && this.sql.includes('INSERT INTO access_grants') && this.sql.includes('FROM access_codes')) {
 db.prepare('UPDATE access_codes SET revoked_at = ? WHERE code = ?').run(new Date().toISOString(), revokeDuringRedemption); revokeDuringRedemption = '';
 }
 db.prepare(this.sql).run(...this.args); return { success: true }; }
}
Object.assign(globalThis, { __d1: { prepare: (sql: string) => new Statement(sql) } });
const records = new Map<string, string>();
setKV({ get: async (key: string) => records.get(key) || null,
 put: async (key: string, value: string) => { records.set(key, value); },
 delete: async (key: string) => { records.delete(key); },
} as unknown as KVNamespace);
const account = (id: number, login: string): Account => ({ github_id: id, github_login: login,
 email: `${login}@example.com`, api_key_hash: hashApiKey(`alex_fixture_${login}`), email_token: 'fixture',
 created_at: '2026-09-10', last_session: '2026-09-10', subscription_status: 'beta' });
const publisher = { ...account(1, 'author'), stripe_connect_account_id: 'acct_fixture', connect_payouts_enabled: true };
const reader = { ...account(2, 'reader'), subscription_status: 'canceled' as const };
records.set('account:github_1', encrypt(JSON.stringify(publisher)));
records.set('account:github_2', encrypt(JSON.stringify(reader)));
records.set('login:author', 'github_1');
records.set('library:session:fixture-session-012345678901234567890', JSON.stringify({ account_key: 'github_2' }));
records.set(`auth:${publisher.api_key_hash}`, 'github_1');
db.prepare(`INSERT INTO visitor_connector_sites (author, owner_id, site, callback_path, version, challenge_hash, challenge_expires_at, verified_at)
 VALUES ('author', 'github_1', ?, '/_alexandria/callback', 'v1', 'proof', ?, ?)`).run(SITE, Date.now()+100000, Date.now());
const payload = { type: 'visitor-v1', author: 'author', site: SITE, version: 'v1', account_id: 2, session: 'fixture-session-012345678901234567890', expires_at: Date.now()+100000 };
const token = `av1.${encrypt(JSON.stringify(payload))}`;
const visitor = { 'X-Alexandria-Visitor': token, 'X-Alexandria-Site': SITE };
const app = new Hono();
app.use('*', async (c, next) => { c.set('connectorViewer', await resolveConnectorViewer(c)); await next(); });
registerLibraryRoutes(app);
getStripe().subscriptions.list = (async () => ({ data: [] })) as never;
getStripe().customers.list = (async () => ({ data: [] })) as never;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('No external request belongs in context selection'); };
Object.assign(globalThis, { __r2: { get() { throw new Error('Context selection must never read content'); } } });
db.exec(`CREATE TABLE access_codes (id TEXT, author_id TEXT, code TEXT, scope TEXT, revoked_at TEXT);
 INSERT INTO access_codes VALUES ('room', 'author', 'valid-room', 'invite/room', NULL),
 ('other', 'author', 'other-room', 'invite/other', NULL),
 ('race', 'author', 'racing-room', 'invite/racing', NULL),
 ('foreign', 'other-author', 'foreign-room', 'invite/foreign', NULL);`);
const provider = ['public', 'public/essays', 'authors', 'invite/room', 'invite/racing', 'paid/course'];
function configure(scopes = provider, visibility = 'public', enabled = true) {
 db.prepare("DELETE FROM authors WHERE id = 'author'").run();
 db.prepare('INSERT INTO authors VALUES (?, ?)').run('author', JSON.stringify({ twin: { context: { enabled, visibility, model: 'fixture-model-never-disclosed', scopes } } }));
}
configure();
const context = (query = '', headers: Record<string, string> = visitor, author = 'author') => app.request(`https://api.alexandria-library.com/connect/context/${author}?${query}`, { headers });
const scopes = async (query = '', headers = visitor) => { const res = await context(query, headers); assert.equal(res.status, 200, await res.clone().text()); return (await res.json()).scopes; };
assert.equal((await context('', {})).status, 401);
assert.deepEqual(await scopes(), ['public', 'public/essays']);
const response = await context();
assert.deepEqual(Object.keys(await response.json()).sort(), ['author', 'scopes', 'variant']);
assert.match(response.headers.get('cache-control') || '', /private, no-store/);
assert.equal((await context('', visitor, 'other-author')).status, 403);
for (const query of ['depth=invite', 'scope=invite%2F..%2Froom', 'scope=', 'scope=public&scope=invite', 'invite=x&invite=y', 'question=never-send-a-question']) assert.equal((await context(query)).status, 400, query);
await grantAccess('author', 2, { scope: 'invite/other', sourceType: 'owner' });
await grantAccess('author', 2, { scope: 'invite/room/child', sourceType: 'owner' });
assert.deepEqual(await scopes(), ['public', 'public/essays'], 'unconfigured and child grants cannot broaden context');
assert.equal((await context('scope=invite%2Froom')).status, 403);
assert.equal((await context('invite=foreign-room')).status, 403);
assert.equal((await context('invite=other-room')).status, 403, 'unconfigured code cannot expose its scope');
assert.deepEqual(await scopes('invite=valid-room'), ['public', 'public/essays', 'invite/room']);
assert.equal(await grantState('author', 2, 'invite/room'), 'live');
assert.deepEqual(await scopes('scope=invite%2Froom'), ['public', 'public/essays', 'invite/room']);
assert.equal((await context('invite=invalid-code')).status, 403, 'invalid code cannot silently reuse another granted room');
assert.deepEqual(await scopes('depth=public&invite=racing-room'), ['public', 'public/essays']);
assert.equal(await grantState('author', 2, 'invite/racing'), 'none', 'public override never redeems an invite');
assert.equal((await context('depth=public&scope=invite%2Froom')).status, 403);
revokeDuringRedemption = 'racing-room';
assert.equal((await context('invite=racing-room')).status, 403);
assert.equal(await grantState('author', 2, 'invite/racing'), 'none', 'atomic redemption sees code revocation');
await revokeGrant('author', 2, 'invite/room');
assert.equal((await context('invite=valid-room')).status, 403, 'same code cannot undo explicit account revocation');
assert.deepEqual(await scopes(), ['public', 'public/essays']);
await grantAccess('author', 2, { scope: 'paid/course', sourceType: 'purchase' });
assert.deepEqual(await scopes(), ['public', 'public/essays', 'paid/course']);
configure(['public']);
assert.deepEqual(await scopes(), ['public'], 'configuration changes remove granted scopes immediately');
assert.equal((await context('scope=paid%2Fcourse')).status, 403);
configure();
records.set('account:github_2', encrypt(JSON.stringify({ ...reader, subscription_status: 'beta' })));
assert.deepEqual(await scopes(), ['public', 'public/essays', 'authors', 'paid/course']);
records.set('library:session:owner-fixture-session-01234567890', JSON.stringify({ account_key: 'github_1' }));
const ownerVisitor = { ...visitor, 'X-Alexandria-Visitor': `av1.${encrypt(JSON.stringify({ ...payload, account_id: 1, session: 'owner-fixture-session-01234567890' }))}` };
assert.deepEqual(await scopes('', ownerVisitor), ['public', 'public/essays', 'authors'], 'delegated owner has no owner bypass');
configure(provider, 'invite');
assert.equal((await context()).status, 401, 'outer PLM invite gate is the hosted gate');
await grantAccess('author', 2, { scope: 'invite/room', sourceType: 'owner', reactivate: true });
assert.equal((await context()).status, 200);
assert.deepEqual(await scopes('depth=public'), ['public', 'public/essays']);
configure(provider, 'paid');
records.set('account:github_2', encrypt(JSON.stringify(reader)));
assert.equal((await context()).status, 402, 'outer paid PLM still requires membership');
configure(provider, 'public', false);
assert.equal((await context()).status, 404, 'disabled PLM cannot be recreated by host');
configure();
records.delete('library:session:fixture-session-012345678901234567890');
assert.equal((await context()).status, 401);
globalThis.fetch = originalFetch;
console.log('PASS: shared PLM gate, exact configured/live scopes, hidden scopes, owner boundary, public override, invite redemption/revocation/race, current configuration and outer gates; no content or inference.');
