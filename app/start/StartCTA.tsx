'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { checkReferral } from '../lib/referral';
import { copyText, type CopyState } from '../lib/copy-text';
import { agentSetupPrompt } from '../../shared/onboarding-prompts';

export default function StartCTA({ refCode, initialCopyState = 'idle' }: { refCode?: string; initialCopyState?: CopyState }) {
  const [setupCopyState, setSetupCopyState] = useState<CopyState>(initialCopyState);
  const [refCheck, setRefCheck] = useState<{ input: string; valid: string | null } | null>(null);
  const validRef = refCode && refCheck?.input === refCode ? refCheck.valid : null;

  useEffect(() => {
    if (!validRef) return;
    try { window.localStorage.setItem('alexandria-referrer', validRef); } catch { /* storage is optional */ }
  }, [validRef]);

  useEffect(() => {
    if (!refCode) return;
    let live = true;
    checkReferral(refCode)
      .then((valid) => { if (live) setRefCheck({ input: refCode, valid: valid ? refCode : null }); });
    return () => { live = false; };
  }, [refCode]);

  const copy = async () => {
    setSetupCopyState(await copyText(agentSetupPrompt()));
    setTimeout(() => setSetupCopyState('idle'), 4000);
  };

  return (
    <section className="cta-section">
      {validRef && <p className="install-invite">@{validRef} invited you to alexandria.</p>}

      <div className="act-row">
        <span className="act-num">1</span>
        <button
          type="button"
          className={`door-btn act-box cta-btn setup-copy${setupCopyState === 'copied' ? ' is-copied' : ''}`}
          onClick={copy}
          aria-label="copy the setup"
        >
          {setupCopyState === 'copied'
            ? <>copied<span className="act-why"> — paste into your agent</span></>
            : setupCopyState === 'error'
              ? 'couldn’t copy — try again'
              : <>copy the setup<span className="act-why"> — paste into your agent</span></>}
        </button>
      </div>
      {validRef && <p className="install-new"><Link href="/">new here? see what this is &rarr;</Link></p>}
    </section>
  );
}
