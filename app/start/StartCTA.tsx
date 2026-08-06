'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { SERVER_URL, SHORTCUT_URL } from '../lib/config';
import { ArrowIcon } from '../join/DoorIcons';

// The paste is one message to one audience: the agent (v2.2, 2026-07-30 —
// every word must have an outstanding reason to exist; we get one shot).
// No executable text, no vendor trust claims, no human bracket,
// no "To my ai:" address label. Claims live in the script header / TRUST.md
// where they're accountable. One hard constraint is necessary choreography:
// the agent independently proves the canonical GitHub commit's identity before
// it reads or runs that exact commit. The website never supplies executable
// bytes. The clock
// moved to the page's trust line (human info lives where the human is);
// pop-up pre-framing and the time expectation are field-proven to be
// carried by the agent unprompted (both cold sims, 2026-07-29). The
// refusal path stays — the paranoid agent named it as what lowered its
// flag. Full history and law: AGENTS.md § first touch; a2 § first-touch
// doctrine. A referral install rides as a plain note, never a command.
const installCmd = (ref: string | null) => {
  const refLine = ref ? `\n(installer flag if you proceed, so @${ref} gets credited for inviting me: --ref ${ref})` : '';
  return `I'd like to start an Alexandria loop — a method, delivered as files on my machine, that has you build and use a detailed private map of how I think, so you can know me and help me develop.

Before you read or run anything, prove it is the real release independently of the downloaded code: use only github.com/benmowinckel/alexandria; get the maintainer's public SSH signing keys from GitHub's account API; and require the current main commit to verify against key fingerprint SHA256:9DVo6uNuieqKMdNtT0QIi/WoQAAbWl5i/t0Z5MdQ/Jg. Then audit and run factory/setup.sh from that exact commit, with ALEXANDRIA_SOURCE_COMMIT set to its full commit hash. The trust model and hostile-audit prompt are TRUST.md and factory/redteam.md in that repo. If the owner, signature, fingerprint, or code fails your checks, stop and tell me — skipping it is fine.${refLine}`;
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
// you just autopilot through"): shortcut → email → setup, stacked,
// each one line. The command TEXT is hidden behind the copy button (noise to
// an autopilot user; it lives in the footnote for the curious). `refCode`,
// not `ref` — `ref` is a reserved React prop name.
export default function StartCTA({ refCode, mode }: { refCode?: string; mode: 'computer' | 'phone' }) {
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
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

      {/* The computer path has three numbered actions. On the phone path the
          shortcut is the first action, so it carries no numeral. */}
      <div className="act-row">
        <span className="act-num">{mode === 'computer' ? '1' : ''}</span>
        <a className="door-btn act-box" href={SHORTCUT_URL} target="_blank" rel="noopener noreferrer">
          add the shortcut<span className="act-why"> — share anything you want to think about</span>
        </a>
      </div>

      <div className="act-row">
        <span className="act-num">{mode === 'computer' ? '2' : ''}</span>
        <form className={`door-btn act-box act-email${emailFocused ? ' is-focused' : ''}`} onSubmit={sendEmail} onClick={() => emailRef.current?.focus()}>
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
                placeholder="your email"
                aria-label="your email"
                data-shake={shakeKey > 0 ? 'on' : 'off'}
                className={email.trim() || emailFocused ? 'has-val' : ''}
                value={email}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                onChange={(e) => { setEmail(e.target.value); if (mailState === 'error') setMailState('idle'); }}
              />
              {!email.trim() && <span className="act-why act-email-why"> — get help as you go, from setup through first use</span>}
              {emailFocused && (
                <button type="submit" className="join-door-go" aria-label="submit email" disabled={mailState === 'sending'} onMouseDown={(e) => e.preventDefault()}>
                  <span className="join-go-word">enter</span>
                  <ArrowIcon />
                </button>
              )}
            </>
          )}
        </form>
      </div>

      {mode === 'computer' && (
        <div className="act-row">
          <span className="act-num">3</span>
          <button type="button" className={`door-btn act-box cta-btn${copied ? ' is-copied' : ''}`} onClick={copy} aria-label="copy the setup">
            {copied
              ? 'copied — paste it into your agent’s chat or terminal'
              : (<>copy the setup<span className="act-why"> — paste it into your agent’s chat or terminal</span></>)}
          </button>
        </div>
      )}

      {/* The one line that explains the executable boundary. Reuses the
          page's already-styled trust class. */}
      <p className="primer-trust">
        Your AI proves the download is really ours and reads the code before it runs. It takes a couple of minutes — no account, no upload. The files land on your computer and stay there.
      </p>
      {validRef && (
        <p className="install-new">
          <Link href="/">new here? see what this is &rarr;</Link>
        </p>
      )}
    </section>
  );
}
