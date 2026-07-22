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
  // Shake-on-invalid, matching the /follow field (founder 2026-07-17:
  // consistent with how we have it in the other places).
  const [shakeKey, setShakeKey] = useState(0);

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
    if (mailState === 'sending') return;
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setShakeKey((k) => k + 1);
      return;
    }
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

      {/* THE 2×2 (founder 2026-07-17): two big sections — your computer,
          your phone — with two dumb-simple numbered actions each, so a
          visitor can run the whole thing on autopilot. Normal sentence
          casing for instructions (his "be normal about that stuff" note);
          the lowercase stays on brand marks only. */}
      <p className="start-section">on your computer</p>

      <p className="step-line"><span className="step-num">1 &mdash;</span> Copy this line</p>
      <button type="button" className="install-block" onClick={copy} aria-label="copy the install command">
        <code className="install-cmd">{cmd}</code>
        <span className="install-copy">{copied ? ICON_CHECK : ICON_COPY}</span>
      </button>

      <p className="step-line step-two">
        <span className="step-num">2 &mdash;</span> Paste it into your coding agent&rsquo;s chat
      </p>
      <p className="step-agents">
        Claude Code &middot; Cursor &middot; Codex &middot; Factory &mdash; or any ai agent
        with a terminal. It runs the line and walks you through the rest.
      </p>
      {/* The trust move, first-class — the install only scales if a stranger
          (and their security-tuned agent) can clear it without trusting the
          founder personally. Free-sample rule (founder 2026-07-22): safety is
          stated calmly as fact, never as an argument against a doubt we just
          planted — no second-guessing at the moment of tasting. */}
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

      {/* Steps 3 and 4 work on ANY device (founder 2026-07-19): the shortcut
          is an iCloud one, so it adds on a Mac too and syncs to the phone, and
          email is device-agnostic — a visitor at their computer does all four
          without reaching for their phone. Phone-only visitors do these last
          two (email step 4 mails them the line for step 1 later). */}
      <p className="start-section start-section-later">on your phone or Mac</p>

      <p className="step-line">
        <span className="step-num">3 &mdash;</span>{' '}
        <a className="start-shortcut-a" href={SHORTCUT_URL} target="_blank" rel="noopener noreferrer">Add the shortcut</a>
      </p>
      <p className="step-agents">
        Add it on either device &mdash; then share anything to it from your
        phone (an article, a voice note, a thought) and it&rsquo;s waiting the
        next time you type <code>/a</code>.
      </p>

      <p className="step-line step-two">
        <span className="step-num">4 &mdash;</span> Leave your email
      </p>
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
            : 'we’ll send you the line for later, so you can do step 1 then.'}
      </p>

      {/* The fine print — three question/answer pairs, one line each (the
          install flow itself teaches what comes after, so no what-now pair —
          founder 2026-07-17). */}
      <div className="start-details">
        <div className="start-qa">
          <p className="start-qa-q">on a plain chat app?</p>
          <p className="start-qa-a">It won&rsquo;t work &mdash; it has to be one of the coding agents above.</p>
        </div>
        <div className="start-qa">
          <p className="start-qa-q">using cowork?</p>
          <p className="start-qa-a">Switch to the code tab just for this one line &mdash; it walks you through the rest.</p>
        </div>
        <div className="start-qa">
          <p className="start-qa-q">what actually installs?</p>
          <p className="start-qa-a">One folder of plain markdown you own, plus session hooks. No account needed, nothing sent to us, no background jobs &mdash; add-ons like backup (to your own GitHub) are separate explicit yeses later.</p>
        </div>
      </div>
    </section>
  );
}
