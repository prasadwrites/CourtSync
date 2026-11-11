import { CalendarCheck, CreditCard, QrCode, ShieldCheck, Smartphone, Users } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { LinkButton } from '@/components/ui';

const FEATURES = [
  { icon: CalendarCheck, title: 'Live court calendars', body: 'Players see real availability and book in seconds. Double bookings are prevented on the server.' },
  { icon: CreditCard, title: 'Payments that fit your country', body: 'UPI, cards and wallets through trusted gateways, or pay at the desk. Refunds and credits included.' },
  { icon: QrCode, title: 'QR check-in', body: 'Every booking gets a pass and a 6-digit code. Staff check players in and out from any phone.' },
  { icon: Users, title: 'Members and memberships', body: 'Monthly classes, coaching and gym plans with attendance, renewals and payment tracking.' },
  { icon: ShieldCheck, title: 'Privacy by design', body: 'ID numbers are encrypted and masked. Every sensitive action is recorded in an audit log.' },
  { icon: Smartphone, title: 'Works like an app', body: 'Install CourtSync on your phone from the browser. No app store needed.' },
];

export default function Landing() {
  return (
    <div className="min-h-screen bg-white">
      <header className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
        <Logo />
        <div className="flex gap-2">
          <LinkButton variant="ghost" to="/login">Sign in</LinkButton>
          <LinkButton to="/register">Create account</LinkButton>
        </div>
      </header>
      <section className="mx-auto max-w-6xl px-4 pb-16 pt-10 sm:pt-20">
        <div className="max-w-2xl">
          <h1 className="text-4xl font-semibold tracking-tight text-slate-900 sm:text-5xl">Book courts. Run your venue.</h1>
          <p className="mt-4 text-lg text-slate-600">CourtSync connects players with sports facilities. One account books badminton, tennis, swimming, cricket nets and more at every venue that uses it.</p>
          <div className="mt-6 flex flex-wrap gap-3">
            <LinkButton size="lg" to="/register">Start booking</LinkButton>
            <LinkButton size="lg" variant="secondary" to="/login">I manage a venue</LinkButton>
          </div>
        </div>
      </section>
      <section className="border-t border-slate-100 bg-slate-50">
        <div className="mx-auto grid max-w-6xl gap-6 px-4 py-14 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="rounded-xl border border-slate-200 bg-white p-5 shadow-card">
              <f.icon className="h-6 w-6 text-brand-700" />
              <h2 className="mt-3 font-semibold">{f.title}</h2>
              <p className="mt-1 text-sm text-slate-600">{f.body}</p>
            </div>
          ))}
        </div>
      </section>
      <footer className="mx-auto max-w-6xl px-4 py-8 text-sm text-slate-500">© {new Date().getFullYear()} CourtSync</footer>
    </div>
  );
}
