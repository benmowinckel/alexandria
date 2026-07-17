'use client';

import { useState } from 'react';
import { SERVER_URL } from '../lib/config';
import { ArrowIcon, TickIcon } from './DoorIcons';

const EMAIL_GHOST = 'your email';

// The decline path (founder verdict 2026-07-09): a "no" at the join step
// should still leave a contactable address — the reach the community gets
// recruited from. POSTs /onboard with source:'join' (waitlist row only — no
// install email, no nudge thread; see server/src/worker.ts). `refCode`
// preserves kin attribution on the lead, so the inviter's code stays with
// the email even when the join is deferred.
export default function JoinInterest({ refCode }: { refCode?: string }) {
  const [email, setEmail] = useState('');
  const [state, setState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@') || state === 'sending') return;
    setState('sending');
    try {
      const resp = await fetch(`${SERVER_URL}/onboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          source: 'join',
          ...(refCode ? { ref: refCode } : {}),
        }),
      });
      setState(resp.ok ? 'sent' : 'error');
    } catch {
      setState('error');
    }
  };

  const sent = state === 'sent';
  // Auto-width: the underline hugs the ghost text and grows past it as they
  // type (same rule as the referral field). The send affordance (arrow → tick)
  // shows only once there's an address, and the form stays put on success so
  // the arrow can morph into a tick in place rather than swapping the block.
  const size = Math.max(EMAIL_GHOST.length, email.length) + 1;

  return (
    <div className="join-door">
      <label className="join-door-q" htmlFor="join-interest-email">
        don&rsquo;t want the community?
      </label>
      <form className="join-door-field" onSubmit={send}>
        <input
          id="join-interest-email"
          type="email"
          inputMode="email"
          autoComplete="email"
          size={size}
          placeholder={EMAIL_GHOST}
          aria-label="your email"
          value={email}
          readOnly={sent}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === 'error' || sent) setState('idle');
          }}
          required
        />
        {(email.trim() || sent) && (
          <button
            type="submit"
            className={`join-door-go${sent ? ' is-done' : ''}`}
            aria-label={sent ? 'sent' : 'send'}
            disabled={state === 'sending' || sent}
          >
            {sent ? (
              <TickIcon />
            ) : (
              <>
                <span className="join-go-word">send</span>
                <ArrowIcon />
              </>
            )}
          </button>
        )}
      </form>
      <p className="join-door-hint">
        {state === 'error'
          ? 'couldn’t send — try again.'
          : sent
            ? 'sent — we’ll be in touch.'
            : 'leave your email to continue on your own.'}
      </p>
    </div>
  );
}
