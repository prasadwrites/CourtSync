import { useState } from 'react';
import { collection, query } from 'firebase/firestore';
import { KeyRound, MailCheck, Plus } from 'lucide-react';
import { ROLE_LABELS, STAFF_ROLES, ACCOUNT_STATUSES, staffInviteSchema, type StaffMember, type StaffRole, type AccountStatus } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useQuery } from '@/lib/hooks';
import { useSession } from '@/lib/auth';
import { call, errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { Alert, Badge, Button, Card, Checkbox, ConfirmDialog, DataTable, ErrorState, Input, Modal, PageHeader, Select } from '@/components/ui';
import { useCompany, type WithId } from './context';

const ROLE_HELP: Record<StaffRole, string> = {
  owner: 'Everything, including staff, settings and refunds.',
  admin: 'Everything except removing owners.',
  manager: 'Courts, calendar, bookings, customers, check-in and reports. No settings, staff or refunds.',
  frontDesk: 'Calendar, bookings, check-in and recording payments.',
};

export default function Staff() {
  const { companyId, branches, role } = useCompany();
  const staff = useQuery<StaffMember>(query(collection(db, 'companies', companyId, 'staff')), `staff-${companyId}`);
  const [adding, setAdding] = useState(false);
  const [editing, setEditing] = useState<WithId<StaffMember> | null>(null);
  return (
    <>
      <PageHeader title="Staff" description="People who can manage your company. Passwords are never visible to anyone; send a reset link if someone is locked out." actions={<Button icon={<Plus className="h-4 w-4" />} onClick={() => setAdding(true)}>Add staff</Button>} />
      <Card padded={false}>
        {staff.error ? <ErrorState error={staff.error} /> : (
          <DataTable loading={staff.loading} rows={staff.data} onRowClick={setEditing} columns={[
            { key: 'name', header: 'Name', render: (s) => <span className="font-medium">{s.displayName}</span> },
            { key: 'email', header: 'Email', render: (s) => s.email, hideOnMobile: true },
            { key: 'role', header: 'Role', render: (s) => <Badge tone={s.role === 'owner' ? 'purple' : 'brand'}>{ROLE_LABELS[s.role]}</Badge> },
            ...(branches.length > 1 ? [{ key: 'branches', header: 'Branches', render: (s: WithId<StaffMember>) => (s.branchIds.length ? s.branchIds.map((b) => branches.find((x) => x.id === b)?.name ?? b).join(', ') : 'All'), hideOnMobile: true }] : []),
            { key: 'status', header: 'Status', render: (s) => <Badge tone={s.status === 'active' ? 'green' : 'slate'}>{s.status}</Badge> },
          ]} />
        )}
      </Card>
      {adding && <AddStaff close={() => setAdding(false)} canOwner={role === 'owner' || role === 'super'} />}
      {editing && <EditStaff s={editing} close={() => setEditing(null)} canOwner={role === 'owner' || role === 'super'} />}
    </>
  );
}

function BranchChecks({ value, onChange }: { value: string[]; onChange: (v: string[]) => void }) {
  const { branches } = useCompany();
  if (branches.length < 2) return null;
  return (
    <fieldset>
      <legend className="mb-1 text-sm font-medium text-slate-700">Branches</legend>
      <p className="mb-2 text-xs text-slate-500">Leave all unticked for access to every branch.</p>
      <div className="grid gap-1 sm:grid-cols-2">
        {branches.map((b) => <Checkbox key={b.id} checked={value.includes(b.id)} onChange={(on) => onChange(on ? [...value, b.id] : value.filter((x) => x !== b.id))} label={b.name} />)}
      </div>
    </fieldset>
  );
}

function AddStaff({ close, canOwner }: { close: () => void; canOwner: boolean }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const [v, setV] = useState({ email: '', displayName: '', role: 'frontDesk' as StaffRole, branchIds: [] as string[] });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const roles = STAFF_ROLES.filter((r) => canOwner || r !== 'owner');
  return (
    <Modal open onClose={close} title="Add staff member" description="If they don't have a CourtSync account yet, one is created and they get a link to set their password."
      footer={link ? <Button onClick={close}>Done</Button> : <><Button variant="secondary" onClick={close}>Cancel</Button><Button loading={busy} onClick={async () => {
        setError('');
        const parsed = staffInviteSchema.safeParse({ companyId, ...v });
        if (!parsed.success) return setError(parsed.error.issues.map((i) => i.message).join('. '));
        setBusy(true);
        try {
          const r = await call<{ newAccount: boolean; inviteDelivered: boolean; inviteLink: string | null }>('addStaff', parsed.data);
          toast.success(`${v.displayName} added`);
          if (r.inviteLink) setLink(r.inviteLink);
          else close();
        } catch (e) {
          setError(errorMessage(e));
        } finally {
          setBusy(false);
        }
      }}>Add</Button></>}>
      {link ? (
        <Alert tone="warning" title="Email delivery isn't configured">
          Share this link so they can set a password. It expires in one hour.
          <Input className="mt-2" readOnly value={link} onFocus={(e) => e.currentTarget.select()} />
        </Alert>
      ) : (
        <div className="space-y-3">
          <Input label="Full name" required value={v.displayName} onChange={(e) => setV({ ...v, displayName: e.target.value })} />
          <Input label="Email" type="email" required value={v.email} onChange={(e) => setV({ ...v, email: e.target.value })} />
          <Select label="Role" value={v.role} onChange={(e) => setV({ ...v, role: e.target.value as StaffRole })} options={roles.map((r) => ({ value: r, label: ROLE_LABELS[r] }))} hint={ROLE_HELP[v.role]} />
          <BranchChecks value={v.branchIds} onChange={(branchIds) => setV({ ...v, branchIds })} />
          {error && <Alert tone="error">{error}</Alert>}
        </div>
      )}
    </Modal>
  );
}

function EditStaff({ s, close, canOwner }: { s: WithId<StaffMember>; close: () => void; canOwner: boolean }) {
  const toast = useToast();
  const { user } = useSession();
  const { companyId } = useCompany();
  const [role, setRole] = useState<StaffRole>(s.role);
  const [status, setStatus] = useState<AccountStatus>(s.status);
  const [branchIds, setBranchIds] = useState(s.branchIds);
  const [busy, setBusy] = useState('');
  const [removeOpen, setRemoveOpen] = useState(false);
  const [link, setLink] = useState<string | null>(null);
  const self = user?.uid === s.uid;
  const ownerLocked = s.role === 'owner' && !canOwner;
  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy('');
    }
  };
  return (
    <Modal open onClose={close} title={s.displayName} description={s.email}
      footer={<><Button variant="ghost" className="mr-auto" disabled={self || ownerLocked} onClick={() => setRemoveOpen(true)}>Remove from company</Button><Button variant="secondary" onClick={close}>Close</Button><Button loading={busy === 'save'} disabled={ownerLocked} onClick={() => run('save', async () => {
        await call('updateStaff', { companyId, uid: s.uid, role, status, branchIds });
        toast.success('Saved');
        close();
      })}>Save</Button></>}>
      <div className="space-y-3">
        {ownerLocked && <Alert tone="info">Only an owner can change another owner.</Alert>}
        <Select label="Role" disabled={self || ownerLocked} value={role} onChange={(e) => setRole(e.target.value as StaffRole)} options={STAFF_ROLES.filter((r) => canOwner || r !== 'owner').concat(!canOwner && s.role === 'owner' ? ['owner'] : []).map((r) => ({ value: r, label: ROLE_LABELS[r] }))} hint={ROLE_HELP[role]} />
        <Select label="Status" disabled={self || ownerLocked} value={status} onChange={(e) => setStatus(e.target.value as AccountStatus)} options={ACCOUNT_STATUSES.map((x) => ({ value: x, label: x[0].toUpperCase() + x.slice(1) }))} />
        <BranchChecks value={branchIds} onChange={setBranchIds} />
        {!self && !ownerLocked && (
          <div className="flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            <Button size="sm" variant="secondary" loading={busy === 'reset'} icon={<MailCheck className="h-4 w-4" />} onClick={() => run('reset', async () => {
              const r = await call<{ delivered: boolean; link: string | null }>('sendPasswordReset', { uid: s.uid, companyId });
              if (r.delivered) toast.success('Reset email sent');
              else setLink(r.link);
            })}>Send password reset</Button>
            <Button size="sm" variant="secondary" loading={busy === 'force'} icon={<KeyRound className="h-4 w-4" />} onClick={() => run('force', async () => {
              await call('forcePasswordReset', { uid: s.uid, companyId });
              toast.success('They must set a new password at next sign-in');
            })}>Require password change</Button>
          </div>
        )}
        {link && <Alert tone="warning" title="Share this reset link">It expires in one hour.<Input className="mt-2" readOnly value={link} onFocus={(e) => e.currentTarget.select()} /></Alert>}
      </div>
      <ConfirmDialog open={removeOpen} onClose={() => setRemoveOpen(false)} tone="danger" loading={busy === 'remove'} title={`Remove ${s.displayName}?`} message="They lose access to this company. Their CourtSync account stays." confirmLabel="Remove"
        onConfirm={() => run('remove', async () => {
          await call('updateStaff', { companyId, uid: s.uid, remove: true });
          toast.success('Removed');
          setRemoveOpen(false);
          close();
        })} />
    </Modal>
  );
}
