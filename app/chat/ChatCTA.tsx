'use client';

import { useState } from 'react';

// Door 2's single primary action: copy the bootstrap, paste it into claude.
// Mirrors /start's install-block idiom — one block, one click, copied state.
export default function ChatCTA({ bootstrap }: { bootstrap: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(bootstrap);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {
      /* clipboard denied — the textarea fallback below stays selectable */
    }
  }

  return (
    <div className="cta-section">
      <p className="step-line">
        <span className="step-num">1.</span> in claude, turn on the Google
        Drive connector <span className="chat-where">(Settings → Connectors)</span>
      </p>
      <p className="step-line">
        <span className="step-num">2.</span> copy the bootstrap and paste it
        into a new chat — it does the rest, including writing the first draft
        of you
      </p>

      <button className="install-block chat-block" onClick={copy} aria-label="copy the bootstrap">
        <span className="chat-block-label">
          {copied ? 'copied — now paste it into claude' : 'the bootstrap — click to copy'}
        </span>
        <span className="install-copy" aria-hidden="true">
          {copied ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
          )}
        </span>
      </button>

      <p className="step-line step-two">
        <span className="step-num">3.</span> after that, two settings once —
        then the whole thing is one letter: type <em>a</em> in any chat, on any
        device
      </p>
    </div>
  );
}
