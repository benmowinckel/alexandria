'use client';

import { useEffect, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';

/**
 * "ask Alexandria" — the product answering for itself, on the back slide where
 * the FAQ link used to be. This is the PLM turned on the company: a live twin
 * grounded in the PUBLIC artifacts (Questions.md, Mechanics.md, the whitepaper)
 * — no private substrate, no sidecar, no privacy surface. It does two jobs at
 * once: it handles the reader's last objection at the decision point (the FAQ's
 * old job), and it IS the demo — the letter says "a mind you can ask," and here
 * one is, answering.
 *
 * Engine-agnostic by design: it POSTs a question to the same-origin proxy
 * (/api/ask) and renders {ok, answer} | {error}. Whatever engine the server
 * puts behind /ask (a dedicated company twin, a routed personal twin) only has
 * to honour that contract. Until the endpoint is live it degrades to an honest
 * "not answering yet" state — the resting composer still stands (zero-regret).
 *
 * Self-contained: all styling lives in the styled-jsx block below (rides the
 * back slide's rotating --theme-* vars, so it recolours with the frontispiece);
 * the only thing the host owns is the mobile flex `order` of `.ask-alx`. State
 * machine: idle → thinking → answered (or error). Awaited, not streamed
 * (streaming is a documented fast-follow — plm.md).
 */

// The real objections, in the reader's own words — the FAQ's highest-intent
// questions, now as one-tap seeds. Lowercase affordance register (matches the
// nearby "follow along" / "open in claude code" buttons, not the letter prose).
const SEEDS = ['is it free?', 'is my data mine?', 'do i need to code?'];

const MAX_LEN = 2000;

export default function AskAlexandria() {
  const [question, setQuestion] = useState('');
  const [asked, setAsked] = useState('');
  const [answer, setAnswer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [waited, setWaited] = useState(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Elapsed-seconds ticker so a slow first answer gets an honest "still
  // thinking" line instead of a dead spinner.
  useEffect(() => {
    if (loading) {
      setWaited(0);
      timerRef.current = setInterval(() => setWaited((w) => w + 1), 1000);
    } else if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [loading]);

  const ask = async (override?: string) => {
    const q = (override ?? question).trim();
    if (!q || loading) return;
    setLoading(true);
    setError('');
    setAnswer('');
    setAsked(q);
    try {
      const res = await fetch('/api/ask', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: q }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; answer?: string; error?: string };
      if (!res.ok || !data.answer) {
        // 503 = engine not wired yet; anything else = a real error. Honest
        // either way — never a dead end.
        setError(
          data.error ||
            (res.status === 503
              ? "the ask box isn't switched on yet — the letter and whitepaper have every answer in the meantime."
              : 'something went wrong. try again, or email benjamin@mowinckel.ai.'),
        );
      } else {
        setAnswer(data.answer.trim());
      }
    } catch {
      setError('couldn’t reach the library — check your connection, or email benjamin@mowinckel.ai.');
    } finally {
      setLoading(false);
    }
  };

  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void ask();
    }
  };

  const inputStyle: CSSProperties = {
    flex: 1,
    resize: 'none',
    border: '1px solid var(--theme-border-soft)',
    borderRadius: 12,
    background: 'rgba(255, 255, 255, 0.34)',
    color: 'var(--theme-fg)',
    fontFamily: 'var(--font-serif), ui-serif, Georgia, serif',
    fontSize: 15,
    lineHeight: 1.5,
    outline: 'none',
    padding: '0.62rem 0.8rem',
    transition: 'border-color 180ms ease',
  };

  const sendStyle: CSSProperties = {
    border: 'none',
    borderRadius: 10,
    background: 'var(--theme-fg)',
    color: 'var(--theme-bg)',
    fontFamily: 'var(--font-serif), ui-serif, Georgia, serif',
    fontSize: 14,
    letterSpacing: '0.02em',
    padding: '0.6rem 1.05rem',
    // Crisp navy at rest (inviting, matches the "join the tribe" CTA) — only
    // dims while actually thinking. A disabled-dimmed resting button read as
    // muddy/half-broken. Clicking it empty is a no-op (ask() guards).
    cursor: loading ? 'default' : 'pointer',
    opacity: loading ? 0.55 : 1,
    transition: 'opacity 150ms ease',
    whiteSpace: 'nowrap',
    alignSelf: 'stretch',
  };

  return (
    <div className="ask-alx">
      <p className="ask-alx-intro">
        <em>Still deciding? Ask Alexandria &mdash; it answers from everything here.</em>
      </p>

      {!question && !answer && !loading && (
        <div className="ask-alx-seeds">
          {SEEDS.map((s) => (
            <button
              key={s}
              type="button"
              className="ask-alx-chip"
              onClick={() => {
                setQuestion(s);
                void ask(s);
              }}
            >
              {s}
            </button>
          ))}
        </div>
      )}

      <div className="ask-alx-row">
        <textarea
          value={question}
          onChange={(e) => setQuestion(e.target.value.slice(0, MAX_LEN))}
          onKeyDown={onKeyDown}
          onFocus={(e) => (e.currentTarget.style.borderColor = 'var(--theme-fg-muted)')}
          onBlur={(e) => (e.currentTarget.style.borderColor = 'var(--theme-border-soft)')}
          disabled={loading}
          rows={1}
          placeholder="ask alexandria anything…"
          aria-label="ask Alexandria a question"
          style={inputStyle}
        />
        <button
          type="button"
          onClick={() => void ask()}
          disabled={loading}
          onMouseEnter={(e) => { if (!loading) e.currentTarget.style.opacity = '0.82'; }}
          onMouseLeave={(e) => { e.currentTarget.style.opacity = loading ? '0.55' : '1'; }}
          style={sendStyle}
        >
          {loading ? '…' : 'ask'}
        </button>
      </div>

      {loading && waited >= 4 && <p className="ask-alx-note">thinking&hellip;</p>}

      {error && <p className="ask-alx-note">{error}</p>}

      {answer && (
        <div className="ask-alx-answer">
          <p className="ask-alx-asked"><em>{asked}</em></p>
          <div className="ask-alx-body">{answer}</div>
          <p className="ask-alx-disclaimer">
            Alexandria answering from its own public notes &mdash; it can be wrong; the{' '}
            <a href="/whitepaper">whitepaper</a> is the full read.
          </p>
        </div>
      )}

      <style jsx>{`
        .ask-alx {
          margin: 24px 0 0;
          width: 100%;
          max-width: 452px;
        }
        .ask-alx-intro {
          margin: 0 0 12px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 14px;
          line-height: 1.5;
          color: var(--theme-fg-muted);
        }
        .ask-alx-seeds {
          display: flex;
          flex-wrap: wrap;
          gap: 7px;
          margin: 0 0 11px;
        }
        .ask-alx-chip {
          border: 1px solid var(--theme-border-soft);
          border-radius: 999px;
          background: transparent;
          color: var(--theme-fg-muted);
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 12.5px;
          letter-spacing: 0.01em;
          padding: 5px 12px;
          cursor: pointer;
          transition: border-color 180ms ease, color 180ms ease;
        }
        .ask-alx-chip:hover {
          border-color: var(--theme-fg-muted);
          color: var(--theme-fg);
        }
        .ask-alx-row {
          display: flex;
          gap: 0.5rem;
          align-items: stretch;
        }
        .ask-alx-note {
          margin: 10px 0 0;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 13px;
          line-height: 1.5;
          color: var(--theme-fg-faint);
        }
        .ask-alx-answer {
          margin: 16px 0 0;
        }
        .ask-alx-asked {
          margin: 0 0 9px;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 13.5px;
          color: var(--theme-fg-faint);
        }
        .ask-alx-body {
          border-left: 2px solid var(--theme-fg-muted);
          padding-left: 15px;
          white-space: pre-wrap;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 15px;
          line-height: 1.62;
          color: var(--theme-fg);
        }
        .ask-alx-disclaimer {
          margin: 12px 0 0;
          font-family: var(--font-serif), ui-serif, Georgia, serif;
          font-size: 12px;
          line-height: 1.5;
          color: var(--theme-fg-faint);
        }
        .ask-alx-disclaimer a {
          color: var(--theme-fg-muted);
        }
      `}</style>
    </div>
  );
}
