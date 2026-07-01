import type { Metadata } from 'next';
import MarkdownDoc from '../components/MarkdownDoc';
import { pageMetadata } from '../lib/config';

// Page-specific metadata. Without this, /whitepaper inherits the homepage
// <title> and <meta name="description"> from app/layout.tsx — generic
// site-wide copy that hurts SEO and click-through for one of the highest-
// value pages in the sitemap. Title names the artifact; description honours
// the whitepaper's actual argument (what ai leaves for humans → where humans
// still get paid → the practice that develops the part that wins).
const TITLE = 'whitepaper — alexandria. the path through the singularity';
const DESCRIPTION =
  'The full argument, from first principles: what AI leaves for humans, where humans still get paid, and the practice that develops the part that wins — your mind in a file you own, so every AI thinks with you, not for you.';

const PAGE_META = pageMetadata({
  path: '/whitepaper',
  title: TITLE,
  description: DESCRIPTION,
});

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: PAGE_META.alternates,
  // the whitepaper is an article, not a website — override OG_BASE's type
  // while keeping pageMetadata's canonical/og:url contribution.
  openGraph: { ...PAGE_META.openGraph, type: 'article' },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function WhitepaperPage() {
  return (
    <MarkdownDoc
      src="/docs/Whitepaper.md"
      header=""
      homeHref="/"
      numbered
      plain
    />
  );
}
