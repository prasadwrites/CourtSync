import { useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, doc, limit, orderBy, query, updateDoc, writeBatch } from 'firebase/firestore';
import { CheckCheck } from 'lucide-react';
import clsx from 'clsx';
import type { AppNotification } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useQuery } from '@/lib/hooks';
import { fmtTs } from '@/lib/format';
import { errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { Button, Card, EmptyState, ErrorState, PageHeader, Spinner, Tabs } from '@/components/ui';

/** Full inbox for a notifications collection (user, company staff, or platform). */
export function NotificationsPage({ path, title = 'Notifications', back }: { path: string; title?: string; back?: string }) {
  const toast = useToast();
  const [count, setCount] = useState(50);
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const list = useQuery<AppNotification>(query(collection(db, path), orderBy('createdAt', 'desc'), limit(count)), `${path}-${count}`);
  const rows = filter === 'unread' ? list.data.filter((n) => !n.read) : list.data;
  const unread = list.data.filter((n) => !n.read);

  const markAll = async () => {
    try {
      const batch = writeBatch(db);
      unread.slice(0, 450).forEach((n) => batch.update(doc(db, path, n.id), { read: true }));
      await batch.commit();
    } catch (e) {
      toast.error(errorMessage(e));
    }
  };

  return (
    <>
      <PageHeader
        title={title}
        back={back}
        actions={unread.length > 0 && <Button variant="secondary" size="sm" icon={<CheckCheck className="h-4 w-4" />} onClick={markAll}>Mark all as read</Button>}
      />
      <Tabs value={filter} onChange={setFilter} tabs={[{ value: 'all', label: 'All' }, { value: 'unread', label: 'Unread', count: unread.length }]} />
      {list.loading && list.data.length === 0 ? (
        <Spinner />
      ) : list.error ? (
        <ErrorState error={list.error} />
      ) : rows.length === 0 ? (
        <EmptyState title="Nothing here" description="New notifications appear here as they arrive." />
      ) : (
        <Card padded={false}>
          <ul className="divide-y divide-slate-100">
            {rows.map((n) => {
              const body = (
                <div className={clsx('flex gap-3 px-4 py-3', !n.read && 'bg-brand-50/40')}>
                  <span className={clsx('mt-1.5 h-2 w-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-brand-600')} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-slate-900">{n.title}</p>
                    <p className="text-sm text-slate-600">{n.body}</p>
                    <p className="mt-0.5 text-xs text-slate-400">{fmtTs(n.createdAt)}</p>
                  </div>
                </div>
              );
              const markRead = () => !n.read && updateDoc(doc(db, path, n.id), { read: true }).catch(() => null);
              return (
                <li key={n.id}>
                  {n.link ? (
                    <Link to={n.link} onClick={markRead} className="block hover:bg-slate-50">{body}</Link>
                  ) : (
                    <button type="button" onClick={markRead} className="block w-full text-left hover:bg-slate-50">{body}</button>
                  )}
                </li>
              );
            })}
          </ul>
          {list.data.length >= count && (
            <div className="border-t border-slate-100 p-3 text-center">
              <Button variant="ghost" size="sm" onClick={() => setCount(count + 50)}>Load more</Button>
            </div>
          )}
        </Card>
      )}
    </>
  );
}
