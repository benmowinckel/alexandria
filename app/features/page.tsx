import type { Metadata } from 'next';
import PublicDocReader from '../components/PublicDocReader';
import { pageMetadata } from '../lib/config';

// The ask-about-alexandria page. The founder's public mirror sits at the
// front — open questions about the product, the company, him — grounded
// in the features document below it, which the reader can also just read.
// Same shell as the whitepaper and letter (ReaderShell + the mirror):
// asking a mind built with Alexandria IS the pitch. Linked from the back
// slide beside the demo ("ask about alexandria").
const TITLE = 'the features — alexandria. ask anything, or read the eight.';
const DESCRIPTION =
  'ask the founder’s mirror anything about alexandria — or read the eight features plainly: personalisation, development, saved posts, capture, one mind, ownership, plugs in, the mirror.';

const PAGE_META = pageMetadata({
  path: '/features',
  title: TITLE,
  description: DESCRIPTION,
});

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: PAGE_META.alternates,
  openGraph: { ...PAGE_META.openGraph, type: 'article' },
  twitter: {
    card: 'summary_large_image',
    title: TITLE,
    description: DESCRIPTION,
  },
};

// The page's own suggested questions — the mirror answers with the
// features doc as focus, so each is guaranteed grounded. Mix of concrete
// (feature mechanics) and open (company) asks.
const FEATURES_QUESTIONS = [
  'what is the alexandria loop?',
  'what would actually change for me in the first week?',
  'how is this different from chatgpt’s memory?',
  'do i need to be technical?',
  'do i have to leave the apps i already use?',
  'what exactly do i own?',
  'is anything i write ever sent anywhere?',
  'why is it free?',
  'what’s the strongest objection to alexandria?',
];

export default function FeaturesPage() {
  return (
    <PublicDocReader
      title="the features"
      mdSrc="/docs/Features.md"
      askQuestions={FEATURES_QUESTIONS}
      askFirst
    />
  );
}
