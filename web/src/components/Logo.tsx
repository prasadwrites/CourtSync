import { Link } from 'react-router-dom';

export function Logo({ to = '/', compact = false }: { to?: string; compact?: boolean }) {
  return (
    <Link to={to} className="inline-flex items-center gap-2 font-semibold text-slate-900">
      <img src="/icon.svg" alt="" className="h-8 w-8" />
      {!compact && <span className="text-lg tracking-tight">CourtSync</span>}
    </Link>
  );
}
