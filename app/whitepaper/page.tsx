import PublicDocReader from '../components/PublicDocReader';
import { pageMetadata } from '../lib/config';

// Page-specific metadata. Without this, /whitepaper inherits the homepage
// <title> and <meta name="description"> from app/layout.tsx — generic
// site-wide copy that hurts SEO and click-through for one of the highest-
// value pages in the sitemap. Title names the artifact; description honours
// the whitepaper's actual argument (what ai leaves for humans → why human
// provenance retains value → the practice that keeps the person involved).
const TITLE = 'the whitepaper — alexandria. the human path through AI';
const DESCRIPTION =
  'From first principles: what remains for humans when machines can do everything, and how a person remains themselves through the change.';

export const metadata = pageMetadata({
  path: '/whitepaper',
  title: TITLE,
  description: DESCRIPTION,
  type: 'article',
});

// The whitepaper's own suggested questions. Each names an argument the current
// paper and public shadow both carry, so the mirror can answer on this reader
// and from the public profile without relying on hidden or invite-tier context.
// The mirror is a supplement, not a replacement (founder 2026-07-28).
// The Artifact Loop generates these per piece automatically; the whitepaper is
// a deliberately authored genesis artifact, so its set is authored here.
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
  'why are sovereign files plus a personal loop the optimal structure?',
  'how does the collective improve each person without making them generic?',
];

export default function WhitepaperPage() {
  // numbered + plain — the genesis book setting (TOC, hanging numerals,
  // colophon plate) inside the reader, matching the approved standalone form.
  return <PublicDocReader title="the whitepaper" mdSrc="/docs/Whitepaper.md" numbered plain askQuestions={WHITEPAPER_QUESTIONS} />;
}
