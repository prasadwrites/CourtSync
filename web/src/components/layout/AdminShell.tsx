import { useState, type ReactNode } from 'react';
import { NavLink, Outlet, useLocation } from 'react-router-dom';
import { Menu, X } from 'lucide-react';
import clsx from 'clsx';
import { useEffect } from 'react';
import { Logo } from '../Logo';
import { UserMenu } from '../UserMenu';

export interface NavItem {
  to: string;
  label: string;
  icon: ReactNode;
  end?: boolean;
  hidden?: boolean;
}

/** Sidebar layout for the Super Admin and Company Admin areas. */
export function AdminShell({ nav, title, subtitle, headerRight, banner }: { nav: NavItem[]; title: ReactNode; subtitle?: ReactNode; headerRight?: ReactNode; banner?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const location = useLocation();
  useEffect(() => setOpen(false), [location.pathname]);
  const items = nav.filter((n) => !n.hidden);
  const sidebar = (
    <nav className="flex h-full flex-col">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      <div className="px-5 pb-3">
        <p className="truncate text-sm font-semibold text-slate-900">{title}</p>
        {subtitle && <p className="truncate text-xs text-slate-500">{subtitle}</p>}
      </div>
      <ul className="flex-1 space-y-0.5 overflow-y-auto px-3 pb-6">
        {items.map((n) => (
          <li key={n.to}>
            <NavLink
              to={n.to}
              end={n.end}
              className={({ isActive }) =>
                clsx('flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors', isActive ? 'bg-brand-50 text-brand-800' : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900')
              }
            >
              <span className="h-5 w-5 shrink-0 [&>svg]:h-5 [&>svg]:w-5">{n.icon}</span>
              {n.label}
            </NavLink>
          </li>
        ))}
      </ul>
    </nav>
  );
  return (
    <div className="min-h-screen bg-slate-50">
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 border-r border-slate-200 bg-white lg:block">{sidebar}</aside>
      {open && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40" onClick={() => setOpen(false)} />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[85vw] bg-white shadow-xl">
            <button onClick={() => setOpen(false)} aria-label="Close menu" className="absolute right-3 top-4 rounded-md p-1 text-slate-500 hover:bg-slate-100">
              <X className="h-5 w-5" />
            </button>
            {sidebar}
          </aside>
        </div>
      )}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-slate-200 bg-white/90 px-4 backdrop-blur sm:px-6">
          <button onClick={() => setOpen(true)} aria-label="Open menu" className="rounded-md p-2 text-slate-600 hover:bg-slate-100 lg:hidden">
            <Menu className="h-5 w-5" />
          </button>
          <div className="min-w-0 flex-1 truncate text-sm font-medium text-slate-700 lg:hidden">{title}</div>
          <div className="ml-auto flex items-center gap-1">
            {headerRight}
            <UserMenu />
          </div>
        </header>
        {banner}
        <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
