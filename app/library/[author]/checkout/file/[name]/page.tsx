'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ThemeToggle } from '../../../../../components/ThemeToggle';
import { SERVER_URL } from '../../../../../lib/config';

type AuthorResponse = {
  author?: { display_name?: string | null };
  files?: Array<{ name: string; scope?: string; visibility: string }>;
};

export default function ProtocolFileCheckoutPage({
  params,
}: {
  params: Promise<{ author: string; name: string }>;
}) {
  const searchParams = useSearchParams();
  const scope = (searchParams.get('scope') || '').trim();
  const [authorId, setAuthorId] = useState('');
  const [fileName, setFileName] = useState('');
  const [authorName, setAuthorName] = useState('');
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [isPaidFile, setIsPaidFile] = useState(true);

  useEffect(() => {
    params.then(async ({ author, name }) => {
      setAuthorId(author);
      setFileName(name);
      try {
        const res = await fetch(`${SERVER_URL}/library/${encodeURIComponent(author)}`);
        if (!res.ok) throw new Error('Author not found');
        const data = await res.json() as AuthorResponse;
        setAuthorName((data.author?.display_name || author).trim());
        const file = (data.files || []).find((candidate) => candidate.name === name && (!scope || candidate.scope === scope));
        if (!file || file.visibility !== 'paid') {
          setIsPaidFile(false);
          setError('this file is not a paid listing.');
        }
      } catch {
        setError('could not load checkout.');
      } finally {
        setReady(true);
      }
    });
  }, [params, scope]);

  const checkoutLabel = useMemo(() => {
    if (!fileName) return 'checkout';
    return `${fileName}.md`;
  }, [fileName]);

  const startCheckout = async () => {
    if (!authorId || !fileName || loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`${SERVER_URL}/library/${encodeURIComponent(authorId)}/checkout/file/${encodeURIComponent(fileName)}${scope ? `?scope=${encodeURIComponent(scope)}` : ''}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      const data = await res.json() as { url?: string; error?: string };
      if (data.url) {
        window.location.href = data.url;
        return;
      }
      setError(data.error || 'checkout failed.');
    } catch {
      setError('could not reach checkout.');
    } finally {
      setLoading(false);
    }
  };

  if (!ready) {
    return (
      <main style={{ maxWidth: '420px', margin: '0 auto', padding: '40vh 2rem', fontFamily: 'var(--font-eb-garamond)', textAlign: 'center' }}>
        <p style={{ color: 'var(--text-ghost)', fontSize: '0.85rem' }}>...</p>
      </main>
    );
  }

  return (
    <>
      <ThemeToggle />
      <main style={{ maxWidth: '420px', margin: '0 auto', padding: '8rem 2rem 4rem', fontFamily: 'var(--font-eb-garamond)' }}>
        <Link href={`/library/${authorId}`} style={{ textDecoration: 'none' }}>
          <p style={{ fontSize: '0.95rem', color: 'var(--text-primary)', margin: '0 0 0.2rem' }}>
            {authorName || authorId}
          </p>
        </Link>
        <p style={{ fontSize: '0.78rem', color: 'var(--text-ghost)', margin: '0 0 3rem' }}>
          {checkoutLabel}
        </p>

        <p style={{ fontSize: '0.72rem', color: 'var(--text-ghost)', margin: 0 }}>
          one-time purchase. opens immediately after Stripe checkout.
        </p>

        <div style={{ margin: '2.2rem 0 0' }}>
          <button
            type="button"
            onClick={() => void startCheckout()}
            disabled={!isPaidFile || loading}
            style={{
              fontSize: '0.95rem',
              color: 'var(--text-primary)',
              cursor: !isPaidFile || loading ? 'default' : 'pointer',
              opacity: !isPaidFile || loading ? 0.35 : 1,
              transition: 'opacity 0.15s',
              border: 'none',
              background: 'none',
              padding: 0,
              fontFamily: 'inherit',
            }}
            className="hover:opacity-60"
          >
            {loading ? 'redirecting...' : `buy ${checkoutLabel}`}
          </button>
          {error && <p style={{ fontSize: '0.72rem', color: 'var(--text-whisper)', margin: '0.8rem 0 0' }}>{error}</p>}
        </div>

        <div style={{ margin: '4rem 0 0', display: 'flex', gap: '1.5rem' }}>
          <Link href={`/library/${authorId}`} style={{ fontSize: '0.72rem', color: 'var(--text-whisper)', textDecoration: 'none' }} className="hover:opacity-60">
            back
          </Link>
          <Link href="/" style={{ fontSize: '0.72rem', color: 'var(--text-whisper)', textDecoration: 'none' }} className="hover:opacity-60">
            alexandria.
          </Link>
        </div>
      </main>
    </>
  );
}
