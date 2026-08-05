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
      <button className={`door-btn cta-btn${copied ? ' is-copied' : ''}`} onClick={copy} aria-label="copy the setup">
        {copied
          ? 'copied — now paste it into Instructions'
          : (<>copy Alexandria<span className="act-why"> — one instruction</span></>)}
      </button>
      <p className="chat-rest">
        ChatGPT: Settings → Personalization → Custom Instructions.<br />Claude: Settings → Instructions for Claude.
      </p>
      <p className="chat-where">
        Free and paid both work. Nothing is sent to Alexandria.
      </p>
      <details className="chat-details">
        <summary>Using a ChatGPT Project or custom GPT?</summary>
        <p>A Project needs the same paste in Project instructions. Custom GPTs cannot use account instructions or memory.</p>
      </details>
    </div>
  );
}
