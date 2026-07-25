'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import StartCTA from './StartCTA';

type Screen = 'q' | 'command';

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
    window.history.pushState({ s }, '', '#go');
    setScreen(s);
  };

  if (screen === 'command') {
    return (
      <>
        <StartCTA refCode={refCode} />
        {/* The read-if-you-want zone — below every action, footer-ish (founder
            2026-07-24: "they're not reading anything"). */}
        <p className="start-footnote">
          the command: <code>curl -fsSL alexandria-library.com/a | bash</code>.
          it makes one folder on your computer. yours. your own setup stays
          untouched. delete the folder and it&rsquo;s gone.
          details: <Link href="/mechanics">mechanics</Link>.
        </p>
      </>
    );
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
        first = the full product. chat = the light one. switch anytime.
      </p>
    </div>
  );
}
