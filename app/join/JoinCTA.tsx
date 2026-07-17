'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SERVER_URL } from '../lib/config';
import JoinInterest from './JoinInterest';

// The interactive join cluster — eyebrow through decline path. Owns the one
// piece of client state the page turns on: the VALIDATED referral code. A ref
// only counts once /check-kin confirms it's a real member login; until then the
// eyebrow stays generic and the code never rides the OAuth URL.
//
// Two ways a ref arrives: (1) the invite link /join?ref=LOGIN (urlRef, passed
// down sanitised from the server), or (2) typed into the "have a referral code?"
// field by someone who was told a code but has no link. Both flow through the
// same validation and, once valid, credit the inviter as kin through OAuth.
//
// This lifts the eyebrow + button into a client component so the invalid-ref
// display bug can't recur: the eyebrow reads the SAME validated state the button
// does, so a fake/typo ref shows neither the invite eyebrow nor a tagged URL.
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
  // The code from the invite link, once validated (null = none/invalid).
  const [validUrlRef, setValidUrlRef] = useState<string | null>(null);
  // The code typed into the field, once validated.
  const [typedRef, setTypedRef] = useState('');
  const [typedValid, setTypedValid] = useState<string | null>(null);
  const [typedState, setTypedState] = useState<'idle' | 'checking' | 'invalid'>('idle');

  // Validate the URL ref once on mount (and if it changes).
  useEffect(() => {
    if (!urlRef) { setValidUrlRef(null); return; }
    let live = true;
    (async () => {
      const ok = await checkKin(urlRef);
      if (live) setValidUrlRef(ok ? urlRef : null);
    })();
    return () => { live = false; };
  }, [urlRef]);

  // Live-validate the typed code (debounced). A typed code only overrides the
  // link ref once it validates; whitespace/case is normalised to a login shape.
  useEffect(() => {
    const clean = typedRef.replace(/[^A-Za-z0-9-]/g, '').slice(0, 39);
    if (!clean) { setTypedValid(null); setTypedState('idle'); return; }
    let live = true;
    setTypedState('checking');
    const t = setTimeout(async () => {
      const ok = await checkKin(clean);
      if (!live) return;
      setTypedValid(ok ? clean : null);
      setTypedState(ok ? 'idle' : 'invalid');
    }, 350);
    return () => { live = false; clearTimeout(t); };
  }, [typedRef]);

  // The typed code wins if valid (someone actively entered it); else the link ref.
  const effectiveRef = typedValid || validUrlRef || '';
  const joinUrl = githubUrl(effectiveRef, refSource);

  return (
    <>
      {validUrlRef ? (
        <p className="join-invite">@{validUrlRef} invited you in.</p>
      ) : (
        <p className="primer-eyebrow">the community</p>
      )}

      <h1 className="primer-h1">become a founding member.</h1>

      {/* Above the button: two lines only (founder note 2026-07-17, "wall of
          text… just have them click, and the explanation is under"). The
          click costs nothing — first month free — so that's all the reader
          needs before clicking; the rest of the deal explains itself below,
          consolidated to two short paragraphs in his voice. */}
      <p className="primer-lede">
        The tool is the free sample. This is the community around it.
      </p>

      <p className="join-line">
        The first month is free &mdash; cancel anytime, just try it and see
        how you like it.
      </p>

      <a className="join-btn" href={joinUrl}>
        join with github
      </a>

      {/* The explanation, under the click (his dictation, consolidated):
          friends → free while they're on; otherwise $10, a tiny decision;
          then the appeal + waive merged into one quieter paragraph. */}
      <p className="join-explain">
        Then get your friends on it: if three join with your code, yours is
        free for as long as they&rsquo;re on. Otherwise it&rsquo;s $10 a
        month &mdash; don&rsquo;t overthink the 10. One Uber ride, two
        coffees, a package delivery charge.
      </p>
      <p className="join-waive">
        This is my project &mdash; we want as many people thinking as
        possible. So please don&rsquo;t decide this is where you start being
        a penny pincher; but if $10 is genuinely difficult and the three
        friends aren&rsquo;t happening,{' '}
        <a href="mailto:benmowinckel@gmail.com?subject=waive%20it">message me</a>{' '}
        and I&rsquo;ll waive it.
      </p>

      {/* The fine print — everything that isn't the deal, grouped under one
          hairline like /start's details zone: tool-free-forever, the
          founding-bet honesty (2026-07-09 verdict, kept), and the
          have-a-code field for someone told a code with no ?ref= link
          (live-validated; when valid the code rides the join URL above). */}
      <div className="join-details">
        <p>
          You&rsquo;re never paying for the tool &mdash; that&rsquo;s yours,
          free forever. And it&rsquo;s early: you&rsquo;re founding the
          community, not joining it finished.
        </p>
        <div className="join-code">
          <label className="join-code-label" htmlFor="join-code-input">
            have a referral code?
          </label>
          <div className="join-code-row">
            <input
              id="join-code-input"
              type="text"
              inputMode="text"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              placeholder="their github username"
              aria-label="referral code (a github username)"
              value={typedRef}
              onChange={(e) => setTypedRef(e.target.value)}
            />
            {typedRef.trim() && (
              <span className="join-code-status" aria-live="polite">
                {typedState === 'checking'
                  ? 'checking…'
                  : typedValid
                    ? 'applied ✓'
                    : typedState === 'invalid'
                      ? 'not found'
                      : ''}
              </span>
            )}
          </div>
        </div>
      </div>

      <JoinInterest refCode={effectiveRef || undefined} />

      <p className="join-secondary">
        Here for the free tool? You don&rsquo;t need this &mdash;{' '}
        {/* Forward the validated ref so an invited visitor who takes the
            free door still credits their inviter as kin on install. */}
        <Link href={effectiveRef ? `/start?ref=${effectiveRef}` : '/start'}>install it in one line</Link>.
      </p>
    </>
  );
}

// One-shot kin-code check against the public /check-kin endpoint (GET
// ?code=LOGIN → { valid: boolean }, cached 60s server-side). Any failure =
// not valid, so a network blip never credits an unverified inviter.
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
