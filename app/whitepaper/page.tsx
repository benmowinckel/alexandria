import type { Metadata } from 'next';
import MarkdownDoc from '../components/MarkdownDoc';
import { pageMetadata } from '../lib/config';

// Page-specific metadata. Without this, /whitepaper inherits the homepage
// <title> and <meta name="description"> from app/layout.tsx — generic
// site-wide copy that hurts SEO and click-through for one of the highest-
// value pages in the sitemap. Title names the artifact; description honours
// the whitepaper's actual argument (commoditised cognition → write your mind
// into private files → every ai thinks with you, not for you).
const TITLE = 'whitepaper — alexandria. the path through the singularity';
const DESCRIPTION =
  'the full argument: why ai commoditises cognition, what humans are for, and how writing your mind into private files makes every ai think with you, not for you.';

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
