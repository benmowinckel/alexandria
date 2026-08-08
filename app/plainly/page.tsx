import type { Metadata } from 'next';
import PublicDocReader from '../components/PublicDocReader';
import { pageMetadata } from '../lib/config';

// /plainly — the EXTENDED depth level (2026-07-29, three-level site:
// simple = back slide · extended = this page · infinite = the ask).
// The document is THE CANONICAL RUN-THROUGH (a4, locked 2026-07-29,
// rendered at public/docs/Plainly.md — derive there, edit canon first).
// The text leads (docked ask beneath): its whole job is converting a
// zero-context reader into pressing the button; the mirror catches
// whoever still has a question standing between them and it.
const TITLE = 'alexandria, plainly.';
const DESCRIPTION =
  'How your own AI builds an owned record of your thinking and its changes, what it helps you do, and why to start today.';

const PAGE_META = pageMetadata({
  path: '/plainly',
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

// The rotation skews to the questions that stand between a convinced
// reader and the button — the infinite level exists to close, not to
// entertain.
const PLAINLY_QUESTIONS = [
  'what exactly happens when i paste the line in?',
  'how is this different from chatgpt’s memory?',
  'is anything i write ever sent anywhere?',
  'what would actually change for me in the first week?',
  'do i have to leave the apps i already use?',
  'do i need to be technical?',
  'what exactly do i own?',
  'why is it free?',
  'what’s the strongest objection to alexandria?',
];

export default function PlainlyPage() {
  return (
    <PublicDocReader
      title="alexandria, plainly"
      mdSrc="/docs/Plainly.md"
      askQuestions={PLAINLY_QUESTIONS}
    />
  );
}
