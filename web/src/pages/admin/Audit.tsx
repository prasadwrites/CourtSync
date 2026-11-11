import { useState } from 'react';
import { collection, limit, orderBy, query, where, type QueryConstraint } from 'firebase/firestore';
import type { AuditLog, Company } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useQuery } from '@/lib/hooks';
import { Button, Card, ErrorState, PageHeader, Select } from '@/components/ui';
import { AuditTable } from '@/components/AuditTable';
import { ExportButtons } from '@/components/ExportButtons';
import { fmtTs } from '@/lib/format';

const TARGET_TYPES = ['company', 'companyProfile', 'companyPrivate', 'companySettings', 'user', 'staff', 'invitation', 'country', 'sport', 'identificationType', 'paymentMethod', 'platformSettings', 'branch', 'court', 'blockedSlot', 'service', 'booking', 'payment', 'customer', 'verification', 'subscription'];

export default function Audit() {
  const [companyId, setCompanyId] = useState('');
  const [targetType, setTargetType] = useState('');
  const [count, setCount] = useState(100);
  const companies = useQuery<Company>(query(collection(db, 'companies'), orderBy('name'), limit(500)), 'audit-companies');
  const constraints: QueryConstraint[] = [];
  if (companyId) constraints.push(where('companyId', '==', companyId));
  else if (targetType) constraints.push(where('targetType', '==', targetType));
  const logs = useQuery<AuditLog>(query(collection(db, 'auditLogs'), ...constraints, orderBy('at', 'desc'), limit(count)), `audit-${companyId}-${targetType}-${count}`);
  const rows = companyId && targetType ? logs.data.filter((l) => l.targetType === targetType) : logs.data;
  const companyName = (id: string) => companies.data.find((c) => c.id === id)?.name ?? id;

  return (
    <>
      <PageHeader
        title="Audit log"
        description="Every administrative action, who took it, and what changed. Entries cannot be edited or deleted."
        actions={
          <ExportButtons
            fileName="courtsync-audit"
            rows={rows}
            columns={[
              { header: 'When', value: (r) => fmtTs(r.at) },
              { header: 'Action', value: (r) => r.action },
              { header: 'Actor', value: (r) => r.actorEmail ?? r.actorUid },
              { header: 'Record type', value: (r) => r.targetType },
              { header: 'Record id', value: (r) => r.targetId },
              { header: 'Company', value: (r) => (r.companyId ? companyName(r.companyId) : '') },
            ]}
          />
        }
      />
      <Card padded={false}>
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <Select aria-label="Company" className="w-56" value={companyId} onChange={(e) => setCompanyId(e.target.value)} placeholder="All companies" options={companies.data.map((c) => ({ value: c.id, label: c.name }))} />
          <Select aria-label="Record type" className="w-48" value={targetType} onChange={(e) => setTargetType(e.target.value)} placeholder="All record types" options={TARGET_TYPES.map((t) => ({ value: t, label: t }))} />
        </div>
        {logs.error ? <ErrorState error={logs.error} /> : <AuditTable rows={rows} loading={logs.loading} showCompany companyName={companyName} />}
        {logs.data.length >= count && (
          <div className="border-t border-slate-100 p-3 text-center">
            <Button variant="ghost" size="sm" onClick={() => setCount(count + 100)}>Load older entries</Button>
          </div>
        )}
      </Card>
    </>
  );
}
