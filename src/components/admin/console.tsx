'use client';

import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useMemo, useState } from 'react';

import {
  ADMIN_PAGE_SIZE,
  type AdminResidentRow,
  type AdminResidentsResponse,
  type CensorView,
} from '@/lib/admin';
import { ageFromDob } from '@/lib/dob';
import type { Dir } from '@/lib/grid';
import { useDebounced } from '@/lib/use-debounced';

/**
 * /admin — the data control console.
 *
 * The register is listed in full here (censored rows included, since this is the
 * only view that may see them) and each row carries one switch: censored records
 * are withheld from `/api/search-residents`, `/api/address-residents`, the /grid
 * feeds and the JSON export, without the row itself being deleted.
 */

type SortKey = 'name' | 'id' | 'island' | 'address' | 'censored';

interface Filters {
  q: string;
  island: string;
  view: CensorView;
  sort: SortKey;
  dir: Dir;
}

const EMPTY_FILTERS: Filters = { q: '', island: '', view: 'all', sort: 'name', dir: 'asc' };

const VIEWS: { key: CensorView; label: string }[] = [
  { key: 'all', label: 'all' },
  { key: 'visible', label: 'public' },
  { key: 'censored', label: 'censored' },
];

const COLUMNS: { key: SortKey | null; label: string }[] = [
  { key: null, label: '' },
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Name' },
  { key: null, label: 'Age' },
  { key: null, label: 'Sex' },
  { key: 'address', label: 'Address' },
  { key: 'island', label: 'Island' },
  { key: null, label: 'Atoll' },
  { key: 'censored', label: 'Censored' },
];

function paramsFor(f: Filters, offset: number): string {
  const p = new URLSearchParams();
  if (f.q.trim()) p.set('q', f.q.trim());
  if (f.island.trim()) p.set('island', f.island.trim());
  if (f.view !== 'all') p.set('view', f.view);
  p.set('sort', f.sort);
  p.set('dir', f.dir);
  p.set('offset', String(offset));
  return p.toString();
}

export function AdminConsole({ admin }: { admin: string }) {
  const router = useRouter();
  const queryClient = useQueryClient();

  const [filters, setFilters] = useState<Filters>(EMPTY_FILTERS);
  const [offset, setOffset] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const patch = useCallback((partial: Partial<Filters>) => {
    setFilters((prev) => ({ ...prev, ...partial }));
    setOffset(0);
  }, []);

  const debounced = useDebounced(filters, 250);
  const search = paramsFor(debounced, offset);

  const { data, isFetching, isError } = useQuery({
    queryKey: ['admin-residents', search],
    queryFn: async () => {
      const res = await fetch(`/api/admin/residents?${search}`);
      // The session can lapse while the console sits open; the server component
      // then renders the login form again.
      if (res.status === 401) router.refresh();
      return (await res.json()) as AdminResidentsResponse;
    },
    placeholderData: (previous) => previous,
  });

  const setCensored = useMutation({
    mutationFn: async ({ ids, censored }: { ids: string[]; censored: boolean }) => {
      const res = await fetch('/api/admin/residents', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ids, is_censored: censored }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(body.error ?? 'update failed');
      }
      return res.json() as Promise<{ updated: number }>;
    },
    onSuccess: () => {
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: ['admin-residents'] });
    },
  });

  const rows = useMemo(() => data?.results ?? [], [data]);
  const total = data?.total ?? 0;
  const censoredCount = data?.censored ?? 0;
  const pages = Math.max(1, Math.ceil(total / ADMIN_PAGE_SIZE));
  const page = Math.floor(offset / ADMIN_PAGE_SIZE) + 1;
  const failed = isError || Boolean(data?.error);

  const toggleRow = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const allOnPageSelected = rows.length > 0 && rows.every((r) => selected.has(r.id_no));
  const togglePage = () =>
    setSelected((prev) => {
      const next = new Set(prev);
      for (const r of rows) {
        if (allOnPageSelected) next.delete(r.id_no);
        else next.add(r.id_no);
      }
      return next;
    });

  const sortBy = (key: SortKey) =>
    patch({ sort: key, dir: filters.sort === key && filters.dir === 'asc' ? 'desc' : 'asc' });

  const signOut = async () => {
    await fetch('/api/admin/logout', { method: 'POST' });
    router.refresh();
  };

  const status = failed
    ? 'QUERY FAILED — IS THE DATABASE UP?'
    : isFetching
      ? 'QUERYING…'
      : `${total.toLocaleString()} RECORD${total === 1 ? '' : 'S'} MATCHED`;

  return (
    <div className="flex h-dvh w-full flex-col overflow-hidden">
      {/* -------------------------------------------------------------- head -- */}
      <header className="shrink-0 border-b border-[var(--mx-line)] bg-black/70 px-3 py-2">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
          <h1 className="mx-glow text-sm font-bold tracking-[0.3em]">
            RAAJJE<span className="text-[var(--mx-accent)]">{'//'}</span>CONTROL
            <span className="mx-caret ml-1">_</span>
          </h1>

          <div className="flex gap-1">
            {VIEWS.map((v) => (
              <button
                key={v.key}
                className="mx-btn"
                data-active={filters.view === v.key}
                onClick={() => patch({ view: v.key })}
              >
                {v.label}
              </button>
            ))}
          </div>

          <div className="ml-auto flex items-center gap-2">
            <span className="text-[10px] text-[var(--mx-dim)]">op: {admin}</span>
            <Link className="mx-btn" href="/grid">
              ← grid
            </Link>
            <button className="mx-btn" onClick={signOut}>
              sign out
            </button>
          </div>
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2">
          <input
            className="mx-field w-64"
            placeholder="search name / id / address / island"
            value={filters.q}
            onChange={(e) => patch({ q: e.target.value })}
          />
          <input
            className="mx-field w-44"
            placeholder="island"
            value={filters.island}
            onChange={(e) => patch({ island: e.target.value })}
          />
          <button
            className="mx-btn"
            onClick={() => {
              setFilters(EMPTY_FILTERS);
              setOffset(0);
            }}
          >
            reset
          </button>

          <span className="ml-auto text-[10px] text-[var(--mx-dim)]">
            {selected.size} selected
          </span>
          <button
            className="mx-btn"
            disabled={selected.size === 0 || setCensored.isPending}
            onClick={() => setCensored.mutate({ ids: [...selected], censored: true })}
          >
            censor selected
          </button>
          <button
            className="mx-btn"
            disabled={selected.size === 0 || setCensored.isPending}
            onClick={() => setCensored.mutate({ ids: [...selected], censored: false })}
          >
            release selected
          </button>
        </div>

        <p className="mt-1 text-[10px] text-[var(--mx-dim)]">
          {status} · {censoredCount.toLocaleString()} CENSORED · PAGE {page}/{pages} ·{' '}
          {data?.took ?? 0}MS · REGISTER: SYNTHETIC — NO REAL PERSONAL DATA
          {setCensored.isError && (
            <span style={{ color: 'var(--mx-danger)' }}> · {setCensored.error.message}</span>
          )}
        </p>
      </header>

      {/* ----------------------------------------------------------- results -- */}
      <div className="mx-boot min-h-0 flex-1 overflow-auto bg-black/60">
        <table className="mx-table">
          <thead>
            <tr>
              {COLUMNS.map((c, i) => (
                <th
                  key={c.label || `col-${i}`}
                  onClick={c.key ? () => sortBy(c.key!) : undefined}
                  style={c.key ? undefined : { cursor: 'default' }}
                  aria-sort={
                    c.key === filters.sort
                      ? filters.dir === 'asc'
                        ? 'ascending'
                        : 'descending'
                      : undefined
                  }
                >
                  {i === 0 ? (
                    <input
                      type="checkbox"
                      aria-label="select page"
                      checked={allOnPageSelected}
                      onChange={togglePage}
                    />
                  ) : (
                    <>
                      {c.label}
                      {c.key === filters.sort && (
                        <span className="ml-1">{filters.dir === 'asc' ? '▲' : '▼'}</span>
                      )}
                    </>
                  )}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="py-10 text-center text-[var(--mx-dim)]">
                  &gt; 0 records. loosen the filters.
                </td>
              </tr>
            )}
            {rows.map((r) => (
              <Row
                key={r.id_no}
                row={r}
                selected={selected.has(r.id_no)}
                busy={setCensored.isPending}
                onSelect={() => toggleRow(r.id_no)}
                onToggle={() =>
                  setCensored.mutate({ ids: [r.id_no], censored: !r.is_censored })
                }
              />
            ))}
          </tbody>
        </table>
      </div>

      {/* -------------------------------------------------------------- foot -- */}
      <footer className="flex shrink-0 flex-wrap items-center gap-2 border-t border-[var(--mx-line)] bg-black/70 px-3 py-2">
        <button
          className="mx-btn"
          disabled={offset === 0}
          onClick={() => setOffset((o) => Math.max(0, o - ADMIN_PAGE_SIZE))}
        >
          ◄ prev
        </button>
        <button
          className="mx-btn"
          disabled={page >= pages}
          onClick={() => setOffset((o) => o + ADMIN_PAGE_SIZE)}
        >
          next ►
        </button>
        <span className="text-[10px] text-[var(--mx-dim)]">
          rows {total === 0 ? 0 : offset + 1}–{Math.min(offset + rows.length, total)} of{' '}
          {total.toLocaleString()}
        </span>
      </footer>
    </div>
  );
}

function Row({
  row,
  selected,
  busy,
  onSelect,
  onToggle,
}: {
  row: AdminResidentRow;
  selected: boolean;
  busy: boolean;
  onSelect: () => void;
  onToggle: () => void;
}) {
  const age = ageFromDob(row.dob);
  // A censored row is dimmed so the state reads at a glance while scanning.
  const dim = row.is_censored ? { opacity: 0.45 } : undefined;

  return (
    <tr>
      <td>
        <input
          type="checkbox"
          aria-label={`select ${row.id_no}`}
          checked={selected}
          onChange={onSelect}
        />
      </td>
      <td className="text-[var(--mx-dim)]" style={dim}>
        {row.id_no}
      </td>
      <td className="text-[var(--mx-bright)]" style={dim}>
        {row.full_name}
      </td>
      <td className="tabular-nums" style={dim}>
        {age ?? '—'}
      </td>
      <td style={dim}>{row.gender ?? '—'}</td>
      <td style={dim}>{row.permanent_address ?? '—'}</td>
      <td style={dim}>{row.island ?? '—'}</td>
      <td className="text-[var(--mx-dim)]" style={dim}>
        {row.atoll ?? '—'}
      </td>
      <td>
        <button
          className="mx-chip"
          data-tone="danger"
          data-on={row.is_censored}
          disabled={busy}
          aria-pressed={row.is_censored}
          onClick={onToggle}
        >
          {row.is_censored ? 'censored' : 'public'}
        </button>
      </td>
    </tr>
  );
}
