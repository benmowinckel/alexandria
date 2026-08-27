import { pageMetadata } from '../lib/config';
import PublicDocReader from '../components/PublicDocReader';

const TITLE = 'before you start.';
const DESCRIPTION =
  'Ask what you actually want to know about an Alexandria loop before you start.';

const QUESTIONS = [
  'what happens when i start?',
  'does it work with the ai i already use?',
  'is this just better ai memory?',
  'what stays private?',
  'do i need to be technical?',
  'why start now?',
];

const ANSWER_INSTRUCTION = `Answer in no more than four short sentences, in plain language.
The reader is deciding whether to try the free loop. Answer only what they asked.
Write ai in lowercase. Do not add a generic sales close.`;

export const metadata = pageMetadata({
  path: '/ask',
  title: TITLE,
  description: DESCRIPTION,
  type: 'article',
});

export default function AskPage() {
  return (
    <PublicDocReader
      title={TITLE}
      artifactName="ask"
      mdSrc="/docs/Ask.md"
      askQuestions={QUESTIONS}
      answerInstruction={ANSWER_INSTRUCTION}
      askFirst
    />
  );
}
