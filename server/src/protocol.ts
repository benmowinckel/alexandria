/** The Alexandria protocol — incompressible core. */

import type { Hono } from 'hono';
import { requireAuth } from './auth.js';
import { getDB, getR2 } from './db.js';
import { logEvent } from './analytics.js';
import { saveAccount, getKV } from './kv.js';
import { resolveModule, authorFromModuleId, deriveKind } from './marketplace-catalog.js';
import {
  DEFAULT_CONTENT_TYPE,
  isPutWritableContentType,
  PUT_WRITABLE_CONTENT_TYPES,
  r2ExtensionForContentType,
  readProtocolFile,
} from './file-access.js';

export function registerProtocol(app: Hono) {

  // ── File obligation ────────────────────────────────────────────

  app.put('/file/:name', async (c) => {
    const auth = await requireAuth(c);
    if (!auth) return c.text('Unauthorized', 401);
    if (!auth.account.github_id) return c.json({ error: 'Account missing github_id' }, 400);

    const name = c.req.param('name');
    if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name) || name.length > 64)
      return c.json({ error: 'Invalid name (lowercase alphanumeric + hyphens, max 64)' }, 400);

    const body = await c.req.json().catch(() => null);
    const hasText = typeof body?.content === 'string';
    const hasB64 = typeof body?.content_b64 === 'string';
    if (!body || (hasText === hasB64)) {
      return c.json({ error: 'exactly one of content (UTF-8) or content_b64 (base64) required' }, 400);
    }

    const id = String(auth.account.github_id);
    const now = new Date().toISOString();
    const text = typeof body.text === 'string' ? body.text : null;
    const visibility = ['authors', 'public', 'invite', 'paid'].includes(body.visibility) ? body.visibility : 'authors';

    // content_type: absent → markdown default; present → must be one of the
    // types JSON PUT can faithfully carry. Rejecting unsupported types here
    // (rather than silently storing markdown bytes under a .pdf key) means
    // a confused caller sees the error instead of a corrupt file.
    let contentType: string;
    if (body.content_type === undefined || body.content_type === null) {
      contentType = DEFAULT_CONTENT_TYPE;
    } else if (isPutWritableContentType(body.content_type)) {
      contentType = body.content_type;
    } else {
      return c.json({
        error: `content_type ${JSON.stringify(body.content_type)} is not writable via JSON PUT`,
        writable: [...PUT_WRITABLE_CONTENT_TYPES],
      }, 400);
    }
    const ext = r2ExtensionForContentType(contentType);

    // Decode payload to raw bytes for R2 + hashing. Concrete ArrayBuffer
    // (not SharedArrayBuffer) so Web Crypto + R2 accept the Uint8Array
    // directly without a BufferSource cast.
    let bodyBytes: Uint8Array<ArrayBuffer>;
    if (hasB64) {
      try {
        const bin = atob(body.content_b64);
        bodyBytes = new Uint8Array(new ArrayBuffer(bin.length));
        for (let i = 0; i < bin.length; i++) bodyBytes[i] = bin.charCodeAt(i);
      } catch {
        return c.json({ error: 'content_b64 is not valid base64' }, 400);
      }
    } else {
      const encoded = new TextEncoder().encode(body.content);
      bodyBytes = new Uint8Array(new ArrayBuffer(encoded.byteLength));
      bodyBytes.set(encoded);
    }

    // The factory hook reconciles the full Library every session-start by
    // PUT-ing every local file. Hash-compare against the stored row so we
    // skip R2 write, updated_at bump, and analytics event when nothing
    // actually changed — keeps reconciliation cheap and the event log clean.
    const hashBuf = await crypto.subtle.digest('SHA-256', bodyBytes);
    const contentHash = [...new Uint8Array(hashBuf)].map((b) => b.toString(16).padStart(2, '0')).join('');

    const existing = await getDB().prepare(
      'SELECT text, visibility, content_type, content_hash FROM protocol_files WHERE account_id = ? AND name = ?'
    ).bind(id, name).first<{ text: string | null; visibility: string; content_type: string; content_hash: string | null }>();

    if (
      existing
      && existing.content_hash === contentHash
      && existing.visibility === visibility
      && existing.content_type === contentType
      && (existing.text ?? null) === (text ?? null)
    ) {
      return c.json({ ok: true, unchanged: true });
    }

    await getR2().put(`protocol/${id}/${name}.${ext}`, bodyBytes);
    await getDB().prepare(
      `INSERT INTO protocol_files (account_id, name, text, visibility, updated_at, content_type, content_hash)
       VALUES (?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id, name) DO UPDATE SET
         text = COALESCE(excluded.text, protocol_files.text),
         visibility = excluded.visibility,
         updated_at = excluded.updated_at,
         content_type = excluded.content_type,
         content_hash = excluded.content_hash`
    ).bind(id, name, text, visibility, now, contentType, contentHash).run();

    logEvent('protocol_file_published', {
      author: auth.account.github_login,
      name,
      visibility,
      content_type: contentType,
    });

    return c.json({ ok: true });
  });

  app.delete('/file/:name', async (c) => {
    const auth = await requireAuth(c);
    if (!auth) return c.text('Unauthorized', 401);
    if (!auth.account.github_id) return c.json({ error: 'Account missing github_id' }, 400);

    const name = c.req.param('name');
    if (!name || !/^[a-z0-9][a-z0-9-]*$/.test(name) || name.length > 64)
      return c.json({ error: 'Invalid name' }, 400);

    const id = String(auth.account.github_id);

    // R2 keys carry the content-type extension. We don't know which one the
    // file was stored under without consulting D1 first — delete the row,
    // then drop every extension we might have used. Cheap; missing keys are
    // a no-op in R2.
    const existing = await getDB().prepare(
      'SELECT content_type FROM protocol_files WHERE account_id = ? AND name = ?'
    ).bind(id, name).first<{ content_type: string }>();

    if (!existing) return c.json({ ok: true, missing: true });

    await getDB().prepare(
      'DELETE FROM protocol_files WHERE account_id = ? AND name = ?'
    ).bind(id, name).run();

    const r2 = getR2();
    const ext = r2ExtensionForContentType(existing.content_type);
    await r2.delete(`protocol/${id}/${name}.${ext}`);
    // Defensive: if content_type ever drifted vs. R2 key, sweep the other
    // writable extensions too. Idempotent — missing keys cost nothing.
    for (const otherType of PUT_WRITABLE_CONTENT_TYPES) {
      const otherExt = r2ExtensionForContentType(otherType);
      if (otherExt !== ext) await r2.delete(`protocol/${id}/${name}.${otherExt}`);
    }

    logEvent('protocol_file_deleted', {
      author: auth.account.github_login,
      name,
      content_type: existing.content_type,
    });

    return c.json({ ok: true });
  });

  // ── Library: read per Author ───────────────────────────────────

  app.get('/library/:id', async (c, next) => {
    const id = c.req.param('id');
    if (!/^\d+$/.test(id)) return next();

    const auth = await requireAuth(c);
    if (!auth) return c.text('Unauthorized', 401);

    const { results } = await getDB().prepare(
      'SELECT name, text, visibility, updated_at FROM protocol_files WHERE account_id = ?'
    ).bind(id).all<{ name: string; text: string | null; visibility: string; updated_at: string }>();

    if (!results || results.length === 0) return c.json({ error: 'Not found' }, 404);
    return c.json({ account_id: id, files: results });
  });

  app.get('/library/:id/:name', async (c, next) => {
    const id = c.req.param('id');
    const name = c.req.param('name');
    if (!/^\d+$/.test(id)) return next();

    const auth = await requireAuth(c);
    if (!auth) return c.text('Unauthorized', 401);

    // Protocol route is the canonical Author-to-Author interface — free reads
    // only. No purchase/invite tokens are accepted here; paid/invite flow
    // through the website. The gate inside readProtocolFile enforces this.
    const result = await readProtocolFile({
      authorGithubId: id,
      fileName: name,
      accessorGithubId: auth.account.github_id ?? null,
    });

    if (!result.ok) return c.json(result.body, result.status);

    logEvent('protocol_file_view', {
      author_id: id,
      name,
      visibility: result.file.visibility,
      accessor: auth.account.github_login,
      access_reason: result.reason,
    });

    return c.json({
      account_id: id,
      name,
      text: result.file.text,
      visibility: result.file.visibility,
      updated_at: result.file.updated_at,
      content: await result.obj.text(),
    });
  });

  // ── Call obligation ────────────────────────────────────────────

  app.post('/call', async (c) => {
    const auth = await requireAuth(c);
    if (!auth) return c.text('Unauthorized', 401);
    if (!auth.account.github_id) return c.json({ error: 'Account missing github_id' }, 400);

    // Client version heartbeat — /call is the one authed endpoint every install hits
    // regularly. Header absent means either a pre-header bash shim (real upgrade
    // target) or a non-shim client (Claude Desktop/web MCP — node UA — legitimate,
    // never set this header). Split by UA so the stale-shim alarm only fires on
    // the case it can act on.
    const headerVersion = c.req.header('x-alexandria-client');
    const ua = (c.req.header('user-agent') || '').slice(0, 120);
    const clientVersion = headerVersion
      || (ua.toLowerCase().includes('curl') ? 'unset-curl' : 'unset-native');
    const meta: Record<string, string> = {
      author: auth.account.github_login,
      version: clientVersion,
    };
    if (!headerVersion) {
      meta.ip = c.req.header('cf-connecting-ip') || '?';
      meta.ua = ua || '?';
      meta.country = c.req.header('cf-ipcountry') || '?';
    }
    logEvent('client_version_seen', meta);

    // Stale shim / payload version drift flows into client_version_seen above
    // for dashboard visibility. The shim self-updates payload from GitHub on
    // every session-start, so "stuck" versions resolve on their own — no nag.

    // Install ground truth: /call firing proves the shim → payload → auth flow
    // works end-to-end. First successful /call per account stamps installed_at.
    // waitUntil so the KV write doesn't add latency to the /call response.
    if (!auth.account.installed_at) {
      auth.account.installed_at = new Date().toISOString();
      if ((auth.account.install_nudge_count || 0) > 0) {
        auth.account.installed_after_nudge = true;
      }
      const login = auth.account.github_login;
      const accountKey = `github_${auth.account.github_id}`;
      const payload = auth.account as unknown as Record<string, unknown>;
      c.executionCtx.waitUntil(
        saveAccount(accountKey, payload).catch(err => console.error('[install_completed] saveAccount failed:', err))
      );
      logEvent('install_completed', { author: login, after_nudge: auth.account.installed_after_nudge === true ? 'true' : 'false' });
    }

    const body = await c.req.json().catch(() => null);
    if (!body?.modules || !Array.isArray(body.modules))
      return c.json({ error: 'modules required (array of {id, text})' }, 400);

    const id = String(auth.account.github_id);
    const now = new Date().toISOString();
    const db = getDB();

    // Each module: { id: "module_name", text: "why still using / what changed" }
    const rows: { mod: string; text: string }[] = [];
    for (const m of body.modules) {
      if (typeof m === 'object' && m?.id && typeof m.id === 'string' && typeof m.text === 'string') {
        rows.push({ mod: m.id.slice(0, 300), text: m.text.slice(0, 2000) });
      } else if (typeof m === 'string') {
        // Backward compat: bare string = module id with empty text
        rows.push({ mod: m.slice(0, 300), text: '' });
      }
    }
    if (rows.length === 0) return c.json({ error: 'no valid modules' }, 400);

    const inserts = rows.map((r) => db.prepare(
      'INSERT INTO protocol_calls (module_id, account_id, time, text) VALUES (?, ?, ?, ?)'
    ).bind(r.mod, id, now, r.text));
    await db.batch(inserts);
    logEvent('protocol_call', {
      author: auth.account.github_login,
      modules: String(rows.length),
    });

    return c.json({ ok: true });
  });

  // ── Marketplace: browse module usage ───────────────────────────
  //
  // Two routes:
  //   GET /marketplace          — public catalog
  //   GET /marketplace/:module  — auth-required usage history
  //
  // Module bodies live at raw.githubusercontent.com — agents fetch from
  // github directly. The catalog returns metadata only.
  //
  // No /publish endpoint — modules surface via /call. Use is the contribution.

  app.get('/marketplace', async (c, next) => {
    if (new URL(c.req.url).pathname !== '/marketplace') return next();

    // Public listing is the catalog only — module identity, name, description,
    // canonical-or-not, kind. Usage telemetry (counts, recency, per-call text)
    // is private Marketplace Signal exposed only via the auth-gated
    // `/marketplace/:module` endpoint.
    const { results } = await getDB().prepare(
      `SELECT DISTINCT module_id FROM protocol_calls WHERE module_id LIKE 'github:%' LIMIT 1000`
    ).all<{ module_id: string }>();

    const rows = results || [];
    let modules = await Promise.all(rows.map(async (r) => {
      const meta = await resolveModule(r.module_id);
      return {
        id: r.module_id,
        name: meta?.name || r.module_id,
        description: meta?.description || '',
        author_github_login: authorFromModuleId(r.module_id),
        kind: deriveKind(r.module_id),
        status: meta?.status || 'unreachable',
      };
    }));

    // Optional filters — additive query params, no-op when absent.
    const kindFilter = c.req.query('kind');
    if (kindFilter) modules = modules.filter((m) => m.kind === kindFilter);
    const authorFilter = c.req.query('author');
    if (authorFilter) modules = modules.filter((m) => m.author_github_login === authorFilter);

    // Canonical (mowinckelb/alexandria) first, then alphabetical by name.
    modules.sort((a, b) => {
      const aCanon = a.id.startsWith('github:mowinckelb/alexandria#');
      const bCanon = b.id.startsWith('github:mowinckelb/alexandria#');
      if (aCanon !== bCanon) return aCanon ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    // CDN + client cache. Server-side KV cache still front-runs github fetches;
    // this layer lets clients/CDNs hold the assembled JSON for 5 min.
    c.header('Cache-Control', 'public, max-age=300, s-maxage=300');
    // Envelope shape: forward-compat for pagination. `next_cursor` is null
    // today; when paginated, clients that already iterate via cursor
    // continue working unchanged.
    return c.json({ modules, total: modules.length, next_cursor: null });
  });

  app.get('/marketplace/:module', async (c, next) => {
    const module_id = c.req.param('module');
    if (module_id === 'signal') return next();

    const auth = await requireAuth(c);
    if (!auth) return c.text('Unauthorized', 401);

    const { results } = await getDB().prepare(
      'SELECT account_id, time, text FROM protocol_calls WHERE module_id = ? ORDER BY time DESC LIMIT 10000'
    ).bind(module_id).all<{ account_id: string; time: string; text: string | null }>();

    return c.json({ module: module_id, usage: results || [] });
  });
}
