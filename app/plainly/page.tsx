import { permanentRedirect } from 'next/navigation';

export default function LegacyAskRedirect() {
  permanentRedirect('/start');
}
