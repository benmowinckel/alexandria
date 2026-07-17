'use client';

import { useState } from 'react';
import { SERVER_URL } from '../lib/config';

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

  if (state === 'sent') {
    return (
      <div className="join-door">
        <p className="join-door-done">
          Noted &mdash; the tool stays free. We&rsquo;ll be in touch.
        </p>
      </div>
    );
  }

  // Styled as one of the three "doors" — question label + editorial underline
  // input — so the decline path sits flush with the referral and install exits.
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
          placeholder="your email"
          aria-label="your email"
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (state === 'error') setState('idle');
          }}
          required
        />
        <button type="submit" className="join-door-submit" disabled={state === 'sending'}>
          {state === 'sending' ? 'sending…' : 'send'}
        </button>
      </form>
      {state === 'error' && (
        <p className="join-door-hint">couldn&rsquo;t send &mdash; try again.</p>
      )}
    </div>
  );
}
