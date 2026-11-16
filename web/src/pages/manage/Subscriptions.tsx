import { Check, ExternalLink, Minus, Plus, Trophy, Users } from 'lucide-react';
import { useState, type ReactNode } from 'react';
import { Alert, Badge, Card, KeyValue, PageHeader, type BadgeTone } from '@/components/ui';
import { fmtTs } from '@/lib/format';
import { useCompany } from './context';

/** Square hosted payment links for the CourtSync platform plans. */
export const SQUARE_PLANS = [
  {
    id: 'racket' as const,
    name: 'Racket court subscription',
    description: 'CourtSync plan for facilities with racket sport courts.',
    url: 'https://square.link/u/W8CP92T2?src=embed',
    icon: <Trophy className="h-5 w-5" />,
  },
  {
    id: 'team' as const,
    name: 'Team sports subscription',
    description: 'CourtSync plan for facilities with team sport courts and pitches.',
    url: 'https://square.link/u/MEXMNGN0?src=embed',
    icon: <Users className="h-5 w-5" />,
  },
] as const;

const MAX_QTY = 50;

type PlanStatus = 'trial' | 'active' | 'pastDue' | 'cancelled';
const STATUS: Record<PlanStatus, { label: string; tone: BadgeTone }> = {
  trial: { label: 'Trial', tone: 'brand' },
  active: { label: 'Active', tone: 'green' },
  pastDue: { label: 'Payment overdue', tone: 'amber' },
  cancelled: { label: 'Cancelled', tone: 'red' },
};

/**
 * Opens Square checkout in a centred popup, the same way Square's embed snippet does.
 * Falls back to a normal new tab when popups are blocked.
 */
export function openSquareCheckout(url: string) {
  const top = window.top ?? window;
  const width = top.innerWidth || document.documentElement.clientWidth || screen.width;
  const height = top.innerHeight || document.documentElement.clientHeight || screen.height;
  const zoom = width / (top.screen.availWidth || width);
  const w = 500;
  const h = height * 0.75;
  const left = (width - w) / 2 / zoom + (top.screenLeft ?? top.screenX);
  const t = (height - h) / 2 / zoom + (top.screenTop ?? top.screenY);
  const win = window.open(url, 'SquareCheckout', `scrollbars=yes,width=${w / zoom},height=${h / zoom},top=${t},left=${left}`);
  if (win) {
    win.opener = null;
    win.focus();
    return true;
  }
  return false;
}

export default function Subscriptions() {
  const { company } = useCompany();
  const sub = company.subscription;
  const status = sub?.status ? STATUS[sub.status as PlanStatus] : undefined;
  const lic = { racket: sub?.licences?.racket ?? 0, team: sub?.licences?.team ?? 0 };
  const totalLic = lic.racket + lic.team;
  const courts = company.stats?.courts ?? 0;
  return (
    <>
      <PageHeader title="Subscriptions" description="Your CourtSync plan and how to pay for it." />

      <Card className="mb-5">
        <h2 className="mb-3 text-base font-semibold text-slate-900">Current plan</h2>
        <KeyValue items={[
          { label: 'Plan', value: sub?.plan ? <span className="capitalize">{sub.plan}</span> : 'None' },
          { label: 'Status', value: status ? <Badge tone={status.tone}>{status.label}</Badge> : 'Not set' },
          ...(sub?.renewsAt ? [{ label: 'Renews', value: fmtTs(sub.renewsAt, false) }] : []),
          { label: 'Racket court licences', value: lic.racket },
          { label: 'Team sports licences', value: lic.team },
          { label: 'Courts set up', value: courts },
        ]} />
        {courts > totalLic && (
          <div className="mt-4">
            <Alert tone="warning">
              You have {courts} {courts === 1 ? 'court' : 'courts'} and {totalLic} {totalLic === 1 ? 'licence' : 'licences'}. Each court needs its own licence, so buy {courts - totalLic} more below.
            </Alert>
          </div>
        )}
      </Card>

      <div className="grid gap-4 sm:grid-cols-2">
        {SQUARE_PLANS.map((p) => <PlanCard key={p.id} name={p.name} description={p.description} url={p.url} icon={p.icon} owned={lic[p.id]} />)}
      </div>

      <div className="mt-5">
        <Alert tone="info">
          Payment is taken securely by Square. Your plan status and licence counts above are updated by CourtSync after your payments are confirmed.
        </Alert>
      </div>
    </>
  );
}

function PlanCard({ name, description, url, icon, owned }: { name: string; description: string; url: string; icon: ReactNode; owned: number }) {
  const [qty, setQty] = useState(1);
  const [opened, setOpened] = useState(0);
  const done = opened >= qty;
  const setQuantity = (n: number) => { setQty(Math.min(MAX_QTY, Math.max(1, n))); setOpened(0); };
  const label = done ? 'Pay for another' : qty > 1 ? `Pay for licence ${opened + 1} of ${qty}` : 'Pay now';
  return (
    <Card className="flex flex-col">
      <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">{icon}</div>
      <h3 className="text-base font-semibold text-slate-900">Buy {name.toLowerCase()}</h3>
      <p className="mt-1 flex-1 text-sm text-slate-500">{description} One licence covers one court.</p>
      <p className="mt-3 text-sm font-medium text-slate-700">You have {owned} {owned === 1 ? 'licence' : 'licences'}</p>

      <div className="mt-4 flex items-center justify-between gap-3">
        <span className="text-sm text-slate-700" id={`qty-${name}`}>Licences to buy</span>
        <div className="inline-flex items-center rounded-lg border border-slate-300" role="group" aria-labelledby={`qty-${name}`}>
          <button type="button" className="flex h-10 w-10 items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40" aria-label="Fewer licences" disabled={qty <= 1} onClick={() => setQuantity(qty - 1)}><Minus className="h-4 w-4" /></button>
          <span className="w-10 text-center text-base font-semibold tabular-nums text-slate-900" aria-live="polite">{qty}</span>
          <button type="button" className="flex h-10 w-10 items-center justify-center text-slate-600 hover:bg-slate-50 disabled:opacity-40" aria-label="More licences" disabled={qty >= MAX_QTY} onClick={() => setQuantity(qty + 1)}><Plus className="h-4 w-4" /></button>
        </div>
      </div>
      {qty > 1 && <p className="mt-2 text-xs text-slate-500">Square takes one licence per checkout. Complete each checkout, then come back here for the next one.</p>}

      <a
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        onClick={(e) => {
          if (openSquareCheckout(url)) e.preventDefault();
          setOpened(done ? 1 : opened + 1);
          if (done) setQty(1);
        }}
        className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-lg bg-[#006aff] text-base font-medium text-white shadow-sm transition-colors hover:bg-[#0055cc] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#006aff] focus-visible:ring-offset-2"
      >
        {label} <ExternalLink className="h-4 w-4" />
      </a>
      {opened > 0 && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-slate-600" role="status">
          <Check className="h-4 w-4 text-court-600" />
          {done ? `All ${qty} ${qty === 1 ? 'checkout' : 'checkouts'} opened.` : `${opened} of ${qty} checkouts opened.`}
        </p>
      )}
    </Card>
  );
}
