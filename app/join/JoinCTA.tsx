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

      {/* HERO — the frame line is the star (design.md: one star per page,
          semantic ≠ visual). Large editorial display carries the whole pitch
          in one breath; the old "become a founding member" H1 is dropped so
          the top isn't three same-weight lines stacked (founder 2026-07-17:
          "all roughly the same… boring… draw attention to the right places").
          His copy is verbatim — this is a LAYOUT/hierarchy pass, not a rewrite.
          His open slot ("the full product (or dish, or something idk)") stays
          "the full meal", completing the supermarket-sample frame. */}
      <h1 className="join-hero">
        The tool was the free sample &mdash; the community is the full meal.
      </h1>

      {/* THE OFFER — the two simple facts, plain ink, no colour (founder
          2026-07-17: "no colours like that… too loud… really simple"). The
          reader's whole decision is here: it's free, just try it. */}
      <div className="join-offer">
        <p className="join-offer-line">
          The first month is free, so just try it &mdash; cancel anytime.
        </p>
        <p className="join-offer-line">
          If you like it, get three friends to join, and it becomes free
          indefinitely.
        </p>
      </div>

      <a className="join-btn" href={joinUrl}>
        join with github
      </a>

      {/* THE $10 TRUTH — de-emphasised reassurance for the worried reader (his
          copy verbatim). Sits below the action, quieter, so it never competes
          with the hero or the button. */}
      <p className="join-explain">
        After the month, if you haven&rsquo;t found three friends, it&rsquo;s
        $10 a month. Now, before you get yourself worked up &mdash;
        that&rsquo;s the same as two coffees a month, one Uber ride, or even
        a package delivery charge. So don&rsquo;t be a penny pincher! A
        dollar there is the same as a dollar here, but at least here
        you&rsquo;re supporting our project and trying to help people out.
      </p>
      <p className="join-waive">
        And if you don&rsquo;t have any friends and don&rsquo;t have ten
        dollars,{' '}
        <a href="mailto:benmowinckel@gmail.com?subject=waive%20it">message me</a>{' '}
        and I&rsquo;ll waive it for you &mdash; I just want people to keep
        thinking, together.
      </p>

      {/* THE OTHER DOORS — his three questions as a quiet trio under one
          hairline, each an exit for a different reader. Editorial underline
          inputs (not boxes) keep it light and simple to navigate. Autofill
          fix: the referral field no longer says "username" anywhere the
          browser reads (that word triggered Safari's saved-password heuristic
          → localhost login autofill); autoComplete off + password-manager
          ignore attrs seal it. */}
      <div className="join-doors">
        <div className="join-door">
          <label className="join-door-q" htmlFor="join-code-input">
            been referred by a friend?
          </label>
          <div className="join-door-field">
            <input
              id="join-code-input"
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
              placeholder="referral code"
              aria-label="referral code"
              value={typedRef}
              onChange={(e) => setTypedRef(e.target.value)}
            />
            {typedRef.trim() && (
              <span className="join-door-status" aria-live="polite">
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
          <p className="join-door-hint">you&rsquo;ll get your own after joining.</p>
        </div>

        <JoinInterest refCode={effectiveRef || undefined} />

        <p className="join-door join-door-link">
          Don&rsquo;t have the free tool yet?{' '}
          {/* Forward the validated ref so an invited visitor who takes the
              free door still credits their inviter as kin on install. */}
          <Link href={effectiveRef ? `/start?ref=${effectiveRef}` : '/start'}>install it</Link>{' '}
          &mdash; it&rsquo;ll bring you back here after.
        </p>
      </div>
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
