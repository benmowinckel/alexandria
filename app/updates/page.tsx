import { loadAllUpdates } from '../lib/updates';
import { pageMetadata } from '../lib/config';
import UpdatesIndex from './UpdatesIndex';

export const metadata = pageMetadata({
  path: '/updates',
  title: 'updates — alexandria',
  description: 'Notes for Alexandria members: what changed, why it changed, and what to do with it.',
  type: 'article',
});

export default function UpdatesIndexPage() {
  const updates = loadAllUpdates();
  return <UpdatesIndex updates={updates} />;
}
