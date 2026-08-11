'use client';

import { useState, useRef } from 'react';
import { SERVER_URL } from '../lib/config';
import { ArrowIcon } from '../join/DoorIcons';

// Chat door: email → copy. No shortcut — nothing pulls the iCloud pile until
// they have a real loop (/start). Paste goes into any ordinary chat.
export default function ChatCTA({ bootstrap }: { bootstrap: string }) {
  const [copied, setCopied] = useState(false);
  const [email, setEmail] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const emailRef = useRef<HTMLInputElement>(null);
  const [mailState, setMailState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [shakeKey, setShakeKey] = useState(0);

  async function copy() {
    try {
      await navigator.clipboard.writeText(bootstrap);
      setCopied(true);
      setTimeout(() => setCopied(false), 4000);
    } catch {}
  }

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
        body: JSON.stringify({ email: email.trim() }),
      });
      setMailState(resp.ok ? 'sent' : 'error');
    } catch {
      setMailState('error');
    }
  };

  return (
    <div className="cta-section">
      <div className="act-row">
        <span className="act-num">1</span>
        <form
          className={`door-btn act-box act-email${emailFocused ? ' is-focused' : ''}`}
          onSubmit={sendEmail}
          onClick={() => emailRef.current?.focus()}
        >
          {mailState === 'sent' ? (
            <span className="act-sent">sent<span className="act-why"> ✓</span></span>
          ) : (
            <>
              <input
                ref={emailRef}
                id="chat-later-email"
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
              {!email.trim() && (
                <span className="act-why act-email-why"> — so this doesn’t get lost</span>
              )}
              {emailFocused && (
                <button
                  type="submit"
                  className="join-door-go"
                  aria-label={mailState === 'error' ? 'retry' : 'submit email'}
                  disabled={mailState === 'sending'}
                  onMouseDown={(e) => e.preventDefault()}
                >
                  <ArrowIcon />
                </button>
              )}
            </>
          )}
        </form>
      </div>

      <div className="act-row">
        <span className="act-num">2</span>
        <button
          type="button"
          className={`door-btn act-box cta-btn${copied ? ' is-copied' : ''}`}
          onClick={copy}
          aria-label="copy the setup"
        >
          {copied
            ? 'copied — paste it into any chat'
            : (<>copy the setup<span className="act-why"> — paste it into any chat</span></>)}
        </button>
      </div>
    </div>
  );
}
