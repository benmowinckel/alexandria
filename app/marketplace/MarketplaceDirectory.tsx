'use client';

import { useMemo, useState } from 'react';

export interface MarketplaceModule {
  id: string;
  name: string;
  description: string;
  author_github_login: string | null;
  author_name?: string | null;
  kind: string;
  tier?: 'core' | 'default' | 'official' | 'community';
  adaptation?: 'universal' | 'personalizable';
  signal?: {
    current_version?: { callers_recent?: number; window_days?: number };
    stable_identity?: { callers_recent?: number; window_days?: number };
    module_lineage?: { callers_recent?: number; window_days?: number };
  };
  status: 'ok' | 'unreachable';
}

interface ParsedId {
  user: string;
  repo: string;
  path: string;
}

function parseGithubId(id: string): ParsedId | null {
  const match = id.match(/^github:([^/]+)\/([^#]+)#(.+)$/);
  if (!match) return null;
  const legacyFounder = match[1].toLowerCase() === 'mowinckelb';
  const founder = legacyFounder || match[1].toLowerCase() === 'benmowinckel';
  return {
    user: legacyFounder ? 'benmowinckel' : match[1],
    repo: founder && match[2] === 'alexandria-systems' ? 'alexandria-modules' : match[2],
    path: match[3],
  };
}

function normalize(value: string | null | undefined): string {
  return (value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

export function MarketplaceDirectory({ modules }: { modules: MarketplaceModule[] }) {
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const needle = normalize(query.trim());
    return modules.filter((module) => {
      const searchable = normalize([
        module.name,
        module.description,
        module.author_name,
        module.author_github_login,
        module.kind,
        module.tier,
      ].filter(Boolean).join(' '));
      return !needle || searchable.includes(needle);
    });
  }, [modules, query]);

  return (
    <>
      <div className="mkt-search-wrap">
        <div className="mkt-search-row">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="search"
            aria-label="Search marketplace"
            className="mkt-search"
          />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="mkt-empty">no matches.</p>
      ) : (
        <section className="mkt-list" aria-label="Marketplace modules">
          {filtered.map((module) => {
            const parsed = parseGithubId(module.id);
            const href = parsed ? `https://github.com/${parsed.user}/${parsed.repo}/blob/HEAD/${parsed.path}.md` : null;
            const author = module.author_github_login || parsed?.user;
            const authorLabel = module.author_name || (author ? `@${author}` : null);
            const inner = (
              <>
                <div className="mkt-module-heading">
                  <h2 className="mkt-module-title">{module.name}</h2>
                </div>
                {module.description && <p className="mkt-description">{module.description}</p>}
                {authorLabel && <p className="mkt-meta">{authorLabel}</p>}
              </>
            );
            return (
              <article key={module.id} className="mkt-module">
                {href ? <a href={href} target="_blank" rel="noopener noreferrer" className="mkt-module-link">{inner}</a> : inner}
              </article>
            );
          })}
        </section>
      )}
    </>
  );
}
