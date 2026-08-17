'use client';

import { useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useCallback, useMemo, useState } from 'react';

import { BusinessDetailPanel } from '@/components/business/detail-panel';
import { BusinessFilterPanel } from '@/components/business/filter-panel';
import { BusinessTable } from '@/components/business/results';
import { MatrixRain } from '@/components/grid/matrix-rain';
import {
  activeBusinessFilterCount,
  businessParams,
  BUSINESS_PAGE_SIZE,
  EMPTY_BUSINESS_FILTERS,
  type BusinessFacets,
  type BusinessFilters,
  type BusinessListResponse,
  type BusinessRow,
} from '@/lib/business';
import { toCsv } from '@/lib/grid';
import { useDebounced } from '@/lib/use-debounced';

/**
 * /business — the Maldives business register.
 *
 * Same shell as /grid: a filter rail on the left, a sortable table in the
 * middle, a status readout reporting the match count and server timing. The
 * third element is a detail panel, because the interesting part of a company
 * record — who the officers are — is a list the table can only count.
 *
 * Rows arrive through the batch importer in /admin; nothing on this page
 * writes.
 */

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  return res.json() as Promise<T>;
}

export default function BusinessPage() {
  const [filters, setFilters] = useState<BusinessFilters>(EMPTY_BUSINESS_FILTERS);
  const [offset, setOffset] = useState(0);
  const [railOpen, setRailOpen] = useState(false);
  const [selected, setSelected] = useState<BusinessRow | null>(null);

  // Any change to a filter invalidates the current page, so the two move together.
  const patch = useCallback((partial: Partial<BusinessFilters>) => {
    setFilters((prev) => ({ ...prev, ...partial }));
    setOffset(0);
  }, []);

  const debounced = useDebounced(filters, 250);
  const search = businessParams(debounced, offset).toString();

  const { data: facets } = useQuery({
    queryKey: ['business-facets'],
    queryFn: () => fetchJson<BusinessFacets>('/api/business/facets'),
    staleTime: Infinity,
  });

  const { data, isFetching, isError } = useQuery({
    queryKey: ['business', search],
    queryFn: () => fetchJson<BusinessListResponse>(`/api/business?${search}`),
    // Holding the previous page keeps the table from collapsing to an empty
    // frame on every keystroke.
    placeholderData: (previous) => previous,
  });

  const rows = useMemo(() => data?.results ?? [], [data]);
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / BUSINESS_PAGE_SIZE));
  const page = Math.floor(offset / BUSINESS_PAGE_SIZE) + 1;
  const activeCount = activeBusinessFilterCount(filters);
  const failed = isError || Boolean(data?.error);

  const exportCsv = useCallback(() => {
    const blob = new Blob([toCsv(rows as unknown as Record<string, unknown>[])], {
      type: 'text/csv;charset=utf-8',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `business-p${page}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [rows, page]);

  const sortBy = useCallback(
    (key: BusinessFilters['sort']) =>
      patch({ sort: key, dir: filters.sort === key && filters.dir === 'asc' ? 'desc' : 'asc' }),
    [filters.sort, filters.dir, patch],
  );

  const status = useMemo(() => {
    if (failed) return 'QUERY FAILED — IS THE DATABASE UP?';
    if (isFetching) return 'QUERYING…';
    // An empty register and an over-tight filter set look identical in the
    // table, so the readout separates them.
    if (total === 0 && facets?.total === 0) return 'REGISTER EMPTY — IMPORT A FILE FROM /ADMIN';
    return `${total.toLocaleString()} ENTIT${total === 1 ? 'Y' : 'IES'} MATCHED`;
  }, [failed, isFetching, total, facets?.total]);

  return (
    <main className="mx mx-crt relative flex h-dvh w-full flex-col overflow-hidden">
      <MatrixRain className="pointer-events-none absolute inset-0 h-full w-full opacity-25" />

      {/* ------------------------------------------------------------ head -- */}
      <header className="relative z-30 shrink-0 border-b border-[var(--mx-line)] bg-black/70 px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="mx-glow text-sm font-bold tracking-[0.3em]">
            RAAJJE<span className="text-[var(--mx-accent)]">{'//'}</span>BUSINESS
            <span className="mx-caret ml-1">_</span>
          </h1>

          <div className="ml-auto flex items-center gap-2">
            <button className="mx-btn md:hidden" onClick={() => setRailOpen((v) => !v)}>
              filters{activeCount ? ` (${activeCount})` : ''}
            </button>
            <Link className="mx-btn" href="/grid">
              grid
            </Link>
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
          REGISTER: {(facets?.total ?? 0).toLocaleString()} ENTITIES ON FILE
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
            <button
              className="mx-btn"
              disabled={activeCount === 0}
              onClick={() => {
                setFilters(EMPTY_BUSINESS_FILTERS);
                setOffset(0);
              }}
            >
              reset
            </button>
          </div>

          <BusinessFilterPanel filters={filters} patch={patch} facets={facets} />

          <div className="border-t border-[var(--mx-line)] px-3 py-3 md:hidden">
            <button className="mx-btn w-full justify-center" onClick={() => setRailOpen(false)}>
              apply
            </button>
          </div>
        </aside>

        {/* -------------------------------------------------------- results -- */}
        <section className="flex min-w-0 flex-1 flex-col">
          <div className="mx-boot min-h-0 flex-1 overflow-auto bg-black/60">
            <BusinessTable
              rows={rows}
              sort={filters.sort}
              dir={filters.dir}
              activeId={selected?.id ?? null}
              onSort={sortBy}
              onOpen={setSelected}
            />
          </div>

          {/* ------------------------------------------------------- foot -- */}
          <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--mx-line)] bg-black/70 px-3 py-2">
            <button
              className="mx-btn"
              disabled={offset === 0}
              onClick={() => setOffset((o) => Math.max(0, o - BUSINESS_PAGE_SIZE))}
            >
              ◄ prev
            </button>
            <button
              className="mx-btn"
              disabled={page >= pages}
              onClick={() => setOffset((o) => o + BUSINESS_PAGE_SIZE)}
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

        {/* --------------------------------------------------------- detail -- */}
        {selected && (
          <BusinessDetailPanel
            id={selected.id}
            fallbackName={selected.name}
            onClose={() => setSelected(null)}
          />
        )}
      </div>
    </main>
  );
}
