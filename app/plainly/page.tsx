import PublicDocReader from '../components/PublicDocReader';
import { pageMetadata } from '../lib/config';

// /plainly — EXTENDED conversion altitude (not a homepage re-pitch).
// Homepage already sold deeper · sovereign · unified and coined the
// alexandria loop. This page only carries what still blocks the click:
// paste/merge mechanics, passive+active, week-one vs months, influence
// contestability, worries, optional connector, why-now. Whitepaper stays
// the philosophy altitude; do not replace this with it.
// Title: "ask anything." (1–2 words — founder 2026-08-11; matches the
// ghost CTA door; was "alexandria, plainly." / "before the button." /
// "plainly."). Body stays click-blocker altitude.
const TITLE = 'ask anything.';
const DESCRIPTION =
  'What still sits between you and starting: how the recipe works, what changes in week one, how influence stays contestable, and what stays optional.';

export const metadata = pageMetadata({
  path: '/plainly',
  title: TITLE,
  description: DESCRIPTION,
  type: 'article',
});

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
  'why would i want my friends on it?',
  'what’s the strongest objection to alexandria?',
];

export default function PlainlyPage() {
  return (
    <PublicDocReader
      title="ask anything"
      mdSrc="/docs/Plainly.md"
      askQuestions={PLAINLY_QUESTIONS}
    />
  );
}
