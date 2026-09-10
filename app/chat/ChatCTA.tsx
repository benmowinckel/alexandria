'use client';

import { useEffect, useState } from 'react';
import { checkReferral } from '../lib/referral';
import { copyText, type CopyState } from '../lib/copy-text';
import {
  chatSetupPrompt,
  type ChatHost,
} from '../../shared/onboarding-prompts';

export default function ChatCTA({
  refCode,
  host,
  initialCopyState = 'idle',
}: {
  refCode?: string;
  host: ChatHost;
  initialCopyState?: CopyState;
}) {
  const [setupCopyState, setSetupCopyState] = useState<CopyState>(initialCopyState);
  const [refCheck, setRefCheck] = useState<{ input: string; valid: string | null } | null>(null);
  const validRef = refCode && refCheck?.input === refCode ? refCheck.valid : null;

  useEffect(() => {
    if (!refCode) return;
    let live = true;
    checkReferral(refCode)
      .then((valid) => { if (live) setRefCheck({ input: refCode, valid: valid ? refCode : null }); });
    return () => { live = false; };
  }, [refCode]);

  useEffect(() => {
    if (!validRef) return;
    try { window.localStorage.setItem('alexandria-referrer', validRef); } catch { /* storage is optional */ }
  }, [validRef]);

  async function copySetup() {
    setSetupCopyState(await copyText(chatSetupPrompt(host)));
    setTimeout(() => setSetupCopyState('idle'), 4000);
  }

  return (
    <section className="cta-section">
      <div className="act-row">
        <button
          type="button"
          className={`door-btn act-box cta-btn setup-copy${setupCopyState === 'copied' ? ' is-copied' : ''}`}
          onClick={copySetup}
          aria-label="copy the setup"
        >
          {setupCopyState === 'copied'
            ? <>copied<span className="act-why"> — paste into a new chat</span></>
            : setupCopyState === 'error'
              ? 'couldn’t copy — try again'
              : <>copy the setup<span className="act-why"> — paste into a new chat</span></>}
        </button>
      </div>
    </section>
  );
}
