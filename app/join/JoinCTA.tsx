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
              Your own ai can build a lasting understanding of you. Other people and their ais need a way to understand the parts you choose to share: your work, your thinking, and how they fit together. That is your public mirror.
            </p>
          </section>
          <section className="join-move">
            <h2 className="join-claim">the connector.</h2>
            <p>
              Your website stays on your host, in your style. Your ai can add a description of the material you choose to share, then register its address with Alexandria. The connector helps members find each other and checks who can read restricted material. Live answers are optional and can run through a model account you control. If you do not have a website, an Alexandria profile gives you a place to start.
            </p>
          </section>
          <section className="join-move">
            <h2 className="join-claim">the library.</h2>
            <p>
              The Library connects these independently owned mirrors. Your ai can find another member, read the material they allow you to see, and combine it with what it already knows about you. Your private context stays with your ai. That is cross personalisation. Its value grows as people choose to share and keep developing their thinking.
            </p>
          </section>
        </div>

        <p className="join-close">
          Capture, Loop, Skill, and the Mirror recipe are free to keep and adapt. Membership pays for the operated connector: shared discovery, reader identity, and current access. Leaving stops those services; your own files, website, and model keep working. Try it free for a month. Invite three friends and it stays free while they stay, because their mirrors make your loop more useful. Otherwise, it is a dollar a day. If that is too much, <a href={`mailto:${FOUNDER_EMAIL}?subject=Alexandria%20membership`}>message me</a> and I will cover it.
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
