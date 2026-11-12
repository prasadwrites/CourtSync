import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { signInWithEmailAndPassword } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { errorMessage } from '@/lib/api';
import { useSession } from '@/lib/auth';
import { Button, Input, Alert, Tabs } from '@/components/ui';
import { AuthLayout } from './AuthLayout';
import { GoogleButton, PhoneSignIn } from './SocialAndPhone';

export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const next = (location.state as { from?: string } | null)?.from ?? '/';
  const [mode, setMode] = useState<'email' | 'phone'>('email');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = () => navigate(next, { replace: true });
  const { user, loading } = useSession();

  // Already signed in (or the sign-in call never reported back, as with some popup setups): move on.
  if (!loading && user) return <Navigate to={next} replace />;

  return (
    <AuthLayout
      title="Sign in to CourtSync"
      subtitle="One account for every facility you play at."
      footer={
        <>
          New to CourtSync?{' '}
          <Link to="/register" state={location.state} className="font-medium text-brand-700">
            Create an account
          </Link>
        </>
      }
    >
      <Tabs value={mode} onChange={setMode} tabs={[{ value: 'email', label: 'Email' }, { value: 'phone', label: 'Phone' }]} />
      {mode === 'email' ? (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            setBusy(true);
            setError(null);
            try {
              await signInWithEmailAndPassword(auth, email.trim(), password);
              done();
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Password" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
          <div className="flex justify-end">
            <Link to="/forgot-password" className="text-sm text-brand-700">
              Forgot password?
            </Link>
          </div>
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="w-full" loading={busy}>
            Sign in
          </Button>
        </form>
      ) : (
        <PhoneSignIn onDone={done} />
      )}
      <div className="my-5 flex items-center gap-3 text-xs text-slate-400">
        <span className="h-px flex-1 bg-slate-200" /> or <span className="h-px flex-1 bg-slate-200" />
      </div>
      <GoogleButton onDone={done} />
    </AuthLayout>
  );
}
