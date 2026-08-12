'use client';

import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import type { Components } from 'react-markdown';
import remarkGfm from 'remark-gfm';
import Link from 'next/link';
import { ThemeToggle } from '../../../components/ThemeToggle';
import type { PulseCard } from '../types';
import { SERVER_URL } from '../../../lib/config';

const mdComponents: Components = {
  h1: ({ children }) => <h1 style={{ fontSize: '1.3rem', fontWeight: 400, margin: '2rem 0 0.8rem', color: 'var(--text-primary)' }}>{children}</h1>,
  h2: ({ children }) => <h2 style={{ fontSize: '1rem', fontWeight: 400, margin: '1.8rem 0 0.6rem', color: 'var(--text-primary)' }}>{children}</h2>,
  h3: ({ children }) => <h3 style={{ fontSize: '0.88rem', fontWeight: 400, margin: '1.2rem 0 0.4rem', color: 'var(--text-muted)' }}>{children}</h3>,
  p: ({ children }) => <p style={{ fontSize: '0.92rem', color: 'var(--text-primary)', lineHeight: 1.8, margin: '0 0 0.8rem' }}>{children}</p>,
  li: ({ children }) => <li style={{ fontSize: '0.88rem', color: 'var(--text-primary)', lineHeight: 1.7, margin: '0 0 0.3rem' }}>{children}</li>,
  strong: ({ children }) => <strong style={{ fontWeight: 500 }}>{children}</strong>,
  hr: () => <hr style={{ border: 'none', borderTop: '1px solid var(--border-light)', margin: '2rem 0' }} />,
};

function SimilarityCard({ card, authorName, authorId }: { card: PulseCard; authorName: string; authorId: string }) {
  return (
    <div style={{
      border: '1px solid var(--border-light)',
      borderRadius: '6px',
      padding: '1.5rem',
      maxWidth: '360px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 0 1.5rem' }}>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-primary)', margin: 0, fontWeight: 400 }}>{authorName}</p>
        <p style={{ fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--text-ghost)', textTransform: 'uppercase', margin: 0 }}>{card.month}</p>
      </div>

      <div style={{ margin: '0 0 1.2rem' }}>
        <p style={{ fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--text-ghost)', textTransform: 'uppercase', margin: '0 0 0.5rem' }}>similar thinker — all time</p>
        <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between' }}>
          <span style={{ fontSize: '1.05rem', color: 'var(--text-primary)' }}>{card.alltime.name}</span>
          <span style={{ fontSize: '0.82rem', color: 'var(--text-ghost)', fontWeight: 300 }}>{card.alltime.pct}%</span>
        </div>
        <div style={{ height: '2px', background: 'var(--border-light)', marginTop: '0.3rem', borderRadius: '1px' }}>
          <div style={{ height: '2px', background: 'var(--text-ghost)', width: `${card.alltime.pct}%`, borderRadius: '1px' }} />
        </div>
        <p style={{ fontSize: '0.65rem', color: 'var(--text-ghost)', margin: '0.3rem 0 0', lineHeight: 1.5 }}>{card.alltime.why}</p>
      </div>

      <div style={{ margin: '0 0 1.5rem', padding: '0.8rem 0 0', borderTop: '1px solid var(--border-light)' }}>
        <p style={{ fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--text-ghost)', textTransform: 'uppercase', margin: '0 0 0.6rem' }}>similar thinkers — this month</p>
        {card.this_month.map((mind, i) => (
          <div key={i} style={{ margin: '0 0 0.5rem' }}>
            <span style={{ fontSize: '0.88rem', color: 'var(--text-primary)' }}>{mind.name}</span>
            <span style={{ fontSize: '0.62rem', color: 'var(--text-ghost)', marginLeft: '0.5rem' }}>{mind.why}</span>
          </div>
        ))}
      </div>

      <div style={{ margin: '1.2rem 0 0', padding: '0.8rem 0 0', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Link href={`/library/${authorId}`}
          style={{ fontSize: '0.58rem', color: 'var(--text-ghost)', textDecoration: 'none', transition: 'opacity 0.15s', letterSpacing: '0.02em' }}
          className="hover:opacity-60"
        >alexandria-library.com/library/{authorId}</Link>
        <Link href={`/join?ref=${authorId}&ref_source=library`}
          style={{ fontSize: '0.58rem', color: 'var(--text-ghost)', textDecoration: 'none', transition: 'opacity 0.15s', letterSpacing: '0.02em' }}
          className="hover:opacity-60"
        >alexandria-library.com — use code {authorId}</Link>
      </div>
    </div>
  );
}

function FragmentCard({ card, authorName, authorId }: { card: PulseCard; authorName: string; authorId: string }) {
  if (!card.fragments || card.fragments.length === 0) return null;
  const display = card.fragments.slice(0, 5);
  return (
    <div style={{
      border: '1px solid var(--border-light)',
      borderRadius: '6px',
      padding: '1.5rem',
      maxWidth: '360px',
    }}>
      <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', margin: '0 0 1.2rem' }}>
        <p style={{ fontSize: '0.95rem', color: 'var(--text-primary)', margin: 0, fontWeight: 400 }}>{authorName}</p>
        <p style={{ fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--text-ghost)', textTransform: 'uppercase', margin: 0 }}>{card.month}</p>
      </div>

      <p style={{ fontSize: '0.55rem', letterSpacing: '0.1em', color: 'var(--text-ghost)', textTransform: 'uppercase', margin: '0 0 0.8rem' }}>ideas i engaged with this month</p>

      {display.map((frag, i) => (
        <div key={i} style={{ margin: '0 0 0.7rem' }}>
          <p style={{ fontSize: '0.88rem', color: 'var(--text-primary)', margin: 0 }}>{frag.source}</p>
          <p style={{ fontSize: '0.62rem', color: 'var(--text-ghost)', margin: '0.15rem 0 0', lineHeight: 1.5 }}>{frag.idea}</p>
        </div>
      ))}

      <div style={{ margin: '1.2rem 0 0', padding: '0.8rem 0 0', borderTop: '1px solid var(--border-light)', display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
        <Link href={`/library/${authorId}`}
          style={{ fontSize: '0.58rem', color: 'var(--text-ghost)', textDecoration: 'none', transition: 'opacity 0.15s', letterSpacing: '0.02em' }}
          className="hover:opacity-60"
        >alexandria-library.com/library/{authorId}</Link>
        <Link href={`/join?ref=${authorId}&ref_source=library`}
          style={{ fontSize: '0.58rem', color: 'var(--text-ghost)', textDecoration: 'none', transition: 'opacity 0.15s', letterSpacing: '0.02em' }}
          className="hover:opacity-60"
        >alexandria-library.com — use code {authorId}</Link>
      </div>
    </div>
  );
}

export default function PulsePageClient({ params }: { params: Promise<{ author: string }> }) {
  const [authorId, setAuthorId] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [pulse, setPulse] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    params.then(({ author }) => {
      setAuthorId(author);
      fetch(`${SERVER_URL}/library/${author}`)
        .then(r => r.ok ? r.json() : null)
        .then(d => { if (d) setDisplayName(d.author?.display_name || author); })
        .catch(() => {});
      fetch(`${SERVER_URL}/library/${author}/pulse?ref=pulse_page`)
        .then(r => { if (r.ok) return r.text(); return ''; })
        .then(text => { setPulse(text); setLoading(false); })
        .catch(() => setLoading(false));
    });
  }, [params]);

  if (loading) return (
    <main style={{ maxWidth: '640px', margin: '0 auto', padding: '40vh 2rem', fontFamily: 'var(--font-eb-garamond)', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-ghost)', fontSize: '0.85rem', letterSpacing: '0.1em' }}>...</p>
    </main>
  );

  let pulseCard: PulseCard | null = null;
  try { pulseCard = JSON.parse(pulse); } catch {}

  return (
    <>
      <ThemeToggle />
      <main style={{ maxWidth: '640px', margin: '0 auto', padding: '6rem 2rem 4rem', fontFamily: 'var(--font-eb-garamond)' }}>

        <div style={{ margin: '0 0 3rem' }}>
          <Link href={`/library/${authorId}`} style={{ fontSize: '0.72rem', color: 'var(--text-ghost)', textDecoration: 'none', transition: 'opacity 0.15s' }} className="hover:opacity-60">
            {displayName || authorId}
          </Link>
          <h1 style={{ fontSize: '1.6rem', fontWeight: 300, margin: '0.5rem 0 0', color: 'var(--text-primary)', letterSpacing: '-0.01em' }}>
            pulse
          </h1>
          {pulseCard?.month && (
            <p style={{ fontSize: '0.72rem', color: 'var(--text-ghost)', margin: '0.3rem 0 0', letterSpacing: '0.05em' }}>{pulseCard.month}</p>
          )}
        </div>

        {pulseCard?.alltime ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <SimilarityCard card={pulseCard} authorName={displayName} authorId={authorId} />
            <FragmentCard card={pulseCard} authorName={displayName} authorId={authorId} />
          </div>
        ) : pulse ? (
          <div style={{ fontSize: '0.92rem', color: 'var(--text-primary)', lineHeight: 1.8 }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]} components={mdComponents}>{pulse}</ReactMarkdown>
          </div>
        ) : (
          <p style={{ color: 'var(--text-ghost)', fontSize: '0.88rem' }}>no pulse published yet.</p>
        )}

        <footer style={{ margin: '4rem 0 0', display: 'flex', justifyContent: 'center', gap: '2rem' }}>
          <Link href={`/library/${authorId}`} style={{ fontSize: '0.72rem', color: 'var(--text-whisper)', textDecoration: 'none' }} className="hover:opacity-60">{displayName || authorId}</Link>
          <Link href="/" style={{ fontSize: '0.72rem', color: 'var(--text-whisper)', textDecoration: 'none' }} className="hover:opacity-60">alexandria.</Link>
        </footer>

      </main>
    </>
  );
}
