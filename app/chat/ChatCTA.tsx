'use client';

import { useRef, useState } from 'react';
import { SERVER_URL } from '../lib/config';
import { ArrowIcon } from '../join/DoorIcons';

export default function ChatCTA({ bootstrap }: { bootstrap: string }) {
  const [email, setEmail] = useState('');
  const [emailFocused, setEmailFocused] = useState(false);
  const [mailState, setMailState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [copied, setCopied] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const emailRef = useRef<HTMLInputElement>(null);

  async function sendEmail(e: React.FormEvent) {
    e.preventDefault();
    if (mailState === 'sending') return;
    const trimmed = email.trim();
    if (!trimmed || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed)) {
      setShakeKey((key) => key + 1);
      return;
    }
    setMailState('sending');
    try {
      const response = await fetch(`${SERVER_URL}/onboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: trimmed }),
      });
      setMailState(response.ok ? 'sent' : 'error');
    } catch {
      setMailState('error');
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(bootstrap);
      setCopied(true);
      setTimeout(() => setCopied(false), 4000);
    } catch {}
  }

  return (
    <section className="cta-section">
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
                onChange={(event) => { setEmail(event.target.value); if (mailState === 'error') setMailState('idle'); }}
              />
              {!email.trim() && <span className="act-why act-email-why"> — so this doesn’t get lost</span>}
              {emailFocused && (
                <button
                  type="submit"
                  className="join-door-go"
                  aria-label={mailState === 'error' ? 'retry' : 'submit email'}
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
        <span className="act-num">2</span>
        <button type="button" className={`door-btn act-box cta-btn${copied ? ' is-copied' : ''}`} onClick={copy} aria-label="copy the setup">
          {copied ? 'copied — paste it into any chat' : 'copy the setup — paste it into any chat'}
        </button>
      </div>

      <div className="act-row">
        <span className="act-num">3</span>
        <div className="door-btn act-box">type a<span className="act-why"> — start your first thinking session</span></div>
      </div>
    </section>
  );
}
