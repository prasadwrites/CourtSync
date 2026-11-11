import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { createUserWithEmailAndPassword, sendEmailVerification, updateProfile } from 'firebase/auth';
import { auth } from '@/lib/firebase';
import { call, errorMessage } from '@/lib/api';
import { Button, Input, Alert, Tabs, Checkbox } from '@/components/ui';
import { AuthLayout } from './AuthLayout';
import { GoogleButton, PhoneSignIn } from './SocialAndPhone';

export default function Register() {
  const navigate = useNavigate();
  const location = useLocation();
  const next = (location.state as { from?: string } | null)?.from ?? '/home';
  const [mode, setMode] = useState<'email' | 'phone'>('email');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [agree, setAgree] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = () => navigate(next, { replace: true });

  return (
    <AuthLayout title="Create your CourtSync account" subtitle="Book courts, join memberships and keep your credits in one place." footer={<>Already have an account? <Link to="/login" state={location.state} className="font-medium text-brand-700">Sign in</Link></>}>
      <Tabs value={mode} onChange={setMode} tabs={[{ value: 'email', label: 'Email' }, { value: 'phone', label: 'Phone' }]} />
      {mode === 'email' ? (
        <form
          className="space-y-4"
          onSubmit={async (e) => {
            e.preventDefault();
            if (password.length < 8) return setError('Use at least 8 characters for your password.');
            setBusy(true);
            setError(null);
            try {
              const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
              await updateProfile(cred.user, { displayName: name.trim() });
              await call('ensureProfile', { displayName: name.trim() });
              sendEmailVerification(cred.user).catch(() => null);
              done();
            } catch (err) {
              setError(errorMessage(err));
            } finally {
              setBusy(false);
            }
          }}
        >
          <Input label="Full name" autoComplete="name" required value={name} onChange={(e) => setName(e.target.value)} />
          <Input label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
          <Input label="Password" type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} hint="At least 8 characters." />
          <Checkbox checked={agree} onChange={setAgree} label="I agree to the terms of service and privacy policy." />
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" className="w-full" loading={busy} disabled={!agree}>
            Create account
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
