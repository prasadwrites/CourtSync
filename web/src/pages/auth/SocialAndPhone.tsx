import { useEffect, useRef, useState } from 'react';
import { GoogleAuthProvider, RecaptchaVerifier, signInWithPhoneNumber, signInWithPopup, type ConfirmationResult } from 'firebase/auth';
import { Phone } from 'lucide-react';
import { auth } from '@/lib/firebase';
import { errorMessage } from '@/lib/api';
import { Button, Input, Alert } from '@/components/ui';

export function GoogleButton({ onDone }: { onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <>
      <Button
        variant="secondary"
        className="w-full"
        loading={busy}
        onClick={async () => {
          setBusy(true);
          setError(null);
          try {
            await signInWithPopup(auth, new GoogleAuthProvider());
            onDone();
          } catch (e) {
            setError(errorMessage(e));
          } finally {
            setBusy(false);
          }
        }}
        icon={
          <svg className="h-4 w-4" viewBox="0 0 24 24" aria-hidden>
            <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
            <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
            <path fill="#FBBC05" d="M5.84 14.09A6.6 6.6 0 0 1 5.5 12c0-.73.13-1.43.34-2.09V7.07H2.18A11 11 0 0 0 1 12c0 1.78.43 3.45 1.18 4.93l3.66-2.84z" />
            <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1A11 11 0 0 0 2.18 7.07l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
          </svg>
        }
      >
        Continue with Google
      </Button>
      {error && <p className="mt-2 text-xs text-red-600">{error}</p>}
    </>
  );
}

/** Phone number sign-in with an SMS one-time code. */
export function PhoneSignIn({ onDone }: { onDone: () => void }) {
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [confirm, setConfirm] = useState<ConfirmationResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const verifier = useRef<RecaptchaVerifier | null>(null);

  useEffect(() => () => verifier.current?.clear(), []);

  const send = async () => {
    setBusy(true);
    setError(null);
    try {
      verifier.current ??= new RecaptchaVerifier(auth, 'recaptcha-container', { size: 'invisible' });
      setConfirm(await signInWithPhoneNumber(auth, phone.trim(), verifier.current));
    } catch (e) {
      setError(errorMessage(e));
      verifier.current?.clear();
      verifier.current = null;
    } finally {
      setBusy(false);
    }
  };

  const verify = async () => {
    if (!confirm) return;
    setBusy(true);
    setError(null);
    try {
      await confirm.confirm(code.trim());
      onDone();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-3">
      {!confirm ? (
        <>
          <Input label="Mobile number" type="tel" inputMode="tel" autoComplete="tel" placeholder="+919876543210" value={phone} onChange={(e) => setPhone(e.target.value)} hint="Include your country code. We'll text you a code." />
          <Button className="w-full" variant="secondary" loading={busy} onClick={send} disabled={phone.trim().length < 8} icon={<Phone className="h-4 w-4" />}>
            Send code
          </Button>
        </>
      ) : (
        <>
          <Input label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} />
          <Button className="w-full" loading={busy} onClick={verify} disabled={code.length !== 6}>
            Verify and continue
          </Button>
          <button className="text-xs text-slate-500 underline" onClick={() => setConfirm(null)}>
            Use a different number
          </button>
        </>
      )}
      {error && <Alert tone="error">{error}</Alert>}
      <div id="recaptcha-container" />
    </div>
  );
}
