'use client';

import { useEffect, useState } from 'react';
import { useTheme } from './ThemeProvider';

export function ThemeToggle({ inline = false, className = '' }: { inline?: boolean; className?: string }) {
  const { theme, toggleTheme } = useTheme();
  // Theme resolves on the client (localStorage + matchMedia), so the
  // icon must wait until mount — otherwise SSR and CSR disagree, and
  // dark-mode users see a flash of the light-mode icon.
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const frame = requestAnimationFrame(() => setMounted(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return (
    <button
      onClick={toggleTheme}
      className={`${inline ? '' : 'fixed right-1 top-1 z-[200]'} ${className} bg-transparent border-none cursor-pointer opacity-40 hover:opacity-65 focus-visible:opacity-80 focus-visible:outline focus-visible:outline-1 focus-visible:outline-current transition-opacity inline-flex items-center justify-center`}
      style={{ color: 'var(--text-primary)', width: 44, height: 44, borderRadius: '50%' }}
      aria-label={mounted ? (theme === 'light' ? 'Switch to dark mode' : 'Switch to light mode') : 'Switch theme'}
    >
      <svg width="10" height="10" viewBox="0 0 10 10" aria-hidden>
        {mounted && (theme === 'dark'
          ? <circle cx="5" cy="5" r="4" fill="currentColor" />
          : <circle cx="5" cy="5" r="4" fill="none" stroke="currentColor" strokeWidth="1" />
        )}
      </svg>
    </button>
  );
}
