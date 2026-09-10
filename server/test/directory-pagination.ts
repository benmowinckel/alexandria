/** Bounded discovery over real SQLite, with encrypted accounts and Hono. */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import { Hono } from 'hono';
import { encrypt, hashApiKey } from '../src/crypto.js';
import { setKV } from '../src/kv.js';
import { getStripe } from '../src/billing.js';
import { registerLibraryRoutes } from '../src/library.js';
import { type Account } from '../src/auth.js';

process.env.ENCRYPTION_KEY = '72'.repeat(32);
process.env.STRIPE_SECRET_KEY = 'sk_test_directory_paging';
const db = new DatabaseSync(':memory:');
db.exec(readFileSync(new URL('../migrations/0028_visitor_connector.sql', import.meta.url), 'utf8'));
db.exec('CREATE TABLE authors (id TEXT PRIMARY KEY, display_name TEXT, settings TEXT, bio TEXT)');
let candidateQueries = 0;
class Statement {
  private args: (string | number | null)[] = [];
  constructor(private sql: string) {}
  bind(...args: (string | number | null)[]) { this.args = args; return this; }
  async first() { return db.prepare(this.sql).get(...this.args) || null; }
  async all() {
    if (this.sql.startsWith('SELECT id FROM (')) {
      candidateQueries++;
      assert.equal(this.args[1], 26, 'one page and one continuation witness only');
    }
    return { results: db.prepare(this.sql).all(...this.args) };
  }
  async run() { db.prepare(this.sql).run(...this.args); return { success: true }; }
}
Object.assign(globalThis, { __d1: { prepare: (sql: string) => new Statement(sql) } });
const records = new Map<string, string>();
let accountReads = 0;
const accountReadKeys: string[] = [];
setKV({
  get: async (key: string) => { if (key.startsWith('account:')) { accountReads++; accountReadKeys.push(key); } return records.get(key) || null; },
  put: async (key: string, value: string) => { records.set(key, value); },
  delete: async (key: string) => { records.delete(key); },
  list: async () => { throw new Error('Directory must never enumerate KV accounts, even to repair a missing login index'); },
} as unknown as KVNamespace);
let stripeCalls = 0;
getStripe().subscriptions.list = (async () => { stripeCalls++; return { data: [] }; }) as never;
getStripe().customers.list = (async () => { stripeCalls++; return { data: [] }; }) as never;
getStripe().subscriptions.retrieve = (async id => {
  stripeCalls++;
  return { id, customer: 'cus_page', status: 'active', cancel_at_period_end: false, cancel_at: null, items: { data: [] } };
}) as never;
const storageKey = (id: number) => id === 3 ? 'legacy_member_record' : id % 7 === 0 ? String(id) : `github_${id}`;
function addAccount(id: number, login: string, status = 'beta') {
  const key = `alex_paging_${id}`;
  const account: Account = { github_id: id, github_login: login, number: id + 1000, email: `${login}@example.com`,
    api_key_hash: hashApiKey(key), email_token: 'fixture', created_at: '2026-09-10', last_session: '2026-09-10', subscription_status: status,
    ...(status === 'active' ? { subscription_id: `sub_${id}` } : {}) };
  records.set(`account:${storageKey(id)}`, encrypt(JSON.stringify(account)));
  records.set(`login:${login}`, storageKey(id));
  records.set(`auth:${hashApiKey(key)}`, storageKey(id));
  return { Authorization: `Bearer ${key}` };
}
function addWebsite(id: number, login: string) {
  db.prepare(`INSERT INTO visitor_connector_sites (author,owner_id,site,manifest_path,listed,version,challenge_hash,challenge_expires_at,verified_at)
    VALUES (?,?,?,'/mirror.json',1,'version','hash',?,?)`).run(login, storageKey(id), `https://${login}.example.com`, Date.now() + 1000, Date.now());
}
const owner = addAccount(1, 'viewer');
const guest = addAccount(2, 'guest', 'canceled');
const otherMember = addAccount(3, 'other-member');
addWebsite(1, 'viewer');
for (let i = 1; i <= 80; i++) {
  const login = `author-${String(i).padStart(3, '0')}`;
  addAccount(i + 10, login, i > 30 && i % 11 === 0 ? 'active' : 'beta');
  if (i <= 30 || i % 2) {
    db.prepare('INSERT INTO authors VALUES (?,?,?,?)').run(login, login,
      JSON.stringify(i <= 30 ? {} : { location: 'London', contact: 'https://contact.example.com' }), '');
  } else addWebsite(i + 10, login);
}
// An old alias and missing index must not force an all-account repair scan.
db.prepare("INSERT INTO authors VALUES ('author-000','old alias','{\"location\":\"London\",\"contact\":\"https://contact.example.com\"}','')").run();
records.set('login:author-000', storageKey(1));
records.delete('login:author-079');
const app = new Hono();
registerLibraryRoutes(app);
const request = (cursor = '', headers: Record<string, string> = owner) => app.request('/library' + (cursor ? `?cursor=${encodeURIComponent(cursor)}` : ''), { headers });
let beforeStripe = stripeCalls;
let response = await request('', {});
assert.equal(response.status, 200);
assert.equal((await response.json()).has_more_profiles, true);
assert.equal(accountReads, 0, 'anonymous callers read no account records');
assert.equal(candidateQueries, 0);
assert.equal(stripeCalls, beforeStripe);
response = await request('', guest);
assert.deepEqual((await response.json()).authors, []);
assert.equal(candidateQueries, 0, 'inactive callers get no candidate page');
assert.equal(accountReads, 1, 'inactive callers read only their own account');
assert.equal(stripeCalls - beforeStripe, 2, 'only the denied caller subscription is checked; no publisher fan-out');

const first = await (await request()).json();
assert.deepEqual(first.authors, [], 'an empty candidate page is permitted');
assert.match(first.next_cursor, /^dc1\.[A-Za-z0-9_-]{40,1024}$/);
assert.equal(first.directory_complete, false, 'empty first page is not an empty network');
assert.equal(first.you_listed, true, 'own listing is accurate even when it is on another page');
records.delete('login:viewer');
assert.equal((await (await request()).json()).you_listed, false, 'an unresolved index cannot claim the viewer is listed');
records.set('login:viewer', storageKey(3));
assert.equal((await (await request()).json()).you_listed, false, 'a different immutable owner cannot claim the viewer listing');
records.set('login:viewer', storageKey(1));
assert.equal(first.next_cursor.includes('author-024'), false, 'cursor does not expose the unlisted boundary handle');
assert.equal((await request(first.next_cursor, otherMember)).status, 400, 'cursor is bound to the member');
assert.equal((await request(`${first.next_cursor}x`)).status, 400, 'tampering is refused');
assert.equal((await request('http://attacker.example')).status, 400);
const now = Date.now;
Date.now = () => now() + 60 * 60 * 1000 + 1;
assert.equal((await request(first.next_cursor)).status, 400, 'cursor expires after an hour');
Date.now = now;

let cursor = first.next_cursor;
const observed = new Map<string, string>();
let pages = 1;
while (cursor) {
  const beforeAccounts = accountReads;
  beforeStripe = stripeCalls;
  response = await request(cursor);
  assert.equal(response.status, 200);
  const page = await response.json();
  assert.equal(page.directory_complete, page.next_cursor === null);
  assert.ok(new Set(accountReadKeys.slice(beforeAccounts)).size <= 26, 'at most25 candidate accounts plus the caller; billing may reread the same account');
  assert.ok(accountReads - beforeAccounts <= 77, 'billing reconciliation also remains bounded');
  assert.ok(stripeCalls - beforeStripe <= 25, 'publisher billing is bounded by the candidate page');
  assert.ok(page.authors.length <= 25);
  for (const author of page.authors) {
    assert.equal(observed.has(author.id), false, 'keyset pages do not duplicate profiles');
    assert.equal(author.alexandria_id, `a.${Number(author.account_id) + 1000}`, 'public number comes from stored identity, never page position');
    observed.set(author.id, author.alexandria_id);
    if (Number(author.account_id) % 2 === 0 && author.id !== 'viewer') assert.equal(author.connected_site?.verified, true);
  }
  cursor = page.next_cursor;
  assert.ok(++pages < 10, 'finite continuation');
}
assert.equal(observed.size, 50, 'both hosted and independent admitted accounts are reached; missing index is safely omitted');
assert.equal(observed.has('viewer'), true);
assert.equal(observed.has('author-079'), false);
assert.equal(observed.has('author-000'), false);
console.log('Directory pagination: paid gate before account reads, bounded mixed pages, stable stored IDs, opaque member-bound cursors, empty-page truth and no account scans passed.');
