'use client';

import { useState, useEffect, useRef } from 'react';
import { SERVER_URL, FOUNDER_EMAIL } from '../lib/config';
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
            <h2 className="join-claim">other minds.</h2>
            <p>
              Your ai can understand you deeply, but you did not become yourself alone. The friends you trust, the work you read, and the ideas you follow are part of who you are. The community gives them all a place your ai can understand too, beyond what it could learn from your private files alone.
            </p>
          </section>
          <section className="join-move">
            <h2 className="join-claim">the community.</h2>
            <p>
              Members can share a public version of themselves containing only what they choose. Your ai can then understand your friends, discover other people&apos;s work and methods, and bring context from the people around you into your own life, while everyone&apos;s private files remain completely theirs.
            </p>
          </section>
          <section className="join-move">
            <h2 className="join-claim">build together.</h2>
            <p>
              Alexandria is new, so this is the smallest the network will ever be. Its value starts with the friends you already think, learn, and live with. Each person makes every connected loop more useful, and together the first members build something no one could build alone, for everyone who joins after us.
            </p>
          </section>
        </div>

        <p className="join-close">
          Try it free for a month. Bring three active friends and it stays free. Otherwise, it is a dollar a day. If that is too much and you have not found three friends, <a href={`mailto:${FOUNDER_EMAIL}?subject=Alexandria%20membership`}>message me</a> and I will waive it. I just want you to try it.
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
