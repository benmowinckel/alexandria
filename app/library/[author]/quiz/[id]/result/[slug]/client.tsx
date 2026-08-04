'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { ThemeToggle } from '../../../../../../components/ThemeToggle';
import { SERVER_URL } from '../../../../../../lib/config';

interface ResultData {
  author_id: string;
  author_name: string;
  quiz_title: string;
  score_pct: number;
  taken_at: string;
}

export default function ResultPageClient({ params }: { params: Promise<{ author: string; id: string; slug: string }> }) {
  const [data, setData] = useState<ResultData | null>(null);
  const [authorId, setAuthorId] = useState('');
  const [quizId, setQuizId] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    params.then(({ author, id, slug }) => {
      setAuthorId(author);
      setQuizId(id);
      const ref = new URLSearchParams(window.location.search).get('ref');
      const refParam = ref ? `?ref=${encodeURIComponent(ref)}` : '';
      fetch(`${SERVER_URL}/library/${author}/quiz/${id}/result/${slug}${refParam}`)
        .then(r => { if (!r.ok) throw new Error(); return r.json(); })
        .then(d => { setData(d); setLoading(false); })
        .catch(() => setLoading(false));
    });
  }, [params]);

  if (loading) return (
    <main style={{ maxWidth: '480px', margin: '0 auto', padding: '40vh 2rem', fontFamily: 'var(--font-eb-garamond)', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-ghost)', fontSize: '0.85rem' }}>...</p>
    </main>
  );

  if (!data) return (
    <main style={{ maxWidth: '480px', margin: '0 auto', padding: '40vh 2rem', fontFamily: 'var(--font-eb-garamond)', textAlign: 'center' }}>
      <p style={{ color: 'var(--text-muted)' }}>result not found.</p>
    </main>
  );

  return (
    <>
      <ThemeToggle />
      <main style={{ maxWidth: '480px', margin: '0 auto', padding: '8rem 2rem 4rem', fontFamily: 'var(--font-eb-garamond)', textAlign: 'center' }}>

        <p style={{ fontSize: '0.7rem', color: 'var(--text-whisper)', letterSpacing: '0.15em', textTransform: 'uppercase', margin: '0 0 3rem' }}>
          {data.quiz_title}
        </p>

        <p style={{ fontSize: '4rem', fontWeight: 400, color: 'var(--text-primary)', margin: '0', lineHeight: 1 }}>
          {data.score_pct}%
        </p>

        <p style={{ fontSize: '0.92rem', color: 'var(--text-muted)', margin: '1rem 0 0', lineHeight: 1.7 }}>
          on how well they know {data.author_name}
        </p>

        <div style={{ margin: '4rem 0', display: 'flex', flexDirection: 'column', gap: '1.2rem', alignItems: 'center' }}>
          <Link
            href={`/library/${authorId}/quiz/${quizId}`}
            style={{
              textDecoration: 'none', color: 'var(--text-primary)',
              fontSize: '0.9rem', transition: 'opacity 0.15s',
            }}
            className="hover:opacity-60"
          >
            take the quiz
          </Link>

          <Link href={`/library/${authorId}`} style={{ color: 'var(--text-ghost)', textDecoration: 'none', fontSize: '0.82rem' }} className="hover:opacity-60">
            {`explore ${data.author_name}'s mind`}
          </Link>
        </div>

        <p style={{ fontSize: '0.75rem', color: 'var(--text-whisper)', marginTop: '4rem' }}>
          <a href={`/start?ref=${encodeURIComponent(authorId)}`} style={{ color: 'var(--text-whisper)', textDecoration: 'none' }} className="hover:opacity-60">
            start your loop
          </a>
        </p>

        <p style={{ fontSize: '0.72rem', color: 'var(--text-whisper)', marginTop: '3rem' }}>
          <Link href="/" style={{ color: 'var(--text-whisper)', textDecoration: 'none' }}>a.</Link>
        </p>

      </main>
    </>
  );
}
