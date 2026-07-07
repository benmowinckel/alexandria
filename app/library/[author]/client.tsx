'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '../../components/ThemeToggle';
import { FETCH_TIMEOUT_MS, SERVER_URL, librarySignInUrlHere } from '../../lib/config';
import { safeUrl } from '../../lib/url';
import AskThisMind, { type TwinVariantSummary } from './AskThisMind';

interface ProtocolFile {
  name: string;
  text: string | null;
  visibility: string;
  category?: string;
  updated_at: string;
  url: string;
}

interface AuthorData {
  author: {
    id: string;
    account_id: string | null;
    alexandria_id: string;
    display_name: string | null;
    location: string | null;
    location_key: string | null;
    contact: string | null;
    website: string | null;
    socials: { label: string; url: string }[] | null;
    text: string | null;
  };
  twin?: { enabled: boolean; label: string | null; variants?: TwinVariantSummary[]; online?: boolean; signed_in?: boolean };
  files?: ProtocolFile[];
}

function normalizePreviewText(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/\uFFFD/g, '-');
}

// Small words stay lowercase (unless first): "Droplets of Grace". Overrides let an
// Author style a name their own way (e.g. lowercase brand "mowinckels").
const SMALL_WORDS = new Set(['of', 'the', 'a', 'an', 'and', 'or', 'for', 'to', 'in', 'on', 'at', 'by', 'with']);
const TITLE_OVERRIDE: Record<string, string> = { mowinckels: 'mowinckels' };
function fileDisplayName(name: string): string {
  if (TITLE_OVERRIDE[name]) return TITLE_OVERRIDE[name];
  return name.split('-')
    .map((w, i) => (i > 0 && SMALL_WORDS.has(w) ? w : w.charAt(0).toUpperCase() + w.slice(1)))
    .join(' ');
}

function visibilityLabel(value: string): string {
  if (value === 'public') return 'public';
  if (value === 'paid') return 'paid';
  if (value === 'invite') return 'invite';
  return 'authors';
}

function contactHref(contact: string): string {
  return contact.includes('@') && !contact.startsWith('mailto:') ? `mailto:${contact}` : safeUrl(contact);
}

function websiteHref(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  return safeUrl(/^https?:\/\//i.test(t) ? t : `https://${t}`);
}

function websiteLabel(raw: string): string {
  const href = websiteHref(raw);
  return href.replace(/^https?:\/\//i, '').replace(/\/$/, '');
}

const websiteUrlLineStyle: CSSProperties = {
  display: 'block',
  fontSize: '0.85rem',
  marginTop: '0.4rem',
  color: 'var(--text-muted)',
  textDecoration: 'none',
  wordBreak: 'break-all',
  lineHeight: 1.45,
};

function WebsiteUrlLine({ website, style }: { website: string; style?: CSSProperties }) {
  const href = websiteHref(website);
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      style={{ ...websiteUrlLineStyle, ...style }}
      className="hover:opacity-60"
    >
      {websiteLabel(website)}
    </a>
  );
}

export default function AuthorPageClient({ params }: { params: Promise<{ author: string }> }) {
  const [authorId, setAuthorId] = useState('');
  const [data, setData] = useState<AuthorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    params.then(({ author }) => {
      setAuthorId(author);
      const ctrl = new AbortController();
      const timeout = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
      fetch(`/api/library/${encodeURIComponent(author)}`, { signal: ctrl.signal, credentials: 'include' })
        .then(r => { if (!r.ok) throw new Error('not found'); return r.json(); })
        .then(d => { setData(d); setLoading(false); })
        .catch(e => { setError(e.name === 'AbortError' ? 'unreachable' : e.message); setLoading(false); })
        .finally(() => clearTimeout(timeout));
    });
  }, [params]);

  const openProtocolFile = async (file: ProtocolFile) => {
    if (file.visibility === 'public') {
      window.open(`${SERVER_URL}/library/${encodeURIComponent(authorId)}/file/${encodeURIComponent(file.name)}`, '_blank', 'noopener,noreferrer');
      return;
    }
    window.location.href = `/library/${encodeURIComponent(authorId)}/open/${encodeURIComponent(file.name)}`;
  };

  if (loading) return (
    <main style={{ maxWidth: '560px', margin: '0 auto', padding: '40vh 2rem', fontFamily: 'var(--font-eb-garamond)', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-ghost)', fontSize: '0.85rem', letterSpacing: '0.1em' }}>...</p>
    </main>
  );

  if (error || !data) return (
    <main style={{ maxWidth: '560px', margin: '0 auto', padding: '40vh 2rem', fontFamily: 'var(--font-eb-garamond)', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>{error === 'unreachable' ? 'could not reach Alexandria.' : 'this Author has nothing published yet.'}</p>
      <p style={{ marginTop: '2rem' }}><Link href="/library" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.95rem' }}>library</Link></p>
    </main>
  );

  const { author } = data;
  const files = data.files || [];
  // The profile is a set of sections, each just hosted text + links — every one
  // rides the existing publish mechanism (a public file the Author names), so
  // there is no backend for any of them. `works` / `projects` / `other` are open
  // text sections rendered inline with clickable URLs; `other` is the freeform
  // catch-all (invisible until the Author publishes it). Everything else is a
  // Group entries into category sections. 'other' is a low-key bucket that is NOT
  // shown here — it holds files not meant for the router (uncategorised/internal).
  const VISIBLE_CATEGORIES = ['works', 'projects', 'shadows'] as const;
  const grouped = VISIBLE_CATEGORIES
    .map((cat) => ({ cat, items: files.filter((f) => (f.category || 'shadows') === cat) }))
    .filter((g) => g.items.length > 0);

  // Socials as clean links: the author's linked accounts (X, LinkedIn, …) plus
  // their website, shown plainly — never as buttons/pills.
  // General account sign-in — lives at the top of the page, not tied to the twin.
  const signedIn = data.twin?.signed_in === true;
  const signInUrl = librarySignInUrlHere();
  const cleanUrl = (u: string) => (u.startsWith('http') ? u : `https://${u}`);
  const socialLinks: { label: string; url: string }[] = [
    ...((author.socials || []).filter((s) => s && s.label && s.url).map((s) => ({ label: s.label, url: safeUrl(cleanUrl(s.url)) }))),
    ...(author.website ? [{ label: author.website.replace(/^https?:\/\//, '').replace(/\/$/, ''), url: safeUrl(cleanUrl(author.website)) }] : []),
  ];
  const renderLinkedText = (text: string) =>
    text.split(/(https?:\/\/[^\s]+)/g).map((part, i) =>
      /^https?:\/\//.test(part) ? (
        <a
          key={i}
          href={safeUrl(part)}
          target="_blank"
          rel="noopener noreferrer"
          className="hover:opacity-60"
          style={{ color: 'var(--text-primary)', textDecoration: 'underline' }}
        >
          {part}
        </a>
      ) : (
        <span key={i}>{part}</span>
      ),
    );
  const sectionLabelStyle: CSSProperties = {
    color: 'var(--text-ghost)',
    fontSize: '0.78rem',
    letterSpacing: '0.08em',
    margin: '0 0 0.7rem',
  };
  const textSection = (label: string, file: ProtocolFile | null) =>
    file ? (
      <div key={label} style={{ borderTop: '1px solid var(--border-light)', marginTop: '1.6rem', paddingTop: '1.1rem' }}>
        <p style={sectionLabelStyle}>{label}</p>
        <div style={{ whiteSpace: 'pre-wrap', color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.6 }}>
          {renderLinkedText(normalizePreviewText(file.text) || '')}
        </div>
      </div>
    ) : null;
  const profileText = normalizePreviewText(author.text);
  const tagStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    border: '1px solid var(--border-light)',
    borderRadius: '999px',
    color: 'var(--text-ghost)',
    fontSize: '0.88rem',
    lineHeight: 1,
    padding: '0.32rem 0.58rem',
    textDecoration: 'none',
  };

  // Entry row — title left, tier right, on one baseline, with a bottom hairline.
  const fileRow = (file: ProtocolFile) => {
    const rawPreview = normalizePreviewText(file.text) || '';
    const firstLine = rawPreview.split('\n')[0].trim();
    const preview = firstLine.length > 110 ? `${firstLine.slice(0, 110).trimEnd()}…` : firstLine;
    const rowStyle: CSSProperties = {
      display: 'flex',
      justifyContent: 'space-between',
      alignItems: 'baseline',
      gap: '1.25rem',
      width: '100%',
      padding: '0.72rem 0',
      border: 'none',
      borderBottom: '1px solid var(--border-light)',
      background: 'none',
      color: 'inherit',
      textDecoration: 'none',
      fontFamily: 'inherit',
      textAlign: 'left',
      cursor: 'pointer',
      transition: 'opacity 0.15s',
    };
    const inner = (
      <>
        <span style={{ minWidth: 0 }}>
          <span style={{ color: 'var(--text-primary)', fontSize: '0.98rem' }}>{fileDisplayName(file.name)}</span>
          {preview && (
            <span style={{ display: 'block', color: 'var(--text-ghost)', fontSize: '0.82rem', lineHeight: 1.45, marginTop: '0.2rem' }}>
              {preview}
            </span>
          )}
        </span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem', letterSpacing: '0.04em', flex: 'none', whiteSpace: 'nowrap' }}>
          {visibilityLabel(file.visibility)}
        </span>
      </>
    );

    // Every entry opens the 3-panel reader (piece + twin + notes); it handles the
    // gate itself (public reads free, invite/paid prompt sign-in).
    return (
      <Link key={file.name} href={`/library/${encodeURIComponent(authorId)}/read/${encodeURIComponent(file.name)}`}
        className="hover:opacity-60" style={rowStyle}>
        {inner}
      </Link>
    );
  };

  return (
    <>
      <ThemeToggle />
      <main style={{ maxWidth: '560px', margin: '0 auto', padding: '6rem 2rem 4rem', fontFamily: 'var(--font-eb-garamond)' }}>
        <header style={{ margin: '0 0 2.5rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
            <Link href="/library" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }} className="hover:opacity-60">
              library
            </Link>
            {!signedIn && (
              <a href={signInUrl} style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }} className="hover:opacity-60">
                sign in
              </a>
            )}
          </div>
          <h1 style={{ color: 'var(--text-primary)', fontSize: '2rem', fontWeight: 500, letterSpacing: '-0.012em', margin: '2rem 0 0.35rem' }}>
            {author.display_name || author.id}
          </h1>
          <p style={{ color: 'var(--text-ghost)', fontSize: '0.9rem', letterSpacing: '0.02em', margin: '0.35rem 0 0' }}>
            {author.alexandria_id}
          </p>
          {/* Alexandria features — location + contact as pills. */}
          {(author.location || author.contact) && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.45rem', marginTop: '0.9rem' }}>
              {author.location && author.location_key && (
                <Link href={`/library?locations=${encodeURIComponent(author.location_key)}`} style={tagStyle} className="hover:opacity-60">
                  {author.location}
                </Link>
              )}
              {author.contact && (
                <a href={contactHref(author.contact)}
                  target={author.contact.startsWith('http') ? '_blank' : undefined}
                  rel={author.contact.startsWith('http') ? 'noopener noreferrer' : undefined}
                  style={tagStyle} className="hover:opacity-60">
                  contact
                </a>
              )}
            </div>
          )}
          {/* Socials — plain links, below the pills. */}
          {socialLinks.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.85rem', marginTop: '0.7rem', fontSize: '0.9rem' }}>
              {socialLinks.map((s) => (
                <a key={s.url} href={s.url} target="_blank" rel="noopener noreferrer"
                  className="hover:opacity-60"
                  style={{ color: 'var(--text-muted)', textDecoration: 'none' }}>
                  {s.label}
                </a>
              ))}
            </div>
          )}
        </header>

        <section>
          {data.twin?.enabled && (
            <AskThisMind
              authorId={authorId}
              authorName={author.display_name || author.id}
              variants={data.twin.variants || []}
              online={data.twin.online !== false}
              signedIn={data.twin.signed_in === true}
            />
          )}
          {grouped.length === 0 ? (
            !data.twin?.enabled && (
              <p style={{ color: 'var(--text-ghost)', fontSize: '0.9rem', margin: 0 }}>
                nothing published yet.
              </p>
            )
          ) : (
            grouped.map(({ cat, items }) => (
              <div key={cat} style={{ marginTop: '2.8rem' }}>
                <p style={sectionLabelStyle}>{cat}</p>
                {items.map(fileRow)}
              </div>
            ))
          )}
        </section>
        <footer style={{ textAlign: 'center', margin: '4.5rem 0 0' }}>
          <Link href="/library" style={{ fontStyle: 'italic', color: 'var(--text-ghost)', fontSize: '1rem', letterSpacing: '0.01em', textDecoration: 'none' }} className="hover:opacity-60">
            alexandria<span style={{ fontStyle: 'normal' }}>.</span>
          </Link>
        </footer>
      </main>
    </>
  );
}
