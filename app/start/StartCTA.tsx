'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SERVER_URL, SHORTCUT_URL } from '../lib/config';
import { checkReferral } from '../lib/referral';
import { ArrowIcon } from '../join/DoorIcons';
import {
  CHAT_HOSTS,
  CHAT_INSTRUCTION,
  computerInstallPrompt,
  mobileHandoffPrompt,
  type ChatHost,
} from '../../shared/onboarding-prompts';

type CopyState = 'idle' | 'copied' | 'error';

export default function StartCTA({ refCode, mode, host }: { refCode?: string; mode: 'computer' | 'phone'; host?: ChatHost }) {
  const [setupCopyState, setSetupCopyState] = useState<CopyState>('idle');
  const [instructionCopyState, setInstructionCopyState] = useState<CopyState>('idle');
  const [email, setEmail] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [mailState, setMailState] = useState<'idle' | 'sending' | 'sent' | 'saved' | 'invalid' | 'error'>('idle');
  const [shakeKey, setShakeKey] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);
  const [refCheck, setRefCheck] = useState<{ input: string; valid: string | null } | null>(null);
  const validRef = refCode && refCheck?.input === refCode ? refCheck.valid : null;

  useEffect(() => {
    if (!validRef) return;
    try { window.localStorage.setItem('alexandria-referrer', validRef); } catch { /* storage is optional */ }
  }, [validRef]);

  useEffect(() => {
    if (!refCode) return;
    let live = true;
    checkReferral(refCode)
      .then((valid) => { if (live) setRefCheck({ input: refCode, valid: valid ? refCode : null }); });
    return () => { live = false; };
  }, [refCode]);

  const phoneGuide = mode === 'phone' && host ? CHAT_HOSTS[host] : null;

  const copy = async (text: string, setState: (state: CopyState) => void) => {
    let success = false;
    try {
      await navigator.clipboard.writeText(text);
      success = true;
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { success = document.execCommand('copy'); } catch { /* noop */ }
      document.body.removeChild(area);
    }
    setState(success ? 'copied' : 'error');
    setTimeout(() => setState('idle'), 4000);
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

  const emailWhy = ' — setup and notes';
  const emailSentWhy = mode === 'phone'
    ? ' — open it at your computer ✓'
    : ' — backup is in your inbox ✓';
  const copyLabel = 'copy the setup';
  const copyWhy = ' — paste into your agent';
  const copiedLabel = mode === 'phone' ? 'copied' : 'copied — paste into your agent';
  const phoneCopyWhy = ' — paste in a normal chat';

  return (
    <section className="cta-section">
      {validRef && <p className="install-invite">@{validRef} invited you to alexandria.</p>}

      <div className="act-row">
        <span className="act-num">1</span>
        <a
          className="door-btn act-box"
          href={mode === 'phone' ? SHORTCUT_URL : '/shortcut'}
          {...(mode === 'phone' ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
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

      {phoneGuide && (
        <>
          <div className="act-row">
            <span className="act-num">3</span>
            <button
              type="button"
              className={`door-btn act-box cta-btn${instructionCopyState === 'copied' ? ' is-copied' : ''}`}
              onClick={() => copy(CHAT_INSTRUCTION, setInstructionCopyState)}
              aria-label="copy the alexandria instructions"
            >
              {instructionCopyState === 'copied'
                ? <>copied<span className="act-rest">paste in {phoneGuide.phonePastePath}</span></>
                : instructionCopyState === 'error'
                  ? 'couldn’t copy — try again'
                  : <>copy the alexandria instructions<span className="act-rest">paste in {phoneGuide.phonePastePath}</span></>}
            </button>
          </div>

          <div className="act-row">
            <span className="act-num">4</span>
            <button
              type="button"
              className={`door-btn act-box cta-btn setup-copy${setupCopyState === 'copied' ? ' is-copied' : ''}`}
              onClick={() => copy(mobileHandoffPrompt(), setSetupCopyState)}
              aria-label={copyLabel}
            >
              {setupCopyState === 'copied'
                ? <>{copiedLabel}<span className="act-why">{phoneCopyWhy}</span></>
                : setupCopyState === 'error'
                  ? 'couldn’t copy — try again'
                  : <>{copyLabel}<span className="act-why">{phoneCopyWhy}</span></>}
            </button>
          </div>

          <div className="act-row">
            <span className="act-num">5</span>
            <p className="door-btn act-box is-note">
              start an alexandria session in a new chat<span className="act-why"> — use this host's native skill</span>
            </p>
          </div>
        </>
      )}
      {!phoneGuide && (
        <div className="act-row">
          <span className="act-num">3</span>
          <button
            type="button"
            className={`door-btn act-box cta-btn setup-copy${setupCopyState === 'copied' ? ' is-copied' : ''}`}
            onClick={() => copy(computerInstallPrompt(), setSetupCopyState)}
            aria-label={copyLabel}
          >
            {setupCopyState === 'copied'
              ? copiedLabel
              : setupCopyState === 'error'
                ? 'couldn’t copy — try again'
                : <>{copyLabel}<span className="act-why">{copyWhy}</span></>}
          </button>
        </div>
      )}
      {validRef && <p className="install-new"><Link href="/">new here? see what this is &rarr;</Link></p>}
    </section>
  );
}
