'use client';

import { useState } from 'react';
import { SERVER_URL, SHORTCUT_URL } from '../lib/config';

// The mobile CTA — phones have no terminal, so the install one-liner is
// useless here. Two moves instead: the Shortcut (usable right now — captures
// sync and get picked up at install) and, quieter underneath, email-me-the-
// command for when they're back at a computer. Delivery, not signup.
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
      <a className="mobile-shortcut-btn" href={SHORTCUT_URL}>
        add the shortcut
      </a>
      <p className="mobile-shortcut-hint">
        save anything you read, hear, or think &mdash; starting now. it&rsquo;s
        all picked up when you install.
      </p>

      <div className="mobile-email">
        <p className="mobile-email-lead">and for when you&rsquo;re at your computer &mdash;</p>
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
                {state === 'sending' ? 'sending…' : 'send'}
              </button>
            </form>
            <p className="mobile-email-hint">
              {state === 'error'
                ? 'couldn’t send — try again.'
                : 'we’ll email you the install command. nothing else.'}
            </p>
          </>
        )}
      </div>
    </section>
  );
}
