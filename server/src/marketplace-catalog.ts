/**
 * Marketplace of Systems — module catalog.
 *
 * Lazy-fetches module markdown from public GitHub, parses YAML front-matter,
 * caches in KV with 24h TTL (1h on unreachable, to retry sooner). The act of
 * an Author POSTing a module ID via /call surfaces the module — there is no
 * /publish endpoint by design.
 *
 * Module ID format: `github:<user>/<repo>#<path-without-extension>`. Server
 * appends `.md` when fetching from raw.githubusercontent.com.
 */

import { getKV } from './kv.js';

export interface ModuleMeta {
  name: string;
  description: string;
  status: 'ok' | 'unreachable' | 'parse_error';
  last_fetched: string;
}

export interface ParsedModuleId {
  kind: 'github' | 'local' | null;
  user?: string;
  repo?: string;
  path?: string;
  slug?: string;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]*$/;
const TTL_OK = 24 * 60 * 60;        // 24h on success
const TTL_UNREACHABLE = 60 * 60;    // 1h on 404 — retry sooner

export function parseModuleId(id: string): ParsedModuleId {
  const gh = id.match(/^github:([^\/]+)\/([^#]+)#(.+)$/);
  if (gh) return { kind: 'github', user: gh[1], repo: gh[2], path: gh[3] };
  const local = id.match(/^local:([^\/]+)\/(.+)$/);
  if (local) return { kind: 'local', user: local[1], slug: local[2] };
  return { kind: null };
}

export function buildModuleId(user: string, repo: string, path: string): string {
  return `github:${user}/${repo}#${path}`;
}

/** Hand-rolled YAML parser — only `name` and `description` matter. */
export function parseFrontmatter(content: string): { name?: string; description?: string; body: string } {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { body: content };
  const out: { name?: string; description?: string; body: string } = { body: m[2] };
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([a-z][a-z0-9_-]*)\s*:\s*(.*)$/i);
    if (!kv) continue;
    let v = kv[2].trim();
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1);
    }
    if (kv[1] === 'name') out.name = v;
    else if (kv[1] === 'description') out.description = v;
  }
  return out;
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
    if (p) return p;
  }
  return '';
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
  const description = fm.description || deriveDescription(fm.body);
  const meta: ModuleMeta = {
    name,
    description,
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
      const cached = JSON.parse(raw) as ModuleMeta;
      // Refresh entries cached under the old `parse_error` status — the catalog
      // no longer treats missing front-matter as an error.
      if (cached.status !== 'parse_error') return cached;
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
  // `<user>/alexandria-systems` is the publish.sh convention: a flat repo
  // with one .md per skill at the root. Treat its modules as skills so the
  // marketplace shows them with the right badge instead of falling through
  // to the generic "module".
  if (p.repo === 'alexandria-systems') return 'skill';
  return 'module';
}
