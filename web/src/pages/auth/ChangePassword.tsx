import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EmailAuthProvider, reauthenticateWithCredential, updatePassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { call, errorMessage } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { Button, Input, Alert } from '@/components/ui';
import { AuthLayout } from './AuthLayout';

/** Shown when an administrator requires a password change, and from the profile page. */
export default function ChangePassword() {
  const navigate = useNavigate();
  const { mustChangePassword, refresh } = useSession();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [confirm, setConfirm] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <AuthLayout title="Choose a new password" subtitle={mustChangePassword ? 'Your administrator asked you to set a new password before continuing.' : 'Update the password you use to sign in.'}>
      <form
        className="space-y-4"
        onSubmit={async (e) => {
          e.preventDefault();
          setError(null);
          if (next.length < 8) return setError('Use at least 8 characters.');
          if (next !== confirm) return setError('The new passwords do not match.');
          const user = auth.currentUser;
          if (!user?.email) return setError('This account signs in without a password.');
          setBusy(true);
          try {
            await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, current));
            await updatePassword(user, next);
            // Changing the password signs other sessions out; refresh our token, then clear the flag.
            await user.getIdToken(true);
            await call('confirmPasswordChanged', {});
            await refresh();
            navigate('/', { replace: true });
          } catch (err) {
            setError(errorMessage(err));
          } finally {
            setBusy(false);
          }
        }}
      >
        <Input label="Current password" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        <Input label="New password" type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
        <Input label="Confirm new password" type="password" autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" className="w-full" loading={busy}>
          Update password
        </Button>
      </form>
    </AuthLayout>
  );
}
