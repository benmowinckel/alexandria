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
          ? 'copied — now paste it into a new chat'
          : (<>copy the setup<span className="act-why"> — paste it into any chat</span></>)}
      </button>
      <p className="chat-rest">
        Free ChatGPT works with native memory. Drive or local files deepen it automatically. Nothing is sent to Alexandria.
      </p>
    </div>
  );
}
