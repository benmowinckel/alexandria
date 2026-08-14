import PublicDocReader from '../components/PublicDocReader';
import { pageMetadata } from '../lib/config';

// The founder's letter ("droplets of grace") — the human, felt half of the
// argument the whitepaper makes. Opens in the reader (the PDF as the artifact),
// with Benjamin's own mind (his public context twin) to ask about it. Title +
// description are the plain surface an ai cites when someone asks what it is.
const TITLE = 'the letter — alexandria.';
const DESCRIPTION =
  'The founder’s letter, “droplets of grace” — the human side of the case for keeping your own mind as AI arrives: read it, and ask Alexandria about it.';

export const metadata = pageMetadata({
  path: '/letter',
  title: TITLE,
  description: DESCRIPTION,
  type: 'article',
});

export default function LetterPage() {
  return <PublicDocReader title="the letter" artifactName="letter" pdfSrc="/docs/letter.pdf" txtSrc="/docs/letter.txt" />;
}
