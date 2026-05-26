import type { Metadata } from 'next';
import Link from 'next/link';
import { ThemeToggle } from '../components/ThemeToggle';
import { SERVER_URL, pageMetadata } from '../lib/config';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: 'marketplace — alexandria.',
  description: "each Author's system decomposes into modules — pooled here so others can learn, share signal, and refine their own.",
  ...pageMetadata({
    path: '/marketplace',
    title: 'marketplace — alexandria.',
    description: "each Author's system decomposes into modules — pooled here so others can learn, share signal, and refine their own.",
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
  return { user: m[1], repo: m[2], path: m[3] };
}

// Canonical Machine — the factory's output repo. Items here are Alexandria's;
// items in any other repo are forks / community contributions.
function isCanonical(parsed: ParsedId | null): boolean {
  return !!parsed && parsed.user === 'mowinckelb' && parsed.repo === 'alexandria';
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
    <>
      <ThemeToggle />
      <main style={{ maxWidth: '560px', margin: '0 auto', padding: '6rem 2rem 4rem', fontFamily: 'var(--font-eb-garamond)' }}>
        <header style={{ marginBottom: '1.5rem' }}>
          <Link href="/" style={{ color: 'var(--text-muted)', textDecoration: 'none', fontSize: '0.9rem', display: 'inline-block', padding: '10px 0', margin: '-10px 0' }}>
            alexandria.
          </Link>
          <h1 style={{ fontSize: '1.55rem', fontWeight: 400, color: 'var(--text-primary)', margin: '2rem 0 0', letterSpacing: '-0.01em' }}>
            marketplace
          </h1>
          <p style={{ color: 'var(--text-ghost)', fontSize: '0.88rem', lineHeight: 1.5, margin: '0.6rem 0 0' }}>
            each Author&apos;s system decomposes into modules — pooled here so others can learn, share signal, and refine their own.
          </p>
        </header>

        {modules.length === 0 ? (
          <p style={{ color: 'var(--text-ghost)', fontSize: '0.9rem', marginTop: '2rem' }}>
            no modules yet.
          </p>
        ) : (
          <section style={{ marginTop: '2rem' }}>
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
                  <h2 style={{ fontSize: '1.1rem', fontWeight: 400, color: 'var(--text-primary)', margin: 0 }}>
                    {m.name}
                    {canonical && <span style={CANONICAL_BADGE_STYLE}>canonical</span>}
                    {author && (
                      <span style={{ marginLeft: '0.6rem', fontSize: '0.82rem', color: 'var(--text-ghost)', fontWeight: 400 }}>
                        · {author}
                      </span>
                    )}
                  </h2>
                  {m.description && (
                    <p style={{ fontSize: '0.88rem', color: 'var(--text-muted)', lineHeight: 1.5, margin: '0.6rem 0 0' }}>
                      {m.description}
                    </p>
                  )}
                </>
              );
              return (
                <article key={m.id} style={{ padding: '1.1rem 0', borderTop: '1px solid var(--border-light)' }}>
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
    </>
  );
}
