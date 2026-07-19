'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';

export interface DirectoryAuthor {
  id: string;
  alexandria_id: string;
  display_name: string | null;
  location: string | null;
  location_key: string | null;
  contact: string | null;
  text: string | null;
  files_url: string;
}

interface LocationOption {
  key: string;
  label: string;
}

const svgProps = { viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 1.6, strokeLinecap: 'round' as const, strokeLinejoin: 'round' as const, 'aria-hidden': true };
// Filter glyph (decreasing lines) — the location filter lives behind this icon on
// the right of the search bar, instead of an always-on wall of location pills.
const FilterIcon = <svg width="18" height="18" {...svgProps}><path d="M3 5h18M6 12h12M10 19h4" /></svg>;
const CheckIcon = <svg width="14" height="14" {...svgProps}><path d="M20 6L9 17l-5-5" /></svg>;

function normalize(value: string | null | undefined): string {
  return (value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

export function LibraryDirectory({
  authors,
  initialLocationKeys = [],
}: {
  authors: DirectoryAuthor[];
  initialLocationKeys?: string[];
}) {
  const [nameQuery, setNameQuery] = useState('');
  const [locationFilters, setLocationFilters] = useState<string[]>(Array.from(new Set(initialLocationKeys)));
  const [filterOpen, setFilterOpen] = useState(false);
  const activeCount = locationFilters.length;

  const sortedAuthors = useMemo(() => {
    return [...authors].sort((a, b) => b.id.localeCompare(a.id, undefined, { sensitivity: 'base' }));
  }, [authors]);

  const locationOptions = useMemo<LocationOption[]>(() => {
    const byKey = new Map<string, string>();
    for (const author of sortedAuthors) {
      if (!author.location || !author.location_key) continue;
      if (!byKey.has(author.location_key)) byKey.set(author.location_key, author.location);
    }
    return Array.from(byKey.entries())
      .map(([key, label]) => ({ key, label }))
      .sort((a, b) => a.label.localeCompare(b.label, undefined, { sensitivity: 'base' }));
  }, [sortedAuthors]);

  const filtered = useMemo(() => {
    const needle = normalize(nameQuery.trim());
    const activeLocations = new Set(locationFilters);

    return sortedAuthors.filter((author) => {
      const searchableName = normalize(author.display_name || author.id);
      const matchesName = !needle || searchableName.includes(needle);
      const matchesLocation = activeLocations.size === 0
        || (!!author.location_key && activeLocations.has(author.location_key));
      return matchesName && matchesLocation;
    });
  }, [sortedAuthors, nameQuery, locationFilters]);

  const toggleLocation = (key: string) => {
    setLocationFilters((prev) => (
      prev.includes(key) ? prev.filter((value) => value !== key) : [...prev, key]
    ));
  };

  return (
    <>
      {/* Search names, with the location filter tucked behind an icon on the right
          — one clean bar instead of a wall of always-on location pills. */}
      <div style={{ position: 'relative', marginTop: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', borderBottom: '1px solid var(--border-light)' }}>
          <input
            type="search"
            value={nameQuery}
            onChange={(event) => setNameQuery(event.target.value)}
            placeholder="search names"
            aria-label="Search Authors by name"
            style={{
              flex: 1,
              minWidth: 0,
              border: 'none',
              background: 'transparent',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-eb-garamond)',
              fontSize: '0.95rem',
              outline: 'none',
              padding: '0 0 0.45rem',
            }}
          />
          {locationOptions.length > 0 && (
            <button
              type="button"
              onClick={() => setFilterOpen((v) => !v)}
              aria-label="Filter by location"
              aria-expanded={filterOpen}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: '0.3rem',
                border: 'none', background: 'none', cursor: 'pointer',
                padding: '0 0.1rem 0.45rem',
                color: activeCount > 0 ? 'var(--text-primary)' : 'var(--text-ghost)',
              }}
              className="hover:opacity-60"
            >
              {FilterIcon}
              {activeCount > 0 && <span style={{ fontSize: '0.82rem', letterSpacing: '0.02em' }}>{activeCount}</span>}
            </button>
          )}
        </div>

        {filterOpen && (
          <>
            {/* click-away backdrop */}
            <button
              type="button" aria-hidden tabIndex={-1} onClick={() => setFilterOpen(false)}
              style={{ position: 'fixed', inset: 0, background: 'transparent', border: 'none', cursor: 'default', zIndex: 10 }}
            />
            <div
              role="listbox" aria-label="Locations"
              style={{
                position: 'absolute', right: 0, top: 'calc(100% + 0.4rem)', zIndex: 11,
                minWidth: '12rem', maxHeight: '18rem', overflowY: 'auto',
                background: 'var(--bg-primary)', border: '1px solid var(--border-light)',
                borderRadius: '10px', boxShadow: '0 6px 24px rgba(0,0,0,0.08)', padding: '0.35rem',
              }}
            >
              {locationOptions.map((location) => {
                const active = locationFilters.includes(location.key);
                return (
                  <button
                    key={location.key}
                    type="button"
                    role="option" aria-selected={active}
                    onClick={() => toggleLocation(location.key)}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.6rem',
                      width: '100%', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
                      padding: '0.5rem 0.6rem', borderRadius: '7px',
                      color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                      fontFamily: 'var(--font-eb-garamond)', fontSize: '0.9rem',
                    }}
                    className="hover:opacity-60"
                  >
                    <span>{location.label.toLowerCase()}</span>
                    <span style={{ display: 'inline-flex', opacity: active ? 1 : 0, color: 'var(--text-primary)' }}>{CheckIcon}</span>
                  </button>
                );
              })}
              {activeCount > 0 && (
                <button
                  type="button"
                  onClick={() => setLocationFilters([])}
                  style={{
                    display: 'block', width: '100%', border: 'none', borderTop: '1px solid var(--border-light)',
                    background: 'none', cursor: 'pointer', textAlign: 'left', marginTop: '0.25rem',
                    padding: '0.5rem 0.6rem', color: 'var(--text-ghost)',
                    fontFamily: 'var(--font-eb-garamond)', fontSize: '0.85rem',
                  }}
                  className="hover:opacity-60"
                >
                  clear
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: 'var(--text-ghost)', fontSize: '0.9rem', marginTop: '2rem' }}>
          no matches.
        </p>
      ) : (
        <section style={{ marginTop: '2rem' }}>
          {filtered.map((author) => (
            <article key={author.id} style={{ padding: '1.1rem 0', borderTop: '1px solid var(--border-light)' }}>
              <Link
                href={author.files_url}
                style={{
                  textDecoration: 'none',
                  color: 'inherit',
                  display: 'block',
                  transition: 'opacity 0.15s',
                  // Tap target — the author row was a 26px-tall Link
                  // inside a padded article. Adding 10px vertical padding
                  // makes the row hit-rect ≥ 44pt without changing the
                  // card's outer spacing (the article's 1.1rem padding
                  // continues to separate cards).
                  padding: '10px 0',
                  margin: '-10px 0',
                }}
                className="hover:opacity-60"
              >
                <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: '1rem' }}>
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 400, color: 'var(--text-primary)', margin: 0 }}>
                    {author.display_name || author.id}
                  </h2>
                  <span style={{ fontSize: '0.95rem', color: 'var(--text-muted)', letterSpacing: '0.02em' }}>
                    {author.alexandria_id}
                  </span>
                </div>
              </Link>
              {/* Just the name \u2014 no bio, no location/contact line. A row is only
                  noise to sense-check a person; location + contact live on the
                  profile you click into, and location is how the filter finds
                  them (fill-to-appear). The name + the mind carry the directory
                  (founder 2026-07-19). */}
            </article>
          ))}
        </section>
      )}
    </>
  );
}
