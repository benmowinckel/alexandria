'use client';

import { useState } from 'react';
import Link from 'next/link';
import StartCTA from './StartCTA';

// The one question that splits all customers (founder, 2026-07-24: two doors,
// nothing else). Final wording (founder, 4th iteration): POSSESSION, zero jargon —
// the yes-button IS the app list; no "terminal" anywhere (pasting into cursor or
// the claude code app isn't 'a terminal' to its user, and the install works there). Stressed-user rule: show only the step in front of them —
// the question first, then only the chosen door's content. A kin invite
// (?ref=) auto-opens the terminal door: invited people came to install.
export default function StartDoor({ refCode }: { refCode?: string }) {
  const [door, setDoor] = useState<'terminal' | null>(refCode ? 'terminal' : null);

  if (door === 'terminal') {
    return (
      <>
        <StartCTA refCode={refCode} />
        <p className="door-switch">
          actually just use chat?{' '}
          <Link href="/chat" className="start-shortcut-a">alexandria in chat</Link>
        </p>
      </>
    );
  }

  return (
    <div className="door-block">
      <p className="door-q">do you use any of these?</p>
      <div className="door-answers">
        <button className="door-btn" onClick={() => setDoor('terminal')}>
          claude code · cursor · codex · cowork
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
