import { permanentRedirect } from 'next/navigation';

export default function AskPage() {
  permanentRedirect('/start');
}
