/**
 * Library — read-only company layer
 *
 * Published artifacts: shadows, pulses, quizzes, works.
 * Publishing goes through the protocol (PUT /file/{name}).
 * This file serves the website's read endpoints only.
 */

import { Hono, type Context } from 'hono';
import { canonicalLibraryLocation, LIBRARY_LOCATIONS, libraryLocationKey } from '../../shared/library-locations.js';
import { getDB, generateId, ensureFilePriceColumn, ensureFileTitleColumn, clampPaidAmount } from './db.js';
import { logEvent } from './analytics.js';
import {
  extractApiKey,
  extractLibrarySessionToken,
  findByApiKey,
  findByLibrarySessionToken,
  type Account,
} from './auth.js';
import { getAllowedOrigins } from './cors.js';
import { getStripe, ensurePayoutsReady, resolveMembership } from './billing.js';
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
  accessHeaders,
  guideEndpointFrom,
  validateSidecarUrl,
  type TwinVariant,
  type TwinVisibility,
  type TwinConfig,
  type TwinEnv,
  type TwinWork,
} from './twin.js';

const DEFAULT_FOUNDER_LOGIN = 'benmowinckel';

function founderLogin(): string {
  return (process.env.ADMIN_GITHUB_LOGIN || DEFAULT_FOUNDER_LOGIN).trim().toLowerCase();
}

/**
 * Company-funded inference is a founder-only compatibility path. Every other
 * Author must bring a sidecar backed by their own model account. Keeping this
 * decision here — before variant resolution and before network access — means
 * a missing per-Author model/checkpoint can never silently resolve to a company
 * default.
 */
export function inferenceEnvForAuthor(
  authorId: string,
  env: TwinEnv,
  adminLogin = DEFAULT_FOUNDER_LOGIN,
): TwinEnv {
  return authorId.trim().toLowerCase() === adminLogin.trim().toLowerCase() ? env : {};
}

// Env defaults for both twin variants, founder-only.
function twinEnv(authorId: string): TwinEnv {
  return inferenceEnvForAuthor(authorId, {
    DEFAULT_TWIN_CHECKPOINT: process.env.DEFAULT_TWIN_CHECKPOINT,
    DEFAULT_TWIN_BASE: process.env.DEFAULT_TWIN_BASE,
    DEFAULT_TWIN_CONTEXT_MODEL: process.env.DEFAULT_TWIN_CONTEXT_MODEL,
  }, founderLogin());
}

// Per-Author inference sidecar. Each Author runs their OWN sidecar (their keys,
// their substrate) — the Worker holds neither. Registration is a dedicated
// ENCRYPTED KV entry (`twin_sidecar:{author}`) so the query path and the online
// check read it the same way and the secret never rides in a settings blob.
// The founder alone may use the Worker env sidecar. Non-founder Authors fail
// closed when their own connection is absent, malformed, or not explicitly
// registered as author-owned.
interface SidecarConn { url: string; secret: string; owner_account?: boolean }

export function acceptsAuthorSidecar(
  authorId: string,
  conn: SidecarConn | null,
  adminLogin = DEFAULT_FOUNDER_LOGIN,
): boolean {
  if (!conn?.url) return false;
  return authorId.trim().toLowerCase() === adminLogin.trim().toLowerCase() || conn.owner_account === true;
}

async function getSidecar(authorId: string): Promise<SidecarConn | null> {
  try {
    const raw = await getKV().get(`twin_sidecar:${authorId}`);
    if (raw) {
      const conn = JSON.parse(decrypt(raw)) as SidecarConn;
      if (acceptsAuthorSidecar(authorId, conn, founderLogin())) {
        return { url: conn.url, secret: conn.secret || '', owner_account: true };
      }
    }
  } catch { /* fail closed below */ }
  if (authorId.trim().toLowerCase() !== founderLogin()) return null;
  const url = process.env.TWIN_INFERENCE_URL;
  return url ? { url, secret: process.env.TWIN_INFERENCE_SECRET || '', owner_account: true } : null;
}

/**
 * Is the Author's mirror actually able to answer right now? `/health` ping,
 * cached ~30s (online AND offline) so a page load never waits on the tunnel more
 * than once per window.
 *
 * Reachable is NOT the same as working: this used to report `online: true` off a
 * 200 alone, so a sidecar whose every model call failed looked perfectly healthy
 * — which is how the founder's own mirror served three weeks of failures unseen
 * (2026-07-28). The sidecar now reports the outcome of its last real inference,
 * and a mirror that cannot answer is reported offline, because that is what it
 * is from the reader's side. The model name rides along so the page can say what
 * it's running on without anyone hard-coding a second copy of that string.
 */
type TwinStatus = { online: boolean; model: string | null; reason: string | null };

async function twinStatus(authorId: string): Promise<TwinStatus> {
  const kv = getKV();
  const OFFLINE: TwinStatus = { online: false, model: null, reason: null };
  try {
    const cached = await kv.get(`twin_online:${authorId}`);
    // '1'/'0' are the pre-2026-07-28 cache shape — honoured so the rollout
    // doesn't read them back as garbage during the 30s TTL overlap.
    if (cached === '1') return { online: true, model: null, reason: null };
    if (cached === '0') return OFFLINE;
    if (cached) return JSON.parse(cached) as TwinStatus;
  } catch { /* ignore cache miss / stale shape */ }
  const conn = await getSidecar(authorId);
  let status: TwinStatus = OFFLINE;
  if (conn?.url) {
    try {
      const ctrl = new AbortController();
      // Quick tunnels can be slow to first-byte; be tolerant so we don't flap offline.
      const t = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(healthEndpointFrom(conn.url), { signal: ctrl.signal, headers: accessHeaders() });
      clearTimeout(t);
      if (res.ok) {
        // An older sidecar reports only `{ok:true}` — no `inference` field. Absent
        // means unknown, and unknown must not read as broken, so only an explicit
        // 'failing' takes it offline.
        const body = await res.json().catch(() => ({})) as Record<string, unknown>;
        const failing = body.inference === 'failing';
        status = {
          online: !failing,
          model: typeof body.model === 'string' ? body.model : null,
          reason: failing ? String(body.inference_error || 'inference failing') : null,
        };
      }
    } catch { status = OFFLINE; }
  }
  try { await kv.put(`twin_online:${authorId}`, JSON.stringify(status), { expirationTtl: 30 }); } catch { /* best effort */ }
  return status;
}

async function twinOnline(authorId: string): Promise<boolean> {
  return (await twinStatus(authorId)).online;
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

// The fixed 4-category vocabulary the library page groups files under. Fixed
// scaffolding (a values decision, not intelligence): the vocab is constant even
// though everything about how the sections render is Author-controllable.
const LIBRARY_CATEGORIES = ['works', 'projects', 'shadows', 'other'] as const;
function isLibraryCategory(v: unknown): v is (typeof LIBRARY_CATEGORIES)[number] {
  return typeof v === 'string' && (LIBRARY_CATEGORIES as readonly string[]).includes(v);
}

// When a file has no category in the map yet (published before the category
// flowed, or a KV miss), render it sensibly instead of dumping everything into
// 'shadows': a shadow-named file → shadows, else → works (finished output is the
// common case). Once the reconcile lands its real category this is never hit.
function categoryFallback(name: string): string {
  return /^shadow/i.test(name) ? 'shadows' : 'works';
}

// The Author's optional profile config: how the /library page routes over the
// categories they've published — an ordering, a subset to hide, and per-section
// renames (word + whisper). Read-side sanitizer: pulls settings.profile into a
// clean shape the page can trust. Absent/garbage → empty, and the page falls
// back to the emergent default (all populated categories, default order +
// whispers). Schemaless and permissive: unknown keys are dropped, never
// rejected, so a smarter Engine can enrich the blob without a migration.
function normalizeProfile(settings: Record<string, unknown>): {
  order: string[]; hidden: string[]; labels: Record<string, { word?: string; whisper?: string }>;
} {
  const p = (settings.profile && typeof settings.profile === 'object') ? settings.profile as Record<string, unknown> : {};
  const cats = (v: unknown): string[] => Array.isArray(v) ? [...new Set(v.filter(isLibraryCategory))] : [];
  const labels: Record<string, { word?: string; whisper?: string }> = {};
  if (p.labels && typeof p.labels === 'object') {
    for (const [cat, val] of Object.entries(p.labels as Record<string, unknown>)) {
      if (!isLibraryCategory(cat) || !val || typeof val !== 'object') continue;
      const v = val as Record<string, unknown>;
      const entry: { word?: string; whisper?: string } = {};
      if (typeof v.word === 'string' && v.word.trim()) entry.word = v.word.trim().slice(0, 40);
      if (typeof v.whisper === 'string' && v.whisper.trim()) entry.whisper = v.whisper.trim().slice(0, 80);
      if (entry.word || entry.whisper) labels[cat] = entry;
    }
  }
  return { order: cats(p.order), hidden: cats(p.hidden), labels };
}

// Owner-authored public teaser line per file — the browse-list subtitle. Kept
// separate from the file's `text` blurb ON PURPOSE: `text` is suppressed for
// authors/invite files (audit M1), so gated pieces would otherwise show a bare
// title. This map is always public (like `category`) and opt-in per file, so an
// Author surfaces a one-line teaser for a gated piece without exposing its
// private preview blurb. Keyed by author slug, mirroring file_categories.
async function getFileSubtitles(authorId: string): Promise<Record<string, string>> {
  try {
    const raw = await getKV().get(`file_subtitles:${authorId}`);
    if (raw) return JSON.parse(raw) as Record<string, string>;
  } catch { /* ignore */ }
  return {};
}

// Per-file suggested questions — the artifact's own `.questions` sidecar (the
// Artifact Loop), a few short prompts per file that seed the rotating ask on the
// profile door, the PLM chat, and the reader on the piece. Generated FROM the
// artifact so the PLM context is guaranteed to answer them; always public like
// the subtitle (they are teasers). Keyed by author slug, mirroring
// file_subtitles. Empty until the publish flow populates it — surfaces then fall
// back to generic prompts.
async function getFileQuestions(authorId: string): Promise<Record<string, string[]>> {
  try {
    const raw = await getKV().get(`file_questions:${authorId}`);
    if (raw) {
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      const out: Record<string, string[]> = {};
      for (const [name, v] of Object.entries(parsed)) {
        if (!Array.isArray(v)) continue;
        const qs = v.filter((q): q is string => typeof q === 'string' && !!q.trim()).map((q) => q.trim());
        if (qs.length) out[name] = qs;
      }
      return out;
    }
  } catch { /* ignore */ }
  return {};
}

// Owner-set display order (array of file names). Custom order WINS where set;
// anything not named falls BELOW the ordered items, by recency — so a curated
// page holds its shape and a fresh publish lands at the bottom instead of
// jumping the queue (founder, 2026-07-18: recency is only the default).
async function getFileOrder(authorId: string): Promise<string[]> {
  try {
    const raw = await getKV().get(`file_order:${authorId}`);
    if (raw) {
      const arr = JSON.parse(raw);
      if (Array.isArray(arr)) return arr.filter((n): n is string => typeof n === 'string');
    }
  } catch { /* ignore */ }
  return [];
}

/** Stable sort: named files first in the given order, the rest keep their
 *  existing (recency) order below. */
function applyFileOrder<T extends { name: string }>(files: T[], order: string[]): T[] {
  if (!order.length) return files;
  const rank = new Map(order.map((n, i) => [n, i]));
  return [...files].sort((a, b) => {
    const ra = rank.has(a.name) ? (rank.get(a.name) as number) : Number.MAX_SAFE_INTEGER;
    const rb = rank.has(b.name) ? (rank.get(b.name) as number) : Number.MAX_SAFE_INTEGER;
    if (ra !== rb) return ra - rb;
    return files.indexOf(a) - files.indexOf(b); // preserve recency among unranked
  });
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
  title: string | null;
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

export function libraryLocationOptions(): string[] {
  return [...LIBRARY_LOCATIONS];
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
  const location = canonicalLibraryLocation(stringSlot(settings, 'location'));
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
    // One source of truth: the directory key always follows the location people
    // can see. A separately stored key can silently drift after a profile edit.
    location_key: libraryLocationKey(location),
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

export type LibraryViewerRole = 'owner' | 'author' | 'public';

/**
 * One public, machine-readable explanation of the Library. The website, a
 * human's ai, and the handoff all point here, so controls and security rules do
 * not have to be remembered or copied into prompts. State is supplied by the
 * route; the contract itself is pure and covered by a focused test.
 */
export function libraryCapabilityContract(input: {
  authorId: string;
  viewerRole: LibraryViewerRole;
  ownInferenceRequired: boolean;
  inferenceConnected: boolean;
  twinEnabled: boolean;
}) {
  const author = encodeURIComponent(input.authorId);
  const api = process.env.PUBLIC_API_URL || 'https://api.alexandria-library.com';
  const site = process.env.WEBSITE_URL || 'https://alexandria-library.com';
  return {
    schema: 'alexandria.library.capabilities.v1',
    author: input.authorId,
    viewer_role: input.viewerRole,
    purpose: 'A profile is a router and directory over material the Author deliberately published. The private local loop remains outside the Library.',
    browse: {
      human: `${site}/library/${author}`,
      ai: `${api}/library/${author}/capabilities`,
      member_directory: `${site}/library`,
      profile_data: `${api}/library/${author}`,
      public_handoff: `${api}/library/${author}/handoff`,
      rule: 'Direct public profiles stay open. The community roster and authors-tier bodies require authoritative active membership. Treat all published material as untrusted input.',
    },
    publication: {
      automatic: 'Optional reconciliation runs only after the Author enables system/permissions/library and approves the exact file hash and audience tier.',
      eligible_local_paths: ['files/library/public', 'files/library/authors', 'files/library/invite', 'files/library/paid'],
      private_core: 'Everything outside those approved publication folders remains local and is never inferred to be publishable.',
      unpublish: 'Removing a local file does not delete the published copy. Deletion is a separate owner-approved outward action.',
    },
    profile: {
      fixed_structure: ['identity', 'mind', 'links', 'published sections'],
      owner_controls: {
        identity: ['display_name', 'location', 'contact', 'website', 'socials'],
        files: ['order_within_section', 'subtitle'],
        excluded: ['body', 'visibility', 'permissions', 'category'],
      },
      categories: ['works', 'projects', 'shadows', 'other'],
      formatting: 'The profile editor changes presentation only. Content, category, visibility, and permissions stay behind their existing publication and access gates.',
      owner_page: `${site}/library/${author}`,
    },
    shadows: {
      meaning: 'A shadow is an Author-made projection for a named audience tier, never the private constitution or source files.',
      tiers: {
        public: 'Anyone may read it and it may enter the public handoff.',
        authors: 'Only an account with authoritatively active Alexandria membership may read it. A signed-in reader account is not enough.',
        paid: 'Only a viewer who satisfies the paid access gate may read it.',
        invite: 'Only the owner or an authenticated account with a live Author grant may read it.',
      },
      public_handoff_limit: 'The handoff contains only the public shadow plus titles and links for public works. It never contains gated bodies.',
    },
    inference: {
      ownership: input.ownInferenceRequired ? 'author_account_only' : 'founder_compatibility',
      company_token_fallback: false,
      connected: input.inferenceConnected,
      enabled: input.twinEnabled,
      rule: input.ownInferenceRequired
        ? 'The Author must run and register their own inference sidecar using a model account and token they control. If it is absent, inference is offline.'
        : 'The founder may use the founder compatibility sidecar. No other Author can inherit it.',
      privacy: 'The Worker stores the sidecar connection secret encrypted and never receives the Author model-provider token or private substrate.',
    },
    permissions: {
      reads: 'Public reads need no account. Authors-tier reads require authoritative active membership; paid purchases and invites retain their separate explicit grants.',
      writes: 'Every profile, file-metadata, shadow, grant, and inference configuration write is owner-authenticated.',
      invites: 'Codes bind to an authenticated account on first use. Revoking that account prevents the code from restoring access.',
    },
    owner_api: {
      auth: 'Use the Author API key as Authorization: Bearer <key>, or the signed-in Library session cookie.',
      profile: { method: 'PUT', path: `/library/${author}/profile` },
      file_categories: { method: 'PUT', path: `/library/${author}/file-categories` },
      file_order: { method: 'PUT', path: `/library/${author}/file-order` },
      file_subtitles: { method: 'PUT', path: `/library/${author}/file-subtitles` },
      file_questions: { method: 'PUT', path: `/library/${author}/file-questions` },
      inference_sidecar: { method: 'PUT', path: `/library/${author}/twin/sidecar`, required_body_acknowledgement: { own_account: true } },
      grants: { create: `/library/${author}/grant`, list: `/library/${author}/grants`, revoke: `/library/${author}/grant/{account_id}` },
    },
  };
}

/**
 * The living-page corpus for the deep twin's `search_my_works` tool. Two sources:
 *
 *   1. The works product (`works` table) — content gated by readWork(), the
 *      single visibility authority; denied works are skipped.
 *   2. The Library pieces (`protocol_files`) — the surface the Author's profile
 *      actually shows. Readable text pieces enter with CONTENT (gated by
 *      readProtocolFile, same brain as a direct read). Everything else — a piece
 *      this querier can't read, or a PDF the Worker can't extract — enters as a
 *      TEASER entry: title + always-public subtitle + its reader URL. Titles and
 *      teasers are already public on the profile, so this leaks nothing; it lets
 *      the twin KNOW every published piece exists and point the reader there,
 *      instead of denying its own work ("no such passage exists") when asked
 *      about a gated piece.
 *
 * Bounded (12 works + 24 files × 4k chars) to keep the payload sane.
 */
async function fetchTwinWorks(
  authorId: string,
  authorGithubId: string | number,
  accessor: Account | null,
  context?: { inviteValid?: boolean; subscriberValid?: boolean },
): Promise<TwinWork[]> {
  const db = getDB();
  const { results } = await db.prepare(
    'SELECT id, title, tier FROM works WHERE author_id = ? ORDER BY published_at DESC LIMIT 12',
  ).bind(authorId).all<{ id: string; title: string; tier: string }>();
  const out: TwinWork[] = [];
  for (const w of results ?? []) {
    const r = await readWork({ authorId, workId: w.id, accessor, subscriberValid: context?.subscriberValid });
    if (!r.ok || !r.obj?.body) continue; // gate denied or missing → skip
    let content = '';
    try { content = await new Response(r.obj.body).text(); } catch { continue; }
    if (content.trim()) out.push({ name: w.title, visibility: w.tier, content: content.slice(0, 4000) });
  }

  const { results: files } = await db.prepare(
    'SELECT name, title, visibility, content_type FROM protocol_files WHERE account_id = ? ORDER BY updated_at DESC LIMIT 24',
  ).bind(String(authorGithubId)).all<{ name: string; title: string | null; visibility: string; content_type: string | null }>();
  const subtitles = await getFileSubtitles(authorId);
  for (const f of files ?? []) {
    if (isInternalProtocolFileName(f.name)) continue;
    if (f.name === 'shadow') continue; // the shadow reaches the twin as substrate, never as a searchable work
    const label = f.title || f.name;
    const teaser = subtitles[f.name] || '';
    const type = f.content_type || '';
    const textual = !type || type.includes('markdown') || type.startsWith('text/');
    if (textual) {
      const r = await readProtocolFile({
        authorGithubId,
        fileName: f.name,
        accessorGithubId: accessor?.github_id ?? null,
        context: { inviteValid: context?.inviteValid, subscriberValid: context?.subscriberValid },
      });
      if (r.ok) {
        let content = '';
        try { content = await new Response(r.obj.body).text(); } catch { content = ''; }
        if (content.trim()) {
          out.push({ name: label, visibility: f.visibility, content: content.slice(0, 4000) });
          continue;
        }
      }
    }
    const gated = f.visibility !== 'public';
    out.push({
      name: label,
      visibility: f.visibility,
      content: `[${gated ? 'locked' : 'reference'} — '${label}' is a piece I published on my Library`
        + `${gated ? ` (${f.visibility}-only)` : ''}.${teaser ? ` teaser: ${teaser}` : ''}`
        + ` the full text isn't loaded in this conversation${gated ? ' — the reader can sign in or use an invite to read it' : ''};`
        + ` it lives at /library/${authorId}/read/${f.name}.]`,
    });
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

    // Authentication and membership are separate. A cancelled member keeps
    // account-management access, while every subscriber benefit keys off this
    // authoritative result rather than the stored KV derivative.
    const membership = account ? await resolveMembership(account) : null;

    return c.json({
      signed_in: !!account,
      github_login: account?.github_login || null,
      github_name: account?.github_name || null,
      membership_active: membership?.available === true && membership.active,
      membership_available: membership?.available ?? true,
      subscription_status: membership?.status || null,
      membership_source: membership?.source || null,
      membership_verified_at: membership?.verified_at || null,
      cancel_at_period_end: membership?.cancel_at_period_end || false,
      cancel_at: membership?.cancel_at || null,
    });
  });

  // The stable discovery surface for a human's ai. Public facts stay public;
  // viewer_role is the only viewer-relative field and never grants access.
  app.get('/library/:author/capabilities', async (c) => {
    const authorId = c.req.param('author');
    const lookup = await getAccountByLogin(authorId);
    const account = lookup?.account || null;
    if (!account?.github_id) return c.json({ error: 'Author not found' }, 404);

    const key = extractApiKey(c);
    const byKey = key ? await findByApiKey(key) : null;
    const token = extractLibrarySessionToken(c);
    const bySession = token ? await findByLibrarySessionToken(token) : null;
    const viewer = byKey || bySession;
    const owner = !!viewer && String(viewer.github_id) === String(account.github_id);

    const row = await getDB().prepare('SELECT settings FROM authors WHERE id = ?')
      .bind(authorId).first<{ settings: string | null }>().catch(() => null);
    const variants = resolveTwinVariants(parseJson<Record<string, unknown>>(row?.settings, {}), twinEnv(authorId));
    const conn = await getSidecar(authorId);
    const contract = libraryCapabilityContract({
      authorId,
      viewerRole: owner ? 'owner' : viewer ? 'author' : 'public',
      ownInferenceRequired: authorId.trim().toLowerCase() !== founderLogin(),
      inferenceConnected: !!conn,
      twinEnabled: variants.weights.enabled || variants.context.enabled,
    });
    return c.json(contract, 200, {
      'Cache-Control': viewer ? 'private, no-store' : 'public, max-age=60',
      'X-Content-Type-Options': 'nosniff',
    });
  });

  // The member directory. Two rules, both by design (/a 2026-07-01):
  //   1. Authors-only browse — the roster is a tribe surface, never a public
  //      catalog. The public surface is each /library/{author} page, reached
  //      per-link (a4 — discovery is per-link, not per-search). Signed-out
  //      callers get an empty list + signed_in:false. Signed-in reader or
  //      inactive accounts get signed_in:true + membership_active:false, but
  //      never roster bytes. A reader account is not a community member.
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
    if (!viewer) return c.json({ signed_in: false, membership_active: false, authors: [], you_listed: false });

    const viewerMembership = await resolveMembership(viewer);
    const membershipFields = {
      membership_active: viewerMembership.available && viewerMembership.active,
      membership_available: viewerMembership.available,
      membership_status: viewerMembership.status,
      membership_source: viewerMembership.source,
      membership_verified_at: viewerMembership.verified_at,
      cancel_at_period_end: viewerMembership.cancel_at_period_end,
      cancel_at: viewerMembership.cancel_at,
    };
    if (!membershipFields.membership_active) {
      return c.json({ signed_in: true, ...membershipFields, authors: [], you_listed: false });
    }

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

    // Fill-to-appear before live membership checks: accounts without the two
    // public directory fields cannot appear, so do not spend a Stripe lookup
    // on them. Reuse the viewer's result when they are one of the candidates.
    const directoryCandidates = accountList
      .map((account, index) => ({
        account,
        author: directoryAuthor(account, profilesById.get(account.github_login) || null, index),
      }))
      .filter(({ author }) => !!author.location && !!author.contact);
    const resolvedAccounts = await Promise.all(directoryCandidates.map(async ({ account, author }) => ({
      account,
      author,
      membership: account.github_id === viewer.github_id ? viewerMembership : await resolveMembership(account),
    })));
    const authors = resolvedAccounts
      .map(({ author, membership }) => {
        if (!membership.available || !membership.active) return null;
        return author;
      })
      .filter((author): author is NonNullable<typeof author> => !!author?.id)
      .sort((a, b) => b.id.localeCompare(a.id, undefined, { sensitivity: 'base' }));

    const youListed = authors.some((a) => a.id === viewer.github_login);

    logEvent('library_directory_view', { authors: String(authors.length) });
    return c.json({ signed_in: true, ...membershipFields, authors, you_listed: youListed });
  });

  app.get('/library/:author', async (c) => {
    const authorId = c.req.param('author');
    const db = getDB();
    const result = await getAccountByLogin(authorId);
    const account = result?.account || null;
    const accountId = account?.github_id ? String(account.github_id) : null;

    if (!accountId) return c.json({ error: 'Author not found' }, 404);

    await ensureFileTitleColumn();
    const files = await db.prepare(
      `SELECT account_id, name, text, title, visibility, updated_at
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
    const viewerIsOwner = !!viewer && String(viewer.github_id) === String(account!.github_id);
    const viewerMembership = viewer ? await resolveMembership(viewer) : null;
    const viewerSubscriber = viewerMembership?.available === true && viewerMembership.active;

    const twinVariants = resolveTwinVariants(librarySettings(legacyAuthor), twinEnv(authorId));
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
    // The depth THIS viewer's questions will get (mirrors runTwinQuery's
    // structural tiering: grant → invite shadow, paying → paid, else public).
    // Surfaced so the chat can tell the visitor which mind they're speaking
    // with and that a deeper one exists to be invited into — without it the
    // invite tier is invisible and nobody knows to ask for it.
    const twinDepth: TwinVisibility = twinGranted ? 'invite' : viewerSubscriber ? 'paid' : 'public';
    // Online/offline: only ping the sidecar when the Author actually has a twin
    // enabled (skip the round-trip for the overwhelming majority who don't).
    // `signed_in` lets the client pick "log in" vs "you're not on the list".
    // What this viewer has left, BEFORE they ask. Knowing only by hitting the
    // wall is the same defect as a mirror that reports itself online while
    // failing: the state exists, we just weren't telling anyone (founder
    // 2026-07-29 — "i dont see the no questions left").
    const twinIp = c.req.header('cf-connecting-ip') || 'unknown';
    const twinLimit = visitorAllowance(viewer);
    const twinUsed = twinSummary.enabled ? await twinVisitorUsed(authorId, viewer, twinIp) : 0;
    const twinBudget = twinUsed === null ? {} : { limit: twinLimit, remaining: Math.max(0, twinLimit - twinUsed) };
    const twinLive = twinSummary.enabled ? await twinStatus(authorId) : null;
    const twinOut = twinLive
      ? { ...twinSummary, online: twinLive.online, model: twinLive.model, signed_in: !!viewer, depth: twinDepth, ...twinBudget }
      : { ...twinSummary, online: false, model: null, signed_in: !!viewer, depth: twinDepth, ...twinBudget };
    // Per-file "kind" (works/projects/shadows/other) so the page can lay entries
    // out in neat categories like the demo. Stored in a dedicated KV map the
    // owner sets; untagged files fall to 'shadows'.
    const fileCats = await getFileCategories(authorId);
    const fileSubs = await getFileSubtitles(authorId);
    const fileQs = await getFileQuestions(authorId);
    const fileOrder = await getFileOrder(authorId);
    const orderedFiles = applyFileOrder(protocolFiles, fileOrder);
    // Aggregate every piece's suggested questions into the twin object so the
    // profile/PLM ask composer can rotate them (deduped, capped). Per-file
    // questions ride with each file for the reader on that specific piece.
    const twinQuestions = Array.from(
      new Set(orderedFiles.flatMap((f) => fileQs[f.name] || [])),
    ).slice(0, 12);
    // The Author's optional section config (order / hidden / labels). The page
    // is a router over what they published: emergent by default, curatable here.
    const profileCfg = normalizeProfile(librarySettings(legacyAuthor));
    return c.json({
      author: directoryAuthor(account!, legacyAuthor, fallbackIndex),
      viewer: {
        signed_in: !!viewer,
        is_owner: viewerIsOwner,
        capabilities_url: `/library/${authorId}/capabilities`,
        membership_active: viewerSubscriber,
        membership_status: viewerMembership?.status || null,
        membership_source: viewerMembership?.source || null,
        membership_verified_at: viewerMembership?.verified_at || null,
      },
      twin: { ...twinOut, questions: twinQuestions },
      profile: profileCfg,
      location_options: libraryLocationOptions(),
      files: orderedFiles.map(file => ({
        name: file.name,
        title: file.title ?? null,
        // The piece's own suggested questions (always public, like subtitle) —
        // seed the reader's rotating ask on this specific piece.
        questions: fileQs[file.name] || null,
        // This route is unauthenticated (public directory). Don't leak the
        // author's private preview blurb for non-public files: public = open,
        // paid = sales listing (preview is the teaser), authors/invite =
        // private → suppress the preview text. Names stay (discovery + the
        // open page enforces content access). (audit M1)
        text: (file.visibility === 'public' || file.visibility === 'paid') ? file.text : null,
        // Always-public teaser (opt-in per file). Lets a gated piece show a
        // one-line subtitle in the browse list without exposing its private
        // `text` blurb. Empty for files the Author hasn't set one on.
        subtitle: fileSubs[file.name] || null,
        visibility: file.visibility,
        category: fileCats[file.name] || categoryFallback(file.name),
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

    const needsMembership = !!accessor && accessor.github_login !== authorId;
    const membership = needsMembership ? await resolveMembership(accessor) : null;
    const result = await readProtocolFile({
      authorGithubId: authorAccount.github_id,
      fileName: name,
      accessorGithubId: accessor?.github_id ?? null,
      context: {
        purchaseValid,
        inviteValid,
        subscriberValid: membership?.available === true && membership.active,
      },
    });

    if (!result.ok) {
      if (result.reason === 'membership_required' && membership?.available === false) {
        return c.json({ error: 'Membership verification is temporarily unavailable. Try again.', reason: 'membership_unavailable' }, 503);
      }
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

  // ---------------------------------------------------------------------
  // The visitor's allowance — the limit that is NOT a wall.
  //
  // The two limiters above protect the Author (burst) and the platform (daily
  // cost). Neither bounds what one reader may take, so a single visitor could
  // consume an Author's whole day. This one is per VISITOR per Author per day.
  //
  // Its point is not rationing. Running out is the moment the handoff earns its
  // keep: the reader leaves with the Author's public mind, the piece, and the
  // conversation, and continues on the model they already pay for. That costs us
  // nothing and is the product's own thesis — ride the AI you already have. So
  // the ceiling is generous, and hitting it opens a door rather than closing one.
  //
  // Signed-in visitors get more because they are identifiable and accountable;
  // an anonymous caller is an IP, which is cheap to rotate.
  const TWIN_VISITOR_ALLOWANCE_ANON = 10;
  const TWIN_VISITOR_ALLOWANCE_MEMBER = 20;

  function visitorAllowance(accessor: Account | null): number {
    return accessor ? TWIN_VISITOR_ALLOWANCE_MEMBER : TWIN_VISITOR_ALLOWANCE_ANON;
  }

  // Identity for the counter: the account when we have one (survives IP changes,
  // so a member can't multiply their allowance by moving networks), else the IP.
  //
  // The IP is HASHED, never stored raw. A counter only needs to tell visitors
  // apart, which a digest does exactly as well — and the server holding no
  // user-specific plaintext is a standing rule here, not a preference. Salted
  // per author so the same visitor isn't correlatable across Authors by key.
  async function hashIp(authorId: string, ip: string): Promise<string> {
    const data = new TextEncoder().encode(`${authorId}:${ip}`);
    const digest = await crypto.subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(digest).slice(0, 10))
      .map((b) => b.toString(16).padStart(2, '0')).join('');
  }

  async function visitorKey(authorId: string, accessor: Account | null, ip: string): Promise<string> {
    const who = accessor?.github_login || `ip:${await hashIp(authorId, ip)}`;
    return `rate:twin:visitor:${authorId}:${who}`;
  }

  // Read-only, like the daily cap: checking must never consume, or a blocked
  // question would spend an allowance it never used (audit S1, same reasoning).
  async function twinVisitorUsed(authorId: string, accessor: Account | null, ip: string): Promise<number | null> {
    try {
      const raw = await getKV().get(await visitorKey(authorId, accessor, ip));
      return raw ? parseInt(raw, 10) : 0;
    } catch {
      // null = unknown. The ASK path treats unknown as spent (fail closed — a
      // blind guard must not open a cost surface); the DISPLAY path shows
      // nothing rather than telling an innocent visitor they're out.
      return null;
    }
  }

  // Called ONLY after a billable answer, same as bumpTwinDaily.
  //
  // A signed-in visitor spends BOTH their account counter and their IP counter.
  // Otherwise signing out is a reset button: burn the member's 25, log out, and
  // collect a fresh anonymous 10. Spending both means the anonymous bucket is
  // already past its limit by the time they get there.
  async function bumpTwinVisitor(authorId: string, accessor: Account | null, ip: string): Promise<void> {
    const keys = accessor
      ? await Promise.all([visitorKey(authorId, accessor, ip), visitorKey(authorId, null, ip)])
      : [await visitorKey(authorId, null, ip)];
    await Promise.all(keys.map(async (key) => {
      try {
        const kv = getKV();
        const raw = await kv.get(key);
        await kv.put(key, String((raw ? parseInt(raw, 10) : 0) + 1), { expirationTtl: 86400 });
      } catch { /* under-counts at worst; the read guard is the ceiling */ }
    }));
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
    /** Caller-requested DOWNGRADE to the public depth (the free toggle). Only
     *  ever honored downward — an invited viewer previewing the free mind. The
     *  structural ceiling (grant/payment) is computed server-side regardless;
     *  a request can never raise depth. */
    requestedDepth?: 'public' | null;
    focus?: { name: string; content: string };
    surface: 'library' | 'api';
  }): Promise<TwinQueryOutcome> {
    const variants = resolveTwinVariants(p.settings, twinEnv(p.authorId));

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
        body: { error: p.requestedVariant ? `that mind is not available.` : 'This author has not enabled a mind.' },
      };
    }

    // Visibility gate — the SAME file-access brain, no parallel rules. "paid"
    // for a twin means the authoritative membership resolver says the querier
    // is active. Stored KV status never grants inference or deeper substrate.
    const membership = p.accessor ? await resolveMembership(p.accessor) : null;
    const subscriberValid = membership?.available === true && membership.active;
    if (cfg.visibility === 'paid' && p.accessor && membership?.available === false) {
      return {
        ok: false,
        status: 503,
        body: { error: 'Membership verification is temporarily unavailable. Try again.', reason: 'membership_unavailable', variant: cfg.variant },
      };
    }
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
    // author, or an account with an authoritatively active membership. An
    // anonymous caller — even one bearing a valid, shareable code —
    // never reaches deep: `p.accessor` is null, so a leaked code is a thin-depth
    // bearer at most, never a key to the deep substrate. Everyone else gets the
    // public shadow. One public twin, right depth, no toggle (plm.md).
    const grantValid = !!p.accessor && await hasGrant(p.authorId, p.accessor.github_id);
    const isPaying = subscriberValid;
    // LEAST PRIVILEGE (audit F4): the intimate invite/friends shadow loads ONLY for
    // someone the author PERSONALLY invited (a live grant). A paying-but-uninvited
    // querier gets the 'paid' shadow; everyone else the 'public' shadow. Depth is no
    // longer a binary that collapsed every deep querier onto the most intimate tier —
    // so "they pay" can never surface friends.md; that requires a real invite.
    let queryTier: TwinVisibility = grantValid ? 'invite' : isPaying ? 'paid' : 'public';
    // Free-toggle downgrade: an entitled viewer may ASK SHALLOW (preview what a
    // stranger gets). Down only — the ceiling above is structural.
    if (p.requestedDepth === 'public') queryTier = 'public';
    const deep = grantValid || isPaying; // gates only the works tool (each work is separately visibility-gated)

    const system = cfg.system || `You are ${p.displayName}. Speak as yourself.`;
    // Living page: when the deep twin has the works tool on, hand it the Author's
    // published works CONTENT — but only the pieces this querier is allowed to see.
    // readWork() is the visibility authority (same gate as direct reads), so the
    // corpus is correct by construction — search_my_works never re-derives it.
    let works: TwinWork[] | undefined;
    if (cfg.variant === 'context' && cfg.tools?.works) {
      works = await fetchTwinWorks(
        p.authorId,
        p.authorAccount.github_id,
        p.accessor,
        { inviteValid: grantValid, subscriberValid },
      );
    }
    // The declared links-out graph (website + socials — the profile's router
    // section), passed on every context query. The links DECLARE the graph so
    // the twin can always route a visitor onward ("that's on my instagram —
    // here's the link") even for surfaces with no capture; the sidecar's
    // capture corpus FILLS the graph with actual content. Public by definition
    // — this is exactly what the profile page already shows everyone.
    let links: { label: string; url: string }[] | undefined;
    if (cfg.variant === 'context') {
      const website = stringSlot(p.settings, 'website');
      const socials = Array.isArray(p.settings.socials)
        ? (p.settings.socials as unknown[])
            .map((s) => (s && typeof s === 'object' ? s as Record<string, unknown> : {}))
            .filter((s) => typeof s.label === 'string' && typeof s.url === 'string')
            .map((s) => ({ label: (s.label as string).trim(), url: (s.url as string).trim() }))
        : [];
      links = [
        ...(website ? [{ label: 'website', url: website }] : []),
        ...socials,
      ];
      if (!links.length) links = undefined;
    }
    const sidecar = await getSidecar(p.authorId);
    const result = await runTwinInference(
      cfg.variant === 'weights'
        ? { variant: 'weights', question: p.question, system, maxTokens: 512, checkpoint: cfg.checkpoint, base: cfg.base }
        : { variant: 'context', question: p.question, system, maxTokens: 512, model: cfg.model, tools: cfg.tools, author: p.authorId, works, links, tier: queryTier, focus: p.focus },
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
      return c.json({ error: 'Too many questions — give the mind a minute.' }, 429);
    }
    if (await twinDailyCapReached(authorId)) {
      return c.json({ error: 'This mind has answered its limit for today — try again tomorrow.' }, 429);
    }

    const body = await c.req.json().catch(() => ({})) as { question?: unknown; variant?: unknown; invite?: unknown; focus?: unknown; depth?: unknown };
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (!question) return c.json({ error: 'Ask a question.' }, 400);
    if (question.length > 20000) return c.json({ error: `Question too long — ${question.length} chars, 20000 max. Trim it or paste less.` }, 400);
    const requestedVariant: TwinVariant | null = body.variant === 'weights' || body.variant === 'context' ? body.variant : null;
    // The free toggle: an entitled viewer may request the PUBLIC depth (down only).
    const requestedDepth = body.depth === 'public' ? 'public' as const : null;
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

    // The visitor's own allowance. Checked here (not inside runTwinQuery) because
    // it needs the IP, and read-only so a refused question never spends one.
    const allowance = visitorAllowance(accessor);
    const usedRaw = await twinVisitorUsed(authorId, accessor, ip);
    const usedBefore = usedRaw ?? Number.MAX_SAFE_INTEGER; // unknown → closed
    if (usedBefore >= allowance) {
      // Not a dead end: `handoff` tells the client to offer the reader their
      // copy — the mind, the piece, and the conversation — to continue on their
      // own model. Answering is capped; leaving with the substance is not.
      return c.json({
        error: accessor
          ? 'You’ve used your questions for today — take the conversation with you and carry on with your own ai.'
          : 'You’ve used your questions for today — take the conversation with you, or sign in for more.',
        reason: 'allowance_spent',
        handoff: true,
        limit: allowance,
        remaining: 0,
        signed_in: !!accessor,
      }, 429);
    }

    const outcome = await runTwinQuery({
      authorId, authorAccount, displayName, settings, question, requestedVariant, accessor, inviteValid, requestedDepth, focus, surface: 'library',
    });
    if (!outcome.ok) return c.json(outcome.body, outcome.status as 401 | 402 | 403 | 404 | 502 | 503 | 504);
    await bumpTwinVisitor(authorId, accessor, ip);
    return c.json({
      ok: true,
      twin: true,
      author: authorId,
      author_name: displayName,
      variant: outcome.variant,
      label: outcome.label,
      answer: outcome.answer,
      disclaimer: outcome.disclaimer,
      // What's left, so the reader can see it coming instead of hitting a wall.
      limit: allowance,
      remaining: Math.max(0, allowance - (usedBefore + 1)),
      signed_in: !!accessor,
    });
  });

  // The homepage "ask Alexandria" box — the PUBLIC company guide (plm.md §
  // Website integration). This is a pure RELAY, never inference: it forwards the
  // question to the sidecar's isolated /guide route (which reads only public
  // product knowledge — no substrate, no shadow, no tiers), so the Worker stays
  // relay-only per the settled security model. Anonymous; nothing secret is in
  // reach, so a compromise of this whole path leaks nothing. Rate-limit + daily
  // cap reuse the twin limiters (keyed to a fixed pseudo-author); the raw
  // question is logged as the demand-signal mirror (what visitors actually ask).
  app.post('/ask', async (c) => {
    const GUIDE = 'alexandria-guide'; // rate-limit / cap / ledger key (not a real author)
    const ip = c.req.header('cf-connecting-ip') || 'unknown';
    if (await checkTwinRateLimit(GUIDE, ip)) {
      return c.json({ error: 'Too many questions — give it a minute.' }, 429);
    }
    if (await twinDailyCapReached(GUIDE)) {
      return c.json({ error: 'The guide has answered its limit for today — try again tomorrow.' }, 429);
    }

    const body = await c.req.json().catch(() => ({})) as { question?: unknown };
    const question = typeof body.question === 'string' ? body.question.trim() : '';
    if (!question) return c.json({ error: 'Ask a question.' }, 400);
    if (question.length > 20000) return c.json({ error: `Question too long — ${question.length} chars, 20000 max. Trim it or paste less.` }, 400);

    // The guide runs on the founder's always-on sidecar (env fallback if not
    // separately registered). getSidecar → the same relay every other twin uses.
    const conn = await getSidecar(process.env.ADMIN_GITHUB_LOGIN || 'benmowinckel');
    if (!conn?.url) return c.json({ error: 'the guide is offline right now.' }, 503);

    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 45000);
    try {
      const res = await fetch(guideEndpointFrom(conn.url), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(conn.secret ? { Authorization: `Bearer ${conn.secret}` } : {}),
          ...accessHeaders(),
        },
        body: JSON.stringify({ question }),
        signal: ctrl.signal,
      });
      if (!res.ok) {
        logEvent('ask_alexandria', { status: String(res.status), reason: 'upstream' });
        return c.json({ error: 'the guide could not answer just now.' }, 502);
      }
      const rb = (await res.json().catch(() => null)) as { answer?: unknown } | null;
      const answer = typeof rb?.answer === 'string' ? rb.answer.trim() : '';
      if (!answer) return c.json({ error: 'the guide returned nothing.' }, 502);

      // Billable success → consume the daily budget (mirrors the twin path).
      await bumpTwinDaily(GUIDE);
      logEvent('ask_alexandria', { status: '200', q_len: String(question.length) });
      // The mirror: store the raw question (anonymous, public product Q) so the
      // founder can see what visitors ask and where the copy fails.
      try {
        await getDB().prepare(
          `INSERT INTO access_log (event, author_id, accessor_id, artifact_id, tier, meta, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`
        ).bind('ask_alexandria', GUIDE, 'anonymous', 'guide', 'public',
          JSON.stringify({ q: question.slice(0, 500), a_len: answer.length }),
          new Date().toISOString()).run();
      } catch (e) { console.error('[ask] mirror insert failed:', e); }

      return c.json({ ok: true, answer });
    } catch (e) {
      const aborted = e instanceof Error && e.name === 'AbortError';
      return c.json({ error: aborted ? 'the guide took too long to answer.' : 'could not reach the guide.' }, aborted ? 504 : 502);
    } finally {
      clearTimeout(t);
    }
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
    if (question.length > 20000) return c.json({ error: `Question too long — ${question.length} chars, 20000 max. Trim it or paste less.` }, 400);
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

    const variants = resolveTwinVariants(settings, twinEnv(authorId));
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

    const body = await c.req.json().catch(() => ({})) as { url?: unknown; secret?: unknown; own_account?: unknown };
    const url = typeof body.url === 'string' ? body.url.trim() : '';
    const secret = typeof body.secret === 'string' ? body.secret.trim() : '';
    if (!url) return c.json({ error: 'sidecar url required' }, 400);
    const urlErr = validateSidecarUrl(url);
    if (urlErr) return c.json({ error: urlErr }, 400);
    if (!secret) return c.json({ error: 'sidecar secret required (same value as the sidecar’s TWIN_INFERENCE_SECRET)' }, 400);
    if (authorId.trim().toLowerCase() !== founderLogin() && body.own_account !== true) {
      return c.json({
        error: 'own_account must be true: this sidecar must use a model account and token controlled by the Author, not Alexandria',
      }, 400);
    }

    await getKV().put(`twin_sidecar:${authorId}`, encrypt(JSON.stringify({ url, secret, owner_account: true })));
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
  /**
   * The handoff — the reader leaves with the mind, not just a transcript.
   *
   * This is the product's own thesis pointed at its own limit: we don't own the
   * intelligence, so when our allowance runs out (or whenever the reader would
   * rather use their own), we hand over the DATA and the INTENT and let whatever
   * model they already pay for be the intelligence. Nothing is held hostage.
   *
   * PUBLIC SUBSTRATE ONLY, and structurally so: the shadow comes from
   * `readShadowFree`, whose SQL selects `visibility = 'public'` — there is no
   * accessor to mis-evaluate and no tier to widen, so a bug here cannot leak a
   * private shadow. Works are listed by title and link only; a link respects its
   * own gate when followed. Anything richer must go through the file gate, never
   * through this route.
   *
   * The bundle is assembled client-side: the piece being read and the
   * conversation already live there, and shipping them up only to ship them back
   * would be a round trip for nothing.
   */
  app.get('/library/:author/handoff', async (c) => {
    const authorId = c.req.param('author');
    const lookup = await getAccountByLogin(authorId);
    if (!lookup?.account?.github_id) return c.json({ error: 'Author not found' }, 404);

    const profile = await getDB().prepare('SELECT display_name FROM authors WHERE id = ?')
      .bind(authorId).first<{ display_name: string | null }>().catch(() => null);
    const displayName = profile?.display_name?.trim() || lookup.account.github_name?.trim() || authorId;

    const site = process.env.WEBSITE_URL || 'https://alexandria-library.com';
    let shadow = '';
    try {
      const res = await readShadowFree({ authorId });
      if (res.ok) shadow = (await res.obj.text()).slice(0, 60000);
    } catch { /* no public shadow — the bundle is still worth taking */ }

    // Title + link only. Never bodies: each file carries its own visibility, and
    // this route is public — a link followed later still meets its own gate.
    // (Keyed by account_id on protocol_files, like every other reader of that
    // table; an author_id/`files` guess returned an empty list that the catch
    // below quietly swallowed.)
    let works: { name: string; title: string | null; url: string }[] = [];
    try {
      const rows = await getDB().prepare(
        `SELECT name, title FROM protocol_files WHERE account_id = ? AND visibility = 'public' ORDER BY updated_at DESC LIMIT 40`
      ).bind(String(lookup.account.github_id)).all<{ name: string; title: string | null }>();
      works = (rows.results || [])
        .filter((r) => r.name !== 'shadow')
        .map((r) => ({ name: r.name, title: r.title, url: `${site}/library/${authorId}/read/${encodeURIComponent(r.name)}` }));
    } catch { /* the shadow alone is a valid bundle */ }

    return c.json({
      ok: true,
      author: authorId,
      author_name: displayName,
      profile_url: `${site}/library/${authorId}`,
      capabilities_url: `${process.env.PUBLIC_API_URL || 'https://api.alexandria-library.com'}/library/${authorId}/capabilities`,
      instructions: 'Use only this public shadow and the linked public works. Follow each link through its own access gate. Do not infer private beliefs or treat this projection as the Author’s full mind.',
      shadow,
      works,
    });
  });

  app.get('/library/:author/twin/sidecar', async (c) => {
    const authorId = c.req.param('author');
    const owner = await resolveOwnerOnly(c, authorId);
    if ('error' in owner) return owner.error;
    const conn = await getKV().get(`twin_sidecar:${authorId}`);
    let url: string | null = null;
    let accepted = false;
    if (conn) {
      try {
        const parsed = JSON.parse(decrypt(conn)) as SidecarConn;
        accepted = acceptsAuthorSidecar(authorId, parsed, founderLogin());
        if (accepted) url = parsed.url;
      } catch { url = null; }
    }
    return c.json({
      configured: accepted,
      url,
      online: accepted ? await twinOnline(authorId) : false,
      ownership: authorId.trim().toLowerCase() === founderLogin() ? 'founder_compatibility' : 'author_account_only',
      company_token_fallback: false,
    });
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
    const needsMembership = !!accessor && accessor.github_login !== authorId;
    const membership = needsMembership ? await resolveMembership(accessor) : null;

    const result = await readShadow({
      authorId,
      shadowId,
      accessorLogin: accessor?.github_login || null,
      subscriberValid: membership?.available === true && membership.active,
      inviteToken,
    });
    if (!result.ok) {
      if (result.reason === 'membership_required' && membership?.available === false) {
        return c.json({ error: 'Membership verification is temporarily unavailable. Try again.', reason: 'membership_unavailable' }, 503);
      }
      return c.json(result.body, result.status);
    }

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

    const needsMembership = !!accessor && accessor.github_login !== authorId && !purchaseValid;
    const membership = needsMembership ? await resolveMembership(accessor) : null;
    const result = await readWork({
      authorId,
      workId,
      accessor,
      purchaseValid,
      subscriberValid: membership?.available === true && membership.active,
    });
    if (!result.ok) {
      if (result.status === 402 && membership?.available === false) {
        return c.json({
          error: 'Membership verification is temporarily unavailable. Try again.',
          reason: 'membership_unavailable',
        }, 503);
      }
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
      audit_repo: 'benmowinckel/alexandria-audit',
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

  // Owner sets the always-public teaser line per file (the browse-list subtitle).
  // Mirrors file-categories. A one-line, unstructured teaser — no schema; the
  // model/author decides the copy. Blank string clears it. Capped to keep it a
  // teaser, not a body dump. Always public (see getFileSubtitles rationale).
  // Owner-set display order — an array of file names. Custom order wins;
  // unnamed files fall below it by recency (new publishes land at the bottom
  // of the curated shape instead of jumping the queue).
  app.put('/library/:author/file-order', async (c) => {
    const authorId = c.req.param('author');
    const owner = await resolveOwnerOnly(c, authorId);
    if ('error' in owner) return owner.error;
    const body = await c.req.json<{ order?: unknown }>().catch(() => ({} as { order?: unknown }));
    const clean = Array.isArray(body.order)
      ? body.order.filter((n): n is string => typeof n === 'string' && !!n.trim()).map((n) => n.trim().slice(0, 200)).slice(0, 500)
      : [];
    await getKV().put(`file_order:${authorId}`, JSON.stringify(clean));
    logEvent('file_order_set', { author: authorId, count: String(clean.length) });
    return c.json({ ok: true, order: clean });
  });

  app.put('/library/:author/file-subtitles', async (c) => {
    const authorId = c.req.param('author');
    const owner = await resolveOwnerOnly(c, authorId);
    if ('error' in owner) return owner.error;
    const body = await c.req.json<{ subtitles?: Record<string, unknown> }>().catch(() => ({} as { subtitles?: Record<string, unknown> }));
    const clean: Record<string, string> = {};
    for (const [name, value] of Object.entries(body.subtitles || {})) {
      if (typeof value !== 'string') continue;
      const line = value.replace(/\s+/g, ' ').trim().slice(0, 200);
      if (line) clean[name] = line;
    }
    await getKV().put(`file_subtitles:${authorId}`, JSON.stringify(clean));
    logEvent('file_subtitles_set', { author: authorId, count: String(Object.keys(clean).length) });
    return c.json({ ok: true, subtitles: clean });
  });

  // Owner sets the per-file suggested questions (the `.questions` sidecar). A
  // short array of questions per file — unstructured, no schema; generated FROM
  // the artifact so the PLM answers them, feeding the rotating ask. Mirrors
  // file-subtitles. Empty/missing array clears a file. Capped to keep it a
  // teaser set, not a body dump. Always public (see getFileQuestions rationale).
  app.put('/library/:author/file-questions', async (c) => {
    const authorId = c.req.param('author');
    const owner = await resolveOwnerOnly(c, authorId);
    if ('error' in owner) return owner.error;
    const body = await c.req.json<{ questions?: Record<string, unknown> }>().catch(() => ({} as { questions?: Record<string, unknown> }));
    const clean: Record<string, string[]> = {};
    for (const [name, value] of Object.entries(body.questions || {})) {
      if (!Array.isArray(value)) continue;
      const qs = value
        .filter((q): q is string => typeof q === 'string' && !!q.trim())
        .map((q) => q.replace(/\s+/g, ' ').trim().slice(0, 160))
        .slice(0, 8);
      if (qs.length) clean[name] = qs;
    }
    await getKV().put(`file_questions:${authorId}`, JSON.stringify(clean));
    logEvent('file_questions_set', { author: authorId, count: String(Object.keys(clean).length) });
    return c.json({ ok: true, questions: clean });
  });

  // Owner-only profile config — identity, links, and how the page routes over
  // the categories the Author has published. Every field is optional and
  // merged independently, so an ai or the human editor can make a focused
  // change without wiping unrelated settings.
  // Stored in the authors.settings blob via read-merge-upsert (mirroring the twin
  // config); the public read rides GET /library/:author. The 4-category
  // vocabulary and fixed scaffolding (identity, mind door, footer, visibility
  // tiers) remain constant; the Author controls the content and routing.
  app.put('/library/:author/profile', async (c) => {
    const authorId = c.req.param('author');
    const owner = await resolveOwnerOnly(c, authorId);
    if ('error' in owner) return owner.error;

    const body = await c.req.json().catch(() => ({})) as {
      display_name?: unknown; location?: unknown; contact?: unknown; website?: unknown;
      socials?: unknown; text?: unknown; order?: unknown; hidden?: unknown; labels?: unknown;
    };

    const db = getDB();
    const row = await db.prepare('SELECT settings FROM authors WHERE id = ?')
      .bind(authorId).first<{ settings: string | null }>().catch(() => null);
    const settings = parseJson<Record<string, unknown>>(row?.settings, {});
    const profile = (settings.profile && typeof settings.profile === 'object')
      ? settings.profile as Record<string, unknown> : {};

    const cats = (v: unknown): string[] => Array.isArray(v) ? [...new Set(v.filter(isLibraryCategory))] : [];
    const setString = (key: string, value: unknown, max: number) => {
      if (typeof value !== 'string') return;
      const clean = value.replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);
      if (clean) settings[key] = clean; else delete settings[key];
    };
    setString('display_name', body.display_name, 100);
    if (typeof body.location === 'string') {
      const location = canonicalLibraryLocation(body.location);
      if (body.location.trim() && !location) return c.json({ error: 'Choose a location from the list.' }, 400);
      if (location) settings.location = location; else delete settings.location;
      delete settings.location_key;
    }
    setString('contact', body.contact, 240);
    setString('text', body.text, 160);
    if (typeof body.website === 'string') {
      const raw = body.website.trim();
      if (!raw) delete settings.website;
      else {
        const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        try {
          const parsed = new URL(normalized);
          if (!['http:', 'https:'].includes(parsed.protocol)) return c.json({ error: 'website must use http or https' }, 400);
          settings.website = parsed.toString().slice(0, 500);
        } catch { return c.json({ error: 'website must be a valid URL' }, 400); }
      }
    }
    if (Array.isArray(body.socials)) {
      const socials: Array<{ label: string; url: string }> = [];
      for (const item of body.socials.slice(0, 20)) {
        if (!item || typeof item !== 'object') continue;
        const record = item as Record<string, unknown>;
        const label = typeof record.label === 'string' ? record.label.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
        const raw = typeof record.url === 'string' ? record.url.trim() : '';
        if (!label || !raw) continue;
        const normalized = /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
        try {
          const parsed = new URL(normalized);
          if (['http:', 'https:'].includes(parsed.protocol)) socials.push({ label, url: parsed.toString().slice(0, 500) });
        } catch { /* invalid rows are omitted; valid rows still save */ }
      }
      settings.socials = socials;
    }
    if ('order' in body) profile.order = cats(body.order);
    if ('hidden' in body) profile.hidden = cats(body.hidden);
    if ('labels' in body && body.labels && typeof body.labels === 'object') {
      const curLabels = (profile.labels && typeof profile.labels === 'object')
        ? profile.labels as Record<string, { word?: string; whisper?: string }> : {};
      for (const [cat, val] of Object.entries(body.labels as Record<string, unknown>)) {
        if (!isLibraryCategory(cat)) continue;
        if (!val || typeof val !== 'object') { delete curLabels[cat]; continue; } // null/empty clears
        const v = val as Record<string, unknown>;
        const entry: { word?: string; whisper?: string } = {};
        if (typeof v.word === 'string' && v.word.trim()) entry.word = v.word.trim().slice(0, 40);
        if (typeof v.whisper === 'string' && v.whisper.trim()) entry.whisper = v.whisper.trim().slice(0, 80);
        if (entry.word || entry.whisper) curLabels[cat] = entry; else delete curLabels[cat];
      }
      profile.labels = curLabels;
    }
    settings.profile = profile;

    const now = new Date().toISOString();
    await db.prepare(
      `INSERT INTO authors (id, settings, published_at, updated_at) VALUES (?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET settings = excluded.settings, updated_at = excluded.updated_at`
    ).bind(authorId, JSON.stringify(settings), now, now).run();

    logEvent('library_profile_set', { author: authorId });
    return c.json({ ok: true, profile: normalizeProfile(settings) });
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
