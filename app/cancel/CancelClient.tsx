'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { ThemeToggle } from '../components/ThemeToggle';
import { FOUNDER_PHONE } from '../lib/config';

// The AI-assist prompt — offered as a hand-off the user can paste into
// their own assistant. The page now captures the reply directly in a
// textarea (mailto retired) so the loop closes: founder sees it in
// Gmail (via Resend), I see it in D1 access_log.
const AI_PROMPT = `write a short, honest note to benjamin at alexandria. answer three things in 3-5 sentences: what made me try alexandria, what didn't land for me, what would actually make me stay. my voice, no fluff.`;

// Formats an ISO date as "Month D, YYYY" — Intl.DateTimeFormat respects
// the visitor's locale by default. Lowercased to match the literary
// register of the rest of the page.
function formatCancelDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    })
      .format(new Date(iso))
      .toLowerCase();
  } catch {
    return iso;
  }
}

type Mode = 'save' | 'cancelling' | 'cancelled' | 'reactivating' | 'reactivated';
type FeedbackState = 'idle' | 'sending' | 'sent';

export default function CancelClient({
  initialCancelAt,
  initialStatus,
}: {
  initialCancelAt: string | null;
  initialStatus: string | null;
}) {
  // If the subscription is already scheduled to cancel, we land on the
  // "cancelled" branch (which renders the reactivate UI). Otherwise we
  // open in "save" mode — the founder's letter + the cancel CTA.
  const alreadyCancelling = !!initialCancelAt || initialStatus === 'canceled';
  const [mode, setMode] = useState<Mode>(alreadyCancelling ? 'cancelled' : 'save');
  const [cancelAt, setCancelAt] = useState<string | null>(initialCancelAt);
  const [error, setError] = useState<string>('');

  const [feedbackBody, setFeedbackBody] = useState('');
  const [feedbackState, setFeedbackState] = useState<FeedbackState>('idle');
  const [feedbackError, setFeedbackError] = useState('');

  const telUrl = `tel:${FOUNDER_PHONE}`;

  const onSendFeedback = async (e: FormEvent) => {
    e.preventDefault();
    const trimmed = feedbackBody.trim();
    if (!trimmed || feedbackState !== 'idle') return;
    setFeedbackState('sending');
    setFeedbackError('');
    try {
      const res = await fetch('/api/library/account/feedback', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: trimmed }),
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setFeedbackError(data.error || 'something broke. try again?');
        setFeedbackState('idle');
        return;
      }
      setFeedbackState('sent');
    } catch {
      setFeedbackError('network hiccup. try again?');
      setFeedbackState('idle');
    }
  };

  const onCancel = async () => {
    setMode('cancelling');
    setError('');
    try {
      const res = await fetch('/api/library/account/cancel', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; cancel_at?: string; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error || 'something broke on our end. try again in a moment.');
        setMode('save');
        return;
      }
      setCancelAt(data.cancel_at || null);
      setMode('cancelled');
    } catch {
      setError('network hiccup. try again?');
      setMode('save');
    }
  };

  const onReactivate = async () => {
    setMode('reactivating');
    setError('');
    try {
      const res = await fetch('/api/library/account/reactivate', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      const data = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string };
      if (!res.ok || !data.ok) {
        setError(data.error || 'something broke on our end. try again in a moment.');
        setMode('cancelled');
        return;
      }
      setCancelAt(null);
      setMode('reactivated');
    } catch {
      setError('network hiccup. try again?');
      setMode('cancelled');
    }
  };

  const cancelAtPretty = cancelAt ? formatCancelDate(cancelAt) : null;

  return (
    <div className="cancel-page">
      <ThemeToggle />

      <header className="cancel-header">
        <Link href="/" className="cancel-brand">
          alexandria<span className="cancel-brand-dot">.</span>
        </Link>
      </header>

      <main className="cancel-main">
        {/* SAVE — the founder's letter. Lives behind the "before you go"
            opener. Renders only while the subscription is still active
            and the user hasn't pulled the trigger yet. */}
        {mode === 'save' || mode === 'cancelling' ? (
          <article className="cancel-letter">
            <p className="cancel-salutation">before you go &mdash;</p>

            <p className="cancel-line">i&rsquo;m benjamin. i built this.</p>

            <p>
              you&rsquo;re one of the first people to actually try this
              &mdash; back when it barely existed. that means something to
              me. it also means the product&rsquo;s still early enough that
              if something&rsquo;s off, i can probably just fix it.
            </p>

            <p>
              the product can still bend around what you need. it&rsquo;s
              that early. if you&rsquo;ve got two minutes, tell me
              what&rsquo;s missing. i read every word, and the next
              thing i build is probably whatever you say.
            </p>

            <p>writing&rsquo;s a chore? paste this into your AI:</p>

            <blockquote className="cancel-prompt">
              <em>{AI_PROMPT}</em>
            </blockquote>

            <p>then paste it here:</p>

            <form className="cancel-feedback" onSubmit={onSendFeedback}>
              <textarea
                className="cancel-feedback-input"
                value={feedbackBody}
                onChange={(e) => setFeedbackBody(e.target.value)}
                disabled={feedbackState !== 'idle'}
                rows={8}
                placeholder="your words, your AI&rsquo;s words — either lands with me."
                aria-label="message to benjamin"
              />
              {feedbackState === 'sent' ? (
                <p className="cancel-feedback-thanks">
                  <em>thanks &mdash; i read every word.</em>
                </p>
              ) : (
                <button
                  type="submit"
                  className="cancel-feedback-send"
                  disabled={!feedbackBody.trim() || feedbackState === 'sending'}
                >
                  {feedbackState === 'sending' ? 'sending&hellip;' : 'send'}
                </button>
              )}
              {feedbackError && <p className="cancel-error">{feedbackError}</p>}
            </form>

            <p className="cancel-or-call">
              or <a href={telUrl} className="cancel-inline-cta">call me</a>.
            </p>

            <p className="cancel-sign">&mdash; b</p>

            <p className="cancel-aside"><em>no hard feelings if neither.</em></p>

            <div className="cancel-action">
              <button
                type="button"
                className="cancel-confirm"
                onClick={onCancel}
                disabled={mode === 'cancelling'}
              >
                {mode === 'cancelling' ? 'cancelling…' : 'yes, cancel my subscription'}
              </button>
              {error && <p className="cancel-error">{error}</p>}
            </div>
          </article>
        ) : null}

        {/* CANCELLED — fresh-cancel state OR landed-here-already-cancelling.
            Shows the end date and the reactivate option. Uses the same
            register but with the calmer "sorry to see you go" opener
            when we just cancelled. */}
        {mode === 'cancelled' || mode === 'reactivating' ? (
          <article className="cancel-letter">
            <p className="cancel-salutation">
              {alreadyCancelling ? 'one last thing —' : 'sorry to see you go —'}
            </p>

            <p>
              your subscription {alreadyCancelling ? 'is set to end' : 'ends'} on{' '}
              <em>{cancelAtPretty || 'the end of the current period'}</em>.
              if you change your mind before then, you can turn it back
              on here.
            </p>

            <div className="cancel-action">
              <button
                type="button"
                className="cancel-confirm"
                onClick={onReactivate}
                disabled={mode === 'reactivating'}
              >
                {mode === 'reactivating' ? 'reactivating…' : 'reactivate my subscription'}
              </button>
              {error && <p className="cancel-error">{error}</p>}
            </div>

            <p className="cancel-aside"><em>thanks for trying alexandria.</em></p>
          </article>
        ) : null}

        {/* REACTIVATED — confirmation. Returns the user to the threshold
            with a brief welcome-back beat; offers a single link to the
            main practice (the signup primer doubles as a re-orient). */}
        {mode === 'reactivated' ? (
          <article className="cancel-letter">
            <p className="cancel-salutation">welcome back &mdash;</p>

            <p>
              your subscription is active again. nothing else to do
              here.
            </p>

            <div className="cancel-action">
              <Link href="/" className="cancel-confirm cancel-confirm-link">
                back to alexandria
              </Link>
            </div>

            <p className="cancel-sign">&mdash; b</p>
          </article>
        ) : null}
      </main>
    </div>
  );
}
