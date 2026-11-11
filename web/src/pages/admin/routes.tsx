import { lazy, Suspense } from 'react';
import { Navigate, Route, Routes } from 'react-router-dom';
import { LayoutDashboard, Building2, Globe2, Trophy, IdCard, CreditCard, Users, ScrollText, Settings, BarChart3, Bell } from 'lucide-react';
import { useSession } from '@/lib/auth';
import { AdminShell } from '@/components/layout/AdminShell';
import { NotificationBell } from '@/components/NotificationBell';
import { Spinner } from '@/components/ui';

const Dashboard = lazy(() => import('./Dashboard'));
const Companies = lazy(() => import('./Companies'));
const CompanyDetail = lazy(() => import('./CompanyDetail'));
const Countries = lazy(() => import('./Countries'));
const Sports = lazy(() => import('./Sports'));
const IdTypes = lazy(() => import('./IdTypes'));
const PaymentMethods = lazy(() => import('./PaymentMethods'));
const UsersPage = lazy(() => import('./Users'));
const Audit = lazy(() => import('./Audit'));
const PlatformSettings = lazy(() => import('./PlatformSettings'));
const Reports = lazy(() => import('./Reports'));
const PlatformNotifications = lazy(() => import('./Notifications'));

const NAV = [
  { to: '/admin', label: 'Overview', icon: <LayoutDashboard />, end: true },
  { to: '/admin/companies', label: 'Companies', icon: <Building2 /> },
  { to: '/admin/countries', label: 'Countries', icon: <Globe2 /> },
  { to: '/admin/sports', label: 'Sports', icon: <Trophy /> },
  { to: '/admin/identity', label: 'Identity configuration', icon: <IdCard /> },
  { to: '/admin/payment-methods', label: 'Payment methods', icon: <CreditCard /> },
  { to: '/admin/users', label: 'Users', icon: <Users /> },
  { to: '/admin/reports', label: 'Reports', icon: <BarChart3 /> },
  { to: '/admin/audit', label: 'Audit log', icon: <ScrollText /> },
  { to: '/admin/notifications', label: 'Notifications', icon: <Bell /> },
  { to: '/admin/settings', label: 'Platform settings', icon: <Settings /> },
];

export default function SuperAdminRoutes() {
  const { superAdmin } = useSession();
  if (!superAdmin) return <Navigate to="/" replace />;
  return (
    <Routes>
      <Route element={<AdminShell nav={NAV} title="CourtSync administration" subtitle="Platform" headerRight={<NotificationBell path="platformNotifications" allLink="/admin/notifications" />} />}>
        <Route index element={<S><Dashboard /></S>} />
        <Route path="companies" element={<S><Companies /></S>} />
        <Route path="companies/:companyId" element={<S><CompanyDetail /></S>} />
        <Route path="countries" element={<S><Countries /></S>} />
        <Route path="sports" element={<S><Sports /></S>} />
        <Route path="identity" element={<S><IdTypes /></S>} />
        <Route path="payment-methods" element={<S><PaymentMethods /></S>} />
        <Route path="users" element={<S><UsersPage /></S>} />
        <Route path="reports" element={<S><Reports /></S>} />
        <Route path="audit" element={<S><Audit /></S>} />
        <Route path="notifications" element={<S><PlatformNotifications /></S>} />
        <Route path="settings" element={<S><PlatformSettings /></S>} />
      </Route>
    </Routes>
  );
}

function S({ children }: { children: React.ReactNode }) {
  return <Suspense fallback={<Spinner />}>{children}</Suspense>;
}
