'use client';

import { useEffect, useRef, useState } from 'react';
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
  const [validRef, setValidRef] = useState<string | null>(null);
  const [dismissedChoiceGone, setDismissedChoiceGone] = useState(false);
  const dismissTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // The first screen must own referral continuity. Waiting until someone picks
  // a branch means a fast invitation click reaches /start with the ref intact,
  // but never saves it for the later /join visit.
  useEffect(() => {
    if (!refCode) return;
    let live = true;
    checkReferral(refCode).then((valid) => {
      if (!live || !valid) return;
      setValidRef(refCode);
      try { window.localStorage.setItem('alexandria-referrer', refCode); } catch { /* storage is optional */ }
    });
    return () => { live = false; };
  }, [refCode]);

  useEffect(() => () => {
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
  }, []);

  async function choose(step: Step) {
    const state = await copyText(step === 'agent' ? agentSetupPrompt() : chatSetupPrompt());
    if (dismissTimer.current) clearTimeout(dismissTimer.current);
    setDismissedChoiceGone(false);
    setCopiedChoice({ step, state });
    go(step);
    dismissTimer.current = setTimeout(() => setDismissedChoiceGone(true), 280);
  }

  const decided = copiedChoice?.step === screen ? copiedChoice : null;

  function choiceLabel(step: Step) {
    if (decided?.step !== step) {
      return step === 'agent'
        ? <>an agent<span className="act-why"> — eg codex, cursor, cowork</span></>
        : <>just chat<span className="act-why"> — eg claude, chatgpt, gemini</span></>;
    }

    if (decided.state === 'error') return 'couldn’t copy — try again';

    return (
      <span className="door-confirmation">
        copied<span className="act-why"> — paste into your {step}</span>
      </span>
    );
  }

  // A choice made on this page transforms in place: the selected line becomes
  // the instruction and the alternative quietly leaves. Direct hash entry has
  // no initiating click, so it keeps the honest standalone copy control below.
  if (!screen || decided) {
    return (
      <div className={`door-block${decided ? ' is-decided' : ''}`}>
        {validRef && <p className="install-invite">@{validRef} invited you to alexandria.</p>}
        <p className="door-q">what do you have access to?</p>
        <div className="door-answers">
          {STEPS.filter((step) => !decided || !dismissedChoiceGone || decided.step === step).map((step) => {
            const dismissed = Boolean(decided && decided.step !== step);
            const selected = decided?.step === step;

            return (
              <button
                key={step}
                type="button"
                className={`door-btn door-choice${selected ? ' is-selected' : ''}${dismissed ? ' is-dismissed' : ''}`}
                onClick={() => choose(step)}
                disabled={dismissed}
                aria-hidden={dismissed || undefined}
                aria-label={selected ? `copied — paste into your ${step}; click to copy again` : undefined}
                tabIndex={dismissed ? -1 : undefined}
              >
                {choiceLabel(step)}
              </button>
            );
          })}
        </div>
      </div>
    );
  }

  if (screen === 'agent') {
    return <StartCTA refCode={refCode} initialCopyState={copiedChoice?.step === 'agent' ? copiedChoice.state : 'idle'} />;
  }

  if (screen === 'chat') {
    return <ChatCTA refCode={refCode} initialCopyState={copiedChoice?.step === 'chat' ? copiedChoice.state : 'idle'} />;
  }

  return null;
}
