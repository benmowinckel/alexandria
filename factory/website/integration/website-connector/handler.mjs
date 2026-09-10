/** Optional owner-hosted mirror. No framework, account, provider, pages or
 * company connection is required. The paid Connector is an explicit adapter. */
import { publicMirrorSystem } from '../../shared/mirror-context.mjs';

const encoder = new TextEncoder();
const scopePattern = /^(public|authors|invite|paid)(\/[a-z0-9][a-z0-9-]{0,63})*$/;
const namePattern = /^[a-z0-9][a-z0-9-]{0,63}$/;
const privateHeaders = { 'Cache-Control': 'private, no-store', 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer' };
const publicHeaders = { 'Cache-Control': 'public, max-age=0, must-revalidate', 'X-Content-Type-Options': 'nosniff' };
const flowSeconds = 300;
const maxBody = 128 * 1024;
const maxFile = 4 * 1024 * 1024;

function json(data, status = 200, headers = privateHeaders) { return Response.json(data, { status, headers }); }
function failure(status, reason, message) { return json({ error: message, reason }, status); }
function exactScope(value) { return typeof value === 'string' && value.length <= 200 && scopePattern.test(value); }
function random() { return Array.from(crypto.getRandomValues(new Uint8Array(24)), byte => byte.toString(16).padStart(2, '0')).join(''); }
function base64url(bytes) { return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
export async function sha256(bytes) { return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)), byte => byte.toString(16).padStart(2, '0')).join(''); }
async function challenge(value) { return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(value))))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); }
function matches(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  let difference = 0;
  for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return difference === 0;
}
function cookieValue(request, name) {
  const values = (request.headers.get('cookie') || '').split(';').map(item => item.trim()).filter(item => item.startsWith(`${name}=`));
  return values.length === 1 ? values[0].slice(name.length + 1) : '';
}
function safeNext(value, site, prefix) {
  if (!value || value.length > 1024 || !value.startsWith('/') || value.startsWith('//') || /[\\\r\n]/.test(value)) return '/';
  const next = new URL(value, site);
  return next.origin === site && next.pathname !== prefix && !next.pathname.startsWith(`${prefix}/`) ? next.pathname + next.search : '/';
}
async function readBytes(body, limit) {
  if (!body) return new Uint8Array();
  const reader = body.getReader(), chunks = [];
  let length = 0;
  try {
    while (true) {
      const { value, done } = await reader.read();
      if (done) break;
      length += value.byteLength;
      if (length > limit) throw new Error('Body too large');
      chunks.push(value);
    }
  } finally { await reader.cancel().catch(() => {}); }
  const result = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.byteLength; }
  return result;
}
async function readJson(response, limit = 16_384) {
  return JSON.parse(new TextDecoder().decode(await readBytes(response.body, limit)));
}

/** Small single-process default. A multi-instance/serverless deployment must
 * inject its own shared store with an atomic take (read-and-delete). Restarting
 * this default forgets pending sign-ins safely; it does not grant access. */
export function memoryFlows({ max = 1024, now = Date.now } = {}) {
  const pending = new Map();
  return {
    async put(id, value) {
      for (const [key, flow] of pending) if (now() - flow.created >= flowSeconds * 1000) pending.delete(key);
      if (pending.size >= max) throw new Error('Too many pending sign-ins');
      pending.set(id, value);
    },
    async take(id) { const flow = pending.get(id); pending.delete(id); return flow || null; },
  };
}

/** publications.list() returns only deliberately published inventory metadata:
 * {name, scope, title?, category?, format:'md'|'pdf', sha256?}.
 * publications.read(file) returns Uint8Array or text from the owner's storage.
 * infer({author, question, messages, works, focus?, system, signal}) returns {answer}
 * or {error, reason, status}. It owns model limits and identity enforcement.
 * It receives only selected current-reader-permitted text, never credentials.
 * Return null outside the mount so the existing host handles its own routes. */
export function createWebsiteMirror(options) {
  const { name, publications, infer, authorize, now = Date.now } = options;
  const connection = options.connector || null;
  if (connection && (typeof connection !== 'object' || Array.isArray(connection))) throw new Error('connector must be an explicit configuration object');
  if (authorize !== undefined && typeof authorize !== 'function') throw new Error('authorize must be the owner access-check function');
  if (connection && authorize) throw new Error('Choose the owner access check or the shared Connector, not both');
  const author = connection?.author;
  const upstream = connection?.fetch || globalThis.fetch;
  const siteUrl = new URL(options.site);
  const site = siteUrl.origin;
  const local = options.development === true && siteUrl.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(siteUrl.hostname);
  if ((!local && siteUrl.protocol !== 'https:') || siteUrl.username || siteUrl.password || siteUrl.pathname !== '/' || siteUrl.search || siteUrl.hash) throw new Error('site must be the canonical HTTPS origin (explicit loopback development is allowed)');
  if (typeof name !== 'string' || !name.trim() || name.length > 150) throw new Error('A display name is required');
  if (connection && (typeof author !== 'string' || !/^[a-z0-9][a-z0-9-]{0,38}$/.test(author))) throw new Error('The Connector needs the exact registered author');
  const prefix = options.prefix || '/_alexandria';
  if (prefix.length > 400 || !/^\/(?:[A-Za-z0-9_~-]+)(?:\/[A-Za-z0-9_~-]+)*$/.test(prefix)) throw new Error('prefix must be an unused absolute path without trailing slash');
  if (typeof publications?.list !== 'function' || typeof publications?.read !== 'function') throw new Error('Provide the owner publication storage callbacks');
  const scopes = options.inferenceScopes || ['public'];
  if (!Array.isArray(scopes) || !scopes.length || scopes.length > 64 || !scopes.every(exactScope)) throw new Error('inferenceScopes must be exact publication scopes');
  const configuredScopes = new Set(scopes);
  if (connection?.flowSecret !== undefined && (typeof connection.flowSecret !== 'string' || encoder.encode(connection.flowSecret).length < 32)) throw new Error('flowSecret must contain at least 32 random bytes of secret text');
  if (connection?.flowSecret && connection.flows) throw new Error('Choose a sealed flow cookie or a shared atomic flow store');
  const flows = connection?.flows || (connection && local && !connection.flowSecret ? memoryFlows({ now }) : null);
  // Serverless sites can keep the short-lived PKCE state in an authenticated,
  // encrypted cookie using their own stable secret, without adding a database.
  // Single-use code redemption stays atomic at the shared Connector server.
  const flowBinding = encoder.encode(`${author}\n${site}\n${prefix}`);
  const flowKey = connection?.flowSecret ? crypto.subtle.digest('SHA-256', encoder.encode(connection.flowSecret)).then(hash => crypto.subtle.importKey('raw', hash, 'AES-GCM', false, ['encrypt', 'decrypt'])) : null;
  async function saveFlow(flow) {
    if (flows) { const id = random(); await flows.put(id, flow); return id; }
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const sealed = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: flowBinding }, await flowKey, encoder.encode(JSON.stringify(flow))));
    const payload = new Uint8Array(iv.length + sealed.length);
    payload.set(iv); payload.set(sealed, iv.length);
    return base64url(payload);
  }
  async function takeFlow(value) {
    if (flows) return /^[a-f0-9]{48}$/.test(value) ? flows.take(value) : null;
    if (!flowKey || !/^[A-Za-z0-9_-]{40,4000}$/.test(value)) return null;
    try {
      const bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), character => character.charCodeAt(0));
      const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: bytes.subarray(0, 12), additionalData: flowBinding }, await flowKey, bytes.subarray(12));
      return JSON.parse(new TextDecoder().decode(plain));
    } catch { return null; }
  }
  // These are deployment configuration, never request-supplied URLs.
  const api = connection ? new URL(connection.api || 'https://api.alexandria-library.com') : null;
  const company = connection ? new URL(connection.company || 'https://alexandria-library.com') : null;
  for (const url of [api, company].filter(Boolean)) if (url.protocol !== 'https:' || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('Connector URLs must be HTTPS origins');
  // Different mounts cannot overwrite each other's cookies. __Host forbids
  // domain cookies on production; Path=/ is required by that browser contract.
  const tag = `${author}-${base64url(encoder.encode(prefix))}`;
  const flowCookie = `${local ? '' : '__Host-'}alexandria-${tag}-flow`;
  const visitorCookie = `${local ? '' : '__Host-'}alexandria-${tag}-visitor`;
  const cookie = (key, value, seconds) => `${key}=${value}; Path=/; Max-Age=${seconds}; HttpOnly; SameSite=Lax${local ? '' : '; Secure'}`;
  const redirect = (location, cookies = []) => {
    const headers = new Headers({ ...privateHeaders, Location: location });
    for (const value of cookies) headers.append('Set-Cookie', value);
    return new Response(null, { status: 303, headers });
  };
  const call = (path, init) => upstream(new URL(path, api), { ...init, cache: 'no-store', redirect: 'error', signal: AbortSignal.timeout(12_000) });

  async function inventory() {
    const files = await publications.list();
    if (!Array.isArray(files) || files.length > 250) throw new Error('Publication inventory exceeds 250 items');
    const keys = new Set();
    return files.map(file => {
      if (!file || !namePattern.test(file.name) || !exactScope(file.scope) || !['md', 'pdf'].includes(file.format) || (file.sha256 !== undefined && !/^[a-f0-9]{64}$/.test(file.sha256))) throw new Error('Invalid publication inventory');
      const key = `${file.scope}/${file.name}`;
      if (keys.has(key)) throw new Error('Duplicate publication identity');
      keys.add(key);
      return { name: file.name, scope: file.scope, format: file.format, sha256: file.sha256,
        title: typeof file.title === 'string' ? file.title.slice(0, 300) : file.name,
        category: typeof file.category === 'string' ? file.category.slice(0, 80) : 'shadows' };
    });
  }
  async function contents(file) {
    const raw = await publications.read(file);
    const bytes = typeof raw === 'string' ? encoder.encode(raw) : raw;
    if (!(bytes instanceof Uint8Array) || bytes.byteLength > maxFile) throw new Error('Publication missing or larger than 4 MiB');
    if (file.sha256 && await sha256(bytes) !== file.sha256) throw new Error('Publication hash mismatch');
    return bytes;
  }
  async function access(request, scope) {
    if (scope.split('/')[0] === 'public') return null;
    if (authorize) {
      // The owner's existing authentication stays theirs. Require an exact
      // boolean verdict before even listing or reading protected material.
      try { return await authorize(request, scope) === true ? null : failure(403, 'access_denied', 'Access denied.'); }
      catch { return failure(503, 'access_unavailable', 'Current access could not be checked.'); }
    }
    if (!connection) return failure(403, 'scope_unavailable', 'This mirror has not configured protected access.');
    const token = cookieValue(request, visitorCookie);
    if (!/^av1\.[A-Za-z0-9._~-]{1,8000}$/.test(token)) return failure(401, 'unauthenticated', 'Connect your reader identity to check access.');
    const query = new URLSearchParams({ scope });
    const invite = new URL(request.url).searchParams.get('invite');
    if (invite && scope.split('/')[0] === 'invite') {
      if (invite.length > 256) return failure(400, 'invalid_invite', 'Invalid invite code.');
      query.set('invite', invite);
    }
    try {
      const response = await call(`/connect/access/${author}?${query}`, { headers: { 'X-Alexandria-Visitor': token, 'X-Alexandria-Site': site } });
      const result = await readJson(response);
      if (response.ok && result.author === author && result.scope === scope && result.allowed === true) return null;
      const reasons = { invalid_invite: 400, unauthenticated: 401, invite_required: 401, membership_required: 402, payment_required: 402, unknown_visibility: 403, membership_unavailable: 503 };
      if (result.author === author && result.scope === scope && result.allowed === false && reasons[result.reason] === response.status) {
        return failure(response.status, result.reason, 'The reader does not currently have access to this exact material.');
      }
      if (response.status === 401) return failure(401, 'unauthenticated', 'Reconnect your reader identity.');
      if (response.status === 402) return failure(402, 'connection_inactive', 'This website’s Alexandria connection is inactive.');
      if (response.status === 403) return failure(403, 'access_denied', 'Access denied.');
    } catch { /* Never fall back to a stale permission or owner key. */ }
    return failure(503, 'connection_unavailable', 'Current access could not be checked.');
  }

  return async function handle(request) {
    const url = new URL(request.url);
    if (url.pathname !== prefix && !url.pathname.startsWith(`${prefix}/`)) return null;
    if (url.origin !== site) return failure(400, 'wrong_origin', 'Use the configured website origin.');
    if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(request.method) && request.headers.get('origin') !== site) return failure(403, 'wrong_origin', 'Submit this request from this website.');
    const route = url.pathname.slice(prefix.length);
    try {
      if (request.method === 'GET' && route === '/manifest.json') {
        const files = (await inventory()).filter(file => file.scope.split('/')[0] === 'public');
        return json({ name, website: `${site}/`, ...(author ? { author } : {}),
          mirror: typeof infer === 'function' ? { ask_url: `${site}${prefix}/ask` } : null,
          files: files.map(file => ({ name: file.name, title: file.title, category: file.category, scope: file.scope, visibility: 'public',
            content_url: `${site}${prefix}/files/${file.scope}/${file.name}.${file.format}`,
            ...(file.sha256 ? { sha256: file.sha256 } : {}) })),
        }, 200, publicHeaders);
      }
      if (request.method === 'GET' && route.startsWith('/files/')) {
        // Find only an exact inventory address. No URL decoding, filesystem
        // traversal, arbitrary storage key or substring/prefix scope matching.
        const match = /^\/files\/(.+)\/([a-z0-9][a-z0-9-]{0,63})\.(md|pdf)$/.exec(route);
        if (!match || !exactScope(match[1])) return failure(404, 'not_found', 'Publication not found.');
        const denied = await access(request, match[1]);
        if (denied) return denied;
        const file = (await inventory()).find(item => `/files/${item.scope}/${item.name}.${item.format}` === route);
        if (!file) return failure(404, 'not_found', 'Publication not found.');
        const headers = file.scope.split('/')[0] === 'public' ? publicHeaders : privateHeaders;
        return new Response(await contents(file), { headers: { ...headers, 'Content-Type': file.format === 'md' ? 'text/markdown; charset=utf-8' : 'application/pdf' } });
      }
      if (request.method === 'GET' && route === '/sign-in' && connection) {
        if (!flows && !flowKey) return failure(503, 'sign_in_unconfigured', 'The website owner has not configured reader sign-in.');
        const state = random(), verifier = random();
        const flow = { state, verifier, next: safeNext(url.searchParams.get('next'), site, prefix), created: now() };
        const saved = await saveFlow(flow);
        const target = new URL('/library/connect', company);
        target.search = new URLSearchParams({ author, site, state, code_challenge: await challenge(verifier), code_challenge_method: 'S256' }).toString();
        return redirect(target.href, [cookie(flowCookie, saved, flowSeconds)]);
      }
      if (request.method === 'GET' && route === '/callback' && connection) {
        const id = cookieValue(request, flowCookie);
        const flow = await takeFlow(id);
        const clear = cookie(flowCookie, '', 0);
        if (!flow || !/^[a-f0-9]{48}$/.test(flow.verifier) || !matches(flow.state, url.searchParams.get('state')) || typeof flow.created !== 'number' || now() - flow.created >= flowSeconds * 1000 || flow.created > now()) {
          const response = failure(400, 'expired_sign_in', 'This sign-in expired. Start again from this website.');
          response.headers.append('Set-Cookie', clear);
          return response;
        }
        const next = safeNext(flow.next, site, prefix);
        if (url.searchParams.get('error') === 'access_denied') return redirect(new URL(next, site).href, [clear]);
        const code = url.searchParams.get('code') || '';
        if (!/^avc_[a-f0-9]{64}$/.test(code)) return failure(400, 'invalid_code', 'Invalid connection code.');
        const response = await call('/connect/token', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ code, code_verifier: flow.verifier, author, site }) });
        const result = await readJson(response);
        if (!response.ok || result.author !== author || result.site !== site || !/^av1\.[A-Za-z0-9._~-]{1,8000}$/.test(result.visitor_token) || !Number.isInteger(result.expires_in) || result.expires_in <= 0) return failure(401, 'invalid_connection', 'The reader connection could not be verified.');
        return redirect(new URL(next, site).href, [clear, cookie(visitorCookie, result.visitor_token, Math.min(result.expires_in, 28_800))]);
      }
      if (request.method === 'POST' && route === '/sign-out' && connection) {
        const id = cookieValue(request, flowCookie);
        if (flows && /^[a-f0-9]{48}$/.test(id)) await flows.take(id);
        return redirect(`${site}/`, [cookie(visitorCookie, '', 0), cookie(flowCookie, '', 0)]);
      }
      if (request.method === 'POST' && route === '/ask') {
        if (typeof infer !== 'function') return failure(503, 'mirror_unavailable', 'This website has not connected an answering model.');
        if (!request.headers.get('content-type')?.toLowerCase().startsWith('application/json')) return failure(415, 'invalid_content_type', 'Send JSON.');
        let body;
        try { body = await readJson(request, maxBody); } catch { return failure(400, 'invalid_body', 'Send a JSON request smaller than 128 KiB.'); }
        const question = typeof body?.question === 'string' ? body.question.trim() : '';
        if (!question || question.length > 20_000) return failure(400, 'invalid_question', 'Ask a question of at most 20,000 characters.');
        const artifact = body.artifact;
        if (artifact !== undefined && (!artifact || typeof artifact !== 'object' || Array.isArray(artifact) || typeof artifact.name !== 'string' || !namePattern.test(artifact.name) || !exactScope(artifact.scope))) return failure(400, 'invalid_artifact', 'Choose an exact publication name and scope.');
        const selected = body.scopes === undefined ? ['public'] : body.scopes;
        if (!Array.isArray(selected) || !selected.length || selected.length > 64 || !selected.every(scope => exactScope(scope) && configuredScopes.has(scope))) return failure(403, 'scope_unavailable', 'Choose only exact scopes offered by this mirror.');
        if (artifact && !selected.includes(artifact.scope)) return failure(403, 'artifact_outside_context', 'This mirror cannot access that exact piece as text.');
        for (const scope of new Set(selected)) { const denied = await access(request, scope); if (denied) return denied; }
        const works = [];
        const files = (await inventory()).filter(file => selected.includes(file.scope) && file.format === 'md');
        const focusedFile = artifact ? files.find(file => file.name === artifact.name && file.scope === artifact.scope) : null;
        if (artifact && !focusedFile) return failure(403, 'artifact_outside_context', 'This mirror cannot access that exact piece as text.');
        // Resolve the focused piece from owner storage first so the context
        // bound cannot silently replace it with earlier inventory entries.
        const orderedFiles = focusedFile ? [focusedFile, ...files.filter(file => file !== focusedFile)] : files;
        let focus;
        let contextSize = 0;
        for (const file of orderedFiles) {
          if (works.length >= 128 || contextSize >= 750_000) break;
          const content = new TextDecoder().decode(await contents(file)).slice(0, Math.min(50_000, 750_000 - contextSize));
          if (file === focusedFile) {
            if (!content.trim()) return failure(403, 'artifact_outside_context', 'This mirror cannot access that exact piece as text.');
            focus = { name: file.title || file.name, content };
          }
          contextSize += content.length;
          works.push({ name: file.name, title: file.title, category: file.category, scope: file.scope, visibility: file.scope.split('/')[0], content });
        }
        const messages = [];
        let historySize = 0;
        if (Array.isArray(body.messages)) for (const message of body.messages.slice(-20)) {
          if (!message || !['user', 'assistant'].includes(message.role) || typeof message.content !== 'string') continue;
          const content = message.content.slice(0, 8000);
          if (historySize + content.length > 60_000) continue;
          historySize += content.length;
          messages.push({ role: message.role, content });
        }
        const result = await infer({ author: { id: author || site, name }, question, messages, works, ...(focus ? { focus } : {}), system: publicMirrorSystem(name), signal: request.signal });
        if (typeof result?.error === 'string' && [400, 401, 402, 403, 429, 502, 503, 504].includes(result.status)) return failure(result.status, typeof result.reason === 'string' ? result.reason.slice(0, 100) : 'inference_unavailable', result.error.slice(0, 1000));
        if (typeof result?.answer !== 'string' || result.answer.length > 100_000) return failure(502, 'invalid_answer', 'The model did not return a usable answer.');
        return json({ answer: result.answer, ...(author ? { author } : {}), scopes: [...new Set(works.map(work => work.scope))], disclaimer: `ai reflecting ${name}'s published thinking.` });
      }
      return failure(404, 'not_found', 'Mirror endpoint not found.');
    } catch {
      return failure(503, 'unavailable', 'This mirror is temporarily unavailable.');
    }
  };
}

/** Compatibility for sites already using the original connected API. New
 * sites should start with createWebsiteMirror and add connector only by choice. */
export function createWebsiteConnector(options) {
  const { author, api, company, fetch, flows, flowSecret, ...mirror } = options;
  return createWebsiteMirror({ ...mirror, connector: { author, api, company, fetch, flows, flowSecret } });
}
