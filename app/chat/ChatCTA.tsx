'use client';

import { useEffect, useRef, useState } from 'react';
import { SERVER_URL, SHORTCUT_URL } from '../lib/config';
import { checkReferral } from '../lib/referral';
import { ArrowIcon } from '../join/DoorIcons';
import { chatInstallPrompt, CHAT_HOSTS, type ChatHost } from '../../shared/onboarding-prompts';

export default function ChatCTA({
  refCode,
  host,
}: {
  refCode?: string;
  host: ChatHost;
}) {
  const [email, setEmail] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [mailState, setMailState] = useState<'idle' | 'sending' | 'sent' | 'saved' | 'invalid' | 'error'>('idle');
  const [copyState, setCopyState] = useState<'idle' | 'copied' | 'error'>('idle');
  const [shakeKey, setShakeKey] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);
  const [refCheck, setRefCheck] = useState<{ input: string; valid: string | null } | null>(null);
  const [onIphone, setOnIphone] = useState(false);
  const validRef = refCode && refCheck?.input === refCode ? refCheck.valid : null;
  const guide = CHAT_HOSTS[host];
  const pastePath = guide.pastePath;
  const typeANum = guide.driveWhy ? '5' : '4';

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

  useEffect(() => {
    setOnIphone(/iPhone|iPad|iPod/i.test(navigator.userAgent));
  }, []);

  async function sendEmail(e: React.FormEvent) {
    e.preventDefault();
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
        body: JSON.stringify({ email: trimmed, source: 'start', mode: 'chat', host, ...(validRef ? { ref: validRef } : {}) }),
      });
      const result = await response.json().catch(() => ({}));
      setMailState(response.ok ? (result.delivered === false ? 'saved' : 'sent') : 'error');
    } catch {
      setMailState('error');
    }
  }

  async function copy() {
    let copied = false;
    try {
      await navigator.clipboard.writeText(chatInstallPrompt());
      copied = true;
    } catch {
      const area = document.createElement('textarea');
      area.value = chatInstallPrompt();
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { copied = document.execCommand('copy'); } catch { /* noop */ }
      document.body.removeChild(area);
    }
    setCopyState(copied ? 'copied' : 'error');
    setTimeout(() => setCopyState('idle'), 4000);
  }

  return (
    <section className="cta-section">
      <div className="act-row">
        <span className="act-num">1</span>
        <a
          className="door-btn act-box"
          href={onIphone ? SHORTCUT_URL : '/shortcut'}
          {...(onIphone ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
        >
          add the shortcut<span className="act-why"> — capture now for the full version</span>
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
            <span className="act-sent">email saved<span className="act-why">{mailState === 'saved' ? ' — delivery is delayed ✓' : ' — setup help is on its way ✓'}</span></span>
          ) : (
            <>
              <input
                ref={emailRef}
                id="chat-email"
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
                onChange={(event) => { setEmail(event.target.value); if (mailState === 'invalid' || mailState === 'error') setMailState('idle'); }}
              />
              {!email.trim() && mailState !== 'invalid' && <span className="act-why act-email-why"> — we’ll send your setup, then occasional useful notes</span>}
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
        <button type="button" className={`door-btn act-box cta-btn${copyState === 'copied' ? ' is-copied' : ''}`} onClick={copy} aria-label="copy the instructions">
          {copyState === 'copied'
            ? <>copied — paste into<span className="act-rest">{pastePath}</span></>
            : copyState === 'error'
              ? 'couldn’t copy — try again'
              : <>copy the instructions — paste into<span className="act-rest">{pastePath}</span></>}
        </button>
      </div>

      {guide.driveWhy && (
        <div className="act-row">
          <span className="act-num">4</span>
          <p className="door-btn act-box is-note">
            connect google drive<span className="act-why"> — {guide.driveWhy}</span>
          </p>
        </div>
      )}

      <div className="act-row">
        <span className="act-num">{typeANum}</span>
        <p className="door-btn act-box is-note">
          type a in a new chat<span className="act-why"> — start your first session</span>
        </p>
      </div>
    </section>
  );
}
