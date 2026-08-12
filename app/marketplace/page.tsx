import type { Metadata } from 'next';
import Link from 'next/link';
import { ThemeToggle } from '../components/ThemeToggle';
import SiteFooter from '../components/SiteFooter';
import { SERVER_URL, pageMetadata } from '../lib/config';
import { MarketplaceDirectory, type MarketplaceModule } from './MarketplaceDirectory';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  ...pageMetadata({
    path: '/marketplace',
    title: 'marketplace — alexandria.',
    description: 'The core, defaults, and additions for an Alexandria loop.',
  }),
};

interface MarketplaceResponse {
  modules: MarketplaceModule[];
  total: number;
  next_cursor: string | null;
}

function canonicalModuleId(id: string): string {
  const match = id.match(/^github:([^/]+)\/([^#]+)#(.+)$/);
  if (!match) return id;
  const founder = ['mowinckelb', 'benmowinckel'].includes(match[1].toLowerCase());
  const user = founder ? 'benmowinckel' : match[1];
  const repo = founder && match[2] === 'alexandria-systems' ? 'alexandria-modules' : match[2];
  return `github:${user}/${repo}#${match[3]}`;
}

async function loadModules(): Promise<MarketplaceModule[]> {
  try {
    const res = await fetch(`${SERVER_URL}/marketplace`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json() as Partial<MarketplaceResponse>;
    // The website and Worker deploy independently. Collapse legacy founder IDs
    // here too so a rolling deploy cannot briefly duplicate a module.
    const normalized = new Map<string, MarketplaceModule>();
    for (const entry of data.modules || []) {
      const id = canonicalModuleId(entry.id);
      const current = normalized.get(id);
      if (!current || entry.id.startsWith('github:benmowinckel/')) {
        normalized.set(id, {
          ...entry,
          id,
          author_github_login: id.startsWith('github:benmowinckel/') ? 'benmowinckel' : entry.author_github_login,
        });
      }
    }
    return [...normalized.values()];
  } catch {
    return [];
  }
}

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
        </header>

        {modules.length === 0 ? (
          <p className="mkt-empty">no modules yet.</p>
        ) : <MarketplaceDirectory modules={modules} />}
      </main>
      <SiteFooter cta="start your loop" />
    </div>
  );
}
