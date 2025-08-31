'use client';

import { LoginForm } from '@/components/auth/LoginForm';
import { Logo } from '@/components/icons/Logo';
import { useStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';

export default function Home() {
  const { user } = useStore();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      if (user.role === 'admin') {
        router.replace('/admin/dashboard');
      } else {
        router.replace('/user/dashboard');
      }
    }
  }, [user, router]);

  return (
    <main className="flex min-h-screen flex-col items-center justify-center p-8">
      <div className="flex flex-col items-center gap-4">
        <Logo className="h-12 w-12" />
        <h1 className="text-3xl font-bold tracking-tight">CourtSync</h1>
        <p className="text-muted-foreground">Welcome back! Please sign in to your account.</p>
      </div>
      <div className="mt-8 w-full max-w-sm">
        <LoginForm />
      </div>
    </main>
  );
}
