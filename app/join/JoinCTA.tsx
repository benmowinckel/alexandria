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
  const [initialRefRemoved, setInitialRefRemoved] = useState(false);
  const candidateUrlRef = initialRefRemoved ? '' : (urlRef || savedRef);
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

  const removeReferral = () => {
    setInitialRefRemoved(true);
    setConfirmedManualRef('');
    setManualRef('');
    setManualCheck(null);
    try { window.localStorage.removeItem('alexandria-referrer'); } catch { /* storage is optional */ }

    const nextUrl = new URL(window.location.href);
    nextUrl.searchParams.delete('ref');
    nextUrl.searchParams.delete('ref_source');
    window.history.replaceState(
      window.history.state,
      '',
      `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`,
    );
  };

  return (
    <>
      <section className="join-section">
        <h1 className="join-title">join the community.</h1>

        <div className="join-argument">
          <section className="join-move">
            <h2 className="join-claim">the problem.</h2>
            <p>
              Your private loop lets every ai understand you deeply. But your life happens with other people, and each ai knows only one side. Your own personal website can show who you are, but on its own it is still an island.
            </p>
          </section>
          <section className="join-move">
            <h2 className="join-claim">the connector.</h2>
            <p>
              Your own personal website stays your home. Put one Alexandria link on it. That link gives people and their ais the public context you approved, while Alexandria handles identity, permissions, discovery, and payments. A personal language model can answer from that context, giving your public footprint the depth of your private mirror without exposing the private files. Until you build your site, your Library page is the complete starting point, like <a href={FOUNDER_PROFILE_PATH} target="_blank" rel="noopener noreferrer">the founder&apos;s</a>.
            </p>
          </section>
          <section className="join-move">
            <h2 className="join-claim">the library.</h2>
            <p>
              Every member&apos;s personal website points into the same Library. Without that shared thread, every pair of people would need a separate connection. When people in your life build their own mirrors and publish what they choose, your ai understands them from their context and theirs understands you from yours. Alexandria connects the mirrors, but nobody can build one for somebody else. The people who choose to do the work become unusually easy for other people and ais to understand.
            </p>
          </section>
        </div>

        <p className="join-close">
          The loop and skill are free. You pay only for the shared connection. Try it free for a month. Invite three friends and it stays free while they stay, because their mirrors make your loop more useful. Otherwise, it is a dollar a day. If that is too much, <a href={`mailto:${FOUNDER_EMAIL}?subject=Alexandria%20membership`}>message me</a> and I will cover it.
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
            <div className="door-btn act-box act-email is-saved">
              <span className="act-sent">
                @{confirmedRef} invited you
                <span className="act-why">{'\u00a0'}— referral saved</span>
              </span>
              <span className="join-referral-state">
                <span className="join-door-go is-done join-referral-tick" aria-hidden="true">
                  <TickIcon />
                </span>
                <button
                  type="button"
                  className="join-referral-remove"
                  aria-label={`remove @${confirmedRef} referral`}
                  onClick={removeReferral}
                >
                  ×
                </button>
              </span>
            </div>
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
