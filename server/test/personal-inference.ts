/** Exercise the actual own-site handlers with an adapter and live grant oracle. */
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { NextRequest } from 'next/server';

process.env.NEXT_PUBLIC_PERSONAL_AUTHOR = 'author';
process.env.NEXT_PUBLIC_SITE_URL = 'https://person.example';
process.env.PERSONAL_MIRROR_URL = 'https://adapter.example/infer';
process.env.PERSONAL_MIRROR_SECRET = 'personal-transport-secret';
process.env.PERSONAL_MIRROR_MODEL = 'personal-model';
process.env.PERSONAL_MIRROR_SCOPES = '["public","invite/room"]';
process.env.ALX_LOCAL_KEY = 'owner-key-never-forward';
process.env.TWIN_ACCESS_CLIENT_SECRET = 'company-secret-never-forward';
const directory = mkdtempSync(join(tmpdir(), 'own-mirror-test-'));
const oldCwd = process.cwd();
const oldFetch = globalThis.fetch;
let granted = true, blocked = false, firstPerson = false, throttled = false;
let connectorCalls = 0;
const payloads: Record<string, unknown>[] = [];
try {
  mkdirSync(join(directory, 'data/mirror/invite/room'), { recursive: true });
  mkdirSync(join(directory, 'public/mirror/files'), { recursive: true });
  writeFileSync(join(directory, 'public/mirror/files/thoughts.md'), 'Owned public thinking.');
  writeFileSync(join(directory, 'data/mirror/invite/room/deep.md'), 'Invitation-only deeper thinking.');
  writeFileSync(join(directory, 'data/public-profile.json'), JSON.stringify({ author: { id: 'author', display_name: 'The Author' }, files: [{ name: 'thoughts', title: 'Thoughts', category: 'shadows', scope: 'public', visibility: 'public', local_file: '/mirror/files/thoughts.md' }], twin: { enabled: true, remaining: 0, limit: 10 } }));
  writeFileSync(join(directory, 'data/protected-files.json'), JSON.stringify([{ name: 'deep', scope: 'invite/room', visibility: 'invite', title: 'The deeper piece', local_file: 'invite/room/deep.md' }]));
  process.chdir(directory);
  globalThis.fetch = async (input, init = {}) => {
    const url = new URL(String(input));
    const headers = new Headers(init.headers);
    if (url.hostname === 'adapter.example') {
      assert.equal(init.redirect, 'error');
      assert.equal(headers.get('cookie'), null);
      assert.equal(headers.get('x-alexandria-visitor'), null);
      assert.equal(headers.get('CF-Access-Client-Secret'), null);
      if (url.pathname === '/health') return Response.json({ ok: true, model: 'actual-model', inference: blocked ? 'failing' : 'ready' });
      assert.equal(url.pathname, '/agent');
      assert.equal(headers.get('Authorization'), 'Bearer personal-transport-secret');
      if (throttled) return Response.json({ error: 'No budget left' }, { status: 429 });
      payloads.push(JSON.parse(String(init.body)));
      return Response.json({ answer: firstPerson ? 'I own these thoughts.' : 'The Author published these thoughts.' });
    }
    connectorCalls++;
    assert.match(url.pathname, /^\/connect\/access\/author$/);
    assert.equal(headers.get('authorization'), null);
    assert.equal(headers.get('cookie'), null);
    assert.equal(headers.get('x-alexandria-visitor'), 'av1.reader');
    return Response.json({ allowed: granted && url.searchParams.get('scope') === 'invite/room', author: 'author', scope: url.searchParams.get('scope') });
  };
  const ask = await import('../../app/api/library/[author]/ask/route.js');
  const profile = await import('../../app/api/library/[author]/route.js');
  const handoff = await import('../../app/api/library/[author]/handoff/route.js');
  const { composeHandoff } = await import('../../app/lib/handoff.js');
  const params = { params: Promise.resolve({ author: 'author' }) };
  const question = (body: Record<string, unknown>, visitor = false, origin = 'https://person.example') => ask.POST(new NextRequest('https://person.example/api/library/author/ask', { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', authorization: 'Bearer owner-key-never-forward', ...(visitor ? { cookie: 'alex_mirror_visitor=av1.reader; alex_library_session=owner-session' } : {}) }, body: JSON.stringify(body) }), params);

  let response = await question({ question: 'What has the Author shared?' });
  assert.equal(response.status, 200);
  assert.equal(connectorCalls, 0, 'public inference works without Alexandria');
  assert.deepEqual(payloads.at(-1)!.context_scopes, ['public']);
  assert.match(JSON.stringify(payloads.at(-1)), /Owned public thinking/);
  assert.doesNotMatch(JSON.stringify(payloads.at(-1)), /Invitation-only/);
  assert.deepEqual(payloads.at(-1)!.tools, { works: true, web: false });
  assert.match(String(payloads.at(-1)!.system), /untrusted reference material/);

  response = await question({ question: 'Discuss this piece.', artifact: { name: 'deep', scope: 'invite/room', content: 'Injected caller content must be ignored' } }, true);
  assert.equal(response.status, 200);
  assert.match(JSON.stringify(payloads.at(-1)), /Invitation-only deeper thinking/);
  assert.doesNotMatch(JSON.stringify(payloads.at(-1)), /Injected caller content/);
  assert.equal(payloads.at(-1)!.tier, 'invite');
  granted = false;
  response = await question({ question: 'Discuss this piece.', artifact: { name: 'deep', scope: 'invite/room' } }, true);
  assert.equal(response.status, 403);
  response = await question({ question: 'What is available now?' }, true);
  assert.equal(response.status, 200);
  assert.doesNotMatch(JSON.stringify(payloads.at(-1)), /Invitation-only/);
  assert.deepEqual(payloads.at(-1)!.context_scopes, ['public']);
  granted = true;
  response = await question({ question: 'Discuss this piece.', artifact: { name: 'deep', scope: 'invite' } }, true);
  assert.equal(response.status, 403, 'parent never opens child');
  const before = connectorCalls;
  response = await question({ question: 'Use only public context.', depth: 'public' }, true);
  assert.equal(response.status, 200);
  assert.equal(connectorCalls, before, 'public downgrade needs no protected grant lookup');
  assert.doesNotMatch(JSON.stringify(payloads.at(-1)), /Invitation-only/);
  assert.equal((await question({ question: 'CSRF request' }, true, 'https://evil.example')).status, 403);

  firstPerson = true;
  const attempts = payloads.length;
  response = await question({ question: 'Who are you?' });
  assert.equal(response.status, 502);
  assert.equal(payloads.length, attempts + 2, 'shared identity guard allows one corrective retry');
  firstPerson = false;
  throttled = true;
  response = await question({ question: 'Another question?' });
  assert.equal(response.status, 429);
  assert.equal((await response.json()).handoff, true, 'adapter limits retain the reader exit');
  throttled = false;

  response = await profile.GET(new NextRequest('https://person.example/api/library/author'), params);
  let data = await response.json();
  assert.equal(data.twin.online, true);
  assert.equal(data.twin.model, 'actual-model');
  assert.equal(data.twin.remaining, undefined, 'hosted budgets never block an independent adapter');
  blocked = true;
  response = await profile.GET(new NextRequest('https://person.example/api/library/author'), params);
  data = await response.json();
  assert.equal(data.twin.online, false, 'configuration alone is not proof of working inference');
  response = await handoff.GET(new NextRequest('https://person.example/api/library/author/handoff'), params);
  const text = composeHandoff({ ctx: await response.json() });
  assert.match(text, /Owned public thinking/);
  assert.match(text, /https:\/\/person.example/);
  assert.doesNotMatch(text, /undefined|Invitation-only/);
  console.log('PASS: independent public chat, exact live protected context and revocation, shared identity/transport, adapter limits, live health and working handoff.');
} finally {
  globalThis.fetch = oldFetch;
  process.chdir(oldCwd);
  rmSync(directory, { recursive: true, force: true });
}
