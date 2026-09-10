/** Run: node integration/website-connector/example/server.mjs
 * This intentionally keeps the pre-existing static website unchanged. */
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { createWebsiteMirror, sha256 } from '../handler.mjs';
import { nodeConnector } from '../node.mjs';

export async function existingSite(request, response) {
  const path = new URL(request.url, 'http://local.invalid').pathname;
  if (path === '/' || path === '/style.css') {
    const bytes = await readFile(new URL(`site/${path === '/' ? 'index.html' : 'style.css'}`, import.meta.url));
    response.writeHead(200, { 'Content-Type': path === '/' ? 'text/html; charset=utf-8' : 'text/css; charset=utf-8', 'X-Existing-Site': 'unchanged' });
    return response.end(bytes);
  }
  if (path === '/about') {
    response.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
    return response.end('An existing route owned by this website.');
  }
  response.writeHead(404);
  response.end('Not found');
}

export async function exampleConnection({ site, infer, prefix = '/_alexandria' }) {
  const bytes = new Uint8Array(await readFile(new URL('publication.md', import.meta.url)));
  const introduction = { name: 'introduction', title: 'A published introduction', category: 'shadows', scope: 'public', format: 'md', sha256: await sha256(bytes) };
  const handle = createWebsiteMirror({ site, name: 'Example Author', prefix,
    development: new URL(site).protocol === 'http:', infer,
    publications: { list: async () => [introduction], read: async () => bytes },
  });
  return nodeConnector({ handle, site, prefix });
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT || 8787);
  const site = `http://127.0.0.1:${port}`;
  const connection = await exampleConnection({ site });
  createServer(async (request, response) => {
    if (await connection(request, response)) return;
    await existingSite(request, response);
  }).listen(port, '127.0.0.1', () => console.log(`Existing website: ${site}/\nAdded public mirror: ${site}/_alexandria/manifest.json\nNo model, credentials or remote registration configured.`));
}
