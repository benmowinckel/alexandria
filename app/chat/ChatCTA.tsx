'use client';

import { useState } from 'react';

// The whole interface is one button (founder 2026-07-24: min effort, max flow).
// It morphs: instruction -> action -> next instruction. Same element language
// as the door question — the funnel is door-buttons all the way down.
export default function ChatCTA({ bootstrap }: { bootstrap: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(bootstrap);
      setCopied(true);
      setTimeout(() => setCopied(false), 4000);
    } catch {}
  }

  return (
    <div className="cta-section">
      <button className={`door-btn cta-btn${copied ? ' is-copied' : ''}`} onClick={copy} aria-label="copy the bootstrap">
        {copied ? 'copied — now paste it into claude' : 'copy the setup'}
      </button>
    </div>
  );
}
