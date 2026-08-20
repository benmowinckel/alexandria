'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { checkReferral } from '../lib/referral';
import { useDoorStep } from '../lib/door-step';
import StartCTA from './StartCTA';

const STEPS = ['agent'] as const;

// The person chooses only the contract they understand. The receiving AI owns
// device, host and capability routing from there.
export default function StartDoor({ refCode }: { refCode?: string }) {
  const [screen, go] = useDoorStep(STEPS);

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

  if (screen === 'agent') {
    return <StartCTA refCode={refCode} />;
  }

  return (
    <div className="door-block">
      <p className="door-q">what do you have access to?</p>
      <div className="door-answers">
        <button className="door-btn" onClick={() => go('agent')}>
          an agent<span className="act-why"> — eg codex, cursor, cowork</span>
        </button>
        <Link href={refCode ? `/chat?ref=${encodeURIComponent(refCode)}` : '/chat'} className="door-btn door-btn-link">
          just chat<span className="act-why"> — eg claude, chatgpt, gemini</span>
        </Link>
      </div>
    </div>
  );
}
