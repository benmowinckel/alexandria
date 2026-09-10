import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';

process.env.NEXT_PUBLIC_PERSONAL_AUTHOR = 'author';
process.env.NEXT_PUBLIC_SITE_URL = 'https://person.example';
process.env.ALX_LOCAL_KEY = 'must-never-leave';
const originalCwd = process.cwd();
const dir = mkdtempSync(join(tmpdir(), 'personal-website-test-'));
const originalFetch = globalThis.fetch;
const calls: URL[] = [];
let granted = true;
let unavailable = false;
let authFailure = 0;
let connectionFailure = 0;
let wrongDecisionScope = false;
try {
  mkdirSync(join(dir, 'data/mirror/invite/room'), { recursive: true });
  mkdirSync(join(dir, 'data/mirror/paid/course'), { recursive: true });
  mkdirSync(join(dir, 'data/mirror/authors/room'), { recursive: true });
  mkdirSync(join(dir, 'public/mirror/files'), { recursive: true });
  writeFileSync(join(dir, 'public/mirror/files/hello.md'), 'Owned public writing.');
  writeFileSync(join(dir, 'data/mirror/invite/room/deep.md'), 'Selected deeper writing.');
  writeFileSync(join(dir, 'data/mirror/paid/course/lesson.md'), 'Selected paid writing.');
  writeFileSync(join(dir, 'data/mirror/authors/room/member.md'), 'Selected member writing.');
  writeFileSync(join(dir, 'data/public-profile.json'), JSON.stringify({ author: { id: 'author' }, files: [{ name: 'hello', scope: 'public', visibility: 'public', local_file: '/mirror/files/hello.md' }], twin: { enabled: true } }));
  writeFileSync(join(dir, 'data/protected-files.json'), JSON.stringify([
    { name: 'deep', scope: 'invite/room', visibility: 'invite', title: 'Exact room', local_file: 'invite/room/deep.md' },
    { name: 'lesson', scope: 'paid/course', visibility: 'paid', title: 'Exact course', local_file: 'paid/course/lesson.md', price_cents: 1000 },
    { name: 'member', scope: 'authors/room', visibility: 'authors', title: 'Member room', local_file: 'authors/room/member.md' },
  ]));
  process.chdir(dir);
  globalThis.fetch = async (input, init) => {
    const url = new URL(String(input));
    const headers = new Headers(init?.headers);
    calls.push(url);
    assert.equal(headers.get('authorization'), null);
    assert.equal(headers.get('cookie'), null);
    assert.equal(headers.get('x-alexandria-visitor'), 'av1.test');
    if (unavailable) throw new Error('Network blocked');
    if (url.pathname.startsWith('/connect/access/')) {
      if (connectionFailure) return new Response('Connection unavailable', { status: connectionFailure });
      const scope = url.searchParams.get('scope') || '';
      const allowed = scope === 'invite/room' && (granted || url.searchParams.get('invite') === 'valid +/=& invite');
      const reason = allowed ? 'invite' : scope.startsWith('authors') ? 'membership_required' : scope.startsWith('paid') ? 'payment_required' : 'invite_required';
      return Response.json({ allowed, author: 'author', scope: wrongDecisionScope ? 'invite/another-room' : scope, reason }, { status: allowed ? 200 : reason === 'invite_required' ? 401 : 402 });
    }
    if (url.pathname === '/library/author') return authFailure
      ? Response.json({ error: 'Connection unavailable' }, { status: authFailure })
      : Response.json({ author: { id: 'author' }, viewer: { is_owner: true, signed_in: true }, twin: { online: true, context_scopes: ['invite/secret'] }, files: [] });
    if (url.pathname === '/library/author/file/hosted') return Response.json({ reason: 'payment_required', checkout_url: 'https://alexandria-library.com/library/author/checkout/file/hosted?scope=paid%2Fcourse' }, { status: 402 });
    return Response.json({ error: 'Denied' }, { status: 403 });
  };
  const files = await import('../../app/api/library/[author]/file/[name]/route.js');
  const profile = await import('../../app/api/library/[author]/route.js');
  const request = (path: string) => new NextRequest('https://person.example' + path, { headers: { authorization: 'Bearer alex_owner', cookie: 'alex_library_session=owner-secret; alex_mirror_visitor=av1.test' } });
  const read = (name: string, scope: string, params: Record<string, string> = {}) => files.GET(request(`/api/library/author/file/${name}?${new URLSearchParams({ scope, ...params })}`), { params: Promise.resolve({ author: 'author', name }) });
  let response = await read('hello', 'public');
  assert.equal(await response.text(), 'Owned public writing.');
  assert.equal(calls.length, 0, 'public reading requires no Alexandria server');
  response = await read('deep', 'invite/room');
  assert.equal(response.status, 200);
  assert.match(await response.text(), /Selected deeper/);
  granted = false;
  response = await read('deep', 'invite/room');
  assert.equal(response.status, 401, 'revocation is checked on the next read');
  assert.equal((await response.json()).reason, 'invite_required');
  for (const param of ['invite', 'token']) {
    response = await read('deep', 'invite/room', { [param]: 'valid +/=& invite' });
    assert.equal(response.status, 200, 'an existing invite reaches the exact own-host permission check');
    assert.match(await response.text(), /Selected deeper/);
    assert.equal(calls.at(-1)!.searchParams.get('invite'), 'valid +/=& invite', 'invites survive URL encoding intact');
    assert.equal(calls.at(-1)!.searchParams.get('scope'), 'invite/room');
  }
  response = await read('deep', 'invite/room', { invite: 'invalid-code' });
  assert.equal(response.status, 401);
  const beforeAnonymous = calls.length;
  response = await files.GET(new NextRequest('https://person.example/api/library/author/file/deep?scope=invite%2Froom&invite=valid-code'), { params: Promise.resolve({ author: 'author', name: 'deep' }) });
  assert.equal(response.status, 401);
  assert.equal((await response.json()).reason, 'unauthenticated');
  assert.equal(calls.length, beforeAnonymous, 'no code redemption without a delegated reader');
  response = await read('lesson', 'paid/course', { invite: 'valid +/=& invite', session_id: 'old-checkout' });
  assert.equal(response.status, 402);
  let denial = await response.json();
  assert.equal(denial.reason, 'payment_required');
  assert.equal(denial.checkout_url, undefined, 'an own-host file cannot invent a company offer');
  assert.equal(denial.checkout_available, false);
  assert.match(denial.error, /Checkout is not available/);
  assert.equal(calls.at(-1)!.searchParams.has('invite'), false, 'an invite never becomes a paid-file credential');
  assert.equal(calls.at(-1)!.searchParams.has('session_id'), false, 'local paid access checks only existing grants');
  response = await read('member', 'authors/room');
  assert.equal(response.status, 402);
  denial = await response.json();
  assert.equal(denial.reason, 'membership_required');
  assert.match(denial.error, /active Alexandria membership/);
  assert.equal(denial.checkout_url, undefined);
  for (const [status, reason] of [[401, 'unauthenticated'], [402, 'connection_inactive'], [403, 'access_denied'], [503, 'connection_unavailable']] as const) {
    connectionFailure = status;
    response = await read('deep', 'invite/room');
    assert.equal(response.status, status);
    assert.equal((await response.json()).reason, reason, 'connection failures must not claim the reader needs an invite or purchase');
  }
  connectionFailure = 0;
  granted = true;
  wrongDecisionScope = true;
  response = await read('deep', 'invite/room');
  assert.equal(response.status, 503, 'an allow decision for another scope releases no bytes');
  wrongDecisionScope = false;
  granted = false;
  response = await read('hosted', 'paid/course');
  assert.equal(response.status, 402);
  const checkout = new URL((await response.json()).checkout_url);
  assert.equal(checkout.origin, 'https://alexandria-library.com');
  assert.equal(checkout.searchParams.get('scope'), 'paid/course', 'hosted paid files preserve the existing company checkout');
  response = await read('deep', 'invite');
  assert.equal(response.status, 403, 'parent scope cannot open a child');
  assert.equal(calls.at(-1)!.searchParams.get('scope'), 'invite', 'proxy preserves exact scope');
  response = await profile.GET(request('/api/library/author'), { params: Promise.resolve({ author: 'author' }) });
  let data = await response.json();
  assert.equal(data.viewer.is_owner, false);
  assert.equal(data.twin.context_scopes, undefined);
  assert.deepEqual(data.files.map((file: { name: string }) => file.name), ['hello']);
  for (const status of [401, 402, 403]) {
    authFailure = status;
    response = await profile.GET(request('/api/library/author'), { params: Promise.resolve({ author: 'author' }) });
    assert.equal(response.status, 200, 'a lost connection cannot hide owned public material');
    data = await response.json();
    assert.equal(data.viewer.signed_in, false);
    assert.deepEqual(data.files.map((file: { name: string }) => file.name), ['hello']);
  }
  authFailure = 0;
  unavailable = true;
  response = await read('deep', 'invite/room');
  assert.equal(response.status, 503);
  assert.equal((await response.json()).reason, 'connection_unavailable', 'network failure is not an invite denial');
  response = await profile.GET(request('/api/library/author'), { params: Promise.resolve({ author: 'author' }) });
  data = await response.json();
  assert.equal(data.author.id, 'author');
  assert.equal(data.twin.online, false);
  response = await files.GET(request('/api/library/someone/file/hello'), { params: Promise.resolve({ author: 'someone', name: 'hello' }) });
  assert.equal(response.status, 404);
  const { safePersonalNext, newConnectFlow, pkceChallenge } = await import('../../app/lib/visitor-session.js');
  for (const raw of ['//evil.example', '/\\evil.example', '/api/connect/sign-in', 'https://evil.example', '/\r\n']) assert.equal(safePersonalNext(raw), '/');
  assert.equal(pkceChallenge(newConnectFlow('/').verifier).length, 43);
  console.log('PASS: independent public/offline reading, exact invite forwarding, grant checks, honest paid/member/connection errors, company checkout, credential isolation and callback destinations.');
} finally {
  process.chdir(originalCwd);
  globalThis.fetch = originalFetch;
  rmSync(dir, { recursive: true, force: true });
}
