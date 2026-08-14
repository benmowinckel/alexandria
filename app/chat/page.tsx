import Link from 'next/link';
import { ThemeToggle } from '../components/ThemeToggle';
import { pageMetadata } from '../lib/config';
import ChatDoor from './ChatDoor';
import './chat.css';

export const metadata = pageMetadata({
  path: '/chat',
  title: 'start alexandria.',
  description:
    'add an alexandria loop to chatgpt, claude, or gemini, then let your own ai build and prove its first personal record.',
});

function cleanRef(raw: string | undefined): string {
  return (raw || '').replace(/[^A-Za-z0-9-]/g, '').slice(0, 39);
}

// Door 2 of the two-door onboarding (agents → /start; chat → here).
// Which ai → Shortcut → optional email → account instructions → normal-chat setup.
export default async function ChatPage({
  searchParams,
}: {
  searchParams: Promise<{ ref?: string }>;
}) {
  const params = await searchParams;
  const ref = cleanRef(params.ref) || undefined;

  return (
    <div className="primer-page">
      <ThemeToggle />

      <header className="primer-header">
        <Link href="/" className="primer-brand">
          alexandria<span className="primer-brand-dot">.</span>
        </Link>
      </header>

      <main className="primer-main">
        <h1 className="primer-h1">start your loop</h1>
        <ChatDoor refCode={ref} />
      </main>
    </div>
  );
}
