'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SERVER_URL } from '../lib/config';

// Radically-simple invite (founder, 2026-07-25 — same law as /start, /chat,
// /join): one hero, one vouch line, ONE primary box, muted terms, exit boxes
// in the one grammar (bold words — muted why). The friend-vouch frame
// (2026-07-17) survives compressed: the hero carries who, the vouch line
// carries why-you, "work it out together" closes the terms.
//
// Wiring unchanged: the ref (inviter's GitHub login) only shows once
// /check-kin confirms a real member; the validated ref rides /start for kin
// attribution. Exits: the website (see it first) and the /features ask page
// (the founder's mirror answers a cold reader's questions).
export default function InviteClient({ refCode }: { refCode?: string }) {
  const [validRef, setValidRef] = useState<string | null>(null);

  useEffect(() => {
    if (!refCode) { setValidRef(null); return; }
    let live = true;
    (async () => {
      try {
        const resp = await fetch(`${SERVER_URL}/check-kin?code=${encodeURIComponent(refCode)}`);
        const data = await resp.json().catch(() => ({ valid: false }));
        if (live) setValidRef(resp.ok && data.valid ? refCode : null);
      } catch {
        if (live) setValidRef(null);
      }
    })();
    return () => { live = false; };
  }, [refCode]);

  const startHref = validRef ? `/start?ref=${validRef}` : '/start';

  return (
    <>
      <header className="primer-header">
        <Link href="/" className="primer-brand">
          alexandria<span className="primer-brand-dot">.</span>
        </Link>
      </header>

      <main className="primer-main">
        <h1 className="invite-hero">
          {validRef ? (
            <>@{validRef} sent you alexandria.</>
          ) : (
            <>A friend sent you alexandria.</>
          )}
        </h1>

        <p className="invite-vouch">
          They know you, they know what this is &mdash; and they thought
          of you.
        </p>

        <Link className="door-btn act-box act-primary" href={startHref}>
          take it<span className="act-why act-why-inverse"> &mdash; it&rsquo;s free</span>
        </Link>

        <p className="invite-terms">
          about five minutes, all on your own computer &mdash; nothing ever leaves it.
        </p>
        <p className="invite-terms">
          then work out what it can do together.
        </p>

        <div className="invite-exits">
          <Link className="door-btn act-box" href="/">
            see it first<span className="act-why"> &mdash; the website</span>
          </Link>
          <Link className="door-btn act-box" href="/features">
            ask anything<span className="act-why"> &mdash; about what this is</span>
          </Link>
        </div>
      </main>
    </>
  );
}
