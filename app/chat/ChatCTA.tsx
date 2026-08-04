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
          ? 'copied — now paste it into claude'
          : (<>copy the setup<span className="act-why"> — paste it into claude</span></>)}
      </button>
      {/* The trust line for the chat door — the docs are written into the
          reader's own Drive, not to anything of ours. Reuses the page's
          already-styled quiet class. */}
      <p className="chat-rest">
        No install, no account, no server of ours — the docs are created in your own Drive.
      </p>
    </div>
  );
}
