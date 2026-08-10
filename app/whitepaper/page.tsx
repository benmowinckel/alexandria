import type { Metadata } from 'next';
import PublicDocReader from '../components/PublicDocReader';
import { pageMetadata } from '../lib/config';

// Page-specific metadata. Without this, /whitepaper inherits the homepage
// <title> and <meta name="description"> from app/layout.tsx — generic
// site-wide copy that hurts SEO and click-through for one of the highest-
// value pages in the sitemap. Title names the artifact; description honours
// the whitepaper's actual argument (what ai leaves for humans → why human
// provenance retains value → the practice that keeps the person involved).
const TITLE = 'whitepaper — alexandria. when a machine can do everything, what is a person for?';
const DESCRIPTION =
  'The full argument, from first principles: how humans remain themselves, survive, and build lives they value as AI removes material necessity.';

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

// The whitepaper's own suggested questions. Each names an argument the current
// paper and public shadow both carry, so the mirror can answer on this reader
// and from the public profile without relying on hidden or invite-tier context.
// The mirror is a supplement, not a replacement (founder 2026-07-28).
// The Artifact Loop generates these per piece automatically; the whitepaper is
// a frozen genesis artifact, so its set is authored here.
const WHITEPAPER_QUESTIONS = [
  'if ai can do everything, what remains valuable about a person?',
  'what does max net human value mean beyond money?',
  'why is agency the one certain lever in an uncertain future?',
  'how do the three turns and four Cs describe a life worth living?',
  'what does the paper mean by human provenance?',
  'why are atrophy and replacement different risks?',
  'what is the chair argument?',
  'what are the filter’s two deaths?',
  'could a silicon copy really be the same person?',
  'how do the files and the alexandria loop keep someone involved?',
];

export default function WhitepaperPage() {
  // numbered + plain — the genesis book setting (TOC, hanging numerals,
  // colophon plate) inside the reader, matching the approved standalone form.
  return <PublicDocReader title="whitepaper" mdSrc="/docs/Whitepaper.md" numbered plain askQuestions={WHITEPAPER_QUESTIONS} />;
}
