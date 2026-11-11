import { useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import type { Verification, VerificationStatus } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useQuery } from '@/lib/hooks';
import { EmptyState, ErrorState, PageHeader, Spinner, Tabs } from '@/components/ui';
import { useCompany } from './context';
import { useCustomers } from './shared';
import { VerificationPanel } from './VerificationReview';

export default function Verifications() {
  const { companyId } = useCompany();
  const [status, setStatus] = useState<VerificationStatus>('pending');
  const list = useQuery<Verification>(query(collection(db, 'companies', companyId, 'verifications'), where('status', '==', status), orderBy('submittedAt', 'desc'), limit(100)), `verifs-${companyId}-${status}`);
  const customers = useCustomers();
  const name = (uid: string) => customers.data.find((c) => c.id === uid)?.displayName ?? 'Customer';
  return (
    <>
      <PageHeader title="ID verification" description="Review documents customers submit. Numbers stay encrypted and masked unless you reveal them for a reason." />
      <Tabs<VerificationStatus> value={status} onChange={setStatus} tabs={[{ value: 'pending', label: 'Waiting' }, { value: 'verified', label: 'Verified' }, { value: 'rejected', label: 'Rejected' }, { value: 'expired', label: 'Expired' }]} />
      {list.loading ? <Spinner /> : list.error ? <ErrorState error={list.error} /> : list.data.length === 0 ? (
        <EmptyState title="Nothing here" description={status === 'pending' ? 'No documents are waiting for review.' : undefined} />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {list.data.map((v) => (
            <div key={v.id}>
              <Link to={`/manage/${companyId}/customers/${v.uid}`} className="mb-1 block text-sm font-medium text-brand-700">{name(v.uid)}</Link>
              <VerificationPanel v={v} />
            </div>
          ))}
        </div>
      )}
    </>
  );
}
