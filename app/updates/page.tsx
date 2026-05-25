import { loadAllUpdates } from '../lib/updates';
import UpdatesIndex from './UpdatesIndex';

export const metadata = {
  title: 'updates — alexandria',
  description: 'patron updates from alexandria. four beats — delta, moment, miss, next.',
};

export default function UpdatesIndexPage() {
  const updates = loadAllUpdates();
  return <UpdatesIndex updates={updates} />;
}
