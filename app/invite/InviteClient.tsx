'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { SERVER_URL } from '../lib/config';

// The invitation, personalised. The ref (the inviter's GitHub login) is only
// shown once /check-kin confirms it's a real member — a fake/typo ref renders
// the generic "a friend sent you" version, same as everywhere else on the
// site. The validated ref rides the try-it link to /start, which carries it
// through install → eventual join for kin attribution.
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

      {/* The friend-vouch frame (founder 2026-07-17): this page never
          resells the company — the website does that. It leans entirely on
          the referral: someone you trust already vetted this, thinks it fits
          you, and wants you in. It's free, so just take it now and talk to
          them about it after. Rough what-it-is + website link for whoever
          wants to see for themselves first. */}
      <main className="primer-main">
        <h1 className="invite-hero">
          {validRef ? (
            <>@{validRef} sent you alexandria.</>
          ) : (
            <>A friend sent you alexandria.</>
          )}
        </h1>
        {/* Texture over block; the free-sample metaphor dropped for a
            zero-context reader (founder 2026-07-18) — say the plain thing:
            free, nothing to buy or sign up for, take it and figure it out
            together. */}
        <p className="invite-lede">
          They&rsquo;ve already vetted it. They know you, they know what
          this is &mdash; and they thought of you. It&rsquo;s free, with
          nothing to buy and nothing to sign up for. So just take it now,
          and work out what it can do <em>together</em>.
        </p>

        <Link className="invite-btn" href={startHref}>
          take it &mdash; it&rsquo;s free
        </Link>
        {/* Value under the button (founder 2026-07-18: the old 'one line to
            paste' added nothing) — the concrete facts that make the click
            feel small: quick, private, and your friend already did it. */}
        <p className="invite-hint">
          About five minutes, all on your own computer. Nothing leaves it.
        </p>

        <p className="invite-more">
          Roughly what it is: your thinking, in files your ai reads &mdash;
          so it thinks <em>with</em> you, not for you. Rather see for
          yourself first? <Link href="/">alexandria-library.com</Link>
        </p>
      </main>
    </>
  );
}
