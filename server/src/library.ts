/**
 * Library — read-only company layer
 *
 * Published artifacts: shadows, pulses, quizzes, works.
 * Publishing goes through the protocol (PUT /file/{name}).
 * This file serves the website's read endpoints only.
 */

import { Hono } from 'hono';
import { getDB, generateId } from './db.js';
import { logEvent } from './analytics.js';
import {
  extractApiKey,
  extractLibrarySessionToken,
  findByApiKey,
  findByLibrarySessionToken,
  type Account,
} from './auth.js';
import { getAllowedOrigins } from './cors.js';
import { getStripe } from './billing.js';
import { getKV, loadAccounts } from './kv.js';
import {
  isInternalProtocolFileName,
  readProtocolFile,
  readQuizDefinition,
  readPulse,
  readShadow,
  readShadowFree,
  readWork,
} from './file-access.js';
import { getAuditHead, getAuthorAuditEntries } from './audit.js';

// ---------------------------------------------------------------------------
// CORS-safe R2 response
// ---------------------------------------------------------------------------

function r2Response(body: ReadableStream | null, contentType: string, reqOrigin?: string | null, cache?: string): Response {
  const allowed = getAllowedOrigins();
  const headers: Record<string, string> = {
    'Content-Type': contentType,
    'Vary': 'Origin',
  };
  if (reqOrigin && allowed.includes(reqOrigin)) {
    headers['Access-Control-Allow-Origin'] = reqOrigin;
    headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS';
    headers['Access-Control-Allow-Headers'] = 'Content-Type, Authorization';
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  if (cache) headers['Cache-Control'] = cache;
  return new Response(body, { headers });
}

// ---------------------------------------------------------------------------
// Input validation
// ---------------------------------------------------------------------------

function isValidAuthorId(id: string): boolean {
  return /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(id) && id.length <= 39;
}

function isValidFileName(name: string): boolean {
  return /^[a-z0-9][a-z0-9-]*$/.test(name) && name.length <= 64;
}

type LibraryAccessGrant = {
  author_id?: string;
  artifact_type?: string;
  artifact_id?: string;
};

function clampPaidAmount(amountCents: number): number {
  return Math.max(100, Math.min(100000, amountCents));
}

type AccountStore = Record<string, Account>;

interface CompanyAuthorRow {
  id: string;
  display_name?: string | null;
  settings?: string | null;
  bio?: string | null;
}

interface ProtocolFileRow {
  account_id: string;
  name: string;
  text: string | null;
  visibility: string;
  updated_at: string;
}

function parseJson<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try { return JSON.parse(value) as T; } catch { return fallback; }
}

function librarySettings(profile?: CompanyAuthorRow | null): Record<string, unknown> {
  return parseJson<Record<string, unknown>>(profile?.settings, {});
}

function stringSlot(settings: Record<string, unknown>, name: string): string | null {
  const value = settings[name];
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function slugSlot(value: string | null): string | null {
  if (!value) return null;
  const slug = value
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return slug || null;
}

function textSlot(settings: Record<string, unknown>, profile?: CompanyAuthorRow | null): string | null {
  const value = stringSlot(settings, 'text') || profile?.bio || null;
  if (!value) return null;
  return value.length > 160 ? `${value.slice(0, 157).trimEnd()}...` : value;
}

function alexandriaId(account: Account, profile: CompanyAuthorRow | null, fallbackIndex: number): string {
  const settings = librarySettings(profile);
  return stringSlot(settings, 'library_id') || stringSlot(settings, 'alexandria_id') || `a.${fallbackIndex}`;
}

/**
 * Whether the GitHub Author has any SSH signing keys registered.
 * Public GitHub endpoint — no auth required, no Alexandria OAuth scope needed.
 * Used by the Library UI to display the "signed worldline" indicator when an
 * Author has set up commit signing (typically via setup.sh on their machine).
 * Cached 24h in KV — Authors who rotate keys see a 24h propagation delay.
 * Soft fallback: any error returns false (no badge, no harm).
 */
async function hasGitHubSigningKeys(login: string): Promise<boolean> {
  const kv = getKV();
  const cacheKey = `signing_keys:${login}`;
  const cached = await kv.get(cacheKey);
  if (cached !== null) return cached === '1';
  try {
    const resp = await fetch(`https://api.github.com/users/${login}/ssh_signing_keys`, {
      headers: { 'User-Agent': 'Alexandria', 'Accept': 'application/vnd.github+json' },
    });
    if (!resp.ok) {
      await kv.put(cacheKey, '0', { expirationTtl: 86400 });
      return false;
    }
    const keys = await resp.json() as Array<{ key: string }>;
    const hasKeys = Array.isArray(keys) && keys.length > 0;
    await kv.put(cacheKey, hasKeys ? '1' : '0', { expirationTtl: 86400 });
    return hasKeys;
  } catch {
    return false;
  }
}

function directoryAuthor(account: Account, profile: CompanyAuthorRow | null, fallbackIndex: number) {
  const settings = librarySettings(profile);
  const location = stringSlot(settings, 'location');
  const displayName =
    stringSlot(settings, 'display_name')
    || account.github_name?.trim()
    || null;
  return {
    id: account.github_login,
    account_id: account.github_id ? String(account.github_id) : null,
    alexandria_id: alexandriaId(account, profile, fallbackIndex),
    display_name: displayName,
    location,
    location_key: slugSlot(stringSlot(settings, 'location_key')) || slugSlot(location),
    contact: stringSlot(settings, 'contact'),
    website: stringSlot(settings, 'website'),
    text: textSlot(settings, profile),
    files_url: `/library/${account.github_login}`,
  };
}

function fileAccessUrl(authorId: string, name: string): string {
  return `/library/${authorId}/file/${name}`;
}

// ---------------------------------------------------------------------------
// Route registration
// ---------------------------------------------------------------------------

export function registerLibraryRoutes(app: Hono): void {

  // Validate :author param on all routes (prevent path traversal in R2 keys)
  const validateAuthor = async (c: any, next: any) => {
    const authorId = c.req.param('author');
    if (authorId && !isValidAuthorId(authorId)) {
      return c.json({ error: 'Invalid author ID' }, 400);
    }
    await next();
  };
  app.use('/library/:author/*', validateAuthor);
  app.use('/library/:author', validateAuthor);

  // =========================================================================
  // AUTHOR PROFILE
  // =========================================================================

  app.get('/library/session', async (c) => {
    const key = extractApiKey(c);
    const byKey = key ? await findByApiKey(key) : null;
    const token = extractLibrarySessionToken(c);
    const bySession = token ? await findByLibrarySessionToken(token) : null;
    const account = byKey || bySession;

    // Look up subscription state from Stripe when an authed account has a sub.
    // The /cancel page consumes these to surface the reactivate UI for users
    // who already scheduled cancellation. Skipped for anon / no-subscription
    // accounts so the hot path stays cheap.
    let subscriptionStatus: string | null = null;
    let cancelAt: string | null = null;
    if (account?.subscription_id) {
      try {
        const stripe = getStripe();
        const sub = await stripe.subscriptions.retrieve(account.subscription_id);
        if (sub.cancel_at_period_end) {
          subscriptionStatus = 'canceled_at_period_end';
          const periodEnd = sub.cancel_at ?? sub.items?.data?.[0]?.current_period_end ?? null;
          cancelAt = periodEnd ? new Date(periodEnd * 1000).toISOString() : null;
        } else {
          subscriptionStatus = sub.status;
        }
      } catch (e) {
        console.error('[library/session] subscription lookup failed:', e);
      }
    }

    return c.json({
      signed_in: !!account,
      github_login: account?.github_login || null,
      github_name: account?.github_name || null,
      subscription_status: subscriptionStatus,
      cancel_at: cancelAt,
    });
  });

  // Company directory over accounts. Protocol files remain on author pages.
  app.get('/library', async (c) => {
    const db = getDB();
    const accounts = await loadAccounts<AccountStore>();
    const authorRows = await db.prepare('SELECT id, display_name, settings, bio FROM authors')
      .all<CompanyAuthorRow>()
      .catch(() => ({ results: [] as CompanyAuthorRow[] }));
    const profilesById = new Map<string, CompanyAuthorRow>();
    for (const profile of authorRows.results || []) profilesById.set(profile.id, profile);

    const accountList = Object.values(accounts)
      .filter((account) => !!account?.github_id && !!account.github_login)
      .sort((a, b) => {
        const ta = a.created_at || '';
        const tb = b.created_at || '';
        if (ta !== tb) return ta.localeCompare(tb);
        return String(a.github_id).localeCompare(String(b.github_id));
      });

    const authors = accountList
      .map((account, index) => {
        if (!account?.github_id || !account.github_login) return null;
        return directoryAuthor(account, profilesById.get(account.github_login) || null, index);
      })
      .filter((author): author is NonNullable<typeof author> => !!author?.id)
      .sort((a, b) => b.id.localeCompare(a.id, undefined, { sensitivity: 'base' }));

    logEvent('library_directory_view', { authors: String(authors.length) });
    return c.json({ authors });
  });

  app.get('/library/:author', async (c) => {
    const authorId = c.req.param('author');
    const db = getDB();
    const accounts = await loadAccounts<AccountStore>();
    const account = Object.values(accounts).find((candidate) => candidate.github_login === authorId) || null;
    const accountId = account?.github_id ? String(account.github_id) : null;

    if (!accountId) return c.json({ error: 'Author not found' }, 404);

    const files = await db.prepare(
      `SELECT account_id, name, text, visibility, updated_at
       FROM protocol_files
       WHERE account_id = ?
       ORDER BY CASE name WHEN 'shadow' THEN 0 ELSE 1 END, updated_at DESC`
    ).bind(accountId).all<ProtocolFileRow>();

    const protocolFiles = (files.results || []).filter(file => !isInternalProtocolFileName(file.name));

    logEvent('library_author_view', { author: authorId });

    const accountList = Object.values(accounts)
      .filter((candidate) => !!candidate?.github_id && !!candidate.github_login)
      .sort((a, b) => {
        const ta = a.created_at || '';
        const tb = b.created_at || '';
        if (ta !== tb) return ta.localeCompare(tb);
        return String(a.github_id).localeCompare(String(b.github_id));
      });
    const fallbackIndex = Math.max(0, accountList.findIndex(candidate => candidate.github_login === authorId));

    const legacyAuthor = await db.prepare('SELECT id, display_name, settings, bio FROM authors WHERE id = ?')
      .bind(authorId)
      .first<CompanyAuthorRow>()
      .catch(() => null);

    const hasSigningKeys = await hasGitHubSigningKeys(authorId);

    return c.json({
      author: {
        ...directoryAuthor(account!, legacyAuthor, fallbackIndex),
        has_signing_keys: hasSigningKeys,
      },
      files: protocolFiles.map(file => ({
        name: file.name,
        text: file.text,
        visibility: file.visibility,
        updated_at: file.updated_at,
        url: fileAccessUrl(authorId, file.name),
      })),
    });
  });

  // Protocol-backed file content, rendered by the company Library.
  // Public files are open, paid files are one-time checkout gated,
  // and author/invite files are read-only and restricted to Authors.
  app.post('/library/:author/checkout/file/:name', async (c) => {
    const authorId = c.req.param('author');
    const name = c.req.param('name');
    if (!isValidFileName(name)) return c.json({ error: 'Invalid file name' }, 400);
    if (isInternalProtocolFileName(name)) return c.json({ error: 'File not found' }, 404);

    const accounts = await loadAccounts<AccountStore>();
    const authorAccount = Object.values(accounts).find((candidate) => candidate.github_login === authorId);
    if (!authorAccount?.github_id) return c.json({ error: 'Author not found' }, 404);

    const db = getDB();
    const file = await db.prepare(
      'SELECT account_id, name, visibility FROM protocol_files WHERE account_id = ? AND name = ?'
    ).bind(String(authorAccount.github_id), name).first<{ account_id: string; name: string; visibility: string }>();
    if (!file) return c.json({ error: 'File not found' }, 404);
    if (file.visibility !== 'paid') return c.json({ error: 'Only paid files can be checked out' }, 400);

    const profile = await db.prepare('SELECT settings FROM authors WHERE id = ?')
      .bind(authorId)
      .first<{ settings: string | null }>()
      .catch(() => null);
    const settings = parseJson<Record<string, unknown>>(profile?.settings, {});
    const defaultAmountCents = typeof settings.paid_price_cents === 'number'
      ? clampPaidAmount(Math.round(settings.paid_price_cents))
      : 200;

    const body = await c.req.json().catch(() => ({})) as { amount_cents?: unknown; return_origin?: unknown };
    const requestedAmount = typeof body.amount_cents === 'number' && Number.isFinite(body.amount_cents)
      ? Math.round(body.amount_cents)
      : defaultAmountCents;
    const amountCents = clampPaidAmount(requestedAmount);

    const accessorKey = extractApiKey(c);
    const accessor = accessorKey ? await findByApiKey(accessorKey) : null;
    const WEBSITE_URL = process.env.WEBSITE_URL || 'https://alexandria-library.com';
    const requestedOrigin = typeof body.return_origin === 'string' ? body.return_origin.trim() : '';
    const allowedOrigins = new Set(getAllowedOrigins());
    const returnOrigin = requestedOrigin && allowedOrigins.has(requestedOrigin) ? requestedOrigin : WEBSITE_URL;
    const gatePath = `/library/${encodeURIComponent(authorId)}/open/${encodeURIComponent(name)}`;

    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: amountCents,
          product_data: {
            name: `${authorId}/${name}.md`,
            description: `Alexandria Library protocol file by ${authorId}`,
          },
        },
        quantity: 1,
      }],
      metadata: {
        kind: 'library',
        library_purchase: 'true',
        author_id: authorId,
        artifact_type: 'protocol_file',
        artifact_id: name,
        ...(accessor?.github_login ? { github_login: accessor.github_login } : {}),
      },
      success_url: `${returnOrigin}${gatePath}?session_id={CHECKOUT_SESSION_ID}&purchased=1`,
      cancel_url: `${returnOrigin}${gatePath}?cancel=1`,
    });

    if (!session.url) return c.json({ error: 'Failed to create checkout session' }, 500);
    return c.json({ url: session.url });
  });

  app.get('/library/:author/file/:name', async (c) => {
    const authorId = c.req.param('author');
    const name = c.req.param('name');
    if (!isValidFileName(name)) return c.json({ error: 'Invalid file name' }, 400);

    const accounts = await loadAccounts<AccountStore>();
    const authorAccount = Object.values(accounts).find((candidate) => candidate.github_login === authorId);
    if (!authorAccount?.github_id) return c.json({ error: 'Author not found' }, 404);

    // Resolve accessor identity from API key or browser session cookie.
    const accessorKey = extractApiKey(c);
    const accessorFromKey = accessorKey ? await findByApiKey(accessorKey) : null;
    const sessionToken = extractLibrarySessionToken(c);
    const accessorFromSession = sessionToken ? await findByLibrarySessionToken(sessionToken) : null;
    const accessor = accessorFromKey || accessorFromSession;

    // Token validation — the route owns this (it knows where the query params
    // and KV/D1 lookups live); the result flows into the gate as a boolean.
    const purchaseSessionId = c.req.query('session_id')?.trim() || null;
    const inviteCode = c.req.query('invite')?.trim() || c.req.query('token')?.trim() || null;

    let inviteValid = false;
    if (inviteCode) {
      const accessRow = await getDB().prepare(
        'SELECT id FROM access_codes WHERE author_id = ? AND code = ? AND revoked_at IS NULL LIMIT 1'
      ).bind(authorId, inviteCode).first<{ id: string }>();
      inviteValid = !!accessRow?.id;
    }

    let purchaseValid = false;
    if (purchaseSessionId) {
      const raw = await getKV().get(`library:access:${purchaseSessionId}`);
      if (raw) {
        const grant = parseJson<LibraryAccessGrant>(raw, {});
        purchaseValid = grant.author_id === authorId
          && grant.artifact_id === name
          && grant.artifact_type === 'protocol_file';
      }
    }

    const result = await readProtocolFile({
      authorGithubId: authorAccount.github_id,
      fileName: name,
      accessorGithubId: accessor?.github_id ?? null,
      context: { purchaseValid, inviteValid },
    });

    if (!result.ok) {
      // Audit log denials too — failed attempts are the more interesting
      // signal for spotting probing or insider abuse. `access_reason` carries
      // the denial code (unauthenticated, invite_required, payment_required,
      // not_found, content_missing, unknown_visibility).
      logEvent('library_protocol_file_view', {
        author: authorId,
        name,
        status: String(result.status),
        accessor: accessor?.github_login || 'anonymous',
        access_reason: result.reason,
      });
      // Paid denials get a checkout URL so the website can launch the flow.
      if (result.status === 402) {
        return c.json({
          ...result.body,
          checkout_url: `${process.env.WEBSITE_URL || 'https://alexandria-library.com'}/library/${encodeURIComponent(authorId)}/checkout/file/${encodeURIComponent(name)}`,
        }, 402);
      }
      return c.json(result.body, result.status);
    }

    logEvent('library_protocol_file_view', {
      author: authorId,
      name,
      status: '200',
      visibility: result.file.visibility,
      accessor: accessor?.github_login || (result.reason === 'paid' ? 'purchase' : result.reason === 'invite' ? 'invite' : 'public'),
      access_reason: result.reason,
    });

    const cache = result.file.visibility === 'public' ? 'public, max-age=300' : 'no-store';
    return r2Response(result.obj.body, result.contentType, c.req.header('Origin'), cache);
  });

  // =========================================================================
  // SHADOWS
  // =========================================================================

  // Public/free shadow
  app.get('/library/:author/shadow/free', async (c) => {
    const authorId = c.req.param('author');
    const result = await readShadowFree({ authorId });
    if (!result.ok) return c.json(result.body, result.status);

    logEvent('library_shadow_view', { author: authorId, visibility: 'public' });
    // Deliberately more permissive than the CORS middleware — public shadows are open content
    return new Response(result.obj.body, {
      headers: {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Access-Control-Allow-Origin': '*',
        'Cache-Control': 'public, max-age=300',
      },
    });
  });

  // Shadow by ID — access determined by visibility
  app.get('/library/:author/shadow/:shadowId', async (c) => {
    const authorId = c.req.param('author');
    const shadowId = c.req.param('shadowId');

    const accessorKey = extractApiKey(c);
    const accessor = accessorKey ? await findByApiKey(accessorKey) : null;
    const inviteToken = c.req.query('token') || null;

    const result = await readShadow({
      authorId,
      shadowId,
      accessorLogin: accessor?.github_login || null,
      inviteToken,
    });
    if (!result.ok) return c.json(result.body, result.status);

    logEvent('library_shadow_view', {
      author: authorId,
      visibility: result.reason === 'owner' ? 'owner' : result.reason,
      accessor: accessor?.github_login || '',
    });

    // Public and invite shadows are deliberately open across origins; authors
    // and owner reads use the origin-checked default.
    if (result.reason === 'public') {
      return new Response(result.obj.body, {
        headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'public, max-age=300' },
      });
    }
    if (result.reason === 'invite') {
      return new Response(result.obj.body, {
        headers: { 'Content-Type': 'text/markdown; charset=utf-8', 'Access-Control-Allow-Origin': '*', 'Cache-Control': 'no-store' },
      });
    }
    return r2Response(result.obj.body, 'text/markdown; charset=utf-8', c.req.header('Origin'));
  });

  // =========================================================================
  // PULSE
  // =========================================================================

  app.get('/library/:author/pulse/:month?', async (c) => {
    const authorId = c.req.param('author');
    const month = c.req.param('month');

    const result = await readPulse({ authorId, month });
    if (!result.ok) return c.json(result.body, result.status);

    logEvent('library_pulse_view', { author: authorId });
    return r2Response(result.obj.body, 'text/markdown; charset=utf-8', c.req.header('Origin'), 'public, max-age=300');
  });

  // =========================================================================
  // QUIZZES
  // =========================================================================

  app.get('/library/:author/quizzes', async (c) => {
    const authorId = c.req.param('author');
    const db = getDB();
    const { results } = await db.prepare(
      `SELECT q.id, q.title, q.published_at,
              (SELECT COUNT(*) FROM quiz_results WHERE quiz_id = q.id) as completions
       FROM quizzes q WHERE q.author_id = ? AND q.active = 1 ORDER BY q.published_at DESC`
    ).bind(authorId).all();
    return c.json({ quizzes: results });
  });

  app.get('/library/:author/quiz/:id', async (c) => {
    const quizId = c.req.param('id');

    const result = await readQuizDefinition({ quizId });
    if (!result.ok) return c.json(result.body, result.status);

    return c.json({ quiz_id: quizId, author_id: result.quiz.author_id, ...result.data });
  });

  app.post('/library/:author/quiz/:id/submit', async (c) => {
    const quizId = c.req.param('id');
    const authorId = c.req.param('author');
    const db = getDB();

    const body = await c.req.json().catch(() => null);
    if (!body || !body.answers) return c.json({ error: 'Provide answers' }, 400);

    const quizResult = await readQuizDefinition({ quizId });
    if (!quizResult.ok) return c.json(quizResult.body, quizResult.status);
    const data = quizResult.data as { questions?: Array<{ id?: string; key?: string; correct?: string; answer?: string }>; result_tiers?: Array<{ min_pct: number; label: string; message: string }> };
    const answers = body.answers as Record<string, string>;

    // Score
    let correct = 0;
    let total = 0;
    if (data.questions && Array.isArray(data.questions)) {
      total = data.questions.length;
      for (const q of data.questions) {
        const key = q.id || q.key || String(data.questions.indexOf(q));
        const correctAnswer = q.correct || q.answer;
        if (correctAnswer && answers[key] === correctAnswer) correct++;
      }
    }
    const scorePct = total > 0 ? Math.round((correct / total) * 100) : 0;

    // Generate result slug
    const slugBytes = crypto.getRandomValues(new Uint8Array(4));
    const resultSlug = Array.from(slugBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    const id = generateId();
    const accessorKey = extractApiKey(c);
    const takerId = accessorKey ? (await findByApiKey(accessorKey))?.github_login || null : null;

    await db.prepare(
      `INSERT INTO quiz_results (id, quiz_id, taker_id, score_pct, result_slug, taken_at) VALUES (?, ?, ?, ?, ?, ?)`
    ).bind(id, quizId, takerId, scorePct, resultSlug, new Date().toISOString()).run();

    logEvent('library_quiz_taken', { author: authorId, quiz_id: quizId, score_pct: String(scorePct) });

    // Determine result tier
    let resultTier = { label: '', message: '' };
    if (data.result_tiers && data.result_tiers.length > 0) {
      const sorted = [...data.result_tiers].sort((a: any, b: any) => b.min_pct - a.min_pct);
      for (const tier of sorted) {
        if (scorePct >= tier.min_pct) { resultTier = tier; break; }
      }
    }

    return c.json({
      score_pct: scorePct,
      correct,
      total,
      result_slug: resultSlug,
      result_tier: resultTier,
      share_url: `/library/${authorId}/quiz/${quizId}/result/${resultSlug}`,
    });
  });

  app.get('/library/:author/quiz/:id/result/:slug', async (c) => {
    const slug = c.req.param('slug');
    const quizId = c.req.param('id');
    const authorId = c.req.param('author');
    const db = getDB();

    const result = await db.prepare(
      'SELECT * FROM quiz_results WHERE result_slug = ? AND quiz_id = ?'
    ).bind(slug, quizId).first();
    if (!result) return c.json({ error: 'Result not found' }, 404);

    const quiz = await db.prepare('SELECT title FROM quizzes WHERE id = ?').bind(quizId).first<{ title: string }>();
    const author = await db.prepare('SELECT display_name FROM authors WHERE id = ?').bind(authorId).first<{ display_name: string }>();

    logEvent('library_quiz_share_view', { author: authorId, quiz_id: quizId, slug });

    return c.json({
      author_id: authorId,
      author_name: author?.display_name || authorId,
      quiz_title: quiz?.title || '',
      score_pct: result.score_pct,
      taken_at: result.taken_at,
    });
  });

  // =========================================================================
  // WORKS
  // =========================================================================

  app.get('/library/:author/works', async (c) => {
    const authorId = c.req.param('author');
    const db = getDB();
    const { results } = await db.prepare(
      'SELECT id, title, medium, tier, size_bytes, published_at FROM works WHERE author_id = ? ORDER BY published_at DESC'
    ).bind(authorId).all();
    return c.json({ works: results });
  });

  app.get('/library/:author/work/:id', async (c) => {
    const workId = c.req.param('id');
    const authorId = c.req.param('author');

    const accessorKey = extractApiKey(c);
    const accessor = accessorKey ? await findByApiKey(accessorKey) : null;

    const result = await readWork({ authorId, workId, accessor });
    if (!result.ok) return c.json(result.body, result.status);

    logEvent('library_work_view', {
      author: authorId,
      work_id: workId,
      tier: result.work.tier,
      accessor: accessor?.github_login || '',
      access_reason: result.reason,
    });

    // Public/free works are CDN-cacheable; paid/owner/subscriber reads aren't.
    const cache = result.reason === 'public' ? 'public, max-age=300' : undefined;
    return r2Response(result.obj.body, 'text/markdown; charset=utf-8', c.req.header('Origin'), cache);
  });

  // =========================================================================
  // ACCESS LOG (Author-authenticated — see who has read your files)
  // =========================================================================

  // Per-author audit feed. Long-term tamper-evident history lives in the
  // alexandria-audit GitHub repo (one JSONL batch per cron run, hash-
  // chained). This endpoint exposes the rolling 30-day KV window so the
  // Author can see recent activity without cloning the repo. The current
  // chain head is included so the Author can cross-check against /audit/head
  // and the published repo to verify nothing was tampered with.
  app.get('/library/:author/access-log', async (c) => {
    const authorId = c.req.param('author');
    const accessorKey = extractApiKey(c);
    const sessionToken = extractLibrarySessionToken(c);
    const accessor = accessorKey
      ? await findByApiKey(accessorKey)
      : sessionToken ? await findByLibrarySessionToken(sessionToken) : null;
    if (!accessor) return c.json({ error: 'Authentication required' }, 401);
    if (accessor.github_login !== authorId) return c.json({ error: 'Access log is private' }, 403);

    const [entries, head] = await Promise.all([
      getAuthorAuditEntries(authorId, 200),
      getAuditHead(),
    ]);

    return c.json({
      author: authorId,
      head,
      entries,
      audit_repo: 'mowinckelb/alexandria-audit',
      note: 'Long-term tamper-evident history lives in the audit_repo. Walk the hash chain from genesis to verify entries match the head_hash.',
    });
  });

  // =========================================================================
  // STATS (Author-authenticated)
  // =========================================================================

  app.get('/library/:author/stats', async (c) => {
    const authorId = c.req.param('author');
    const accessorKey = extractApiKey(c);
    if (!accessorKey) return c.json({ error: 'Authentication required' }, 401);
    const accessor = await findByApiKey(accessorKey);
    if (!accessor || accessor.github_login !== authorId) return c.json({ error: 'Stats are private' }, 403);

    const db = getDB();

    const [accessCounts, referralSignups, earnings] = await Promise.all([
      db.prepare(
        `SELECT event, COUNT(*) as total FROM access_log WHERE author_id = ? AND event IN ('shadow_view', 'quiz_take', 'quiz_share_view') GROUP BY event`
      ).bind(authorId).all(),
      db.prepare('SELECT COUNT(*) as total FROM referrals WHERE author_id = ?').bind(authorId).first<{ total: number }>(),
      db.prepare('SELECT SUM(author_cut_cents) as total FROM billing_tab WHERE author_id = ?').bind(authorId).first<{ total: number }>(),
    ]);

    const counts: Record<string, number> = {};
    for (const row of (accessCounts.results || []) as Array<{ event: string; total: number }>) {
      counts[row.event] = row.total;
    }

    return c.json({
      shadow_views: counts['shadow_view'] || 0,
      quiz_plays: counts['quiz_take'] || 0,
      quiz_share_views: counts['quiz_share_view'] || 0,
      referral_signups: referralSignups?.total || 0,
      total_earnings_cents: earnings?.total || 0,
    });
  });

}
