'use client';

import { useMemo, useState } from 'react';

export interface MarketplaceModule {
  id: string;
  name: string;
  description: string;
  author_github_login: string | null;
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

const svgProps = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
};
const FilterIcon = <svg width="18" height="18" {...svgProps}><path d="M3 5h18M6 12h12M10 19h4" /></svg>;
const CheckIcon = <svg width="14" height="14" {...svgProps}><path d="M20 6L9 17l-5-5" /></svg>;

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

function displayType(value: string): string {
  return value === 'canon' ? 'method' : value;
}

function toggleValue(value: string, current: string[], update: (next: string[]) => void) {
  update(current.includes(value) ? current.filter((item) => item !== value) : [...current, value]);
}

export function MarketplaceDirectory({ modules }: { modules: MarketplaceModule[] }) {
  const [query, setQuery] = useState('');
  const [types, setTypes] = useState<string[]>([]);
  const [roles, setRoles] = useState<string[]>([]);
  const [authors, setAuthors] = useState<string[]>([]);
  const [filterOpen, setFilterOpen] = useState(false);

  const typeOptions = useMemo(() => [...new Set(modules.map((module) => module.kind).filter(Boolean))].sort(), [modules]);
  const roleOptions = useMemo(() => [...new Set(modules.map((module) => module.tier).filter((value): value is NonNullable<MarketplaceModule['tier']> => !!value))], [modules]);
  const authorOptions = useMemo(() => [...new Set(modules.map((module) => module.author_github_login).filter((value): value is string => !!value))].sort(), [modules]);
  const activeCount = types.length + roles.length + authors.length;

  const filtered = useMemo(() => {
    const needle = normalize(query.trim());
    return modules.filter((module) => {
      const searchable = normalize([module.name, module.description, module.author_github_login, module.kind, displayType(module.kind), module.tier].filter(Boolean).join(' '));
      return (!needle || searchable.includes(needle))
        && (types.length === 0 || types.includes(module.kind))
        && (roles.length === 0 || (!!module.tier && roles.includes(module.tier)))
        && (authors.length === 0 || (!!module.author_github_login && authors.includes(module.author_github_login)));
    });
  }, [authors, modules, query, roles, types]);

  const clearFilters = () => {
    setTypes([]);
    setRoles([]);
    setAuthors([]);
  };

  const filterGroup = (label: string, values: string[], active: string[], update: (next: string[]) => void) => (
    values.length > 1 ? (
      <div className="mkt-filter-group">
        <p className="mkt-filter-label">{label}</p>
        {values.map((value) => {
          const selected = active.includes(value);
          return (
            <button
              key={value}
              type="button"
              role="option"
              aria-selected={selected}
              className="mkt-filter-option"
              onClick={() => toggleValue(value, active, update)}
            >
              <span>{label === 'authors' ? `@${value}` : label === 'types' ? displayType(value) : value}</span>
              <span className={selected ? 'is-selected' : ''}>{CheckIcon}</span>
            </button>
          );
        })}
      </div>
    ) : null
  );

  return (
    <>
      <div className="mkt-search-wrap">
        <div className="mkt-search-row">
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="search modules and authors"
            aria-label="Search modules and authors"
            className="mkt-search"
          />
          <button
            type="button"
            onClick={() => setFilterOpen((open) => !open)}
            aria-label="Filter marketplace"
            aria-expanded={filterOpen}
            className={`mkt-filter-button${activeCount ? ' is-active' : ''}`}
          >
            {FilterIcon}
            {activeCount > 0 && <span>{activeCount}</span>}
          </button>
        </div>

        {filterOpen && (
          <>
            <button type="button" aria-hidden tabIndex={-1} onClick={() => setFilterOpen(false)} className="mkt-filter-backdrop" />
            <div className="mkt-filter-panel" role="listbox" aria-label="Marketplace filters">
              {filterGroup('roles', roleOptions, roles, setRoles)}
              {filterGroup('types', typeOptions, types, setTypes)}
              {filterGroup('authors', authorOptions, authors, setAuthors)}
              {activeCount > 0 && <button type="button" onClick={clearFilters} className="mkt-filter-clear">clear</button>}
            </div>
          </>
        )}
      </div>

      {filtered.length === 0 ? (
        <p className="mkt-empty">no matches.</p>
      ) : (
        <section className="mkt-list" aria-label="Marketplace modules">
          {filtered.map((module) => {
            const parsed = parseGithubId(module.id);
            const href = parsed ? `https://github.com/${parsed.user}/${parsed.repo}/blob/HEAD/${parsed.path}.md` : null;
            const author = module.author_github_login || parsed?.user;
            const inner = (
              <>
                <div className="mkt-module-heading">
                  <h2 className="mkt-module-title">{module.name}</h2>
                  {module.tier && <span className="mkt-tier">{module.tier}</span>}
                </div>
                {module.description && <p className="mkt-description">{module.description}</p>}
                <p className="mkt-meta">
                  {displayType(module.kind)}{author ? ` · @${author}` : ''}
                </p>
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
