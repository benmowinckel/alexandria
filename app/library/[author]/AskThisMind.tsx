'use client';

import { useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';

/**
 * "ask this mind" — query an Author's trained twin from their Library page.
 *
 * The twin is the public-safe projection of the Author's mind: weights compiled
 * from their published substrate, not the person, and not the person's live
 * thinking. The label makes that honest and unmissable. Weights, not context —
 * the visitor never sees, and cannot extract, the Author's private substrate.
 *
 * State machine: idle → thinking → answered (or error). Awaited, not streamed —
 * the MVP keeps the surface simple; streaming can slot in behind the same box.
 */

type AskResponse = {
  ok?: boolean;
  answer?: string;
  author_name?: string;
  label?: string | null;
  disclaimer?: string;
  error?: string;
};

const sectionLabelStyle: CSSProperties = {
  color: 'var(--text-ghost)',
  fontSize: '0.78rem',
  letterSpacing: '0.08em',
  margin: '0 0 0.7rem',
};

export default function AskThisMind({
  authorId,
  authorName,
  label,
}: {
  authorId: string;
  authorName: string;
  label?: string | null;
}) {
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [asked, setAsked] = useState('');
  const [disclaimer, setDisclaimer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const name = authorName || authorId;
  const restingDisclaimer =
    `you're talking to ${name}'s trained twin — a model compiled from their published writing, not ${name}. it can be wrong, and may not reflect their real views.`;

  const ask = async () => {
    const q = question.trim();
    if (!q || loading) return;
    setLoading(true);
    setError('');
    setAnswer('');
    try {
      const res = await fetch(`/api/library/${encodeURIComponent(authorId)}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ question: q }),
      });
      const body = (await res.json().catch(() => ({}))) as AskResponse;
      if (!res.ok || !body.answer) {
        setError(body.error || 'the twin could not answer just now.');
        return;
      }
      setAsked(q);
      setAnswer(body.answer);
      setDisclaimer(body.disclaimer || restingDisclaimer);
    } catch {
      setError('could not reach the twin.');
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // ⌘/Ctrl+Enter submits — the textarea keeps plain Enter for newlines.
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      void ask();
    }
  };

  const reset = () => {
    setAnswer('');
    setAsked('');
    setError('');
    setQuestion('');
  };

  return (
    <div style={{ borderTop: '1px solid var(--border-light)', marginTop: '1.6rem', paddingTop: '1.1rem' }}>
      <p style={sectionLabelStyle}>
        ask this mind
        <span style={{ color: 'var(--accent)', marginLeft: '0.5rem', letterSpacing: '0.02em' }}>twin</span>
      </p>

      {label && (
        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 0.9rem' }}>
          {label}
        </p>
      )}

      {!answer && (
        <>
          <label htmlFor="twin-q" style={{ position: 'absolute', width: 1, height: 1, overflow: 'hidden', clip: 'rect(0 0 0 0)' }}>
            ask {name} a question
          </label>
          <textarea
            id="twin-q"
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            onKeyDown={onKeyDown}
            disabled={loading}
            rows={2}
            placeholder={`ask ${name} anything…`}
            style={{
              width: '100%',
              resize: 'none',
              border: 'none',
              borderBottom: '1px solid var(--border-light)',
              background: 'transparent',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-eb-garamond)',
              fontSize: '1rem',
              lineHeight: 1.55,
              outline: 'none',
              padding: '0 0 0.55rem',
            }}
          />
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', margin: '0.9rem 0 0' }}>
            <button
              type="button"
              onClick={() => void ask()}
              disabled={loading || !question.trim()}
              className="hover:opacity-60"
              style={{
                fontSize: '0.95rem',
                color: 'var(--text-primary)',
                cursor: loading || !question.trim() ? 'default' : 'pointer',
                opacity: loading || !question.trim() ? 0.45 : 1,
                transition: 'opacity 0.15s',
                border: 'none',
                background: 'none',
                padding: 0,
                fontFamily: 'inherit',
              }}
            >
              {loading ? 'thinking…' : 'ask'}
            </button>
            <span style={{ color: 'var(--text-whisper)', fontSize: '0.78rem' }}>⌘↵</span>
          </div>
        </>
      )}

      {answer && (
        <>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.88rem', lineHeight: 1.5, margin: '0 0 0.8rem', fontStyle: 'italic' }}>
            {asked}
          </p>
          <div
            style={{
              borderLeft: '2px solid var(--accent)',
              paddingLeft: '1rem',
              whiteSpace: 'pre-wrap',
              color: 'var(--text-secondary)',
              fontSize: '0.98rem',
              lineHeight: 1.65,
            }}
          >
            {answer}
          </div>
          <button
            type="button"
            onClick={reset}
            className="hover:opacity-60"
            style={{
              fontSize: '0.9rem',
              color: 'var(--text-muted)',
              cursor: 'pointer',
              transition: 'opacity 0.15s',
              border: 'none',
              background: 'none',
              padding: 0,
              margin: '1.2rem 0 0',
              fontFamily: 'inherit',
            }}
          >
            ask another
          </button>
        </>
      )}

      {error && (
        <p style={{ fontSize: '0.82rem', color: 'var(--text-whisper)', margin: '0.8rem 0 0' }}>{error}</p>
      )}

      <p style={{ fontSize: '0.76rem', color: 'var(--text-ghost)', lineHeight: 1.5, margin: '1.4rem 0 0' }}>
        {answer ? disclaimer : restingDisclaimer}
      </p>
    </div>
  );
}
