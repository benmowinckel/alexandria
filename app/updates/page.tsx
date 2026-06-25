import { loadAllUpdates } from '../lib/updates';
import UpdatesIndex from './UpdatesIndex';

export const metadata = {
  title: 'updates — alexandria',
  description: 'member updates from alexandria.',
};

export default function UpdatesIndexPage() {
  const updates = loadAllUpdates();
  return <UpdatesIndex updates={updates} />;
}
