/** Alexandria's optional collective plumbing. The local loop does not depend on it. */

import type { Hono } from 'hono';
import { requireAuth } from './auth.js';
import { requireActiveMember, resolveMembership } from './billing.js';
import { getDB, getR2, ensureFilePriceColumn, ensureFileTitleColumn, clampPaidAmount } from './db.js';
import { logEvent } from './analytics.js';
import { saveAccount, getKV } from './kv.js';
import {
  resolveModule,
  authorFromModuleId,
  canonicalizeModuleId,
  deriveKind,
  deriveMarketplaceTier,
  isMarketplaceModule,
  marketplaceBuiltins,
  moduleIdAliases,
  normalizeMarketplaceReport,
} from './marketplace-catalog.js';
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
    const auth = await requireActiveMember(c);
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
    // Explicit display title the Author sets at upload (falls back to the pretty
    // filename in the UI when unset). Bounded; null means "don't change".
    const title = typeof body.title === 'string' ? (body.title.trim().slice(0, 200) || null) : null;
    const visibility = ['authors', 'public', 'invite', 'paid'].includes(body.visibility) ? body.visibility : 'authors';

    // Per-file library category (works/projects/shadows/other) — the section
    // the library page groups this file under. Absent → don't change. The
    // Artifact Loop's classify step flows here: the reconcile hook derives a
    // file's kind locally (a `<name>.category` sidecar, or structurally — a
    // stem that names a folder in files/projects/ IS a project) and sends it
    // on the PUT, so a project lands as a project instead of defaulting to a
    // shadow. Stored in the same file_categories:{login} KV map the bulk
    // PUT /file-categories endpoint and the library page read. See below.
    const category = typeof body.category === 'string' && ['works', 'projects', 'shadows', 'other'].includes(body.category)
      ? body.category : null;

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

    // Apply the category BEFORE the unchanged-content short-circuit below, so a
    // category-only change (identical bytes, a newly-added `.category` sidecar)
    // still lands. Read-modify-write touches ONLY this file's key in the map —
    // it can never wipe another file's category (the footgun of the old "send
    // the complete map" flow, which is why projects silently reverted to
    // shadows when a step got forgotten). Non-fatal: a KV hiccup never blocks a
    // publish — the file still ships, only its section grouping is deferred.
    if (category && auth.account.github_login) {
      const catKey = `file_categories:${auth.account.github_login}`;
      try {
        const raw = await getKV().get(catKey);
        const map = raw ? JSON.parse(raw) as Record<string, string> : {};
        if (map[name] !== category) {
          map[name] = category;
          await getKV().put(catKey, JSON.stringify(map));
        }
      } catch { /* non-fatal — see note above */ }
    }

    await ensureFilePriceColumn();
    await ensureFileTitleColumn();
    const existing = await getDB().prepare(
      'SELECT text, title, visibility, content_type, content_hash, price_cents FROM protocol_files WHERE account_id = ? AND name = ?'
    ).bind(id, name).first<{ text: string | null; title: string | null; visibility: string; content_type: string; content_hash: string | null; price_cents: number | null }>();

    if (
      existing
      && existing.content_hash === contentHash
      && existing.visibility === visibility
      && existing.content_type === contentType
      && (existing.text ?? null) === (text ?? null)
      && (existing.title ?? null) === (title ?? null)
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
      `INSERT INTO protocol_files (account_id, name, text, title, visibility, updated_at, content_type, content_hash, price_cents)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(account_id, name) DO UPDATE SET
         text = COALESCE(excluded.text, protocol_files.text),
         title = COALESCE(excluded.title, protocol_files.title),
         visibility = excluded.visibility,
         updated_at = excluded.updated_at,
         content_type = excluded.content_type,
         content_hash = excluded.content_hash,
         price_cents = COALESCE(excluded.price_cents, protocol_files.price_cents)`
    ).bind(id, name, text, title, visibility, now, contentType, contentHash, priceCents).run();

    logEvent('protocol_file_published', {
      author: auth.account.github_login,
      name,
      visibility,
      content_type: contentType,
    });

    // Auto-carry the file's teaser blurb into the always-public subtitle map,
    // so a gated (invite/authors) file — whose `text` blurb the audit-M1 gate
    // suppresses in the browse list — still shows a one-line subtitle without
    // exposing the rest of the blurb. First line only (not the whole blurb) so
    // the measured-teaser posture holds. Sync only when the blurb itself
    // changed (not on every body edit / reconciliation re-PUT), so a manual
    // override via PUT /file-subtitles survives unrelated content edits.
    // Non-fatal: the browse list falls back to the text first-line for public
    // files, so a KV hiccup never blocks a publish.
    if (text !== null && text !== (existing?.text ?? null) && auth.account.github_login) {
      const teaser = text.split('\n')[0].trim().slice(0, 200);
      const subKey = `file_subtitles:${auth.account.github_login}`;
      try {
        const raw = await getKV().get(subKey);
        const map = raw ? JSON.parse(raw) as Record<string, string> : {};
        if (teaser) map[name] = teaser; else delete map[name];
        await getKV().put(subKey, JSON.stringify(map));
      } catch { /* non-fatal — see note above */ }
    }

    return c.json({ ok: true, ...(payoutsRequired ? { payouts_required: true } : {}) });
  });

  app.delete('/file/:name', async (c) => {
    const auth = await requireActiveMember(c);
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

    const isOwner = String(auth.account.github_id) === id;
    const fileGate = await getDB().prepare(
      'SELECT visibility FROM protocol_files WHERE account_id = ? AND name = ?'
    ).bind(id, name).first<{ visibility: string }>();
    let subscriberValid = false;
    if (!isOwner && fileGate?.visibility === 'authors') {
      const membership = await resolveMembership(auth.account);
      if (!membership.available) {
        return c.json({ error: 'membership verification unavailable. try again.' }, 503);
      }
      if (!membership.active) {
        return c.json({ error: 'Active membership required', visibility: 'authors', reason: 'membership_required' }, 402);
      }
      subscriberValid = true;
    }

    // Protocol route is the canonical Author-to-Author interface — free reads
    // only. No purchase/invite tokens are accepted here; paid/invite flow
    // through the website. The gate inside readProtocolFile enforces this.
    const result = await readProtocolFile({
      authorGithubId: id,
      fileName: name,
      accessorGithubId: auth.account.github_id ?? null,
      context: { subscriberValid },
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
    const auth = await requireActiveMember(c);
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

    // New installs report the SHA-256 of the exact GitHub bytes the Author's AI
    // inspected. Old manifests remain accepted as legacy signal, but are marked
    // unverified in the response. Duplicate IDs collapse to one vote per call.
    const rows = normalizeMarketplaceReport(body.modules);
    if (rows.length === 0) return c.json({ error: 'no valid modules' }, 400);

    // Identity is binary, not a fuzzy similarity judgment. If one byte changes,
    // the report no longer counts as use of this published module. The Author
    // can inspect again, keep a private adaptation unreported, or publish a
    // derived module under their own GitHub identity.
    const reportMetas = await Promise.all(rows.map((row) => resolveModule(row.mod)));
    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      if (!row.sourceSha256) continue;
      const moduleMeta = reportMetas[i];
      if (!moduleMeta || moduleMeta.status !== 'ok' || moduleMeta.content_sha256 !== row.sourceSha256) {
        return c.json({
          error: 'module bytes changed since inspection',
          module: row.mod,
          reported_sha256: row.sourceSha256,
          current_sha256: moduleMeta?.content_sha256 || null,
          action: 'inspect the current bytes again before reporting usage',
        }, 409);
      }
    }

    // ── Requests: the call without a match (a2 — the demand side) ──
    // Optional free-text wishes the Author has explicitly cleared for the
    // public board ("I wish a module existed for X"). Stored in the same
    // protocol_calls table under a `request:` module_id prefix — zero new
    // state, and the `LIKE 'github:%'` catalog filter means a request can
    // never surface as a module. Aggregated anonymously by
    // GET /marketplace/requests with the same 90-day forget-window.
    // The say-so gate is client-side canon (marketplace.md): the Engine only
    // includes requests the Author cleared. The server can't distinguish
    // drafted-from-typed — it just bounds abuse (count + length caps riding
    // the same daily /call budget as everything else).
    const MAX_REQUESTS_PER_CALL = 5;
    const REQUEST_MAX_LEN = 300;
    const requestRows: { mod: string; text: string }[] = [];
    if (Array.isArray(body.requests)) {
      for (const r of body.requests.slice(0, MAX_REQUESTS_PER_CALL)) {
        if (typeof r !== 'string') continue;
        const text = r.replace(/[\x00-\x1f\x7f]/g, ' ').trim().slice(0, REQUEST_MAX_LEN);
        if (!text) continue;
        requestRows.push({ mod: `request:${text}`, text: '' });
      }
    }

    const storedRows = rows.map((row) => ({
      mod: row.mod,
      text: row.sourceSha256
        ? JSON.stringify({ v: 1, note: row.text, source_sha256: row.sourceSha256 })
        : row.text,
    }));
    const inserts = storedRows.concat(requestRows).map((r) => db.prepare(
      'INSERT INTO protocol_calls (module_id, account_id, time, text) VALUES (?, ?, ?, ?)'
    ).bind(r.mod, id, now, r.text));
    await db.batch(inserts);
    // Consume daily budget only after a successful write — a rejected/empty call
    // never counts against the account.
    c.executionCtx.waitUntil(bumpCallDaily(id));
    logEvent('protocol_call', {
      author: auth.account.github_login,
      modules: String(rows.length),
      requests: String(requestRows.length),
    });

    // Bidirectional per a2 — the call IS the closed-loop verification primitive.
    // Response carries per-module survival signal (status from the catalog cache,
    // recent distinct-caller count from the 90-day window). One DB query batched
    // across all modules, KV reads parallel. Forward-compat: agents that ignore
    // these fields are unaffected.
    const ids = rows.map((r) => r.mod);
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const exactRows = rows.filter((row) => row.sourceSha256);
    const exactClauses = exactRows.map(() =>
      `(module_id = ? AND json_extract(CASE WHEN json_valid(text) THEN text ELSE '{}' END, '$.source_sha256') = ?)`
    ).join(' OR ');
    const callerRows = exactRows.length === 0
      ? { results: [] as Array<{ module_id: string; n: number }> }
      : await db.prepare(
          `SELECT module_id, COUNT(DISTINCT account_id) as n FROM protocol_calls
           WHERE time > ? AND (${exactClauses}) GROUP BY module_id`
        ).bind(
          ninetyDaysAgo,
          ...exactRows.flatMap((row) => [row.mod, row.sourceSha256 as string]),
        ).all<{ module_id: string; n: number }>();
    const callerCounts = new Map((callerRows.results || []).map((r) => [r.module_id, r.n]));
    const metas = reportMetas;
    const responseModules = ids.map((mid, i) => ({
      id: mid,
      status: metas[i]?.status || 'unknown',
      callers_recent: callerCounts.get(mid) ?? 0,
      content_sha256: metas[i]?.content_sha256 || null,
      adaptation: metas[i]?.adaptation || 'universal',
      derived_from: metas[i]?.derived_from || null,
      usage_identity: rows[i].sourceSha256 ? 'exact' : 'legacy-unverified',
    }));

    return c.json({ ok: true, modules: responseModules, requests_logged: requestRows.length });
  });

  // ── Marketplace: browse modules ────────────────────────────────
  //
  // Three routes:
  //   GET /marketplace           — public catalog
  //   GET /marketplace/requests  — public unmet-demand board (anonymous)
  //   GET /marketplace/:module   — member-only aggregate + caller's own history
  //
  // Module bodies live at raw.githubusercontent.com — agents fetch from
  // github directly. The catalog returns metadata only.
  //
  // No /publish endpoint. Public GitHub files are publications; /call reports
  // a manifest only after that exact manifest has separate local approval.

  app.get('/marketplace', async (c, next) => {
    if (new URL(c.req.url).pathname !== '/marketplace') return next();

    // Public listing carries module identity plus anonymous, exact-byte recent
    // counts. Raw notes never appear here. Member detail adds all-time lineage
    // counts and only the requesting Author's own history.
    //
    // Alexandria's own inventory is explicit and always visible. Community
    // modules are discovered from approved usage reports and use a 90-day
    // forget-window; `?all=1` lifts that community-only window.
    const showAll = c.req.query('all') === '1';
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const { results } = showAll
      ? await getDB().prepare(
          `SELECT DISTINCT module_id FROM protocol_calls WHERE module_id LIKE 'github:%' LIMIT 1000`
        ).all<{ module_id: string }>()
      : await getDB().prepare(
          `SELECT DISTINCT module_id FROM protocol_calls WHERE module_id LIKE 'github:%' AND time > ? LIMIT 1000`
        ).bind(ninetyDaysAgo).all<{ module_id: string }>();

    // Old and current founder handles, plus the old modules-repo name, are one
    // identity. Normalise before resolution so the public catalog never shows
    // duplicate modules or links back through stale redirects.
    const builtinInventory = marketplaceBuiltins();
    const builtinIds = new Set(builtinInventory.map((module) => module.id));
    const ids = [...new Set((results || [])
      .map((r) => canonicalizeModuleId(r.module_id))
      .filter(isMarketplaceModule)
      .filter((id) => !builtinIds.has(id)))];

    // Public signal is anonymous and exact-byte only. Old plaintext reports and
    // reports for an earlier revision remain historical rows, but never inflate
    // the current module's counts.
    const hashExpression = `json_extract(CASE WHEN json_valid(text) THEN text ELSE '{}' END, '$.source_sha256')`;
    const [signalRows, lineageRows] = await Promise.all([
      getDB().prepare(
        `SELECT module_id, ${hashExpression} as source_sha256,
                COUNT(*) as calls, COUNT(DISTINCT account_id) as callers, MAX(time) as last_seen
         FROM protocol_calls
         WHERE module_id LIKE 'github:%' AND time > ? AND ${hashExpression} IS NOT NULL
         GROUP BY module_id, source_sha256`
      ).bind(ninetyDaysAgo).all<{
        module_id: string;
        source_sha256: string;
        calls: number;
        callers: number;
        last_seen: string | null;
      }>(),
      getDB().prepare(
        `SELECT module_id, COUNT(*) as calls, COUNT(DISTINCT account_id) as callers, MAX(time) as last_seen
         FROM protocol_calls
         WHERE module_id LIKE 'github:%' AND time > ? AND ${hashExpression} IS NOT NULL
         GROUP BY module_id`
      ).bind(ninetyDaysAgo).all<{
        module_id: string;
        calls: number;
        callers: number;
        last_seen: string | null;
      }>(),
    ]);
    const exactSignal = new Map<string, { calls: number; callers: number; last_seen: string | null }>();
    for (const row of signalRows.results || []) {
      const canonicalId = canonicalizeModuleId(row.module_id);
      const key = `${canonicalId}\n${row.source_sha256}`;
      const prior = exactSignal.get(key);
      exactSignal.set(key, {
        calls: (prior?.calls || 0) + row.calls,
        callers: (prior?.callers || 0) + row.callers,
        last_seen: !prior?.last_seen || (row.last_seen && row.last_seen > prior.last_seen) ? row.last_seen : prior.last_seen,
      });
    }
    const lineageSignal = new Map<string, { calls: number; callers: number; last_seen: string | null }>();
    for (const row of lineageRows.results || []) {
      const canonicalId = canonicalizeModuleId(row.module_id);
      const prior = lineageSignal.get(canonicalId);
      lineageSignal.set(canonicalId, {
        calls: (prior?.calls || 0) + row.calls,
        callers: (prior?.callers || 0) + row.callers,
        last_seen: !prior?.last_seen || (row.last_seen && row.last_seen > prior.last_seen) ? row.last_seen : prior.last_seen,
      });
    }
    const withCurrentSignal = (module: ReturnType<typeof marketplaceBuiltins>[number], contentSha256: string | null) => {
      const current = contentSha256 ? exactSignal.get(`${module.id}\n${contentSha256}`) : undefined;
      const lineage = lineageSignal.get(module.id);
      return {
        ...module,
        content_sha256: contentSha256,
        callers_recent: current?.callers || 0,
        calls_recent: current?.calls || 0,
        last_seen: current?.last_seen || null,
        window_days: 90,
        signal: {
          current_version: {
            content_sha256: contentSha256,
            callers_recent: current?.callers || 0,
            calls_recent: current?.calls || 0,
            last_seen: current?.last_seen || null,
            window_days: 90,
          },
          module_lineage: {
            callers_recent: lineage?.callers || 0,
            calls_recent: lineage?.calls || 0,
            last_seen: lineage?.last_seen || null,
            window_days: 90,
          },
        },
      };
    };
    const builtins = await Promise.all(builtinInventory.map(async (module) => {
      const meta = await resolveModule(module.id);
      return withCurrentSignal({
        ...module,
        adaptation: meta?.adaptation || module.adaptation,
        derived_from: meta?.derived_from || null,
      }, meta?.content_sha256 || null);
    }));
    const communityModules = await Promise.all(ids.map(async (moduleId) => {
      const meta = await resolveModule(moduleId);
      return withCurrentSignal({
        id: moduleId,
        name: meta?.name || moduleId,
        description: meta?.description || '',
        author_github_login: authorFromModuleId(moduleId),
        kind: deriveKind(moduleId),
        tier: deriveMarketplaceTier(moduleId),
        adaptation: meta?.adaptation || 'universal',
        derived_from: meta?.derived_from || null,
        content_sha256: meta?.content_sha256 || null,
        status: meta?.status || 'unreachable',
      }, meta?.content_sha256 || null);
    }));
    let modules = [...builtins, ...communityModules];

    // Optional filters — additive query params, no-op when absent.
    const kindFilter = c.req.query('kind');
    if (kindFilter) modules = modules.filter((m) => m.kind === kindFilter);
    const authorFilter = c.req.query('author');
    if (authorFilter) modules = modules.filter((m) => m.author_github_login === authorFilter);

    // Incompressible core first, then replaceable defaults, official additions,
    // and author modules.
    const builtinOrder = new Map(builtins.map((module, index) => [module.id, index]));
    modules.sort((a, b) => {
      const rank = { core: 0, default: 1, official: 2, community: 3 } as const;
      if (rank[a.tier] !== rank[b.tier]) return rank[a.tier] - rank[b.tier];
      const aBuiltin = builtinOrder.get(a.id);
      const bBuiltin = builtinOrder.get(b.id);
      if (aBuiltin !== undefined && bBuiltin !== undefined) return aBuiltin - bBuiltin;
      if (aBuiltin !== undefined) return -1;
      if (bBuiltin !== undefined) return 1;
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

  // ── Marketplace: the request board (the call without a match) ──
  //
  // Public, anonymous, derived — revealed unmet demand. Each row is a
  // free-text wish that arrived through /call (see the requests block in the
  // /call handler). Exact-text dedup only: consuming Engines cluster
  // semantically far better than any server-side normalisation would (bitter
  // lesson — don't hand-engineer what the reading model does for free).
  // Same 90-day forget-window as the catalog — a wish nobody re-hits drops
  // out of the default view (`?all=1` lifts the window). Ranked by distinct
  // callers then recency, so an N=1 spam entry sits at the bottom unseen.
  // Registered before /marketplace/:module so the static path wins.
  app.get('/marketplace/requests', async (c) => {
    const showAll = c.req.query('all') === '1';
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const query = showAll
      ? getDB().prepare(
          `SELECT module_id, COUNT(DISTINCT account_id) as callers, MAX(time) as last_seen
           FROM protocol_calls WHERE module_id LIKE 'request:%'
           GROUP BY module_id ORDER BY callers DESC, last_seen DESC LIMIT 200`
        )
      : getDB().prepare(
          `SELECT module_id, COUNT(DISTINCT account_id) as callers, MAX(time) as last_seen
           FROM protocol_calls WHERE module_id LIKE 'request:%' AND time > ?
           GROUP BY module_id ORDER BY callers DESC, last_seen DESC LIMIT 200`
        ).bind(ninetyDaysAgo);
    const { results } = await query.all<{ module_id: string; callers: number; last_seen: string }>();
    const requests = (results || []).map((r) => ({
      text: r.module_id.slice('request:'.length),
      callers: r.callers,
      last_seen: r.last_seen,
    }));
    c.header('Cache-Control', 'public, max-age=300, s-maxage=300');
    return c.json({ requests, total: requests.length });
  });

  app.get('/marketplace/:module', async (c, next) => {
    const requestedModuleId = c.req.param('module');
    if (requestedModuleId === 'signal') return next();

    const auth = await requireActiveMember(c);
    if (!auth.ok) return c.text(auth.message, auth.status);

    const moduleId = canonicalizeModuleId(requestedModuleId);
    const aliases = moduleIdAliases(moduleId);
    const placeholders = aliases.map(() => '?').join(',');
    const db = getDB();
    const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
    const meta = await resolveModule(moduleId);
    const currentHash = meta?.content_sha256 || '';
    const exactHash = `json_extract(CASE WHEN json_valid(text) THEN text ELSE '{}' END, '$.source_sha256') = ?`;
    const anyExactHash = `json_extract(CASE WHEN json_valid(text) THEN text ELSE '{}' END, '$.source_sha256') IS NOT NULL`;
    const [currentAll, currentRecent, lineageAll, lineageRecent, own] = await Promise.all([
      db.prepare(
        `SELECT COUNT(*) as calls, COUNT(DISTINCT account_id) as callers, MAX(time) as last_seen
         FROM protocol_calls WHERE module_id IN (${placeholders}) AND ${exactHash}`
      ).bind(...aliases, currentHash).first<{ calls: number; callers: number; last_seen: string | null }>(),
      db.prepare(
        `SELECT COUNT(*) as calls, COUNT(DISTINCT account_id) as callers
         FROM protocol_calls WHERE module_id IN (${placeholders}) AND time > ? AND ${exactHash}`
      ).bind(...aliases, ninetyDaysAgo, currentHash).first<{ calls: number; callers: number }>(),
      db.prepare(
        `SELECT COUNT(*) as calls, COUNT(DISTINCT account_id) as callers, MAX(time) as last_seen
         FROM protocol_calls WHERE module_id IN (${placeholders}) AND ${anyExactHash}`
      ).bind(...aliases).first<{ calls: number; callers: number; last_seen: string | null }>(),
      db.prepare(
        `SELECT COUNT(*) as calls, COUNT(DISTINCT account_id) as callers, MAX(time) as last_seen
         FROM protocol_calls WHERE module_id IN (${placeholders}) AND time > ? AND ${anyExactHash}`
      ).bind(...aliases, ninetyDaysAgo).first<{ calls: number; callers: number; last_seen: string | null }>(),
      db.prepare(
        `SELECT time, text FROM protocol_calls
         WHERE module_id IN (${placeholders}) AND account_id = ? ORDER BY time DESC LIMIT 100`
      ).bind(...aliases, String(auth.account.github_id)).all<{ time: string; text: string | null }>(),
    ]);
    const ownUsage = (own.results || []).map((row) => {
      if (!row.text) return { time: row.time, note: '', source_sha256: null, usage_identity: 'legacy-unverified' };
      try {
        const parsed = JSON.parse(row.text) as { v?: number; note?: string; source_sha256?: string };
        if (parsed.v === 1 && typeof parsed.source_sha256 === 'string') {
          return { time: row.time, note: parsed.note || '', source_sha256: parsed.source_sha256, usage_identity: 'exact' };
        }
      } catch { /* old plaintext usage note */ }
      return { time: row.time, note: row.text, source_sha256: null, usage_identity: 'legacy-unverified' };
    });

    return c.json({
      module: moduleId,
      adaptation: meta?.adaptation || 'universal',
      derived_from: meta?.derived_from || null,
      content_sha256: meta?.content_sha256 || null,
      signal: {
        current_version: {
          content_sha256: meta?.content_sha256 || null,
          callers_recent: currentRecent?.callers || 0,
          calls_recent: currentRecent?.calls || 0,
          callers_all_time: currentAll?.callers || 0,
          calls_all_time: currentAll?.calls || 0,
          last_seen: currentAll?.last_seen || null,
          window_days: 90,
        },
        module_lineage: {
          callers_recent: lineageRecent?.callers || 0,
          calls_recent: lineageRecent?.calls || 0,
          callers_all_time: lineageAll?.callers || 0,
          calls_all_time: lineageAll?.calls || 0,
          last_seen: lineageAll?.last_seen || null,
          window_days: 90,
        },
      },
      own_usage: ownUsage,
    });
  });
}
