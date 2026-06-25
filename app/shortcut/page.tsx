'use client';

import { ThemeToggle } from '../components/ThemeToggle';

const SHORTCUT_URL = 'https://www.icloud.com/shortcuts/0ea1bb7333fd43a9881e9c7b9938a337';

function DownloadIcon() {
  return (
    <svg width="46" height="46" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3.5 v11" />
      <path d="M7.5 10.5 L12 15 L16.5 10.5" />
      <path d="M4.5 20 h15" />
    </svg>
  );
}

export default function ShortcutPage() {
  return (
    <div style={{ background: 'var(--bg-primary)', color: 'var(--text-primary)', minHeight: '100vh' }}>
      <ThemeToggle />

      <section className="flex items-center justify-center min-h-screen px-6">
        <div className="flex flex-col items-center sm:flex-row sm:items-start justify-center">

          {/* Mac — click to add */}
          <a
            href={SHORTCUT_URL}
            className="flex flex-col items-center gap-7 px-10 sm:px-24 no-underline transition-opacity hover:opacity-60"
            style={{ color: 'var(--text-primary)' }}
          >
            <span className="text-[1.05rem] sm:text-[1.2rem] tracking-wide font-medium">Mac</span>
            {/* Box matches the QR card height so the icon centers on the QR's midline. */}
            <div className="flex items-center justify-center" style={{ height: '158px' }}>
              <DownloadIcon />
            </div>
          </a>

          {/* Divider */}
          <div className="hidden sm:block self-stretch w-px" style={{ background: 'var(--border-light)' }} />
          <div className="sm:hidden h-px w-20 my-12" style={{ background: 'var(--border-light)' }} />

          {/* iPhone — scan the code */}
          <div className="flex flex-col items-center gap-7 px-10 sm:px-24" style={{ color: 'var(--text-primary)' }}>
            <span className="text-[1.05rem] sm:text-[1.2rem] tracking-wide font-medium">iPhone</span>
            <div style={{ background: '#fff', padding: '14px', borderRadius: '14px', lineHeight: 0 }}>
              <img
                src="/shortcut-qr.svg"
                alt="Scan with your iPhone camera to add the shortcut"
                width={130}
                height={130}
                style={{ display: 'block' }}
              />
            </div>
          </div>

        </div>
      </section>
    </div>
  );
}
