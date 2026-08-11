import type { Metadata } from 'next';
import Link from 'next/link';
import { ThemeToggle } from '../components/ThemeToggle';
import SiteFooter from '../components/SiteFooter';
import { SERVER_URL, pageMetadata } from '../lib/config';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  ...pageMetadata({
    path: '/marketplace',
    title: 'marketplace — alexandria.',
    description: 'The core, defaults, and additions for an Alexandria loop.',
  }),
};

interface MarketplaceModule {
  id: string;
  name: string;
  description: string;
  author_github_login: string | null;
  kind: string;
  tier?: 'core' | 'default' | 'official' | 'community';
  adaptation?: 'universal' | 'personalizable';
  signal?: {
    current_version?: { callers_recent?: number; window_days?: number };
    module_lineage?: { callers_recent?: number; window_days?: number };
  };
  status: 'ok' | 'unreachable';
}

interface MarketplaceResponse {
  modules: MarketplaceModule[];
  total: number;
  next_cursor: string | null;
}

interface ParsedId {
  user: string;
  repo: string;
  path: string;
}

function parseGithubId(id: string): ParsedId | null {
  const m = id.match(/^github:([^\/]+)\/([^#]+)#(.+)$/);
  if (!m) return null;
  const legacyFounder = m[1].toLowerCase() === 'mowinckelb';
  const founder = legacyFounder || m[1].toLowerCase() === 'benmowinckel';
  const user = legacyFounder ? 'benmowinckel' : m[1];
  const repo = founder && m[2] === 'alexandria-systems' ? 'alexandria-modules' : m[2];
  return { user, repo, path: m[3] };
}

const DEFAULT_PATHS = new Set([
  'factory/canon/axioms',
  'factory/canon/methodology',
  'factory/canon/editor',
  'factory/canon/mercury',
  'factory/canon/publisher',
]);

function fallbackTier(parsed: ParsedId | null): 'core' | 'default' | 'official' | 'community' {
  if (!parsed || parsed.user !== 'benmowinckel' || parsed.repo !== 'alexandria') return 'community';
  if (parsed.path === 'factory/canon/foundation' || parsed.path === 'factory/canon/change-closure') return 'core';
  return DEFAULT_PATHS.has(parsed.path) ? 'default' : 'official';
}

async function loadModules(): Promise<MarketplaceModule[]> {
  try {
    const res = await fetch(`${SERVER_URL}/marketplace`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json() as Partial<MarketplaceResponse>;
    // Rolling-deploy safety: the page may briefly see the previous API. Fold
    // its legacy founder IDs here too and prefer the current row.
    const normalized = new Map<string, MarketplaceModule>();
    for (const entry of data.modules || []) {
      const parsed = parseGithubId(entry.id);
      const id = parsed ? `github:${parsed.user}/${parsed.repo}#${parsed.path}` : entry.id;
      const current = normalized.get(id);
      const isCurrentId = entry.id.startsWith('github:benmowinckel/');
      if (!current || isCurrentId) {
        normalized.set(id, {
          ...entry,
          id,
          author_github_login: parsed?.user || entry.author_github_login,
        });
      }
    }
    return [...normalized.values()];
  } catch {
    return [];
  }
}

export default async function MarketplacePage() {
  const modules = await loadModules();

  return (
    <div className="mkt-page">
      <ThemeToggle />
      <main className="mkt-main">
        <header className="mkt-header">
          <Link href="/" className="mkt-brand">
            alexandria<span className="mkt-brand-dot">.</span>
          </Link>
          <p className="mkt-eyebrow">the collective</p>
          <h1 className="mkt-h1">the marketplace</h1>
        </header>

        {modules.length === 0 ? (
          <p className="mkt-empty">no modules yet.</p>
        ) : (
          // No per-row hairlines — whitespace separates the modules (design.md,
          // the recurring "too many lines" note). One editorial column, each
          // module a quiet block.
          <section className="mkt-list">
            {modules.map((m) => {
              const parsed = parseGithubId(m.id);
              // Click-through targets github directly — github is the marketplace
              // substrate (markdown rendering, forks, comments, history); this
              // page is the curated cross-repo index.
              const href = parsed ? `https://github.com/${parsed.user}/${parsed.repo}/blob/HEAD/${parsed.path}.md` : null;
              const tier = m.tier || fallbackTier(parsed);
              const author = tier === 'community' ? (m.author_github_login || parsed?.user) : null;
              const currentUsers = m.signal?.current_version?.callers_recent || 0;
              const lineageUsers = m.signal?.module_lineage?.callers_recent || 0;
              const usage = tier === 'core'
                ? 'required local core · not ranked'
                : currentUsers > 0
                  ? `${currentUsers} ${currentUsers === 1 ? 'member' : 'members'} using these exact bytes`
                  : lineageUsers > 0
                    ? `${lineageUsers} ${lineageUsers === 1 ? 'member has' : 'members have'} used this module · current version unreported`
                    : 'no reported use yet';
              const inner = (
                <>
                  <h2 className="mkt-module-title">
                    {m.name}
                    {tier !== 'community' && <span className="mkt-tier">{tier}</span>}
                    {author && (
                      <span className="mkt-author">
                        · @{author}
                      </span>
                    )}
                  </h2>
                  {m.description && (
                    <p className="mkt-description">
                      {m.description}
                    </p>
                  )}
                  <p className="mkt-signal">
                    {usage}{m.adaptation ? ` · ${m.adaptation}` : ''}
                  </p>
                </>
              );
              return (
                <article key={m.id}>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="mkt-module-link"
                    >
                      {inner}
                    </a>
                  ) : inner}
                </article>
              );
            })}
          </section>
        )}
      </main>
      <SiteFooter cta="start your loop" />
    </div>
  );
}
