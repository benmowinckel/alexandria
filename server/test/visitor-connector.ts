/** Real Hono handlers, encrypted accounts and atomic SQL against SQLite. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Hono } from 'hono';
import { decrypt, encrypt, hashApiKey } from '../src/crypto.js';
import { setKV } from '../src/kv.js';
import { getStripe } from '../src/billing.js';
import { extractApiKey, type Account } from '../src/auth.js';
import { connectedWebsite, registerVisitorConnectorRoutes, resolveConnectorViewer } from '../src/visitor-connector.js';
import { registerLibraryRoutes } from '../src/library.js';
import { registerConnectorAccess } from '../src/connector-access.js';
import { grantAccess, revokeGrant } from '../src/grants.js';

process.env.STRIPE_SECRET_KEY = 'sk_test_connector_fixture';
getStripe().subscriptions.list = (async () => ({ data: [] })) as never;
getStripe().customers.list = (async () => ({ data: [] })) as never;
process.env.ENCRYPTION_KEY = '51'.repeat(32);
process.env.SERVER_URL = 'https://api.alexandria-library.com';
process.env.WEBSITE_URL = 'https://alexandria-library.com';
const BASE = process.env.SERVER_URL;
const SITE = 'https://my-own-website.example.com';
const key = 'alex_test_owner_connection';
const session = 'reader-session-012345678901234567890';
const secondSession = 'other-session-012345678901234567890';
const db = new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('../migrations/0028_visitor_connector.sql', import.meta.url), 'utf8'));
class Statement {
  private args: (string | number | null)[] = [];
  constructor(private sql: string) {}
  bind(...args: (string | number | null)[]) { this.args = args; return this; }
  async first() { return db.prepare(this.sql).get(...this.args) || null; }
  async all() { return { results: db.prepare(this.sql).all(...this.args) }; }
  async run() { db.prepare(this.sql).run(...this.args); return { success: true }; }
}
Object.assign(globalThis, { __d1: { prepare: (sql: string) => new Statement(sql), batch: (statements: Statement[]) => Promise.all(statements.map(s => s.run())) } });
const records = new Map<string, string>();
let accountScans = 0;
setKV({
  get: async (key: string) => records.get(key) || null,
  put: async (key: string, value: string) => { records.set(key, value); },
  delete: async (key: string) => { records.delete(key); },
  list: async ({ prefix }: { prefix: string }) => {
    if (prefix === 'account:') accountScans++;
    return { keys: [...records.keys()].filter(key => key.startsWith(prefix)).map(name => ({ name })), list_complete: true };
  },
} as unknown as KVNamespace);
const storageKey = (id: number) => id === 2 ? 'legacy_reader_record' : `github_${id}`;
const account = (id: number, login: string): Account => ({ github_id: id, github_login: login,
  email: `${login}@example.com`, api_key_hash: hashApiKey(key), email_token: 'email-token',
  created_at: '2026-09-08', last_session: '2026-09-08', subscription_status: 'beta' });
records.set(`account:${storageKey(1)}`, encrypt(JSON.stringify(account(1, 'author'))));
records.set(`account:${storageKey(2)}`, encrypt(JSON.stringify({ ...account(2, 'reader'), subscription_status: 'canceled' })));
records.set(`auth:${hashApiKey(key)}`, storageKey(1));
records.set('login:author', storageKey(1));
records.set(`library:session:${session}`, JSON.stringify({ account_key: storageKey(2) }));
records.set(`library:session:${secondSession}`, JSON.stringify({ account_key: storageKey(1) }));
const app = new Hono();
app.use('*', async (c, next) => { c.set('connectorViewer', await resolveConnectorViewer(c)); await next(); });
registerVisitorConnectorRoutes(app);
registerConnectorAccess(app);
for (const path of ['/library/session', '/library/:author', '/library/:author/file/:file']) {
  app.get(path, c => c.json({ login: c.get('connectorViewer')?.github_login, reader_only: c.get('connectorViewer')?.library_reader_only }));
}
app.post('/library/:author/ask', c => c.json({ ok: true }));
app.put('/file/:file', c => c.json({ dangerous_owner_route: true }));
app.get('/library', c => c.json({ dangerous_roster: true }));
function req(path: string, method = 'GET', input?: unknown, headers: Record<string, string> = {}) {
  return app.request(`${BASE}${path}`, { method, headers: { ...(input ? { 'Content-Type': 'application/json' } : {}), ...headers }, body: input ? JSON.stringify(input) : undefined });
}
const auth = { Authorization: `Bearer ${key}` };
assert.equal((await req('/connect/site', 'POST', { site: SITE })).status, 401);
for (const site of ['http://public.example.com', 'https://127.0.0.1', 'https://[::1]', 'https://private.local', `${SITE}/path`, `${SITE}:8443`, 'https://user:secret@public.example.com', 'https://alexandria-library.com']) {
  assert.equal((await req('/connect/site', 'POST', { site }, auth)).status, 400, site);
}
const registration = await (await req('/connect/site', 'POST', { site: SITE, callback_path: '/api/connect/callback' }, auth)).json();
assert.equal(registration.verification.type, 'dns-txt');
assert.equal(db.prepare("SELECT owner_id FROM visitor_connector_sites WHERE author = 'author'").get()?.owner_id, storageKey(1), 'registration stores the account key separately from immutable github_id');
assert.equal(registration.verification.name, '_alexandria.my-own-website.example.com');
assert.equal(registration.callback_uri, `${SITE}/api/connect/callback`);
assert.equal(registration.manifest_url, `${SITE}/mirror/profile.json`);
for (const path of ['https://attacker.example.com/callback', '//attacker.example.com/callback', '/a/../callback', '/a/./callback', '/%2e%2e/callback', '/a\\callback', '/a?next=elsewhere', '/a#part', '/a//b', '/', '/a/']) {
  for (const field of ['manifest_path', 'callback_path']) assert.equal((await req('/connect/site', 'POST', { site: SITE, [field]: path }, auth)).status, 400, `${field} ${path}`);
}
assert.equal((await req('/connect/site', 'POST', { site: SITE, manifest_path: '/manifest.html' }, auth)).status, 400);
assert.equal((await req('/connect/site', 'POST', { site: SITE, manifest_path: '/same.json', callback_path: '/same.json' }, auth)).status, 400);
let dnsAnswer = 'wrong';
const originalFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const target = new URL(String(url));
  assert.equal(target.origin + target.pathname, 'https://cloudflare-dns.com/dns-query');
  assert.equal(target.searchParams.get('name'), registration.verification.name);
  assert.equal(init?.redirect, 'error');
  assert.equal(new Headers(init?.headers).get('authorization'), null);
  return new Response(JSON.stringify({ Status: 0, Answer: [{ type: 16, data: `"${dnsAnswer}"` }] }));
};
assert.equal((await req('/connect/site/verify', 'POST', { site: SITE }, auth)).status, 400);
dnsAnswer = registration.verification.value;
assert.equal((await req('/connect/site/verify', 'POST', { site: SITE }, auth)).status, 200);
globalThis.fetch = originalFetch;
assert.deepEqual(await (await req('/connect/site/author')).json(), { author: 'author', site: SITE, verified: true, manifest_url: `${SITE}/mirror/profile.json`, callback_uri: `${SITE}/api/connect/callback` });
assert.equal(await connectedWebsite('author', '99'), null, 'a recycled slug cannot enrich another account’s directory row');
assert.equal((await connectedWebsite('author', '1'))?.manifest_url, `${SITE}/mirror/profile.json`);
// Normal GitHub keys and arbitrary legacy keys are storage addresses, never
// identity proofs. A real second account with the recycled login stays denied.
const recycledKey = 'alex_recycled_handle_fixture';
records.set(`account:${storageKey(99)}`, encrypt(JSON.stringify({ ...account(99, 'author'), api_key_hash: hashApiKey(recycledKey) })));
records.set(`auth:${hashApiKey(recycledKey)}`, storageKey(99));
const recycledAuth = { Authorization: `Bearer ${recycledKey}` };
assert.equal((await req('/connect/site', 'POST', { site: SITE }, recycledAuth)).status, 403);
assert.equal((await req('/connect/site/verify', 'POST', { site: SITE }, recycledAuth)).status, 403);
assert.equal((await req('/connect/site', 'DELETE', undefined, recycledAuth)).status, 403);
assert.equal(db.prepare("SELECT owner_id FROM visitor_connector_sites WHERE author = 'author'").get()?.owner_id, storageKey(1));
records.set(`account:${storageKey(1)}`, encrypt(JSON.stringify(account(1, 'renamed-author'))));
records.set('login:renamed-author', storageKey(1));
assert.equal((await connectedWebsite('author', '1'))?.site, SITE, 'a sticky alias still belongs to the same immutable account after rename');
records.set('login:author', storageKey(99));
assert.equal(await connectedWebsite('author'), null, 'registration cannot borrow another account through a mismatched sticky binding');
records.set('login:author', storageKey(1));
records.set(`account:${storageKey(1)}`, encrypt(JSON.stringify(account(1, 'author'))));
const verifier = 'P'.repeat(64);
const query = new URLSearchParams({ author: 'author', site: SITE, state: 'a-state-that-belongs-to-this-browser',
  code_challenge: createHash('sha256').update(verifier).digest('base64url'), code_challenge_method: 'S256' });
const signedOut = await req(`/connect/authorize?${query}`);
assert.equal(signedOut.status, 303);
const signIn = new URL(signedOut.headers.get('location')!);
assert.equal(signIn.pathname, '/auth/github');
assert.equal(signIn.searchParams.get('intent'), 'library');
const next = new URL(signIn.searchParams.get('next')!, 'https://alexandria-library.com');
assert.equal(next.pathname, '/library/connect');
assert.equal(next.searchParams.get('site'), SITE);
assert.equal(next.searchParams.get('code_challenge'), query.get('code_challenge'));
const cookie = { Cookie: `alex_library_session=${session}` };
async function consentIntent() {
  const page = await req(`/connect/authorize?${query}`, 'GET', undefined, cookie);
  const text = await page.text();
  assert.equal(page.status, 200, text);
  assert.ok(text.includes('no permission to publish'));
  assert.ok(!text.includes(session) && !text.includes(key));
  assert.equal(page.headers.get('cache-control'), 'no-store');
  return /name="intent" value="([^"]+)"/.exec(text)![1];
}
async function consent(intent: string, decision = 'allow', headers: Record<string, string> = {}) {
  return app.request(`${BASE}/connect/authorize`, { method: 'POST',
    headers: { ...cookie, Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded', ...headers },
    body: new URLSearchParams({ intent, decision }) });
}
const intent = await consentIntent();
assert.equal((await consent(intent, 'allow', { Origin: 'https://attacker.example.com' })).status, 403);
assert.equal((await consent(intent, 'allow', { Cookie: `alex_library_session=${secondSession}` })).status, 401);
assert.equal((await consent(`${intent}bad`)).status, 401);
const deny = await consent(intent, 'deny');
assert.equal(new URL(deny.headers.get('location')!).searchParams.get('error'), 'access_denied');
async function issueCode(expectedCallback = `${SITE}/api/connect/callback`) {
  const allowed = await consent(await consentIntent());
  assert.equal(allowed.status, 303);
  const callback = new URL(allowed.headers.get('location')!);
  assert.equal(callback.origin + callback.pathname, expectedCallback);
  assert.equal(callback.searchParams.get('state'), query.get('state'));
  return callback.searchParams.get('code')!;
}
const code = await issueCode();
const exchange = (code: string, override: Record<string, string> = {}) => req('/connect/token', 'POST', { code, code_verifier: verifier, author: 'author', site: SITE, ...override });
assert.equal((await exchange(code, { code_verifier: 'x'.repeat(64) })).status, 401);
assert.equal((await exchange(code, { author: 'other-author' })).status, 403);
assert.equal((await exchange(code, { site: 'https://attacker.example.com' })).status, 403);
const races = await Promise.all([exchange(code), exchange(code)]);
assert.deepEqual(races.map(r => r.status).sort(), [200, 401], 'one SQL consume wins');
const credential = await races.find(r => r.status === 200)!.json();
const token = credential.visitor_token;
assert.match(token, /^av1\./);
assert.equal(credential.scope, 'read ask');
assert.equal(extractApiKey({ req: { header: name => name === 'authorization' ? `Bearer ${token}` : undefined } }), null);
const visitor = { 'X-Alexandria-Visitor': token, 'X-Alexandria-Site': SITE };
assert.deepEqual(await (await req('/library/author', 'GET', undefined, visitor)).json(), { login: 'reader', reader_only: true });
for (const [path, method] of [['/library/session', 'GET'], ['/library/author/file/public.md', 'GET'], ['/library/author/ask', 'POST'], ['/connect/access/author?scope=public', 'GET']]) {
  assert.equal((await req(path, method, undefined, visitor)).status, 200, `${method} ${path}`);
}
const access = (scope: string) => req(`/connect/access/author?scope=${encodeURIComponent(scope)}`, 'GET', undefined, visitor);
assert.equal((await access('authors')).status, 402, 'a delegated identity is not a paid reader membership');
await grantAccess('author', '2', { scope: 'invite/room', sourceType: 'owner' });
assert.equal((await access('invite/room')).status, 200, 'a real nonmember visitor can use an exact grant');
assert.equal((await access('invite/room/child')).status, 401);
assert.equal((await access('paid/room')).status, 402);
await revokeGrant('author', '2', 'invite/room');
assert.equal((await access('invite/room')).status, 401, 'next delegated request observes exact revocation');
await grantAccess('author', '2', { scope: 'invite/room', sourceType: 'owner', reactivate: true });
for (const [path, method] of [['/library/other-author', 'GET'], ['/library', 'GET'], ['/file/private.md', 'PUT'], ['/library/author', 'PUT'], ['/connect/site', 'DELETE'], ['/connect/access/other-author', 'GET']]) {
  assert.equal((await req(path, method, undefined, { ...auth, ...visitor })).status, 403, `${method} ${path}`);
}
assert.equal((await req('/library/author', 'GET', undefined, { ...visitor, 'X-Alexandria-Site': 'https://attacker.example.com' })).status, 401);
assert.equal((await req('/library/author', 'GET', undefined, { ...visitor, Origin: 'https://attacker.example.com' })).status, 403);
assert.equal((await req('/library/author', 'GET', undefined, { ...visitor, 'X-Alexandria-Visitor': `${token}bad` })).status, 401);
assert.equal((await req('/library/author', 'GET', undefined, { 'X-Alexandria-Site': SITE })).status, 401);
records.delete(`library:session:${session}`);
assert.equal((await req('/library/author', 'GET', undefined, visitor)).status, 401, 'source logout invalidates visitor');
records.set(`library:session:${session}`, JSON.stringify({ account_key: storageKey(2) }));
const now = Date.now;
Date.now = () => now() + 8 * 60 * 60 * 1000 + 1;
assert.equal((await req('/library/author', 'GET', undefined, visitor)).status, 401, 'expiry invalidates visitor');
Date.now = now;
const expiredCode = await issueCode();
Date.now = () => now() + 5 * 60 * 1000 + 1;
assert.equal((await exchange(expiredCode)).status, 401, 'code has five-minute lifetime');
assert.equal((await consent(intent)).status, 401, 'consent has five-minute lifetime');
Date.now = now;
records.set(`account:${storageKey(1)}`, encrypt(JSON.stringify({ ...account(1, 'author'), subscription_status: 'canceled' })));
assert.equal((await req('/library/author', 'GET', undefined, visitor)).status, 402, 'publisher cancellation ends operated delegation');
assert.equal((await access('invite/room')).status, 402, 'an existing exact grant cannot bypass publisher service expiry');
assert.equal((await req(`/connect/authorize?${query}`, 'GET', undefined, cookie)).status, 402, 'publisher cancellation prevents new delegation');
assert.deepEqual(await (await req('/connect/site/author')).json(), { author: 'author', verified: false }, 'maintained routing ends with publisher membership');
assert.equal((await req('/connect/site', 'POST', { site: SITE }, auth)).status, 402, 'inactive owner cannot register');
assert.equal((await req('/connect/site/verify', 'POST', { site: SITE }, auth)).status, 402, 'inactive owner cannot verify');
const originalError = console.error;
console.error = () => {};
getStripe().subscriptions.list = (async () => { throw new Error('fixture billing outage'); }) as never;
getStripe().customers.list = (async () => { throw new Error('fixture billing outage'); }) as never;
assert.equal((await req('/library/author', 'GET', undefined, visitor)).status, 503, 'billing outage fails unavailable, not canceled');
assert.equal((await req('/connect/site/author')).status, 503, 'resolver outage cannot expose an unchecked registration or imply no registration');
getStripe().subscriptions.list = (async () => ({ data: [] })) as never;
getStripe().customers.list = (async () => ({ data: [] })) as never;
console.error = originalError;
assert.equal((await req('/connect/site', 'DELETE', undefined, auth)).status, 200, 'inactive owner may always revoke');
assert.equal(JSON.parse(decrypt(records.get(`account:${storageKey(2)}`)!)).library_reader_only, undefined, 'reader marker never persisted');
records.set('login:author', '99');
assert.equal((await req('/connect/site', 'DELETE', undefined, auth)).status, 403, 'recycled login cannot claim a prior identity');
assert.equal((await req('/library/author', 'GET', undefined, visitor)).status, 403, 'site revocation invalidates visitor');
assert.deepEqual(await (await req('/connect/site/author')).json(), { author: 'author', verified: false });
// An add-on mounts beside the existing site. Both destinations come only from
// the owner-registered record; changing either invalidates earlier authority.
records.set('login:author', storageKey(1));
records.set(`account:${storageKey(1)}`, encrypt(JSON.stringify(account(1, 'author'))));
async function registerCustom(callbackPath: string) {
  const registered = await (await req('/connect/site', 'POST', { site: SITE, manifest_path: '/_alexandria/manifest.json', callback_path: callbackPath }, auth)).json();
  assert.equal(registered.manifest_url, `${SITE}/_alexandria/manifest.json`);
  assert.equal(registered.callback_uri, SITE + callbackPath);
  assert.deepEqual(await (await req('/connect/site/author')).json(), { author: 'author', verified: false });
  globalThis.fetch = async (url) => {
    assert.equal(new URL(String(url)).origin, 'https://cloudflare-dns.com');
    return new Response(JSON.stringify({ Status: 0, Answer: [{ type: 16, data: `"${registered.verification.value}"` }] }));
  };
  assert.equal((await req('/connect/site/verify', 'POST', { site: SITE }, auth)).status, 200);
  globalThis.fetch = originalFetch;
}
await registerCustom('/_alexandria/callback');
assert.equal((await connectedWebsite('author'))?.manifest_url, `${SITE}/_alexandria/manifest.json`);
const customCode = await issueCode(`${SITE}/_alexandria/callback`);
const customCredential = await (await exchange(customCode)).json();
const pendingCode = await issueCode(`${SITE}/_alexandria/callback`);
const pendingIntent = await consentIntent();
await registerCustom('/_alexandria/return');
assert.equal((await consent(pendingIntent)).status, 401, 'changed routing invalidates consent');
assert.equal((await exchange(pendingCode)).status, 401, 'changed routing invalidates unused codes');
assert.equal((await req('/library/author', 'GET', undefined, { ...visitor, 'X-Alexandria-Visitor': customCredential.visitor_token })).status, 401, 'changed routing invalidates visitor tokens');
await issueCode(`${SITE}/_alexandria/return`);

// The real member directory preserves hosted admission and permits a verified,
// deliberately listed standalone website without a hosted profile.
db.exec('CREATE TABLE authors (id TEXT PRIMARY KEY, display_name TEXT, settings TEXT, bio TEXT)');
const addProfile = (id: string, settings: Record<string, string>) => db.prepare('INSERT INTO authors VALUES (?, ?, ?, ?)').run(id, id, JSON.stringify(settings), '');
addProfile('author', { location: 'London', contact: 'https://contact.example.com', website: 'https://unverified-profile-link.example.com' });
for (const [id, login, status, complete] of [[3, 'inactive', 'canceled', true], [4, 'unlisted', 'beta', false], [5, 'unverified', 'beta', true]] as const) {
  records.set(`account:${storageKey(id)}`, encrypt(JSON.stringify({ ...account(id, login), subscription_status: status })));
  records.set(`login:${login}`, storageKey(id));
  addProfile(login, complete ? { location: 'London', contact: 'https://contact.example.com' } : {});
}
db.prepare(`INSERT INTO visitor_connector_sites (author, owner_id, site, version, challenge_hash, challenge_expires_at) VALUES ('unverified', 'github_5', 'https://not-verified.example.com', 'v', 'h', ?)`).run(Date.now() + 1000);
const directoryApp = new Hono();
registerLibraryRoutes(directoryApp);
db.exec('CREATE TABLE protocol_files (account_id TEXT, scope TEXT, name TEXT, text TEXT, title TEXT, visibility TEXT, price_cents INTEGER, updated_at TEXT)');
const publicProfileResponse = await directoryApp.request(`${BASE}/library/author`);
assert.equal(publicProfileResponse.status, 200);
const publicProfile = await publicProfileResponse.json();
assert.equal(publicProfile.author.account_id, '1', 'public identity stays immutable, independent of storage key');
assert.equal(publicProfile.author.connected_site?.manifest_url, `${SITE}/_alexandria/manifest.json`, 'assembled public profile resolves a normal GitHub-key registration');
globalThis.fetch = async () => { throw new Error('Directory routing must not fetch any website'); };
const readDirectory = (headers: Record<string, string> = {}) => directoryApp.request(`${BASE}/library`, { headers });
const beforeAccountScans = accountScans;
assert.deepEqual((await (await readDirectory()).json()).authors, []);
assert.deepEqual((await (await readDirectory(cookie)).json()).authors, []);
assert.equal(accountScans, beforeAccountScans, 'signed-out/nonmember callers never enumerate or decrypt the account directory');
const roster = await (await readDirectory(auth)).json();
assert.deepEqual(roster.authors.map((row: { id: string }) => row.id).sort(), ['author', 'unverified']);
assert.equal(roster.authors.find((row: { id: string }) => row.id === 'author').connected_site.manifest_url, `${SITE}/_alexandria/manifest.json`);
assert.equal(roster.authors.find((row: { id: string }) => row.id === 'unverified').connected_site, null);
globalThis.fetch = originalFetch;

// A static website is a public manifest and ordinary files. No callback,
// inference process or hosted profile is necessary for registry discovery.
db.prepare("UPDATE authors SET settings = '{}' WHERE id = 'author'").run();
async function registerStatic(listed?: boolean) {
  const response = await req('/connect/site', 'POST', { site: SITE, manifest_path: '/my-public-files.json', ...(listed === undefined ? {} : { listed }) }, auth);
  assert.equal(response.status, 200);
  const registration = await response.json();
  assert.equal(registration.callback_uri, null);
  assert.equal(registration.listed, listed === true);
  if (!registration.verified) {
    assert.deepEqual((await (await readDirectory(auth)).json()).authors.map((row: { id: string }) => row.id), ['unverified'], 'unverified routing never admits a row');
    globalThis.fetch = async () => new Response(JSON.stringify({ Status: 0, Answer: [{ type: 16, data: `"${registration.verification.value}"` }] }));
    assert.equal((await req('/connect/site/verify', 'POST', { site: SITE }, auth)).status, 200);
    globalThis.fetch = originalFetch;
  } else {
    assert.equal(registration.verification, undefined, 'listing consent does not require a second ownership proof');
  }
}
await registerStatic();
assert.deepEqual((await (await readDirectory(auth)).json()).authors.map((row: { id: string }) => row.id), ['unverified'], 'verification alone does not consent to directory listing');
assert.equal((await req(`/connect/authorize?${query}`, 'GET', undefined, cookie)).status, 403, 'a static site has no reader credential destination');
await registerStatic(true);
const staticRoster = await (await readDirectory(auth)).json();
const staticAuthor = staticRoster.authors.find((row: { id: string }) => row.id === 'author');
assert.ok(staticAuthor, 'explicitly listed static owner needs no hosted identity fields');
assert.equal(staticAuthor.location, null);
assert.equal(staticAuthor.contact, null);
assert.equal(staticAuthor.connected_site.manifest_url, `${SITE}/my-public-files.json`);
assert.equal(staticAuthor.connected_site.callback_uri, null);
assert.equal((await req('/connect/site', 'POST', { site: SITE, listed: 'yes' }, auth)).status, 400);
records.set(`account:${storageKey(1)}`, encrypt(JSON.stringify({ ...account(1, 'author'), subscription_status: 'canceled' })));
assert.deepEqual((await (await readDirectory(auth)).json()).authors, [], 'expired reader gets no roster');
records.set(`account:${storageKey(2)}`, encrypt(JSON.stringify(account(2, 'reader'))));
assert.equal((await (await readDirectory(cookie)).json()).authors.some((row: { id: string }) => row.id === 'author'), false, 'listed publisher expiry removes the row for other members');
assert.deepEqual(await (await req('/connect/site/author')).json(), { author: 'author', verified: false });
records.set(`account:${storageKey(1)}`, encrypt(JSON.stringify(account(1, 'author'))));
assert.equal((await (await readDirectory(auth)).json()).authors.some((row: { id: string }) => row.id === 'author'), true, 'renewal restores deliberately listed routing without replacing the site');
assert.equal((await connectedWebsite('author'))?.callback_uri, null);
records.set(`account:${storageKey(2)}`, encrypt(JSON.stringify({ ...account(2, 'reader'), subscription_status: 'canceled' })));
await registerCustom('/_alexandria/return');

// Actual subscription resolver path, not only grandfathered fixture statuses:
// a scheduled cancellation retains service until its status ends, a terminal
// status overrides stale active KV, and a renewal restores the same registration.
let subscriptionStatus = 'active';
let retrievals = 0;
const subscription = () => ({ id: 'sub_connected_site', customer: 'cus_connected_site', status: subscriptionStatus,
  metadata: { github_login: 'author' }, cancel_at_period_end: true, cancel_at: null,
  items: { data: [{ current_period_end: Math.floor(Date.now() / 1000) + 3600 }] } });
getStripe().subscriptions.retrieve = (async () => { retrievals++; return subscription(); }) as never;
getStripe().subscriptions.list = (async () => ({ data: [subscription()] })) as never;
records.set(`account:${storageKey(1)}`, encrypt(JSON.stringify({ ...account(1, 'author'), subscription_status: 'active', subscription_id: 'sub_connected_site' })));
assert.equal((await connectedWebsite('author'))?.site, SITE, 'scheduled cancellation retains the currently paid service');
const paidCredential = await (await exchange(await issueCode(`${SITE}/_alexandria/return`))).json();
const paidVisitor = { 'X-Alexandria-Visitor': paidCredential.visitor_token, 'X-Alexandria-Site': SITE };
const protectedRead = () => req('/connect/access/author?scope=invite%2Froom', 'GET', undefined, paidVisitor);
const repeatRegistration = await (await req('/connect/site', 'POST', { site: SITE, manifest_path: '/_alexandria/manifest.json', callback_path: '/_alexandria/return', listed: true }, auth)).json();
assert.equal(repeatRegistration.verified, true, 'an unchanged verified install is idempotent');
assert.equal(repeatRegistration.verification, undefined);
assert.equal((await (await req('/connect/site', 'POST', { site: SITE, manifest_path: '/_alexandria/manifest.json', callback_path: '/_alexandria/return' }, auth)).json()).listed, true, 'an omitted listing preference preserves an existing choice on retry');
const beforeRetrievals = retrievals;
assert.equal((await protectedRead()).status, 200);
assert.equal(retrievals - beforeRetrievals, 1, 'middleware and exact grant route share one current publisher billing check');
const originalWarn = console.warn;
console.warn = () => {};
subscriptionStatus = 'canceled';
assert.equal((await protectedRead()).status, 402, 'terminal Stripe status overrides stored active membership and existing grant');
assert.deepEqual(await (await req('/connect/site/author')).json(), { author: 'author', verified: false });
subscriptionStatus = 'active';
assert.equal((await protectedRead()).status, 200, 'renewed paid service retains author-controlled grants');
console.warn = originalWarn;
getStripe().subscriptions.list = (async () => ({ data: [] })) as never;
records.set(`account:${storageKey(1)}`, encrypt(JSON.stringify(account(1, 'author'))));
db.prepare("DELETE FROM visitor_connector_sites WHERE author = 'unverified'").run();
for (const id of [3, 4, 5]) records.delete(`account:${storageKey(id)}`);
console.log('visitor connector: standalone static listing, exact public consent, live member discovery and access revocation, no hosted profile or website fetch');
console.log('visitor connector: DNS ownership, exact consent, PKCE, atomic replay protection, origin/Author/route scope, expiry and source-session revocation');

// Exercise the deployed Worker's middleware order and configured rate ceilings.
const { default: worker } = await import('../src/worker.js');
const execution = { waitUntil: (promise: Promise<unknown>) => { void promise; }, passThroughOnException() {} };
for (const [path, limit, method] of [['/connect/authorize', 10, 'GET'], ['/connect/token', 30, 'POST']] as const) {
  for (let attempt = 1; attempt <= limit + 1; attempt++) {
    const response = await worker.fetch(new Request(BASE + path, { method,
      headers: { 'CF-Connecting-IP': path === '/connect/token' ? '192.0.2.12' : '192.0.2.11', 'Content-Type': 'application/json' },
      ...(method === 'POST' ? { body: '{}' } : {}) }), {}, execution as never);
    assert.equal(response.status, attempt <= limit ? 400 : 429, `${path} attempt ${attempt}`);
  }
}
const forbidden = await worker.fetch(new Request(BASE + '/file/private.md', { method: 'PUT', headers: { ...auth, ...visitor, 'Content-Type': 'text/plain' }, body: 'not allowed' }), {}, execution as never);
assert.equal(forbidden.status, 403, 'production middleware rejects delegated owner writes before protocol routes');
console.log('visitor connector: active membership for operator writes, inactive revocation, and production rate/middleware gates');

// Account deletion executes the production route and real SQL. Minimal schemas
// for the existing unrelated purge surfaces keep this test focused on connector
// cleanup, while exercising its actual transaction and identity routing.
for (const [table, columns] of Object.entries({
  waitlist: 'email TEXT', referrals: 'author_id TEXT, referred_github_login TEXT',
  access_log: 'accessor_id TEXT, author_id TEXT', billing_tab: 'accessor_id TEXT, author_id TEXT',
  quiz_results: 'quiz_id TEXT', quizzes: 'id TEXT, author_id TEXT', shadows: 'author_id TEXT',
  pulses: 'author_id TEXT', works: 'author_id TEXT', shadow_tokens: 'author_id TEXT',
  promo_codes: 'author_id TEXT', access_codes: 'author_id TEXT', authors: 'id TEXT',
  protocol_files: 'account_id TEXT', protocol_calls: 'account_id TEXT', account_connect_codes: 'account_key TEXT',
})) db.exec(`CREATE TABLE IF NOT EXISTS ${table} (${columns})`);
Object.assign(globalThis, { __r2: { list: async () => ({ objects: [], truncated: false }), delete: async () => {} } });
records.set('login:author', storageKey(1));
for (const [author, ownerId] of [['old-author', storageKey(1)], ['other', storageKey(3)]]) {
  db.prepare(`INSERT INTO visitor_connector_sites (author, owner_id, site, version, challenge_hash, challenge_expires_at, verified_at)
    VALUES (?, ?, ?, 'version', 'hash', ?, ?)`).run(author, ownerId, SITE, Date.now() + 10000, Date.now());
}
for (const [codeHash, author, readerId] of [['publisher-code', 'author', '2'], ['alias-code', 'old-author', '2'], ['owner-reading-other', 'other', '1'], ['unrelated-reader', 'other', '2']]) {
  db.prepare(`INSERT INTO visitor_connector_codes (code_hash, author, reader_id, site, challenge, context, expires_at)
    VALUES (?, ?, ?, ?, 'pkce', ?, ?)`).run(codeHash, author, readerId, SITE, encrypt('fixture session context'), Date.now() + 10000);
}
const deleteOwner = await worker.fetch(new Request(BASE + '/account', { method: 'DELETE', headers: auth }), {}, execution as never);
assert.equal(deleteOwner.status, 200, await deleteOwner.text());
assert.deepEqual(db.prepare('SELECT code_hash FROM visitor_connector_codes ORDER BY code_hash').all().map(r => r.code_hash), ['unrelated-reader']);
assert.deepEqual(db.prepare('SELECT author FROM visitor_connector_sites ORDER BY author').all().map(r => r.author), ['other']);
assert.equal(records.has(`account:${storageKey(1)}`), false);
const readerKey = 'alex_test_reader_delete';
records.set(`auth:${hashApiKey(readerKey)}`, storageKey(2));
records.set(`account:${storageKey(2)}`, encrypt(JSON.stringify({ ...account(2, 'reader'), api_key_hash: hashApiKey(readerKey) })));
const deleteReader = await worker.fetch(new Request(BASE + '/account', { method: 'DELETE', headers: { Authorization: `Bearer ${readerKey}` } }), {}, execution as never);
assert.equal(deleteReader.status, 200, await deleteReader.text());
assert.equal(db.prepare('SELECT COUNT(*) AS count FROM visitor_connector_codes').get()?.count, 0);
assert.deepEqual(db.prepare('SELECT author FROM visitor_connector_sites').all().map(r => r.author), ['other']);
console.log('visitor connector: account deletion removes reader contexts, publisher contexts and renamed sites while preserving other accounts');
