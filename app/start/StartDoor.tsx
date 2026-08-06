'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import StartCTA from './StartCTA';

type Screen = 'q' | 'device' | 'computer' | 'phone';

// The click-through funnel (founder, 2026-07-24/25): every screen one decision
// or one small set of numbered imperatives; back/swipe rewinds screens, never
// exits. Order inside the install screen: shortcut + email BEFORE the paste —
// after the paste they disappear into the agent for days (founder call).
export default function StartDoor({ refCode }: { refCode?: string }) {
  const [screen, setScreen] = useState<Screen>(refCode ? 'device' : 'q');

  useEffect(() => {
    // Deep-links + refresh mid-sequence: the hash IS the screen.
    const h = window.location.hash.slice(1) as Screen;
    if (h === 'device' || h === 'computer' || h === 'phone') {
      window.history.replaceState({ s: h }, '', '#' + h);
      setScreen(h);
    } else if (refCode) window.history.replaceState({ s: 'device' }, '', '#device');

    const onPop = (e: PopStateEvent) =>
      setScreen(((e.state && e.state.s) as Screen) || 'q');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [refCode]);

  const go = (s: Exclude<Screen, 'q'>) => {
    window.history.pushState({ s }, '', '#' + s);
    setScreen(s);
  };

  if (screen === 'computer' || screen === 'phone') {
    return (
<StartCTA refCode={refCode} mode={screen} />
    );
  }

  if (screen === 'device') {
    return (
      <div className="door-block">
        {/* Not "at your computer?" (founder 2026-07-27): someone on their phone
            can still walk to the machine — reach, not location. The yes-answer
            carries the instruction; both answers are three-word imperatives
            for what happens next, so the pair reads as one shape. Not "do it
            later" — the no-path still does the shortcut and the email now. */}
        <p className="door-q">is your computer in reach?</p>
        <div className="door-answers">
          <button className="door-btn" onClick={() => go('computer')}>
            yes<span className="act-why"> — go grab it</span>
          </button>
          <button className="door-btn" onClick={() => go('phone')}>
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
        <button className="door-btn" onClick={() => go('device')}>
          agents<span className="act-why"> — eg claude code, codex, cursor</span>
        </button>
        <Link href="/chat" className="door-btn door-btn-link">
          chat<span className="act-why"> — eg claude, gpt, gemini</span>
        </Link>
      </div>
    </div>
  );
}
