'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
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

export type LibrarySort = 'number-asc' | 'number-desc' | 'name-asc' | 'name-desc';

function normalize(value: string | null | undefined): string {
  return (value || '').toLowerCase().normalize('NFKD').replace(/[\u0300-\u036f]/g, '');
}

function alexandriaNumber(value: string): number {
  const match = /^a\.(\d+)$/i.exec(value.trim());
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function displayName(author: DirectoryAuthor): string {
  return author.display_name || author.id;
}

type DirectoryMenuOption<T extends string> = {
  value: T;
  label: string;
  ariaLabel?: string;
};

function DirectoryMenu<T extends string>({
  value,
  options,
  onChange,
  ariaLabel,
  align = 'start',
}: {
  value: T;
  options: DirectoryMenuOption<T>[];
  onChange: (value: T) => void;
  ariaLabel: string;
  align?: 'start' | 'end';
}) {
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const selected = options.find((option) => option.value === value) || options[0];

  useEffect(() => {
    if (!open) return;
    const close = (event: globalThis.PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('pointerdown', close);
    return () => document.removeEventListener('pointerdown', close);
  }, [open]);

  return (
    <div
      ref={rootRef}
      className={`directory-menu-wrap${align === 'end' ? ' directory-menu-end' : ''}`}
      onKeyDown={(event) => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="directory-menu-trigger"
        aria-label={ariaLabel}
        aria-haspopup="listbox"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        <span>{selected.label}</span>
        <span className="directory-menu-chevron" aria-hidden />
      </button>
      {open ? (
        <div className="directory-menu" role="listbox" aria-label={ariaLabel}>
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              role="option"
              aria-selected={option.value === value}
              aria-label={option.ariaLabel || option.label}
              className="directory-menu-option"
              onClick={() => {
                onChange(option.value);
                setOpen(false);
                triggerRef.current?.focus();
              }}
            >
              {option.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

export function LibraryDirectory({
  authors,
  initialQuery = '',
  initialLocation = '',
  initialSort = 'number-asc',
}: {
  authors: DirectoryAuthor[];
  initialQuery?: string;
  initialLocation?: string;
  initialSort?: LibrarySort;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [location, setLocation] = useState(initialLocation);
  const [sort, setSort] = useState<LibrarySort>(initialSort);

  const locations = useMemo(() => {
    const values = new Map<string, string>();
    authors.forEach((author) => {
      if (author.location && author.location_key) values.set(author.location_key, author.location);
    });
    return [...values.entries()].sort((a, b) => a[1].localeCompare(b[1], undefined, { sensitivity: 'base' }));
  }, [authors]);
  const locationOptions = useMemo<DirectoryMenuOption<string>[]>(() => [
    { value: '', label: 'everywhere' },
    ...locations.map(([value, label]) => ({ value, label })),
  ], [locations]);
  const sortOptions: DirectoryMenuOption<LibrarySort>[] = [
    { value: 'number-asc', label: 'ascending', ariaLabel: 'Alexandria number, lowest first' },
    { value: 'number-desc', label: 'descending', ariaLabel: 'Alexandria number, highest first' },
    { value: 'name-asc', label: 'a–z', ariaLabel: 'Name, A to Z' },
    { value: 'name-desc', label: 'z–a', ariaLabel: 'Name, Z to A' },
  ];

  const filtered = useMemo(() => {
    const needle = normalize(query.trim());
    const visible = authors.filter((author) => {
      const matchesName = !needle || normalize(`${displayName(author)} ${author.id}`).includes(needle);
      const matchesLocation = !location || author.location_key === location;
      return matchesName && matchesLocation;
    });

    return visible.sort((a, b) => {
      if (sort.startsWith('number')) {
        const delta = alexandriaNumber(a.alexandria_id) - alexandriaNumber(b.alexandria_id);
        if (delta) return sort === 'number-asc' ? delta : -delta;
      }
      const byName = displayName(a).localeCompare(displayName(b), undefined, { sensitivity: 'base' });
      return sort === 'name-desc' ? -byName : byName;
    });
  }, [authors, location, query, sort]);

  return (
    <>
      <div className="directory-tools">
        <label className="directory-control directory-search">
          <span className="directory-label">name</span>
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="search people"
            aria-label="Search profiles by name"
          />
        </label>
        <div className="directory-control">
          <span className="directory-label">location</span>
          <DirectoryMenu value={location} options={locationOptions} onChange={setLocation} ariaLabel="Filter profiles by location" />
        </div>
        <div className="directory-control">
          <span className="directory-label">order</span>
          <DirectoryMenu value={sort} options={sortOptions} onChange={setSort} ariaLabel="Order profiles" align="end" />
        </div>
      </div>

      {filtered.length === 0 ? (
        <p className="directory-empty">no matches.</p>
      ) : (
        <section className="directory-list" aria-live="polite">
          {filtered.map((author) => (
            <article key={author.id} className="directory-row">
              <Link href={author.files_url} className="directory-link hover:opacity-60">
                <span className="directory-person">
                  <span className="directory-name">{displayName(author)}</span>
                  {author.location ? <span className="directory-location">{author.location}</span> : null}
                </span>
                <span className="directory-number">{author.alexandria_id}</span>
              </Link>
            </article>
          ))}
        </section>
      )}

      <style>{`
        .directory-tools {
          display: grid; grid-template-columns: minmax(0, 1.25fr) minmax(9rem, 0.85fr) minmax(10rem, 1fr);
          gap: 1.25rem; margin-top: 1.4rem; padding: 0 0 1rem; border-bottom: 1px solid var(--border-light);
        }
        .directory-control { min-width: 0; display: grid; gap: 0.3rem; }
        .directory-label {
          color: var(--text-ghost); font-size: 0.72rem; letter-spacing: 0.08em; text-transform: lowercase;
        }
        .directory-control input {
          width: 100%; min-width: 0; border: 0; border-radius: 0; outline: 0; padding: 0;
          background: transparent; color: var(--text-primary); font-family: var(--font-eb-garamond);
          font-size: 0.96rem; line-height: 1.35;
        }
        .directory-control input { padding-bottom: 0.22rem; border-bottom: 1px solid transparent; }
        .directory-control input:focus { border-bottom-color: var(--border-light); }
        .directory-menu-wrap { position: relative; min-width: 0; }
        .directory-menu-trigger {
          width: 100%; min-width: 0; display: flex; align-items: center; justify-content: space-between; gap: 0.8rem;
          border: 0; border-bottom: 1px solid transparent; border-radius: 0; outline: 0;
          padding: 0 0 0.22rem; background: transparent; color: var(--text-primary);
          font-family: var(--font-eb-garamond); font-size: 0.96rem; line-height: 1.35;
          text-align: left; cursor: pointer; transition: border-color 160ms ease;
        }
        .directory-menu-trigger:hover, .directory-menu-trigger:focus-visible, .directory-menu-trigger[aria-expanded='true'] {
          border-bottom-color: var(--border-light);
        }
        .directory-menu-chevron {
          flex: none; width: 0.34rem; height: 0.34rem; margin: -0.16rem 0.18rem 0 0;
          border-right: 1px solid var(--text-muted); border-bottom: 1px solid var(--text-muted);
          transform: rotate(45deg); transition: transform 160ms ease;
        }
        .directory-menu-trigger[aria-expanded='true'] .directory-menu-chevron { transform: translateY(0.14rem) rotate(225deg); }
        .directory-menu {
          position: absolute; z-index: 30; top: calc(100% + 0.45rem); left: -0.45rem;
          min-width: max(100%, 8.5rem); display: grid; gap: 0.08rem; padding: 0.36rem;
          border: 1px solid var(--border-light); border-radius: 10px; background: var(--bg-modal);
          box-shadow: 0 12px 30px rgba(45, 35, 25, 0.12), 0 2px 6px rgba(45, 35, 25, 0.05);
          animation: directoryMenuIn 140ms ease-out both;
        }
        .dark .directory-menu { box-shadow: 0 14px 34px rgba(0, 0, 0, 0.34); }
        .directory-menu-end .directory-menu { right: -0.45rem; left: auto; }
        .directory-menu-option {
          width: 100%; border: 0; border-radius: 6px; padding: 0.42rem 0.55rem;
          background: transparent; color: var(--text-muted); font-family: var(--font-eb-garamond);
          font-size: 0.94rem; line-height: 1.2; text-align: left; white-space: nowrap; cursor: pointer;
        }
        .directory-menu-option:hover, .directory-menu-option:focus-visible { background: var(--bg-secondary); color: var(--text-primary); outline: none; }
        .directory-menu-option[aria-selected='true'] { color: var(--text-primary); font-style: italic; }
        @keyframes directoryMenuIn {
          from { opacity: 0; transform: translateY(-3px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .directory-control input::placeholder { color: var(--text-muted); opacity: 1; }
        .directory-list { margin-top: 1.7rem; }
        .directory-row { padding: 0.35rem 0; }
        .directory-link {
          min-height: 64px; display: flex; align-items: center; justify-content: space-between; gap: 1.5rem;
          color: inherit; text-decoration: none; transition: opacity 0.15s; padding: 0.55rem 0;
        }
        .directory-person { min-width: 0; display: grid; gap: 0.24rem; }
        .directory-name { color: var(--text-primary); font-size: 1.12rem; line-height: 1.2; }
        .directory-location { color: var(--text-muted); font-size: 0.9rem; line-height: 1.2; }
        .directory-number { flex: none; color: var(--text-muted); font-size: 0.94rem; letter-spacing: 0.02em; }
        .directory-empty { color: var(--text-ghost); font-size: 0.9rem; margin-top: 2rem; }
        @media (max-width: 640px) {
          .directory-tools { grid-template-columns: 1fr 1fr; gap: 1rem 1.2rem; }
          .directory-search { grid-column: 1 / -1; }
          .directory-link { min-height: 68px; }
        }
        @media (prefers-reduced-motion: reduce) {
          .directory-menu, .directory-menu-chevron { animation: none; transition: none; }
        }
      `}</style>
    </>
  );
}
