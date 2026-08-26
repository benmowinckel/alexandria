'use client';

import { useState, useEffect, useRef } from 'react';
import { SERVER_URL, FOUNDER_EMAIL, FOUNDER_PROFILE_PATH } from '../lib/config';
import { checkReferral, parseReferralInput } from '../lib/referral';
import { ArrowIcon, TickIcon } from './DoorIcons';

// The private loop is complete on its own. Membership is the connector.
// Referral credit only lands after a member handle is confirmed here and
// validated again on the OAuth callback. Self-referrals and returning
// accounts never count.
function githubUrl(ref: string, refSource: string): string {
  const q = new URLSearchParams();
  if (ref) q.set('ref', ref);
  q.set('ref_source', refSource);
  return `${SERVER_URL}/auth/github?${q.toString()}`;
}

export default function JoinCTA({
  urlRef,
  refSource,
  billingStatus,
}: {
  urlRef?: string;
  refSource: string;
  billingStatus?: 'cancel' | 'refresh';
}) {
  const [urlCheck, setUrlCheck] = useState<{ input: string; valid: string | null } | null>(null);
  const [savedRef] = useState(() => {
    if (typeof window === 'undefined') return '';
    try { return parseReferralInput(window.localStorage.getItem('alexandria-referrer') || ''); }
    catch { return ''; }
  });
  const candidateUrlRef = urlRef || savedRef;
  const validUrlRef = candidateUrlRef && urlCheck?.input === candidateUrlRef ? urlCheck.valid : null;
  const [confirmedManualRef, setConfirmedManualRef] = useState('');
  const [manualRef, setManualRef] = useState('');
  const [manualCheck, setManualCheck] = useState<{ input: string; valid: string | null } | null>(null);
  const [referralFocused, setReferralFocused] = useState(false);
  const [shakeKey, setShakeKey] = useState(0);
  const referralRef = useRef<HTMLInputElement>(null);
  const cleanManualRef = parseReferralInput(manualRef);
  const manualValid = cleanManualRef && manualCheck?.input === cleanManualRef ? manualCheck.valid : null;
  const manualInvalid = !!(cleanManualRef && manualCheck?.input === cleanManualRef && !manualCheck.valid);

  useEffect(() => {
    if (!candidateUrlRef) return;
    let live = true;
    (async () => {
      const ok = await checkReferral(candidateUrlRef);
      if (live) setUrlCheck({ input: candidateUrlRef, valid: ok ? candidateUrlRef : null });
    })();
    return () => { live = false; };
  }, [candidateUrlRef]);

  useEffect(() => {
    if (!cleanManualRef) return;
    let live = true;
    const timer = setTimeout(async () => {
      const ok = await checkReferral(cleanManualRef);
      if (live) setManualCheck({ input: cleanManualRef, valid: ok ? cleanManualRef : null });
    }, 350);
    return () => { live = false; clearTimeout(timer); };
  }, [cleanManualRef]);

  const confirmManualReferral = () => {
    if (!manualValid) {
      setShakeKey((key) => key + 1);
      return;
    }
    setConfirmedManualRef(manualValid);
    setReferralFocused(false);
    try { window.localStorage.setItem('alexandria-referrer', manualValid); } catch { /* storage is optional */ }
  };

  const confirmedRef = confirmedManualRef || validUrlRef || '';
  const joinUrl = githubUrl(confirmedRef, refSource);

  return (
    <>
      <section className="join-section">
        <h1 className="join-title">join the community.</h1>

        <div className="join-argument">
          <section className="join-move">
            <h2 className="join-claim">the problem.</h2>
            <p>
              Your private loop gives every ai a deep understanding of you, but your life happens with other people. Those conversations and relationships sit outside the loop, so without a connection, each person has to carry the missing context back to their own ai by hand, again and again.
            </p>
          </section>
          <section className="join-move">
            <h2 className="join-claim">the connector.</h2>
            <p>
              Joining adds a connector that brings the private parts you choose to share together with the public parts already spread across your other networks. You decide what friends, groups, or anyone can see, creating one public home you control, like <a href={FOUNDER_PROFILE_PATH}>the founder&apos;s</a>, while everything else stays private.
            </p>
          </section>
          <section className="join-move">
            <h2 className="join-claim">the library.</h2>
            <p>
              Each loop stays entirely its own, while the shared connector lets the library link them without replacing anyone&apos;s existing networks. Your ai can understand friends and new people from what they share, their ai can understand you, and every connection makes both loops more useful.
            </p>
          </section>
        </div>

        <p className="join-close">
          Join and use it free for a month. Invite three friends as you go and it stays free while they stay. Otherwise, after the month, it is a dollar a day; if that is too much, <a href={`mailto:${FOUNDER_EMAIL}?subject=Alexandria%20membership`}>message me</a> and I will waive it.
          <span className="join-close-nudge">Use it first, then bring in the people already in your life and make each other&apos;s loops more useful.</span>
        </p>
        {billingStatus && (
          <p className="join-billing-note" role="status">
            {billingStatus === 'cancel'
              ? 'checkout closed — nothing was charged.'
              : 'your old checkout expired — start again when you are ready.'}
          </p>
        )}
        <a className="door-btn act-box act-primary" href={joinUrl}>
          join the community<span className="act-why">{'\u00a0'}— start with github</span>
        </a>

        <div className="join-referral">
          {confirmedRef ? (
            <p className="door-btn act-box act-email is-saved">
              <span className="act-sent">
                @{confirmedRef} invited you
                <span className="act-why">{'\u00a0'}— referral saved</span>
              </span>
              <span className="join-door-go is-done" aria-hidden="true">
                <TickIcon />
              </span>
            </p>
          ) : (
            <form
              className={`door-btn act-box act-email${referralFocused ? ' is-focused' : ''}`}
              onSubmit={(event) => {
                event.preventDefault();
                confirmManualReferral();
              }}
              noValidate
              onClick={() => referralRef.current?.focus()}
            >
              <input
                ref={referralRef}
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="add a referral"
                aria-label="referral github handle or invite link"
                aria-invalid={manualInvalid || undefined}
                data-shake={shakeKey > 0 ? 'on' : 'off'}
                className={cleanManualRef || referralFocused ? 'has-val' : ''}
                value={manualRef}
                onFocus={() => setReferralFocused(true)}
                onBlur={() => setReferralFocused(false)}
                onChange={(event) => setManualRef(event.target.value)}
                onPaste={(event) => {
                  const pasted = event.clipboardData.getData('text');
                  const parsed = parseReferralInput(pasted);
                  if (parsed && parsed !== pasted.trim()) {
                    event.preventDefault();
                    setManualRef(parsed);
                  }
                }}
              />
              {!cleanManualRef && !manualInvalid && (
                <span className="act-why act-email-why">{'\u00a0'}— paste a handle or invite</span>
              )}
              {manualInvalid && <span className="act-why act-email-error" role="status">that is not a member</span>}
              {referralFocused && (
                <button
                  type="submit"
                  className="join-door-go"
                  aria-label="confirm referral"
                  onMouseDown={(event) => event.preventDefault()}
                >
                  <ArrowIcon />
                </button>
              )}
            </form>
          )}
        </div>

      </section>
    </>
  );
}
