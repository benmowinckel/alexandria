'use client';

import { useState } from 'react';

export default function ChatCTA({ bootstrap }: { bootstrap: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    try {
      await navigator.clipboard.writeText(bootstrap);
      setCopied(true);
      setTimeout(() => setCopied(false), 2400);
    } catch {}
  }

  return (
    <div className="cta-section">
      <p className="step-line"><span className="step-num">1.</span> copy this</p>
      <button className="install-block chat-block" onClick={copy} aria-label="copy the bootstrap">
        <span className="chat-block-label">{copied ? 'copied' : 'copy'}</span>
        <span className="install-copy" aria-hidden="true">
          {copied ? (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 6L9 17l-5-5" /></svg>
          ) : (
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
          )}
        </span>
      </button>
      <p className="step-line step-two"><span className="step-num">2.</span> paste it into claude</p>
      <p className="chat-rest">it does the rest.</p>
    </div>
  );
}
