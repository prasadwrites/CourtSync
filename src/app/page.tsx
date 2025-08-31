
'use client';

import { LoginForm } from '@/components/auth/LoginForm';
import { Logo } from '@/components/icons/Logo';
import { useStore } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import Image from 'next/image';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarCheck, Users, BarChart3 } from 'lucide-react';
import { Button } from '@/components/ui/button';

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

  const features = [
    {
      icon: <CalendarCheck className="h-8 w-8 text-primary" />,
      title: 'Effortless Booking',
      description: 'Streamline your court reservations with our intuitive booking system. Less admin, more playtime.',
    },
    {
      icon: <Users className="h-8 w-8 text-primary" />,
      title: 'User Management',
      description: 'Easily manage members, roles, and access permissions for your entire organization.',
    },
    {
      icon: <BarChart3 className="h-8 w-8 text-primary" />,
      title: 'Actionable Insights',
      description: 'Gain valuable insights into court usage and peak hours to optimize your operations.',
    },
  ];
  
  if (user) {
    return null; // or a loading spinner
  }

  return (
    <div className="flex flex-col min-h-screen bg-background">
      <header className="px-4 lg:px-6 h-14 flex items-center">
        <a className="flex items-center justify-center" href="#">
          <Logo className="h-6 w-6" />
          <span className="ml-2 text-lg font-semibold">CourtSync</span>
        </a>
      </header>
      <main className="flex-1">
        <section className="relative w-full pt-12 md:pt-24 lg:pt-32 hero-gradient">
          <div className="container px-4 md:px-6 space-y-10 xl:space-y-16">
            <div className="grid max-w-[1300px] mx-auto gap-4 px-4 sm:px-6 md:px-10 md:grid-cols-2 md:gap-16">
              <div className="flex flex-col justify-center space-y-4">
                <h1 className="lg:leading-tighter text-3xl font-bold tracking-tighter sm:text-4xl md:text-5xl xl:text-[3.4rem] 2xl:text-[3.75rem]">
                  The Ultimate Court Management Platform
                </h1>
                <p className="mx-auto max-w-[700px] text-muted-foreground md:text-xl">
                  CourtSync simplifies court booking, user management, and scheduling for clubs of all sizes.
                </p>
                <div className="space-x-4">
                  <Button size="lg">Get Started</Button>
                </div>
              </div>
              <div className="w-full max-w-md">
                <Card>
                  <CardHeader className="text-center">
                    <CardTitle className="text-2xl">Welcome Back</CardTitle>
                    <CardDescription>Sign in to your account to continue.</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <LoginForm />
                  </CardContent>
                </Card>
              </div>
            </div>
          </div>
        </section>

        <section id="features" className="w-full py-12 md:py-24 lg:py-32">
          <div className="container px-4 md:px-6">
            <div className="flex flex-col items-center justify-center space-y-4 text-center">
              <div className="space-y-2">
                <div className="inline-block rounded-lg bg-secondary px-3 py-1 text-sm">Key Features</div>
                <h2 className="text-3xl font-bold tracking-tighter sm:text-5xl">Everything You Need to Succeed</h2>
                <p className="max-w-[900px] text-muted-foreground md:text-xl/relaxed lg:text-base/relaxed xl:text-xl/relaxed">
                  Focus on the game, not the paperwork. Our platform is packed with features to make your life easier.
                </p>
              </div>
            </div>
            <div className="mx-auto grid max-w-5xl items-start gap-8 sm:grid-cols-2 md:gap-12 lg:max-w-none lg:grid-cols-3 pt-12">
              {features.map((feature, index) => (
                <div key={index} className="flex flex-col items-center text-center gap-2 p-4">
                  <div className="bg-primary/10 p-3 rounded-full">
                     {feature.icon}
                  </div>
                  <h3 className="text-lg font-bold">{feature.title}</h3>
                  <p className="text-sm text-muted-foreground">{feature.description}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
      <footer className="flex flex-col gap-2 sm:flex-row py-6 w-full shrink-0 items-center px-4 md:px-6 border-t">
        <p className="text-xs text-muted-foreground">&copy; 2024 CourtSync. All rights reserved.</p>
        <nav className="sm:ml-auto flex gap-4 sm:gap-6">
          <a className="text-xs hover:underline underline-offset-4" href="#">
            Terms of Service
          </a>
          <a className="text-xs hover:underline underline-offset-4" href="#">
            Privacy
          </a>
        </nav>
      </footer>
    </div>
  );
}
