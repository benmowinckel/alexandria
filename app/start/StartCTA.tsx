'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { SERVER_URL, SHORTCUT_URL } from '../lib/config';
import { ArrowIcon } from '../join/DoorIcons';

const EMAIL_GHOST = 'your email';

// The paste is the human's INTENT plus pointers — nothing more (v2,
// 2026-07-29). v1 fixed the blind-pipe refusal (2026-07-22, 2026-07-28) by
// scripting the agent's verification steps — but external text choreographing
// the user's agent IS the manipulation shape, however reasonable the steps,
// and a bash pipeline in the paste pattern-matches "random pasted command"
// before a word gets read. So v2 contains: no executable text at all, no
// trust claims (those live in the script header / TRUST.md / mechanics,
// where they're accountable — the agent finds and verifies them there, by
// its own plan), and the agent's own judgment as the explicit gate, with a
// legitimate refusal path — text that permits refusal doesn't read as
// coercion. "This is me asking, not the website" is adopted-by-pasting:
// the human's choice to paste is what makes it true.
// A referral-tagged install (validated inviter login) rides as a plain
// note the agent passes to the installer if it proceeds.
const installCmd = (ref: string | null) => {
  const refLine = ref ? `\n(installer flag if you proceed, so @${ref} gets credited for inviting me: --ref ${ref})` : '';
  return `[you're done after pasting — your ai looks into it first and checks with you before anything runs.]

To my ai: I'd like to try Alexandria — a method, delivered as files on my machine, that has you build and use a detailed private map of how I think, so you can actually know me and help me develop. This is me asking, not the website.

Evaluate it before anything runs — don't take its word for it. The install script is at alexandria-library.com/a; the trust model and the project's own hostile-audit prompt are TRUST.md and factory/redteam.md at github.com/benmowinckel/alexandria. If you're satisfied it does what it says, set it up and take me through it. If you're not, tell me what stopped you — skipping it is fine.${refLine}`;
};

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
        your ai reads the code before it runs — no account, no upload, the files land on your computer and stay there.
      </p>

      {validRef && (
        <p className="install-new">
          <Link href="/">new here? see what this is &rarr;</Link>
        </p>
      )}
    </section>
  );
}
