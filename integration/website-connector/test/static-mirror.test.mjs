import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { copyFile, mkdtemp, mkdir, readFile, readdir, rm, symlink, unlink, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createStaticMirror, validateStaticMirror, verifyStaticMirror } from '../static-mirror.mjs';

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), 'owned-static-mirror-'));
  await mkdir(join(root, 'writing'));
  await writeFile(join(root, 'index.html'), '<h1>The unchanged owner website</h1>');
  await writeFile(join(root, 'style.css'), 'body { color: navy; }');
  await writeFile(join(root, 'writing/essay.md'), '# The owner essay\nPublic thinking.\n');
  return root;
}

test('real static HTTP add/remove proof writes only one file and needs no backend or account', async () => {
  const root = await fixture();
  const received = [];
  const server = createServer(async (req, res) => {
    received.push({ path: req.url, headers: req.headers });
    try { res.end(await readFile(join(root, req.url === '/' ? 'index.html' : req.url))); }
    catch { res.writeHead(404); res.end('Not found'); }
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const site = `http://127.0.0.1:${server.address().port}`;
  try {
    const snapshot = async () => Promise.all(['/', '/style.css', '/writing/essay.md'].map(async path => (await fetch(site + path)).text()));
    const original = await snapshot();
    assert.equal((await fetch(site + '/mirror.json')).status, 404);
    const result = await createStaticMirror({ site, name: 'Existing owner', root, files: ['writing/essay.md'], development: true });
    assert.deepEqual(await snapshot(), original);
    assert.equal(result.descriptor.author, undefined);
    assert.equal(result.descriptor.mirror, undefined);
    assert.equal(result.descriptor.files[0].name, 'writing-essay');
    assert.equal(result.descriptor.files[0].content_url, site + '/writing/essay.md');
    assert.deepEqual(await readdir(root), ['index.html', 'mirror.json', 'style.css', 'writing']);
    received.length = 0;
    const verified = await verifyStaticMirror(result.url, { development: true });
    assert.equal(verified.files, 1);
    assert.deepEqual(received.map(item => item.path), ['/mirror.json', '/writing/essay.md']);
    for (const { headers } of received) {
      assert.equal(headers.authorization, undefined);
      assert.equal(headers.cookie, undefined);
      assert.equal(headers['x-api-key'], undefined);
    }
    await unlink(result.path);
    assert.deepEqual(await snapshot(), original);
    assert.equal((await fetch(site + '/mirror.json')).status, 404);
  } finally { server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(root, { recursive: true, force: true }); }
});

test('creator refuses accidental replacement, outside-root selection and private scopes', async () => {
  const root = await fixture();
  const outside = await mkdtemp(join(tmpdir(), 'unselected-mirror-'));
  await writeFile(join(outside, 'private.md'), 'Never selected for public hosting.');
  const options = { site: 'https://owner.example', name: 'Owner', root, files: ['writing/essay.md'] };
  try {
    await createStaticMirror(options);
    await assert.rejects(createStaticMirror(options), /already exists/);
    await assert.rejects(createStaticMirror({ ...options, output: 'index.html', replace: true }));
    await assert.rejects(createStaticMirror({ ...options, output: '../outside.json' }), /relative file path/);
    await assert.rejects(createStaticMirror({ ...options, files: ['../private.md'] }), /relative file path/);
    await symlink(join(outside, 'private.md'), join(root, 'linked.md'));
    await assert.rejects(createStaticMirror({ ...options, files: ['linked.md'], replace: true }), /outside/);
    const result = await createStaticMirror({ ...options, replace: true });
    assert.throws(() => validateStaticMirror({ ...result.descriptor, files: [{ ...result.descriptor.files[0], scope: 'invite/friends' }] }), /only deliberately public/);
    assert.equal(await readFile(join(root, 'index.html'), 'utf8'), '<h1>The unchanged owner website</h1>');
  } finally { await rm(root, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
});

test('verifier reads exact supplied own-site URLs only and catches changed bytes', async () => {
  const root = await fixture();
  const options = { site: 'https://owner.example', name: 'Owner', root, files: ['writing/essay.md'] };
  try {
    const { descriptor, url } = await createStaticMirror(options);
    const calls = [];
    const fetcher = async (address, init) => {
      calls.push({ address: String(address), init });
      return String(address) === url ? Response.json(descriptor) : new Response('Changed without descriptor refresh');
    };
    await assert.rejects(verifyStaticMirror(url, { fetch: fetcher }), /Published bytes changed/);
    assert.deepEqual(calls.map(call => call.address), [url, descriptor.files[0].content_url]);
    assert.equal(calls[1].init.redirect, 'error');
    assert.equal(calls[1].init.credentials, 'omit');
    const foreign = { ...descriptor, files: [{ ...descriptor.files[0], content_url: 'https://another.example/private.md' }] };
    let count = 0;
    await assert.rejects(verifyStaticMirror(url, { fetch: async () => { count++; return Response.json(foreign); } }), /own site/);
    assert.equal(count, 1, 'malformed descriptor cannot cause a foreign read');
  } finally { await rm(root, { recursive: true, force: true }); }
});


test('a copied helper runs outside the checkout without installation or dependencies', async () => {
  const root = await fixture();
  const tools = await mkdtemp(join(tmpdir(), 'standalone-mirror-helper-'));
  try {
    const helper = join(tools, 'static-mirror.mjs');
    await copyFile(new URL('../static-mirror.mjs', import.meta.url), helper);
    const { stdout } = await promisify(execFile)(process.execPath, [helper, 'create', '--site', 'https://owner.example', '--name', 'Owner', '--root', root, '--file', 'writing/essay.md'], { cwd: tools, env: { PATH: process.env.PATH } });
    assert.match(stdout, /Created only/);
    const descriptor = JSON.parse(await readFile(join(root, 'mirror.json'), 'utf8'));
    assert.equal(descriptor.files[0].content_url, 'https://owner.example/writing/essay.md');
    assert.equal(descriptor.author, undefined);
    assert.deepEqual(await readdir(tools), ['static-mirror.mjs']);
  } finally { await rm(root, { recursive: true, force: true }); await rm(tools, { recursive: true, force: true }); }
});
