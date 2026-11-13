import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { doc } from 'firebase/firestore';
import { DateTime } from 'luxon';
import { Info } from 'lucide-react';
import { round2, type Booking, type CompanyCustomer, type CompanySettings } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useAsync, useDoc } from '@/lib/hooks';
import { usePaymentMethods } from '@/lib/master';
import { useSession } from '@/lib/auth';
import { call, errorMessage } from '@/lib/api';
import { useToast } from '@/lib/toast';
import { getAvailability, unitsFor, type CreateBookingResult, type StartPaymentResult } from '@/lib/booking';
import { formatMoney, todayISO, timeRange } from '@/lib/format';
import { Alert, Badge, Button, Card, CardHeader, ErrorState, Input, PageHeader, Spinner, Textarea } from '@/components/ui';
import { DateStrip } from '@/components/DateStrip';
import { SlotPicker, type SlotSelection } from '@/components/SlotPicker';
import { PaymentDialog } from '@/components/PaymentDialog';

const DAYS = 14;

export default function CourtBooking() {
  const { companyId = '', courtId = '' } = useParams();
  const { user } = useSession();
  const toast = useToast();
  const navigate = useNavigate();
  const methods = usePaymentMethods();
  const me = useDoc<CompanyCustomer>(user ? doc(db, 'companies', companyId, 'customers', user.uid) : null, `cb-me-${companyId}-${user?.uid}`);
  const settings = useDoc<CompanySettings>(doc(db, 'companies', companyId, 'settings', 'general'), `cb-set-${companyId}`);
  const [start] = useState(() => todayISO());
  const end = DateTime.fromISO(start).plus({ days: DAYS - 1 }).toISODate()!;
  const avail = useAsync(() => getAvailability(companyId, courtId, start, end), [companyId, courtId, start]);
  const [date, setDate] = useState(start);
  const [participants, setParticipants] = useState(1);
  const [slot, setSlot] = useState<SlotSelection | null>(null);
  const [credits, setCredits] = useState(0);
  const [methodId, setMethodId] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [joining, setJoining] = useState(false);
  const [created, setCreated] = useState<{ bookingId: string; payment: StartPaymentResult } | null>(null);
  const booking = useDoc<Booking>(created ? doc(db, 'companies', companyId, 'bookings', created.bookingId) : null, `cb-b-${created?.bookingId}`);

  const court = avail.data?.court;
  const day = avail.data?.days.find((d) => d.date === date);
  const units = court ? unitsFor(court.bookingModel, participants) : 1;
  const freeCount = useMemo(() => {
    const m = new Map((avail.data?.days ?? []).map((d) => [d.date, d.slots.filter((s) => (s.state === 'available' || s.state === 'limited') && s.remaining >= units).length]));
    return (d: string) => m.get(d) ?? 0;
  }, [avail.data, units]);

  if (avail.loading) return <Spinner />;
  if (avail.error) return <ErrorState error={avail.error} retry={avail.reload} />;
  if (!avail.data || !court) return null;
  const { company, rules } = avail.data;
  const s = settings.data;
  const creditRules = s?.credits;
  const canUseCredits = !!creditRules?.enabled && creditRules.eligible.bookings && (me.data?.creditBalance ?? 0) > 0;
  const accepted = methods.data.filter((m) => m.enabled && s?.paymentMethodIds.includes(m.id));
  const online = accepted.filter((m) => m.kind === 'online');
  const offline = accepted.filter((m) => m.kind === 'offline');
  const chosenMethod = methodId || online[0]?.id || offline[0]?.id || '';
  const estimate = slot?.estimate !== undefined ? round2(slot.estimate * (court.bookingModel === 'shared' ? participants : 1)) : undefined;
  const creditValue = creditRules ? credits * creditRules.creditValue : 0;
  const member = me.data?.status === 'active';

  const join = async () => {
    setJoining(true);
    try {
      await call('joinCompany', { companyId });
    } catch (e) {
      toast.error(errorMessage(e));
    } finally {
      setJoining(false);
    }
  };

  const submit = async () => {
    if (!slot) return;
    setBusy(true);
    try {
      const r = await call<CreateBookingResult>('createBooking', { companyId, courtId, date, startMin: slot.startMin, endMin: slot.endMin, participants, credits, paymentMethodId: chosenMethod || undefined, notes: notes || undefined });
      const method = accepted.find((m) => m.id === chosenMethod);
      if (r.status === 'paymentPending' && method?.kind === 'online' && r.pricing.total > 0) {
        const p = await call<StartPaymentResult>('startPayment', { companyId, purpose: 'booking', referenceId: r.bookingId, paymentMethodId: method.id });
        setCreated({ bookingId: r.bookingId, payment: p });
        return;
      }
      toast.success(r.status === 'pendingApproval' ? 'Request sent. The venue will confirm it.' : r.status === 'confirmed' ? 'Booking confirmed' : 'Booking created');
      navigate(`/bookings/${companyId}/${r.bookingId}`);
    } catch (e) {
      toast.error(errorMessage(e));
      avail.reload();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <PageHeader back={`/c/${companyId}`} title={court.name} description={`${court.sportName} · ${company.name}`} />
      {court.status === 'temporarilyClosed' && <Alert tone="warning">This court is temporarily closed.</Alert>}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <div className="min-w-0 space-y-4 lg:col-span-2">
          <Card>
            <DateStrip dates={avail.data.days.map((d) => d.date)} value={date} onChange={(d) => { setDate(d); setSlot(null); }} freeCount={freeCount} />
          </Card>
          <Card>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <p className="font-medium">{DateTime.fromISO(date).toFormat('cccc, d LLLL')}</p>
              {court.maxParticipants > 1 && (
                <Input type="number" label={court.bookingModel === 'shared' ? 'People' : 'Players'} className="w-24" min={1} max={court.maxParticipants} value={participants} onChange={(e) => setParticipants(Math.min(court.maxParticipants, Math.max(1, Number(e.target.value) || 1)))} />
              )}
            </div>
            {day ? <SlotPicker court={court} slots={day.slots} units={units} value={slot} onChange={setSlot} currency={company.currency} /> : <p className="text-sm text-slate-500">No availability.</p>}
          </Card>
          {(court.description || court.amenities.length > 0) && (
            <Card>
              <CardHeader title="About this court" />
              {court.description && <p className="mb-2 whitespace-pre-line text-sm text-slate-700">{court.description}</p>}
              <div className="flex flex-wrap gap-1">{[...court.amenities, ...court.equipment].map((a) => <Badge key={a}>{a}</Badge>)}</div>
            </Card>
          )}
        </div>
        <div>
          <Card className="lg:sticky lg:top-20">
            <CardHeader title="Your booking" />
            {!member ? (
              me.loading ? <Spinner /> : me.data ? <Alert tone="error">Your account at this venue is {me.data.status}.</Alert> : (
                <div className="space-y-2">
                  <p className="text-sm text-slate-600">Join {company.name} to book. It's free and takes a second.</p>
                  <Button className="w-full" loading={joining} onClick={join}>Join {company.name}</Button>
                </div>
              )
            ) : !slot ? (
              <p className="text-sm text-slate-500">Pick a time to continue.</p>
            ) : (
              <div className="space-y-3">
                <p className="text-sm"><span className="font-medium">{DateTime.fromISO(date).toFormat('ccc d LLL')}</span>, {timeRange(slot.startMin, slot.endMin)}{participants > 1 ? ` · ${participants} ${court.bookingModel === 'shared' ? 'people' : 'players'}` : ''}</p>
                {canUseCredits && (
                  <Input type="number" label={`Use credits (you have ${me.data!.creditBalance})`} min={0} max={me.data!.creditBalance} value={credits}
                    hint={creditRules!.minRedeem ? `Minimum ${creditRules!.minRedeem}.` : undefined}
                    onChange={(e) => setCredits(Math.max(0, Math.min(me.data!.creditBalance, Math.round(Number(e.target.value) || 0))))} />
                )}
                {accepted.length > 0 && (
                  <fieldset className="space-y-1">
                    <legend className="mb-1 text-sm font-medium text-slate-700">Payment</legend>
                    {accepted.map((m) => (
                      <label key={m.id} className="flex items-center gap-2 text-sm">
                        <input type="radio" name="method" checked={chosenMethod === m.id} onChange={() => setMethodId(m.id)} />
                        {m.name}{m.kind === 'offline' && <span className="text-slate-500"> (pay at the venue)</span>}
                      </label>
                    ))}
                  </fieldset>
                )}
                <Textarea label="Note for the venue" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
                {estimate !== undefined && (
                  <div className="space-y-0.5 border-t border-slate-100 pt-2 text-sm">
                    <p className="flex justify-between"><span>Price</span><span>{formatMoney(estimate, company.currency)}</span></p>
                    {credits > 0 && <p className="flex justify-between text-slate-600"><span>Credits</span><span>−{formatMoney(Math.min(creditValue, estimate), company.currency)}</span></p>}
                    <p className="flex justify-between font-semibold"><span>Estimated total</span><span>{formatMoney(Math.max(0, estimate - creditValue), company.currency)}</span></p>
                  </div>
                )}
                <p className="flex gap-1.5 text-xs text-slate-500"><Info className="h-4 w-4 shrink-0" />
                  {rules.requirePrepayment ? 'Pay now to hold this time.' : rules.requireApproval ? 'The venue confirms your request, usually within a few hours.' : 'Confirmed instantly.'}
                  {rules.cancellationDeadlineHours > 0 && ` Free cancellation up to ${rules.cancellationDeadlineHours} h before.`}
                </p>
                {s?.verification.requireBeforeBooking && <p className="text-xs text-amber-700">This venue requires ID verification. <Link className="font-medium underline" to={`/c/${companyId}/verify`}>Verify</Link></p>}
                <Button size="lg" className="w-full" loading={busy} onClick={submit}>{rules.requirePrepayment ? 'Continue to payment' : rules.requireApproval ? 'Request booking' : 'Book now'}</Button>
              </div>
            )}
          </Card>
        </div>
      </div>
      {created && (
        <PaymentDialog companyId={companyId} payment={created.payment} title={`${court.name}, ${timeRange(slot?.startMin ?? 0, slot?.endMin ?? 0)}`}
          paid={!!booking.data && ['paid', 'partiallyPaid'].includes(booking.data.paymentStatus)}
          onClose={() => navigate(`/bookings/${companyId}/${created.bookingId}`)} />
      )}
    </div>
  );
}
