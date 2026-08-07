'use client';

import { useState } from 'react';

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
      <div className="chat-step">
        <span className="chat-step-num">1</span>
        <button className={`door-btn cta-btn${copied ? ' is-copied' : ''}`} onClick={copy} aria-label="copy the setup">
          {copied
            ? 'copied — paste it into any chat'
            : (<>copy the setup<span className="act-why"> — your ai checks it first</span></>)}
        </button>
      </div>
      <div className="chat-step">
        <span className="chat-step-num">2</span>
        <div className="chat-step-card">paste it into any chat</div>
      </div>
      <p className="chat-rest">Follow the two short actions your ai gives you. Then you&apos;re done.</p>
      <p className="chat-after">After that, chat normally. Type <strong>a</strong> whenever you want a deliberate session.</p>
      <p className="chat-where">
        Free and paid both work. Nothing is sent to Alexandria.
      </p>
    </div>
  );
}
