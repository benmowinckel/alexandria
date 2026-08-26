'use client';

import { useEffect, useState } from 'react';
import { checkReferral } from '../lib/referral';
import { copyText, type CopyState } from '../lib/copy-text';
import {
  chatInstallPrompt,
  chatSetupPrompt,
  CHAT_HOSTS,
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
  const [instructionCopyState, setInstructionCopyState] = useState<CopyState>('idle');
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

  const guide = CHAT_HOSTS[host];

  async function copyInstructions() {
    setInstructionCopyState(await copyText(chatInstallPrompt()));
    setTimeout(() => setInstructionCopyState('idle'), 4000);
  }

  async function copySetup() {
    setSetupCopyState(await copyText(chatSetupPrompt()));
    setTimeout(() => setSetupCopyState('idle'), 4000);
  }

  return (
    <section className="cta-section">
      <div className="act-row">
        <span className="act-num">1</span>
        <button
          type="button"
          className={`door-btn act-box cta-btn instruction-copy${instructionCopyState === 'copied' ? ' is-copied' : ''}`}
          onClick={copyInstructions}
          aria-label="copy the instructions"
        >
          {instructionCopyState === 'copied'
            ? <>copied<span className="act-rest">paste into {guide.instructionPath}</span></>
            : instructionCopyState === 'error'
              ? 'couldn’t copy — try again'
              : <>copy the instructions<span className="act-rest">paste into {guide.instructionPath}</span></>}
        </button>
      </div>

      <div className="act-row">
        <span className="act-num">2</span>
        <p className="door-btn act-box is-note">
          connect google drive<span className="act-rest">{guide.drivePath}</span>
        </p>
      </div>

      <div className="act-row">
        <span className="act-num">3</span>
        <button
          type="button"
          className={`door-btn act-box cta-btn setup-copy${setupCopyState === 'copied' ? ' is-copied' : ''}`}
          onClick={copySetup}
          aria-label="copy the setup"
        >
          {setupCopyState === 'copied'
            ? <>copied<span className="act-why"> — paste into a normal chat</span></>
            : setupCopyState === 'error'
              ? 'couldn’t copy — try again'
              : <>copy the setup<span className="act-why"> — paste into a normal chat</span></>}
        </button>
      </div>
    </section>
  );
}
