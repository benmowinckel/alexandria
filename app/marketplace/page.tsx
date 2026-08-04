import type { Metadata } from 'next';
import Link from 'next/link';
import { ThemeToggle } from '../components/ThemeToggle';
import SiteFooter from '../components/SiteFooter';
import { SERVER_URL, pageMetadata } from '../lib/config';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  ...pageMetadata({
    path: '/marketplace',
    title: 'marketplace — alexandria.',
    description: 'The reusable parts people built for their Alexandria loops — shared so anyone can use them, improve them, and pass the improvements on.',
  }),
};

interface MarketplaceModule {
  id: string;
  name: string;
  description: string;
  author_github_login: string | null;
  kind: string;
  status: 'ok' | 'unreachable';
}

interface MarketplaceResponse {
  modules: MarketplaceModule[];
  total: number;
  next_cursor: string | null;
}

interface ParsedId {
  user: string;
  repo: string;
  path: string;
}

function parseGithubId(id: string): ParsedId | null {
  const m = id.match(/^github:([^\/]+)\/([^#]+)#(.+)$/);
  if (!m) return null;
  // Legacy module ids predate the repo rename alexandria-systems →
  // alexandria-modules; normalise so click-throughs skip the 301.
  const repo = m[2] === 'alexandria-systems' ? 'alexandria-modules' : m[2];
  return { user: m[1], repo, path: m[3] };
}

// Canonical Machine — the factory's output repo. Items here are Alexandria's;
// items in any other repo are forks / community contributions.
function isCanonical(parsed: ParsedId | null): boolean {
  return !!parsed && parsed.user === 'benmowinckel' && parsed.repo === 'alexandria';
}

async function loadModules(): Promise<MarketplaceModule[]> {
  try {
    const res = await fetch(`${SERVER_URL}/marketplace`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json() as Partial<MarketplaceResponse>;
    return data.modules || [];
  } catch {
    return [];
  }
}

const CANONICAL_BADGE_STYLE: React.CSSProperties = {
  marginLeft: '0.5rem',
  fontSize: '0.7rem',
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--text-muted)',
  border: '1px solid var(--border-light)',
  borderRadius: '2px',
  padding: '1px 6px',
  verticalAlign: '2px',
  fontWeight: 600,
};

export default async function MarketplacePage() {
  const modules = await loadModules();

  return (
    <div className="mkt-page">
      <ThemeToggle />
      <main className="mkt-main">
        <header className="mkt-header">
          <Link href="/" className="mkt-brand">
            alexandria<span className="mkt-brand-dot">.</span>
          </Link>
          <p className="mkt-eyebrow">the collective</p>
          <h1 className="mkt-h1">the marketplace</h1>
          <p className="mkt-lede">
            The reusable parts people built for their loops — shared here so anyone can use them, improve them, and pass the improvements on.
          </p>
        </header>

        {modules.length === 0 ? (
          <p className="mkt-empty">no modules yet.</p>
        ) : (
          // No per-row hairlines — whitespace separates the modules (design.md,
          // the recurring "too many lines" note). One editorial column, each
          // module a quiet block.
          <section className="mkt-list">
            {modules.map((m) => {
              const parsed = parseGithubId(m.id);
              // Click-through targets github directly — github is the marketplace
              // substrate (markdown rendering, forks, comments, history); this
              // page is the curated cross-repo index.
              const href = parsed ? `https://github.com/${parsed.user}/${parsed.repo}/blob/HEAD/${parsed.path}.md` : null;
              const canonical = isCanonical(parsed);
              const author = canonical ? null : m.author_github_login;
              const inner = (
                <>
                  <h2 style={{ fontSize: '1.12rem', fontWeight: 400, color: 'var(--text-primary)', margin: 0, letterSpacing: '-0.005em' }}>
                    {m.name}
                    {canonical && <span style={CANONICAL_BADGE_STYLE}>canonical</span>}
                    {author && (
                      <span style={{ marginLeft: '0.6rem', fontSize: '0.82rem', color: 'var(--text-ghost)', fontWeight: 400 }}>
                        · {author}
                      </span>
                    )}
                  </h2>
                  {m.description && (
                    <p style={{ fontSize: '0.92rem', color: 'var(--text-muted)', lineHeight: 1.55, margin: '0.45rem 0 0' }}>
                      {m.description}
                    </p>
                  )}
                </>
              );
              return (
                <article key={m.id}>
                  {href ? (
                    <a
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      style={{ textDecoration: 'none', color: 'inherit', display: 'block', transition: 'opacity 0.15s' }}
                      className="hover:opacity-60"
                    >
                      {inner}
                    </a>
                  ) : inner}
                </article>
              );
            })}
          </section>
        )}
      </main>
      <SiteFooter cta="start your loop" />

      <style>{`
        .mkt-page {
          background: var(--bg-primary);
          color: var(--text-primary);
          min-height: 100vh;
          display: flex;
          flex-direction: column;
          font-family: var(--font-eb-garamond), ui-serif, Georgia, serif;
          background-image:
            radial-gradient(ellipse 120% 80% at 30% 15%, rgba(91, 31, 71, 0.025) 0%, transparent 60%),
            radial-gradient(ellipse 100% 70% at 72% 85%, rgba(74, 50, 30, 0.020) 0%, transparent 60%);
          animation: mktFadeIn 700ms cubic-bezier(0.2, 0.7, 0.2, 1) both;
        }
        @keyframes mktFadeIn { 0% { opacity: 0; transform: translateY(6px); } 100% { opacity: 1; transform: none; } }

        .mkt-main { flex: 1; width: 100%; max-width: 600px; margin: 0 auto; padding: 5.5rem 2rem 2rem; }
        .mkt-header { margin-bottom: 2.6rem; }
        .mkt-brand {
          font-family: var(--font-eb-garamond), ui-serif, Georgia, serif;
          font-style: italic; font-size: 1.25rem; color: var(--text-primary);
          text-decoration: none; letter-spacing: 0.005em;
          display: inline-block; padding: 10px 8px; margin: -10px -8px; transition: opacity 220ms ease;
        }
        .mkt-brand:hover { opacity: 0.6; }
        .mkt-brand-dot { font-style: normal; }
        .mkt-eyebrow {
          margin: 1.8rem 0 0; font-weight: 500; font-size: 11px; letter-spacing: 0.3em;
          text-transform: lowercase; font-variant-caps: all-small-caps;
          font-feature-settings: "smcp" 1, "kern" 1; color: var(--accent); line-height: 1;
        }
        .mkt-h1 {
          margin: 0.7rem 0 0; font-style: italic; font-weight: 500;
          font-size: clamp(28px, 1.5rem + 1.5vw, 36px); line-height: 1.1;
          letter-spacing: -0.01em; color: var(--text-primary);
          font-feature-settings: "kern" 1, "liga" 1, "dlig" 1, "swsh" 1;
        }
        .mkt-lede { margin: 1rem 0 0; max-width: 30rem; font-size: 1rem; line-height: 1.6; color: var(--text-secondary); text-wrap: pretty; }

        .mkt-empty { color: var(--text-ghost); font-size: 0.95rem; margin-top: 2rem; }
        .mkt-list { margin-top: 2.4rem; display: flex; flex-direction: column; gap: 1.7rem; }

        @media (max-width: 640px) {
          .mkt-main { padding: 4rem 1.5rem 1.5rem; }
        }
      `}</style>
    </div>
  );
}
