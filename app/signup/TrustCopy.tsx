'use client';

import { useState } from 'react';
import { SITE_URL } from '../lib/config';

const ICON_COPY = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const ICON_CHECK = (
  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export default function TrustCopy() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    const url = `${SITE_URL}/docs/Trust.md`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard blocked — silently no-op
    }
  };

  return (
    <button
      type="button"
      onClick={handleCopy}
      className="trust-copy"
      aria-label={copied ? 'copied' : 'copy trust.md url'}
    >
      <span>trust.md</span>
      <span className="trust-copy-icon">{copied ? ICON_CHECK : ICON_COPY}</span>
    </button>
  );
}
