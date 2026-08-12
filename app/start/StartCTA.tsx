'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SERVER_URL, SHORTCUT_URL } from '../lib/config';
import { ArrowIcon } from '../join/DoorIcons';
import { computerInstallPrompt, mobileHandoffPrompt } from '../../shared/onboarding-prompts';

export default function StartCTA({ refCode, mode }: { refCode?: string; mode: 'computer' | 'phone' }) {
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [email, setEmail] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [mailState, setMailState] = useState<'idle' | 'sending' | 'sent' | 'saved' | 'invalid' | 'error'>('idle');
  const [shakeKey, setShakeKey] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);
  const [refCheck, setRefCheck] = useState<{ input: string; valid: string | null } | null>(null);
  const validRef = refCode && refCheck?.input === refCode ? refCheck.valid : null;

  useEffect(() => {
    if (!refCode) return;
    let live = true;
    fetch(`${SERVER_URL}/check-kin?code=${encodeURIComponent(refCode)}`)
      .then(async (resp) => ({ ok: resp.ok, data: await resp.json().catch(() => ({ valid: false })) }))
      .then(({ ok, data }) => { if (live) setRefCheck({ input: refCode, valid: ok && data.valid ? refCode : null }); })
      .catch(() => { if (live) setRefCheck({ input: refCode, valid: null }); });
    return () => { live = false; };
  }, [refCode]);

  const copy = async () => {
    const command = mode === 'phone' ? mobileHandoffPrompt() : computerInstallPrompt();
    let success = false;
    try {
      await navigator.clipboard.writeText(command);
      success = true;
    } catch {
      const area = document.createElement('textarea');
      area.value = command;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { success = document.execCommand('copy'); } catch { /* noop */ }
      document.body.removeChild(area);
    }
    setCopyState(success ? 'copied' : 'error');
    setTimeout(() => setCopyState('idle'), 4000);
  };

  const sendEmail = async (event: React.FormEvent) => {
    event.preventDefault();
    if (mailState === 'sending') return;
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setShakeKey((key) => key + 1);
      setMailState('invalid');
      return;
    }
    setMailState('sending');
    try {
      const response = await fetch(`${SERVER_URL}/onboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed, source: 'start', mode: `agent-${mode}`, ...(validRef ? { ref: validRef } : {}) }),
      });
      const result = await response.json().catch(() => ({}));
      setMailState(response.ok ? (result.delivered === false ? 'saved' : 'sent') : 'error');
    } catch {
      setMailState('error');
    }
  };

  const emailWhy = ' — we’ll send your setup, then occasional useful notes';
  const emailSentWhy = mode === 'phone'
    ? ' — open it at your computer ✓'
    : ' — backup is in your inbox ✓';
  const copyLabel = mode === 'phone' ? 'copy for your phone' : 'copy the setup';
  const copyWhy = mode === 'phone' ? ' — paste into the AI on your phone' : ' — paste into your agent';
  const copiedLabel = mode === 'phone'
    ? 'copied — paste into the AI on your phone'
    : 'copied — paste into your agent';

  return (
    <section className="cta-section">
      {validRef && <p className="install-invite">@{validRef} invited you to alexandria.</p>}

      <div className="act-row">
        <span className="act-num">1</span>
        <a className="door-btn act-box" href={SHORTCUT_URL} target="_blank" rel="noopener noreferrer">
          add the shortcut<span className="act-why"> — capture thoughts wherever you are</span>
        </a>
      </div>

      <div className="act-row">
        <span className="act-num">2</span>
        <form className={`door-btn act-box act-email${emailFocused ? ' is-focused' : ''}`} onSubmit={sendEmail} noValidate onClick={() => emailRef.current?.focus()}>
          {mailState === 'sent' || mailState === 'saved' ? (
            <span className="act-sent">email saved<span className="act-why">{mailState === 'saved' ? ' — delivery is delayed ✓' : emailSentWhy}</span></span>
          ) : (
            <>
              <input
                ref={emailRef}
                id="start-email"
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="your email"
                aria-label="your email"
                aria-invalid={mailState === 'invalid' || mailState === 'error'}
                data-shake={shakeKey > 0 ? 'on' : 'off'}
                className={email.trim() || emailFocused ? 'has-val' : ''}
                value={email}
                onFocus={() => setEmailFocused(true)}
                onBlur={() => setEmailFocused(false)}
                onChange={(e) => { setEmail(e.target.value); if (mailState === 'invalid' || mailState === 'error') setMailState('idle'); }}
              />
              {!email.trim() && mailState !== 'invalid' && <span className="act-why act-email-why">{emailWhy}</span>}
              {mailState === 'invalid' && <span className="act-why act-email-error">enter a real email</span>}
              {mailState === 'error' && <span className="act-why act-email-error">couldn’t save — try again</span>}
              {emailFocused && (
                <button type="submit" className="join-door-go" aria-label="save email" disabled={mailState === 'sending'} onMouseDown={(e) => e.preventDefault()}>
                  <ArrowIcon />
                </button>
              )}
            </>
          )}
        </form>
      </div>

      <div className="act-row">
        <span className="act-num">3</span>
        <button type="button" className={`door-btn act-box cta-btn${copyState === 'copied' ? ' is-copied' : ''}`} onClick={copy} aria-label={copyLabel}>
          {copyState === 'copied'
            ? copiedLabel
            : copyState === 'error'
              ? 'couldn’t copy — try again'
              : <>{copyLabel}<span className="act-why">{copyWhy}</span></>}
        </button>
      </div>
      {validRef && <p className="install-new"><Link href="/">new here? see what this is &rarr;</Link></p>}
    </section>
  );
}
