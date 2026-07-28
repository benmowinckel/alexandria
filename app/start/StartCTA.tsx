'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { SERVER_URL, SHORTCUT_URL } from '../lib/config';
import { ArrowIcon } from '../join/DoorIcons';

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

// ONE screen after the door (founder 2026-07-24: "no need for another gate…
// you just autopilot through"): copy → paste → shortcut → email, stacked,
// each one line. The command TEXT is hidden behind the copy button (noise to
// an autopilot user; it lives in the footnote for the curious). `refCode`,
// not `ref` — `ref` is a reserved React prop name.
export default function StartCTA({ refCode, mode }: { refCode?: string; mode: 'computer' | 'phone' }) {
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState('');
  const emailRef = useRef<HTMLInputElement>(null);
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
    setTimeout(() => setCopied(false), 4000);
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

  return (
    <section className="cta-section">
      {validRef && (
        <p className="install-invite">@{validRef} invited you to alexandria.</p>
      )}

      {/* The numerals count only what is required — on the computer path
          that is two things (shortcut, paste); on the phone path the
          shortcut is the whole flow, so it carries no numeral at all. The
          empty gutter keeps every box on the same left spine. */}
      <div className="act-row">
        <span className="act-num">{mode === 'computer' ? '1' : ''}</span>
        <a className="door-btn act-box" href={SHORTCUT_URL} target="_blank" rel="noopener noreferrer">
          add the shortcut<span className="act-why"> — drop in anything</span>
        </a>
      </div>

      {/* The email sits OUTSIDE the sequence — numbered, it read as
          required registration; it is neither. Same box grammar (inputs
          live in boxes), no numeral, and the why-line says optional. */}
      <div className="act-row">
        <span className="act-num" aria-hidden />
        <form className="door-btn act-box act-email" onSubmit={sendEmail} onClick={() => emailRef.current?.focus()}>
          {mailState === 'sent' ? (
            <span className="act-sent">sent<span className="act-why"> ✓</span></span>
          ) : (
            <>
              <input
                ref={emailRef}
                id="start-later-email"
                key={shakeKey}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="leave your email"
                aria-label="leave your email"
                data-shake={shakeKey > 0 ? 'on' : 'off'}
                className={email.trim() ? 'has-val' : ''}
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (mailState === 'error') setMailState('idle'); }}
              />
              {!email.trim() && <span className="act-why act-email-why"> — optional, for the follow-up</span>}
              {email.trim() && (
                <button type="submit" className="join-door-go" aria-label="send" disabled={mailState === 'sending'}>
                  <ArrowIcon />
                </button>
              )}
            </>
          )}
        </form>
      </div>

      {mode === 'computer' && (
        <div className="act-row">
          <span className="act-num">2</span>
          <button type="button" className={`door-btn act-box cta-btn${copied ? ' is-copied' : ''}`} onClick={copy} aria-label="copy the setup">
            {copied
              ? 'copied — now paste it in'
              : (<>copy the setup<span className="act-why"> — then paste it in</span></>)}
          </button>
        </div>
      )}

      {/* The one line that answers the curl|bash hesitation: the command
          installs files, it does not sign you up for anything. Reuses the
          page's already-styled trust class. */}
      <p className="primer-trust">
        no account, no upload — the files land on your computer and stay there.
      </p>

      {validRef && (
        <p className="install-new">
          <Link href="/">new here? see what this is &rarr;</Link>
        </p>
      )}
    </section>
  );
}
