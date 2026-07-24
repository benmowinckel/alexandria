'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import StartCTA from './StartCTA';

type Screen = 'q' | 'command' | 'phone';

// The click-through door (founder, 2026-07-24): one screen, one action, and
// browser-back / swipe-back walks BACKWARDS through the sequence, never out
// of the site — each advance pushes a history entry; popstate rewinds it.
// Wording: possession, zero jargon — the yes-button IS the app list. "cowork"
// is deliberately absent from this page (the concept is post-install; the
// "code tab of the claude app" clause inside routes those users invisibly).
export default function StartDoor({ refCode }: { refCode?: string }) {
  const [screen, setScreen] = useState<Screen>(refCode ? 'command' : 'q');

  useEffect(() => {
    // Invited installs land straight on the command — seed history so back
    // still behaves (back from phone → command → question).
    if (refCode) window.history.replaceState({ s: 'command' }, '', '#go');
    const onPop = (e: PopStateEvent) =>
      setScreen(((e.state && e.state.s) as Screen) || 'q');
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, [refCode]);

  const go = (s: Exclude<Screen, 'q'>) => {
    window.history.pushState({ s }, '', s === 'command' ? '#go' : '#phone');
    setScreen(s);
  };

  if (screen === 'command') {
    return (
      <>
        <StartCTA refCode={refCode} stage="command" />
        <button className="door-btn door-next" onClick={() => go('phone')}>
          next — your phone
        </button>
      </>
    );
  }

  if (screen === 'phone') {
    return <StartCTA refCode={refCode} stage="phone" />;
  }

  return (
    <div className="door-block">
      <p className="door-q">do you use any of these?</p>
      <div className="door-answers">
        <button className="door-btn" onClick={() => go('command')}>
          claude code · cursor · codex …
        </button>
        <Link href="/chat" className="door-btn door-btn-link">
          no — i just use the chat app
        </Link>
      </div>
      <p className="door-hint">
        the first is the full product. chat is the light version &mdash; upgrade anytime.
      </p>
    </div>
  );
}
