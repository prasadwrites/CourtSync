import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes, useParams } from 'react-router-dom';
import {
  BarChart3, Bell, Building, CalendarDays, CalendarOff, ClipboardList, Coins, CreditCard, IdCard, LayoutDashboard, LayoutGrid, Medal, ScanLine, ScrollText, Settings, UserCog, Users,
} from 'lucide-react';
import { useSession } from '@/lib/auth';
import { AdminShell, type NavItem } from '@/components/layout/AdminShell';
import { NotificationBell } from '@/components/NotificationBell';
import { Alert, ErrorState, FullPageSpinner, Spinner } from '@/components/ui';
import { CompanyProvider, useCompanyData } from './context';

const Dashboard = lazy(() => import('./Dashboard'));
const Calendar = lazy(() => import('./Calendar'));
const Bookings = lazy(() => import('./Bookings'));
const BookingDetail = lazy(() => import('./BookingDetail'));
const CheckIn = lazy(() => import('./CheckIn'));
const Customers = lazy(() => import('./Customers'));
const CustomerDetail = lazy(() => import('./CustomerDetail'));
const Verifications = lazy(() => import('./Verifications'));
const Courts = lazy(() => import('./Courts'));
const CourtEditor = lazy(() => import('./CourtEditor'));
const Branches = lazy(() => import('./Branches'));
const Availability = lazy(() => import('./Availability'));
const Services = lazy(() => import('./Services'));
const Payments = lazy(() => import('./Payments'));
const Credits = lazy(() => import('./Credits'));
const Reports = lazy(() => import('./Reports'));
const Staff = lazy(() => import('./Staff'));
const SettingsPage = lazy(() => import('./Settings'));
const Activity = lazy(() => import('./Activity'));
const CompanyNotifications = lazy(() => import('./Notifications'));

export default function CompanyAdminRoutes() {
  const { companyId = '' } = useParams();
  const { loading: sessionLoading } = useSession();
  const { role, value, loading, error } = useCompanyData(companyId);
  if (sessionLoading) return <FullPageSpinner />;
  if (!role) return <Navigate to="/" replace />;
  if (error) return <div className="p-6"><ErrorState error={error} /></div>;
  if (loading || !value) return <FullPageSpinner />;
  const { can, company } = value;
  const base = `/manage/${companyId}`;
  const nav: NavItem[] = [
    { to: base, label: 'Overview', icon: <LayoutDashboard />, end: true },
    { to: `${base}/calendar`, label: 'Calendar', icon: <CalendarDays />, hidden: !can('bookings.view') },
    { to: `${base}/bookings`, label: 'Bookings', icon: <ClipboardList />, hidden: !can('bookings.view') },
    { to: `${base}/check-in`, label: 'Check-in', icon: <ScanLine />, hidden: !can('checkin.operate') },
    { to: `${base}/customers`, label: 'Customers', icon: <Users />, hidden: !can('customers.view') },
    { to: `${base}/verifications`, label: 'ID verification', icon: <IdCard />, hidden: !can('verification.review') },
    { to: `${base}/courts`, label: 'Courts', icon: <LayoutGrid />, hidden: !can('courts.manage') },
    { to: `${base}/availability`, label: 'Holidays and blocks', icon: <CalendarOff />, hidden: !can('calendar.block') },
    { to: `${base}/services`, label: 'Memberships', icon: <Medal />, hidden: !can('subscriptions.manage') && !can('services.manage') },
    { to: `${base}/payments`, label: 'Payments', icon: <CreditCard />, hidden: !can('payments.view') },
    { to: `${base}/credits`, label: 'Credits', icon: <Coins />, hidden: !can('credits.view') },
    { to: `${base}/reports`, label: 'Reports', icon: <BarChart3 />, hidden: !can('reports.view') },
    { to: `${base}/branches`, label: 'Branches', icon: <Building />, hidden: !can('branches.manage') },
    { to: `${base}/staff`, label: 'Staff', icon: <UserCog />, hidden: !can('staff.manage') },
    { to: `${base}/activity`, label: 'Activity log', icon: <ScrollText />, hidden: !can('audit.view') },
    { to: `${base}/notifications`, label: 'Notifications', icon: <Bell /> },
    { to: `${base}/settings`, label: 'Settings', icon: <Settings />, hidden: !can('company.settings.edit') && !can('company.profile.edit') },
  ];
  const banner =
    company.status !== 'active' ? (
      <Alert tone={company.status === 'suspended' ? 'error' : 'warning'} title={`This company is ${company.status}.`}>
        {company.statusReason || 'Changes and new bookings are paused. Contact CourtSync support.'}
      </Alert>
    ) : company.restrictions?.bookingsDisabled ? (
      <Alert tone="warning">New bookings are disabled for this company by the platform administrator.</Alert>
    ) : undefined;

  const guard = (ok: boolean, el: React.ReactNode) => (ok ? <S>{el}</S> : <Navigate to={base} replace />);
  return (
    <CompanyProvider value={value}>
      <Routes>
        <Route element={<AdminShell nav={nav} title={company.name} subtitle={value.role === 'super' ? 'Viewing as super admin' : 'Company admin'} banner={banner} headerRight={<NotificationBell path={`companies/${companyId}/notifications`} allLink={`${base}/notifications`} />} />}>
          <Route index element={<S><Dashboard /></S>} />
          <Route path="calendar" element={guard(can('bookings.view'), <Calendar />)} />
          <Route path="bookings" element={guard(can('bookings.view'), <Bookings />)} />
          <Route path="bookings/:bookingId" element={guard(can('bookings.view'), <BookingDetail />)} />
          <Route path="check-in" element={guard(can('checkin.operate'), <CheckIn />)} />
          <Route path="customers" element={guard(can('customers.view'), <Customers />)} />
          <Route path="customers/:uid" element={guard(can('customers.view'), <CustomerDetail />)} />
          <Route path="verifications" element={guard(can('verification.review'), <Verifications />)} />
          <Route path="courts" element={guard(can('courts.manage'), <Courts />)} />
          <Route path="courts/new" element={guard(can('courts.manage'), <CourtEditor />)} />
          <Route path="courts/:courtId" element={guard(can('courts.manage'), <CourtEditor />)} />
          <Route path="availability" element={guard(can('calendar.block'), <Availability />)} />
          <Route path="services" element={guard(can('subscriptions.manage') || can('services.manage'), <Services />)} />
          <Route path="payments" element={guard(can('payments.view'), <Payments />)} />
          <Route path="credits" element={guard(can('credits.view'), <Credits />)} />
          <Route path="reports" element={guard(can('reports.view'), <Reports />)} />
          <Route path="branches" element={guard(can('branches.manage'), <Branches />)} />
          <Route path="staff" element={guard(can('staff.manage'), <Staff />)} />
          <Route path="activity" element={guard(can('audit.view'), <Activity />)} />
          <Route path="notifications" element={<S><CompanyNotifications /></S>} />
          <Route path="settings" element={guard(can('company.settings.edit') || can('company.profile.edit'), <SettingsPage />)} />
          <Route path="*" element={<Navigate to={base} replace />} />
        </Route>
      </Routes>
    </CompanyProvider>
  );
}

function S({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<Spinner />}>{children}</Suspense>;
}
