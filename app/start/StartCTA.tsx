'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { SERVER_URL } from '../lib/config';
import { checkReferral } from '../lib/referral';
import { copyText, type CopyState } from '../lib/copy-text';
import { ArrowIcon } from '../join/DoorIcons';
import { agentReminderPrompt, agentSetupPrompt } from '../../shared/onboarding-prompts';

type MailState = 'idle' | 'sending' | 'sent' | 'saved' | 'invalid' | 'error';

export default function StartCTA({
  refCode,
  mode,
}: {
  refCode?: string;
  mode: 'computer' | 'later';
}) {
  const [copyState, setCopyState] = useState<CopyState>('idle');
  const [email, setEmail] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [mailState, setMailState] = useState<MailState>('idle');
  const [shakeKey, setShakeKey] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);
  const [refCheck, setRefCheck] = useState<{ input: string; valid: string | null } | null>(null);
  const validRef = refCode && refCheck?.input === refCode ? refCheck.valid : null;

  useEffect(() => {
    if (!refCode) return;
    let live = true;
    checkReferral(refCode)
      .then((valid) => { if (live) setRefCheck({ input: refCode, valid: valid ? refCode : null }); });
    return () => { live = false; };
  }, [refCode]);

  useEffect(() => {
    if (!validRef) return;
    try { window.localStorage.setItem('alexandria-referrer', validRef); } catch { /* storage is optional */ }
  }, [validRef]);

  async function copySetup() {
    setCopyState(await copyText(mode === 'later' ? agentReminderPrompt() : agentSetupPrompt()));
    setTimeout(() => setCopyState('idle'), 4000);
  }

  async function sendEmail(event: React.FormEvent) {
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
        body: JSON.stringify({
          email: trimmed,
          source: 'start',
          mode: mode === 'later' ? 'agent-phone' : 'agent-computer',
          ...(validRef ? { ref: validRef } : {}),
        }),
      });
      const result = await response.json().catch(() => ({}));
      setMailState(response.ok ? (result.delivered === false ? 'saved' : 'sent') : 'error');
    } catch {
      setMailState('error');
    }
  }

  return (
    <section className="cta-section">
      {validRef && <p className="install-invite">@{validRef} invited you to alexandria.</p>}

      <div className="act-row">
        <span className="act-num">1</span>
        <a
          className="door-btn act-box shortcut-add"
          href="/shortcut"
          target="_blank"
          rel="noopener noreferrer"
        >
          add the shortcut<span className="act-why"> — save anything worth thinking about</span>
        </a>
      </div>

      <div className="act-row">
        <span className="act-num">2</span>
        <form
          className={`door-btn act-box act-email${emailFocused ? ' is-focused' : ''}`}
          onSubmit={sendEmail}
          noValidate
          onClick={() => emailRef.current?.focus()}
        >
          {mailState === 'sent' || mailState === 'saved' ? (
            <span className="act-sent">
              email saved<span className="act-why">{mailState === 'saved' ? ' — delivery is delayed ✓' : ' ✓'}</span>
            </span>
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
                onChange={(event) => {
                  setEmail(event.target.value);
                  if (mailState === 'invalid' || mailState === 'error') setMailState('idle');
                }}
              />
              {!email.trim() && mailState !== 'invalid' && (
                <span className="act-why act-email-why"> — get the setup text and ask me anything anytime</span>
              )}
              {mailState === 'invalid' && <span className="act-why act-email-error">enter a real email</span>}
              {mailState === 'error' && <span className="act-why act-email-error">couldn’t save — try again</span>}
              {emailFocused && (
                <button
                  type="submit"
                  className="join-door-go"
                  aria-label="save email"
                  disabled={mailState === 'sending'}
                  onMouseDown={(event) => event.preventDefault()}
                >
                  <ArrowIcon />
                </button>
              )}
            </>
          )}
        </form>
      </div>

      <div className="act-row">
        <span className="act-num">3</span>
        <button
          type="button"
          className={`door-btn act-box cta-btn setup-copy${copyState === 'copied' ? ' is-copied' : ''}`}
          onClick={copySetup}
          aria-label={mode === 'later' ? 'copy the reminder' : 'copy the setup'}
        >
          {copyState === 'copied'
            ? <>
                copied<span className="act-why"> — paste into {mode === 'later' ? 'your mobile agent' : 'your computer agent'}</span>
              </>
            : copyState === 'error'
              ? 'couldn’t copy — try again'
              : <>
                  {mode === 'later' ? 'copy the reminder' : 'copy the setup'}
                  <span className="act-why"> — paste into {mode === 'later' ? 'your mobile agent' : 'your computer agent'}</span>
                </>}
        </button>
      </div>

      {validRef && (
        <p className="install-new"><Link href="/">new here? see what this is</Link></p>
      )}
    </section>
  );
}
