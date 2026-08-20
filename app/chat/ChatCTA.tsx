'use client';

import { useEffect, useState } from 'react';
import { checkReferral } from '../lib/referral';
import { chatSetupPrompt } from '../../shared/onboarding-prompts';

type CopyState = 'idle' | 'copied' | 'error';

export default function ChatCTA({
  refCode,
}: {
  refCode?: string;
}) {
  const [setupCopyState, setSetupCopyState] = useState<CopyState>('idle');
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

  async function copy(text: string, setState: (state: CopyState) => void) {
    let copied = false;
    try {
      await navigator.clipboard.writeText(text);
      copied = true;
    } catch {
      const area = document.createElement('textarea');
      area.value = text;
      area.style.position = 'fixed';
      area.style.opacity = '0';
      document.body.appendChild(area);
      area.select();
      try { copied = document.execCommand('copy'); } catch { /* noop */ }
      document.body.removeChild(area);
    }
    setState(copied ? 'copied' : 'error');
    setTimeout(() => setState('idle'), 4000);
  }

  return (
    <section className="cta-section">
      <div className="act-row">
        <span className="act-num">1</span>
        <button
          type="button"
          className={`door-btn act-box cta-btn setup-copy${setupCopyState === 'copied' ? ' is-copied' : ''}`}
          onClick={() => copy(chatSetupPrompt(), setSetupCopyState)}
          aria-label="copy the setup"
        >
          {setupCopyState === 'copied'
            ? <>copied<span className="act-why"> — paste into your chat</span></>
            : setupCopyState === 'error'
              ? 'couldn’t copy — try again'
              : <>copy the setup<span className="act-why"> — paste into your chat</span></>}
        </button>
      </div>
    </section>
  );
}
