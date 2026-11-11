import { useState } from 'react';
import { Link } from 'react-router-dom';
import { sendPasswordResetEmail } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { Button, Input, Alert } from '@/components/ui';
import { AuthLayout } from './AuthLayout';

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  return (
    <AuthLayout title="Reset your password" subtitle="We'll email you a link to choose a new password." footer={<Link to="/login" className="font-medium text-brand-700">Back to sign in</Link>}>
      {sent ? (
        <Alert tone="success" title="Check your email">
          If an account uses {email}, a reset link is on its way.
        </Alert>
      ) : (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            // Always show the same message so the form can't be used to discover accounts.
            await sendPasswordResetEmail(auth, email.trim()).catch(() => null);
            setBusy(false);
            setSent(true);
          }}
        >
          <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Button type="submit" className="w-full" loading={busy}>
            Send reset link
          </Button>
        </form>
      )}
    </AuthLayout>
  );
}
