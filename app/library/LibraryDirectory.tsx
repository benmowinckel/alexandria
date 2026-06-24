'use client';

import { useMemo, useState } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { safeUrl } from '../lib/url';

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

const tagStyle: CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  border: '1px solid var(--border-light)',
  borderRadius: '999px',
  color: 'var(--text-ghost)',
  fontSize: '0.88rem',
  lineHeight: 1,
  // Tap target — was 0.32rem×0.58rem ≈ 26px tall, below HIG floor.
  // 0.6rem×0.85rem brings the chip to ~33px without breaking the
  // dense filter-bar rhythm.
  padding: '0.6rem 0.85rem',
  textDecoration: 'none',
};

function normalize(value: string | null | undefined): string {
  return (value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

function contactHref(contact: string): string {
  return contact.includes('@') && !contact.startsWith('mailto:') ? `mailto:${contact}` : safeUrl(contact);
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
      <input
        type="search"
        value={nameQuery}
        onChange={(event) => setNameQuery(event.target.value)}
        placeholder="search names"
        aria-label="Search Authors by name"
        style={{
          width: '100%',
          marginTop: '1rem',
          border: 'none',
          borderBottom: '1px solid var(--border-light)',
          background: 'transparent',
          color: 'var(--text-primary)',
          fontFamily: 'var(--font-eb-garamond)',
          fontSize: '0.95rem',
          outline: 'none',
          padding: '0 0 0.45rem',
        }}
      />

      {locationOptions.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginTop: '1rem' }}>
          {locationOptions.map((location) => {
            const active = locationFilters.includes(location.key);
            return (
              <button
                key={location.key}
                type="button"
                onClick={() => toggleLocation(location.key)}
                style={{
                  ...tagStyle,
                  cursor: 'pointer',
                  background: active ? 'var(--text-primary)' : 'transparent',
                  color: active ? 'var(--bg-primary)' : 'var(--text-ghost)',
                  borderColor: active ? 'var(--text-primary)' : 'var(--border-light)',
                }}
                className="hover:opacity-60"
              >
                {location.label}
              </button>
            );
          })}
          {locationFilters.length > 0 && (
            <button
              type="button"
              onClick={() => setLocationFilters([])}
              style={{ ...tagStyle, cursor: 'pointer', background: 'transparent' }}
              className="hover:opacity-60"
            >
              clear filters
            </button>
          )}
        </div>
      )}

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
              {author.text && (
                <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: '0.8rem 0 0' }}>
                  {author.text.replace(/\uFFFD/g, '-')}
                </p>
              )}
              {(author.location || author.contact) && (
                <div
                  style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '0.45rem',
                    marginTop: '0.75rem',
                    alignItems: 'flex-start',
                  }}
                >
                  {author.location && author.location_key && (
                    <button
                      type="button"
                      onClick={() => toggleLocation(author.location_key || '')}
                      style={{ ...tagStyle, cursor: 'pointer', background: 'none' }}
                      className="hover:opacity-60"
                    >
                      {author.location}
                    </button>
                  )}
                  {author.contact && (
                    <a
                      href={contactHref(author.contact)}
                      target={author.contact.startsWith('http') ? '_blank' : undefined}
                      rel={author.contact.startsWith('http') ? 'noopener noreferrer' : undefined}
                      style={tagStyle}
                      className="hover:opacity-60"
                      onClick={(e) => e.stopPropagation()}
                    >
                      contact
                    </a>
                  )}
                </div>
              )}
            </article>
          ))}
        </section>
      )}
    </>
  );
}
