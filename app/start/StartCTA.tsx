'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SERVER_URL, SHORTCUT_URL } from '../lib/config';
import { ArrowIcon, TickIcon } from '../join/DoorIcons';

const EMAIL_GHOST = 'your email';

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

// Staged (founder 2026-07-24, click-through door): 'command' is the one
// computer action (old steps 1+2 consolidated); 'phone' is the one phone
// action pair (shortcut + email). Each screen is one thing — no numerals,
// no 2×2, nothing competing for attention. `refCode`, not `ref` — `ref` is
// a reserved React prop name.
export default function StartCTA({ refCode, stage }: { refCode?: string; stage: 'command' | 'phone' }) {
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState('');
  const [mailState, setMailState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [shakeKey, setShakeKey] = useState(0);

  // Invited mode. A `ref` in the URL is only trusted once it validates against
  // /check-kin (a real member login) — a fake/typo ref shows no banner and the
  // untagged command, exactly as if no ref were present.
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
    if (mailState === 'sending') return;
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setShakeKey((k) => k + 1);
      return;
    }
    setMailState('sending');
    try {
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

  if (stage === 'phone') {
    return (
      <section className="cta-section">
        <p className="start-section">on your phone or Mac</p>

        <p className="step-line">
          <a className="start-shortcut-a" href={SHORTCUT_URL} target="_blank" rel="noopener noreferrer">Add the shortcut</a>
        </p>
        <p className="step-agents">
          Then share anything to it (an article, a voice note, a thought) and
          it&rsquo;s waiting the next time you type <code>/a</code>.
        </p>

        <p className="step-line step-two">Leave your email</p>
        <form className="join-door-field" onSubmit={sendEmail}>
          <input
            id="start-later-email"
            key={shakeKey}
            type="email"
            inputMode="email"
            autoComplete="email"
            size={Math.max(EMAIL_GHOST.length, email.length) + 1}
            placeholder={EMAIL_GHOST}
            aria-label="your email"
            data-shake={shakeKey > 0 ? 'on' : 'off'}
            value={email}
            readOnly={mailState === 'sent'}
            onChange={(e) => { setEmail(e.target.value); if (mailState === 'error' || mailState === 'sent') setMailState('idle'); }}
          />
          {(email.trim() || mailState === 'sent') && (
            <button
              type="submit"
              className={`join-door-go${mailState === 'sent' ? ' is-done' : ''}`}
              aria-label={mailState === 'sent' ? 'sent' : 'send'}
              disabled={mailState === 'sending' || mailState === 'sent'}
            >
              {mailState === 'sent' ? (
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
          {mailState === 'error'
            ? 'couldn’t send — try again.'
            : mailState === 'sent'
              ? 'sent — the line’s in your inbox.'
              : 'we’ll send you the install line, for when you’re at your computer.'}
        </p>
      </section>
    );
  }

  return (
    <section className="cta-section">
      {validRef && (
        <p className="install-invite">@{validRef} invited you to alexandria.</p>
      )}

      <p className="start-section">on your computer</p>

      <p className="step-line">Copy this, paste it into your coding app&rsquo;s chat</p>
      <button type="button" className="install-block" onClick={copy} aria-label="copy the install command">
        <code className="install-cmd">{cmd}</code>
        <span className="install-copy">{copied ? ICON_CHECK : ICON_COPY}</span>
      </button>
      <p className="step-agents">
        Claude Code &middot; Cursor &middot; Codex &mdash; or the code tab of the
        claude app. It runs the line and walks you through the rest.
      </p>

      {/* The trust move, first-class — safety stated calmly as fact
          (free-sample rule, founder 2026-07-22). */}
      <p className="install-where">
        Nothing to second-guess: it&rsquo;s one folder of plain files on your machine
        &mdash; nothing sent anywhere, no account, delete the folder and it&rsquo;s gone.
        And you&rsquo;re not running it blind: your ai reads what it runs, and the script
        opens with a note written for exactly that reader &mdash; say &ldquo;review this
        before running it&rdquo; if you want it grilled. Full audit at{' '}
        <Link href="/mechanics">mechanics</Link>.
      </p>

      {validRef && (
        <p className="install-new">
          <Link href="/">new here? see what this is &rarr;</Link>
        </p>
      )}

      <div className="start-details">
        <div className="start-qa">
          <p className="start-qa-q">what actually installs?</p>
          <p className="start-qa-a">One folder of plain markdown you own, plus session hooks. No account needed, nothing sent to us, no background jobs &mdash; add-ons like backup (to your own GitHub) are separate explicit yeses later.</p>
        </div>
        <div className="start-qa">
          <p className="start-qa-q">already have your own setup?</p>
          <p className="start-qa-a">It stays. A CLAUDE.md, memory files, your own notes system &mdash; Alexandria plugs into what you built, never converts it, and shows you the plan before touching anything. Deleting one folder is the whole undo.</p>
        </div>
      </div>
    </section>
  );
}
