/** A visitor can carry an existing Library identity to one independently owned
 * website. This credential permits only that Author's reader surfaces. It never
 * becomes an API key or owner session, and it contains no cached content grants. */
import { createHash } from 'node:crypto';
import { isIP } from 'node:net';
import { Hono, type Context } from 'hono';
import { HTTPException } from 'hono/http-exception';
import { extractLibrarySessionToken, findByLibrarySessionToken, requireAuth, type Account } from './auth.js';
import { encrypt, decrypt, generateToken, hashApiKey, safeEqual } from './crypto.js';
import { getDB } from './db.js';
import { getLoginIndex, loadAccount } from './kv.js';
import { resolveMembership } from './billing.js';

const INTENT_TTL_MS = 5 * 60 * 1000;
const VISITOR_TTL_MS = 8 * 60 * 60 * 1000;
const PROOF_TTL_MS = 24 * 60 * 60 * 1000;
const MANIFEST_PATH = '/mirror/profile.json';
const DNS_ENDPOINT = 'https://cloudflare-dns.com/dns-query';
const AUTHOR = /^[a-z0-9](?:[a-z0-9-]{0,38})$/;
const PKCE_CHALLENGE = /^[A-Za-z0-9_-]{43}$/;

interface Site {
  author: string;
  // Opaque account storage key (normally github_<id>), not the GitHub id.
  owner_id: string;
  site: string;
  manifest_path: string;
  callback_path: string | null;
  listed: number;
  version: string;
  challenge_hash: string;
  challenge_expires_at: number;
  verified_at: number | null;
}
interface Intent {
  type: 'visitor-intent-v1';
  author: string;
  site: string;
  version: string;
  state: string;
  challenge: string;
  session_hash: string;
  expires_at: number;
}
interface Visitor {
  type: 'visitor-v1';
  author: string;
  site: string;
  version: string;
  account_id: number;
  session: string;
  expires_at: number;
}
export type ConnectorViewer = Account & { library_reader_only: true };

declare module 'hono' {
  interface ContextVariableMap {
    connectorViewer: ConnectorViewer | null;
    connectorPublisherId: string | undefined;
  }
}

function fail(status: 400 | 401 | 402 | 403 | 503, message: string): never {
  throw new HTTPException(status, { message });
}
function serverOrigin(): string {
  return new URL(process.env.SERVER_URL || 'https://api.alexandria-library.com').origin;
}
function websiteOrigin(): string {
  return new URL(process.env.WEBSITE_URL || 'https://alexandria-library.com').origin;
}
function unseal<T>(raw: string): T | null {
  try { return JSON.parse(decrypt(raw)) as T; } catch { return null; }
}
function html(raw: string): string {
  return raw.replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);
}
function canonicalSite(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 512) return null;
  try {
    const url = new URL(value);
    const host = url.hostname;
    if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/') return null;
    if (isIP(host.replace(/^\[|\]$/g, '')) || !host.includes('.') || !/^[a-z0-9.-]+$/.test(host)) return null;
    if (host.endsWith('.') || /\.(?:local|localhost|internal|test|invalid)$/.test(host)) return null;
    if (url.origin === serverOrigin() || url.origin === websiteOrigin()) return null;
    return url.origin;
  } catch { return null; }
}
function challengeFor(verifier: string): string {
  return createHash('sha256').update(verifier).digest('base64url');
}
/** A registered route is an exact same-origin path, never a redirect target
 * supplied by the browser. Reject alternate spellings before URL normalization. */
function sitePath(value: unknown, fallback: string): string | null {
  const path = value === undefined ? fallback : value;
  if (typeof path !== 'string' || path.length > 512 || !/^\/(?:[A-Za-z0-9._~-]+\/)*[A-Za-z0-9._~-]+$/.test(path)) return null;
  return path.split('/').some(part => part === '.' || part === '..') ? null : path;
}
export type ConnectedWebsite = { site: string; manifest_url: string; callback_uri: string | null; verified: true };
function siteRoutes(site: Site): ConnectedWebsite | null {
  const origin = canonicalSite(site.site);
  const manifest = sitePath(site.manifest_path, MANIFEST_PATH);
  const callbackPath = site.callback_path == null ? null : sitePath(site.callback_path, '');
  if (!origin || !manifest?.endsWith('.json') || site.callback_path != null && !callbackPath) return null;
  return { site: origin, manifest_url: new URL(manifest, origin).toString(), callback_uri: callbackPath ? new URL(callbackPath, origin).toString() : null, verified: true };
}
/** Metadata lookup only. No website fetch, content proxy or permission grant.
 * This is a currently operated connection, so expiry removes the listing and
 * resolver together. Previously copied public addresses remain ordinary URLs. */
export async function connectedWebsite(author: string, ownerGithubId?: string): Promise<ConnectedWebsite | null> {
  const site = await getSite(author);
  if (!site?.verified_at) return null;
  const publisher = await sitePublisher(site);
  if (!publisher || ownerGithubId !== undefined && String(publisher.github_id) !== ownerGithubId) return null;
  const membership = await resolveMembership(publisher);
  if (!membership.available) fail(503, 'The website connection could not be checked. Try again.');
  if (!membership.active) return null;
  return siteRoutes(site);
}
/** One routing query for directory admission. These are candidates, not a
 * public roster: the caller must check reader and publisher membership before
 * returning any row, and match the immutable owner rather than only a slug. */
export async function directoryWebsiteCandidates(authors: string[]): Promise<Map<string, { ownerKey: string; listed: boolean; routes: ConnectedWebsite }>> {
  if (!authors.length) return new Map();
  if (authors.length > 26) throw new Error('Directory routing page exceeds its bound.');
  const rows = await getDB().prepare(`SELECT * FROM visitor_connector_sites WHERE verified_at IS NOT NULL
    AND author IN (${authors.map(() => '?').join(',')})`).bind(...authors).all<Site>();
  const sites = new Map<string, { ownerKey: string; listed: boolean; routes: ConnectedWebsite }>();
  for (const row of rows.results || []) {
    const routes = siteRoutes(row);
    if (routes) sites.set(row.author, { ownerKey: row.owner_id, listed: row.listed === 1, routes });
  }
  return sites;
}
async function readBoundedJson(response: Response, maxBytes = 8192): Promise<unknown> {
  if (!response.ok || !response.body) throw new Error('Unreadable response');
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.length;
      if (size > maxBytes) throw new Error('Response too large');
      chunks.push(value);
    }
  } finally { await reader.cancel(); }
  const body = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { body.set(chunk, offset); offset += chunk.length; }
  return JSON.parse(new TextDecoder().decode(body));
}
async function body(c: Context): Promise<Record<string, unknown>> {
  if (!c.req.header('content-type')?.startsWith('application/json')) fail(400, 'JSON required.');
  try {
    const value = await readBoundedJson(new Response(c.req.raw.body), 8192);
    if (!value || typeof value !== 'object' || Array.isArray(value)) fail(400, 'Invalid request.');
    return value as Record<string, unknown>;
  } catch { return fail(400, 'Invalid request.'); }
}
async function getSite(author: string): Promise<Site | null> {
  return getDB().prepare('SELECT * FROM visitor_connector_sites WHERE author = ?').bind(author).first<Site>();
}
async function sitePublisher(site: Site): Promise<Account | null> {
  // Keep renamed aliases bound to their original account; a stale registration
  // cannot borrow a different account's membership through a recycled handle.
  if (await getLoginIndex(site.author) !== site.owner_id) return null;
  return await loadAccount(site.owner_id) as Account | null;
}
async function registeredSite(author: string, origin: string): Promise<Site & { publisherId: string }> {
  const site = await getSite(author);
  if (!site || !site.verified_at || site.site !== origin) fail(403, 'This website is not connected.');
  if (!siteRoutes(site)) fail(403, 'This website registration is invalid.');
  if (!site.callback_path) fail(403, 'This public mirror has no reader sign-in connection.');
  const publisher = await sitePublisher(site);
  if (!publisher) fail(403, 'This website is not connected.');
  // The paid service is the currently operated connection. Cancellation does
  // not affect independently hosted public content or the owner's files.
  const membership = await resolveMembership(publisher);
  if (!membership.available) fail(503, 'The website connection could not be checked. Try again.');
  if (!membership.active) fail(402, 'This website connection is inactive.');
  return { ...site, publisherId: String(publisher.github_id) };
}
async function owner(c: Context): Promise<{ account: Account; storeKey: string }> {
  // Cookie-only requests cannot register or revoke a site. This is a deliberate
  // owner action performed by the Author's trusted CLI, not a visitor privilege.
  const auth = await requireAuth(c);
  if (!auth) fail(401, 'Owner API key required.');
  // A GitHub login can be recycled. Its sticky identity binding must still
  // belong to this account before that slug can acquire a website.
  const storeKey = await getLoginIndex(auth.account.github_login);
  const boundOwner = storeKey ? await loadAccount(storeKey) as Account | null : null;
  if (!storeKey || !boundOwner || boundOwner.github_id !== auth.account.github_id
    || boundOwner.github_login !== auth.account.github_login) fail(403, 'This Author identity does not belong to the account.');
  return { account: auth.account, storeKey };
}
async function activeOwner(c: Context): Promise<{ account: Account; storeKey: string }> {
  const identity = await owner(c);
  const membership = await resolveMembership(identity.account);
  if (!membership.available) fail(503, 'Membership could not be checked. Try again.');
  if (!membership.active) fail(402, 'An active Connector membership is needed to connect a website.');
  return identity;
}
function validAuthor(value: unknown): value is string {
  return typeof value === 'string' && AUTHOR.test(value);
}
function callback(site: Site, params: Record<string, string>): string {
  const url = new URL(siteRoutes(site)!.callback_uri!);
  for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
  return url.toString();
}
function isReaderRoute(c: Context, author: string): boolean {
  const path = new URL(c.req.url).pathname;
  if (c.req.method === 'GET' && path === '/library/session') return true;
  if (c.req.method === 'GET' && path === `/connect/access/${author}`) return true;
  if (c.req.method === 'GET' && path === `/library/${author}`) return true;
  if (c.req.method === 'POST' && path === `/library/${author}/ask`) return true;
  if (c.req.method !== 'GET' || !path.startsWith(`/library/${author}/file/`)) return false;
  const file = path.slice(`/library/${author}/file/`.length);
  // One exact file, no decoded slash, path traversal or ambiguous path spelling.
  try { return !!file && !/[\/\\\x00-\x1f]/.test(decodeURIComponent(file)) && !['.', '..'].includes(decodeURIComponent(file)); }
  catch { return false; }
}

/** Call this once in request middleware BEFORE every route, including owner
 * routes. Absence is anonymous; malformed/expired credentials fail closed. */
export async function resolveConnectorViewer(c: Context): Promise<ConnectorViewer | null> {
  const token = c.req.header('X-Alexandria-Visitor');
  const siteHeader = c.req.header('X-Alexandria-Site');
  if (token === undefined && siteHeader === undefined) return null;
  if (!token || !siteHeader || token.length > 4096 || !token.startsWith('av1.')) fail(401, 'Invalid website session.');
  const value = unseal<Visitor>(token.slice(4));
  if (!value || value.type !== 'visitor-v1' || !validAuthor(value.author)
    || typeof value.site !== 'string' || typeof value.session !== 'string'
    || typeof value.expires_at !== 'number' || value.expires_at <= Date.now()
    || value.site !== siteHeader) fail(401, 'Invalid website session.');
  const origin = c.req.header('Origin');
  if (origin && origin !== value.site) fail(403, 'Website origin does not match.');
  if (!isReaderRoute(c, value.author)) fail(403, 'This website session can only read and ask this Author.');
  const registration = await registeredSite(value.author, value.site);
  if (!safeEqual(registration.version, value.version)) fail(401, 'This website session was revoked.');
  const account = await findByLibrarySessionToken(value.session);
  if (!account || account.github_id !== value.account_id) fail(401, 'Sign in again.');
  // Downstream permission decisions can reuse the publisher check already
  // performed for this request; no entitlement is stored in the credential.
  c.set('connectorPublisherId', registration.publisherId);
  // Return current account status. Existing reader routes still resolve current
  // membership and exact per-artifact grants; this is identity, not permission.
  return { ...account, library_reader_only: true };
}

export function registerVisitorConnectorRoutes(app: Hono): void {
  app.use('/connect/*', async (c, next) => {
    c.header('Cache-Control', 'no-store');
    c.header('Referrer-Policy', 'no-referrer');
    await next();
  });

  app.post('/connect/site', async c => {
    const { account, storeKey } = await activeOwner(c);
    const input = await body(c);
    const site = canonicalSite(input.site);
    const manifestPath = sitePath(input.manifest_path, MANIFEST_PATH);
    const callbackPath = input.callback_path == null ? null : sitePath(input.callback_path, '');
    const listed = input.listed === true;
    if (!site || !validAuthor(account.github_login)) fail(400, 'Use a public HTTPS website origin.');
    if (!manifestPath?.endsWith('.json') || input.callback_path != null && !callbackPath || manifestPath === callbackPath) fail(400, 'Use a same-origin manifest JSON path and, only for reader sign-in, a distinct callback path.');
    if (input.listed !== undefined && typeof input.listed !== 'boolean') fail(400, 'Choose whether to list this website in the member directory.');
    const existing = await getSite(account.github_login);
    if (existing?.verified_at && existing.owner_id === storeKey && existing.site === site
      && existing.manifest_path === manifestPath && existing.callback_path === callbackPath) {
      // Retrying an installation cannot disconnect readers or demand another
      // DNS change. Directory consent alone does not change credential scope.
      const existingListed = input.listed === undefined ? existing.listed === 1 : listed;
      const updated = await getDB().prepare(`UPDATE visitor_connector_sites SET listed = ?
        WHERE author = ? AND owner_id = ? AND version = ? RETURNING author`)
        .bind(Number(existingListed), existing.author, existing.owner_id, existing.version).first<{ author: string }>();
      if (!updated) fail(400, 'The registration changed. Try again.');
      return c.json({ author: existing.author, ...siteRoutes(existing)!, listed: existingListed });
    }
    const challenge = generateToken(32);
    const version = generateToken(24);
    const expires = Date.now() + PROOF_TTL_MS;
    await getDB().prepare(`INSERT INTO visitor_connector_sites
      (author, owner_id, site, manifest_path, callback_path, listed, version, challenge_hash, challenge_expires_at, verified_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, NULL)
      ON CONFLICT(author) DO UPDATE SET owner_id = excluded.owner_id, site = excluded.site,
      manifest_path = excluded.manifest_path, callback_path = excluded.callback_path, listed = excluded.listed,
      version = excluded.version, challenge_hash = excluded.challenge_hash,
      challenge_expires_at = excluded.challenge_expires_at, verified_at = NULL`)
      .bind(account.github_login, storeKey, site, manifestPath, callbackPath, Number(listed), version, hashApiKey(challenge), expires).run();
    return c.json({ author: account.github_login, site, verified: false, listed, manifest_url: new URL(manifestPath, site).toString(), callback_uri: callbackPath ? new URL(callbackPath, site).toString() : null,
      verification: { type: 'dns-txt', name: `_alexandria.${new URL(site).hostname}`, value: `alexandria=${challenge}`, expires_at: new Date(expires).toISOString() } });
  });

  app.post('/connect/site/verify', async c => {
    const { account, storeKey } = await activeOwner(c);
    const input = await body(c);
    const site = await getSite(account.github_login);
    if (!site || site.owner_id !== storeKey || canonicalSite(input.site) !== site.site) fail(400, 'Register this website first.');
    if (site.verified_at) return c.json({ author: site.author, site: site.site, verified: true });
    if (site.challenge_expires_at <= Date.now()) fail(400, 'Register the website again to renew its proof.');
    const dns = new URL(DNS_ENDPOINT);
    dns.searchParams.set('name', `_alexandria.${new URL(site.site).hostname}`);
    dns.searchParams.set('type', 'TXT');
    let records: { Status?: number; Answer?: Array<{ type?: number; data?: string }> };
    try {
      records = await readBoundedJson(await fetch(dns, { headers: { Accept: 'application/dns-json' }, redirect: 'error', signal: AbortSignal.timeout(5000) })) as typeof records;
    } catch { return c.json({ error: 'Could not verify the DNS record. Try again.' }, 503); }
    const found = records && records.Status === 0 && Array.isArray(records.Answer) && records.Answer.some(record => {
      if (record.type !== 16 || typeof record.data !== 'string') return false;
      // DNS JSON quotes TXT chunks; our short ASCII proof must fit one chunk.
      const match = /^"?alexandria=([a-f0-9]{64})"?$/.exec(record.data);
      return !!match && safeEqual(hashApiKey(match[1]), site.challenge_hash);
    });
    if (!found) fail(400, 'The website proof is not present in DNS yet.');
    const updated = await getDB().prepare(`UPDATE visitor_connector_sites SET verified_at = ?
      WHERE author = ? AND version = ? AND challenge_expires_at > ? RETURNING author`)
      .bind(Date.now(), site.author, site.version, Date.now()).first<{ author: string }>();
    if (!updated) fail(400, 'The registration changed. Start again.');
    return c.json({ author: site.author, site: site.site, verified: true });
  });

  app.delete('/connect/site', async c => {
    const { account, storeKey } = await owner(c);
    await getDB().prepare('DELETE FROM visitor_connector_sites WHERE author = ? AND owner_id = ?')
      .bind(account.github_login, storeKey).run();
    return c.json({ ok: true });
  });

  app.get('/connect/site/:author', async c => {
    const author = c.req.param('author');
    if (!validAuthor(author)) fail(400, 'Invalid Author.');
    const site = await connectedWebsite(author);
    return c.json(site ? { author, ...site } : { author, verified: false });
  });

  app.get('/connect/authorize', async c => {
    const author = c.req.query('author');
    const site = canonicalSite(c.req.query('site'));
    const state = c.req.query('state') || '';
    const challenge = c.req.query('code_challenge') || '';
    if (!validAuthor(author) || !site || !/^[A-Za-z0-9_-]{16,128}$/.test(state)
      || !PKCE_CHALLENGE.test(challenge) || c.req.query('code_challenge_method') !== 'S256') fail(400, 'Invalid website connection.');
    const registered = await registeredSite(author, site);
    const session = extractLibrarySessionToken(c);
    const account = session ? await findByLibrarySessionToken(session) : null;
    if (!session || !account) {
      const next = new URL('/library/connect', websiteOrigin());
      for (const [name, value] of Object.entries({ author, site, state, code_challenge: challenge, code_challenge_method: 'S256' })) next.searchParams.set(name, value);
      const login = new URL('/auth/github', serverOrigin());
      login.searchParams.set('intent', 'library');
      login.searchParams.set('next', next.pathname + next.search);
      return c.redirect(login.toString(), 303);
    }
    const intent: Intent = { type: 'visitor-intent-v1', author, site, version: registered.version, state,
      challenge, session_hash: hashApiKey(session), expires_at: Date.now() + INTENT_TTL_MS };
    const sealed = encrypt(JSON.stringify(intent));
    return c.html(`<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>connect this website</title><style>body{max-width:32rem;margin:12vh auto;padding:1.5rem;background:#fafafa;color:#211e18;font:20px/1.5 Georgia,serif}h1{font-size:1.6em;font-weight:400}button{font:inherit;background:none;border:1px solid #cfc8ba;border-radius:4px;padding:.5rem 1rem;cursor:pointer;margin:.5rem .7rem .5rem 0}button[value=allow]{background:#004996;color:white;border-color:#004996}small{color:#777}a{color:#004996}strong{overflow-wrap:anywhere}</style><h1>connect this website</h1><p>Let <strong>${html(site)}</strong> show you the parts of <strong>${html(author)}</strong>’s mirror you can access, and let you ask it questions.</p><p>Your current access still applies. This website gets no permission to publish, manage your account, or read other Authors.</p><small>Signed in as ${html(account.github_login)}. Lasts up to eight hours; signing out of Alexandria ends this connection.</small><form method="post" action="/connect/authorize"><input type="hidden" name="intent" value="${html(sealed)}"><button name="decision" value="allow">connect</button><button name="decision" value="deny">cancel</button></form></html>`);
  });

  app.post('/connect/authorize', async c => {
    if (c.req.header('Origin') !== serverOrigin()) fail(403, 'Use the connection page to continue.');
    if (!c.req.header('content-type')?.startsWith('application/x-www-form-urlencoded')) fail(400, 'Invalid consent form.');
    const bytes = await c.req.text();
    if (bytes.length > 8192) fail(400, 'Invalid consent form.');
    const form = new URLSearchParams(bytes);
    const intent = unseal<Intent>(form.get('intent') || '');
    const session = extractLibrarySessionToken(c);
    if (!intent || intent.type !== 'visitor-intent-v1' || typeof intent.expires_at !== 'number' || intent.expires_at <= Date.now()
      || !session || !safeEqual(intent.session_hash, hashApiKey(session))) fail(401, 'The connection expired. Start again.');
    const account = await findByLibrarySessionToken(session);
    if (!account) fail(401, 'Sign in again.');
    const registered = await registeredSite(intent.author, intent.site);
    if (!safeEqual(registered.version, intent.version)) fail(401, 'The website connection changed. Start again.');
    if (form.get('decision') === 'deny') return c.redirect(callback(registered, { error: 'access_denied', state: intent.state }), 303);
    if (form.get('decision') !== 'allow') fail(400, 'Choose whether to connect.');
    const code = `avc_${generateToken(32)}`;
    const now = Date.now();
    const value: Visitor = { type: 'visitor-v1', author: intent.author, site: intent.site, version: intent.version,
      account_id: account.github_id, session, expires_at: now + VISITOR_TTL_MS };
    await getDB().batch([
      getDB().prepare('DELETE FROM visitor_connector_codes WHERE expires_at <= ?').bind(now),
      getDB().prepare(`INSERT INTO visitor_connector_codes (code_hash, author, reader_id, site, challenge, context, expires_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`).bind(hashApiKey(code), intent.author, String(account.github_id), intent.site, intent.challenge, encrypt(JSON.stringify(value)), now + INTENT_TTL_MS),
    ]);
    return c.redirect(callback(registered, { code, state: intent.state }), 303);
  });

  app.post('/connect/token', async c => {
    // Intended for the independent website's server. Browser cross-origin reads
    // are not enabled, and no browser owner cookies are used on this route.
    const input = await body(c);
    const site = canonicalSite(input.site);
    if (!validAuthor(input.author) || !site || typeof input.code !== 'string' || !/^avc_[a-f0-9]{64}$/.test(input.code)
      || typeof input.code_verifier !== 'string' || !/^[A-Za-z0-9._~-]{43,128}$/.test(input.code_verifier)) fail(400, 'Invalid code exchange.');
    const registered = await registeredSite(input.author, site);
    // PKCE/site/author are checked in the same atomic SQL statement as consume.
    // Invalid attempts do not burn a legitimate code; concurrent valid attempts
    // can return its encrypted context to exactly one caller.
    const row = await getDB().prepare(`DELETE FROM visitor_connector_codes
      WHERE code_hash = ? AND author = ? AND site = ? AND challenge = ? AND expires_at > ?
      RETURNING context`).bind(hashApiKey(input.code), input.author, site, challengeFor(input.code_verifier), Date.now()).first<{ context: string }>();
    const value = row ? unseal<Visitor>(row.context) : null;
    if (!value || value.type !== 'visitor-v1' || value.expires_at <= Date.now() || !safeEqual(value.version, registered.version)) fail(401, 'This connection code is invalid or expired.');
    const account = await findByLibrarySessionToken(value.session);
    if (!account || account.github_id !== value.account_id) fail(401, 'Sign in again.');
    return c.json({ visitor_token: `av1.${encrypt(JSON.stringify(value))}`, token_type: 'Alexandria-Visitor',
      expires_in: Math.floor((value.expires_at - Date.now()) / 1000), author: value.author, site: value.site, scope: 'read ask' });
  });
}
