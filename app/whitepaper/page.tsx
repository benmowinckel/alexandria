import type { Metadata } from 'next';
import PublicDocReader from '../components/PublicDocReader';
import { pageMetadata } from '../lib/config';

// Page-specific metadata. Without this, /whitepaper inherits the homepage
// <title> and <meta name="description"> from app/layout.tsx — generic
// site-wide copy that hurts SEO and click-through for one of the highest-
// value pages in the sitemap. Title names the artifact; description honours
// the whitepaper's actual argument (what ai leaves for humans → where humans
// still get paid → the practice that develops the part that wins).
const TITLE = 'whitepaper — alexandria. when a machine can do everything, what is a person for?';
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
  // numbered + plain — the genesis book setting (TOC, hanging numerals,
  // colophon plate) inside the reader, matching the approved standalone form.
  return <PublicDocReader title="whitepaper" mdSrc="/docs/Whitepaper.md" numbered plain />;
}
