import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { existingSite, exampleConnection } from '../example/server.mjs';

test('actual HTTP add/remove proof preserves existing homepage, stylesheet and unrelated route bytes', async () => {
  let connection = null;
  let modelCalls = 0, remoteCalls = 0;
  const server = createServer(async (request, response) => {
    if (connection && await connection(request, response)) return;
    await existingSite(request, response);
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const site = `http://127.0.0.1:${server.address().port}`;
  try {
    const snapshot = async () => Promise.all(['/', '/style.css', '/about'].map(async path => {
      const response = await fetch(site + path);
      return { path, status: response.status, contentType: response.headers.get('content-type'), ownerHeader: response.headers.get('x-existing-site'), bytes: await response.text() };
    }));
    const original = await snapshot();
    assert.equal((await fetch(site + '/_alexandria/manifest.json')).status, 404);
    connection = await exampleConnection({ site,
      fetch: async () => { remoteCalls++; throw new Error('Public functionality must not call Alexandria'); },
      infer: async ({ works, question }) => { modelCalls++; assert.match(works[0].content, /small gardens/); assert.equal(question, 'What does this author build?'); return { answer: 'This author builds small gardens.' }; },
    });
    assert.deepEqual(await snapshot(), original, 'adding the backend must preserve all original bytes and headers');
    const manifest = await (await fetch(site + '/_alexandria/manifest.json')).json();
    assert.equal(manifest.name, 'Example Author');
    assert.match(await (await fetch(manifest.files[0].content_url)).text(), /invented, explicitly public test material/);
    const answer = await fetch(site + '/_alexandria/ask', { method: 'POST', headers: { Origin: site, 'Content-Type': 'application/json' }, body: JSON.stringify({ question: 'What does this author build?' }) });
    assert.equal(answer.status, 200);
    assert.equal((await answer.json()).answer, 'This author builds small gardens.');
    assert.equal((await fetch(site + '/_alexandria/ask', { method: 'POST', headers: { Origin: 'https://attacker.example' }, body: '{}' })).status, 403);
    assert.equal(modelCalls, 1);
    assert.equal(remoteCalls, 0);
    connection = null;
    assert.deepEqual(await snapshot(), original, 'removing the add-on leaves every original route intact');
    assert.equal((await fetch(site + '/_alexandria/manifest.json')).status, 404);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); }
});
