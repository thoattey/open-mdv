'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';

import {
  AddressFilterPanel,
  IslandDatalist,
  ResidentFilterPanel,
} from '@/components/grid/filter-panel';
import { MatrixRain } from '@/components/grid/matrix-rain';
import { AddressTable, ResidentTable } from '@/components/grid/results';
import { ageFromDob } from '@/lib/dob';
import {
  activeFilterCount,
  addressParams,
  EMPTY_ADDRESS_FILTERS,
  EMPTY_RESIDENT_FILTERS,
  PAGE_SIZE,
  residentParams,
  toCsv,
  type AddressFilters,
  type AddressRow,
  type Facets,
  type GridResponse,
  type ResidentFilters,
  type ResidentRow,
} from '@/lib/grid';
import { useDebounced } from '@/lib/use-debounced';

/**
 * /grid — a terminal-styled console over the two registers the atlas holds.
 *
 * The map answers "what is here"; this page answers "which records match", with
 * every filter the schema can support. Both modes share one shell: a filter rail
 * on the left, a sortable table on the right, and a status readout that reports
 * the match count and server timing of the last query.
 */

type Mode = 'residents' | 'addresses';

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  return res.json() as Promise<T>;
}

export default function GridPage() {
  const [mode, setMode] = useState<Mode>('residents');
  const [residents, setResidents] = useState<ResidentFilters>(EMPTY_RESIDENT_FILTERS);
  const [addresses, setAddresses] = useState<AddressFilters>(EMPTY_ADDRESS_FILTERS);
  const [offset, setOffset] = useState(0);
  const [railOpen, setRailOpen] = useState(false);

  // Any change to a filter invalidates the current page, so the two move together.
  const patchResidents = useCallback((partial: Partial<ResidentFilters>) => {
    setResidents((prev) => ({ ...prev, ...partial }));
    setOffset(0);
  }, []);
  const patchAddresses = useCallback((partial: Partial<AddressFilters>) => {
    setAddresses((prev) => ({ ...prev, ...partial }));
    setOffset(0);
  }, []);

  const debouncedResidents = useDebounced(residents, 250);
  const debouncedAddresses = useDebounced(addresses, 250);

  const { data: facets } = useQuery({
    queryKey: ['grid-facets'],
    queryFn: () => fetchJson<Facets>('/api/grid/facets'),
    staleTime: Infinity,
  });

  const search =
    mode === 'residents'
      ? residentParams(debouncedResidents, offset).toString()
      : addressParams(debouncedAddresses, offset).toString();

  const { data, isFetching, isError } = useQuery({
    queryKey: ['grid', mode, search],
    queryFn: () => fetchJson<GridResponse<ResidentRow | AddressRow>>(`/api/grid/${mode}?${search}`),
    // Holding the previous page keeps the table from collapsing to an empty
    // frame on every keystroke — but only within one mode. Resident rows handed
    // to the address table would render columns that do not exist there.
    placeholderData: (previous, previousQuery) =>
      previousQuery?.queryKey[1] === mode ? previous : undefined,
  });

  const rows = useMemo(() => data?.results ?? [], [data]);
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const page = Math.floor(offset / PAGE_SIZE) + 1;
  const activeCount = activeFilterCount(mode === 'residents' ? residents : addresses);
  const failed = isError || Boolean(data?.error);

  const exportCsv = useCallback(() => {
    const flat =
      mode === 'residents'
        ? (rows as ResidentRow[]).map((r) => ({ ...r, age: ageFromDob(r.dob) ?? '' }))
        : (rows as AddressRow[]);
    const blob = new Blob([toCsv(flat as Record<string, unknown>[])], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `grid-${mode}-p${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [mode, rows, page]);

  const reset = () => {
    if (mode === 'residents') setResidents(EMPTY_RESIDENT_FILTERS);
    else setAddresses(EMPTY_ADDRESS_FILTERS);
    setOffset(0);
  };

  const sortBy = useCallback(
    (key: string) => {
      if (mode === 'residents') {
        const k = key as ResidentFilters['sort'];
        patchResidents({ sort: k, dir: residents.sort === k && residents.dir === 'asc' ? 'desc' : 'asc' });
      } else {
        const k = key as AddressFilters['sort'];
        patchAddresses({ sort: k, dir: addresses.sort === k && addresses.dir === 'asc' ? 'desc' : 'asc' });
      }
    },
    [mode, residents.sort, residents.dir, addresses.sort, addresses.dir, patchResidents, patchAddresses],
  );

  const status = useMemo(() => {
    if (failed) return 'QUERY FAILED — IS THE DATABASE UP?';
    if (isFetching) return 'QUERYING…';
    return `${total.toLocaleString()} RECORD${total === 1 ? '' : 'S'} MATCHED`;
  }, [failed, isFetching, total]);

  return (
    <main className="mx mx-crt relative flex h-dvh w-full flex-col overflow-hidden">
      <MatrixRain className="pointer-events-none absolute inset-0 h-full w-full opacity-25" />

      <IslandDatalist islands={facets?.islands ?? []} />

      {/* ------------------------------------------------------------ head -- */}
      <header className="relative z-30 shrink-0 border-b border-[var(--mx-line)] bg-black/70 px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="mx-glow text-sm font-bold tracking-[0.3em]">
            RAAJJE<span className="text-[var(--mx-accent)]">{'//'}</span>GRID
            <span className="mx-caret ml-1">_</span>
          </h1>

          <div className="flex gap-1">
            {(['residents', 'addresses'] as Mode[]).map((m) => (
              <button
                key={m}
                className="mx-btn"
                data-active={mode === m}
                onClick={() => {
                  setMode(m);
                  setOffset(0);
                }}
              >
                {m}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <button className="mx-btn md:hidden" onClick={() => setRailOpen((v) => !v)}>
              filters{activeCount ? ` (${activeCount})` : ''}
            </button>
            <Link className="mx-btn" href="/admin">
              control
            </Link>
            <Link className="mx-btn" href="/">
              ← map
            </Link>
          </div>
        </div>

        <p className="mt-1 text-[10px] text-[var(--mx-dim)]">
          {status} · PAGE {page}/{pages} · {data?.took ?? 0}MS · FILTERS {activeCount} ·
          REGISTER: SYNTHETIC — NO REAL PERSONAL DATA
        </p>
      </header>

      <div className="relative z-20 flex min-h-0 flex-1">
        {/* ---------------------------------------------------------- rail -- */}
        <aside
          className={`mx-panel absolute inset-y-0 left-0 z-30 w-72 shrink-0 overflow-y-auto transition-transform md:static md:translate-x-0 ${
            railOpen ? 'translate-x-0' : '-translate-x-full'
          }`}
        >
          <div className="flex items-center justify-between px-3 py-2">
            <span className="mx-label">Filter set</span>
            <button className="mx-btn" onClick={reset} disabled={activeCount === 0}>
              reset
            </button>
          </div>

          {mode === 'residents' ? (
            <ResidentFilterPanel filters={residents} patch={patchResidents} facets={facets} />
          ) : (
            <AddressFilterPanel filters={addresses} patch={patchAddresses} facets={facets} />
          )}

          <div className="border-t border-[var(--mx-line)] px-3 py-3 md:hidden">
            <button className="mx-btn w-full justify-center" onClick={() => setRailOpen(false)}>
              apply
            </button>
          </div>
        </aside>

        {/* -------------------------------------------------------- results -- */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="mx-boot min-h-0 flex-1 overflow-auto bg-black/60" key={mode}>
            {mode === 'residents' ? (
              <ResidentTable
                rows={rows as ResidentRow[]}
                sort={residents.sort}
                dir={residents.dir}
                onSort={sortBy}
              />
            ) : (
              <AddressTable
                rows={rows as AddressRow[]}
                sort={addresses.sort}
                dir={addresses.dir}
                onSort={sortBy}
              />
            )}
          </div>

          {/* ------------------------------------------------------- foot -- */}
          <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--mx-line)] bg-black/70 px-3 py-2">
            <button
              className="mx-btn"
              disabled={offset === 0}
              onClick={() => setOffset((o) => Math.max(0, o - PAGE_SIZE))}
            >
              ◄ prev
            </button>
            <button
              className="mx-btn"
              disabled={page >= pages}
              onClick={() => setOffset((o) => o + PAGE_SIZE)}
            >
              next ►
            </button>
            <span className="text-[10px] text-[var(--mx-dim)]">
              rows {total === 0 ? 0 : offset + 1}–{Math.min(offset + rows.length, total)} of{' '}
              {total.toLocaleString()}
            </span>
            <button className="mx-btn ml-auto" disabled={!rows.length} onClick={exportCsv}>
              export page .csv
            </button>
          </footer>
        </section>
      </div>
    </main>
  );
}
