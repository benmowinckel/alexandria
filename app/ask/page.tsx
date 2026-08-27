import { pageMetadata } from '../lib/config';
import AskClient from './AskClient';

// /ask is the second homepage door: a question-led surface, not another
// document. The public mirror carries changing detail; the page carries only
// the human-authored frame and one short explanation.
const TITLE = 'before you start.';
const DESCRIPTION =
  'Ask what you actually want to know about an Alexandria loop before you start.';

export const metadata = pageMetadata({
  path: '/ask',
  title: TITLE,
  description: DESCRIPTION,
  type: 'article',
});

export default function AskPage() {
  return <AskClient />;
}
