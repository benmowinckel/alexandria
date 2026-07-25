'use client';

import { useState } from 'react';

// Idiot-proof imperatives (founder): number the actions, tell them to press.
// The button morphs to "copied ✓"; step 2 already names the next move.
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
      <p className="step-line"><span className="step-num">1.</span> press this:</p>
      <button className={`door-btn cta-btn${copied ? ' is-copied' : ''}`} onClick={copy} aria-label="copy the setup">
        {copied ? 'copied ✓' : 'copy the setup'}
      </button>
      <p className="step-line step-two"><span className="step-num">2.</span> paste it into claude</p>
    </div>
  );
}
