'use client';

import { useState } from 'react';

// The keyless install one-liner. `/a` redirects (Vercel, next.config.ts) to the
// raw setup.sh; `curl -fsSL` follows it. No key = the free local product (the gym).
const INSTALL_CMD = 'curl -fsSL alexandria-library.com/a | bash';

// The claude-cli deep link returns (2026-07-01) in its honest form: an
// explicit, labelled button on the action page — "open in claude code" is
// consent, unlike the 2026-06-24 version where the homepage CTA silently
// deep-linked (felt like a terminal hijack, and most agents aren't CC).
// Most people DO have claude code, so the one-click path leads; the copy
// block below stays the universal fallback for every other agent.
const DEEP_LINK = `claude-cli://open?q=${encodeURIComponent(INSTALL_CMD)}`;

const ICON_COPY = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
    <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
  </svg>
);

const ICON_CHECK = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export default function StartCTA() {
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_CMD);
    } catch {
      // Fallback for browsers without async clipboard.
      const ta = document.createElement('textarea');
      ta.value = INSTALL_CMD;
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); } catch { /* noop */ }
      document.body.removeChild(ta);
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <section className="cta-section">
      <a className="cc-cta" href={DEEP_LINK}>
        open in claude code
      </a>
      <p className="install-hint cc-hint">
        it opens with the install ready &mdash; press enter and you&rsquo;re in.
      </p>

      <p className="cta-or" aria-hidden>or copy the command</p>

      <button type="button" className="install-block" onClick={copy} aria-label="copy the install command">
        <code className="install-cmd">{INSTALL_CMD}</code>
        <span className="install-copy">{copied ? ICON_CHECK : ICON_COPY}</span>
      </button>
      <p className="install-hint">
        {copied ? 'copied — now paste it into your coding agent.' : 'copy, then paste it into your coding agent.'}
      </p>
      <p className="install-where">
        claude code · cursor · codex · factory. in a chat or cowork? open one of those first &mdash; it needs a terminal.
      </p>
    </section>
  );
}
