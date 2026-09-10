import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createWebsiteMirror } from '../handler.mjs';

const site = 'https://independent.example';
const publicFile = { name: 'essay', scope: 'public', format: 'md' };
const protectedFile = { name: 'notes', scope: 'invite/friends', format: 'md' };
const options = { site, name: 'An independent person', publications: { list: () => [publicFile, protectedFile], read: file => file.scope === 'public' ? 'Selected public thinking.' : 'Owner-protected thinking.' } };
const request = (path, init) => new Request(`${site}/_alexandria${path}`, init);
const ask = body => request('/ask', { method: 'POST', headers: { Origin: site, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });

test('standalone own-host mirror has no account identity, Connector routes or company traffic', async () => {
  let remoteCalls = 0;
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => { remoteCalls++; throw new Error('No remote service permitted'); };
  try {
    const mirror = createWebsiteMirror({ ...options, infer: async ({ author, works }) => {
      assert.equal(author.id, site);
      assert.deepEqual(works.map(file => file.content), ['Selected public thinking.']);
      return { answer: 'An answer from the owner model.' };
    } });
    const manifest = await (await mirror(request('/manifest.json'))).json();
    assert.equal('author' in manifest, false);
    assert.equal(manifest.files.length, 1);
    assert.equal(JSON.stringify(manifest).includes('alexandria-library.com'), false);
    assert.equal((await mirror(request('/files/public/essay.md'))).status, 200);
    const answer = await mirror(ask({ question: 'What does this person think?' }));
    assert.equal(answer.status, 200);
    assert.equal((await answer.json()).answer, 'An answer from the owner model.');
    for (const path of ['/sign-in', '/callback']) {
      const response = await mirror(request(path));
      assert.equal(response.status, 404);
      assert.equal(response.headers.get('Location'), null);
      assert.equal(response.headers.get('Set-Cookie'), null);
    }
    assert.equal((await mirror(request('/files/invite/friends/notes.md'))).status, 403);
    assert.equal(remoteCalls, 0);
  } finally { globalThis.fetch = originalFetch; }
});

test('owner existing access control can protect its own mirror without any Connector', async () => {
  let allowed = false, reads = 0;
  const scopes = [];
  const mirror = createWebsiteMirror({ ...options,
    publications: { ...options.publications, read: file => { reads++; return options.publications.read(file); } },
    authorize: async (request, scope) => { scopes.push(scope); assert.equal(request.headers.get('Cookie'), 'owner_session=existing'); return allowed; },
  });
  const protectedRequest = () => mirror(request('/files/invite/friends/notes.md', { headers: { Cookie: 'owner_session=existing' } }));
  assert.equal((await protectedRequest()).status, 403);
  assert.equal(reads, 0);
  allowed = true;
  assert.equal(await (await protectedRequest()).text(), 'Owner-protected thinking.');
  allowed = false;
  assert.equal((await protectedRequest()).status, 403);
  assert.equal(reads, 1);
  assert.deepEqual(scopes, ['invite/friends', 'invite/friends', 'invite/friends']);
});

test('owner access failures and truthy non-boolean replies never expose protected inventory', async () => {
  for (const authorize of [async () => ({ allowed: true }), async () => 'true', async () => { throw new Error('Offline owner permissions'); }]) {
    let listed = 0;
    const mirror = createWebsiteMirror({ ...options, authorize, publications: { list: () => { listed++; return [protectedFile]; }, read: () => 'protected' } });
    assert.notEqual((await mirror(request('/files/invite/friends/notes.md'))).status, 200);
    assert.equal(listed, 0);
  }
  assert.throws(() => createWebsiteMirror({ ...options, authorize: () => true, connector: { author: 'person' } }), /not both/);
});

test('explicit Connector is optional and removing it leaves public mirror and model intact', async () => {
  let calls = 0;
  const configured = { ...options, infer: async () => ({ answer: 'Still the owner model.' }) };
  const connection = { author: 'person', fetch: async () => { calls++; throw new Error('Unreachable company'); } };
  for (const connector of [connection, undefined]) {
    const mirror = createWebsiteMirror({ ...configured, connector });
    assert.equal((await mirror(request('/files/public/essay.md'))).status, 200);
    assert.equal((await mirror(ask({ question: 'Question' }))).status, 200);
  }
  assert.equal(calls, 0);
});
