'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import StartCTA from './StartCTA';

type Screen = 'q' | 'device' | 'computer' | 'phone';

// Every screen carries one decision. Computer ends in one copy action; phone
// sends that same setup message once for later use at the computer.
export default function StartDoor({ refCode }: { refCode?: string }) {
  const [screen, setScreen] = useState<Screen>(refCode ? 'device' : 'q');

  useEffect(() => {
    // Deep-links + refresh mid-sequence: the hash IS the screen.
    const h = window.location.hash.slice(1) as Screen;
    let frame = 0;
    if (h === 'device' || h === 'computer' || h === 'phone') {
      window.history.replaceState({ s: h }, '', '#' + h);
      frame = window.requestAnimationFrame(() => setScreen(h));
    } else if (refCode) window.history.replaceState({ s: 'device' }, '', '#device');

    const onPop = (e: PopStateEvent) =>
      setScreen(((e.state && e.state.s) as Screen) || 'q');
    window.addEventListener('popstate', onPop);
    return () => {
      if (frame) window.cancelAnimationFrame(frame);
      window.removeEventListener('popstate', onPop);
    };
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
        {/* Reach, not current device: someone on a phone may still walk to the
            computer. The no-path sends the same safe message once for later. */}
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
      <p className="door-q">what do you have access to?</p>
      <div className="door-answers">
        <button className="door-btn" onClick={() => go('device')}>
          an agent<span className="act-why"> — claude code, codex, cursor</span>
        </button>
        <Link href="/chat" className="door-btn door-btn-link">
          just a chat<span className="act-why"> — claude, chatgpt, gemini</span>
        </Link>
      </div>
    </div>
  );
}
