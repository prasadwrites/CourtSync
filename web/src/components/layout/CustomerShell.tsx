import { NavLink, Outlet } from 'react-router-dom';
import { Home, Compass, CalendarDays, BadgeCheck, Coins, User } from 'lucide-react';
import clsx from 'clsx';
import { Logo } from '../Logo';
import { UserMenu } from '../UserMenu';
import { NotificationBell } from '../NotificationBell';
import { useSession } from '@/lib/auth';

const NAV = [
  { to: '/home', label: 'Home', icon: Home },
  { to: '/explore', label: 'Explore', icon: Compass },
  { to: '/bookings', label: 'Bookings', icon: CalendarDays },
  { to: '/memberships', label: 'Memberships', icon: BadgeCheck },
  { to: '/credits', label: 'Credits', icon: Coins },
  { to: '/profile', label: 'Profile', icon: User },
];

/** Mobile-first customer layout: top bar plus a bottom tab bar on phones. */
export function CustomerShell() {
  const { user } = useSession();
  return (
    <div className="min-h-screen bg-slate-50 pb-20 sm:pb-0">
      <header className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex h-14 max-w-6xl items-center gap-4 px-4 sm:h-16">
          <Logo to="/home" />
          <nav className="ml-6 hidden gap-1 sm:flex">
            {NAV.slice(0, 5).map((n) => (
              <NavLink key={n.to} to={n.to} className={({ isActive }) => clsx('rounded-lg px-3 py-2 text-sm font-medium', isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100')}>
                {n.label}
              </NavLink>
            ))}
          </nav>
          <div className="ml-auto flex items-center gap-1">
            {user && <NotificationBell path={`users/${user.uid}/notifications`} allLink="/notifications" />}
            <UserMenu />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-5 sm:py-8">
        <Outlet />
      </main>
      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white pb-[env(safe-area-inset-bottom)] sm:hidden" aria-label="Primary">
        <ul className="grid grid-cols-6">
          {NAV.map((n) => (
            <li key={n.to}>
              <NavLink to={n.to} className={({ isActive }) => clsx('flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium', isActive ? 'text-brand-700' : 'text-slate-500')}>
                <n.icon className="h-5 w-5" />
                {n.label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
    </div>
  );
}
