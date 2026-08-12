import PublicDocReader from '../components/PublicDocReader';
import { pageMetadata } from '../lib/config';

// The feature slides land here, so the feature document leads. The founder's
// public mirror remains one tap away for any question the page leaves open.
const TITLE = 'the features — alexandria.';
const DESCRIPTION =
  'Ask the founder’s mirror anything about Alexandria — or read the eight features plainly: personalisation, development, saved posts, capture, one mind, ownership, plugs in, and the mirror.';

export const metadata = pageMetadata({
  path: '/features',
  title: TITLE,
  description: DESCRIPTION,
  type: 'article',
});

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
    />
  );
}
