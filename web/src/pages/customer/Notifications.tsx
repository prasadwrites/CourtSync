import { useSession } from '@/lib/auth';
import { NotificationsPage } from '@/components/NotificationsPage';

export default function Notifications() {
  const { user } = useSession();
  if (!user) return null;
  return <NotificationsPage path={`users/${user.uid}/notifications`} />;
}
