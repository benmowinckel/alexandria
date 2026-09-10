#!/usr/bin/env node
/** Copies shared source and already-public bytes; never fetches, authenticates or deploys. */
import { readFile, writeFile, mkdir, stat } from 'node:fs/promises';
import { resolve, dirname, join, relative, extname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import ts from 'typescript';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const [configArg, outputArg] = process.argv.slice(2);
if (!configArg || !outputArg) throw new Error('Usage: node scripts/materialize-personal-site.mjs CONFIG.json NEW_OUTPUT_DIRECTORY');
const configPath = resolve(configArg);
const config = JSON.parse(await readFile(configPath, 'utf8'));
const output = resolve(outputArg);
const inputPath = (value) => resolve(dirname(configPath), value);
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const exists = async (path) => !!(await stat(path).catch(() => null));
if (await exists(output)) throw new Error('Output must be a new directory; existing personal work is never overwritten.');
if (!/^[a-zA-Z0-9][a-zA-Z0-9-]{0,38}$/.test(config.author || '')) throw new Error('Invalid author.');
if (typeof config.name !== 'string' || !config.name.trim()) throw new Error('A personal name is required.');
const site = new URL(config.siteUrl);
if (site.protocol !== 'https:' || site.pathname !== '/' || site.search || site.hash || site.username || site.password) throw new Error('siteUrl must be an HTTPS origin.');
const rawProfile = await readFile(inputPath(config.profile));
const profile = JSON.parse(rawProfile);
if (profile.author?.id !== config.author || profile.viewer?.signed_in || profile.viewer?.is_owner || !Array.isArray(profile.files)) throw new Error('Expected an anonymously public profile for this author.');
const mirrorRoot = inputPath(config.publicMirror);
const manifest = JSON.parse(await readFile(join(mirrorRoot, 'profile.json'), 'utf8'));
const hidden = new Set(profile.profile?.hidden || []);
const category = (file) => file.category || (['everyone', 'authors', 'invite', 'paid'].includes(file.name) ? 'shadows' : 'works');
const publicFiles = profile.files.filter((file) => file.visibility === 'public' && /^public(?:\/[a-z0-9-]+)*$/.test(file.scope) && !hidden.has(category(file)));
const verified = [];
for (const file of publicFiles) {
  const entry = manifest.files?.find((item) => item.name === file.name && item.scope === file.scope);
  if (!entry || !/^\/mirror\/files\/[a-z0-9][a-z0-9-]*\.(md|pdf)$/.test(entry.content_url || '')) throw new Error(`No safe public manifest entry: ${file.name}`);
  const bytes = await readFile(join(mirrorRoot, entry.content_url.slice('/mirror/'.length)));
  if (hash(bytes) !== entry.sha256) throw new Error(`Public bytes changed after preparation: ${file.name}`);
  verified.push({ file, entry, bytes });
}
if (!verified.length) throw new Error('No visible public files.');
await mkdir(output, { recursive: true });
const written = new Map();
const write = async (path, bytes) => {
  await mkdir(dirname(join(output, path)), { recursive: true });
  await writeFile(join(output, path), bytes);
  written.set(path, hash(bytes));
};

// Only visitor routes are entry points. Imports are followed so every copied
// component remains byte-identical to its single source in the product.
const entries = [
  'app/library/[author]/page.tsx', 'app/library/[author]/plm/page.tsx',
  'app/library/[author]/read/[name]/page.tsx', 'app/library/[author]/open/[name]/page.tsx',
  'app/components/ThemeProvider.tsx', 'app/components/StyledJsxRegistry.tsx',
  'app/api/library/[author]/route.ts', 'app/api/library/[author]/file/[name]/route.ts',
  'app/api/library/[author]/ask/route.ts', 'app/api/library/[author]/capabilities/route.ts',
  'app/api/library/[author]/handoff/route.ts', 'app/api/library/session/route.ts',
  'app/api/connect/sign-in/route.ts', 'app/api/connect/callback/route.ts', 'app/api/connect/sign-out/route.ts',
];
const copied = new Set();
async function copySource(path) {
  if (copied.has(path)) return;
  if (!path.startsWith('app/') && !path.startsWith('shared/')) throw new Error(`Unexpected dependency outside visitor source: ${path}`);
  copied.add(path);
  const bytes = await readFile(join(root, path));
  await write(path, bytes);
  if (!/\.[cm]?[jt]sx?$/.test(path)) return;
  const source = ts.createSourceFile(path, bytes.toString(), ts.ScriptTarget.Latest, true);
  const imports = [];
  function visit(node) {
    if ((ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) && node.moduleSpecifier && ts.isStringLiteral(node.moduleSpecifier)) imports.push(node.moduleSpecifier.text);
    if (ts.isCallExpression(node) && node.expression.kind === ts.SyntaxKind.ImportKeyword && node.arguments[0] && ts.isStringLiteral(node.arguments[0])) imports.push(node.arguments[0].text);
    ts.forEachChild(node, visit);
  }
  visit(source);
  for (const specifier of imports) {
    if (!specifier.startsWith('.') && !specifier.startsWith('@/')) continue;
    const base = specifier.startsWith('@/') ? join(root, specifier.slice(2)) : resolve(root, dirname(path), specifier);
    // TypeScript's Node-style imports deliberately name the emitted .js file,
    // while this source checkout contains its .ts/.tsx implementation.
    const sourceStem = base.replace(/\.(?:js|mjs|cjs)$/, '');
    const candidates = [base, ...(sourceStem !== base ? ['.ts', '.tsx', '.mts', '.cts'].map((extension) => sourceStem + extension) : []), ...['.ts', '.tsx', '.mts', '.cts', '.js', '.mjs', '/index.ts', '/index.tsx'].map((suffix) => base + suffix)];
    const candidate = (await Promise.all(candidates.map(async (path) => (await stat(path).catch(() => null))?.isFile() ? path : null))).find(Boolean);
    if (!candidate || !candidate.startsWith(root + '/')) throw new Error(`Cannot resolve ${path}: ${specifier}`);
    await copySource(relative(root, candidate));
  }
}
for (const path of entries) await copySource(path);
for (const path of ['app/globals.css', 'postcss.config.mjs', 'tsconfig.json']) await write(path, await readFile(join(root, path)));
if (await exists(join(root, 'LICENSE'))) await write('LICENSE', await readFile(join(root, 'LICENSE')));
for (const [from, to] of [['page.tsx.template', 'app/page.tsx'], ['layout.tsx.template', 'app/layout.tsx'], ['next.config.ts.template', 'next.config.ts']]) {
  await write(to, await readFile(join(root, 'scripts/personal-site', from)));
}
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
pkg.name = 'alexandria-personal-site';
pkg.scripts = { dev: 'next dev', build: 'next build', start: 'next start' };
await write('package.json', JSON.stringify(pkg, null, 2) + '\n');
const lock = JSON.parse(await readFile(join(root, 'package-lock.json'), 'utf8'));
lock.name = pkg.name;
lock.packages[''].name = pkg.name;
await write('package-lock.json', JSON.stringify(lock, null, 2) + '\n');
await write('.gitignore', 'node_modules/\n.next/\n.env*.local\n');
await write('CONNECTION.md', await readFile(join(root, 'scripts/personal-site/README.md')));
let seal = '';
if (config.seal) {
  const extension = extname(config.seal).toLowerCase();
  if (!['.png', '.jpg', '.webp'].includes(extension)) throw new Error('Use a PNG/JPG/WebP seal.');
  seal = `/personal/seal${extension}`;
  await write(`public${seal}`, await readFile(inputPath(config.seal)));
}
const colors = { background: '#fafafa', ink: '#211e18', accent: '#004996', ...config.theme };
for (const color of Object.values(colors)) if (!/^#[a-fA-F0-9]{6}$/.test(color)) throw new Error('Theme values must be six-digit hex colors.');
let fontCss = '';
if (config.fontLicense) await write('public/personal/FONT-LICENSE.txt', await readFile(inputPath(config.fontLicense)));
for (const [key, style] of [['fontNormal', 'normal'], ['fontItalic', 'italic']]) {
  if (!config[key]) continue;
  if (extname(config[key]) !== '.woff2') throw new Error('Local font files must be woff2.');
  await write(`public/personal/garamond-${style}.woff2`, await readFile(inputPath(config[key])));
  fontCss += `@font-face { font-family: 'EB Garamond'; font-style: ${style}; font-weight: 400 800; font-display: swap; src: url('/personal/garamond-${style}.woff2') format('woff2'); }\n`;
}
await write('app/personal.css', `${fontCss}
:root { --bg-primary: ${colors.background}; --bg-secondary: #f3f1ed; --bg-tertiary: #eae7e1; --bg-modal: ${colors.background}; --text-primary: ${colors.ink}; --text-secondary: #454036; --text-muted: #786f60; --text-subtle: #8c8475; --text-faint: #999084; --text-ghost: #9d9588; --border-light: #e6e1d9; --accent: ${colors.accent}; --accent-hover: ${colors.accent}; --accent-faint: color-mix(in srgb, ${colors.accent} 12%, transparent); --selection: color-mix(in srgb, ${colors.accent} 14%, transparent); --font-serif: var(--font-eb-garamond); }
.dark { --bg-primary: #181512; --bg-secondary: #211d1a; --bg-modal: #24201d; --text-primary: #f1ece4; --text-secondary: #d5cdc3; --text-muted: #aca198; --text-subtle: #978b82; --text-faint: #897e75; --text-ghost: #8f8378; --border-light: #39332e; --accent: #7cafe5; --accent-hover: #a0c6ef; --selection: rgba(124,175,229,.25); }
`);
const offlineProfile = { ...profile, files: verified.map(({ file, entry }) => ({ ...file, local_file: entry.content_url })), viewer: { signed_in: false, is_owner: false, membership_active: false }, twin: { ...profile.twin, online: false, signed_in: false } };
await write('data/public-profile.json', JSON.stringify(offlineProfile, null, 2) + '\n');
for (const { entry, bytes } of verified) await write(`public${entry.content_url}`, bytes);
await write('public/mirror/profile.json', JSON.stringify({ ...manifest, website: site.origin + '/', mirror_url: site.origin + '/', connection: {
  ...manifest.connection,
  profile_url: site.origin + '/',
  capabilities_url: `${site.origin}/api/library/${config.author}/capabilities`,
  conversation_url: `${site.origin}/library/${config.author}/plm`,
  status: 'Prepared independent site: public files are served here; conversation uses a separately configured own adapter or the Alexandria bridge. Reader permissions use the Connector. Live services require deployment and verification.',
}, files: verified.map(({ entry }) => ({ ...entry, read_url: `/library/${config.author}/read/${entry.name}?scope=${encodeURIComponent(entry.scope)}` })) }, null, 2) + '\n');
const publicEnvironment = { NEXT_PUBLIC_PERSONAL_AUTHOR: config.author, NEXT_PUBLIC_PERSONAL_NAME: config.name, NEXT_PUBLIC_SITE_URL: site.origin, NEXT_PUBLIC_PERSONAL_SEAL: seal };
await write('vercel.json', JSON.stringify({ $schema: 'https://openapi.vercel.sh/vercel.json', framework: 'nextjs', env: publicEnvironment, build: { env: publicEnvironment } }, null, 2) + '\n');
await write('.env.example', Object.entries(publicEnvironment).map(([key, value]) => `${key}=${JSON.stringify(value)}`).join('\n') + `\n\n# Optional own inference: server-only; supply URL, secret and model together.\n# Leave all three absent to use the existing Alexandria conversation bridge.\n# PERSONAL_MIRROR_URL=\n# PERSONAL_MIRROR_SECRET=\n# PERSONAL_MIRROR_MODEL=\n# Exact publication scopes; protected scopes still require live reader grants.\n# PERSONAL_MIRROR_SCOPES='["public"]'\n# Optional paired Access identity for this adapter only; both or neither.\n# PERSONAL_MIRROR_ACCESS_CLIENT_ID=\n# PERSONAL_MIRROR_ACCESS_CLIENT_SECRET=\n`);
const prepared = new Date().toISOString();
await write('README.md', `# ${config.name}\n\nIndependent personal website prepared ${prepared}. Not deployed by the materializer.\n\nThe root profile, conversation, reader and access UI are copied from the shared Alexandria source. The public work is served from files owned by this site. Public conversation can use the Author's own server-side adapter directly, without an Alexandria request; absent direct configuration, Alexandria provides the existing conversation bridge. Protected reader permissions use the scoped Connector flow. No Alexandria owner credential is required or accepted. See CONNECTION.md and .env.example for exact server settings.\n\nCopy .env.example to .env.local, then npm ci and npm run build. npm start runs the prepared site. For a standalone Node deployment, copy public and .next/static into the standalone output as described by Next.js. Keep the HTTPS origin identical to the configured origin when enabling connected sign-in.\n\nPublic source profile SHA-256: ${hash(rawProfile)}. Exact source URLs, publication timestamps and body hashes remain in public/mirror/profile.json. This snapshot does not automatically sync. Refresh by preparing a new reviewed public snapshot and materializing into a fresh directory.\n\nShared source fingerprints are recorded in source-manifest.json. Do not publish private files, credentials or unreviewed broader audiences.\n`);
await write('source-manifest.json', JSON.stringify({ prepared_at: prepared, author: config.author, site_url: site.origin, source_profile_sha256: hash(rawProfile), shared_files: Object.fromEntries([...written].filter(([path]) => copied.has(path))), files: Object.fromEntries(written) }, null, 2) + '\n');
console.log(`Prepared ${output}; ${copied.size} shared source files, ${verified.length} public artifacts. No deployment or connection performed.`);
