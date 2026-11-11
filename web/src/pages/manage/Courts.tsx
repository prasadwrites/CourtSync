import { useNavigate } from 'react-router-dom';
import { ExternalLink, Plus } from 'lucide-react';
import { BOOKING_MODEL_LABELS } from '@courtsync/shared';
import { formatMoney } from '@/lib/format';
import { Badge, Card, DataTable, LinkButton, PageHeader } from '@/components/ui';
import { useCompany } from './context';

export default function Courts() {
  const { companyId, company, courts, sportName, branchName, branches } = useCompany();
  const navigate = useNavigate();
  const max = company.restrictions?.maxCourts;
  const atLimit = max != null && courts.filter((c) => c.status !== 'inactive').length >= max;
  return (
    <>
      <PageHeader
        title="Courts"
        description={max != null ? `Your plan allows ${max} active court${max === 1 ? '' : 's'}.` : 'Each court has its own hours, prices, booking rules and calendar.'}
        actions={!atLimit && <LinkButton to={`/manage/${companyId}/courts/new`} icon={<Plus className="h-4 w-4" />}>Add court</LinkButton>}
      />
      <Card padded={false}>
        <DataTable
          rows={courts}
          onRowClick={(c) => navigate(`/manage/${companyId}/courts/${c.id}`)}
          empty="No courts yet."
          columns={[
            { key: 'name', header: 'Court', render: (c) => <span className="font-medium">{c.name}</span> },
            { key: 'sport', header: 'Sport', render: (c) => sportName(c.sportId) },
            ...(branches.length > 1 ? [{ key: 'branch', header: 'Branch', render: (c: (typeof courts)[number]) => branchName(c.branchId), hideOnMobile: true }] : []),
            { key: 'model', header: 'Booking', render: (c) => BOOKING_MODEL_LABELS[c.bookingModel], hideOnMobile: true },
            { key: 'price', header: 'Price', render: (c) => (c.bookingModel === 'session' ? `${formatMoney(c.pricing.sessionPrice, company.currency)} / session` : `${formatMoney(c.pricing.basePrice, company.currency)} / h${c.bookingModel === 'shared' ? ' per person' : ''}`), hideOnMobile: true },
            { key: 'public', header: 'Public calendar', render: (c) => (c.publicCalendar?.enabled ? <a className="inline-flex items-center gap-1 text-brand-700" href={`/p/${companyId}/${c.id}`} target="_blank" rel="noreferrer" onClick={(e) => e.stopPropagation()}>Open <ExternalLink className="h-3.5 w-3.5" /></a> : <span className="text-slate-400">Off</span>), hideOnMobile: true },
            { key: 'status', header: 'Status', render: (c) => <Badge tone={c.status === 'active' ? 'green' : c.status === 'temporarilyClosed' ? 'amber' : 'slate'}>{c.status === 'temporarilyClosed' ? 'Temporarily closed' : c.status === 'active' ? 'Active' : 'Inactive'}</Badge> },
          ]}
        />
      </Card>
    </>
  );
}
