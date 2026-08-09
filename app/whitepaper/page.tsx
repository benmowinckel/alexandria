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
  'The full argument, from first principles: what AI leaves for humans, why human provenance can retain value, and the practice that keeps you involved in your own change.';

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

// The whitepaper's own suggested questions. Written as a reader actually
// arrives — most haven't read a word yet, so the honest openers are "what is
// this", "why now", "what's the counter". Balanced deliberately against
// becoming a substitute for reading: "explain that last bit" only works
// alongside the text, and "which part should i read first" points back into
// it. The mirror is a supplement, not a replacement (founder 2026-07-28).
// The Artifact Loop generates these per piece automatically; the whitepaper is
// a frozen genesis artifact, so its set is authored here.
const WHITEPAPER_QUESTIONS = [
  'what’s this actually about?',
  'why does it matter now?',
  'what’s the biggest counter to it?',
  'explain that last bit in plain english',
  'what does “a mirror, not a twin” mean?',
  'which part should i read first?',
  'what is alexandria?',
];

export default function WhitepaperPage() {
  // numbered + plain — the genesis book setting (TOC, hanging numerals,
  // colophon plate) inside the reader, matching the approved standalone form.
  return <PublicDocReader title="whitepaper" mdSrc="/docs/Whitepaper.md" numbered plain askQuestions={WHITEPAPER_QUESTIONS} />;
}
