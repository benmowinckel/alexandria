'use client';

import { useState } from 'react';
import Link from 'next/link';
import StartCTA from './StartCTA';

// First select the truthful contract. The agent path then asks whether the
// computer is nearby because that changes whether setup happens now or by email.
export default function StartDoor({ refCode }: { refCode?: string }) {
  const [screen, setScreen] = useState<'choice' | 'nearby' | 'computer' | 'phone'>('choice');

  if (screen === 'computer' || screen === 'phone') {
    return <StartCTA refCode={refCode} mode={screen} />;
  }

  if (screen === 'nearby') {
    return (
      <div className="door-block">
        <p className="door-q">is your computer nearby?</p>
        <div className="door-answers">
          <button className="door-btn" onClick={() => setScreen('computer')}>
            yes<span className="act-why"> — go grab it</span>
          </button>
          <button className="door-btn" onClick={() => setScreen('phone')}>
            no<span className="act-why"> — stay on phone</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="door-block">
      <p className="door-q">what do you use?</p>
      <div className="door-answers">
        <button className="door-btn" onClick={() => setScreen('nearby')}>
          agents<span className="act-why"> — eg claude code, codex, cowork</span>
        </button>
        <Link href={refCode ? `/chat?ref=${encodeURIComponent(refCode)}` : '/chat'} className="door-btn door-btn-link">
          chat<span className="act-why"> — eg claude, chatgpt, gemini</span>
        </Link>
      </div>
    </div>
  );
}
