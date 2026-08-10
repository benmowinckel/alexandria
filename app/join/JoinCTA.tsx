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
          intent: 'waive',
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

      {/* The pitch (founder 2026-07-27, second pass — the first was a three-item
          feature list: "is that really the only value we provide?? that's
          nothing"). Four lines — stake, choice, compounding, timing:
            1. THE STAKE. The default outcome is homogenisation: same tools,
               same answers, same voice. Staying particular is now an active
               act. This is the frame the whole page rests on — the dollar is
               never argued on its own merits, it's what the act costs.
            2. THE CHOICE, priced. "Most people won't make it" is the point,
               not a swipe: the ones who did are who you'd be joining.
            3. THE COMPOUNDING. The collective isn't a perk on top — the
               aggregation of particular individuals is what makes each one
               better. Their systems runnable by you, your library wired into
               theirs.
            4. It's early. That's the offer, not an apology: founding member.
          Never name the category we are NOT in — saying "don't price this like
          software" puts them in it (founder 2026-07-27, "then they think about
          it"). Prose, not bullets, and short: the bulleted feature list read as
          thin, the long paragraph version as too much text. */}
      <div className="join-pitch">
        <section>
          <p className="join-beat">AI averages people by default.</p>
          <p className="join-sub">Same tools, same answers, same voice. The connector puts your loop beside people working to stay particular.</p>
        </section>
        <section>
          <p className="join-beat">Their progress can strengthen yours.</p>
          <p className="join-sub">See what they kept thinking about, how they developed it, and what they made. Use the systems that helped.</p>
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
        <form className="door-btn act-box act-email" onSubmit={sendEmail} onClick={() => emailRef.current?.focus()}>
          {mailState === 'sent' ? (
            <span className="act-sent">waived<span className="act-why"> ✓ &mdash; go on in</span></span>
          ) : (
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
          )}
        </form>

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
