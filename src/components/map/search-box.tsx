'use client';

import { useQuery } from '@tanstack/react-query';
import { Home, Loader2, MapPinned, Search, User, X, type LucideIcon } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';

import { useDebounced } from '@/lib/use-debounced';
import { cn } from '@/lib/utils';

export interface ResidentResult {
  id_no: string;
  full_name: string;
  dob: string | null;
  gender: string | null;
  permanent_address: string | null;
  island: string | null;
  atoll: string | null;
}

export interface IslandResult {
  island_name: string;
  atoll: string;
  lon: number;
  lat: number;
}

export interface AddressResult {
  hname: string;
  island: string;
  atoll: string;
  lon: number;
  lat: number;
}

interface SearchResponse {
  residents: ResidentResult[];
  islands: IslandResult[];
  addresses: AddressResult[];
}

/** Visual identity for each result kind, so a row is recognisable at a glance. */
type ResultKind = 'person' | 'island' | 'address';
const KIND_META: Record<ResultKind, { label: string; icon: LucideIcon; className: string }> = {
  person: { label: 'Person', icon: User, className: 'text-violet-500' },
  island: { label: 'Island', icon: MapPinned, className: 'text-primary' },
  address: { label: 'Address', icon: Home, className: 'text-emerald-500' },
};

async function runSearch(q: string): Promise<SearchResponse> {
  const enc = encodeURIComponent(q);
  const [residentsRes, islandsRes, addressesRes] = await Promise.all([
    fetch(`/api/search-residents?action=search&q=${enc}`).then((r) => r.json()),
    fetch(`/api/search-islands?q=${enc}`).then((r) => r.json()),
    fetch(`/api/search-addresses?q=${enc}`).then((r) => r.json()),
  ]);
  return {
    residents: residentsRes.results ?? [],
    islands: islandsRes.results ?? [],
    addresses: addressesRes.results ?? [],
  };
}

interface SearchBoxProps {
  onPickIsland: (island: IslandResult) => void;
  onPickResident: (resident: ResidentResult) => void;
  onPickAddress: (address: AddressResult) => void;
  className?: string;
  autoFocus?: boolean;
}

export function SearchBox({
  onPickIsland,
  onPickResident,
  onPickAddress,
  className,
  autoFocus,
}: SearchBoxProps) {
  const [term, setTerm] = useState('');
  const [focused, setFocused] = useState(false);
  const debounced = useDebounced(term.trim(), 250);
  const boxRef = useRef<HTMLDivElement>(null);

  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => runSearch(debounced),
    enabled: debounced.length >= 2,
  });

  useEffect(() => {
    const onDocClick = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setFocused(false);
    };
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const hasResults = useMemo(
    () =>
      (data?.residents.length ?? 0) + (data?.islands.length ?? 0) + (data?.addresses.length ?? 0) >
      0,
    [data],
  );
  const showDropdown = focused && debounced.length >= 2;

  return (
    <div ref={boxRef} className={cn('relative w-full', className)}>
      <div className="glass flex h-10 items-center gap-2 rounded-full px-4 shadow-sm">
        <Search className="size-4 shrink-0 text-muted-foreground" />
        <input
          autoFocus={autoFocus}
          value={term}
          onChange={(e) => setTerm(e.target.value)}
          onFocus={() => setFocused(true)}
          placeholder="Search residents, islands, or addresses…"
          className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          autoComplete="off"
        />
        {isFetching && <Loader2 className="size-4 animate-spin text-muted-foreground" />}
        {term && !isFetching && (
          <button onClick={() => setTerm('')} aria-label="Clear" className="text-muted-foreground">
            <X className="size-4" />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="glass absolute left-0 right-0 top-12 z-40 max-h-[60vh] overflow-y-auto rounded-2xl p-1.5 shadow-xl">
          {!hasResults && !isFetching && (
            <p className="px-3 py-6 text-center text-sm text-muted-foreground">No matches found</p>
          )}

          {data?.islands.length ? (
            <Section title="Islands">
              {data.islands.map((island) => (
                <ResultRow
                  key={`is-${island.island_name}-${island.atoll}`}
                  kind="island"
                  primary={island.island_name}
                  secondary={island.atoll ? `Atoll ${island.atoll}` : undefined}
                  onClick={() => {
                    onPickIsland(island);
                    setFocused(false);
                  }}
                />
              ))}
            </Section>
          ) : null}

          {data?.addresses.length ? (
            <Section title="Addresses">
              {data.addresses.map((a, i) => (
                <ResultRow
                  key={`ad-${a.hname}-${a.island}-${i}`}
                  kind="address"
                  primary={a.hname}
                  secondary={[a.island, a.atoll].filter(Boolean).join(', ')}
                  onClick={() => {
                    onPickAddress(a);
                    setFocused(false);
                  }}
                />
              ))}
            </Section>
          ) : null}

          {data?.residents.length ? (
            <Section title="Residents">
              {data.residents.map((r) => (
                <ResultRow
                  key={`re-${r.id_no}`}
                  kind="person"
                  primary={r.full_name}
                  secondary={[r.permanent_address, r.island].filter(Boolean).join(', ')}
                  trailing={r.id_no}
                  onClick={() => {
                    onPickResident(r);
                    setFocused(false);
                  }}
                />
              ))}
            </Section>
          ) : null}
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <p className="px-3 pb-1 pt-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      {children}
    </div>
  );
}

interface ResultRowProps {
  kind: ResultKind;
  primary: string;
  secondary?: string;
  trailing?: string;
  onClick: () => void;
}

function ResultRow({ kind, primary, secondary, trailing, onClick }: ResultRowProps) {
  const meta = KIND_META[kind];
  const Icon = meta.icon;
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition hover:bg-accent/70"
    >
      <span
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-lg bg-accent/60',
          meta.className,
        )}
      >
        <Icon className="size-4" />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium">{primary}</span>
        {secondary && (
          <span className="block truncate text-xs text-muted-foreground">{secondary}</span>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        <span
          className={cn(
            'rounded-full bg-accent/70 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide',
            meta.className,
          )}
        >
          {meta.label}
        </span>
        {trailing && <span className="font-mono text-[10px] text-muted-foreground">{trailing}</span>}
      </span>
    </button>
  );
}
