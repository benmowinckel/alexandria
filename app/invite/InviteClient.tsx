'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { checkReferral } from '../lib/referral';

// One thought, one action. The invitation is a personal handoff to the free
// loop, not a miniature sales page.
//
// The inviter only shows once /check-kin confirms a real member. The sanitized
// candidate rides /start immediately so a fast click cannot lose it; /start
// and the OAuth callback validate it again before storage or credit.
export default function InviteClient({ refCode }: { refCode?: string }) {
  const [validRef, setValidRef] = useState<string | null>(null);

  useEffect(() => {
    if (!refCode) { setValidRef(null); return; }
    let live = true;
    (async () => {
      const valid = await checkReferral(refCode);
      if (live) setValidRef(valid ? refCode : null);
    })();
    return () => { live = false; };
  }, [refCode]);

  useEffect(() => {
    if (!validRef) return;
    try { window.localStorage.setItem('alexandria-referrer', validRef); } catch { /* storage is optional */ }
  }, [validRef]);

  // Carry the sanitized candidate immediately so a fast click cannot outrun
  // validation. /start and the OAuth callback validate it again before it is
  // stored or credited.
  const startHref = refCode ? `/start?ref=${refCode}` : '/start';

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
            <>@{validRef} thought of you.</>
          ) : (
            <>A friend thought of you.</>
          )}
        </h1>

        <Link className="invite-start" href={startHref}>
          start your loop<span> &mdash; trust their judgment</span>
        </Link>
      </main>
    </>
  );
}
