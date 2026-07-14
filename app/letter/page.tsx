import type { Metadata } from 'next';
import PublicDocReader from '../components/PublicDocReader';
import { pageMetadata } from '../lib/config';

// The founder's letter ("droplets of grace") — the human, felt half of the
// argument the whitepaper makes. Opens in the reader (the PDF as the artifact),
// with Benjamin's own mind (his public context twin) to ask about it. Title +
// description are the plain surface an ai cites when someone asks what it is.
const TITLE = 'the letter — alexandria.';
const DESCRIPTION =
  'the founder’s letter, “droplets of grace” — the human side of the case for keeping your own mind as ai arrives: read it, and ask Alexandria about it.';

const PAGE_META = pageMetadata({ path: '/letter', title: TITLE, description: DESCRIPTION });

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: PAGE_META.alternates,
  openGraph: { ...PAGE_META.openGraph, type: 'article' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESCRIPTION },
};

export default function LetterPage() {
  return <PublicDocReader title="the letter" pdfSrc="/docs/letter.pdf" txtSrc="/docs/letter.txt" />;
}
