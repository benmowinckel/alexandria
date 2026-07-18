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
        <p className="primer-eyebrow">an invitation</p>
        <h1 className="invite-hero">
          {validRef ? (
            <>@{validRef} sent you alexandria.</>
          ) : (
            <>A friend sent you alexandria.</>
          )}
        </h1>
        <p className="invite-lede">
          They&rsquo;ve already vetted it, and they sent it because they
          think it&rsquo;s for you. It&rsquo;s free &mdash; a sample, not a
          purchase &mdash; so just take it now, and talk to them after about
          using it together.
        </p>

        <Link className="invite-btn" href={startHref}>
          take it &mdash; it&rsquo;s free
        </Link>
        <p className="invite-hint">one line to paste &mdash; it walks you through the rest.</p>

        <p className="invite-more">
          Roughly what it is: your thinking, in files your ai reads &mdash;
          so it thinks <em>with</em> you, not for you. Rather see for
          yourself first? <Link href="/">alexandria-library.com</Link>
        </p>

        <p className="primer-coda"><em>keep thinking.</em></p>
      </main>
    </>
  );
}
