import { NotificationsPage } from '@/components/NotificationsPage';
import { useCompany } from './context';

export default function CompanyNotifications() {
  const { companyId } = useCompany();
  return <NotificationsPage path={`companies/${companyId}/notifications`} />;
}
