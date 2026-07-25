'use client';

import { useState } from 'react';

const GLYPH = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden style={{ marginLeft: 5, verticalAlign: '-1px' }}>
    <rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);
const TICK = (
  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden style={{ marginLeft: 5, verticalAlign: '-1px' }}>
    <path d="M20 6L9 17l-5-5" />
  </svg>
);

export default function ChatCTA({ bootstrap }: { bootstrap: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(bootstrap);
      setCopied(true);
      setTimeout(() => setCopied(false), 2600);
    } catch {}
  }

  return (
    <div className="cta-section">
      <p className="step-line">
        <button className="copy-word" onClick={copy} aria-label="copy the bootstrap">
          {copied ? 'copied' : 'copy this'}{copied ? TICK : GLYPH}
        </button>
        {' '}&mdash; {copied ? 'now paste it into claude.' : 'paste it into claude.'}
      </p>
      <p className="chat-rest">it does the rest.</p>
    </div>
  );
}
