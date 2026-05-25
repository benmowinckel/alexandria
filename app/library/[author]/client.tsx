'use client';

import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '../../components/ThemeToggle';
import { FETCH_TIMEOUT_MS, SERVER_URL } from '../../lib/config';

interface ProtocolFile {
  name: string;
  text: string | null;
  visibility: string;
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
    text: string | null;
  };
  files?: ProtocolFile[];
}

function normalizePreviewText(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/\uFFFD/g, '-');
}

function fileDisplayName(name: string): string {
  return name
    .replace(/-/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function visibilityLabel(value: string): string {
  if (value === 'public') return 'public';
  if (value === 'paid') return 'paid';
  if (value === 'invite') return 'invite';
  return 'authors';
}

function contactHref(contact: string): string {
  return contact.includes('@') && !contact.startsWith('mailto:') ? `mailto:${contact}` : contact;
}

function websiteHref(raw: string): string {
  const t = raw.trim();
  if (!t) return t;
  return /^https?:\/\//i.test(t) ? t : `https://${t}`;
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
      fetch(`${SERVER_URL}/library/${author}`, { signal: ctrl.signal })
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
      <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem' }}>{error === 'unreachable' ? 'could not reach Alexandria.' : 'this Author has no protocol files yet.'}</p>
      <p style={{ marginTop: '2rem' }}><Link href="/library" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.95rem' }}>library</Link></p>
    </main>
  );

  const { author } = data;
  const files = data.files || [];
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

  const fileRow = (file: ProtocolFile) => {
    const preview = normalizePreviewText(file.text);
    const body = (
      <>
        <span style={{ color: 'var(--text-primary)', fontSize: '0.95rem' }}>{fileDisplayName(file.name)}</span>
        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', letterSpacing: '0.03em', marginLeft: '0.55rem' }}>
          {visibilityLabel(file.visibility)}
        </span>
        {preview && (
          <span style={{ display: 'block', color: 'var(--text-ghost)', fontSize: '0.8rem', lineHeight: 1.45, marginTop: '0.25rem' }}>
            {preview}
          </span>
        )}
      </>
    );

    if (file.visibility === 'public') {
      return (
        <a
          key={file.name}
          href={`/api/library/${encodeURIComponent(authorId)}/file/${encodeURIComponent(file.name)}`}
          style={{ display: 'block', textDecoration: 'none', color: 'inherit', margin: '0 0 0.9rem', transition: 'opacity 0.15s' }}
          className="hover:opacity-60"
        >
          {body}
        </a>
      );
    }

    return (
      <button
        key={file.name}
        type="button"
        onClick={() => void openProtocolFile(file)}
        className="hover:opacity-60"
        style={{
          display: 'block',
          width: '100%',
          margin: '0 0 0.9rem',
          padding: 0,
          border: 'none',
          background: 'none',
          color: 'inherit',
          cursor: 'pointer',
          fontFamily: 'inherit',
          textAlign: 'left',
          transition: 'opacity 0.15s',
        }}
      >
        {body}
      </button>
    );
  };

  return (
    <>
      <ThemeToggle />
      <main style={{ maxWidth: '560px', margin: '0 auto', padding: '6rem 2rem 4rem', fontFamily: 'var(--font-eb-garamond)' }}>
        <header style={{ margin: '0 0 2.5rem' }}>
          <Link href="/library" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem' }} className="hover:opacity-60">
            library
          </Link>
          <h1 style={{ color: 'var(--text-primary)', fontSize: '1.55rem', fontWeight: 400, letterSpacing: '-0.01em', margin: '2rem 0 0.35rem' }}>
            {author.display_name || author.id}
          </h1>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.95rem', letterSpacing: '0.02em', margin: 0, lineHeight: 1.45 }}>
            {author.alexandria_id}
          </p>
          {(author.location || author.contact) && (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                gap: '0.45rem',
                marginTop: '0.8rem',
                alignItems: 'flex-start',
              }}
            >
              {author.location && author.location_key && (
                <Link
                  href={`/library?locations=${encodeURIComponent(author.location_key)}`}
                  style={tagStyle}
                  className="hover:opacity-60"
                >
                  {author.location}
                </Link>
              )}
              {author.contact && (
                <a
                  href={contactHref(author.contact)}
                  target={author.contact.startsWith('http') ? '_blank' : undefined}
                  rel={author.contact.startsWith('http') ? 'noopener noreferrer' : undefined}
                  style={tagStyle}
                  className="hover:opacity-60"
                >
                  contact
                </a>
              )}
            </div>
          )}
          {profileText && (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5, margin: '1rem 0 0' }}>
              {profileText}
            </p>
          )}
          {author.website && (
            <WebsiteUrlLine
              website={author.website}
              style={{
                marginTop: profileText
                  ? '0.65rem'
                  : author.location || author.contact
                    ? '0.45rem'
                    : '0.8rem',
              }}
            />
          )}
        </header>

        <section>
          {files.length === 0 ? (
            <p style={{ color: 'var(--text-ghost)', fontSize: '0.9rem', margin: 0 }}>
              no protocol files published yet.
            </p>
          ) : (
            <div style={{ borderTop: '1px solid var(--border-light)', paddingTop: '1.1rem' }}>
              {files.map(fileRow)}
            </div>
          )}
        </section>
      </main>
    </>
  );
}
