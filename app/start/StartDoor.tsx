'use client';

import { useState } from 'react';
import Link from 'next/link';
import StartCTA from './StartCTA';

// The only human classification that matters: do they have an agent that can
// work on files, or an ordinary chat? Each branch gets a truthful setup.
export default function StartDoor({ refCode }: { refCode?: string }) {
  const [screen, setScreen] = useState<'choice' | 'agent'>('choice');

  if (screen === 'agent') return <StartCTA refCode={refCode} />;

  return (
    <div className="door-block">
      <p className="door-q">what do you use?</p>
      <div className="door-answers">
        <button className="door-btn" onClick={() => setScreen('agent')}>
          agents<span className="act-why"> — eg claude code, codex, cowork</span>
        </button>
        <Link href="/chat" className="door-btn door-btn-link">
          chat<span className="act-why"> — eg claude, chatgpt, gemini</span>
        </Link>
      </div>
    </div>
  );
}
