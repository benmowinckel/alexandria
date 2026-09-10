#!/usr/bin/env node
/** A public mirror is one ordinary JSON file pointing to selected public files.
 * This helper has no account, package dependency, service request or installer.
 * create writes only the descriptor; verify reads only the supplied own-site URLs. */
import { createHash, randomBytes } from 'node:crypto';
import { lstat, readFile, realpath, rename, unlink, writeFile } from 'node:fs/promises';
import { basename, dirname, extname, isAbsolute, relative, resolve, sep } from 'node:path';
import { pathToFileURL } from 'node:url';

const maxFiles = 250;
const maxFileBytes = 4 * 1024 * 1024;
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const publicScope = /^public(?:\/[a-z0-9][a-z0-9-]{0,63})*$/;
function siteOrigin(value, development = false) {
  const url = new URL(value);
  const local = development && url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
  if ((!local && url.protocol !== 'https:') || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('site must be your HTTPS origin');
  return url.origin;
}
function under(root, path) { const part = relative(root, path); return part !== '..' && !part.startsWith(`..${sep}`) && !isAbsolute(part); }
function localPath(root, value) {
  if (typeof value !== 'string' || !value || value.includes('\\') || isAbsolute(value) || value.split('/').some(part => !part || part === '.' || part === '..')) throw new Error('Use a relative file path within the existing public directory');
  const path = resolve(root, value);
  if (!under(root, path)) throw new Error('File is outside the public directory');
  return path;
}
function contentUrl(value, site) {
  if (typeof value !== 'string' || !value || value.length > 2000) throw new Error('Add an exact public content URL');
  const url = new URL(value, site);
  if (url.origin !== site || url.username || url.password || url.search || url.hash) throw new Error('Mirror files must be direct URLs on your own site without credentials or query strings');
  return url;
}

/** Useful without this helper: write this shape by hand, host it as a normal
 * file, and give its address to readers. Identity, billing and callbacks absent. */
export function validateStaticMirror(value, { site, development = false } = {}) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Expected a mirror descriptor');
  const origin = siteOrigin(site || value.website, development);
  if (siteOrigin(value.website, development) !== origin) throw new Error('The descriptor must identify the site serving it');
  if (typeof value.name !== 'string' || !value.name.trim() || value.name.length > 150) throw new Error('Add the owner display name');
  if (!Array.isArray(value.files) || !value.files.length || value.files.length > maxFiles) throw new Error('Select between 1 and 250 public files');
  const names = new Set(), urls = new Set();
  for (const file of value.files) {
    if (!file || typeof file.name !== 'string' || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(file.name)) throw new Error('Each file needs a stable lowercase name, at most 64 characters');
    if (typeof file.scope !== 'string' || file.scope.length > 200 || !publicScope.test(file.scope) || (file.visibility !== undefined && file.visibility !== 'public')) throw new Error('A static mirror contains only deliberately public files');
    const url = contentUrl(file.content_url, origin);
    if (!['md', 'pdf'].includes(file.format || extname(url.pathname).slice(1))) throw new Error('Select Markdown or PDF files; existing HTML pages can remain ordinary website links');
    if (file.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(file.sha256)) throw new Error('Invalid SHA-256');
    if (names.has(file.name) || urls.has(url.href)) throw new Error('Duplicate file name or content URL');
    names.add(file.name); urls.add(url.href);
  }
  return value;
}

export async function createStaticMirror({ site, name, root, files, output = 'mirror.json', replace = false, development = false }) {
  const origin = siteOrigin(site, development);
  const publicRoot = await realpath(root);
  if (!(await lstat(publicRoot)).isDirectory()) throw new Error('root must be the existing publicly served directory');
  if (!Array.isArray(files) || !files.length || files.length > maxFiles) throw new Error('Explicitly select between 1 and 250 already public files');
  const selected = [];
  for (const file of files) {
    const path = localPath(publicRoot, file);
    if (!under(publicRoot, await realpath(path))) throw new Error('A selected file links outside the public directory');
    const stat = await lstat(await realpath(path));
    if (!stat.isFile() || stat.size > maxFileBytes) throw new Error('Select ordinary public files of at most 4 MiB');
    const format = extname(file).slice(1).toLowerCase();
    if (!['md', 'pdf'].includes(format)) throw new Error('Select existing public Markdown or PDF files');
    const name = file.slice(0, -format.length - 1).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
    const bytes = await readFile(path);
    if (bytes.byteLength > maxFileBytes) throw new Error('Selected public file grew beyond 4 MiB');
    selected.push({ name, title: basename(file, extname(file)).replace(/[-_]/g, ' '), scope: 'public', visibility: 'public', format,
      content_url: `${origin}/${file.split('/').map(encodeURIComponent).join('/')}`, sha256: hash(bytes) });
  }
  const descriptor = validateStaticMirror({ name, website: `${origin}/`, files: selected }, { development });
  const target = localPath(publicRoot, output);
  if (!under(publicRoot, await realpath(dirname(target)))) throw new Error('Output directory links outside the public directory');
  let exists = false;
  try {
    const stat = await lstat(target); exists = true;
    if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Output must be an ordinary descriptor file');
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
  if (exists && !replace) throw new Error('Descriptor already exists; use --replace after reviewing the selected publications');
  if (exists) validateStaticMirror(JSON.parse(await readFile(target, 'utf8')), { site: origin, development });
  const text = `${JSON.stringify(descriptor, null, 2)}\n`;
  if (!exists) await writeFile(target, text, { flag: 'wx', mode: 0o644 });
  else {
    const temporary = `${target}.${randomBytes(12).toString('hex')}.tmp`;
    try { await writeFile(temporary, text, { flag: 'wx', mode: 0o644 }); await rename(temporary, target); }
    finally { await unlink(temporary).catch(() => {}); }
  }
  return { descriptor, path: target, url: `${origin}/${output.split('/').map(encodeURIComponent).join('/')}` };
}

async function anonymousBytes(url, limit, fetcher) {
  const response = await fetcher(url, { redirect: 'error', credentials: 'omit', cache: 'no-store', signal: AbortSignal.timeout(15_000), headers: { Accept: '*/*' } });
  if (!response.ok) throw new Error(`Public read failed (${response.status}): ${url}`);
  if (!response.body) throw new Error(`Empty public response: ${url}`);
  const reader = response.body.getReader(), parts = [];
  let size = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) throw new Error(`Public response exceeds ${limit} bytes: ${url}`);
      parts.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  return Buffer.concat(parts, size);
}
export async function verifyStaticMirror(address, { fetch: fetcher = globalThis.fetch, development = false } = {}) {
  const supplied = new URL(address);
  const site = siteOrigin(supplied.origin, development);
  const url = contentUrl(address, site);
  const descriptor = validateStaticMirror(JSON.parse((await anonymousBytes(url, 128 * 1024, fetcher)).toString('utf8')), { site, development });
  for (const file of descriptor.files) {
    const bytes = await anonymousBytes(contentUrl(file.content_url, site), maxFileBytes, fetcher);
    if (!bytes.length) throw new Error(`Empty publication: ${file.name}`);
    if (file.sha256 && hash(bytes) !== file.sha256) throw new Error(`Published bytes changed: ${file.name}. Review the change and regenerate the descriptor.`);
  }
  return { name: descriptor.name, files: descriptor.files.length, url: url.href };
}

async function main(args) {
  const command = args.shift();
  if (command === 'verify' && args.length === 1) {
    const result = await verifyStaticMirror(args[0]);
    console.log(`Verified ${result.files} public files at ${result.url}. No account or Alexandria request.`);
    return;
  }
  if (command !== 'create') throw new Error('Use create --site URL --name NAME --root PUBLIC_DIR --file FILE [--file FILE] [--output mirror.json] [--replace], or verify MIRROR_URL');
  const options = { files: [] };
  while (args.length) {
    const flag = args.shift();
    if (flag === '--replace') { options.replace = true; continue; }
    if (!['--site', '--name', '--root', '--file', '--output'].includes(flag) || !args.length || args[0].startsWith('--')) throw new Error(`Invalid or incomplete option: ${flag}`);
    const value = args.shift();
    if (flag === '--file') options.files.push(value);
    else {
      const key = flag.slice(2);
      if (options[key] !== undefined) throw new Error(`Duplicate option: ${flag}`);
      options[key] = value;
    }
  }
  const result = await createStaticMirror(options);
  console.log(`Created only ${result.path}\nDeploy that file with your existing site, then verify ${result.url}`);
}
const entry = process.argv[1] ? await realpath(process.argv[1]).catch(() => null) : null;
if (entry && import.meta.url === pathToFileURL(entry).href) {
  main(process.argv.slice(2)).catch(error => { console.error(error.message); process.exitCode = 1; });
}
