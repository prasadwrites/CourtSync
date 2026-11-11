import { useState } from 'react';
import { collection, limit, orderBy, query, where } from 'firebase/firestore';
import { KeyRound, MailCheck, Search, ShieldCheck, ShieldOff, UserCheck, UserX } from 'lucide-react';
import { ACCOUNT_STATUSES, type AccountStatus, type UserProfile } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useQuery } from '@/lib/hooks';
import { call, errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { fmtTs } from '@/lib/format';
import { useSession } from '@/lib/auth';
import { Alert, Badge, Button, Card, CardHeader, ConfirmDialog, DataTable, Input, KeyValue, Modal, PageHeader, Select, Textarea } from '@/components/ui';

interface FoundUser {
  uid: string;
  email: string | null;
  phone: string | null;
  displayName: string | null;
  disabled: boolean;
  superAdmin: boolean;
  lastSignIn: string | null;
  created: string;
  providers: string[];
  profile: (UserProfile & { status?: AccountStatus }) | null;
}

const STATUS_TONE = { active: 'green', inactive: 'slate', suspended: 'red' } as const;

export default function Users() {
  const toast = useToast();
  const [q, setQ] = useState('');
  const [searching, setSearching] = useState(false);
  const [found, setFound] = useState<FoundUser | null | undefined>(undefined);
  const [grantOpen, setGrantOpen] = useState(false);
  const recent = useQuery<UserProfile>(query(collection(db, 'users'), orderBy('createdAt', 'desc'), limit(50)), 'recent-users');
  const supers = useQuery<UserProfile>(query(collection(db, 'users'), where('platformRole', '==', 'superAdmin'), limit(50)), 'super-admins');

  const lookup = async (value = q) => {
    if (value.trim().length < 3) return;
    setSearching(true);
    try {
      const res = await call<{ user: FoundUser | null }>('findUser', { query: value.trim() });
      setFound(res.user);
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setSearching(false);
    }
  };

  return (
    <>
      <PageHeader
        title="Users"
        description="Find any account by email, phone number, or user id. Passwords are never visible; you can only send a reset link or require a change."
        actions={<Button variant="secondary" icon={<ShieldCheck className="h-4 w-4" />} onClick={() => setGrantOpen(true)}>Manage super admins</Button>}
      />
      <Card className="mb-4">
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            lookup();
          }}
        >
          <Input aria-label="Email, phone or user id" placeholder="name@example.com, +919876543210 or user id" value={q} onChange={(e) => setQ(e.target.value)} />
          <Button type="submit" loading={searching} icon={<Search className="h-4 w-4" />}>Find</Button>
        </form>
        {found === null && <p className="mt-3 text-sm text-slate-500">No account matches that search.</p>}
      </Card>
      {found && <UserCard user={found} onChanged={() => lookup(found.uid)} />}
      <Card padded={false} className="mt-4">
        <div className="p-4 pb-0">
          <CardHeader title="Newest accounts" />
        </div>
        <DataTable<UserProfile & { id: string }>
          loading={recent.loading}
          rows={recent.data}
          onRowClick={(r) => {
            setQ(r.email ?? r.id);
            lookup(r.id);
          }}
          columns={[
            { key: 'name', header: 'Name', render: (r) => <span className="font-medium">{r.displayName}</span> },
            { key: 'contact', header: 'Email or phone', render: (r) => r.email ?? r.phone },
            { key: 'status', header: 'Status', render: (r) => <Badge tone={STATUS_TONE[r.status] ?? 'slate'}>{r.status}</Badge> },
            { key: 'created', header: 'Joined', render: (r) => fmtTs(r.createdAt, false), hideOnMobile: true },
          ]}
        />
      </Card>
      {grantOpen && <SuperAdmins supers={supers.data} onClose={() => setGrantOpen(false)} />}
    </>
  );
}

function UserCard({ user, onChanged }: { user: FoundUser; onChanged: () => void }) {
  const toast = useToast();
  const { user: me } = useSession();
  const [busy, setBusy] = useState('');
  const [resetLink, setResetLink] = useState<string | null>(null);
  const [statusOpen, setStatusOpen] = useState(false);
  const [forceOpen, setForceOpen] = useState(false);
  const status = user.profile?.status ?? (user.disabled ? 'inactive' : 'active');
  const isMe = me?.uid === user.uid;

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
    <Card>
      <CardHeader
        title={<span className="flex flex-wrap items-center gap-2">{user.displayName ?? 'Unnamed account'} <Badge tone={STATUS_TONE[status] ?? 'slate'}>{status}</Badge>{user.superAdmin && <Badge tone="purple">Super admin</Badge>}{user.profile?.mustChangePassword && <Badge tone="amber">Must change password</Badge>}</span>}
        description={user.uid}
      />
      <KeyValue
        items={[
          { label: 'Email', value: user.email },
          { label: 'Phone', value: user.phone },
          { label: 'Sign-in methods', value: user.providers.join(', ') || 'None' },
          { label: 'Created', value: user.created },
          { label: 'Last sign-in', value: user.lastSignIn ?? 'Never' },
          { label: 'Location', value: [user.profile?.city, user.profile?.countryCode].filter(Boolean).join(', ') },
        ]}
      />
      <div className="mt-4 flex flex-wrap gap-2">
        <Button
          variant="secondary"
          size="sm"
          disabled={!user.email}
          loading={busy === 'reset'}
          icon={<MailCheck className="h-4 w-4" />}
          onClick={() =>
            run('reset', async () => {
              const res = await call<{ delivered: boolean; link: string | null }>('sendPasswordReset', { uid: user.uid });
              if (res.delivered) toast.success('Password reset email sent.');
              else setResetLink(res.link);
            })
          }
        >
          Send password reset
        </Button>
        <Button variant="secondary" size="sm" icon={<KeyRound className="h-4 w-4" />} disabled={isMe} onClick={() => setForceOpen(true)}>
          Require password change
        </Button>
        <Button variant={status === 'active' ? 'danger' : 'success'} size="sm" disabled={isMe} icon={status === 'active' ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />} onClick={() => setStatusOpen(true)}>
          Change status
        </Button>
      </div>
      {resetLink && (
        <Alert tone="warning" title="Email delivery is not configured">
          Share this one-time reset link with the user through a trusted channel. It expires in one hour.
          <Input className="mt-2" readOnly value={resetLink} onFocus={(e) => e.currentTarget.select()} />
        </Alert>
      )}
      <ConfirmDialog
        open={forceOpen}
        onClose={() => setForceOpen(false)}
        title="Require a password change?"
        message="The user is signed out on every device and must set a new password at next sign-in. Their current password is never shown to anyone."
        confirmLabel="Require change"
        loading={busy === 'force'}
        onConfirm={() =>
          run('force', async () => {
            await call('forcePasswordReset', { uid: user.uid });
            toast.success('The user must change their password at next sign-in.');
            setForceOpen(false);
            onChanged();
          })
        }
      />
      {statusOpen && <StatusModal user={user} current={status} onClose={() => setStatusOpen(false)} onDone={onChanged} />}
    </Card>
  );
}

function StatusModal({ user, current, onClose, onDone }: { user: FoundUser; current: AccountStatus; onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [status, setStatus] = useState<AccountStatus>(current === 'active' ? 'suspended' : 'active');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  return (
    <Modal
      open
      onClose={onClose}
      title="Change account status"
      description="Inactive and suspended accounts cannot sign in. Their bookings and history are kept."
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button
            loading={saving}
            variant={status === 'active' ? 'primary' : 'danger'}
            onClick={async () => {
              setSaving(true);
              try {
                await call('setUserStatus', { uid: user.uid, status, reason });
                toast.success('Status updated');
                onDone();
                onClose();
              } catch (e) {
                toast.error(errorMessage(e));
              } finally {
                setSaving(false);
              }
            }}
          >
            Save
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <Select label="New status" value={status} onChange={(e) => setStatus(e.target.value as AccountStatus)} options={ACCOUNT_STATUSES.map((s) => ({ value: s, label: s[0].toUpperCase() + s.slice(1) }))} />
        <Textarea label="Reason" hint="Recorded in the audit log." value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Modal>
  );
}

function SuperAdmins({ supers, onClose }: { supers: (UserProfile & { id: string })[]; onClose: () => void }) {
  const toast = useToast();
  const { user: me } = useSession();
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState('');
  const change = async (target: string, enabled: boolean) => {
    setBusy(target);
    try {
      await call('setSuperAdmin', { email: target, enabled });
      toast.success(enabled ? `${target} is now a super admin. They must sign in again.` : `${target} is no longer a super admin.`);
      setEmail('');
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy('');
    }
  };
  return (
    <Modal open onClose={onClose} title="Super admins" description="Super admins manage every company and all platform settings. Keep this list short." footer={<Button variant="secondary" onClick={onClose}>Close</Button>}>
      <ul className="mb-4 divide-y divide-slate-100 rounded-lg border border-slate-200">
        {supers.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-2 px-3 py-2 text-sm">
            <span>{s.displayName} <span className="text-slate-500">{s.email}</span></span>
            {s.email && s.id !== me?.uid && (
              <Button size="sm" variant="ghost" loading={busy === s.email} icon={<ShieldOff className="h-4 w-4" />} onClick={() => change(s.email!, false)}>Remove</Button>
            )}
          </li>
        ))}
      </ul>
      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (email) change(email.trim().toLowerCase(), true);
        }}
      >
        <Input type="email" aria-label="Email of an existing account" placeholder="Email of an existing account" value={email} onChange={(e) => setEmail(e.target.value)} />
        <Button type="submit" loading={busy === email.trim().toLowerCase() && !!email}>Grant</Button>
      </form>
    </Modal>
  );
}
