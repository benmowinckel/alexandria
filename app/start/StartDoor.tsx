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
    if (refCode) window.history.replaceState({ s: 'device' }, '', '#here');
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
      <>
        <StartCTA refCode={refCode} mode={screen} />
        <p className="start-footnote">
          one folder, yours &mdash; your setup stays untouched; delete it, it&rsquo;s gone.
          the command: <code>curl -fsSL alexandria-library.com/a | bash</code> &middot;{' '}
          <Link href="/mechanics">mechanics</Link>
        </p>
      </>
    );
  }

  if (screen === 'device') {
    return (
      <div className="door-block">
        <p className="door-q">at your computer?</p>
        <div className="door-answers">
          <button className="door-btn" onClick={() => go('computer')}>
            yes
          </button>
          <button className="door-btn" onClick={() => go('phone')}>
            no — on my phone
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="door-block">
      <p className="door-q">do you use any of these?</p>
      <div className="door-answers">
        <button className="door-btn" onClick={() => go('device')}>
          claude code · cursor · codex …
        </button>
        <Link href="/chat" className="door-btn door-btn-link">
          no — i just use the chat app
        </Link>
      </div>
      <p className="door-hint">
        first = the full product. chat = the light one. switch anytime.
      </p>
    </div>
  );
}
