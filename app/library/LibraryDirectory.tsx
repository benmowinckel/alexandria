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

function normalize(value: string | null | undefined): string {
  return (value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

function alexandriaNumber(value: string): number {
  const match = /^a\.(\d+)$/i.exec(value.trim());
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

export function LibraryDirectory({ authors, initialQuery = '' }: { authors: DirectoryAuthor[]; initialQuery?: string }) {
  const [query, setQuery] = useState(initialQuery);

  const sortedAuthors = useMemo(() => {
    return [...authors].sort((a, b) => {
      const byNumber = alexandriaNumber(a.alexandria_id) - alexandriaNumber(b.alexandria_id);
      if (byNumber) return byNumber;
      return (a.display_name || a.id).localeCompare(b.display_name || b.id, undefined, { sensitivity: 'base' });
    });
  }, [authors]);

  const filtered = useMemo(() => {
    const needle = normalize(query.trim());
    if (!needle) return sortedAuthors;
    return sortedAuthors.filter((author) => normalize([
      author.display_name,
      author.id,
      author.alexandria_id,
      author.location,
    ].filter(Boolean).join(' ')).includes(needle));
  }, [sortedAuthors, query]);

  return (
    <>
      <div style={{ marginTop: '1rem', borderBottom: '1px solid var(--border-light)' }}>
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="search name, number, or city"
          aria-label="Search Alexandrians by name, number, or city"
          style={{
            width: '100%', boxSizing: 'border-box', border: 'none',
            background: 'transparent', color: 'var(--text-primary)',
            fontFamily: 'var(--font-eb-garamond)', fontSize: '0.95rem',
            outline: 'none', padding: '0 0 0.45rem',
          }}
        />
      </div>

      {filtered.length === 0 ? (
        <p style={{ color: 'var(--text-ghost)', fontSize: '0.9rem', marginTop: '2rem' }}>
          no matches.
        </p>
      ) : (
        // The search underline is the sole boundary; whitespace separates rows.
        <section style={{ marginTop: '2rem' }}>
          {filtered.map((author) => (
            <article key={author.id} style={{ padding: '0.85rem 0' }}>
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
                  <h2 style={{ minWidth: 0, fontSize: '1.1rem', fontWeight: 400, color: 'var(--text-primary)', margin: 0 }}>
                    {author.display_name || author.id}
                    {author.location ? <span style={{ color: 'var(--text-muted)', fontSize: '0.92rem' }}> · {author.location}</span> : null}
                  </h2>
                  <span style={{ flex: 'none', fontSize: '0.95rem', color: 'var(--text-muted)', letterSpacing: '0.02em' }}>
                    {author.alexandria_id}
                  </span>
                </div>
              </Link>
            </article>
          ))}
        </section>
      )}
    </>
  );
}
