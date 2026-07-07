/**
 * Library — read-only company layer
 *
 * Published artifacts: shadows, pulses, quizzes, works.
 * Publishing goes through the protocol (PUT /file/{name}).
 * This file serves the website's read endpoints only.
 */

import { Hono, type Context } from 'hono';
import { getDB, generateId, ensureFilePriceColumn, clampPaidAmount } from './db.js';
import { logEvent } from './analytics.js';
import {
  ACTIVE_AUTHOR_STATUSES,
  extractApiKey,
  extractLibrarySessionToken,
  findByApiKey,
  findByLibrarySessionToken,
  type Account,
} from './auth.js';
import { getAllowedOrigins } from './cors.js';
import { getStripe, ensurePayoutsReady } from './billing.js';
import { getKV, loadAccounts } from './kv.js';
import { getAccountByLogin, updateAccountBilling } from './accounts.js';
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
import { generateToken, encrypt, decrypt } from './crypto.js';
import { hasGrant, grantState, grantAccess, listGrants, revokeGrant } from './grants.js';
import {
  resolveTwinVariants,
  twinPublicSummary,
  twinDisclaimer,
  runTwinInference,
  authorizeTwinAccess,
  healthEndpointFrom,
  validateSidecarUrl,
  type TwinVariant,
  type TwinVisibility,
  type TwinConfig,
  type TwinEnv,
  type TwinWork,
} from './twin.js';

// Env defaults for both twin variants, read once per call site.
function twinEnv(): TwinEnv {
  return {
    DEFAULT_TWIN_CHECKPOINT: process.env.DEFAULT_TWIN_CHECKPOINT,
    DEFAULT_TWIN_BASE: process.env.DEFAULT_TWIN_BASE,
    DEFAULT_TWIN_CONTEXT_MODEL: process.env.DEFAULT_TWIN_CONTEXT_MODEL,
  };
}

// Per-Author inference sidecar. Each Author runs their OWN sidecar (their keys,
// their substrate) — the Worker holds neither. Registration is a dedicated
// ENCRYPTED KV entry (`twin_sidecar:{author}`) so the query path and the online
// check read it the same way and the secret never rides in a settings blob.
// Falls back to the Worker env sidecar (User Zero's default) when an Author
// hasn't registered their own — so the same code path serves everyone.
interface SidecarConn { url: string; secret: string }

async function getSidecar(authorId: string): Promise<SidecarConn | null> {
  try {
    const raw = await getKV().get(`twin_sidecar:${authorId}`);
    if (raw) {
      const conn = JSON.parse(decrypt(raw)) as SidecarConn;
      if (conn?.url) return { url: conn.url, secret: conn.secret || '' };
    }
  } catch { /* fall through to the env default */ }
  const url = process.env.TWIN_INFERENCE_URL;
  return url ? { url, secret: process.env.TWIN_INFERENCE_SECRET || '' } : null;
}

// Is the Author's sidecar reachable right now? Cheap `/health` ping, cached ~30s
// (both online AND offline) so a page load never waits on the tunnel more than
// once per window. This is what powers the online/offline state on the page.
async function twinOnline(authorId: string): Promise<boolean> {
  const kv = getKV();
  try {
    const cached = await kv.get(`twin_online:${authorId}`);
    if (cached !== null) return cached === '1';
  } catch { /* ignore cache miss */ }
  const conn = await getSidecar(authorId);
  let online = false;
  if (conn?.url) {
    try {
      const ctrl = new AbortController();
      // Quick tunnels can be slow to first-byte; be tolerant so we don't flap offline.
      const t = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(healthEndpointFrom(conn.url), { signal: ctrl.signal });
      clearTimeout(t);
      online = res.ok;
    } catch { online = false; }
  }
  try { await kv.put(`twin_online:${authorId}`, online ? '1' : '0', { expirationTtl: 30 }); } catch { /* best effort */ }
  return online;
}

// Per-file category map (name → 'works'|'projects'|'shadows'|'other'), stored in
// a dedicated KV entry the owner sets. Lets the library page group entries into
// neat sections like the demo. Empty map = everything falls to 'shadows'.
async function getFileCategories(authorId: string): Promise<Record<string, string>> {
  try {
    const raw = await getKV().get(`file_categories:${authorId}`);
    if (raw) return JSON.parse(raw) as Record<string, string>;
  } catch { /* ignore */ }
  return {};
}

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
  buyer_github_login?: string | null;
};

// a3 § marketplace — 10% add-on fee (a values decision, single source of truth).
const MARKETPLACE_FEE_RATE = 0.10;

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
    // Linked accounts (X, LinkedIn, …) — [{label, url}], rendered as clean links.
    socials: Array.isArray(settings.socials)
      ? (settings.socials as unknown[])
          .map((s) => (s && typeof s === 'object' ? s as Record<string, unknown> : {}))
          .filter((s) => typeof s.label === 'string' && typeof s.url === 'string')
          .map((s) => ({ label: (s.label as string).trim(), url: (s.url as string).trim() }))
      : [],
    text: textSlot(settings, profile),
    files_url: `/library/${account.github_login}`,
  };
}

function fileAccessUrl(authorId: string, name: string): string {
  return `/library/${authorId}/file/${name}`;
}

/**
 * The living-page corpus for the deep twin's `search_my_works` tool: the Author's
 * published works CONTENT, gated to what THIS querier may see. readWork() is the
 * single visibility authority (same gate as a direct read), so denied works are
 * simply skipped — the corpus is correct by construction, no parallel rules.
 * Bounded (12 works × 4k chars) to keep the payload sane.
 */
async function fetchTwinWorks(authorId: string, accessor: Account | null): Promise<TwinWork[]> {
  const db = getDB();
  const { results } = await db.prepare(
    'SELECT id, title, tier FROM works WHERE author_id = ? ORDER BY published_at DESC LIMIT 12',
  ).bind(authorId).all<{ id: string; title: string; tier: string }>();
  const out: TwinWork[] = [];
  for (const w of results ?? []) {
    const r = await readWork({ authorId, workId: w.id, accessor });
    if (!r.ok || !r.obj?.body) continue; // gate denied or missing → skip
    let content = '';
    try { content = await new Response(r.obj.body).text(); } catch { continue; }
    if (content.trim()) out.push({ name: w.title, visibility: w.tier, content: content.slice(0, 4000) });
  }
  return out;
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

  // The member directory. Two rules, both by design (/a 2026-07-01):
  //   1. Authors-only browse — the roster is a tribe surface, never a public
  //      catalog. The public surface is each /library/{author} page, reached
  //      per-link (a4 — discovery is per-link, not per-search). Signed-out
  //      callers get an empty list + signed_in:false so the site shows a gate.
  //   2. Fill-to-appear — an Author is listed only once they have set BOTH a
  //      location and a contact (the two fields the "find the Alexandrians in
  //      London and reach them" use case needs). No forced disclosure: you
  //      appear by choosing to be findable, or you stay unlisted.
  app.get('/library', async (c) => {
    const key = extractApiKey(c);
    const byKey = key ? await findByApiKey(key) : null;
    const token = extractLibrarySessionToken(c);
    const bySession = token ? await findByLibrarySessionToken(token) : null;
    const viewer = byKey || bySession;
    if (!viewer) return c.json({ signed_in: false, authors: [], you_listed: false });

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
      // Fill-to-appear: both location and contact must be present.
      .filter((author) => !!author.location && !!author.contact)
      .sort((a, b) => b.id.localeCompare(a.id, undefined, { sensitivity: 'base' }));

    const youListed = authors.some((a) => a.id === viewer.github_login);

    logEvent('library_directory_view', { authors: String(authors.length) });
    return c.json({ signed_in: true, authors, you_listed: youListed });
  });

  app.get('/library/:author', async (c) => {
    const authorId = c.req.param('author');
    const db = getDB();
    const result = await getAccountByLogin(authorId);
    const account = result?.account || null;
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

    // fallback index for directoryAuthor still needs the full account ordering
    // (alexandria_id assigns by creation order). Single decrypt pass; the lookup
    // above already cost O(1).
    const accounts = await loadAccounts<AccountStore>();
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

    // Twin ("ask this mind") availability — public summary only (never a
    // checkpoint/model handle or system line). Drives whether the website
    // renders the minds section and how many variants it offers THIS viewer.
    //
    // The route is otherwise unauthenticated (public directory), but an API
    // key or library session cookie, if present, decides which gated variants
    // the viewer can reach — so the page can render the right toggle (both /
    // one / none) without a second round-trip.
    const viewerKey = extractApiKey(c);
    const viewerFromKey = viewerKey ? await findByApiKey(viewerKey) : null;
    const viewerToken = extractLibrarySessionToken(c);
    const viewerFromSession = viewerToken ? await findByLibrarySessionToken(viewerToken) : null;
    const viewer = viewerFromKey || viewerFromSession;
    const viewerSubscriber = !!viewer && ACTIVE_AUTHOR_STATUSES.has(viewer.subscription_status || '');

    const twinVariants = resolveTwinVariants(librarySettings(legacyAuthor), twinEnv());
    // Account-based access: a logged-in viewer with a live grant reaches an
    // invite twin with NO code. So evaluate the grant here — the page can show
    // "ask away" (granted) vs "log in" (anon) vs "not on the list" (signed in,
    // no grant) up front, instead of only finding out on submit.
    const twinGranted = viewer ? await hasGrant(authorId, viewer.github_id) : false;
    const twinAccessible = (cfg: TwinConfig): boolean => authorizeTwinAccess({
      visibility: cfg.visibility,
      authorGithubId: account!.github_id,
      accessorGithubId: viewer?.github_id ?? null,
      context: { inviteValid: twinGranted, subscriberValid: viewerSubscriber },
    }).allowed;

    const twinSummary = twinPublicSummary(twinVariants, twinAccessible);
    // Online/offline: only ping the sidecar when the Author actually has a twin
    // enabled (skip the round-trip for the overwhelming majority who don't).
    // `signed_in` lets the client pick "log in" vs "you're not on the list".
    const twinOut = twinSummary.enabled
      ? { ...twinSummary, online: await twinOnline(authorId), signed_in: !!viewer }
      : { ...twinSummary, online: false, signed_in: !!viewer };
    // Per-file "kind" (works/projects/shadows/other) so the page can lay entries
    // out in neat categories like the demo. Stored in a dedicated KV map the
    // owner sets; untagged files fall to 'shadows'.
    const fileCats = await getFileCategories(authorId);
    return c.json({
      author: directoryAuthor(account!, legacyAuthor, fallbackIndex),
      twin: twinOut,
      files: protocolFiles.map(file => ({
        name: file.name,
        // This route is unauthenticated (public directory). Don't leak the
        // author's private preview blurb for non-public files: public = open,
        // paid = sales listing (preview is the teaser), authors/invite =
        // private → suppress the preview text. Names stay (discovery + the
        // open page enforces content access). (audit M1)
        text: (file.visibility === 'public' || file.visibility === 'paid') ? file.text : null,
        visibility: file.visibility,
        category: fileCats[file.name] || 'shadows',
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

    const lookup = await getAccountByLogin(authorId);
    const authorAccount = lookup?.account;
    if (!authorAccount?.github_id) return c.json({ error: 'Author not found' }, 404);

    const db = getDB();
    await ensureFilePriceColumn();
    const file = await db.prepare(
      'SELECT account_id, name, visibility, price_cents FROM protocol_files WHERE account_id = ? AND name = ?'
    ).bind(String(authorAccount.github_id), name).first<{ account_id: string; name: string; visibility: string; price_cents: number | null }>();
    if (!file) return c.json({ error: 'File not found' }, 404);
    if (file.visibility !== 'paid') return c.json({ error: 'Only paid files can be checked out' }, 400);

    const profile = await db.prepare('SELECT settings FROM authors WHERE id = ?')
      .bind(authorId)
      .first<{ settings: string | null }>()
      .catch(() => null);
    const settings = parseJson<Record<string, unknown>>(profile?.settings, {});
    // Per-file price (author-set via PUT /file) wins over the per-author default,
    // then $2. The author's price is the FLOOR — a buyer may tip up via
    // amount_cents but never underpay the set price.
    const authorPriceCents = clampPaidAmount(
      typeof file.price_cents === 'number' ? file.price_cents
        : typeof settings.paid_price_cents === 'number' ? Math.round(settings.paid_price_cents)
        : 200,
    );

    const body = await c.req.json().catch(() => ({})) as { amount_cents?: unknown; return_origin?: unknown };
    const requestedAmount = typeof body.amount_cents === 'number' && Number.isFinite(body.amount_cents)
      ? Math.round(body.amount_cents)
      : authorPriceCents;
    const amountCents = clampPaidAmount(Math.max(requestedAmount, authorPriceCents));

    // Require an authenticated buyer (API key OR browser session), so the purchase
    // grant BINDS to their account and a leaked ?session_id= success URL is useless
    // to anyone else. Anonymous purchases produced a bearer grant — a replayable
    // 7-day token for the file (audit #8/M2). No bearer purchases anymore.
    const accessor = await resolveTwinAccessor(c);
    if (!accessor?.github_login) return c.json({ error: 'Please sign in to purchase.', needs_login: true }, 401);
    const WEBSITE_URL = process.env.WEBSITE_URL || 'https://alexandria-library.com';
    const requestedOrigin = typeof body.return_origin === 'string' ? body.return_origin.trim() : '';
    const allowedOrigins = new Set(getAllowedOrigins());
    const returnOrigin = requestedOrigin && allowedOrigins.has(requestedOrigin) ? requestedOrigin : WEBSITE_URL;
    const gatePath = `/library/${encodeURIComponent(authorId)}/open/${encodeURIComponent(name)}`;

    // Creator payout (Stripe Connect) — fail closed: an Author who has not
    // completed payout onboarding cannot sell (we never take money we can't
    // split). a3 § marketplace: 10% add-on fee, the Author nets their set price.
    const connectAcct = authorAccount.stripe_connect_account_id;
    const payoutsReady = await ensurePayoutsReady(authorAccount, updateAccountBilling);
    if (!connectAcct || !payoutsReady) {
      return c.json({ error: 'This author has not set up payouts yet.' }, 409);
    }
    const platformFeeCents = Math.round(amountCents * MARKETPLACE_FEE_RATE);
    const buyerTotalCents = amountCents + platformFeeCents;

    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      payment_intent_data: {
        application_fee_amount: platformFeeCents,
        transfer_data: { destination: connectAcct },
      },
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: buyerTotalCents,
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
        platform_fee_cents: String(platformFeeCents),
        author_amount_cents: String(amountCents),
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

    const lookup = await getAccountByLogin(authorId);
    const authorAccount = lookup?.account;
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
    let inviteCodeId: string | null = null;
    // Account grant first (no code needed once bound); else a valid code, which
    // binds to the account on use so it's never re-entered. A grant the owner
    // REVOKED is a hard stop for THAT account — a still-valid code cannot
    // resurrect it (audit B2). To cut everyone off, the owner revokes the code.
    const gState = accessor ? await grantState(authorId, accessor.github_id) : 'none';
    if (gState === 'live') {
      inviteValid = true;
    } else if (gState === 'revoked') {
      inviteValid = false;
    } else if (inviteCode) {
      const accessRow = await getDB().prepare(
        'SELECT id FROM access_codes WHERE author_id = ? AND code = ? AND revoked_at IS NULL LIMIT 1'
      ).bind(authorId, inviteCode).first<{ id: string }>();
      inviteValid = !!accessRow?.id;
      inviteCodeId = accessRow?.id || null;
      if (inviteValid && accessor) await grantAccess(authorId, accessor.github_id, { codeId: inviteCodeId ?? undefined });
    }

    let purchaseValid = false;
    if (purchaseSessionId) {
      const raw = await getKV().get(`library:access:${purchaseSessionId}`);
      if (raw) {
        const grant = parseJson<LibraryAccessGrant>(raw, {});
        const artifactMatch = grant.author_id === authorId
          && grant.artifact_id === name
          && grant.artifact_type === 'protocol_file';
        // STRUCTURAL: access requires the viewer to BE the bound buyer. A grant
        // with no buyer (the old anonymous-bearer form) is NEVER honored — a
        // leaked ?session_id= URL is useless to anyone, including the original
        // anonymous buyer. Purchases are now sign-in-gated so every grant is
        // buyer-bound; any pre-existing unbound grant (≤7-day TTL) simply stops
        // working, which is the fix, not a regression (audit #8/M2).
        const buyerOk = !!grant.buyer_github_login
          && accessor?.github_login === grant.buyer_github_login;
        purchaseValid = artifactMatch && buyerOk;
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
      // When access_reason='invite', capture which access_code row enabled
      // the read. The auditor can then correlate the file view to the
      // matching access_code_minted event in the chain.
      ...(inviteCodeId && result.reason === 'invite' ? { invite_code_id: inviteCodeId } : {}),
    });

    const cache = result.file.visibility === 'public' ? 'public, max-age=300' : 'no-store';
    return r2Response(result.obj.body, result.contentType, c.req.header('Origin'), cache);
  });

  // =========================================================================
  // TWIN — "ask this mind" (PLM)
  // =========================================================================
  //
  // The public-safe projection of an Author's mind. A visitor asks the Author's
  // trained weights-twin a question; the Worker relays it to the inference
  // sidecar (which holds TINKER_API_KEY) and returns the answer, honestly
  // labelled as a twin. Weights, not context — nothing at query time exposes
  // the Author's substrate (plm.md § both-twin architecture, the privacy floor).
  //
  // Gated: only Authors who have published+enabled a twin (settings.twin) and
  // have a resolvable checkpoint. Rate-limited per IP+author. Anonymous callers
  // are allowed — the weights twin is the stranger-facing floor.

  // Per IP+author KV rate limit — cheap, bounded, self-expiring. Returns true
  // when the request should be blocked.
  async function checkTwinRateLimit(authorId: string, ip: string, limit = 8, windowSec = 60): Promise<boolean> {
    try {
      const kv = getKV();
      const key = `rate:twin:${authorId}:${ip}`;
      const raw = await kv.get(key);
      const count = raw ? parseInt(raw, 10) : 0;
      if (count >= limit) return true;
      await kv.put(key, String(count + 1), { expirationTtl: windowSec });
      return false;
    } catch {
      return true; // FAIL CLOSED: a KV error must not open the metered/cost surface (security model, plm.md)
    }
  }

  // Per-AUTHOR + GLOBAL daily ceilings — the IP limiter above is defeated by IP
  // rotation (a proxy pool → unbounded Anthropic/Tinker spend). These caps are
  // IP-independent, so they bound cost-of-goods per author AND across the whole
  // platform per day regardless of source.
  //
  // CRITICAL (audit S1): the check is READ-ONLY and the count is only bumped
  // AFTER a billable inference succeeds. If checking also incremented (the old
  // behaviour), an attacker could exhaust an author's daily cap with requests
  // that never pass the visibility gate and never cost a cent — a free DoS on
  // the author's twin. Now only answered, billable queries consume the budget.
  const TWIN_DAILY_CAP_PER_AUTHOR = 500;
  const TWIN_DAILY_CAP_GLOBAL = 5000; // platform-wide cost backstop across all authors
  const GLOBAL_CAP_KEY = 'rate:twin:daily:__global__';

  // Read-only: is a daily ceiling already reached? Fail CLOSED (block) on KV
  // error — a metered/cost surface must never open when its guard is blind.
  async function twinDailyCapReached(authorId: string): Promise<boolean> {
    try {
      const kv = getKV();
      const [authorRaw, globalRaw] = await Promise.all([
        kv.get(`rate:twin:daily:${authorId}`),
        kv.get(GLOBAL_CAP_KEY),
      ]);
      if ((authorRaw ? parseInt(authorRaw, 10) : 0) >= TWIN_DAILY_CAP_PER_AUTHOR) return true;
      if ((globalRaw ? parseInt(globalRaw, 10) : 0) >= TWIN_DAILY_CAP_GLOBAL) return true;
      return false;
    } catch {
      return true; // FAIL CLOSED
    }
  }

  // Increment both counters — called ONLY after a billable inference succeeds.
  async function bumpTwinDaily(authorId: string): Promise<void> {
    try {
      const kv = getKV();
      const authorKey = `rate:twin:daily:${authorId}`;
      const [authorRaw, globalRaw] = await Promise.all([kv.get(authorKey), kv.get(GLOBAL_CAP_KEY)]);
      await Promise.all([
        kv.put(authorKey, String((authorRaw ? parseInt(authorRaw, 10) : 0) + 1), { expirationTtl: 86400 }),
        kv.put(GLOBAL_CAP_KEY, String((globalRaw ? parseInt(globalRaw, 10) : 0) + 1), { expirationTtl: 86400 }),
      ]);
    } catch {
      // A missed increment can only UNDER-count (never opens a bigger hole than
      // one query); the fail-closed read guard is the real ceiling. Swallow.
    }
  }

  // Invite-code validation for twin queries — same access_codes table the file
  // gate uses. Author-scoped, revocation-aware. Result feeds the shared gate.
  // A valid, un-revoked code for this author → its id (for grant provenance), else null.
  async function lookupCode(authorId: string, code: string): Promise<string | null> {
    if (!code) return null;
    const row = await getDB().prepare(
      'SELECT id FROM access_codes WHERE author_id = ? AND code = ? AND revoked_at IS NULL LIMIT 1'
    ).bind(authorId, code).first<{ id: string }>().catch(() => null);
    return row?.id ?? null;
  }

  // The invite decision, account-aware. Access is granted if the (logged-in)
  // accessor already holds a grant, OR they present a valid code — in which case
  // the code BINDS to their account (a grant), so they never re-enter it. An
  // anonymous caller with a valid code passes THIS request but nothing is bound
  // (no account yet); once they log in, the code binds. This one resolver backs
  // both the twin and the file gate.
  async function resolveInviteAccess(authorId: string, accessor: Account | null, code: string): Promise<boolean> {
    if (accessor) {
      const state = await grantState(authorId, accessor.github_id);
      if (state === 'live') return true;
      // Owner revoked THIS account — a still-valid code cannot resurrect it (B2).
      if (state === 'revoked') return false;
    }
    const codeId = await lookupCode(authorId, code);
    if (!codeId) return false;
    if (accessor) await grantAccess(authorId, accessor.github_id, { codeId }); // first bind (state 'none')
    return true;
  }

  // Resolve the querier from an API key or the browser library session cookie.
  // Anonymous (null) is allowed by callers that permit the public floor.
  async function resolveTwinAccessor(c: Context): Promise<Account | null> {
    const key = extractApiKey(c);
    const byKey = key ? await findByApiKey(key) : null;
    if (byKey) return byKey;
    const token = extractLibrarySessionToken(c);
    return token ? await findByLibrarySessionToken(token) : null;
  }

  type TwinQueryOutcome =
    | { ok: true; answer: string; variant: TwinVariant; label: string | null; disclaimer: string }
    | { ok: false; status: number; body: Record<string, unknown> };

  // Shared query core — used by BOTH the website `/ask` box and the
  // programmatic `/v1/twin/:author/query` API. Picks the variant, applies the
  // (reused) visibility gate, relays to the inference sidecar, and writes the
  // twin_query credits-ledger row. Rate-limiting stays at the route (the key
  // differs: IP for the browser, API-key owner for the API).
  async function runTwinQuery(p: {
    authorId: string;
    authorAccount: Account;
    displayName: string;
    settings: Record<string, unknown>;
    question: string;
    requestedVariant: TwinVariant | null;
    accessor: Account | null;
    inviteValid: boolean;
    focus?: { name: string; content: string };
    surface: 'library' | 'api';
  }): Promise<TwinQueryOutcome> {
    const variants = resolveTwinVariants(p.settings, twinEnv());

    // Variant selection. Explicit request must be enabled; otherwise default to
    // the weights FLOOR, falling back to the context ceiling.
    let cfg: TwinConfig | null;
    if (p.requestedVariant === 'weights') cfg = variants.weights.enabled ? variants.weights : null;
    else if (p.requestedVariant === 'context') cfg = variants.context.enabled ? variants.context : null;
    else cfg = variants.weights.enabled ? variants.weights : variants.context.enabled ? variants.context : null;

    if (!cfg) {
      return {
        ok: false,
        status: 404,
        body: { error: p.requestedVariant ? `the ${p.requestedVariant} twin is not available.` : 'This author has not enabled a twin.' },
      };
    }

    // Visibility gate — the SAME file-access brain, no parallel rules. "paid"
    // for a twin means the querier holds an active subscription (metered model).
    const subscriberValid = !!p.accessor && ACTIVE_AUTHOR_STATUSES.has(p.accessor.subscription_status || '');
    const decision = authorizeTwinAccess({
      visibility: cfg.visibility,
      authorGithubId: p.authorAccount.github_id,
      accessorGithubId: p.accessor?.github_id ?? null,
      context: { inviteValid: p.inviteValid, subscriberValid },
    });
    if (!decision.allowed) {
      logEvent('library_twin_ask', { author: p.authorId, surface: p.surface, variant: cfg.variant, status: String(decision.status), reason: decision.reason });
      return { ok: false, status: decision.status, body: { ...decision.body, variant: cfg.variant } };
    }

    // DEPTH is bound to the QUERIER and is STRUCTURAL, not membership-based
    // (audit B1/S3). The deep shadow (invite/friends.md) is only served to
    // someone who genuinely earned it: an ACCOUNT holding a live grant for THIS
    // author, or an account that is actually PAYING ('active', not free/trial/
    // beta). An anonymous caller — even one bearing a valid, shareable code —
    // never reaches deep: `p.accessor` is null, so a leaked code is a thin-depth
    // bearer at most, never a key to the deep substrate. Everyone else gets the
    // public shadow. One public twin, right depth, no toggle (plm.md).
    const grantValid = !!p.accessor && await hasGrant(p.authorId, p.accessor.github_id);
    const isPaying = p.accessor?.subscription_status === 'active';
    // LEAST PRIVILEGE (audit F4): the intimate invite/friends shadow loads ONLY for
    // someone the author PERSONALLY invited (a live grant). A paying-but-uninvited
    // querier gets the 'paid' shadow; everyone else the 'public' shadow. Depth is no
    // longer a binary that collapsed every deep querier onto the most intimate tier —
    // so "they pay" can never surface friends.md; that requires a real invite.
    const queryTier: TwinVisibility = grantValid ? 'invite' : isPaying ? 'paid' : 'public';
    const deep = grantValid || isPaying; // gates only the works tool (each work is separately visibility-gated)

    const system = cfg.system || `You are ${p.displayName}. Speak as yourself.`;
    // Living page: when the deep twin has the works tool on, hand it the Author's
    // published works CONTENT — but only the pieces this querier is allowed to see.
    // readWork() is the visibility authority (same gate as direct reads), so the
    // corpus is correct by construction — search_my_works never re-derives it.
    let works: TwinWork[] | undefined;
    if (cfg.variant === 'context' && cfg.tools?.works) {
      works = await fetchTwinWorks(p.authorId, p.accessor ?? null);
    }
    const sidecar = await getSidecar(p.authorId);
    const result = await runTwinInference(
      cfg.variant === 'weights'
        ? { variant: 'weights', question: p.question, system, maxTokens: 512, checkpoint: cfg.checkpoint, base: cfg.base }
        : { variant: 'context', question: p.question, system, maxTokens: 512, model: cfg.model, tools: cfg.tools, author: p.authorId, works, tier: queryTier, focus: p.focus },
      { url: sidecar?.url, secret: sidecar?.secret },
    );

    if (!result.ok) {
      logEvent('library_twin_ask', { author: p.authorId, surface: p.surface, variant: cfg.variant, status: String(result.status), reason: result.reason });
      return { ok: false, status: result.status, body: { error: result.error, reason: result.reason, variant: cfg.variant } };
    }

    // Billable success — NOW consume the daily budget (audit S1/S2). Gate-failed
    // and errored queries above never reach here, so they cost the author nothing.
    await bumpTwinDaily(p.authorId);

    // Internal-credits ledger (plm.md § payment): each answered query is a debit
    // on the querier's tier allowance and a credit to the queried Author. The
    // MVP records the event as the ledger primitive (queryable per author,
    // per variant); amount + settlement is the founder's pricing call — see the
    // task note. The variant lands in both `tier` (queryable) and `meta`.
    try {
      await getDB().prepare(
        `INSERT INTO access_log (event, author_id, accessor_id, artifact_id, tier, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).bind(
        'twin_query',
        p.authorId,
        p.accessor?.github_login || 'anonymous',
        'twin',
        cfg.variant,
        JSON.stringify({ q_len: p.question.length, a_len: result.answer.length, variant: cfg.variant, surface: p.surface }),
        new Date().toISOString(),
      ).run();
    } catch (e) {
      console.error('[twin/query] ledger insert failed:', e);
    }

    logEvent('library_twin_ask', {
      author: p.authorId,
      surface: p.surface,
      variant: cfg.variant,
      status: '200',
      accessor: p.accessor?.github_login || 'anonymous',
    });

    return { ok: true, answer: result.answer, variant: cfg.variant, label: cfg.label, disclaimer: twinDisclaimer(p.displayName, cfg.variant) };
  }

  app.post('/library/:author/ask', async (c) => {
    const authorId = c.req.param('author');

    const lookup = await getAccountByLogin(authorId);
    const authorAccount = lookup?.account;
    if (!authorAccount?.github_id) return c.json({ error: 'Author not found' }, 404);

    // Rate limit before doing any (paid) inference work — per IP+author, plus a
    // per-author daily ceiling that IP rotation can't defeat.
    const ip = c.req.header('cf-connecting-ip') || 'unknown';
    if (await checkTwinRateLimit(authorId, ip)) {
      return c.json({ error: 'Too many questions — give the twin a minute.' }, 429);
    }
    if (await twinDailyCapReached(authorId)) {
      return c.json({ error: 'This twin has answered its limit for today — try again tomorrow.' }, 429);
    }

    const body = await c.req.json().catch(() => ({})) as { question?: unknown; variant?: unknown; invite?: unknown; focus?: unknown };
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (!question) return c.json({ error: 'Ask a question.' }, 400);
    if (question.length > 2000) return c.json({ error: 'Question too long (2000 chars max).' }, 400);
    const requestedVariant: TwinVariant | null = body.variant === 'weights' || body.variant === 'context' ? body.variant : null;
    // The piece being read (reader workspace), if any — bounded so it can't blow the payload.
    const fRaw = body.focus && typeof body.focus === 'object' ? body.focus as Record<string, unknown> : null;
    const focus = fRaw && typeof fRaw.content === 'string' && fRaw.content.trim()
      ? { name: typeof fRaw.name === 'string' ? fRaw.name.slice(0, 200) : '', content: fRaw.content.slice(0, 20000) }
      : undefined;

    const profile = await getDB().prepare('SELECT display_name, settings FROM authors WHERE id = ?')
      .bind(authorId)
      .first<{ display_name: string | null; settings: string | null }>()
      .catch(() => null);
    const settings = parseJson<Record<string, unknown>>(profile?.settings, {});
    const displayName = profile?.display_name?.trim() || authorAccount.github_name?.trim() || authorId;

    // Anonymous is allowed — the weights floor is the stranger-facing default.
    const accessor = await resolveTwinAccessor(c);
    const inviteCode = c.req.query('invite')?.trim() || (typeof body.invite === 'string' ? body.invite.trim() : '');
    // Grant-aware: a live account grant OR a valid code (which binds to the account).
    const inviteValid = await resolveInviteAccess(authorId, accessor, inviteCode);

    const outcome = await runTwinQuery({
      authorId, authorAccount, displayName, settings, question, requestedVariant, accessor, inviteValid, focus, surface: 'library',
    });
    if (!outcome.ok) return c.json(outcome.body, outcome.status as 401 | 402 | 403 | 404 | 502 | 503 | 504);
    return c.json({
      ok: true,
      twin: true,
      author: authorId,
      author_name: displayName,
      variant: outcome.variant,
      label: outcome.label,
      answer: outcome.answer,
      disclaimer: outcome.disclaimer,
    });
  });

  // Programmatic twin API — plug a mind into your own app. API-key auth (reuses
  // the account key mechanism); rate-limited per key owner; same visibility
  // gate (the key owner's access level decides which variants they can hit);
  // same twin_query credits-ledger row. Returns { answer, variant, disclaimer }.
  // Contract documented in .tasks/plm-ask-feature.md.
  app.post('/v1/twin/:author/query', async (c) => {
    const authorId = c.req.param('author');
    if (!isValidAuthorId(authorId)) return c.json({ error: 'Invalid author ID' }, 400);

    // Programmatic surface = API key only (no anonymous, no cookie). A caller
    // plugging a twin into their app authenticates with their Alexandria key.
    const key = extractApiKey(c);
    const accessor = key ? await findByApiKey(key) : null;
    if (!accessor) return c.json({ error: 'API key required — Authorization: Bearer alex_...' }, 401);

    const lookup = await getAccountByLogin(authorId);
    const authorAccount = lookup?.account;
    if (!authorAccount?.github_id) return c.json({ error: 'Author not found' }, 404);

    // Rate limit keyed on the API-key owner (not IP) — the API is per-account.
    if (await checkTwinRateLimit(authorId, `key:${accessor.github_login}`, 30, 60)) {
      return c.json({ error: 'Rate limit exceeded — slow down.' }, 429);
    }
    // Same per-author + global daily ceilings as the web route (shared cost surface).
    if (await twinDailyCapReached(authorId)) {
      return c.json({ error: 'This twin has reached its daily limit — try again tomorrow.' }, 429);
    }

    const body = await c.req.json().catch(() => ({})) as { question?: unknown; variant?: unknown; invite?: unknown };
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (!question) return c.json({ error: 'Provide a question.' }, 400);
    if (question.length > 2000) return c.json({ error: 'Question too long (2000 chars max).' }, 400);
    const requestedVariant: TwinVariant | null = body.variant === 'weights' || body.variant === 'context' ? body.variant : null;

    const profile = await getDB().prepare('SELECT display_name, settings FROM authors WHERE id = ?')
      .bind(authorId)
      .first<{ display_name: string | null; settings: string | null }>()
      .catch(() => null);
    const settings = parseJson<Record<string, unknown>>(profile?.settings, {});
    const displayName = profile?.display_name?.trim() || authorAccount.github_name?.trim() || authorId;

    const inviteCode = typeof body.invite === 'string' ? body.invite.trim() : (c.req.query('invite')?.trim() || '');
    const inviteValid = await resolveInviteAccess(authorId, accessor, inviteCode);

    const outcome = await runTwinQuery({
      authorId, authorAccount, displayName, settings, question, requestedVariant, accessor, inviteValid, surface: 'api',
    });
    if (!outcome.ok) return c.json(outcome.body, outcome.status as 401 | 402 | 403 | 404 | 502 | 503 | 504);
    return c.json({ answer: outcome.answer, variant: outcome.variant, disclaimer: outcome.disclaimer });
  });

  // Owner-only twin config. Configure EITHER variant independently:
  //   { weights: { enabled, visibility, checkpoint, base, label, system },
  //     context: { enabled, visibility, model, label, system, tools } }
  // Legacy flat fields ({ enabled, checkpoint, base, label, system }) still work
  // and apply to the WEIGHTS variant (back-compat with the single-twin config).
  // The checkpoint/model are not secrets; keeping the write owner-scoped stops
  // anyone else from pointing an Author's twin at other weights. Public read of
  // the variant summary rides GET /library/:author.
  app.post('/library/:author/twin', async (c) => {
    const authorId = c.req.param('author');
    const accessorKey = extractApiKey(c);
    const sessionToken = extractLibrarySessionToken(c);
    const accessor = accessorKey
      ? await findByApiKey(accessorKey)
      : sessionToken ? await findByLibrarySessionToken(sessionToken) : null;
    if (!accessor) return c.json({ error: 'Authentication required' }, 401);
    if (!(await isHandleOwner(accessor, authorId))) return c.json({ error: 'Only the author can configure their twin' }, 403);

    const body = await c.req.json().catch(() => ({})) as Record<string, unknown>;

    const db = getDB();
    const row = await db.prepare('SELECT settings FROM authors WHERE id = ?')
      .bind(authorId)
      .first<{ settings: string | null }>()
      .catch(() => null);
    const settings = parseJson<Record<string, unknown>>(row?.settings, {});

    // Start from the current stored twin, migrating a legacy flat blob into the
    // weights slot so an old single-twin config upgrades cleanly on first write.
    const rawTwin = (settings.twin && typeof settings.twin === 'object' ? settings.twin : {}) as Record<string, unknown>;
    const hasNested = (rawTwin.weights && typeof rawTwin.weights === 'object')
      || (rawTwin.context && typeof rawTwin.context === 'object');
    const curWeights: Record<string, unknown> = hasNested
      ? { ...(rawTwin.weights && typeof rawTwin.weights === 'object' ? rawTwin.weights as Record<string, unknown> : {}) }
      : { ...rawTwin };
    delete curWeights.weights; delete curWeights.context; // strip if legacy flat carried junk keys
    const curContext: Record<string, unknown> = rawTwin.context && typeof rawTwin.context === 'object'
      ? { ...(rawTwin.context as Record<string, unknown>) }
      : {};

    const VALID_VIS = new Set(['public', 'authors', 'paid', 'invite']);
    // Apply the fields common to both variants; returns an error string or null.
    const applyCommon = (target: Record<string, unknown>, patch: Record<string, unknown>): string | null => {
      if (typeof patch.enabled === 'boolean') target.enabled = patch.enabled;
      if (typeof patch.visibility === 'string') {
        const v = patch.visibility.trim();
        if (!VALID_VIS.has(v)) return 'visibility must be one of: public, authors, paid, invite';
        target.visibility = v;
      }
      if (typeof patch.label === 'string') {
        const label = patch.label.trim().slice(0, 80);
        if (label) target.label = label; else delete target.label;
      }
      if (typeof patch.system === 'string') {
        const sys = patch.system.trim().slice(0, 4000);
        if (sys) target.system = sys; else delete target.system;
      }
      return null;
    };

    // weights patch = nested body.weights merged with any legacy flat fields.
    const weightsPatch: Record<string, unknown> = {
      ...(body.weights && typeof body.weights === 'object' ? body.weights as Record<string, unknown> : {}),
    };
    for (const k of ['enabled', 'checkpoint', 'base', 'label', 'system']) {
      if (!(k in weightsPatch) && k in body) weightsPatch[k] = body[k];
    }
    const contextPatch: Record<string, unknown> = body.context && typeof body.context === 'object'
      ? body.context as Record<string, unknown>
      : {};

    let err = applyCommon(curWeights, weightsPatch);
    if (err) return c.json({ error: err }, 400);
    if (typeof weightsPatch.checkpoint === 'string') {
      const cp = weightsPatch.checkpoint.trim();
      if (cp && !cp.startsWith('tinker://')) return c.json({ error: 'checkpoint must be a tinker:// handle' }, 400);
      if (cp) curWeights.checkpoint = cp; else delete curWeights.checkpoint;
    }
    if (typeof weightsPatch.base === 'string' && weightsPatch.base.trim()) curWeights.base = weightsPatch.base.trim().slice(0, 120);

    err = applyCommon(curContext, contextPatch);
    if (err) return c.json({ error: err }, 400);
    if (typeof contextPatch.model === 'string') {
      const m = contextPatch.model.trim().slice(0, 120);
      if (m) curContext.model = m; else delete curContext.model;
    }
    if (typeof contextPatch.tools === 'boolean') curContext.tools = contextPatch.tools;

    settings.twin = { weights: curWeights, context: curContext };

    // Upsert — the author row may not exist yet for a brand-new account.
    const now = new Date().toISOString();
    await db.prepare(
      `INSERT INTO authors (id, settings, published_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET settings = excluded.settings, updated_at = excluded.updated_at`
    ).bind(authorId, JSON.stringify(settings), now, now).run();

    const variants = resolveTwinVariants(settings, twinEnv());
    logEvent('library_twin_config', {
      author: authorId,
      weights_enabled: String(variants.weights.enabled),
      context_enabled: String(variants.context.enabled),
    });
    // Owner view: full summary (owner sees every variant as accessible) plus the
    // resolved config state per variant so the settings UI can reflect it.
    return c.json({
      ok: true,
      ...twinPublicSummary(variants),
      weights: { enabled: variants.weights.enabled, visibility: variants.weights.visibility, has_checkpoint: !!variants.weights.checkpoint, base: variants.weights.base },
      context: { enabled: variants.context.enabled, visibility: variants.context.visibility, has_model: !!variants.context.model, tools: variants.context.tools },
    });
  });

  // Register / update the Author's inference sidecar (the machine that runs their
  // twin — their keys, their substrate). Owner-only. Stored ENCRYPTED in a
  // dedicated KV entry; the secret is never returned by any read. This is what
  // makes the twin universal: every Author points Alexandria at their OWN
  // sidecar, so the Worker holds neither keys nor substrate for anyone.
  app.put('/library/:author/twin/sidecar', async (c) => {
    const authorId = c.req.param('author');
    const owner = await resolveOwnerOnly(c, authorId);
    if ('error' in owner) return owner.error;

    const body = await c.req.json().catch(() => ({})) as { url?: unknown; secret?: unknown };
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    const secret = typeof body.secret === 'string' ? body.secret.trim() : '';
    if (!url) return c.json({ error: 'sidecar url required' }, 400);
    const urlErr = validateSidecarUrl(url);
    if (urlErr) return c.json({ error: urlErr }, 400);
    if (!secret) return c.json({ error: 'sidecar secret required (same value as the sidecar’s TWIN_INFERENCE_SECRET)' }, 400);

    await getKV().put(`twin_sidecar:${authorId}`, encrypt(JSON.stringify({ url, secret })));
    await getKV().delete(`twin_online:${authorId}`).catch(() => {}); // force a fresh online check
    logEvent('twin_sidecar_registered', { author: authorId });
    return c.json({ ok: true, url }); // never echo the secret
  });

  // Disconnect the sidecar — the twin goes offline, nothing is served.
  app.delete('/library/:author/twin/sidecar', async (c) => {
    const authorId = c.req.param('author');
    const owner = await resolveOwnerOnly(c, authorId);
    if ('error' in owner) return owner.error;
    await getKV().delete(`twin_sidecar:${authorId}`).catch(() => {});
    await getKV().delete(`twin_online:${authorId}`).catch(() => {});
    logEvent('twin_sidecar_removed', { author: authorId });
    return c.json({ ok: true });
  });

  // Owner status: is a sidecar registered, and is it reachable right now?
  app.get('/library/:author/twin/sidecar', async (c) => {
    const authorId = c.req.param('author');
    const owner = await resolveOwnerOnly(c, authorId);
    if ('error' in owner) return owner.error;
    const conn = await getKV().get(`twin_sidecar:${authorId}`);
    let url: string | null = null;
    if (conn) { try { url = (JSON.parse(decrypt(conn)) as SidecarConn).url; } catch { url = null; } }
    return c.json({ configured: !!conn, url, online: await twinOnline(authorId) });
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
    const authorId = c.req.param('author');

    const result = await readQuizDefinition({ quizId, authorId });
    if (!result.ok) return c.json(result.body, result.status);

    return c.json({ quiz_id: quizId, author_id: result.quiz.author_id, ...result.data });
  });

  app.post('/library/:author/quiz/:id/submit', async (c) => {
    const quizId = c.req.param('id');
    const authorId = c.req.param('author');
    const db = getDB();

    const body = await c.req.json().catch(() => null);
    if (!body || !body.answers) return c.json({ error: 'Provide answers' }, 400);

    const quizResult = await readQuizDefinition({ quizId, authorId });
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

    // Scope: the quiz must belong to the URL's author. Without this, a share
    // link can claim authorship of any quiz it knows the id+slug of.
    const quiz = await db.prepare('SELECT title, author_id FROM quizzes WHERE id = ?').bind(quizId).first<{ title: string; author_id: string }>();
    if (!quiz || quiz.author_id !== authorId) return c.json({ error: 'Result not found' }, 404);

    const result = await db.prepare(
      'SELECT * FROM quiz_results WHERE result_slug = ? AND quiz_id = ?'
    ).bind(slug, quizId).first();
    if (!result) return c.json({ error: 'Result not found' }, 404);

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

  // One-time checkout for paid works — server half of the existing website
  // page at /library/:author/checkout/work (which POSTs { work_id,
  // amount_cents }). Fulfillment is the generic kind=library webhook branch
  // in billing.ts: it writes the `library:access:{session_id}` grant and the
  // billing_tab ledger row from metadata, so artifact_type=work needs no new
  // webhook code. promo_code is accepted but not yet honored (no promo
  // primitive exists server-side; the page degrades gracefully).
  app.post('/library/:author/checkout/work', async (c) => {
    const authorId = c.req.param('author');
    const body = await c.req.json().catch(() => ({})) as {
      work_id?: unknown; amount_cents?: unknown; return_origin?: unknown;
    };
    const workId = typeof body.work_id === 'string' ? body.work_id.trim() : '';
    if (!workId) return c.json({ error: 'work_id required' }, 400);

    const db = getDB();
    const work = await db.prepare(
      'SELECT id, title, tier FROM works WHERE id = ? AND author_id = ?'
    ).bind(workId, authorId).first<{ id: string; title: string; tier: string }>();
    if (!work) return c.json({ error: 'Work not found' }, 404);
    if (work.tier !== 'paid') return c.json({ error: 'Only paid works can be checked out' }, 400);

    // The checkout page's slider runs $20–$200; clamp to that range so a
    // tampered request can't create a $0.50 session.
    const requestedAmount = typeof body.amount_cents === 'number' && Number.isFinite(body.amount_cents)
      ? Math.round(body.amount_cents)
      : 2000;
    const amountCents = Math.max(2000, Math.min(20000, requestedAmount));

    // Creator payout (Stripe Connect) — fail closed (a3 § marketplace: 10% add-on).
    const authorLookup = await getAccountByLogin(authorId);
    const authorAccount = authorLookup?.account;
    if (!authorAccount?.github_id) return c.json({ error: 'Author not found' }, 404);
    const connectAcct = authorAccount.stripe_connect_account_id;
    const payoutsReady = await ensurePayoutsReady(authorAccount, updateAccountBilling);
    if (!connectAcct || !payoutsReady) {
      return c.json({ error: 'This author has not set up payouts yet.' }, 409);
    }
    const platformFeeCents = Math.round(amountCents * MARKETPLACE_FEE_RATE);
    const buyerTotalCents = amountCents + platformFeeCents;

    // Require an authenticated buyer (API key OR browser session) so the grant
    // binds to their account — no anonymous bearer session_id (audit #8/M2).
    const accessor = await resolveTwinAccessor(c);
    if (!accessor?.github_login) return c.json({ error: 'Please sign in to purchase.', needs_login: true }, 401);
    const WEBSITE_URL = process.env.WEBSITE_URL || 'https://alexandria-library.com';
    const SERVER_URL = process.env.SERVER_URL || 'https://api.alexandria-library.com';
    const requestedOrigin = typeof body.return_origin === 'string' ? body.return_origin.trim() : '';
    const allowedOrigins = new Set(getAllowedOrigins());
    const returnOrigin = requestedOrigin && allowedOrigins.has(requestedOrigin) ? requestedOrigin : WEBSITE_URL;

    const session = await getStripe().checkout.sessions.create({
      mode: 'payment',
      payment_intent_data: {
        application_fee_amount: platformFeeCents,
        transfer_data: { destination: connectAcct },
      },
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: buyerTotalCents,
          product_data: {
            name: work.title,
            description: `Alexandria Library work by ${authorId}`,
          },
        },
        quantity: 1,
      }],
      metadata: {
        kind: 'library',
        library_purchase: 'true',
        author_id: authorId,
        artifact_type: 'work',
        artifact_id: workId,
        platform_fee_cents: String(platformFeeCents),
        author_amount_cents: String(amountCents),
        ...(accessor?.github_login ? { github_login: accessor.github_login } : {}),
      },
      // Success lands directly on the work content with the session grant —
      // works have no gate page; the markdown is the destination.
      success_url: `${SERVER_URL}/library/${encodeURIComponent(authorId)}/work/${encodeURIComponent(workId)}?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${returnOrigin}/library/${encodeURIComponent(authorId)}/checkout/work?work_id=${encodeURIComponent(workId)}&cancel=1`,
    });

    if (!session.url) return c.json({ error: 'Failed to create checkout session' }, 500);
    return c.json({ url: session.url });
  });

  app.get('/library/:author/work/:id', async (c) => {
    const workId = c.req.param('id');
    const authorId = c.req.param('author');

    const accessorKey = extractApiKey(c);
    const accessor = accessorKey ? await findByApiKey(accessorKey) : null;

    // One-time purchase grant — same KV grant the paid-file path uses,
    // written by the Stripe webhook on checkout completion (kind=library,
    // artifact_type=work).
    const purchaseSessionId = c.req.query('session_id')?.trim() || null;
    let purchaseValid = false;
    if (purchaseSessionId) {
      const raw = await getKV().get(`library:access:${purchaseSessionId}`);
      if (raw) {
        const grant = parseJson<LibraryAccessGrant>(raw, {});
        // Buyer-bound (parity with the paid-FILE path): a leaked ?session_id must
        // not be bearer-replayable by a different account (security model, plm.md).
        const buyerOk = !grant.buyer_github_login
          || accessor?.github_login === grant.buyer_github_login;
        purchaseValid = buyerOk
          && grant.author_id === authorId
          && grant.artifact_id === workId
          && grant.artifact_type === 'work';
      }
    }

    const result = await readWork({ authorId, workId, accessor, purchaseValid });
    if (!result.ok) {
      // Paid denials carry the checkout page URL so the website can launch
      // the flow — mirror of the paid-file 402 contract.
      if (result.status === 402) {
        return c.json({
          ...result.body,
          checkout_url: `${process.env.WEBSITE_URL || 'https://alexandria-library.com'}/library/${encodeURIComponent(authorId)}/checkout/work?work_id=${encodeURIComponent(workId)}`,
        }, 402);
      }
      return c.json(result.body, result.status);
    }

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
    if (!(await isHandleOwner(accessor, authorId))) return c.json({ error: 'Access log is private' }, 403);

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
  // ACCESS CODES — owner mints/lists/revokes invite codes for their files
  // =========================================================================
  //
  // An access_code is author-scoped, not file-scoped. One code unlocks every
  // invite-visibility file the author has published. The owner mints a code
  // and shares the URL `…/library/{author}/open/{name}?invite={code}` with
  // a recipient; the gate page auto-attempts on URL load.
  //
  // Schema (migrations/0002_private_tier.sql):
  //   access_codes(id, author_id, code UNIQUE, label?, created_at, revoked_at?)
  //
  // Validation happens at the file route (library.ts above): code must exist
  // for that author_id AND revoked_at IS NULL. Revocation is soft — kept in
  // the row so the audit chain can resolve historic accessor='invite' entries.

  // Ownership = the IMMUTABLE github_id that first claimed this library handle
  // (the sticky login binding), never a github_login STRING match. A github_login
  // equality check is defeated by handle recycling: an attacker who grabs a freed
  // username signs in with accessor.github_login === authorId and passes. Resolve
  // the sticky owner via getAccountByLogin (returns the id that owns the handle,
  // regardless of who currently carries the name) and compare numeric ids.
  async function isHandleOwner(accessor: Account | null, authorId: string): Promise<boolean> {
    if (!accessor?.github_id) return false;
    const owner = await getAccountByLogin(authorId);
    const ownerId = owner?.account?.github_id;
    return ownerId != null && String(ownerId) === String(accessor.github_id);
  }

  async function resolveOwnerOnly(c: Context, authorId: string): Promise<Account | { error: Response }> {
    const accessorKey = extractApiKey(c);
    const sessionToken = extractLibrarySessionToken(c);
    const accessor = accessorKey
      ? await findByApiKey(accessorKey)
      : sessionToken ? await findByLibrarySessionToken(sessionToken) : null;
    if (!accessor) return { error: c.json({ error: 'Authentication required' }, 401) };
    if (!(await isHandleOwner(accessor, authorId))) return { error: c.json({ error: 'Only the file owner can manage access codes' }, 403) };
    return accessor;
  }

  app.post('/library/:author/access-code', async (c) => {
    const authorId = c.req.param('author');
    const owner = await resolveOwnerOnly(c, authorId);
    if ('error' in owner) return owner.error;

    const body = await c.req.json<{ label?: string }>().catch(() => ({} as { label?: string }));
    const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 80) : null;

    // 12 bytes = 24 hex chars. UNIQUE index on code; retry on the astronomical
    // collision case rather than hand-coding "if exists" pre-check.
    const id = generateId();
    const code = generateToken(12);
    const now = new Date().toISOString();
    await getDB().prepare(
      'INSERT INTO access_codes (id, author_id, code, label, created_at) VALUES (?, ?, ?, ?, ?)'
    ).bind(id, authorId, code, label, now).run();

    logEvent('access_code_minted', { author: authorId, ...(label ? { label } : {}) });
    return c.json({ id, code, label, created_at: now }, 201);
  });

  app.get('/library/:author/access-codes', async (c) => {
    const authorId = c.req.param('author');
    const owner = await resolveOwnerOnly(c, authorId);
    if ('error' in owner) return owner.error;

    const result = await getDB().prepare(
      'SELECT id, code, label, created_at, revoked_at FROM access_codes WHERE author_id = ? ORDER BY created_at DESC LIMIT 200'
    ).bind(authorId).all<{ id: string; code: string; label: string | null; created_at: string; revoked_at: string | null }>();
    return c.json({ codes: result.results || [] });
  });

  app.delete('/library/:author/access-code/:id', async (c) => {
    const authorId = c.req.param('author');
    const id = c.req.param('id');
    const owner = await resolveOwnerOnly(c, authorId);
    if ('error' in owner) return owner.error;

    const now = new Date().toISOString();
    const result = await getDB().prepare(
      'UPDATE access_codes SET revoked_at = ? WHERE id = ? AND author_id = ? AND revoked_at IS NULL'
    ).bind(now, id, authorId).run();

    if (!result.meta.changes) {
      return c.json({ error: 'Code not found or already revoked' }, 404);
    }
    // CASCADE: revoking a code must also cut off every account that already BOUND
    // it (access_grants.code_id records provenance). Without this, revoking a code
    // stopped only NEW redemptions — accounts that already redeemed kept deep
    // access, so "revoke the code to cut everyone off" was false. Now it holds.
    const cascade = await getDB().prepare(
      'UPDATE access_grants SET revoked_at = ? WHERE author_id = ? AND code_id = ? AND revoked_at IS NULL'
    ).bind(now, authorId, id).run().catch(() => null);
    logEvent('access_code_revoked', { author: authorId, id, grants_revoked: String(cascade?.meta?.changes ?? 0) });
    return c.json({ ok: true, id, revoked_at: now, grants_revoked: cascade?.meta?.changes ?? 0 });
  });

  // Account grants — the code-free invite path. Grant a specific person by their
  // github handle; they log in once and they're in, no code to send or type.
  app.post('/library/:author/grant', async (c) => {
    const authorId = c.req.param('author');
    const owner = await resolveOwnerOnly(c, authorId);
    if ('error' in owner) return owner.error;

    const body = await c.req.json<{ login?: string; label?: string }>().catch(() => ({} as { login?: string; label?: string }));
    const login = typeof body.login === 'string' ? body.login.trim().replace(/^@/, '') : '';
    if (!login) return c.json({ error: 'Provide the invitee’s github login.' }, 400);
    const lookup = await getAccountByLogin(login);
    const invitee = lookup?.account;
    if (!invitee?.github_id) return c.json({ error: `No Alexandria account for "${login}" — they need to sign in once first.` }, 404);

    const label = typeof body.label === 'string' && body.label.trim() ? body.label.trim().slice(0, 80) : login;
    // Owner path → reactivate: an explicit owner grant is the ONE way to clear a
    // prior revoke (code-reuse can't — audit B2).
    await grantAccess(authorId, invitee.github_id, { label, reactivate: true });
    logEvent('twin_grant_added', { author: authorId, invitee: login });
    return c.json({ ok: true, login, github_id: invitee.github_id, label });
  });

  // Set the per-file categories (works/projects/shadows/other) for the neat
  // library layout. Owner-only. Body: { categories: { "<file-name>": "works", ... } }.
  app.put('/library/:author/file-categories', async (c) => {
    const authorId = c.req.param('author');
    const owner = await resolveOwnerOnly(c, authorId);
    if ('error' in owner) return owner.error;
    const body = await c.req.json<{ categories?: Record<string, unknown> }>().catch(() => ({} as { categories?: Record<string, unknown> }));
    const VALID = new Set(['works', 'projects', 'shadows', 'other']);
    const clean: Record<string, string> = {};
    for (const [name, kind] of Object.entries(body.categories || {})) {
      if (typeof kind === 'string' && VALID.has(kind)) clean[name] = kind;
    }
    await getKV().put(`file_categories:${authorId}`, JSON.stringify(clean));
    logEvent('file_categories_set', { author: authorId, count: String(Object.keys(clean).length) });
    return c.json({ ok: true, categories: clean });
  });

  app.get('/library/:author/grants', async (c) => {
    const authorId = c.req.param('author');
    const owner = await resolveOwnerOnly(c, authorId);
    if ('error' in owner) return owner.error;
    return c.json({ grants: await listGrants(authorId) });
  });

  app.delete('/library/:author/grant/:accountId', async (c) => {
    const authorId = c.req.param('author');
    const accountId = c.req.param('accountId');
    const owner = await resolveOwnerOnly(c, authorId);
    if ('error' in owner) return owner.error;
    await revokeGrant(authorId, accountId);
    logEvent('twin_grant_revoked', { author: authorId, account: accountId });
    return c.json({ ok: true });
  });

  // =========================================================================
  // STATS (Author-authenticated)
  // =========================================================================

  app.get('/library/:author/stats', async (c) => {
    const authorId = c.req.param('author');
    const accessorKey = extractApiKey(c);
    if (!accessorKey) return c.json({ error: 'Authentication required' }, 401);
    const accessor = await findByApiKey(accessorKey);
    if (!accessor || !(await isHandleOwner(accessor, authorId))) return c.json({ error: 'Stats are private' }, 403);

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
