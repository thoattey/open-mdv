'use client';

import { useQuery } from '@tanstack/react-query';

import type { BusinessDetail } from '@/lib/business';

/**
 * Detail panel for one business — the officers, which the list feed only counts,
 * plus the fields too long to fit a table column.
 *
 * The list row is passed in as `fallback` so the panel has a name and status to
 * draw immediately; the officers arrive from /api/business/[id] a moment later.
 */

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-2 py-1">
      <span className="mx-label pt-0.5">{label}</span>
      <span className="break-words text-[var(--mx-bright)]">{value || '—'}</span>
    </div>
  );
}

export function BusinessDetailPanel({
  id,
  fallbackName,
  onClose,
}: {
  id: string;
  fallbackName: string;
  onClose: () => void;
}) {
  const { data, isFetching, isError } = useQuery({
    queryKey: ['business-detail', id],
    queryFn: async () => {
      const res = await fetch(`/api/business/${encodeURIComponent(id)}`);
      if (!res.ok) throw new Error('detail unavailable');
      return (await res.json()) as BusinessDetail;
    },
    staleTime: 60_000,
  });

  return (
    <aside className="mx-panel absolute inset-y-0 right-0 z-40 flex w-full max-w-md flex-col overflow-y-auto md:static md:w-96 md:shrink-0">
      <div className="flex items-start justify-between gap-2 border-b border-[var(--mx-line)] px-3 py-2">
        <h2 className="mx-glow text-[var(--mx-bright)]">{data?.name ?? fallbackName}</h2>
        <button className="mx-btn" onClick={onClose} aria-label="Close detail panel">
          close
        </button>
      </div>

      <div className="px-3 py-2 text-[11px]">
        <Row label="Type" value={data?.type} />
        <Row label="Status" value={data?.status} />
        <Row label="Reg no" value={data?.registration_no} />
        <Row label="UPN" value={data?.upn} />
        <Row label="Address" value={data?.address} />
        <Row label="Owner entity" value={data?.owner_entity} />
        <Row
          label="Registry"
          value={
            data?.detail_url ? (
              <a
                className="underline decoration-dotted underline-offset-2 hover:text-[var(--mx-accent)]"
                href={data.detail_url}
                target="_blank"
                rel="noreferrer noopener"
              >
                open source record ↗
              </a>
            ) : null
          }
        />
      </div>

      <div className="border-t border-[var(--mx-line)] px-3 py-2">
        <p className="mx-label mb-2">
          Officers{data ? ` (${data.owner_list.length})` : ''}
        </p>

        {isError && <p className="text-[10px] text-[var(--mx-danger)]">could not load officers</p>}
        {!data && !isError && (
          <p className="text-[10px] text-[var(--mx-dim)]">
            {isFetching ? 'reading record…' : '—'}
          </p>
        )}
        {data?.owner_list.length === 0 && (
          <p className="text-[10px] text-[var(--mx-dim)]">
            &gt; none listed in the source record.
          </p>
        )}

        <ul className="space-y-2">
          {(data?.owner_list ?? []).map((o) => (
            <li key={o.ordinal} className="border-l-2 border-[var(--mx-line)] pl-2">
              <span className="block text-[var(--mx-bright)]">{o.owner_name}</span>
              <span className="block text-[10px] text-[var(--mx-dim)]">
                {o.owner_role || 'role not stated'}
                {o.appointed_on ? ` · ${o.appointed_on}` : ''}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {data?.imported_at && (
        <p className="mt-auto border-t border-[var(--mx-line)] px-3 py-2 text-[10px] text-[var(--mx-dim)]">
          imported {new Date(data.imported_at).toLocaleString()}
        </p>
      )}
    </aside>
  );
}
