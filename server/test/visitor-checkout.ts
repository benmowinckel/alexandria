/** Real delegated middleware and checkout handler; Stripe is a local capture stub. */
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
 ('1', 'paid/other', 'lesson', 'paid', 900), ('1', 'paid', 'base', 'paid', 500), ('1', 'public', 'free', 'public', NULL);`);
class Statement {
  private args: (string | number | null)[] = [];
  constructor(private sql: string) {}
  bind(...args: (string | number | null)[]) { this.args = args; return this; }
  async first() { return db.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: db.prepare(this.sql).all(...this.args) }; }
  async run() { db.prepare(this.sql).run(...this.args); return { success: true }; }
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
const sessions: Record<string, any>[] = [];
getStripe().checkout.sessions.create = (async (params: Record<string, any>) => {
 sessions.push(params); return { url: 'https://checkout.stripe.com/fixture' };
}) as never;
getStripe().subscriptions.list = (async () => ({ data: [] })) as never;
getStripe().customers.list = (async () => ({ data: [] })) as never;
const originalFetch = globalThis.fetch;
globalThis.fetch = async () => { throw new Error('Tests must never reach live services'); };
const checkout = (query = 'scope=paid%2Fcourse', body: unknown = { return_origin: SITE }, headers = visitor, author = 'author', name = 'lesson') => app.request(`https://api.alexandria-library.com/library/${author}/checkout/file/${name}?${query}`, {
 method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body),
});
const ok = await checkout();
assert.equal(ok.status, 200, await ok.clone().text());
assert.deepEqual(await ok.json(), { url: 'https://checkout.stripe.com/fixture' });
assert.equal(sessions.length, 1);
assert.equal(sessions[0].metadata.github_login, 'reader', 'buyer is the live reader, never website owner');
assert.equal(sessions[0].metadata.scope, 'paid/course');
assert.equal(sessions[0].line_items[0].price_data.unit_amount, 770, 'file floor plus existing ten percent platform fee');
assert.equal(sessions[0].success_url, `${SITE}/library/author/open/lesson?scope=paid%2Fcourse&session_id={CHECKOUT_SESSION_ID}&purchased=1`);
assert.equal(sessions[0].cancel_url, `${SITE}/library/author/open/lesson?scope=paid%2Fcourse&cancel=1`);
assert.equal((await checkout('scope=paid%2Fcourse', {})).status, 200, 'omitted return defaults only to verified website');
assert.equal((await checkout('scope=paid%2Fcourse', { return_origin: SITE, amount_cents: 1 })).status, 200);
assert.equal(sessions.at(-1)!.metadata.author_amount_cents, '700', 'buyer cannot underpay floor');
assert.equal((await checkout('scope=paid%2Fother')).status, 200);
assert.equal(sessions.at(-1)!.metadata.author_amount_cents, '900', 'same filename resolves exact requested cohort');
assert.equal((await checkout('scope=paid', undefined, visitor, 'author', 'base')).status, 200);
assert.equal(sessions.at(-1)!.success_url, `${SITE}/library/author/open/base?scope=paid&session_id={CHECKOUT_SESSION_ID}&purchased=1`);
assert.equal(sessions.at(-1)!.cancel_url, `${SITE}/library/author/open/base?scope=paid&cancel=1`);
const validCalls = sessions.length;
for (const query of ['', 'scope=', 'scope=paid%2Fcourse&scope=paid%2Fother', 'scope=%20paid%2Fcourse', 'scope=paid%2Fcourse%2F', 'scope=public', 'scope=invite%2Froom', 'scope=paid%2F..%2Fcourse']) {
 assert.equal((await checkout(query)).status, 400, query);
}
assert.equal((await checkout('scope=paid%2Fmissing')).status, 404);
for (const origin of ['https://attacker.example.com', `${SITE}/`, `${SITE}/evil`, 'https://alexandria-library.com']) {
 assert.equal((await checkout('scope=paid%2Fcourse', { return_origin: origin })).status, 403, origin);
}
assert.equal((await checkout(undefined, undefined, visitor, 'other-author')).status, 403);
assert.equal((await checkout(undefined, undefined, { ...visitor, 'X-Alexandria-Site': 'https://attacker.example.com' })).status, 401);
assert.equal((await checkout(undefined, undefined, { ...visitor, Origin: 'https://attacker.example.com' } as typeof visitor)).status, 403);
assert.equal((await checkout(undefined, undefined, { ...visitor, 'X-Alexandria-Visitor': `${token}bad` })).status, 401);
for (const path of ['/file/lesson', '/library/author/profile', '/library/author/checkout/work', '/connect/site']) {
 assert.equal((await app.request(`https://api.alexandria-library.com${path}`, { method:'POST', headers:{ ...visitor, Authorization:`Bearer alex_fixture_author` } })).status, 403, path);
}
records.delete('library:session:fixture-session-012345678901234567890');
assert.equal((await checkout()).status, 401, 'reader logout immediately denies checkout');
records.set('library:session:fixture-session-012345678901234567890', JSON.stringify({ account_key: 'github_2' }));
db.prepare("UPDATE visitor_connector_sites SET version = 'revoked'").run();
assert.equal((await checkout()).status, 401, 'site credential rotation immediately denies checkout');
db.prepare("UPDATE visitor_connector_sites SET version = 'v1', verified_at = NULL").run();
assert.equal((await checkout()).status, 403, 'unverified website cannot open checkout');
db.prepare('UPDATE visitor_connector_sites SET verified_at = ?').run(Date.now());
records.set('account:github_1', encrypt(JSON.stringify({ ...publisher, subscription_status: 'canceled' })));
assert.equal((await checkout()).status, 402, 'publisher connection must remain active');
assert.equal(sessions.length, validCalls, 'every denial happens before Stripe session creation');
records.set('account:github_1', encrypt(JSON.stringify(publisher)));
const company = await checkout('scope=paid%2Fcourse', { return_origin: 'https://alexandria-library.com' }, { Cookie:'alex_library_session=fixture-session-012345678901234567890' } as unknown as typeof visitor);
assert.equal(company.status, 200, 'ordinary company browser checkout still works');
assert.match(sessions.at(-1)!.success_url, /^https:\/\/alexandria-library.com\/library\/author\/open\/lesson\?scope=paid%2Fcourse&/);
assert.equal((await checkout('scope=paid', { return_origin: 'https://alexandria-library.com' }, { Cookie:'alex_library_session=fixture-session-012345678901234567890' } as unknown as typeof visitor, 'author', 'base')).status, 200);
assert.equal(sessions.at(-1)!.success_url, 'https://alexandria-library.com/library/author/open/base?session_id={CHECKOUT_SESSION_ID}&purchased=1', 'company base-tier return remains compatible');
assert.equal([...records.keys()].some(key => key.startsWith('library:access:')), false, 'opening checkout grants no access');
globalThis.fetch = originalFetch;
console.log('PASS: live reader identity, verified website returns, exact paid scope and price, owner boundary, revocations, company compatibility; no live purchases or grants.');
