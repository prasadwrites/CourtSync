import { useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { collection, doc, orderBy, query, where } from 'firebase/firestore';
import { Ban, Check, CalendarClock, LogIn, LogOut, UserX, Wallet, X, Undo2 } from 'lucide-react';
import { ACTIVE_BOOKING_STATUSES, BOOKING_STATUS_LABELS, round2, type Booking } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useAsync, useDoc, useQuery } from '@/lib/hooks';
import { usePaymentMethods } from '@/lib/master';
import { call, errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { fmtDate, fmtTs, formatMoney, timeRange } from '@/lib/format';
import { getAvailability, unitsFor } from '@/lib/booking';
import { Alert, Button, Card, CardHeader, ConfirmDialog, ErrorState, Input, KeyValue, Modal, PageHeader, Select, Spinner, Textarea } from '@/components/ui';
import { BookingStatusBadge, PaymentStatusBadge } from '@/components/StatusBadge';
import { PaymentsTable, type PaymentRow } from '@/components/PaymentsTable';
import { SlotPicker, type SlotSelection } from '@/components/SlotPicker';
import { useCompany } from './context';

type Dialog = null | 'approve' | 'reject' | 'cancel' | 'noShow' | 'modify' | 'pay' | 'checkIn' | 'checkOut' | { refund: PaymentRow } | { settle: PaymentRow };

export default function BookingDetail() {
  const { bookingId = '' } = useParams();
  const { companyId, can, sportName, branchName } = useCompany();
  const methods = usePaymentMethods();
  const booking = useDoc<Booking>(doc(db, 'companies', companyId, 'bookings', bookingId), `booking-${companyId}-${bookingId}`);
  const payments = useQuery<PaymentRow>(can('payments.view') ? query(collection(db, 'companies', companyId, 'payments'), where('referenceId', '==', bookingId), orderBy('createdAt', 'desc')) : null, `bpay-${bookingId}`);
  const [dialog, setDialog] = useState<Dialog>(null);
  const methodName = (id: string) => methods.data.find((m) => m.id === id)?.name ?? id;

  if (booking.loading) return <Spinner />;
  if (booking.error) return <ErrorState error={booking.error} />;
  if (!booking.data) return <ErrorState error={new Error('Booking not found')} />;
  const b = booking.data;
  const active = ACTIVE_BOOKING_STATUSES.includes(b.status);
  const due = round2(b.pricing.total - b.amountPaid + b.amountRefunded);
  const started = Date.now() >= b.startAt.toMillis();

  return (
    <>
      <PageHeader
        back={`/manage/${companyId}/bookings`}
        title={<span className="flex flex-wrap items-center gap-2">{b.customerName} <BookingStatusBadge status={b.status} /></span>}
        description={`${b.courtName} · ${fmtDate(b.date)} · ${timeRange(b.startMin, b.endMin)}`}
      />
      <div className="mb-4 flex flex-wrap gap-2">
        {b.status === 'pendingApproval' && can('bookings.approve') && (
          <>
            <Button variant="success" icon={<Check className="h-4 w-4" />} onClick={() => setDialog('approve')}>Approve</Button>
            <Button variant="danger" icon={<X className="h-4 w-4" />} onClick={() => setDialog('reject')}>Reject</Button>
          </>
        )}
        {['confirmed', 'approved'].includes(b.status) && can('checkin.operate') && <Button icon={<LogIn className="h-4 w-4" />} onClick={() => setDialog('checkIn')}>Check in</Button>}
        {b.status === 'checkedIn' && can('checkin.operate') && <Button icon={<LogOut className="h-4 w-4" />} onClick={() => setDialog('checkOut')}>Check out</Button>}
        {due > 0 && active && can('payments.record') && <Button variant="secondary" icon={<Wallet className="h-4 w-4" />} onClick={() => setDialog('pay')}>Record payment</Button>}
        {active && b.status !== 'checkedIn' && can('bookings.modify') && <Button variant="secondary" icon={<CalendarClock className="h-4 w-4" />} onClick={() => setDialog('modify')}>Change time</Button>}
        {['confirmed', 'approved'].includes(b.status) && started && can('bookings.cancel') && <Button variant="secondary" icon={<UserX className="h-4 w-4" />} onClick={() => setDialog('noShow')}>Mark no-show</Button>}
        {active && b.status !== 'checkedIn' && can('bookings.cancel') && <Button variant="ghost" icon={<Ban className="h-4 w-4" />} onClick={() => setDialog('cancel')}>Cancel booking</Button>}
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="space-y-4 lg:col-span-2">
          <Card>
            <CardHeader title="Details" />
            <KeyValue
              items={[
                { label: 'Customer', value: can('customers.view') ? <Link className="font-medium text-brand-700" to={`/manage/${companyId}/customers/${b.customerUid}`}>{b.customerName}</Link> : b.customerName },
                { label: 'Contact', value: b.customerContact },
                { label: 'Court', value: `${b.courtName} (${sportName(b.sportId)})` },
                { label: 'Branch', value: branchName(b.branchId) },
                { label: 'Participants', value: b.participants },
                { label: 'Check-in code', value: <span className="font-mono text-base tracking-widest">{b.verificationCode}</span> },
                { label: 'Booked by', value: b.source === 'staff' ? 'Staff' : 'Customer' },
                { label: 'Created', value: fmtTs(b.createdAt) },
                { label: 'Hold expires', value: b.holdExpiresAt && active ? fmtTs(b.holdExpiresAt) : null },
                { label: 'Checked in', value: b.checkIn ? `${fmtTs(b.checkIn.at)}${b.checkIn.lateMinutes > 0 ? ` (${b.checkIn.lateMinutes} min late)` : ''}${b.checkIn.manual ? ' · manual' : ''}` : null },
                { label: 'Checked out', value: b.checkOut ? `${fmtTs(b.checkOut.at)} · ${b.checkOut.durationMinutes} min${b.checkOut.overstayMinutes ? `, overstayed ${b.checkOut.overstayMinutes} min` : ''}` : null },
                { label: 'Cancellation', value: b.cancellation ? `${b.cancellation.reason || 'No reason'}${b.cancellation.late ? ` · late, charge ${formatMoney(b.cancellation.charge, b.pricing.currency)}` : ''}` : null },
                { label: 'Notes', value: b.notes },
              ].filter((i) => i.value !== null && i.value !== undefined && i.value !== '')}
            />
          </Card>
          {can('payments.view') && (
            <Card padded={false}>
              <div className="p-4 pb-0">
                <CardHeader title="Payments" />
              </div>
              <PaymentsTable
                rows={payments.data}
                loading={payments.loading}
                methodName={methodName}
                actions={(p) => (
                  <>
                    {p.type === 'charge' && p.status === 'succeeded' && can('payments.refund') && <Button size="sm" variant="ghost" icon={<Undo2 className="h-4 w-4" />} onClick={() => setDialog({ refund: p })}>Refund</Button>}
                    {p.type === 'refund' && p.status === 'pending' && can('payments.refund') && <Button size="sm" variant="secondary" onClick={() => setDialog({ settle: p })}>Mark handed back</Button>}
                  </>
                )}
              />
            </Card>
          )}
        </div>
        <div className="space-y-4">
          <Card>
            <CardHeader title="Price" action={<PaymentStatusBadge status={b.paymentStatus} />} />
            <ul className="space-y-1 text-sm">
              {b.pricing.lines.map((l, i) => (
                <li key={i} className="flex justify-between gap-2"><span className="text-slate-600">{l.label}</span><span>{formatMoney(l.amount, b.pricing.currency)}</span></li>
              ))}
              {b.pricing.creditsApplied > 0 && <li className="flex justify-between"><span className="text-slate-600">{b.pricing.creditsApplied} credits</span><span>−{formatMoney(b.pricing.creditsApplied * b.pricing.creditValue, b.pricing.currency)}</span></li>}
              <li className="flex justify-between border-t border-slate-100 pt-1 font-semibold"><span>Total</span><span>{formatMoney(b.pricing.total, b.pricing.currency)}</span></li>
              <li className="flex justify-between text-slate-600"><span>Paid</span><span>{formatMoney(b.amountPaid, b.pricing.currency)}</span></li>
              {b.amountRefunded > 0 && <li className="flex justify-between text-slate-600"><span>Refunded</span><span>{formatMoney(b.amountRefunded, b.pricing.currency)}</span></li>}
              {due > 0 && active && <li className="flex justify-between font-medium text-amber-700"><span>Balance due</span><span>{formatMoney(due, b.pricing.currency)}</span></li>}
            </ul>
          </Card>
          <Card>
            <CardHeader title="History" />
            <ol className="space-y-3 border-l border-slate-200 pl-4">
              {[...b.history].reverse().map((h, i) => (
                <li key={i} className="relative text-sm">
                  <span className="absolute -left-[21px] top-1.5 h-2.5 w-2.5 rounded-full bg-slate-300" />
                  <p className="font-medium">{BOOKING_STATUS_LABELS[h.status]}</p>
                  <p className="text-xs text-slate-500">{fmtTs(h.at)}{h.by ? '' : ' · automatic'}</p>
                  {h.note && <p className="text-xs text-slate-600">{h.note}</p>}
                </li>
              ))}
            </ol>
          </Card>
        </div>
      </div>
      <Dialogs dialog={dialog} close={() => setDialog(null)} b={b} due={due} />
    </>
  );
}

function Dialogs({ dialog, close, b }: { dialog: Dialog; close: () => void; b: Booking & { id: string }; due: number }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, msg: string) => {
    setBusy(true);
    try {
      await fn();
      toast.success(msg);
      setNote('');
      close();
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  if (!dialog) return null;
  const ref = { companyId, bookingId: b.id };
  if (dialog === 'approve' || dialog === 'reject') {
    const approve = dialog === 'approve';
    return (
      <ConfirmDialog open onClose={close} loading={busy} tone={approve ? 'primary' : 'danger'} title={approve ? 'Approve this booking?' : 'Reject this booking?'} confirmLabel={approve ? 'Approve' : 'Reject'}
        message={approve ? 'The customer is notified. If payment is required, they have until the payment hold expires to pay.' : 'The time is released and any payment is refunded.'}
        onConfirm={() => run(() => call('decideBooking', { ...ref, decision: approve ? 'approve' : 'reject', note: note || undefined }), approve ? 'Booking approved' : 'Booking rejected')}>
        <Textarea label={approve ? 'Note to customer (optional)' : 'Reason'} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </ConfirmDialog>
    );
  }
  if (dialog === 'cancel') {
    return (
      <ConfirmDialog open onClose={close} loading={busy} tone="danger" title="Cancel this booking?" confirmLabel="Cancel booking"
        message="Cancellation rules apply. Refunds go back to the original payment method and credits are restored."
        onConfirm={() => run(() => call('cancelBooking', { ...ref, reason: note }), 'Booking cancelled')}>
        <Textarea label="Reason" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </ConfirmDialog>
    );
  }
  if (dialog === 'noShow') {
    return (
      <ConfirmDialog open onClose={close} loading={busy} tone="danger" title="Mark as no-show?" confirmLabel="Mark no-show" message="The rest of the slot is released. No refund is made."
        onConfirm={() => run(() => call('markNoShow', { ...ref, note: note || undefined }), 'Marked as no-show')}>
        <Textarea label="Note" rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
      </ConfirmDialog>
    );
  }
  if (dialog === 'checkIn' || dialog === 'checkOut') return <CheckInDialog b={b} action={dialog} close={close} />;
  if (dialog === 'pay') return <RecordPaymentModal purpose="booking" referenceId={b.id} due={round2(b.pricing.total - b.amountPaid + b.amountRefunded)} currency={b.pricing.currency} close={close} />;
  if (dialog === 'modify') return <ModifyModal b={b} close={close} />;
  if ('refund' in dialog) return <RefundModal payment={dialog.refund} close={close} />;
  if ('settle' in dialog) {
    return (
      <ConfirmDialog open onClose={close} loading={busy} title="Refund handed back?" confirmLabel="Confirm" message={`Confirm that ${formatMoney(dialog.settle.amount, dialog.settle.currency)} was returned to the customer.`}
        onConfirm={() => run(() => call('settleRefund', { companyId, paymentId: dialog.settle.id }), 'Refund settled')} />
    );
  }
  return null;
}

export function CheckInDialog({ b, action, close }: { b: { id: string }; action: 'checkIn' | 'checkOut'; close: () => void }) {
  const toast = useToast();
  const { companyId, can } = useCompany();
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [issue, setIssue] = useState('');
  const submit = async () => {
    setBusy(true);
    setIssue('');
    try {
      await call('checkInOut', { companyId, bookingId: b.id, action, override, reason: override ? reason : undefined });
      toast.success(action === 'checkIn' ? 'Checked in' : 'Checked out');
      close();
    } catch (e) {
      setIssue(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal open onClose={close} size="sm" title={action === 'checkIn' ? 'Check in' : 'Check out'}
      footer={<><Button variant="secondary" onClick={close}>Cancel</Button><Button loading={busy} onClick={submit}>{action === 'checkIn' ? 'Check in' : 'Check out'}</Button></>}>
      <div className="space-y-3">
        {issue && <Alert tone="error">{issue}</Alert>}
        {action === 'checkIn' && can('checkin.override') && (
          <>
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> Override time, payment and status checks</label>
            {override && <Input label="Reason for override" value={reason} onChange={(e) => setReason(e.target.value)} />}
          </>
        )}
        {action === 'checkOut' && <p className="text-sm text-slate-600">Any remaining time on this booking is released for others to book.</p>}
      </div>
    </Modal>
  );
}

export function RecordPaymentModal({ purpose, referenceId, due, currency, close }: { purpose: 'booking' | 'subscription'; referenceId: string; due: number; currency: string; close: () => void }) {
  const toast = useToast();
  const { companyId, settings } = useCompany();
  const methods = usePaymentMethods();
  const offline = methods.data.filter((m) => m.kind === 'offline' && m.enabled && settings?.paymentMethodIds.includes(m.id));
  const [methodId, setMethodId] = useState('');
  const [amount, setAmount] = useState(String(due));
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const chosen = methodId || offline[0]?.id || '';
  return (
    <Modal open onClose={close} size="sm" title="Record a payment" description={`Balance due ${formatMoney(due, currency)}. Use this for cash or card-terminal payments taken at the desk.`}
      footer={
        <>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button loading={busy} disabled={!chosen || !(Number(amount) > 0)} onClick={async () => {
            setBusy(true);
            try {
              await call('recordOfflinePayment', { companyId, purpose, referenceId, paymentMethodId: chosen, amount: Number(amount), note: note || undefined });
              toast.success('Payment recorded');
              close();
            } catch (e) {
              toast.error(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}>Record</Button>
        </>
      }>
      {offline.length === 0 ? (
        <Alert tone="warning">No offline payment method is enabled. Enable one such as Cash in Settings, under Payments.</Alert>
      ) : (
        <div className="space-y-3">
          <Select label="Method" value={chosen} onChange={(e) => setMethodId(e.target.value)} options={offline.map((m) => ({ value: m.id, label: m.name }))} />
          <Input label={`Amount (${currency})`} type="number" min={0} step="0.01" max={due} value={amount} onChange={(e) => setAmount(e.target.value)} />
          <Input label="Reference or note" value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      )}
    </Modal>
  );
}

function RefundModal({ payment, close }: { payment: PaymentRow; close: () => void }) {
  const toast = useToast();
  const { companyId } = useCompany();
  const [amount, setAmount] = useState(String(payment.amount));
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Modal open onClose={close} size="sm" title="Refund payment" description={payment.provider === 'offline' ? 'Cash refunds stay pending until you mark them as handed back.' : 'The refund is sent to the payment gateway.'}
      footer={
        <>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button variant="danger" loading={busy} disabled={reason.trim().length < 3 || !(Number(amount) > 0)} onClick={async () => {
            setBusy(true);
            try {
              await call('refundPayment', { companyId, paymentId: payment.id, amount: Number(amount), reason });
              toast.success('Refund started');
              close();
            } catch (e) {
              toast.error(errorMessage(e));
            } finally {
              setBusy(false);
            }
          }}>Refund</Button>
        </>
      }>
      <div className="space-y-3">
        <Input label={`Amount (${payment.currency})`} type="number" min={0} step="0.01" max={payment.amount} value={amount} onChange={(e) => setAmount(e.target.value)} />
        <Input label="Reason" required value={reason} onChange={(e) => setReason(e.target.value)} />
      </div>
    </Modal>
  );
}

function ModifyModal({ b, close }: { b: Booking & { id: string }; close: () => void }) {
  const toast = useToast();
  const { companyId, company } = useCompany();
  const [date, setDate] = useState(b.date);
  const [participants, setParticipants] = useState(b.participants);
  const [slot, setSlot] = useState<SlotSelection | null>(null);
  const [busy, setBusy] = useState(false);
  const avail = useAsync(() => getAvailability(companyId, b.courtId, date), [date]);
  const court = avail.data?.court;
  // The booking's own cells show as taken; free them in the picker so the same time can be kept or extended.
  const slots = (avail.data?.days[0]?.slots ?? []).map((s) =>
    date === b.date && s.startMin >= b.startMin && s.startMin < b.endMin && (s.state === 'full' || s.state === 'limited')
      ? { ...s, state: 'available' as const, remaining: s.remaining + unitsFor(court?.bookingModel ?? 'exclusive', b.participants) }
      : s,
  );
  return (
    <Modal open onClose={close} size="lg" title="Change booking time" description="The price is recalculated. The customer is notified."
      footer={
        <>
          <Button variant="secondary" onClick={close}>Cancel</Button>
          <Button loading={busy} disabled={!slot} onClick={async () => {
            if (!slot) return;
            setBusy(true);
            try {
              await call('modifyBooking', { companyId, bookingId: b.id, date, startMin: slot.startMin, endMin: slot.endMin, participants });
              toast.success('Booking updated');
              close();
            } catch (e) {
              toast.error(errorMessage(e));
              avail.reload();
            } finally {
              setBusy(false);
            }
          }}>Save change</Button>
        </>
      }>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Input type="date" label="Date" value={date} onChange={(e) => { if (e.target.value) { setDate(e.target.value); setSlot(null); } }} />
          <Input type="number" label="Participants" min={1} max={court?.maxParticipants ?? 100} value={participants} onChange={(e) => setParticipants(Math.max(1, Number(e.target.value) || 1))} />
        </div>
        {avail.loading ? <Spinner /> : avail.error ? <ErrorState error={avail.error} retry={avail.reload} /> : court && (
          <SlotPicker court={court} slots={slots} units={unitsFor(court.bookingModel, participants)} value={slot} onChange={setSlot} currency={company.currency} />
        )}
      </div>
    </Modal>
  );
}
