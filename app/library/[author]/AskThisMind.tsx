'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, KeyboardEvent } from 'react';

/**
 * "ask this mind" — the PLM section on an Author's Library page.
 *
 * An Author projects up to TWO queryable twins (plm.md § both-twin architecture):
 *
 *   • weights twin (quick) — the privacy FLOOR. A model trained on the Author's
 *     published writing; the visitor never sees, and cannot extract, the raw
 *     substrate. Public by default → the stranger-facing option.
 *   • context twin (deep) — the fidelity CEILING. A top model reading the
 *     Author's published writing live. Higher fidelity; invite-gated by default.
 *
 * The server sends the variants THIS viewer may reach, PLUS invite-gated ones the
 * viewer can UNLOCK (needsInvite) — so an invite-only twin shows an unlock field
 * instead of vanishing. Reachable variants get a toggle; the honest disclaimer is
 * always present and adapts to the active variant.
 *
 * State machine: idle → thinking → answered (or error). Awaited, not streamed.
 */

type TwinVariant = 'weights' | 'context';

export type TwinVariantSummary = {
  variant: TwinVariant;
  enabled: boolean;
  visibility: string;
  label: string | null;
  tools: boolean;
  accessible: boolean;
  needsInvite?: boolean;
};

type AskResponse = {
  ok?: boolean;
  answer?: string;
  variant?: TwinVariant;
  author_name?: string;
  label?: string | null;
  disclaimer?: string;
  error?: string;
};

// Human labels for the toggle + the resting hint per variant. Hints read as a
// matched pair (what each does), plain enough for a first-time visitor.
const VARIANT_META: Record<TwinVariant, { toggle: string; hint: string }> = {
  weights: { toggle: 'quick', hint: 'trained on their writing' },
  context: { toggle: 'deep', hint: 'reads their writing live · invite-only' },
};

const sectionLabelStyle: CSSProperties = {
  color: 'var(--text-ghost)',
  fontSize: '0.78rem',
  letterSpacing: '0.08em',
  margin: '0 0 0.7rem',
};

function restingDisclaimerFor(name: string, variant: TwinVariant): string {
  if (variant === 'context') {
    return `you're talking to ${name}'s twin — a top model reading everything ${name} has published, not ${name} themselves. it can be wrong, and may not reflect their real views.`;
  }
  return `you're talking to ${name}'s trained twin — a model compiled from their published writing, not ${name}. it can be wrong, and may not reflect their real views.`;
}

export default function AskThisMind({
  authorId,
  authorName,
  variants,
}: {
  authorId: string;
  authorName: string;
  variants: TwinVariantSummary[];
}) {
  const name = authorName || authorId;

  // Variants the viewer can reach OR unlock with an invite. Weights (floor) first.
  const usable = useMemo(
    () => (variants || []).filter((v) => v.enabled && (v.accessible || v.needsInvite)),
    [variants],
  );

  const [active, setActive] = useState<TwinVariant>(usable[0]?.variant ?? 'weights');
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [asked, setAsked] = useState('');
  const [answeredVariant, setAnsweredVariant] = useState<TwinVariant>('weights');
  const [disclaimer, setDisclaimer] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  // Invite code — pre-filled from ?invite= so an invite link just works.
  const [invite, setInvite] = useState('');
  const [waited, setWaited] = useState(0);
  const waitTimer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search).get('invite');
      if (fromUrl) setInvite(fromUrl.trim());
    } catch {
      /* no-op */
    }
  }, []);

  // Elapsed-time reassurance: the deep twin can think for a while (tool loops).
  useEffect(() => {
    if (loading) {
      setWaited(0);
      waitTimer.current = setInterval(() => setWaited((s) => s + 1), 1000);
    } else if (waitTimer.current) {
      clearInterval(waitTimer.current);
      waitTimer.current = null;
    }
    return () => {
      if (waitTimer.current) clearInterval(waitTimer.current);
    };
  }, [loading]);

  if (usable.length === 0) return null;

  const activeSummary = usable.find((v) => v.variant === active) ?? usable[0];
  const showToggle = usable.length > 1;
  // This viewer must supply an invite to use the active variant.
  const inviteGated = !!activeSummary.needsInvite && !activeSummary.accessible;
  const askDisabled = loading || !question.trim() || (inviteGated && !invite.trim());

  const ask = async () => {
    const q = question.trim();
    if (!q || loading || (inviteGated && !invite.trim())) return;
    setLoading(true);
    setError('');
    setAnswer('');
    try {
      const res = await fetch(`/api/library/${encodeURIComponent(authorId)}/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          question: q,
          variant: activeSummary.variant,
          ...(invite.trim() ? { invite: invite.trim() } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as AskResponse;
      if (!res.ok || !body.answer) {
        setError(
          body.error
            || (res.status === 401 || res.status === 403
              ? 'that invite code didn’t work — check it and try again.'
              : 'the twin could not answer just now.'),
        );
        return;
      }
      const v = body.variant || activeSummary.variant;
      setAsked(q);
      setAnswer(body.answer);
      setAnsweredVariant(v);
      setDisclaimer(body.disclaimer || restingDisclaimerFor(name, v));
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

  const restingDisclaimer = restingDisclaimerFor(name, activeSummary.variant);
  const thinkingLabel = waited >= 5 ? 'thinking — this can take a moment…' : 'thinking…';

  return (
    <div style={{ borderTop: '1px solid var(--border-light)', marginTop: '1.6rem', paddingTop: '1.1rem' }}>
      <p style={sectionLabelStyle}>
        ask this mind
        <span style={{ color: 'var(--accent)', marginLeft: '0.5rem', letterSpacing: '0.02em' }}>twin</span>
      </p>

      {!answer && (
        <>
          {showToggle && (
            <div
              role="group"
              aria-label="twin depth"
              style={{ display: 'flex', gap: '1.1rem', alignItems: 'baseline', margin: '0 0 0.5rem' }}
            >
              {usable.map((v) => {
                const isActive = v.variant === active;
                return (
                  <button
                    key={v.variant}
                    type="button"
                    onClick={() => setActive(v.variant)}
                    onMouseEnter={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--text-muted)'; }}
                    onMouseLeave={(e) => { if (!isActive) e.currentTarget.style.color = 'var(--text-ghost)'; }}
                    style={{
                      border: 'none',
                      background: 'none',
                      padding: '0 0 0.2rem',
                      cursor: 'pointer',
                      fontFamily: 'inherit',
                      fontSize: '0.9rem',
                      letterSpacing: '0.02em',
                      color: isActive ? 'var(--text-primary)' : 'var(--text-ghost)',
                      borderBottom: isActive ? '1px solid var(--accent)' : '1px solid transparent',
                      transition: 'color 0.15s',
                    }}
                    aria-pressed={isActive}
                  >
                    {VARIANT_META[v.variant].toggle}
                    {v.tools && (
                      <span style={{ color: 'var(--accent)', fontSize: '0.72rem', marginLeft: '0.35rem', letterSpacing: '0.04em' }}>
                        tools
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Why one over the other — one muted line, only when both are offered. */}
          {showToggle && (
            <p style={{ color: 'var(--text-ghost)', fontSize: '0.78rem', lineHeight: 1.5, margin: '0 0 0.9rem' }}>
              quick answers anyone can ask · deep is higher-fidelity, invite-only
            </p>
          )}

          {activeSummary.label ? (
            <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 0.9rem' }}>
              {activeSummary.label}
            </p>
          ) : (
            !showToggle && (
              <p style={{ color: 'var(--text-ghost)', fontSize: '0.82rem', lineHeight: 1.5, margin: '0 0 0.9rem' }}>
                {VARIANT_META[activeSummary.variant].hint}
              </p>
            )
          )}

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

          {inviteGated && (
            <input
              type="text"
              value={invite}
              onChange={(e) => setInvite(e.target.value)}
              disabled={loading}
              placeholder="have an invite code?"
              aria-label="invite code"
              style={{
                width: '100%',
                border: 'none',
                borderBottom: '1px solid var(--border-light)',
                background: 'transparent',
                color: 'var(--text-primary)',
                fontFamily: 'var(--font-eb-garamond)',
                fontSize: '0.92rem',
                outline: 'none',
                padding: '0.7rem 0 0.5rem',
                margin: '0.6rem 0 0',
              }}
            />
          )}

          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', margin: '0.9rem 0 0' }}>
            <button
              type="button"
              onClick={() => void ask()}
              disabled={askDisabled}
              onMouseEnter={(e) => { if (!askDisabled) e.currentTarget.style.opacity = '0.6'; }}
              onMouseLeave={(e) => { e.currentTarget.style.opacity = askDisabled ? '0.45' : '1'; }}
              style={{
                fontSize: '0.95rem',
                color: 'var(--text-primary)',
                cursor: askDisabled ? 'default' : 'pointer',
                opacity: askDisabled ? 0.45 : 1,
                transition: 'opacity 0.15s',
                border: 'none',
                background: 'none',
                padding: 0,
                fontFamily: 'inherit',
              }}
            >
              {loading ? thinkingLabel : 'ask'}
            </button>
            {!loading && <span style={{ color: 'var(--text-whisper)', fontSize: '0.78rem' }}>⌘↵</span>}
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
          {showToggle && (
            <p style={{ color: 'var(--text-ghost)', fontSize: '0.74rem', letterSpacing: '0.04em', margin: '0.7rem 0 0' }}>
              {VARIANT_META[answeredVariant].toggle} · {answeredVariant === 'weights' ? 'weights twin' : 'context twin'}
            </p>
          )}
          <button
            type="button"
            onClick={reset}
            onMouseEnter={(e) => { e.currentTarget.style.opacity = '0.6'; }}
            onMouseLeave={(e) => { e.currentTarget.style.opacity = '1'; }}
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
