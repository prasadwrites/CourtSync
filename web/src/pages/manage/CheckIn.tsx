import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Camera, CameraOff, KeyRound, LogIn, LogOut, RotateCcw } from 'lucide-react';
import type { BookingStatus, PaymentStatus, Ts } from '@courtsync/shared';
import { call, errorMessage } from '@/lib/api';
import { parseQr } from '@/lib/qr';
import { fmtDate, formatMoney, timeRange } from '@/lib/format';
import { useToast } from '@/lib/toast';
import { Alert, Button, Card, CardHeader, Input, KeyValue, PageHeader } from '@/components/ui';
import { BookingStatusBadge, PaymentStatusBadge } from '@/components/StatusBadge';
import { useCompany } from './context';
import { RecordPaymentModal } from './BookingDetail';

interface Lookup {
  booking: { id: string; courtName: string; customerName: string; date: string; startMin: number; endMin: number; participants: number; status: BookingStatus; paymentStatus: PaymentStatus; total: number; amountPaid: number; currency: string; checkIn: { at: Ts } | null };
  issues: string[];
  balanceDue: number;
  canCheckOut: boolean;
}

type Ref = { token: string } | { code: string };

export default function CheckIn() {
  const toast = useToast();
  const { companyId, can } = useCompany();
  const [code, setCode] = useState('');
  const [ref, setRef] = useState<Ref | null>(null);
  const [result, setResult] = useState<Lookup | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [override, setOverride] = useState(false);
  const [reason, setReason] = useState('');
  const [payOpen, setPayOpen] = useState(false);

  const lookup = async (r: Ref) => {
    setBusy(true);
    setError('');
    setResult(null);
    setOverride(false);
    setReason('');
    try {
      const res = await call<Lookup>('lookupCheckIn', { companyId, ...r });
      setRef(r);
      setResult(res);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const act = async (action: 'checkIn' | 'checkOut') => {
    if (!result) return;
    setBusy(true);
    setError('');
    try {
      await call('checkInOut', { companyId, bookingId: result.booking.id, action, override, reason: override ? reason : undefined });
      toast.success(action === 'checkIn' ? `${result.booking.customerName} checked in` : `${result.booking.customerName} checked out`);
      reset();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  const reset = () => {
    setResult(null);
    setRef(null);
    setCode('');
    setError('');
  };

  const onScan = (text: string) => {
    const parsed = parseQr(text);
    if (!parsed) return setError('That QR code is not a CourtSync booking pass.');
    if (parsed.companyId && parsed.companyId !== companyId) return setError('This pass is for a different venue.');
    setScanning(false);
    lookup({ token: parsed.token });
  };

  const b = result?.booking;
  return (
    <>
      <PageHeader title="Check-in" description="Scan the customer's booking pass, or type the 6-digit code shown on it." />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-4">
          <Card>
            <CardHeader title="Scan QR code" action={<Button variant={scanning ? 'secondary' : 'primary'} size="sm" icon={scanning ? <CameraOff className="h-4 w-4" /> : <Camera className="h-4 w-4" />} onClick={() => setScanning(!scanning)}>{scanning ? 'Stop camera' : 'Start camera'}</Button>} />
            {scanning ? <Scanner onResult={onScan} onError={(m) => { setScanning(false); setError(m); }} /> : <p className="text-sm text-slate-500">The camera starts only when you press Start.</p>}
          </Card>
          <Card>
            <CardHeader title="Enter code" />
            <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); if (/^\d{6}$/.test(code)) lookup({ code }); }}>
              <Input aria-label="6-digit code" inputMode="numeric" autoComplete="off" maxLength={6} placeholder="123456" className="font-mono text-lg tracking-[0.4em]" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
              <Button type="submit" loading={busy && !result} disabled={code.length !== 6} icon={<KeyRound className="h-4 w-4" />}>Find</Button>
            </form>
          </Card>
        </div>
        <div>
          {error && <div className="mb-3"><Alert tone="error">{error}</Alert></div>}
          {b ? (
            <Card>
              <CardHeader title={b.customerName} description={`${b.courtName} · ${fmtDate(b.date)} · ${timeRange(b.startMin, b.endMin)}`} action={<BookingStatusBadge status={b.status} />} />
              <KeyValue
                items={[
                  { label: 'Participants', value: b.participants },
                  { label: 'Payment', value: <span className="flex items-center gap-2"><PaymentStatusBadge status={b.paymentStatus} /> {formatMoney(b.amountPaid, b.currency)} of {formatMoney(b.total, b.currency)}</span> },
                ]}
              />
              {result.balanceDue > 0 && (
                <div className="mt-3">
                  <Alert tone="warning" title={`Balance due: ${formatMoney(result.balanceDue, b.currency)}`}>
                    {can('payments.record') && <Button size="sm" variant="secondary" className="mt-2" onClick={() => setPayOpen(true)}>Record payment</Button>}
                  </Alert>
                </div>
              )}
              {result.issues.length > 0 && (
                <div className="mt-3">
                  <Alert tone="error" title="Can't check in yet">
                    <ul className="list-disc pl-4">{result.issues.map((i) => <li key={i}>{i}</li>)}</ul>
                  </Alert>
                  {can('checkin.override') && (
                    <div className="mt-3 space-y-2">
                      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={override} onChange={(e) => setOverride(e.target.checked)} /> Override and check in anyway</label>
                      {override && <Input label="Reason (recorded in the audit log)" value={reason} onChange={(e) => setReason(e.target.value)} />}
                    </div>
                  )}
                </div>
              )}
              <div className="mt-4 flex flex-wrap gap-2">
                {result.canCheckOut ? (
                  <Button size="lg" loading={busy} icon={<LogOut className="h-5 w-5" />} onClick={() => act('checkOut')}>Check out</Button>
                ) : (
                  <Button size="lg" variant="success" loading={busy} disabled={result.issues.length > 0 && (!override || reason.trim().length < 3)} icon={<LogIn className="h-5 w-5" />} onClick={() => act('checkIn')}>Check in</Button>
                )}
                <Button size="lg" variant="ghost" icon={<RotateCcw className="h-4 w-4" />} onClick={reset}>Next customer</Button>
                <Link className="self-center text-sm font-medium text-brand-700" to={`/manage/${companyId}/bookings/${b.id}`}>Open booking</Link>
              </div>
            </Card>
          ) : (
            !error && <Card><p className="py-10 text-center text-sm text-slate-500">Scan a pass or enter a code to see the booking.</p></Card>
          )}
        </div>
      </div>
      {payOpen && b && ref && (
        <RecordPaymentModal purpose="booking" referenceId={b.id} due={result!.balanceDue} currency={b.currency} close={() => { setPayOpen(false); lookup(ref); }} />
      )}
    </>
  );
}

function Scanner({ onResult, onError }: { onResult: (text: string) => void; onError: (msg: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const last = useRef('');
  useEffect(() => {
    let scanner: { start: () => Promise<void>; stop: () => void; destroy: () => void } | null = null;
    let alive = true;
    import('qr-scanner').then(({ default: QrScanner }) => {
      if (!alive || !video.current) return;
      const s = new QrScanner(
        video.current,
        (r) => {
          if (r.data && r.data !== last.current) {
            last.current = r.data;
            onResult(r.data);
          }
        },
        { preferredCamera: 'environment', highlightScanRegion: true, returnDetailedScanResult: true },
      );
      scanner = s;
      s.start().catch(() => onError('Camera access was blocked. Allow the camera in your browser settings, or type the code instead.'));
    });
    return () => {
      alive = false;
      scanner?.stop();
      scanner?.destroy();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return <video ref={video} className="aspect-square w-full rounded-lg bg-black object-cover" muted playsInline />;
}
