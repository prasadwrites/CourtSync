import { useEffect, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { doc } from 'firebase/firestore';
import QRCode from 'qrcode';
import { CalendarPlus, MapPin } from 'lucide-react';
import { ACTIVE_BOOKING_STATUSES, BOOKING_STATUS_LABELS, round2, type Booking, type Company, type CompanySettings } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useDoc } from '@/lib/hooks';
import { usePaymentMethods } from '@/lib/master';
import { call, errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { qrPayload } from '@/lib/qr';
import { fmtDate, fmtTs, formatMoney, timeRange } from '@/lib/format';
import type { StartPaymentResult } from '@/lib/booking';
import { Alert, Button, Card, CardHeader, ConfirmDialog, ErrorState, PageHeader, Spinner, Textarea } from '@/components/ui';
import { BookingStatusBadge, PaymentStatusBadge } from '@/components/StatusBadge';
import { PaymentDialog } from '@/components/PaymentDialog';

export default function BookingDetail() {
  const { companyId = '', bookingId = '' } = useParams();
  const [params] = useSearchParams();
  const toast = useToast();
  const booking = useDoc<Booking>(doc(db, 'companies', companyId, 'bookings', bookingId), `my-b-${companyId}-${bookingId}`);
  const company = useDoc<Company>(doc(db, 'companies', companyId), `my-b-c-${companyId}`);
  const settings = useDoc<CompanySettings>(doc(db, 'companies', companyId, 'settings', 'general'), `my-b-s-${companyId}`);
  const methods = usePaymentMethods();
  const [qr, setQr] = useState('');
  const [cancelOpen, setCancelOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [payment, setPayment] = useState<StartPaymentResult | null>(null);
  const b = booking.data;

  useEffect(() => {
    if (!b?.checkInToken) return;
    QRCode.toDataURL(qrPayload(companyId, b.checkInToken), { margin: 1, width: 320, errorCorrectionLevel: 'M' }).then(setQr).catch(() => setQr(''));
  }, [b?.checkInToken, companyId]);

  if (booking.loading) return <Spinner />;
  if (booking.error || !b) return <ErrorState error={booking.error ?? new Error('Booking not found')} />;
  const active = ACTIVE_BOOKING_STATUSES.includes(b.status);
  const due = round2(b.pricing.total - b.amountPaid + b.amountRefunded);
  const online = methods.data.filter((m) => m.enabled && m.kind === 'online' && settings.data?.paymentMethodIds.includes(m.id));
  const canPay = due > 0 && ['paymentPending', 'approved', 'confirmed'].includes(b.status) && online.length > 0;
  const deadlineH = settings.data?.booking.cancellationDeadlineHours ?? 0;
  const late = Date.now() > b.startAt.toMillis() - deadlineH * 3600_000;
  const showPass = ['confirmed', 'approved', 'checkedIn'].includes(b.status);
  const returning = params.get('payment');

  const pay = async (methodId: string) => {
    setBusy(true);
    try {
      setPayment(await call<StartPaymentResult>('startPayment', { companyId, purpose: 'booking', referenceId: b.id, paymentMethodId: methodId }));
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const ics = () => {
    const fmt = (ms: number) => new Date(ms).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
    const body = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//CourtSync//EN', 'BEGIN:VEVENT', `UID:${b.id}@courtsync`, `DTSTAMP:${fmt(Date.now())}`, `DTSTART:${fmt(b.startAt.toMillis())}`, `DTEND:${fmt(b.endAt.toMillis())}`,
      `SUMMARY:${b.courtName} at ${company.data?.name ?? 'CourtSync'}`, `DESCRIPTION:Check-in code ${b.verificationCode}`, `LOCATION:${[company.data?.address?.line1, company.data?.city].filter(Boolean).join(', ')}`, 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], { type: 'text/calendar' }));
    a.download = 'booking.ics';
    a.click();
  };

  return (
    <div className="space-y-4">
      <PageHeader back="/bookings" title={<span className="flex flex-wrap items-center gap-2">{b.courtName} <BookingStatusBadge status={b.status} /></span>} description={`${fmtDate(b.date)} · ${timeRange(b.startMin, b.endMin)}`} />
      {returning && b.paymentStatus === 'unpaid' && <Alert tone="info">We're waiting for the payment provider to confirm your payment. This page updates automatically.</Alert>}
      {b.status === 'pendingApproval' && <Alert tone="info">The venue is reviewing your request.{b.holdExpiresAt ? ` It expires if not answered by ${fmtTs(b.holdExpiresAt)}.` : ''}</Alert>}
      {b.status === 'paymentPending' && <Alert tone="warning">Pay to keep this time{b.holdExpiresAt ? ` before ${fmtTs(b.holdExpiresAt)}` : ''}, or it's released.</Alert>}
      <div className="grid gap-4 lg:grid-cols-2">
        {showPass && (
          <Card className="text-center">
            <CardHeader title="Your pass" description="Show this at the front desk to check in." />
            {qr ? <img src={qr} alt="Check-in QR code" className="mx-auto h-56 w-56" /> : <Spinner />}
            <p className="mt-2 text-xs text-slate-500">Or give the code</p>
            <p className="font-mono text-3xl font-semibold tracking-[0.3em]">{b.verificationCode}</p>
            {b.checkIn && <p className="mt-2 text-sm text-court-700">Checked in {fmtTs(b.checkIn.at)}</p>}
          </Card>
        )}
        <Card>
          <CardHeader title={company.data?.name ?? 'Details'} action={<PaymentStatusBadge status={b.paymentStatus} />} />
          <ul className="space-y-1 text-sm">
            {b.pricing.lines.map((l, i) => <li key={i} className="flex justify-between"><span className="text-slate-600">{l.label}</span><span>{formatMoney(l.amount, b.pricing.currency)}</span></li>)}
            {b.pricing.creditsApplied > 0 && <li className="flex justify-between"><span className="text-slate-600">{b.pricing.creditsApplied} credits</span><span>−{formatMoney(b.pricing.creditsApplied * b.pricing.creditValue, b.pricing.currency)}</span></li>}
            <li className="flex justify-between border-t border-slate-100 pt-1 font-semibold"><span>Total</span><span>{formatMoney(b.pricing.total, b.pricing.currency)}</span></li>
            <li className="flex justify-between text-slate-600"><span>Paid</span><span>{formatMoney(b.amountPaid, b.pricing.currency)}</span></li>
            {b.amountRefunded > 0 && <li className="flex justify-between text-slate-600"><span>Refunded</span><span>{formatMoney(b.amountRefunded, b.pricing.currency)}</span></li>}
          </ul>
          {canPay && (
            <div className="mt-3 space-y-2">
              {online.map((m) => <Button key={m.id} className="w-full" loading={busy} onClick={() => pay(m.id)}>Pay {formatMoney(due, b.pricing.currency)} with {m.name}</Button>)}
            </div>
          )}
          {due > 0 && active && !canPay && <p className="mt-3 text-sm text-slate-600">Pay {formatMoney(due, b.pricing.currency)} at the venue.</p>}
          <div className="mt-4 flex flex-wrap gap-2 border-t border-slate-100 pt-3">
            {active && b.status !== 'checkedIn' && <Button variant="secondary" size="sm" icon={<CalendarPlus className="h-4 w-4" />} onClick={ics}>Add to calendar</Button>}
            {company.data?.location && <a className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-slate-300 px-3 text-sm" target="_blank" rel="noreferrer" href={`https://www.google.com/maps/search/?api=1&query=${company.data.location.lat},${company.data.location.lng}`}><MapPin className="h-4 w-4" />Directions</a>}
            <Link className="inline-flex h-8 items-center px-2 text-sm font-medium text-brand-700" to={`/c/${companyId}`}>Venue page</Link>
          </div>
        </Card>
      </div>
      <Card>
        <CardHeader title="History" />
        <ol className="space-y-2 text-sm">
          {[...b.history].reverse().map((h, i) => <li key={i}><span className="font-medium">{BOOKING_STATUS_LABELS[h.status]}</span> <span className="text-slate-500">· {fmtTs(h.at)}</span>{h.note && <span className="block text-slate-600">{h.note}</span>}</li>)}
        </ol>
        {settings.data?.booking.refundPolicy && <p className="mt-3 text-xs text-slate-500">{settings.data.booking.refundPolicy}</p>}
      </Card>
      {active && b.status !== 'checkedIn' && <Button variant="ghost" className="text-red-700" onClick={() => setCancelOpen(true)}>Cancel booking</Button>}
      <ConfirmDialog open={cancelOpen} onClose={() => setCancelOpen(false)} loading={busy} tone="danger" title="Cancel this booking?" confirmLabel="Cancel booking"
        message={late && b.amountPaid > 0 ? `It's past the free cancellation deadline (${deadlineH} h before). A late cancellation charge of ${settings.data?.booking.lateCancellationChargePct ?? 0}% applies.` : 'Any payment is refunded to the original method and credits are returned.'}
        onConfirm={async () => {
          setBusy(true);
          try {
            const r = await call<{ late: boolean; charge: number; refund: number }>('cancelBooking', { companyId, bookingId: b.id, reason });
            toast.success(r.refund > 0 ? `Cancelled. ${formatMoney(r.refund, b.pricing.currency)} will be refunded.` : 'Booking cancelled');
            setCancelOpen(false);
          } catch (e) {
            toast.error(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}>
        <Textarea label="Reason (optional)" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
      </ConfirmDialog>
      {payment && <PaymentDialog companyId={companyId} payment={payment} paid={b.paymentStatus === 'paid'} title={`${b.courtName}, ${fmtDate(b.date)}`} onClose={() => setPayment(null)} />}
    </div>
  );
}
