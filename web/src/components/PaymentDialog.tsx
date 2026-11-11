import { useEffect, useRef, useState } from 'react';
import { CheckCircle2, Loader2 } from 'lucide-react';
import { call, errorMessage } from '@/lib/api';
import type { StartPaymentResult } from '@/lib/booking';
import { formatMoney } from '@/lib/format';
import { Alert, Button, Modal } from '@/components/ui';

type Phase = 'ready' | 'processing' | 'submitted' | 'failed';

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (document.querySelector(`script[src="${src}"]`)) return resolve();
    const s = document.createElement('script');
    s.src = src;
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('The payment page could not be loaded. Check your connection.'));
    document.head.appendChild(s);
  });
}

/**
 * Runs the gateway's checkout for a payment created by startPayment. The booking only becomes paid
 * when the gateway's signed webhook reaches the server; `paid` comes from the caller's live booking doc.
 */
export function PaymentDialog({ companyId, payment, paid, title, onClose }: { companyId: string; payment: StartPaymentResult; paid: boolean; title: string; onClose: () => void }) {
  const [phase, setPhase] = useState<Phase>('ready');
  const [error, setError] = useState('');
  const kind = (payment.checkout as { kind?: string }).kind;

  useEffect(() => {
    if (paid) setPhase('submitted');
  }, [paid]);

  return (
    <Modal open onClose={onClose} title={paid ? 'Payment received' : `Pay ${formatMoney(payment.amount, payment.currency)}`} description={title}
      footer={paid || phase === 'submitted' ? <Button onClick={onClose}>Done</Button> : <Button variant="secondary" onClick={onClose}>Pay later</Button>}>
      {paid ? (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <CheckCircle2 className="h-12 w-12 text-court-600" />
          <p className="text-sm text-slate-700">Your payment is confirmed.</p>
        </div>
      ) : phase === 'submitted' ? (
        <div className="flex flex-col items-center gap-2 py-4 text-center">
          <Loader2 className="h-8 w-8 animate-spin text-brand-600" />
          <p className="text-sm text-slate-700">Waiting for the payment provider to confirm. This usually takes a few seconds; you can close this window.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {error && <Alert tone="error">{error}</Alert>}
          {kind === 'sandbox' && <SandboxCheckout companyId={companyId} payment={payment} onDone={(ok) => (ok ? setPhase('submitted') : (setPhase('failed'), setError('The test payment failed. Try again.')))} />}
          {kind === 'razorpay' && <RazorpayCheckout payment={payment} onSubmitted={() => setPhase('submitted')} onError={setError} />}
          {kind === 'stripe' && <StripeCheckout payment={payment} onSubmitted={() => setPhase('submitted')} onError={setError} />}
          {!['sandbox', 'razorpay', 'stripe'].includes(kind ?? '') && <Alert tone="info">Pay at the venue. Staff will record your payment.</Alert>}
        </div>
      )}
    </Modal>
  );
}

function SandboxCheckout({ companyId, payment, onDone }: { companyId: string; payment: StartPaymentResult; onDone: (ok: boolean) => void }) {
  const [busy, setBusy] = useState<'succeeded' | 'failed' | null>(null);
  const run = async (outcome: 'succeeded' | 'failed') => {
    setBusy(outcome);
    try {
      await call('confirmSandboxPayment', { companyId, paymentId: payment.paymentId, outcome });
      onDone(outcome === 'succeeded');
    } catch (e) {
      alert(errorMessage(e));
    } finally {
      setBusy(null);
    }
  };
  return (
    <>
      <Alert tone="warning" title="Test mode">This is the sandbox provider. No money changes hands.</Alert>
      <div className="flex gap-2">
        <Button variant="success" loading={busy === 'succeeded'} onClick={() => run('succeeded')}>Simulate successful payment</Button>
        <Button variant="secondary" loading={busy === 'failed'} onClick={() => run('failed')}>Simulate failure</Button>
      </div>
    </>
  );
}

function RazorpayCheckout({ payment, onSubmitted, onError }: { payment: StartPaymentResult; onSubmitted: () => void; onError: (m: string) => void }) {
  const [busy, setBusy] = useState(false);
  const c = payment.checkout as { keyId: string; orderId: string; amount: number; currency: string; description: string; prefill: Record<string, string> };
  const open = async () => {
    setBusy(true);
    try {
      await loadScript('https://checkout.razorpay.com/v1/checkout.js');
      const Razorpay = (window as unknown as { Razorpay: new (o: unknown) => { open: () => void; on: (e: string, cb: (r: { error?: { description?: string } }) => void) => void } }).Razorpay;
      const rz = new Razorpay({
        key: c.keyId,
        order_id: c.orderId,
        amount: c.amount,
        currency: c.currency,
        name: 'CourtSync',
        description: c.description,
        prefill: c.prefill,
        theme: { color: '#1d4ed8' },
        // The handler fires in the browser only; the server waits for Razorpay's signed webhook.
        handler: () => onSubmitted(),
        modal: { ondismiss: () => setBusy(false) },
      });
      rz.on('payment.failed', (r) => onError(r.error?.description ?? 'The payment failed.'));
      rz.open();
    } catch (e) {
      onError(errorMessage(e));
      setBusy(false);
    }
  };
  return <Button size="lg" className="w-full" loading={busy} onClick={open}>Pay with UPI, card or netbanking</Button>;
}

function StripeCheckout({ payment, onSubmitted, onError }: { payment: StartPaymentResult; onSubmitted: () => void; onError: (m: string) => void }) {
  const c = payment.checkout as { clientSecret: string; publishableKey: string; returnUrl?: string };
  const mount = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const stripeRef = useRef<{ stripe: any; elements: any } | null>(null);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let alive = true;
    loadScript('https://js.stripe.com/v3/')
      .then(() => {
        if (!alive || !mount.current) return;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const stripe = (window as any).Stripe(c.publishableKey);
        const elements = stripe.elements({ clientSecret: c.clientSecret });
        const el = elements.create('payment');
        el.mount(mount.current);
        el.on('ready', () => setReady(true));
        stripeRef.current = { stripe, elements };
      })
      .catch((e) => onError(errorMessage(e)));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const pay = async () => {
    if (!stripeRef.current) return;
    setBusy(true);
    const { stripe, elements } = stripeRef.current;
    const res = await stripe.confirmPayment({ elements, confirmParams: { return_url: c.returnUrl ?? window.location.href }, redirect: 'if_required' });
    setBusy(false);
    if (res.error) onError(res.error.message ?? 'The payment failed.');
    else onSubmitted();
  };
  return (
    <div className="space-y-3">
      <div ref={mount} className="min-h-24" />
      <Button size="lg" className="w-full" loading={busy} disabled={!ready} onClick={pay}>Pay {formatMoney(payment.amount, payment.currency)}</Button>
    </div>
  );
}
