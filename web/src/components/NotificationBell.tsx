import { useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, limit, orderBy, query, updateDoc } from 'firebase/firestore';
import { Bell } from 'lucide-react';
import type { AppNotification } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useQuery } from '@/lib/hooks';
import { fmtRelative } from '@/lib/format';
import clsx from 'clsx';

/** Bell for either a user's inbox or a company's staff inbox. */
export function NotificationBell({ path, allLink }: { path: string; allLink: string }) {
  const [open, setOpen] = useState(false);
  const { data } = useQuery<AppNotification>(query(collection(db, path), orderBy('createdAt', 'desc'), limit(15)), path);
  const unread = data.filter((n) => !n.read).length;
  const markRead = (id: string) => updateDoc(doc(db, path, id), { read: true }).catch(() => null);
  return (
    <div className="relative">
      <button onClick={() => setOpen(!open)} aria-label={`Notifications${unread ? `, ${unread} unread` : ''}`} className="relative rounded-full p-2 text-slate-600 hover:bg-slate-100">
        <Bell className="h-5 w-5" />
        {unread > 0 && <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">{unread > 9 ? '9+' : unread}</span>}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-40 mt-2 w-80 max-w-[calc(100vw-2rem)] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
            <div className="flex items-center justify-between border-b border-slate-100 px-4 py-2.5">
              <p className="text-sm font-semibold">Notifications</p>
              <Link to={allLink} onClick={() => setOpen(false)} className="text-xs font-medium text-brand-700">
                See all
              </Link>
            </div>
            <ul className="max-h-96 divide-y divide-slate-100 overflow-y-auto">
              {data.length === 0 && <li className="px-4 py-6 text-center text-sm text-slate-500">You're all caught up.</li>}
              {data.map((n) => (
                <li key={n.id}>
                  <Link
                    to={n.link ?? allLink}
                    onClick={() => {
                      markRead(n.id);
                      setOpen(false);
                    }}
                    className={clsx('block px-4 py-3 hover:bg-slate-50', !n.read && 'bg-brand-50/50')}
                  >
                    <p className="text-sm font-medium text-slate-900">{n.title}</p>
                    <p className="line-clamp-2 text-xs text-slate-600">{n.body}</p>
                    <p className="mt-0.5 text-[11px] text-slate-400">{fmtRelative(n.createdAt)}</p>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
