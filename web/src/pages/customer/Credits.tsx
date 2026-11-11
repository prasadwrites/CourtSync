import { collectionGroup, limit, orderBy, query, where } from 'firebase/firestore';
import type { CreditTransaction } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/auth';
import { useMyCompanies } from '@/lib/customer';
import { fmtTs } from '@/lib/format';
import { Card, CardHeader, EmptyState, ErrorState, Spinner } from '@/components/ui';

export default function Credits() {
  const { user } = useSession();
  const companies = useMyCompanies(user?.uid);
  const txns = useQuery<CreditTransaction>(user ? query(collectionGroup(db, 'creditTransactions'), where('uid', '==', user.uid), orderBy('at', 'desc'), limit(200)) : null, `my-credits-${user?.uid}`);
  const name = (id: string) => companies.data.find((c) => c.companyId === id)?.companyName ?? '';
  const withCredits = companies.data.filter((c) => c.creditBalance > 0);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Credits</h1>
      <p className="text-slate-600">Credits are given by each venue and can only be used there.</p>
      {companies.loading ? <Spinner /> : withCredits.length === 0 ? (
        <Card><EmptyState title="No credits yet" description="Venues may award credits for refunds, promotions or loyalty." /></Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-3">
          {withCredits.map((c) => (
            <Card key={c.companyId}>
              <p className="text-sm text-slate-500">{c.companyName}</p>
              <p className="text-3xl font-semibold">{c.creditBalance}</p>
              <p className="text-xs text-slate-500">credits</p>
            </Card>
          ))}
        </div>
      )}
      <Card padded={false}>
        <div className="p-4 pb-0"><CardHeader title="History" /></div>
        {txns.error ? <ErrorState error={txns.error} /> : txns.data.length === 0 ? <p className="p-4 text-sm text-slate-500">No credit activity.</p> : (
          <ul className="divide-y divide-slate-100">
            {txns.data.map((t) => (
              <li key={`${t.companyId}/${t.id}`} className="flex items-center justify-between gap-3 px-4 py-3 text-sm">
                <span className="min-w-0">
                  <span className="block font-medium">{t.reason}</span>
                  <span className="block text-xs text-slate-500">{name(t.companyId)} · {fmtTs(t.at)}{t.expiresAt ? ` · expires ${fmtTs(t.expiresAt, false)}` : ''}</span>
                </span>
                <span className={t.amount < 0 ? 'font-semibold text-red-700' : 'font-semibold text-court-700'}>{t.amount > 0 ? '+' : ''}{t.amount}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  );
}
