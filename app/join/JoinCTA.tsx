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

  useEffect(() => {
    if (!manualValid) return;
    setReferralEditing(false);
    try { window.localStorage.setItem('alexandria-referrer', manualValid); } catch { /* storage is optional */ }
  }, [manualValid]);

  // The OAuth callback validates the ref again before awarding credit. Carry a
  // URL/saved candidate immediately so a fast click cannot outrun the UI check;
  // remove it here only if the visible check rejects it.
  const confirmedRef = manualValid || validUrlRef || '';
  const effectiveRef = confirmedRef || pendingUrlRef || '';
  const joinUrl = githubUrl(effectiveRef, refSource);

  return (
    <>
      <section className="join-section">
        <h1 className="join-hero">Your mind gets better with other minds.</h1>

        <div className="join-argument">
          <p className="join-lead">
            <em>You became yourself through other people.</em> Friends, family, teachers, colleagues, writers, and rivals shaped what you notice, what you value, and how you think. Nearly every worthwhile idea reached you through another mind. A personal system should not isolate you from those people. It should help you keep learning from them, understanding them, and growing with them.
          </p>
          <p>
            <em>Membership gives your Alexandria loop access to what other people have learned.</em> The marketplace offers methods people have tested, while the Library holds ideas and work people chose to publish. With permission, your loop can also understand your friends from their own words, not only yours. It can see not only what you think, but where it came from, who still shapes it, and what could help you now.
          </p>
          <p>
            <em>The value appears the next time you use your loop.</em> It can bring in a proven method, a perspective you would have missed, or context from someone close to you, then turn it into a decision, a conversation, or finished work. When your friends join, you can see what each other makes and follow each other&rsquo;s progress. You grow together, which makes it easier to keep showing up and doing the work.
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
            <label className="join-referral-field">
              <span aria-hidden="true">@</span>
              <input
                ref={referralRef}
                type="text"
                autoComplete="off"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                placeholder="github handle"
                aria-label="referral"
                value={manualRef}
                onChange={(event) => setManualRef(event.target.value)}
              />
              {manualInvalid && <span className="join-referral-error">not found</span>}
            </label>
          ) : (
            <button type="button" onClick={() => setReferralEditing(true)}>add referral</button>
          )}
        </div>}
      </section>
    </>
  );
}
