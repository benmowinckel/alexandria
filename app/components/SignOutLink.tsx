'use client';

import { useState } from 'react';
import { HeaderAction } from './HeaderActions';

/** Ends the browser Library session and reloads this page signed-out. */
export async function endLibrarySession(): Promise<boolean> {
  try {
    const res = await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    return res.ok;
  } catch {
    return false;
  }
}

export function SignOutLink() {
  const [busy, setBusy] = useState(false);

  const onClick = async () => {
    if (busy) return;
    setBusy(true);
    const ok = await endLibrarySession();
    if (ok) {
      window.location.reload();
      return;
    }
    setBusy(false);
  };

  return (
    <HeaderAction onClick={onClick} busy={busy}>
      {busy ? 'signing out' : 'sign out'}
    </HeaderAction>
  );
}
