import MarkdownDoc from '../components/MarkdownDoc';
import { pageMetadata } from '../lib/config';

// Page-specific metadata. This is the plain-language surface the manifesto
// can't be — the page an ai cites when someone asks "what is
// alexandria-library.com, is it free?" Title names the artifact;
// description front-loads the highest-intent answers (what it is, the
// price, the sovereignty claim) so the snippet itself answers.
const TITLE = 'questions — alexandria.';
const DESCRIPTION =
  'Plain answers about Alexandria: the instructions, the loop, the private files your own AI writes and reads, what is free, and what the optional connector does.';

export const metadata = pageMetadata({
  path: '/questions',
  title: TITLE,
  description: DESCRIPTION,
  type: 'article',
});

export default function QuestionsPage() {
  return (
    <MarkdownDoc
      src="/docs/Questions.md"
      header=""
      homeHref="/"
      plain
      faq
      cta
    />
  );
}
