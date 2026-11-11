import { useState } from 'react';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import type { AuditLog } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useQuery } from '@/lib/hooks';
import { Button, Card, ErrorState, PageHeader } from '@/components/ui';
import { AuditTable } from '@/components/AuditTable';
import { useCompany } from './context';

export default function Activity() {
  const { companyId } = useCompany();
  const [count, setCount] = useState(100);
  const logs = useQuery<AuditLog>(query(collection(db, 'auditLogs'), where('companyId', '==', companyId), orderBy('at', 'desc'), limit(count)), `company-audit-${companyId}-${count}`);
  return (
    <>
      <PageHeader title="Activity log" description="Changes made by your staff and by the platform, newest first." />
      <Card padded={false}>
        {logs.error ? <ErrorState error={logs.error} /> : <AuditTable rows={logs.data} loading={logs.loading} />}
        {logs.data.length >= count && (
          <div className="border-t border-slate-100 p-3 text-center">
            <Button variant="ghost" size="sm" onClick={() => setCount(count + 100)}>Load older entries</Button>
          </div>
        )}
      </Card>
    </>
  );
}
