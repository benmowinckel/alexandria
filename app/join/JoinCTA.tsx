'use client';

import { useState, useEffect, useRef } from 'react';
import { SERVER_URL } from '../lib/config';
import { checkReferral } from '../lib/referral';

// The private loop is complete on its own. Membership makes each use better by
// connecting it to proven systems, published minds, and consented relationships.
// Referral attribution affects kin pricing; it is not the value.
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
  const [savedRef, setSavedRef] = useState('');
  const candidateUrlRef = urlRef || savedRef;
  const validUrlRef = candidateUrlRef && urlCheck?.input === candidateUrlRef ? urlCheck.valid : null;
  const urlRefChecked = !!candidateUrlRef && urlCheck?.input === candidateUrlRef;
  const pendingUrlRef = candidateUrlRef && !urlRefChecked ? candidateUrlRef : '';
  const [referralEditing, setReferralEditing] = useState(false);
  const [confirmedManualRef, setConfirmedManualRef] = useState('');
  const [manualRef, setManualRef] = useState('');
  const [manualCheck, setManualCheck] = useState<{ input: string; valid: string | null } | null>(null);
  const referralRef = useRef<HTMLInputElement>(null);
  const cleanManualRef = manualRef.replace(/[^A-Za-z0-9-]/g, '').slice(0, 39);
  const manualValid = cleanManualRef && manualCheck?.input === cleanManualRef ? manualCheck.valid : null;
  const manualInvalid = cleanManualRef && manualCheck?.input === cleanManualRef && !manualCheck.valid;

  useEffect(() => {
    if (urlRef) return;
    try { setSavedRef(window.localStorage.getItem('alexandria-referrer') || ''); } catch { /* storage is optional */ }
  }, [urlRef]);

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

  useEffect(() => {
    if (referralEditing) referralRef.current?.focus();
  }, [referralEditing]);

  const confirmManualReferral = () => {
    if (!manualValid) return;
    setConfirmedManualRef(manualValid);
    setReferralEditing(false);
    try { window.localStorage.setItem('alexandria-referrer', manualValid); } catch { /* storage is optional */ }
  };

  const cancelReferral = () => {
    setReferralEditing(false);
    setManualRef('');
    setManualCheck(null);
  };

  // The OAuth callback validates the ref again before awarding credit. Carry a
  // URL/saved candidate immediately so a fast click cannot outrun the UI check;
  // remove it here only if the visible check rejects it.
  const confirmedRef = confirmedManualRef || validUrlRef || '';
  const effectiveRef = confirmedRef || pendingUrlRef || '';
  const joinUrl = githubUrl(effectiveRef, refSource);

  return (
    <>
      <section className="join-section">
        <h1 className="join-hero">Your mind gets better with other minds.</h1>

        <div className="join-argument">
          <p className="join-lead">
            <em>Your private loop is the individual side of your personal context.</em> It lives in files you own and grows as your AI learns how you think. It is deep, sovereign, and unified on the private side.
          </p>
          <p>
            <em>Joining adds the public side of that same context.</em> The Library gives you a place for the public parts of your work, ideas, projects, and networks: a deeper, sovereign, unified page, not a shallow profile of links. That is only possible inside a collective hub, because the hub gives your page a place to live and lets it sit beside other people&rsquo;s public contexts.
          </p>
          <p>
            <em>It works both ways.</em> Your page is yours to shape and share. You can learn from other people&rsquo;s public contexts, and they can learn from what you choose to make public. The Marketplace works both ways too: use methods other people built, and eventually make your own useful methods available. Your private files stay private, and nothing is connected by default.
          </p>
        </div>

        <p className="join-close">
          Bring three friends in your first month, and membership stays free. Otherwise, it is $1 a day. If cost is what stops you, message me and I will waive it. Your loop stays yours if you leave. I just want you to try it for a month, see what it actually does for you, and then decide whether it is worth keeping.
        </p>
        <a className="door-btn act-box act-primary" href={joinUrl}>
          join the collective<span className="act-why act-why-inverse"> &mdash; start with github</span>
        </a>

        {!effectiveRef && <div className="join-referral">
          {referralEditing ? (
            <form
              className="join-referral-form"
              onSubmit={(event) => {
                event.preventDefault();
                confirmManualReferral();
              }}
            >
              <span className="join-referral-label">github</span>
              <span className="join-referral-at" aria-hidden="true">@</span>
              <input
                ref={referralRef}
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="handle"
                aria-label="referral github handle"
                aria-invalid={manualInvalid || undefined}
                value={manualRef}
                onChange={(event) => setManualRef(event.target.value)}
              />
              {manualInvalid && <span className="join-referral-error" role="status">not found</span>}
              {manualValid && <span className="join-referral-valid" aria-hidden="true">✓</span>}
              <button
                className="join-referral-confirm"
                type="submit"
                disabled={!manualValid}
                aria-label="confirm referral"
              >
                →
              </button>
              <button
                className="join-referral-cancel"
                type="button"
                onClick={cancelReferral}
                aria-label="cancel referral"
              >
                ×
              </button>
            </form>
          ) : (
            <button
              className="join-referral-trigger"
              type="button"
              onClick={() => setReferralEditing(true)}
            >
              <span>add a referral</span>
              <span className="join-referral-arrow" aria-hidden="true">→</span>
            </button>
          )}
        </div>}
      </section>
    </>
  );
}
