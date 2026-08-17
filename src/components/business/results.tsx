'use client';

import type { BusinessFilters, BusinessRow, Dir } from '@/lib/business';

/**
 * The /business result table. Column headers double as the sort control:
 * clicking the active column flips direction, clicking another switches to it.
 * Clicking a row opens the detail panel.
 */

type SortKey = BusinessFilters['sort'];

const COLUMNS: { key: SortKey | null; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'type', label: 'Type' },
  { key: 'status', label: 'Status' },
  { key: 'reg', label: 'Reg no' },
  { key: null, label: 'UPN' },
  { key: null, label: 'Address' },
  { key: 'owners', label: 'Officers' },
];

export function BusinessTable({
  rows,
  sort,
  dir,
  activeId,
  onSort,
  onOpen,
}: {
  rows: BusinessRow[];
  sort: SortKey;
  dir: Dir;
  /** Id of the row whose detail panel is open, highlighted in the table. */
  activeId: string | null;
  onSort: (key: SortKey) => void;
  onOpen: (row: BusinessRow) => void;
}) {
  return (
    <table className="mx-table">
      <thead>
        <tr>
          {COLUMNS.map((c) => (
            <th
              key={c.label}
              onClick={c.key ? () => onSort(c.key!) : undefined}
              style={c.key ? undefined : { cursor: 'default' }}
              aria-sort={
                c.key === sort ? (dir === 'asc' ? 'ascending' : 'descending') : undefined
              }
            >
              {c.label}
              {c.key === sort && <span className="ml-1">{dir === 'asc' ? '▲' : '▼'}</span>}
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
        {rows.map((b) => (
          <tr
            key={b.id}
            onClick={() => onOpen(b)}
            style={{
              cursor: 'pointer',
              background: b.id === activeId ? 'rgba(98, 248, 143, 0.12)' : undefined,
            }}
          >
            <td className="text-[var(--mx-bright)]">{b.name}</td>
            <td>{b.type || '—'}</td>
            <td>
              <span className="mx-chip" data-on={isActive(b.status)}>
                {b.status || '—'}
              </span>
            </td>
            <td className="text-[var(--mx-dim)]">{b.registration_no || '—'}</td>
            <td className="text-[var(--mx-dim)]">{b.upn || '—'}</td>
            <td>{b.address || '—'}</td>
            <td className="tabular-nums" style={b.owners ? undefined : { opacity: 0.4 }}>
              {b.owners}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/**
 * Whether a registry status counts as "in good standing", for the chip fill.
 * The export uses free text, so this is a display hint rather than a rule the
 * data guarantees — anything unrecognised simply renders unfilled.
 */
function isActive(status: string | null): boolean {
  return /^(registered|active)$/i.test((status ?? '').trim());
}
