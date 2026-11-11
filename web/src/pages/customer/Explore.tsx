import { useState } from 'react';
import { Link } from 'react-router-dom';
import { collection, limit, orderBy, query, where, type QueryConstraint } from 'firebase/firestore';
import { MapPin } from 'lucide-react';
import type { Company } from '@courtsync/shared';
import { db } from '@/lib/firebase';
import { useDebounced, useQuery } from '@/lib/hooks';
import { useCountries, useSports } from '@/lib/master';
import { useSession } from '@/lib/auth';
import { Avatar, Badge, EmptyState, ErrorState, SearchInput, Select, Spinner } from '@/components/ui';

export default function Explore() {
  const { profile } = useSession();
  const countries = useCountries();
  const sports = useSports();
  const [search, setSearch] = useState('');
  const [country, setCountry] = useState(profile?.countryCode ?? '');
  const [sport, setSport] = useState('');
  const term = useDebounced(search.trim().toLowerCase().normalize('NFKD').replace(/[^a-z0-9 ]/g, ' ').split(/\s+/).filter((w) => w.length >= 2)[0]?.slice(0, 12) ?? '', 300);

  // Firestore allows one array filter per query, so the most selective filter runs on the server and the rest here.
  const c: QueryConstraint[] = [where('status', '==', 'active')];
  if (term) c.push(where('searchTokens', 'array-contains', term));
  else {
    if (country) c.push(where('countryCode', '==', country));
    if (sport) c.push(where('sportIds', 'array-contains', sport));
  }
  c.push(orderBy('name'), limit(60));
  const list = useQuery<Company>(query(collection(db, 'companies'), ...c), `explore-${term}-${term ? '' : country}-${term ? '' : sport}`);
  const words = search.trim().toLowerCase().split(/\s+/).filter(Boolean);
  const rows = list.data.filter((x) => (!term || ((!country || x.countryCode === country) && (!sport || x.sportIds.includes(sport)))) && words.every((w) => `${x.name} ${x.city ?? ''}`.toLowerCase().includes(w)));
  const sportName = (id: string) => sports.data.find((s) => s.id === id)?.name ?? '';

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-semibold">Explore venues</h1>
      <div className="grid gap-2 sm:grid-cols-[1fr_12rem_12rem]">
        <SearchInput value={search} onChange={setSearch} placeholder="Venue name or city" />
        <Select aria-label="Country" value={country} onChange={(e) => setCountry(e.target.value)} placeholder="Any country" options={countries.data.filter((x) => x.enabled).map((x) => ({ value: x.code, label: x.name }))} />
        <Select aria-label="Sport" value={sport} onChange={(e) => setSport(e.target.value)} placeholder="Any sport" options={sports.data.filter((s) => s.enabled).map((s) => ({ value: s.id, label: s.name }))} />
      </div>
      {list.loading ? <Spinner /> : list.error ? <ErrorState error={list.error} /> : rows.length === 0 ? (
        <EmptyState title="No venues found" description="Try another sport, city or country." />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map((x) => (
            <Link key={x.id} to={`/c/${x.id}`} className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-card hover:border-brand-300">
              {x.photoUrls?.[0] ? <img src={x.photoUrls[0]} alt="" className="aspect-[16/9] w-full object-cover" /> : <div className="aspect-[16/9] w-full bg-gradient-to-br from-brand-100 to-court-100" />}
              <div className="flex gap-3 p-3">
                <Avatar name={x.name} src={x.logoUrl} />
                <div className="min-w-0">
                  <p className="truncate font-medium">{x.name}</p>
                  <p className="flex items-center gap-1 text-sm text-slate-500"><MapPin className="h-3.5 w-3.5" />{[x.city, x.countryCode].filter(Boolean).join(', ')}</p>
                  <div className="mt-1 flex flex-wrap gap-1">{x.sportIds.slice(0, 4).map((s) => <Badge key={s}>{sportName(s)}</Badge>)}</div>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
