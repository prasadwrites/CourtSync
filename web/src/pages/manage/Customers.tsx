import { useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Mail, UserPlus } from 'lucide-react';
import { createCustomerSchema } from '@courtsync/shared';
import { useDebounced } from '@/lib/hooks';
import { call, errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { fmtTs } from '@/lib/format';
import { Alert, Badge, Button, Card, Checkbox, DataTable, ErrorState, Input, Modal, PageHeader, SearchInput, Select } from '@/components/ui';
import { VerificationBadge } from '@/components/StatusBadge';
import { ExportButtons } from '@/components/ExportButtons';
import { useCompany } from './context';
import { useCustomers } from './shared';

export default function Customers() {
  const { companyId, can, settings } = useCompany();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const customers = useCustomers();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [createOpen, setCreateOpen] = useState(params.get('new') === '1');
  const [inviteOpen, setInviteOpen] = useState(false);
  const q = useDebounced(search.trim().toLowerCase());
  const rows = customers.data.filter((c) => (!status || c.status === status) && (!q || `${c.displayName} ${c.email ?? ''} ${c.phone ?? ''} ${(c.tags ?? []).join(' ')}`.toLowerCase().includes(q)));
  const creditsOn = settings?.credits.enabled;

  return (
    <>
      <PageHeader
        title="Customers"
        description="Customers have one CourtSync account and join each facility separately. You only see customers of your company."
        actions={
          <div className="flex flex-wrap gap-2">
            <ExportButtons fileName="customers" rows={rows} columns={[
              { header: 'Name', value: (c) => c.displayName },
              { header: 'Email', value: (c) => c.email ?? '' },
              { header: 'Phone', value: (c) => c.phone ?? '' },
              { header: 'Status', value: (c) => c.status },
              { header: 'Verification', value: (c) => c.verificationStatus },
              { header: 'Credits', value: (c) => c.creditBalance },
              { header: 'Bookings', value: (c) => c.bookingsCount },
              { header: 'Joined', value: (c) => fmtTs(c.joinedAt) },
              { header: 'Joined via', value: (c) => c.joinedVia },
            ]} />
            {can('customers.manage') && (
              <>
                <Button variant="secondary" icon={<Mail className="h-4 w-4" />} onClick={() => setInviteOpen(true)}>Invite</Button>
                <Button icon={<UserPlus className="h-4 w-4" />} onClick={() => setCreateOpen(true)}>Add customer</Button>
              </>
            )}
          </div>
        }
      />
      <Card padded={false}>
        <div className="flex flex-wrap gap-2 border-b border-slate-100 p-3">
          <SearchInput className="w-full max-w-sm" value={search} onChange={setSearch} placeholder="Name, email, phone or tag" />
          <Select aria-label="Status" className="w-40" value={status} onChange={(e) => setStatus(e.target.value)} placeholder="Any status" options={[{ value: 'active', label: 'Active' }, { value: 'suspended', label: 'Suspended' }, { value: 'inactive', label: 'Inactive' }]} />
        </div>
        {customers.error ? <ErrorState error={customers.error} /> : (
          <DataTable
            loading={customers.loading}
            rows={rows}
            onRowClick={(c) => navigate(`/manage/${companyId}/customers/${c.id}`)}
            empty="No customers yet. Add one, invite one, or share your venue page."
            columns={[
              { key: 'name', header: 'Name', render: (c) => <span className="font-medium">{c.displayName}{c.status !== 'active' && <Badge tone="red" className="ml-2">{c.status}</Badge>}</span> },
              { key: 'contact', header: 'Contact', render: (c) => c.email ?? c.phone, hideOnMobile: true },
              { key: 'verif', header: 'ID', render: (c) => <VerificationBadge status={c.verificationStatus} />, hideOnMobile: true },
              ...(creditsOn ? [{ key: 'credits', header: 'Credits', render: (c: (typeof rows)[number]) => c.creditBalance }] : []),
              { key: 'bookings', header: 'Bookings', render: (c) => c.bookingsCount, hideOnMobile: true },
              { key: 'joined', header: 'Joined', render: (c) => fmtTs(c.joinedAt, false), hideOnMobile: true },
            ]}
          />
        )}
      </Card>
      {createOpen && <CreateCustomer close={() => { setCreateOpen(false); if (params.get('new')) setParams({}, { replace: true }); }} onCreated={(uid) => navigate(`/manage/${companyId}/customers/${uid}`)} />}
      {inviteOpen && <InviteCustomer close={() => setInviteOpen(false)} />}
    </>
  );
}

function CreateCustomer({ close, onCreated }: { close: () => void; onCreated: (uid: string) => void }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const [v, setV] = useState({ displayName: '', email: '', phone: '', sendInvite: true });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<{ uid: string; url: string } | null>(null);
  const submit = async () => {
    setError('');
    const parsed = createCustomerSchema.safeParse({ companyId, displayName: v.displayName, email: v.email || undefined, phone: v.phone || undefined, sendInvite: v.sendInvite });
    if (!parsed.success) return setError(parsed.error.issues.map((i) => i.message).join('. '));
    setBusy(true);
    try {
      const r = await call<{ uid: string; alreadyCustomer: boolean; inviteDelivered: boolean; inviteLink: string | null }>('createCustomer', parsed.data);
      if (r.alreadyCustomer) toast.info('That person was already your customer.');
      else toast.success('Customer added');
      if (r.inviteLink) setLink({ uid: r.uid, url: r.inviteLink });
      else onCreated(r.uid);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={close} title="Add customer" description="Creates their CourtSync account if they don't have one, and adds them to your company."
      footer={link ? <Button onClick={() => onCreated(link.uid)}>Done</Button> : <><Button variant="secondary" onClick={close}>Cancel</Button><Button loading={busy} onClick={submit}>Add customer</Button></>}>
      {link ? (
        <Alert tone="warning" title="Email delivery isn't configured">
          Share this link so they can set a password. It expires in one hour.
          <Input className="mt-2" readOnly value={link.url} onFocus={(e) => e.currentTarget.select()} />
        </Alert>
      ) : (
        <div className="space-y-3">
          <Input label="Full name" required value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} />
          <Input label="Email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
          <Input label="Mobile number" hint="International format, e.g. +919876543210" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
          <Checkbox checked={v.sendInvite} onChange={(on) => setV({ ...v, sendInvite: on })} label="Email them a link to set their password" />
          {error && <Alert tone="error">{error}</Alert>}
        </div>
      )}
    </Modal>
  );
}

function InviteCustomer({ close }: { close: () => void }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const [v, setV] = useState({ displayName: '', email: '', phone: '' });
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={close} title="Invite a customer" description="When they sign up with this email or phone number, they join your company automatically."
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button loading={busy} disabled={!v.email && !v.phone} onClick={async () => {
        setBusy(true);
        try {
          const r = await call<{ delivered: boolean }>('inviteCustomer', { companyId, displayName: v.displayName || undefined, email: v.email || undefined, phone: v.phone || undefined });
          toast.success(r.delivered ? 'Invitation emailed' : 'Invitation saved. They join automatically when they sign up.');
          close();
        } catch (e) {
          toast.error(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}>Send invite</Button></>}>
      <div className="space-y-3">
        <Input label="Name" value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} />
        <Input label="Email" type="email" value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
        <Input label="Mobile number" hint="International format" value={v.phone} onChange={(e) => setV({ ...v, phone: e.target.value })} />
      </div>
    </Modal>
  );
}
