'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SERVER_URL } from '../lib/config';

// The keyless install one-liner. `/a` redirects (Vercel, next.config.ts) to the
// raw setup.sh; `curl -fsSL` follows it. No key = the free local product (the gym).
const INSTALL_CMD = 'curl -fsSL alexandria-library.com/a | bash';

// Referral-tagged form — an invited install passes the inviter's GitHub login
// through to setup.sh so the inviter is credited as kin. Only used when a `ref`
// arrives in the URL AND validates against /check-kin; otherwise the untagged
// command above is the one shown and copied.
const installCmd = (ref: string | null) =>
  ref ? `curl -fsSL alexandria-library.com/a | bash -s -- --ref ${ref}` : INSTALL_CMD;

const ICON_COPY = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const ICON_CHECK = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

// `refCode`, not `ref` — `ref` is a reserved prop name React intercepts for
// ref-forwarding, so it never arrives as a readable prop. The invited-install
// referral (a GitHub login) rides in under a plain name.
export default function StartCTA({ refCode }: { refCode?: string }) {
  const [copied, setCopied] = useState(false);
  // The do-it-later capture — desktop's version of the mobile email hero.
  // A desktop visitor who's convinced but not at a terminal (borrowed
  // machine, reading on the couch, "later") had no way to be kept before
  // this; they'd bounce and we'd lose them. Same /onboard flow the phone
  // uses: leave an email, the server sends the one line + a 2d/5d nudge.
  const [email, setEmail] = useState('');
  const [mailState, setMailState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');

  // Invited mode. A `ref` in the URL is only trusted once it validates against
  // /check-kin (a real member login) — a fake/typo ref shows no banner and the
  // untagged command, exactly as if no ref were present. `validRef` holds the
  // confirmed login (drives the banner + the tagged command); null means either
  // no ref or an unvalidated one.
  const [validRef, setValidRef] = useState<string | null>(null);

  useEffect(() => {
    if (!refCode) { setValidRef(null); return; }
    let live = true;
    (async () => {
      try {
        const resp = await fetch(`${SERVER_URL}/check-kin?code=${encodeURIComponent(refCode)}`);
        const data = await resp.json().catch(() => ({ valid: false }));
        if (live) setValidRef(resp.ok && data.valid ? refCode : null);
      } catch {
        if (live) setValidRef(null);
      }
    })();
    return () => { live = false; };
  }, [refCode]);

  const cmd = installCmd(validRef);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(cmd);
    } catch {
      // Fallback for browsers without async clipboard.
      const ta = document.createElement('textarea');
      ta.value = cmd;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* noop */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const sendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@') || mailState === 'sending') return;
    setMailState('sending');
    try {
      // No `source` — this visitor intends to install, so they get the
      // command email + nudge thread (unlike /join's waitlist-only capture).
      // `ref` rides along when validated so the inviter is credited even on a
      // deferred, emailed install.
      const resp = await fetch(`${SERVER_URL}/onboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim(), ...(validRef ? { ref: validRef } : {}) }),
      });
      setMailState(resp.ok ? 'sent' : 'error');
    } catch {
      setMailState('error');
    }
  };

  return (
    <section className="cta-section">
      {validRef && (
        <p className="install-invite">@{validRef} invited you to alexandria.</p>
      )}

      {/* Radically simple (founder, 2026-07-16): the page IS two steps —
          what to copy, where to paste. Everything else lives below in the
          fine print, present but never in the way. */}
      <p className="step-line"><span className="step-num">1 &mdash;</span> copy this line</p>
      <button type="button" className="install-block" onClick={copy} aria-label="copy the install command">
        <code className="install-cmd">{cmd}</code>
        <span className="install-copy">{copied ? ICON_CHECK : ICON_COPY}</span>
      </button>

      <p className="step-line step-two">
        <span className="step-num">2 &mdash;</span> paste it into your coding agent
        {copied && <span className="step-copied"> (copied &mdash; go ahead)</span>}
      </p>
      <p className="step-agents">
        claude code &middot; cursor &middot; codex &middot; factory &mdash; it walks you through the rest.
      </p>

      {validRef && (
        <p className="install-new">
          <Link href="/">new here? see what this is &rarr;</Link>
        </p>
      )}

      {/* The fine print — every caveat and reassurance, grouped and quiet. */}
      <div className="start-details">
        <p>yours &mdash; it runs on your own files; nothing is ever sent to us.</p>
        <p>careful? paste it in and ask your agent what it does &mdash; it reads every line.</p>
        <p>no coding agent? get claude code: <code>npm install -g @anthropic-ai/claude-code</code> &mdash; then paste the line above into it.</p>
        <p>in cowork it works too &mdash; one extra settings step, and it walks you through it. a plain chat app won&rsquo;t work.</p>
        <p>on windows, run it inside your coding agent, or in git bash / wsl.</p>
      </div>

      {/* The do-it-later net — hairline-separated, quieter than the command
          above (the command is the hero; this catches the not-right-now). */}
      <div className="start-later">
        {mailState === 'sent' ? (
          <p className="start-later-done">
            sent &mdash; the command&rsquo;s in your inbox for when you&rsquo;re back at your computer.
          </p>
        ) : (
          <>
            <p className="start-later-lede">
              not at your computer, or want to do it later? leave your
              email and we&rsquo;ll send you the one line to run.
            </p>
            <form className="start-later-row" onSubmit={sendEmail}>
              <input
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="email"
                aria-label="your email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (mailState === 'error') setMailState('idle'); }}
                required
              />
              <button type="submit" disabled={mailState === 'sending'}>
                {mailState === 'sending' ? 'sending…' : 'send it'}
              </button>
            </form>
            {mailState === 'error' && (
              <p className="start-later-hint">couldn&rsquo;t send &mdash; try again.</p>
            )}
          </>
        )}
      </div>
    </section>
  );
}
