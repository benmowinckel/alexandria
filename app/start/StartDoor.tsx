'use client';

import { useState } from 'react';
import Link from 'next/link';
import StartCTA from './StartCTA';

// The one question that splits all customers (founder, 2026-07-24: two doors,
// nothing else). Stressed-user rule: show only the step in front of them —
// the question first, then only the chosen door's content. A kin invite
// (?ref=) auto-opens the terminal door: invited people came to install.
export default function StartDoor({ refCode }: { refCode?: string }) {
  const [door, setDoor] = useState<'terminal' | null>(refCode ? 'terminal' : null);

  if (door === 'terminal') {
    return (
      <>
        <StartCTA refCode={refCode} />
        <p className="door-switch">
          no terminal after all?{' '}
          <Link href="/chat" className="start-shortcut-a">alexandria in chat</Link>
        </p>
      </>
    );
  }

  return (
    <div className="door-block">
      <p className="door-q">do you work in a terminal?</p>
      <div className="door-answers">
        <button className="door-btn" onClick={() => setDoor('terminal')}>
          yes — show me the command
        </button>
        <Link href="/chat" className="door-btn door-btn-link">
          no — i use chat (or cowork)
        </Link>
      </div>
      <p className="door-hint">
        that&rsquo;s the whole decision. either way it&rsquo;s about five minutes.
      </p>
    </div>
  );
}
