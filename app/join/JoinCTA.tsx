'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { SERVER_URL } from '../lib/config';
import { ArrowIcon, TickIcon } from './DoorIcons';

const REF_GHOST = 'referral code';

// Radically-simple join (founder, 2026-07-25 — same law as /start and /chat):
// one hero, one primary box, two muted lines, three exit boxes. One grammar
// everywhere: bold words — quieter words; inputs live INSIDE their boxes.
// The founder-dictated $10 copy (2026-07-17) is compressed, not discarded:
// "two coffees" and "keep thinking, together" carry its soul in two lines.
//
// Wiring unchanged: a ref only counts once /check-kin confirms it (link ref or
// typed code, typed wins); the decline email posts /onboard source:'join' with
// kin attribution preserved.
function githubUrl(ref: string, refSource: string): string {
  const q = new URLSearchParams();
  if (ref) q.set('ref', ref);
  q.set('ref_source', refSource);
  return `${SERVER_URL}/auth/github?${q.toString()}`;
}

export default function JoinCTA({
  urlRef,
  refSource,
}: {
  urlRef?: string;
  refSource: string;
}) {
  const [validUrlRef, setValidUrlRef] = useState<string | null>(null);
  const [typedRef, setTypedRef] = useState('');
  const [typedValid, setTypedValid] = useState<string | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);

  const [email, setEmail] = useState('');
  const [mailState, setMailState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!urlRef) { setValidUrlRef(null); return; }
    let live = true;
    (async () => {
      const ok = await checkKin(urlRef);
      if (live) setValidUrlRef(ok ? urlRef : null);
    })();
    return () => { live = false; };
  }, [urlRef]);

  useEffect(() => {
    const clean = typedRef.replace(/[^A-Za-z0-9-]/g, '').slice(0, 39);
    if (!clean) { setTypedValid(null); return; }
    let live = true;
    const t = setTimeout(async () => {
      const ok = await checkKin(clean);
      if (live) setTypedValid(ok ? clean : null);
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [typedRef]);

  const effectiveRef = typedValid || validUrlRef || '';
  const joinUrl = githubUrl(effectiveRef, refSource);

  const sendEmail = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.includes('@') || mailState === 'sending') return;
    setMailState('sending');
    try {
      const resp = await fetch(`${SERVER_URL}/onboard`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: email.trim(),
          source: 'join',
          ...(effectiveRef ? { ref: effectiveRef } : {}),
        }),
      });
      setMailState(resp.ok ? 'sent' : 'error');
    } catch {
      setMailState('error');
    }
  };

  return (
    <>
      {validUrlRef && <p className="join-invite">@{validUrlRef} invited you in.</p>}

      <h1 className="join-hero">
        Keep thinking, together.
      </h1>

      <a className="door-btn act-box act-primary" href={joinUrl}>
        join with github<span className="act-why act-why-inverse"> — first month free</span>
      </a>

      <p className="join-terms">
        free for a month &middot; free with three friends on &middot; then 33&cent; a day, cancel anytime.
      </p>
      <p className="join-terms">
        still too much? message me &mdash; I&rsquo;ll waive it. the only no left is not wanting it free.
      </p>

      <div className="join-exits">
        <div className="door-btn act-box act-email" onClick={() => codeRef.current?.focus()}>
          {typedValid ? (
            <span className="act-sent">code applied<span className="act-why"> ✓ — @{typedValid}</span></span>
          ) : (
            <>
              <input
                ref={codeRef}
                type="text"
                inputMode="text"
                name="alexandria-referral"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                data-1p-ignore="true"
                data-lpignore="true"
                data-form-type="other"
                placeholder="have a code?"
                style={{ width: '6.5em' }}
                aria-label="referral code"
                value={typedRef}
                onChange={(e) => setTypedRef(e.target.value)}
              />
              {!typedRef.trim() && <span className="act-why act-email-why"> — from a friend</span>}
            </>
          )}
        </div>

        <form className="door-btn act-box act-email" onSubmit={sendEmail} onClick={() => emailRef.current?.focus()}>
          {mailState === 'sent' ? (
            <span className="act-sent">sent<span className="act-why"> ✓ — we&rsquo;ll be in touch</span></span>
          ) : (
            <>
              <input
                ref={emailRef}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="not joining yet?"
                style={{ width: '8.2em' }}
                aria-label="your email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (mailState === 'error') setMailState('idle'); }}
              />
              {!email.trim() && <span className="act-why act-email-why"> — leave your email</span>}
              {email.trim() && (
                <button type="submit" className="join-door-go" aria-label="send" disabled={mailState === 'sending'}>
                  <ArrowIcon />
                </button>
              )}
            </>
          )}
        </form>

        <Link className="door-btn act-box" href={effectiveRef ? `/start?ref=${effectiveRef}` : '/start'}>
          the free tool<span className="act-why"> — if you don&rsquo;t have it yet</span>
        </Link>
      </div>
    </>
  );
}

async function checkKin(code: string): Promise<boolean> {
  try {
    const resp = await fetch(`${SERVER_URL}/check-kin?code=${encodeURIComponent(code)}`);
    if (!resp.ok) return false;
    const data = await resp.json().catch(() => ({ valid: false }));
    return data.valid === true;
  } catch {
    return false;
  }
}
