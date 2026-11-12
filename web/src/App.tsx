import { lazy, Suspense, type ReactNode } from 'react';
import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useSession } from './lib/auth';
import { FullPageSpinner, Spinner } from './components/ui';
import { UpdatePrompt } from './components/UpdatePrompt';
import { RoleRibbon } from './components/RoleRibbon';
import { ErrorBoundary } from './components/ErrorBoundary';
import { CustomerShell } from './components/layout/CustomerShell';

const Login = lazy(() => import('./pages/auth/Login'));
const Register = lazy(() => import('./pages/auth/Register'));
const ForgotPassword = lazy(() => import('./pages/auth/ForgotPassword'));
const ChangePassword = lazy(() => import('./pages/auth/ChangePassword'));
const Landing = lazy(() => import('./pages/public/Landing'));
const PublicCalendar = lazy(() => import('./pages/public/PublicCalendar'));
const SuperAdminRoutes = lazy(() => import('./pages/admin/routes'));
const CompanyAdminRoutes = lazy(() => import('./pages/manage/routes'));
const CustomerHome = lazy(() => import('./pages/customer/Home'));
const Explore = lazy(() => import('./pages/customer/Explore'));
const CompanyPage = lazy(() => import('./pages/customer/CompanyPage'));
const CourtBooking = lazy(() => import('./pages/customer/CourtBooking'));
const MyBookings = lazy(() => import('./pages/customer/MyBookings'));
const BookingDetail = lazy(() => import('./pages/customer/BookingDetail'));
const Memberships = lazy(() => import('./pages/customer/Memberships'));
const Credits = lazy(() => import('./pages/customer/Credits'));
const Profile = lazy(() => import('./pages/customer/Profile'));
const Verify = lazy(() => import('./pages/customer/Verify'));
const Notifications = lazy(() => import('./pages/customer/Notifications'));

function RequireAuth({ children }: { children: ReactNode }) {
  const { user, loading, mustChangePassword, error } = useSession();
  const location = useLocation();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname + location.search }} />;
  if (mustChangePassword && location.pathname !== '/change-password') return <Navigate to="/change-password" replace />;
  // Show a message here: sending the user back to /login would bounce straight back and loop.
  if (error && error.includes('deactivated')) return <DeactivatedNotice message={error} />;
  return <>{children}</>;
}

function DeactivatedNotice({ message }: { message: string }) {
  const { signOut } = useSession();
  return (
    <div className="mx-auto mt-24 max-w-md px-4 text-center" role="alert">
      <h1 className="text-lg font-semibold text-slate-900">This account can't be used</h1>
      <p className="mt-2 text-sm text-slate-600">{message}</p>
      <button type="button" className="mt-4 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white" onClick={() => void signOut()}>
        Sign out
      </button>
    </div>
  );
}

/** Sends people to the area that fits them after sign-in. */
function HomeRedirect() {
  const { user, loading, superAdmin, staffOf } = useSession();
  if (loading) return <FullPageSpinner />;
  if (!user) return <Landing />;
  if (superAdmin) return <Navigate to="/admin" replace />;
  if (staffOf.length) return <Navigate to={`/manage/${staffOf[0].companyId}`} replace />;
  return <Navigate to="/home" replace />;
}

export default function App() {
  return (
    <>
      <RoleRibbon />
      <ErrorBoundary>
        <Suspense fallback={<FullPageSpinner />}>
          <Routes>
            <Route path="/" element={<HomeRedirect />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/change-password" element={<RequireAuth><ChangePassword /></RequireAuth>} />
            <Route path="/p/:companyId/:courtId" element={<PublicCalendar />} />
            <Route path="/admin/*" element={<RequireAuth><SuperAdminRoutes /></RequireAuth>} />
            <Route path="/manage/:companyId/*" element={<RequireAuth><CompanyAdminRoutes /></RequireAuth>} />
            <Route element={<RequireAuth><CustomerShell /></RequireAuth>}>
              <Route path="/home" element={<Page><CustomerHome /></Page>} />
              <Route path="/explore" element={<Page><Explore /></Page>} />
              <Route path="/c/:companyId" element={<Page><CompanyPage /></Page>} />
              <Route path="/c/:companyId/court/:courtId" element={<Page><CourtBooking /></Page>} />
              <Route path="/c/:companyId/verify" element={<Page><Verify /></Page>} />
              <Route path="/bookings" element={<Page><MyBookings /></Page>} />
              <Route path="/bookings/:companyId/:bookingId" element={<Page><BookingDetail /></Page>} />
              <Route path="/memberships" element={<Page><Memberships /></Page>} />
              <Route path="/credits" element={<Page><Credits /></Page>} />
              <Route path="/profile" element={<Page><Profile /></Page>} />
              <Route path="/notifications" element={<Page><Notifications /></Page>} />
            </Route>
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </ErrorBoundary>
      <UpdatePrompt />
    </>
  );
}

function Page({ children }: { children: ReactNode }) {
  return <Suspense fallback={<Spinner />}>{children}</Suspense>;
}

function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-2 bg-slate-50 px-4 text-center">
      <p className="text-5xl font-semibold text-slate-300">404</p>
      <p className="text-slate-700">That page doesn't exist.</p>
      <a href="/" className="text-sm font-medium text-brand-700">
        Go home
      </a>
    </div>
  );
}
