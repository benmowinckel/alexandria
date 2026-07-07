/** The Alexandria protocol — incompressible core. */

import type { Hono } from 'hono';
import { requireAuth, requireAuthor } from './auth.js';
import { getDB, getR2, ensureFilePriceColumn, clampPaidAmount } from './db.js';
import { logEvent } from './analytics.js';
import { saveAccount, getKV } from './kv.js';
import { resolveModule, authorFromModuleId, deriveKind, parseModuleId } from './marketplace-catalog.js';
import {
  DEFAULT_CONTENT_TYPE,
  isPutWritableContentType,
  PUT_WRITABLE_CONTENT_TYPES,
  r2ExtensionForContentType,
  readProtocolFile,
} from './file-access.js';

// Per-account daily rate limit on /call — same self-expiring KV counter idiom
// as library.ts's twin caps, but /call is NOT a paid inference surface (no model
// spend), so it FAILS OPEN: a transient KV error must not block a legitimate
// session-start module report or install-completion. The cap exists only to stop
// a scripted account from flooding D1 (protocol_calls rows) and the public
// marketplace catalog (one permanent entry per distinct module_id). 500/day is
// ~70x the 7-module default manifest that fires once per session-start — ample
// headroom for a many-session power user, while a flood attempt hits the wall.
const CALL_DAILY_CAP_PER_ACCOUNT = 500;

// Read-only: is the account's daily /call ceiling already reached?
async function callDailyCapReached(accountId: string): Promise<boolean> {
  try {
    const raw = await getKV().get(`rate:call:daily:${accountId}`);
    return (raw ? parseInt(raw, 10) : 0) >= CALL_DAILY_CAP_PER_ACCOUNT;
  } catch {
    return false; // FAIL OPEN: /call is a non-cost surface — a KV blip must not block legit module reporting
  }
}

// Increment the daily counter — called only after a call succeeds.
async function bumpCallDaily(accountId: string): Promise<void> {
  try {
    const kv = getKV();
    const key = `rate:call:daily:${accountId}`;
    const raw = await kv.get(key);
    await kv.put(key, String((raw ? parseInt(raw, 10) : 0) + 1), { expirationTtl: 86400 });
  } catch {
    // best effort — a missed increment can only under-count, never open a bigger hole
  }
}

export function registerProtocol(app: Hono) {

  // ── File obligation ────────────────────────────────────────────

  app.put('/file/:name', async (c) => {
    const auth = await requireAuthor(c);
    if (!auth.ok) return c.text(auth.message, auth.status);
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

    // Just-in-time payout gate: marking a file `paid` is the moment the Author
    // needs payouts. Surface a nudge in the response (the agent prompts them to
    // POST /account/connect); the hard backstop is the fail-closed 409 at
    // purchase. Invisible until this moment — never at install.
    const payoutsRequired = visibility === 'paid' && !auth.account.connect_payouts_enabled;

    // Per-file paid price (cents), author-set — this is the "set your price" path
    // (agent-native; no UI). Clamp to $1–$1000 (matches the checkout clamp).
    // Absent → null = don't change a stored price (so the session-start
    // reconciliation re-PUT, which omits it, never wipes it); checkout then
    // falls back to the per-author default, then $2.
    const priceCents = (typeof body.price_cents === 'number' && Number.isFinite(body.price_cents))
      ? clampPaidAmount(Math.round(body.price_cents))
      : null;

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

    // Abuse floor, not a product limit: signup is free (GitHub OAuth only),
    // so without a cap one scripted account could pump unbounded bytes into
    // R2/D1. 25MB clears any real markdown or PDF by 10x+.
    const MAX_FILE_BYTES = 25 * 1024 * 1024;
    if (bodyBytes.byteLength > MAX_FILE_BYTES) {
      return c.json({ error: `File exceeds ${MAX_FILE_BYTES / (1024 * 1024)}MB limit` }, 413);
    }

    // The factory hook reconciles the full Library every session-start by
    // PUT-ing every local file. Hash-compare against the stored row so we
    // skip R2 write, updated_at bump, and analytics event when nothing
    // actually changed — keeps reconciliation cheap and the event log clean.
    const hashBuf = await crypto.subtle.digest('SHA-256', bodyBytes);
    const contentHash = [...new Uint8Array(hashBuf)].map((b) => b.toString(16).padStart(2, '0')).join('');

    await ensureFilePriceColumn();
    const existing = await getDB().prepare(
      'SELECT text, visibility, content_type, content_hash, price_cents FROM protocol_files WHERE account_id = ? AND name = ?'
    ).bind(id, name).first<{ text: string | null; visibility: string; content_type: string; content_hash: string | null; price_cents: number | null }>();

    if (
      existing
      && existing.content_hash === contentHash
      && existing.visibility === visibility
      && existing.content_type === contentType
      && (existing.text ?? null) === (text ?? null)
      && (priceCents === null || priceCents === (existing.price_cents ?? null))
    ) {
      return c.json({ ok: true, unchanged: true, ...(payoutsRequired ? { payouts_required: true } : {}) });
    }

    // Same abuse floor for file count — only gates NEW names, so a full
    // account can always update what it already has. 1000 names is ~20x the
    // largest real library; one indexed COUNT per new-name PUT.
    if (!existing) {
      const MAX_FILES_PER_ACCOUNT = 1000;
      const countRow = await getDB().prepare(
        'SELECT COUNT(*) AS n FROM protocol_files WHERE account_id = ?'
      ).bind(id).first<{ n: number }>();
      if ((countRow?.n ?? 0) >= MAX_FILES_PER_ACCOUNT) {
        return c.json({ error: `Account file limit reached (${MAX_FILES_PER_ACCOUNT})` }, 403);
      }
    }

    await getR2().put(`protocol/${id}/${name}.${ext}`, bodyBytes);
    await getDB().prepare(
      `INSERT INTO protocol_files (account_id, name, text, visibility, updated_at, content_type, content_hash, price_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id, name) DO UPDATE SET
         text = COALESCE(excluded.text, protocol_files.text),
         visibility = excluded.visibility,
         updated_at = excluded.updated_at,
         content_type = excluded.content_type,
         content_hash = excluded.content_hash,
         price_cents = COALESCE(excluded.price_cents, protocol_files.price_cents)`
    ).bind(id, name, text, visibility, now, contentType, contentHash, priceCents).run();

    logEvent('protocol_file_published', {
      author: auth.account.github_login,
      name,
      visibility,
      content_type: contentType,
    });

    return c.json({ ok: true, ...(payoutsRequired ? { payouts_required: true } : {}) });
  });

  app.delete('/file/:name', async (c) => {
    const auth = await requireAuthor(c);
    if (!auth.ok) return c.text(auth.message, auth.status);
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
    // Owner sees all their own previews; other authors don't get the private
    // preview blurb of authors/invite files (names stay for discovery). (audit M1)
    const isOwner = String(auth.account.github_id) === id;
    const files = isOwner ? results : results.map(f => ({
      ...f,
      text: (f.visibility === 'public' || f.visibility === 'paid') ? f.text : null,
    }));
    return c.json({ account_id: id, files });
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
    const auth = await requireAuthor(c);
    if (!auth.ok) return c.text(auth.message, auth.status);
    if (!auth.account.github_id) return c.json({ error: 'Account missing github_id' }, 400);

    // Abuse floor: bound how often one account can write to protocol_calls /
    // the catalog per day. Read-only check up front (fails open, non-cost
    // surface); the counter is only bumped after a successful insert below.
    if (await callDailyCapReached(String(auth.account.github_id))) {
      return c.json({ error: `Daily /call limit reached (${CALL_DAILY_CAP_PER_ACCOUNT})` }, 429);
    }

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

    // Bound the array: every distinct module_id becomes a permanent
    // protocol_calls row / catalog entry, so an unbounded array is a D1/catalog
    // flood vector. 100 is ~14x the 7-module default manifest and clears any
    // realistic full-factory-plus-custom library, so it never bites legit use.
    const MAX_MODULES_PER_CALL = 100;
    if (body.modules.length > MAX_MODULES_PER_CALL)
      return c.json({ error: `Too many modules (max ${MAX_MODULES_PER_CALL} per call)` }, 400);

    const id = String(auth.account.github_id);
    const now = new Date().toISOString();
    const db = getDB();

    // Each module: { id: "module_name", text: "why still using / what changed" }
    // Validate module ID format at ingress — github:user/repo#path or local:user/slug.
    // Garbage IDs pollute the catalog as "unreachable" entries forever; reject upfront.
    const rows: { mod: string; text: string }[] = [];
    for (const m of body.modules) {
      let candidateId: string | null = null;
      let candidateText = '';
      if (typeof m === 'object' && m?.id && typeof m.id === 'string' && typeof m.text === 'string') {
        candidateId = m.id;
        candidateText = m.text;
      } else if (typeof m === 'string') {
        // Backward compat: bare string = module id with empty text
        candidateId = m;
      }
      if (!candidateId) continue;
      if (parseModuleId(candidateId).kind === null) continue;
      rows.push({ mod: candidateId.slice(0, 300), text: candidateText.slice(0, 2000) });
    }
    if (rows.length === 0) return c.json({ error: 'no valid modules' }, 400);

    const inserts = rows.map((r) => db.prepare(
      'INSERT INTO protocol_calls (module_id, account_id, time, text) VALUES (?, ?, ?, ?)'
    ).bind(r.mod, id, now, r.text));
    await db.batch(inserts);
    // Consume daily budget only after a successful write — a rejected/empty call
    // never counts against the account.
    c.executionCtx.waitUntil(bumpCallDaily(id));
    logEvent('protocol_call', {
      author: auth.account.github_login,
      modules: String(rows.length),
    });

    // Bidirectional per a2 — the call IS the closed-loop verification primitive.
    // Response carries per-module survival signal (status from the catalog cache,
    // recent distinct-caller count from the 90-day window). One DB query batched
    // across all modules, KV reads parallel. Forward-compat: agents that ignore
    // these fields are unaffected.
    const ids = rows.map((r) => r.mod);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const placeholders = ids.map(() => '?').join(',');
    const callerRows = await db.prepare(
      `SELECT module_id, COUNT(DISTINCT account_id) as n FROM protocol_calls
       WHERE module_id IN (${placeholders}) AND time > ? GROUP BY module_id`
    ).bind(...ids, ninetyDaysAgo).all<{ module_id: string; n: number }>();
    const callerCounts = new Map((callerRows.results || []).map((r) => [r.module_id, r.n]));
    const metas = await Promise.all(ids.map((mid) => resolveModule(mid)));
    const responseModules = ids.map((mid, i) => ({
      id: mid,
      status: metas[i]?.status || 'unknown',
      callers_recent: callerCounts.get(mid) ?? 0,
    }));

    return c.json({ ok: true, modules: responseModules });
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
    //
    // 90-day recency window — the catalog must be able to forget. Survival
    // ranking only works if dormant modules drop out. Soft default; revisit
    // once the catalog has scale. Dormancy is a view-filter, not removal:
    // `?all=1` lifts the window so dormant modules stay queryable (a2
    // catalog-hardening decision, 2026-06-09). Zero new state either way —
    // both views derive from the same call log.
    const showAll = c.req.query('all') === '1';
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { results } = showAll
      ? await getDB().prepare(
          `SELECT DISTINCT module_id FROM protocol_calls WHERE module_id LIKE 'github:%' LIMIT 1000`
        ).all<{ module_id: string }>()
      : await getDB().prepare(
          `SELECT DISTINCT module_id FROM protocol_calls WHERE module_id LIKE 'github:%' AND time > ? LIMIT 1000`
        ).bind(ninetyDaysAgo).all<{ module_id: string }>();

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
