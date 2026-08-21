'use client';

import { useEffect, useState } from 'react';
import { checkReferral } from '../lib/referral';
import { useDoorStep } from '../lib/door-step';
import { copyText, type CopyState } from '../lib/copy-text';
import { agentSetupPrompt, chatSetupPrompt } from '../../shared/onboarding-prompts';
import ChatCTA from '../chat/ChatCTA';
import StartCTA from './StartCTA';

const STEPS = ['agent', 'chat'] as const;
type Step = (typeof STEPS)[number];

// The person chooses only the contract they understand. The receiving AI owns
// device, host and capability routing from there.
export default function StartDoor({ refCode }: { refCode?: string }) {
  const [screen, go] = useDoorStep(STEPS);
  const [copiedChoice, setCopiedChoice] = useState<{ step: Step; state: CopyState } | null>(null);

  // The first screen must own referral continuity. Waiting until someone picks
  // a branch means a fast invitation click reaches /start with the ref intact,
  // but never saves it for the later /join visit.
  useEffect(() => {
    if (!refCode) return;
    let live = true;
    checkReferral(refCode).then((valid) => {
      if (!live || !valid) return;
      try { window.localStorage.setItem('alexandria-referrer', refCode); } catch { /* storage is optional */ }
    });
    return () => { live = false; };
  }, [refCode]);

  async function choose(step: Step) {
    const state = await copyText(step === 'agent' ? agentSetupPrompt() : chatSetupPrompt());
    setCopiedChoice({ step, state });
    go(step);
  }

  if (screen === 'agent') {
    return <StartCTA refCode={refCode} initialCopyState={copiedChoice?.step === 'agent' ? copiedChoice.state : 'idle'} />;
  }

  if (screen === 'chat') {
    return <ChatCTA refCode={refCode} initialCopyState={copiedChoice?.step === 'chat' ? copiedChoice.state : 'idle'} />;
  }

  return (
    <div className="door-block">
      <p className="door-q">what do you have access to?</p>
      <div className="door-answers">
        <button className="door-btn" onClick={() => choose('agent')}>
          an agent<span className="act-why"> — eg codex, cursor, cowork</span>
        </button>
        <button className="door-btn" onClick={() => choose('chat')}>
          just chat<span className="act-why"> — eg claude, chatgpt, gemini</span>
        </button>
      </div>
    </div>
  );
}
