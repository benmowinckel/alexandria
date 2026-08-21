'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
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
        <h1 className="join-hero">Your mind gets better with other minds.</h1>

        <div className="join-argument">
          <div className="join-move">
            <p className="join-claim">You became yourself through other people.</p>
            <p>
              Nearly every thought you think is yours actually came from someone else. Something you read that another person wrote, a friend you talked to, a teacher who taught you. A loop that only ever talks to itself is insular. So we built the town square that gathers people, and lets you take the extra the collective can give that no one can make alone.
            </p>
          </div>
          <div className="join-move">
            <p className="join-claim">What you join is the public version of yourself.</p>
            <p>
              Your private map stays private. A public derivative of it is how you walk into that square and work with the others who made the same choice. The deep, sovereign, unified private map is what lets you build a deep, sovereign, unified map of your public self. The <Link href={FOUNDER_PROFILE_PATH}>founder&apos;s page</Link> is exactly that, one alexandria profile hung on the scattered networks you already live in, pointing at the ground truth of your public image. It pulls what is already out there into one profile you own, makes a home for the work that never had one, and gives the whole thing a depth it could not have any other way, because the public version of the private map is what ties it together.
            </p>
          </div>
          <div className="join-move">
            <p className="join-claim">That is when other minds enter the work.</p>
            <p>
              The vertical gathering meets the horizontal one. You connect with the others in the community, who have put their ideas outside their own heads, and the methods they use to build their loops. In the Library you sit beside them. In the marketplace you can take a method that already works, and one day put one of yours in someone else&apos;s hands. You keep refining yourself, not alone, but through other people, and with them.
            </p>
          </div>
        </div>

        <p className="join-close">
          Bring three friends, and membership is free while they remain active. Otherwise, the first 30 days are free, then it is $30 a month until you cancel. Your loop stays yours if you leave. Try it for a month, see what it actually does for you, and then decide whether it is worth keeping.
        </p>
        {billingStatus && (
          <p className="join-billing-note" role="status">
            {billingStatus === 'cancel'
              ? 'checkout closed — nothing was charged.'
              : 'your old checkout expired — start again when you are ready.'}
          </p>
        )}
        <a className="door-btn act-box act-primary" href={joinUrl}>
          join the collective<span className="act-why">{'\u00a0'}— start with github</span>
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

        <footer className="join-fineprint">
          <Link href="/terms">terms</Link>
          <span aria-hidden="true">·</span>
          <Link href="/privacy">privacy</Link>
          <span aria-hidden="true">·</span>
          <a href={`mailto:${FOUNDER_EMAIL}?subject=Alexandria%20membership`}>cost genuinely stopping you? email me</a>
        </footer>
      </section>
    </>
  );
}
