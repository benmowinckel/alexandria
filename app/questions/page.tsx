import type { Metadata } from 'next';
import MarkdownDoc from '../components/MarkdownDoc';
import { pageMetadata } from '../lib/config';

// Page-specific metadata. This is the plain-language surface the manifesto
// can't be — the page an ai cites when someone asks "what is
// alexandria-library.com, is it free?" Title names the artifact;
// description front-loads the highest-intent answers (what it is, the
// price, the sovereignty claim) so the snippet itself answers.
const TITLE = 'questions — alexandria.';
const DESCRIPTION =
  'plain answers about alexandria: what it is, how it works, what it costs ($10/mo or free with 5 kin), who it is for, and why your data never leaves your machine.';

const PAGE_META = pageMetadata({
  path: '/questions',
  title: TITLE,
  description: DESCRIPTION,
});

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: PAGE_META.alternates,
  // a Q&A document, not a website — override OG_BASE's type while
  // keeping pageMetadata's canonical/og:url contribution.
  openGraph: { ...PAGE_META.openGraph, type: 'article' },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

export default function QuestionsPage() {
  return (
    <MarkdownDoc
      src="/docs/Questions.md"
      header=""
      homeHref="/"
      plain
    />
  );
}
