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

      {/* The pitch — the homepage's free-sample frame carried to the counter
          (founder direction 2026-07-17): the tool is the sample and stays free;
          the community is the paid part, priced in throwaway money (two
          coffees, one Uber ride) so the reader's own spending habits do the
          arguing. The close is the founder's own sentence ("support the
          project, and be a founding member") — no founding-number pitch, no
          "thing" anywhere on the page (his notes, same day). Prose is
          proper-grammar per the settled Taste boundary (2026-07-01);
          lowercase stays on the marks (title, button, eyebrow). */}
      <p className="primer-lede">
        The tool is the free sample &mdash; yours forever, free either way.
        The community is the paid part: two coffees a month, one Uber ride
        ($10, and the first month is free). Think how easily you spend that.
        So just spend it &mdash; support the project, and be a founding
        member.
      </p>

      <a className="join-btn" href={joinUrl}>
        join with github
      </a>

      {/* The referral pitch — first-class, not fine print (founder note
          2026-07-17: "thats the main thing we want them to do"). The one move
          we want from every member: bring your people. Sits directly under the
          button, above the enter-a-code field so the two sides of the mechanic
          read in order: you'll GET a code; if you HAVE one, it goes here. */}
      <p className="join-referral">
        Once you&rsquo;re in, you get a referral code &mdash; when three
        friends join with it, your membership is free for good. Bring your
        people.
      </p>

      {/* Have-a-code field — subtle, for someone told a code with no ?ref= link.
          Live-validated; when valid the code rides the join URL above. */}
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

      {/* The deal — the escape hatches, quiet below: founding not joining
          (the 2026-07-09 honesty verdict, demoted here), the tool never costs
          anything, and the genuine can't-afford-it escape. The referral deal
          moved UP out of here (it's the main ask, not a caveat). The
          generosity is what makes the "just spend it" shove above fair: if
          $10 is throwaway money for you, spend it; if it genuinely isn't,
          it's waived. */}
      <p className="join-deal">
        It&rsquo;s early &mdash; you&rsquo;re not joining a finished
        community, you&rsquo;re founding one. And you&rsquo;re never paying
        for the tool &mdash; that&rsquo;s a file on your machine, free
        forever, so leaving costs nothing. If $10 is real money for you right
        now,{' '}
        <a href="mailto:benmowinckel@gmail.com?subject=waive%20it">message me</a>{' '}
        and I&rsquo;ll waive it.
      </p>

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
