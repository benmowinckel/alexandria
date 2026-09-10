/** Personal adapters and the company guide must never inherit one another's keys. */
import assert from 'node:assert/strict';
import { Hono } from 'hono';
import { companyGuideConnection, getCompanyGuideConnection, getSidecar, registerLibraryRoutes } from '../src/library.js';
import { accessHeaders, authorizeTwinAccess, runTwinInference } from '../src/twin.js';
import { encrypt, hashApiKey } from '../src/crypto.js';
import { setKV } from '../src/kv.js';

const values = new Map<string, string>();
const reads: string[] = [];
const kv = {
  async get(key: string) { reads.push(key); return values.get(key) ?? null; },
  async put(key: string, value: string) { values.set(key, value); },
  async delete(key: string) { values.delete(key); },
};
setKV(kv as unknown as KVNamespace);
process.env.ENCRYPTION_KEY = '01'.repeat(32);
process.env.ADMIN_GITHUB_LOGIN = 'benmowinckel';
// Old deployment secrets deliberately remain present. None may grant a path.
process.env.TWIN_INFERENCE_URL = 'https://old-company.example/infer';
process.env.TWIN_INFERENCE_SECRET = 'old-company-bearer';
process.env.TWIN_ACCESS_CLIENT_ID = 'old-company-access-id';
process.env.TWIN_ACCESS_CLIENT_SECRET = 'old-company-access-secret';
delete process.env.GUIDE_INFERENCE_URL;
delete process.env.GUIDE_INFERENCE_SECRET;
delete process.env.GUIDE_ACCESS_CLIENT_ID;
delete process.env.GUIDE_ACCESS_CLIENT_SECRET;

for (const author of ['benmowinckel', 'someone']) {
  assert.equal(await getSidecar(author), null, `${author} must not inherit deployment defaults`);
  const connection = { url: 'https://personal.example/infer', secret: 'personal-bearer' };
  values.set(`twin_sidecar:${author}`, encrypt(JSON.stringify(connection)));
  assert.equal(await getSidecar(author), null, `${author} needs explicit account ownership`);
  values.set(`twin_sidecar:${author}`, encrypt(JSON.stringify({ ...connection, owner_account: true })));
  assert.equal((await getSidecar(author))?.url, connection.url);
  values.delete(`twin_sidecar:${author}`);
  assert.equal(await getSidecar(author), null, `${author} disconnect must actually go offline`);
}

assert.deepEqual(accessHeaders({}), {}, 'global company Access credentials must not leak');
assert.equal(companyGuideConnection(process.env), null, 'company guide needs its own explicit connection');
assert.equal(await getCompanyGuideConnection(), null);
const transition = { url: 'https://existing-company-endpoint.example/infer', secret: 'existing-guide-bearer', access_client_id: 'existing-access-id', access_client_secret: 'existing-access-secret' };
const transitionRecord = encrypt(JSON.stringify(transition));
values.set('company_guide_sidecar', transitionRecord);
let beforeReads = reads.length;
assert.deepEqual(await getCompanyGuideConnection(), transition, 'the dedicated encrypted company record preserves its exact transport');
assert.deepEqual(reads.slice(beforeReads), ['company_guide_sidecar'], 'company lookup reads no Author record');
assert.equal(await getSidecar('benmowinckel'), null, 'company continuity cannot make User 0 inference owned or enabled');
assert.equal(values.get('company_guide_sidecar'), transitionRecord, 'lookup does not rewrite ownership or encrypted bytes');
for (const invalid of [null, [], { ...transition, url: 'http://public.example/infer' }, { ...transition, url: 'https://127.0.0.1/infer' }, { ...transition, secret: '' }, { ...transition, secret: 42 }, { ...transition, access_client_secret: undefined }, { ...transition, access_client_id: true }]) {
  values.set('company_guide_sidecar', encrypt(JSON.stringify(invalid)));
  assert.equal(await getCompanyGuideConnection(), null, 'invalid company configuration fails closed');
}
values.set('company_guide_sidecar', 'unreadable encrypted record');
assert.equal(await getCompanyGuideConnection(), null);
values.set('company_guide_sidecar', transitionRecord);
beforeReads = reads.length;
assert.equal(await getCompanyGuideConnection({ GUIDE_INFERENCE_URL: 'https://new-company.example/infer' }), null, 'incomplete explicit config never falls back');
assert.equal(await getCompanyGuideConnection({ GUIDE_INFERENCE_URL: 'http://invalid.example/infer', GUIDE_INFERENCE_SECRET: 'new-key' }), null);
assert.deepEqual(await getCompanyGuideConnection({ GUIDE_INFERENCE_URL: 'https://new-company.example/infer', GUIDE_INFERENCE_SECRET: 'new-key' }), { url: 'https://new-company.example/infer', secret: 'new-key', access_client_id: undefined, access_client_secret: undefined });
assert.equal(reads.length, beforeReads, 'explicit company configuration never reads the continuity record');
values.delete('company_guide_sidecar');
assert.equal(await getCompanyGuideConnection(), null, 'removing the dedicated record disables that transport');
assert.equal(authorizeTwinAccess({ visibility: 'authors', authorGithubId: 'owner', accessorGithubId: 'member', context: { subscriberValid: true } }).allowed, true);
assert.equal(authorizeTwinAccess({ visibility: 'authors', authorGithubId: 'owner', accessorGithubId: 'lapsed', context: { subscriberValid: false } }).allowed, false);
assert.equal(authorizeTwinAccess({ visibility: 'invite', authorGithubId: 'owner', accessorGithubId: 'owner', context: { allowOwner: false } }).allowed, false, 'delegated visitors cannot inherit an owner bypass');

const originalFetch = globalThis.fetch;
try {
  const requests: Array<{ url: string; init: RequestInit }> = [];
  let redirected = false;
  globalThis.fetch = async (input, init = {}) => {
    requests.push({ url: String(input), init });
    if (redirected) return new Response('', { status: 302, headers: { Location: 'https://attacker.example.com/collect' } });
    if (String(input).endsWith('/health')) return Response.json({ ok: true, model: 'personal-model' });
    return Response.json({ answer: 'An answer.' });
  };
  const request = { variant: 'context' as const, question: 'A public question', system: 'Public context only', maxTokens: 50, model: 'personal-model' };
  assert.equal((await runTwinInference(request, { url: 'https://personal.example/infer', secret: 'personal-bearer' })).ok, true);
  let call = requests.pop()!;
  assert.equal(call.url, 'https://personal.example/agent');
  let headers = new Headers(call.init.headers);
  assert.equal(headers.get('Authorization'), 'Bearer personal-bearer');
  assert.equal(headers.has('CF-Access-Client-Secret'), false);
  assert.equal(call.init.redirect, 'manual', 'an adapter must not redirect published context or credentials');

  await runTwinInference(request, { url: 'https://personal.example/infer', secret: 'personal-bearer', access_client_id: 'personal-id', access_client_secret: 'personal-access' });
  call = requests.pop()!;
  headers = new Headers(call.init.headers);
  assert.equal(headers.get('CF-Access-Client-Id'), 'personal-id');
  assert.equal(headers.get('CF-Access-Client-Secret'), 'personal-access');

  redirected = true;
  const rejected = await runTwinInference(request, { url: 'https://personal.example/infer', secret: 'personal-bearer' });
  assert.equal(rejected.ok, false, 'redirects cannot produce an answer or forward personal context');
  if (!rejected.ok) assert.equal(rejected.status, 502);
  assert.equal(requests.length, 1);
  assert.equal(requests.pop()!.init.redirect, 'manual');
  redirected = false;

  const app = new Hono();
  registerLibraryRoutes(app);
  values.set('twin_sidecar:benmowinckel', encrypt(JSON.stringify({ url: 'https://personal.example/infer', secret: 'personal-bearer', owner_account: true })));
  const ownerKey = 'alex_fixture_health_owner';
  values.set(`auth:${hashApiKey(ownerKey)}`, 'github_1');
  values.set('login:benmowinckel', 'github_1');
  values.set('account:github_1', encrypt(JSON.stringify({ github_id: 1, github_login: 'benmowinckel', api_key_hash: hashApiKey(ownerKey) })));
  const sidecarStatus = () => app.request('/library/benmowinckel/twin/sidecar', { headers: { Authorization: `Bearer ${ownerKey}` } });
  assert.equal((await (await sidecarStatus()).json()).online, true, 'reachable personal health reports online');
  call = requests.pop()!;
  assert.equal(call.url, 'https://personal.example/health');
  assert.equal(call.init.redirect, 'manual');
  values.delete('twin_online:benmowinckel');
  redirected = true;
  assert.equal((await (await sidecarStatus()).json()).online, false, 'a redirect cannot claim healthy inference');
  assert.equal(requests.length, 1);
  assert.equal(requests.pop()!.init.redirect, 'manual');
  redirected = false;
  const offline = await app.request('/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'What is Alexandria?' }) });
  assert.equal(offline.status, 503, 'company /ask must not borrow the personal connection');
  assert.equal(requests.length, 0);

  // A deliberate one-time copy preserves the existing company endpoint. The
  // request path never borrows or mutates the still-present personal record.
  values.set('company_guide_sidecar', transitionRecord);
  Object.assign(globalThis, { __d1: { prepare(sql: string) {
    assert.match(sql, /^INSERT INTO access_log/);
    return { bind() { return { async run() { return { success: true }; } }; } };
  } } });
  const continued = await app.request('/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'What is Alexandria?' }) });
  assert.equal(continued.status, 200);
  call = requests.pop()!;
  assert.equal(call.url, 'https://existing-company-endpoint.example/guide');
  headers = new Headers(call.init.headers);
  assert.equal(headers.get('Authorization'), 'Bearer existing-guide-bearer');
  assert.equal(headers.get('CF-Access-Client-Secret'), 'existing-access-secret');
  assert.deepEqual(JSON.parse(String(call.init.body)), { question: 'What is Alexandria?' });
  assert.equal(values.get('company_guide_sidecar'), transitionRecord);

  process.env.GUIDE_INFERENCE_URL = 'https://company.example/infer';
  process.env.GUIDE_INFERENCE_SECRET = 'company-guide-bearer';
  process.env.GUIDE_ACCESS_CLIENT_ID = 'company-guide-id';
  process.env.GUIDE_ACCESS_CLIENT_SECRET = 'company-guide-access';
  // The guide ledger contains no Author files; this fake accepts only its insert.
  Object.assign(globalThis, { __d1: { prepare(sql: string) {
    assert.match(sql, /^INSERT INTO access_log/);
    return { bind() { return { async run() { return { success: true }; } }; } };
  } } });
  const online = await app.request('/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'What is Alexandria?' }) });
  assert.equal(online.status, 200);
  call = requests.pop()!;
  assert.equal(call.url, 'https://company.example/guide');
  headers = new Headers(call.init.headers);
  assert.equal(headers.get('Authorization'), 'Bearer company-guide-bearer');
  assert.equal(headers.get('CF-Access-Client-Secret'), 'company-guide-access');
  assert.equal(call.init.redirect, 'manual');
  assert.deepEqual(JSON.parse(String(call.init.body)), { question: 'What is Alexandria?' });
  redirected = true;
  const redirectedGuide = await app.request('/ask', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'What is Alexandria?' }) });
  assert.equal(redirectedGuide.status, 502, 'the company guide never follows a credential-bearing redirect');
  assert.equal(requests.length, 1);
  assert.equal(requests.pop()!.init.redirect, 'manual');
  console.log('Mirror ownership: ordinary User 0, explicit company continuity, env precedence and credential isolation passed');
} finally {
  globalThis.fetch = originalFetch;
}
