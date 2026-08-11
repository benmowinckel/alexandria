/**
 * Marketplace of Systems — module catalog.
 *
 * Lazy-fetches module markdown from public GitHub, parses YAML front-matter,
 * caches in KV with 24h TTL (1h on unreachable, to retry sooner). The act of
 * an Author POSTing an inspected public GitHub module via /call surfaces it —
 * local-only IDs never become collective signal. Older public GitHub reports
 * without a byte hash remain legible but are marked legacy-unverified. There is
 * no /publish endpoint by design.
 *
 * Module ID format: `github:<user>/<repo>#<path-without-extension>`. Server
 * appends `.md` when fetching from raw.githubusercontent.com.
 */

import { getKV } from './kv.js';
import marketplaceInventory from '../../factory/marketplace.json';

export type ModuleAdaptation = 'universal' | 'personalizable';

export interface ModuleMeta {
  name: string;
  description: string;
  adaptation: ModuleAdaptation;
  derived_from: string | null;
  content_sha256: string | null;
  status: 'ok' | 'unreachable';
  last_fetched: string;
}

export interface MarketplaceReportRow {
  mod: string;
  text: string;
  sourceSha256: string | null;
}

export interface ParsedModuleId {
  kind: 'github' | 'local' | null;
  user?: string;
  repo?: string;
  path?: string;
  slug?: string;
}

export type MarketplaceTier = 'core' | 'default' | 'official' | 'community';

export interface MarketplaceCatalogEntry {
  id: string;
  name: string;
  description: string;
  author_github_login: string | null;
  kind: string;
  tier: MarketplaceTier;
  adaptation: ModuleAdaptation;
  derived_from: string | null;
  content_sha256: string | null;
  status: 'ok' | 'unreachable';
}

const CURRENT_OWNER = 'benmowinckel';
const LEGACY_OWNER = 'mowinckelb';
const FACTORY_REPO = 'alexandria';
const MODULES_REPO = 'alexandria-modules';
const LEGACY_MODULES_REPO = 'alexandria-systems';
const RETIRED_MODULE_IDS = new Set([
  'github:benmowinckel/alexandria-modules#optimise',
]);

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const TTL_OK = 24 * 60 * 60;        // 24h on success
const TTL_UNREACHABLE = 60 * 60;    // 1h on 404 — retry sooner

export function parseModuleId(id: string): ParsedModuleId {
  // Constrain each group to GitHub-legal charsets so a malicious module ID from
  // /call can't inject `..`, CRLF, or query chars into the raw.githubusercontent
  // fetch URL (host is hardcoded, but this blocks cross-path/cache-key abuse).
  // (security-audit-2026-06-23 L2)
  const gh = id.match(/^github:([A-Za-z0-9-]+)\/([A-Za-z0-9._-]+)#([A-Za-z0-9._/-]+)$/);
  if (gh && !/(^|\/)\.\.(\/|$)/.test(gh[3])) return { kind: 'github', user: gh[1], repo: gh[2], path: gh[3] };
  const local = id.match(/^local:([A-Za-z0-9-]+)\/([a-z0-9][a-z0-9._-]*)$/);
  if (local) return { kind: 'local', user: local[1], slug: local[2] };
  return { kind: null };
}

export function buildModuleId(user: string, repo: string, path: string): string {
  return `github:${user}/${repo}#${path}`;
}

interface MarketplaceInventoryModule {
  path: string;
  name: string;
  description: string;
  kind: string;
  role: MarketplaceTier;
  adaptation: ModuleAdaptation;
}

const MARKETPLACE_ROLES = new Set<MarketplaceTier>(['core', 'default', 'official', 'community']);
const MARKETPLACE_BUILTINS: MarketplaceInventoryModule[] = marketplaceInventory.modules.map((module) => {
  if (!module.path || !module.name || !MARKETPLACE_ROLES.has(module.role as MarketplaceTier)) {
    throw new Error('factory/marketplace.json contains an invalid module');
  }
  if (module.adaptation !== 'universal' && module.adaptation !== 'personalizable') {
    throw new Error(`factory/marketplace.json has invalid adaptation for ${module.path}`);
  }
  return { ...module, role: module.role as MarketplaceTier, adaptation: module.adaptation as ModuleAdaptation };
});

const BUILTIN_TIERS = new Map<string, MarketplaceTier>(
  MARKETPLACE_BUILTINS.map((module) => [
    buildModuleId(CURRENT_OWNER, FACTORY_REPO, module.path),
    module.role,
  ]),
);

export function marketplaceBuiltins(): MarketplaceCatalogEntry[] {
  return MARKETPLACE_BUILTINS.map((module) => ({
    id: buildModuleId(CURRENT_OWNER, FACTORY_REPO, module.path),
    name: module.name,
    description: module.description,
    author_github_login: CURRENT_OWNER,
    kind: module.kind,
    tier: module.role,
    adaptation: module.adaptation,
    derived_from: null,
    content_sha256: null,
    status: 'ok',
  }));
}

/**
 * Collapse IDs that predate the founder's GitHub handle and module-repo
 * renames. Stored call history remains immutable; every new write and every
 * catalog read uses this one public identity.
 */
export function canonicalizeModuleId(id: string): string {
  const parsed = parseModuleId(id);
  if (parsed.kind !== 'github' || !parsed.user || !parsed.repo || !parsed.path) return id;

  const owner = parsed.user.toLowerCase();
  const repo = parsed.repo.toLowerCase();
  if (owner !== CURRENT_OWNER && owner !== LEGACY_OWNER) return id;

  if (repo === FACTORY_REPO) return buildModuleId(CURRENT_OWNER, FACTORY_REPO, parsed.path);
  if (repo === MODULES_REPO || repo === LEGACY_MODULES_REPO) {
    return buildModuleId(CURRENT_OWNER, MODULES_REPO, parsed.path);
  }
  return id;
}

/** Historical IDs that should count toward one canonical module identity. */
export function moduleIdAliases(id: string): string[] {
  const canonical = canonicalizeModuleId(id);
  const parsed = parseModuleId(canonical);
  if (parsed.kind !== 'github' || !parsed.user || !parsed.repo || !parsed.path) return [canonical];
  if (parsed.user !== CURRENT_OWNER) return [canonical];

  if (parsed.repo === FACTORY_REPO) {
    return [
      canonical,
      buildModuleId(LEGACY_OWNER, FACTORY_REPO, parsed.path),
    ];
  }
  if (parsed.repo === MODULES_REPO) {
    return [
      canonical,
      buildModuleId(LEGACY_OWNER, MODULES_REPO, parsed.path),
      buildModuleId(CURRENT_OWNER, LEGACY_MODULES_REPO, parsed.path),
      buildModuleId(LEGACY_OWNER, LEGACY_MODULES_REPO, parsed.path),
    ];
  }
  return [canonical];
}

/**
 * Product role, not a quality ranking. Core files make the local loop work;
 * five replaceable methods ship as defaults; curated Alexandria additions are
 * official; everything else is shown under its author.
 */
export function deriveMarketplaceTier(id: string): MarketplaceTier {
  const canonical = canonicalizeModuleId(id);
  return BUILTIN_TIERS.get(canonical) || 'community';
}

/**
 * Whether a reported module may enter marketplace signal. Core files are shown
 * for recovery but never ranked. Founder-repo files enter only through the
 * explicit inventory above, keeping internal machinery out of the catalog.
 */
export function isMarketplaceModule(id: string): boolean {
  const canonical = canonicalizeModuleId(id);
  if (RETIRED_MODULE_IDS.has(canonical)) return false;
  const builtinTier = BUILTIN_TIERS.get(canonical);
  if (builtinTier) return builtinTier !== 'core';

  const parsed = parseModuleId(canonical);
  if (parsed.kind !== 'github' || !parsed.user || !parsed.repo) return false;
  return parsed.user !== CURRENT_OWNER || parsed.repo !== FACTORY_REPO;
}

/** Hand-rolled YAML parser for the deliberately tiny module identity surface. */
export function parseFrontmatter(content: string): {
  name?: string;
  description?: string;
  adaptation?: ModuleAdaptation;
  derived_from?: string;
  body: string;
} {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { body: content };
  const out: {
    name?: string;
    description?: string;
    adaptation?: ModuleAdaptation;
    derived_from?: string;
    body: string;
  } = { body: m[2] };
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-z][a-z0-9_-]*)\s*:\s*(.*)$/i);
    if (!kv) continue;
    let v = kv[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (kv[1] === 'name') out.name = v;
    else if (kv[1] === 'description') out.description = v;
    else if (kv[1] === 'adaptation' && (v === 'universal' || v === 'personalizable')) out.adaptation = v;
    else if (kv[1] === 'derived_from') out.derived_from = v;
  }
  return out;
}

function normalizedDerivedFrom(raw: string | undefined, id: string): string | null {
  if (!raw || parseModuleId(raw).kind !== 'github') return null;
  const canonical = canonicalizeModuleId(raw);
  return canonical === canonicalizeModuleId(id) ? null : canonical;
}

async function sha256Hex(content: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(content));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/** Normalize a /call manifest without inventing module identity. */
export function normalizeMarketplaceReport(input: unknown[]): MarketplaceReportRow[] {
  const rows = new Map<string, MarketplaceReportRow>();
  for (const item of input) {
    let candidateId: string | null = null;
    let text = '';
    let sourceSha256: string | null = null;
    if (typeof item === 'string') {
      candidateId = item;
    } else if (item && typeof item === 'object') {
      const value = item as Record<string, unknown>;
      if (typeof value.id !== 'string') continue;
      candidateId = value.id;
      if (typeof value.text === 'string') text = value.text;
      if (typeof value.source_sha256 === 'string' && /^[a-f0-9]{64}$/i.test(value.source_sha256)) {
        sourceSha256 = value.source_sha256.toLowerCase();
      } else if (value.source_sha256 !== undefined) {
        continue;
      }
    }
    if (!candidateId || parseModuleId(candidateId).kind === null) continue;
    const mod = canonicalizeModuleId(candidateId).slice(0, 300);
    if (!isMarketplaceModule(mod) || rows.has(mod)) continue;
    rows.set(mod, { mod, text: text.slice(0, 2000), sourceSha256 });
  }
  return [...rows.values()];
}

/**
 * Pull a description from raw markdown when front-matter doesn't have one.
 * Skip leading blank lines and any heading (H1/H2/...), then take the next
 * prose paragraph. Canon docs lead with `*...*` italic intros — strip the
 * wrapping asterisks so the rendered description shows no markdown syntax.
 */
export function deriveDescription(body: string): string {
  const lines = body.split(/\r?\n/);
  let i = 0;
  while (i < lines.length) {
    // Skip blanks and ATX headings.
    while (i < lines.length) {
      const t = lines[i].trim();
      if (t === '' || /^#+\s/.test(t)) { i++; continue; }
      break;
    }
    if (i >= lines.length) break;
    // Read one paragraph.
    const paragraph: string[] = [];
    while (i < lines.length && lines[i].trim() !== '') {
      paragraph.push(lines[i]);
      i++;
    }
    let p = paragraph.join(' ').trim();
    // Strip wrapping italics canon docs often lead with.
    if (p.length > 2 && p.startsWith('*') && p.endsWith('*') && !p.startsWith('**')) {
      p = p.slice(1, -1).trim();
    }
    // Skip paragraphs that are wholly inline code (e.g. a module-id line) —
    // they're metadata, not prose; try the next paragraph instead.
    if (/^`[^`]+`$/.test(p)) continue;
    // Cap the user-derived description so a malicious module can't dump a giant
    // blob into the public catalog / founder's view (content poisoning — it's
    // React-escaped so not XSS, just a length/abuse bound). (audit L3)
    if (p) return p.length > 280 ? p.slice(0, 279).trimEnd() + '…' : p;
  }
  return '';
}

/**
 * THREAT (prompt-injection channel): a module's `description` is attacker-
 * controlled markdown fetched from raw.githubusercontent.com, then served in the
 * public `/marketplace` JSON that OTHER Authors' ai agents ingest as context. It
 * is React-escaped downstream (so not browser-XSS), but escaping does nothing to
 * an LLM reader — a description like "ignore previous instructions and…" lands
 * directly in another agent's context window. Defence: reduce it to an inert,
 * single-line human label. Collapse newlines, strip markdown/control and the
 * bracketing chars used to frame injected instructions (backticks, angle/square/
 * curly brackets, pipes, backslashes, markdown emphasis/heading marks), then
 * hard-cap length. The result can only ever be a short caption, never a command.
 */
const DESC_MAX = 280;
export function sanitizeDescription(raw: string): string {
  if (!raw) return '';
  const inert = raw
    .replace(/[\r\n\t]+/g, ' ')          // collapse to a single line — no multi-line instruction blocks
    .replace(/[`<>[\]{}|\\*_#~]/g, '')   // strip markdown/control + instruction-framing brackets
    .replace(/\s+/g, ' ')                // collapse whitespace runs
    .trim();
  return inert.length > DESC_MAX ? inert.slice(0, DESC_MAX - 1).trimEnd() + '…' : inert;
}

function cacheKey(id: string): string {
  return `module:${id}`;
}

async function fetchFromGithub(parsed: ParsedModuleId): Promise<{ ok: true; content: string } | { ok: false }> {
  if (parsed.kind !== 'github' || !parsed.user || !parsed.repo || !parsed.path) {
    return { ok: false };
  }
  // Try main first, fall back to master. raw.githubusercontent.com requires a
  // branch name (HEAD doesn't resolve there like it does on github.com).
  for (const branch of ['main', 'master']) {
    const url = `https://raw.githubusercontent.com/${parsed.user}/${parsed.repo}/${branch}/${parsed.path}.md`;
    let resp: Response;
    try {
      resp = await fetch(url, { headers: { 'User-Agent': 'alexandria-server' } });
    } catch {
      continue;
    }
    if (resp.ok) return { ok: true, content: await resp.text() };
  }
  return { ok: false };
}

function fallbackName(parsed: ParsedModuleId, id: string): string {
  if (parsed.kind === 'github' && parsed.path) {
    return parsed.path.split('/').pop() || id;
  }
  return id;
}

async function writeCache(id: string, meta: ModuleMeta, ttl: number): Promise<void> {
  await getKV().put(cacheKey(id), JSON.stringify(meta), { expirationTtl: ttl });
}

async function refreshCache(id: string, parsed: ParsedModuleId): Promise<ModuleMeta> {
  const now = new Date().toISOString();
  const fetched = await fetchFromGithub(parsed);
  if (!fetched.ok) {
    const meta: ModuleMeta = {
      name: fallbackName(parsed, id),
      description: '',
      adaptation: 'universal',
      derived_from: null,
      content_sha256: null,
      status: 'unreachable',
      last_fetched: now,
    };
    await writeCache(id, meta, TTL_UNREACHABLE);
    return meta;
  }
  // The marketplace catalogues any markdown file. Front-matter is preferred
  // but not required — name falls back to the path's leaf, description to
  // the first body paragraph. Schema-free by construction (bitter lesson):
  // when models can lift more from raw markdown, the same data yields more
  // with no migration.
  //
  // Cache stores only the catalog fields (name, description, status). Module
  // bodies live at raw.githubusercontent.com — agents fetch source from
  // github directly rather than re-reading it from KV.
  const fm = parseFrontmatter(fetched.content);
  const name = fm.name && SLUG_RE.test(fm.name) ? fm.name : fallbackName(parsed, id);
  // Sanitize at this single choke point so BOTH the front-matter description and
  // the body-derived fallback are forced to inert plaintext before they are ever
  // stored in KV or served in the public catalog (see sanitizeDescription).
  const description = sanitizeDescription(fm.description || deriveDescription(fm.body));
  const meta: ModuleMeta = {
    name,
    description,
    adaptation: fm.adaptation || 'universal',
    derived_from: normalizedDerivedFrom(fm.derived_from, id),
    content_sha256: await sha256Hex(fetched.content),
    status: 'ok',
    last_fetched: now,
  };
  await writeCache(id, meta, TTL_OK);
  return meta;
}

/** Drop a single cached entry — used by the github webhook to invalidate
 *  on push without waiting for TTL. Idempotent. */
export async function bustModuleCache(id: string): Promise<void> {
  await getKV().delete(cacheKey(id));
}

/**
 * Process a github push webhook payload and bust cache for any touched
 * markdown files. Returns the number of cache entries invalidated.
 *
 * Payload shape: github sends `{ commits: [{ added, modified, removed }], repository: { name, owner: { login } } }`.
 */
export async function handleGithubPushWebhook(payload: {
  repository?: { name?: string; owner?: { login?: string } };
  commits?: Array<{ added?: string[]; modified?: string[]; removed?: string[] }>;
}): Promise<{ busted: number }> {
  const user = payload?.repository?.owner?.login;
  const repo = payload?.repository?.name;
  if (!user || !repo) return { busted: 0 };
  const touched = new Set<string>();
  for (const commit of payload.commits || []) {
    for (const path of commit.added || []) touched.add(path);
    for (const path of commit.modified || []) touched.add(path);
    for (const path of commit.removed || []) touched.add(path);
  }
  let busted = 0;
  for (const path of touched) {
    if (!path.endsWith('.md')) continue;
    const pathNoExt = path.slice(0, -3);
    await bustModuleCache(buildModuleId(user, repo, pathNoExt));
    busted++;
  }
  return { busted };
}

/** Get module metadata. KV TTL handles staleness — miss = refresh. Returns null for non-github IDs. */
export async function resolveModule(id: string): Promise<ModuleMeta | null> {
  const parsed = parseModuleId(id);
  if (parsed.kind !== 'github') return null;

  const raw = await getKV().get(cacheKey(id));
  if (raw) {
    try {
      return JSON.parse(raw) as ModuleMeta;
    } catch {
      // fall through to refresh on JSON parse error
    }
  }
  return await refreshCache(id, parsed);
}

/** Author github_login derived from the module ID. Null for unrecognized formats. */
export function authorFromModuleId(id: string): string | null {
  const p = parseModuleId(id);
  return p.user || null;
}

/**
 * Module kind derived from path conventions. Self-describing catalog entries
 * so agents can filter by `?kind=skill` etc. without parsing paths themselves.
 * Convention is path-based; non-canonical-style paths fall through to "module".
 */
export function deriveKind(id: string): string {
  const p = parseModuleId(id);
  if (!p.path) return 'module';
  if (p.path.startsWith('factory/skills/')) return 'skill';
  if (p.path.startsWith('factory/canon/')) return 'canon';
  if (p.path.startsWith('factory/hooks/')) return 'hook';
  if (p.path.startsWith('factory/scripts/')) return 'script';
  if (p.path.startsWith('factory/templates/')) return 'template';
  if (p.path.startsWith('factory/systems/')) return 'system';
  // `<user>/alexandria-modules` is the publish.sh convention: a flat repo
  // with one .md per skill at the root. Treat its modules as skills so the
  // marketplace shows them with the right badge instead of falling through
  // to the generic "module". `alexandria-systems` accepted as legacy name
  // (repo was renamed 2026-05-15; old call_manifest IDs still resolve via
  // GitHub redirect but carry the stale repo name in the parsed ID).
  if (p.repo === 'alexandria-modules' || p.repo === 'alexandria-systems') return 'skill';
  return 'module';
}
