'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { checkReferral } from '../lib/referral';
import { agentSetupPrompt } from '../../shared/onboarding-prompts';

type CopyState = 'idle' | 'copied' | 'error';

export default function StartCTA({ refCode }: { refCode?: string }) {
  const [setupCopyState, setSetupCopyState] = useState<CopyState>('idle');
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

  const copy = async (text: string, setState: (state: CopyState) => void) => {
    let success = false;
    try {
      await navigator.clipboard.writeText(text);
      success = true;
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { success = document.execCommand('copy'); } catch { /* noop */ }
      document.body.removeChild(area);
    }
    setState(success ? 'copied' : 'error');
    setTimeout(() => setState('idle'), 4000);
  };

  const prompt = agentSetupPrompt();

  return (
    <section className="cta-section">
      {validRef && <p className="install-invite">@{validRef} invited you to alexandria.</p>}

      <div className="act-row">
        <span className="act-num">1</span>
        <button
          type="button"
          className={`door-btn act-box cta-btn setup-copy${setupCopyState === 'copied' ? ' is-copied' : ''}`}
          onClick={() => copy(prompt, setSetupCopyState)}
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
