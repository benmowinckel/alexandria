import type { Metadata } from 'next';
import Link from 'next/link';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { ThemeToggle } from '../components/ThemeToggle';
import { librarySignInUrl, SERVER_URL } from '../lib/config';
import ConnectClient from './ConnectClient';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'connect your ai — alexandria.',
  robots: { index: false, follow: false },
};

type SessionPayload = {
  signed_in?: boolean;
  membership_active?: boolean;
};

async function loadSession(): Promise<SessionPayload | null> {
  const cookie = (await headers()).get('cookie');
  try {
    const res = await fetch(`${SERVER_URL}/library/session`, {
      headers: cookie ? { Cookie: cookie } : {},
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return (await res.json()) as SessionPayload;
  } catch {
    return null;
  }
}

export default async function ConnectPage() {
  const session = await loadSession();
  if (!session?.signed_in) redirect(librarySignInUrl('/connect'));

  return (
    <div className="connect-page">
      <ThemeToggle />
      <header className="connect-header">
        <Link href="/" className="connect-brand">alexandria<span>.</span></Link>
      </header>
      <main className="connect-main">
        {session.membership_active ? (
          <>
            <h1>connect your ai.</h1>
            <p>copy this on your phone, then paste it into your ai on your computer.</p>
            <ConnectClient />
            <p className="connect-private">your private files stay on your computer. nothing connects until you say <em>connect</em> in Claude.</p>
          </>
        ) : (
          <>
            <h1>membership required.</h1>
            <p>this account is signed in, but its community membership is not active.</p>
            <Link href="/join" className="connect-link">join the community</Link>
          </>
        )}
      </main>
      <style>{`
        .connect-page { min-height: 100vh; background: var(--bg-primary); color: var(--text-primary); font-family: var(--font-eb-garamond), ui-serif, Georgia, serif; }
        .connect-header { position: fixed; top: 28px; left: clamp(24px, 6vw, 40px); }
        .connect-brand { color: var(--text-primary); font-style: italic; font-size: 1.3rem; text-decoration: none; }
        .connect-brand span { font-style: normal; }
        .connect-main { min-height: 100vh; max-width: 560px; margin: 0 auto; padding: 7rem 1.5rem 5rem; display: flex; flex-direction: column; justify-content: center; align-items: flex-start; }
        .connect-main h1 { margin: 0 0 1.2rem; font-style: italic; font-size: clamp(2.2rem, 7vw, 3rem); font-weight: 500; line-height: 1.08; }
        .connect-main > p { margin: 0 0 1.8rem; color: var(--text-secondary); font-size: 1.12rem; line-height: 1.65; }
        .connect-action { width: 100%; }
        .connect-button { width: 100%; padding: 1rem 1.2rem; border: 1px solid var(--border-light); border-radius: 10px; background: var(--bg-secondary); color: var(--text-primary); font: inherit; font-size: 1.08rem; cursor: pointer; transition: opacity 180ms ease, transform 120ms ease; }
        .connect-button:hover:not(:disabled) { opacity: 0.72; }
        .connect-button:active:not(:disabled) { transform: scale(0.993); }
        .connect-button:disabled { cursor: wait; opacity: 0.65; }
        .connect-paste { width: 100%; min-height: 13rem; margin: 0 0 0.75rem; padding: 1rem; border: 1px solid var(--border-light); border-radius: 10px; background: var(--bg-secondary); color: var(--text-primary); font: 0.82rem/1.45 ui-monospace, SFMono-Regular, Menlo, monospace; resize: vertical; }
        .connect-status, .connect-error { margin: 0.9rem 0 0; font-size: 1rem; line-height: 1.5; color: var(--text-muted); }
        .connect-error { color: var(--accent); }
        .connect-private { margin-top: 1.6rem !important; font-size: 0.98rem !important; color: var(--text-muted) !important; }
        .connect-link { color: var(--text-primary); font-size: 1.08rem; text-underline-offset: 4px; }
        @media (max-width: 640px) { .connect-header { top: 22px; left: 22px; } .connect-main { padding-top: 5.5rem; } }
      `}</style>
    </div>
  );
}
