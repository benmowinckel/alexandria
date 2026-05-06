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
  body?: string;
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
export function parseFrontmatter(content: string): { name?: string; description?: string; body: string; ok: boolean } {
  const m = content.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/);
  if (!m) return { body: content, ok: false };
  const out: { name?: string; description?: string; body: string; ok: boolean } = { body: m[2], ok: false };
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
  out.ok = !!out.name && SLUG_RE.test(out.name) && !!out.description;
  return out;
}

function cacheKey(id: string): string {
  return `module:${id}`;
}

async function fetchFromGithub(parsed: ParsedModuleId): Promise<{ ok: true; content: string } | { ok: false }> {
  if (parsed.kind !== 'github' || !parsed.user || !parsed.repo || !parsed.path) {
    return { ok: false };
  }
  const url = `https://raw.githubusercontent.com/${parsed.user}/${parsed.repo}/main/${parsed.path}.md`;
  let resp: Response;
  try {
    resp = await fetch(url, { headers: { 'User-Agent': 'alexandria-server' } });
  } catch {
    return { ok: false };
  }
  if (!resp.ok) return { ok: false };
  return { ok: true, content: await resp.text() };
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
  const fm = parseFrontmatter(fetched.content);
  if (!fm.ok) {
    const meta: ModuleMeta = {
      name: fm.name && SLUG_RE.test(fm.name) ? fm.name : fallbackName(parsed, id),
      description: fm.description || '',
      body: fm.body,
      status: 'parse_error',
      last_fetched: now,
    };
    await writeCache(id, meta, TTL_OK);
    return meta;
  }
  const meta: ModuleMeta = {
    name: fm.name!,
    description: fm.description!,
    body: fm.body,
    status: 'ok',
    last_fetched: now,
  };
  await writeCache(id, meta, TTL_OK);
  return meta;
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
      // fall through to refresh on parse error
    }
  }
  return await refreshCache(id, parsed);
}

/** Author github_login derived from the module ID. Null for unrecognized formats. */
export function authorFromModuleId(id: string): string | null {
  const p = parseModuleId(id);
  return p.user || null;
}
