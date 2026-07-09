'use client';

import { useState } from 'react';
import Link from 'next/link';
import { SERVER_URL, SHORTCUT_URL } from '../lib/config';

// The mobile flow — phones can't install alexandria (it runs on your computer,
// on your own files), so the phone's one job is to get you set up for later.
// Email is the hero: leave it, we send the one line to run when you're back at
// a computer and nudge you if it slips (server sends at 2d + 5d, then stops on
// install or unsubscribe — and the email lands on the list for anything later).
// Underneath, quiet: the Shortcut (start capturing now) and the places to
// follow along / explore from the phone right now.
export default function MobileStart() {
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
        body: JSON.stringify({ email: email.trim() }),
      });
      setState(resp.ok ? 'sent' : 'error');
    } catch {
      setState('error');
    }
  };

  return (
    <section className="mobile-cta">
      <p className="mobile-lede">
        alexandria runs on your computer, not your phone. leave your email and
        we&rsquo;ll send you the one line to run when you&rsquo;re back at it
        &mdash; and a nudge in case it slips.
      </p>

      {/* Email — the primary move. min-height (CSS) reserves the form's
          footprint so the swap to "sent" doesn't pull the section below up. */}
      <div className="mobile-email">
        {state === 'sent' ? (
          <p className="mobile-email-done">sent. it&rsquo;ll be waiting in your inbox.</p>
        ) : (
          <>
            <form className="mobile-email-row" onSubmit={send}>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="email"
                aria-label="your email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (state === 'error') setState('idle'); }}
                required
              />
              <button type="submit" disabled={state === 'sending'}>
                {state === 'sending' ? 'sending…' : 'send it'}
              </button>
            </form>
            <p className="mobile-email-hint">
              {state === 'error'
                ? 'couldn’t send — try again.'
                : 'we’ll email you the install command.'}
            </p>
          </>
        )}
      </div>

      {/* Secondary — things worth doing from the phone right now. */}
      <div className="mobile-more">
        <p className="mobile-more-lead">or, from here right now &mdash;</p>
        <a className="mobile-shortcut-btn" href={SHORTCUT_URL}>
          add the shortcut
        </a>
        <p className="mobile-shortcut-hint">
          save anything you read, hear, or think &mdash; it&rsquo;s all picked
          up when you install.
        </p>
        <p className="mobile-more-links">
          <Link href="/follow">stay close</Link>
          <span className="mobile-more-sep" aria-hidden>&middot;</span>
          <Link href="/library">the library</Link>
        </p>
      </div>
    </section>
  );
}
