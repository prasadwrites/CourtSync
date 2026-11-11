import { useEffect } from 'react';
import { Link, useLocation, matchPath } from 'react-router-dom';
import { ROLE_LABELS } from '@courtsync/shared';
import { useSession } from '@/lib/auth';

/**
 * Thin bar across the top of every page that says who is signed in and with what role,
 * so a Super Admin or staff member can never mistake the customer view for an admin view.
 * Plain customers don't see it.
 */
export function RoleRibbon() {
  const { user, loading, superAdmin, staffOf, profile, signOut } = useSession();
  // The profile says Super Admin but this sign-in token doesn't carry it yet.
  const stale = !superAdmin && profile?.platformRole === 'superAdmin';
  const { pathname } = useLocation();
  const visible = !loading && !!user && (superAdmin || stale || staffOf.length > 0);
  useEffect(() => {
    document.documentElement.classList.toggle('has-ribbon', visible);
    return () => document.documentElement.classList.remove('has-ribbon');
  }, [visible]);
  if (!visible || !user) return null;

  const who = user.email ?? user.phoneNumber ?? 'Signed in';
  const inAdmin = pathname === '/admin' || pathname.startsWith('/admin/');
  const manage = matchPath('/manage/:companyId/*', pathname) ?? matchPath('/manage/:companyId', pathname);
  const companyId = manage?.params.companyId;
  const membership = staffOf.find((s) => s.companyId === companyId);

  if (stale) {
    return (
      <div role="status" className="fixed inset-x-0 top-0 z-50 flex h-7 items-center justify-between gap-4 overflow-hidden bg-amber-500 px-4 text-xs font-medium text-slate-900">
        <span>Super Admin was granted to {who}, but this session hasn't picked it up yet.</span>
        <button type="button" className="underline underline-offset-2" onClick={() => void signOut()}>
          Sign out, then sign in again
        </button>
      </div>
    );
  }

  let label: string;
  let link: { to: string; text: string } | null = null;
  if (superAdmin) {
    label = inAdmin ? 'Platform administration' : companyId ? `Super Admin · viewing ${membership?.companyName ?? 'a company'}` : 'Super Admin · customer view';
    if (!inAdmin) link = { to: '/admin', text: 'Open admin console' };
  } else if (membership) {
    label = `${ROLE_LABELS[membership.role]} · ${membership.companyName}`;
  } else {
    label = `Staff · customer view`;
    link = { to: `/manage/${staffOf[0].companyId}`, text: 'Open dashboard' };
  }

  return (
    <div
      role="status"
      className={`fixed inset-x-0 top-0 z-50 flex h-7 items-center justify-between gap-x-4 overflow-hidden px-4 text-xs font-medium text-white ${superAdmin ? 'bg-violet-700' : 'bg-slate-800'}`}
    >
      <span className="flex items-center gap-2">
        <span className="rounded bg-white/20 px-1.5 py-0.5 uppercase tracking-wide">{superAdmin ? 'Super Admin' : 'Staff'}</span>
        <span>{label}</span>
      </span>
      <span className="flex items-center gap-3 opacity-90">
        <span className="truncate">{who}</span>
        {link && (
          <Link to={link.to} className="underline underline-offset-2 hover:opacity-100">
            {link.text}
          </Link>
        )}
      </span>
    </div>
  );
}
