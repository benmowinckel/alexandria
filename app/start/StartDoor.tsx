'use client';

import { useState } from 'react';
import Link from 'next/link';
import StartCTA from './StartCTA';

// The one question that splits all customers (founder, 2026-07-24: two doors,
// nothing else). The split is CAPABILITY, not habit (founder): many chat-lovers
// have Claude Code; every Cowork user has the app — so cowork = yes-door. The
// question is literal: can you paste a command, or no idea what that means. Stressed-user rule: show only the step in front of them —
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
      <p className="door-q">can you paste a command into a terminal?</p>
      <div className="door-answers">
        <button className="door-btn" onClick={() => setDoor('terminal')}>
          yes — give me the command
        </button>
        <Link href="/chat" className="door-btn door-btn-link">
          no idea what that means — take me to chat
        </Link>
      </div>
      <p className="door-hint">
        use claude code, cursor, codex, or cowork? that&rsquo;s a yes. yes is the
        full product; no is the light version &mdash; upgrade anytime.
      </p>
    </div>
  );
}
