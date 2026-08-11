'use client';

import { useState, useEffect, useRef } from 'react';
import { SERVER_URL } from '../lib/config';
import { ArrowIcon } from './DoorIcons';

// Radically-simple join (founder, 2026-07-25 — same law as /start and /chat):
// one hero, one primary box, two muted lines. One grammar everywhere: bold
// words — quieter words; inputs live INSIDE their boxes.
//
// 2026-07-27 rebuild. Three changes, all founder-dictated:
//  1. THE COLLECTIVE IS EXPLAINED HERE. The private onboarding block is
//     structurally silent about joining; Alexandria-owned surfaces carry the
//     whole sell. The three-line "what it is" block therefore carries the
//     weight itself: library, marketplace, people.
//  2. TWO PATHS, BOTH ARE JOINING. Not join-or-decline. Either you take the
//     free month, or you email and it's waived — you're in on both. The email
//     field posts intent:'waive' so the founder can tell a waive ASK apart from
//     a plain not-now in the waitlist source column.
//  3. NO "free tool" EXIT. It was the third box and it leaked people off the
//     page at the moment of decision; joining installs the tool anyway (the
//     welcome page hands them the one-line command, and setup.sh is idempotent).
//
// Wiring unchanged: a ref only counts once /check-kin confirms it (link ref or
// typed code, typed wins).
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
  const [urlCheck, setUrlCheck] = useState<{ input: string; valid: string | null } | null>(null);
  const [typedRef, setTypedRef] = useState('');
  const [typedCheck, setTypedCheck] = useState<{ input: string; valid: string | null } | null>(null);
  const codeRef = useRef<HTMLInputElement>(null);
  const cleanTypedRef = typedRef.replace(/[^A-Za-z0-9-]/g, '').slice(0, 39);
  const validUrlRef = urlRef && urlCheck?.input === urlRef ? urlCheck.valid : null;
  const typedValid = cleanTypedRef && typedCheck?.input === cleanTypedRef ? typedCheck.valid : null;

  const [email, setEmail] = useState('');
  const [mailState, setMailState] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [waiveJoinUrl, setWaiveJoinUrl] = useState('');
  const emailRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!urlRef) return;
    let live = true;
    (async () => {
      const ok = await checkKin(urlRef);
      if (live) setUrlCheck({ input: urlRef, valid: ok ? urlRef : null });
    })();
    return () => { live = false; };
  }, [urlRef]);

  useEffect(() => {
    if (!cleanTypedRef) return;
    let live = true;
    const t = setTimeout(async () => {
      const ok = await checkKin(cleanTypedRef);
      if (live) setTypedCheck({ input: cleanTypedRef, valid: ok ? cleanTypedRef : null });
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [cleanTypedRef]);

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
          intent: 'waive',
          ...(effectiveRef ? { ref: effectiveRef } : {}),
        }),
      });
      const result = await resp.json().catch(() => ({}));
      if (resp.ok && typeof result.join_url === 'string') {
        setWaiveJoinUrl(result.join_url);
        setMailState('sent');
      } else {
        setMailState('error');
      }
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

      {/* The collective value, reduced to the same causal shape as the private
          tool (founder 2026-08-11): better context makes AI more helpful.
          First it understands you; through consenting connections it can
          understand your community from their own words too. Library,
          marketplace, tribe, and founding status are downstream features,
          not the lead. */}
      <div className="join-pitch">
        <section>
          <p className="join-beat">Your loop helps AI understand you.</p>
          <p className="join-sub">The better it understands you, the better it can help you.</p>
        </section>
        <section>
          <p className="join-beat">The collective helps it understand your community.</p>
          <p className="join-sub">Connect the people you choose, and your AI can learn about them from their own words — not only from yours.</p>
        </section>
        <section>
          <p className="join-beat">A dollar a day connects you.</p>
          <p className="join-sub">Your loop stays free either way. Your first month is free, and membership is free for good once three friends join through you.</p>
        </section>
        <p className="join-pitch-last">Early enough that you&rsquo;d shape what this becomes.</p>
      </div>

      <a className="door-btn act-box act-primary" href={joinUrl}>
        join with github<span className="act-why act-why-inverse"> &mdash; first month free</span>
      </a>

      {/* The terms, stated once, plainly, right under the action — the page
          argues a dollar a day, so the actual deal has to be legible at the
          point of decision. */}
      <p className="join-terms">
        Your loop stays free and yours if you leave. Joining only syncs the files you
        choose to publish and records which modules your loop uses. Read the{' '}
        <a href="/privacy">privacy policy</a> and <a href="/terms">terms</a>.
      </p>

      {/* Below the hairline: the two quiet doors. The waive path lives here
          rather than beside the join button (founder 2026-07-27: keep it in
          the background, for the ones still hesitating) and its wording is
          plain rather than pointed — a person who genuinely can't spare it
          shouldn't be needled on the way in. */}
      <div className="join-exits">
        {mailState === 'sent' && waiveJoinUrl ? (
          <a className="door-btn act-box" href={waiveJoinUrl}>
            covered<span className="act-why"> ✓ &mdash; continue with github</span>
          </a>
        ) : (
          <form className="door-btn act-box act-email" onSubmit={sendEmail} onClick={() => emailRef.current?.focus()}>
            <>
              <input
                ref={emailRef}
                type="email"
                inputMode="email"
                autoComplete="email"
                placeholder="can’t afford it?"
                className="w-mail"
                aria-label="your email"
                value={email}
                onChange={(e) => { setEmail(e.target.value); if (mailState === 'error') setMailState('idle'); }}
              />
              {!email.trim() && <span className="act-why act-email-why">&mdash; email me, I&rsquo;ll cover it</span>}
              {email.trim() && (
                <button type="submit" className="join-door-go" aria-label="send" disabled={mailState === 'sending'}>
                  <ArrowIcon />
                </button>
              )}
            </>
          </form>
        )}

        <div className="door-btn act-box act-email" onClick={() => codeRef.current?.focus()}>
          {typedValid ? (
            <span className="act-sent">code applied<span className="act-why"> ✓ &mdash; @{typedValid}</span></span>
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
                className="w-code"
                aria-label="referral code"
                value={typedRef}
                onChange={(e) => setTypedRef(e.target.value)}
              />
              {!typedRef.trim() && <span className="act-why act-email-why">&mdash; from a friend of yours</span>}
            </>
          )}
        </div>
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
