'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { checkReferral } from '../lib/referral';
import { useDoorStep } from '../lib/door-step';
import StartCTA from './StartCTA';

const STEPS = ['nearby', 'computer', 'phone'] as const;

// First select the truthful contract. The agent path then asks whether the
// computer is nearby because that changes whether setup happens now or by email.
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

  if (screen === 'computer' || screen === 'phone') {
    return <StartCTA refCode={refCode} mode={screen} />;
  }

  if (screen === 'nearby') {
    return (
      <div className="door-block">
        <p className="door-q">can you get to your computer now?</p>
        <div className="door-answers">
          <button className="door-btn" onClick={() => go('computer')}>
            yes<span className="act-why"> — set it up there</span>
          </button>
          <button className="door-btn" onClick={() => go('phone')}>
            no<span className="act-why"> — only my phone</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="door-block">
      <p className="door-q">what do you have access to?</p>
      <div className="door-answers">
        <button className="door-btn" onClick={() => go('nearby')}>
          an agent<span className="act-why"> — eg codex, cursor, cowork</span>
        </button>
        <Link href={refCode ? `/chat?ref=${encodeURIComponent(refCode)}` : '/chat'} className="door-btn door-btn-link">
          just chat<span className="act-why"> — eg claude, chatgpt, gemini</span>
        </Link>
      </div>
    </div>
  );
}
