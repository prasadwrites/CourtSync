import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { LogOut, Shield, Building2, User, ChevronDown } from 'lucide-react';
import { ROLE_LABELS } from '@courtsync/shared';
import { useSession } from '@/lib/auth';
import { Avatar } from './ui';

export function UserMenu() {
  const { profile, user, superAdmin, staffOf, signOut } = useSession();
  const [open, setOpen] = useState(false);
  const navigate = useNavigate();
  const name = profile?.displayName ?? user?.email ?? 'Account';
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} className="flex items-center gap-2 rounded-full p-1 pr-2 hover:bg-slate-100" aria-haspopup="menu" aria-expanded={open}>
        <Avatar name={name} src={profile?.photoURL} size="sm" />
        <ChevronDown className="hidden h-4 w-4 text-slate-500 sm:block" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 z-40 mt-2 w-72 overflow-hidden rounded-xl border border-slate-200 bg-white py-1 shadow-xl">
            <div className="border-b border-slate-100 px-4 py-3">
              <p className="truncate text-sm font-medium text-slate-900">{name}</p>
              <p className="truncate text-xs text-slate-500">{user?.email ?? user?.phoneNumber}</p>
            </div>
            <p className="px-4 pt-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Switch view</p>
            {superAdmin && (
              <MenuLink to="/admin" icon={<Shield className="h-4 w-4" />} onClick={() => setOpen(false)}>
                CourtSync administration
              </MenuLink>
            )}
            {staffOf.map((s) => (
              <MenuLink key={s.companyId} to={`/manage/${s.companyId}`} icon={<Building2 className="h-4 w-4" />} onClick={() => setOpen(false)}>
                <span className="truncate">{s.companyName}</span>
                <span className="ml-auto text-xs text-slate-400">{ROLE_LABELS[s.role]}</span>
              </MenuLink>
            ))}
            <MenuLink to="/home" icon={<User className="h-4 w-4" />} onClick={() => setOpen(false)}>
              Customer portal
            </MenuLink>
            <div className="my-1 border-t border-slate-100" />
            <MenuLink to="/profile" icon={<User className="h-4 w-4" />} onClick={() => setOpen(false)}>
              Profile and security
            </MenuLink>
            <button
              role="menuitem"
              onClick={async () => {
                await signOut();
                navigate('/login');
              }}
              className="flex w-full items-center gap-2 px-4 py-2 text-left text-sm text-slate-700 hover:bg-slate-50"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        </>
      )}
    </div>
  );
}

function MenuLink({ to, icon, children, onClick }: { to: string; icon: React.ReactNode; children: React.ReactNode; onClick: () => void }) {
  return (
    <Link role="menuitem" to={to} onClick={onClick} className="flex items-center gap-2 px-4 py-2 text-sm text-slate-700 hover:bg-slate-50">
      {icon}
      {children}
    </Link>
  );
}
