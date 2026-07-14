import type { Metadata } from 'next';
import MarkdownDoc from '../components/MarkdownDoc';
import { pageMetadata } from '../lib/config';

// The auditor's page. Alexandria's install puts files on your machine and
// pulls signed code from GitHub each session — this is the plain account
// of exactly what runs, what the server holds, and how to verify it.
// Linked from the FAQ ("is it safe to install?"), not the landing footer.
const TITLE = 'mechanics — alexandria. what the install does';
const DESCRIPTION =
  'the auditable account: what alexandria installs on your machine, what the server holds (and does not), the trust model, and how to inspect every line before you run it.';

const PAGE_META = pageMetadata({
  path: '/mechanics',
  title: TITLE,
  description: DESCRIPTION,
});

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: PAGE_META.alternates,
  // a trust document, not a website — override OG_BASE's type while
  // keeping pageMetadata's canonical/og:url contribution.
  openGraph: { ...PAGE_META.openGraph, type: 'article' },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function MechanicsPage() {
  return (
    <MarkdownDoc
      src="/docs/Mechanics.md"
      header=""
      homeHref="/"
      plain
      cta
    />
  );
}
