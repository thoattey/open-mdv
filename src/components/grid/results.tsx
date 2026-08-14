'use client';

import { ageFromDob, formatDob } from '@/lib/dob';
import type { AddressFilters, AddressRow, Dir, ResidentFilters, ResidentRow } from '@/lib/grid';

/**
 * Result tables for the console. Column headers double as the sort control:
 * clicking the active column flips direction, clicking another switches to it.
 */

interface Column<S extends string> {
  key: S | null;
  label: string;
  className?: string;
}

function HeadRow<S extends string>({
  columns,
  sort,
  dir,
  onSort,
}: {
  columns: Column<S>[];
  sort: S;
  dir: Dir;
  onSort: (key: S) => void;
}) {
  return (
    <tr>
      {columns.map((c) => (
        <th
          key={c.label}
          className={c.className}
          onClick={c.key ? () => onSort(c.key!) : undefined}
          style={c.key ? undefined : { cursor: 'default' }}
          aria-sort={c.key === sort ? (dir === 'asc' ? 'ascending' : 'descending') : undefined}
        >
          {c.label}
          {c.key === sort && <span className="ml-1">{dir === 'asc' ? '▲' : '▼'}</span>}
        </th>
      ))}
    </tr>
  );
}

function Empty({ colSpan }: { colSpan: number }) {
  return (
    <tr>
      <td colSpan={colSpan} className="py-10 text-center text-[var(--mx-dim)]">
        &gt; 0 records. loosen the filters.
      </td>
    </tr>
  );
}

const RESIDENT_COLUMNS: Column<ResidentFilters['sort']>[] = [
  { key: 'id', label: 'ID' },
  { key: 'name', label: 'Name' },
  { key: 'age', label: 'Age' },
  { key: null, label: 'DOB' },
  { key: null, label: 'Sex' },
  { key: 'address', label: 'Address' },
  { key: 'island', label: 'Island' },
  { key: null, label: 'Atoll' },
];

export function ResidentTable({
  rows,
  sort,
  dir,
  onSort,
}: {
  rows: ResidentRow[];
  sort: ResidentFilters['sort'];
  dir: Dir;
  onSort: (key: ResidentFilters['sort']) => void;
}) {
  return (
    <table className="mx-table">
      <thead>
        <HeadRow columns={RESIDENT_COLUMNS} sort={sort} dir={dir} onSort={onSort} />
      </thead>
      <tbody>
        {rows.length === 0 && <Empty colSpan={RESIDENT_COLUMNS.length} />}
        {rows.map((r) => {
          const age = ageFromDob(r.dob);
          return (
            <tr key={r.id_no}>
              <td className="text-[var(--mx-dim)]">{r.id_no}</td>
              <td className="text-[var(--mx-bright)]">{r.full_name}</td>
              <td className="tabular-nums">{age ?? '—'}</td>
              <td className="tabular-nums text-[var(--mx-dim)]">{formatDob(r.dob) || '—'}</td>
              <td>{r.gender ?? '—'}</td>
              <td>{r.permanent_address ?? '—'}</td>
              <td>{r.island ?? '—'}</td>
              <td className="text-[var(--mx-dim)]">{r.atoll ?? '—'}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

const ADDRESS_COLUMNS: Column<AddressFilters['sort']>[] = [
  { key: 'hname', label: 'House' },
  { key: 'island', label: 'Island' },
  { key: null, label: 'Atoll' },
  { key: 'residents', label: 'Residents' },
  { key: null, label: 'Lon' },
  { key: null, label: 'Lat' },
];

export function AddressTable({
  rows,
  sort,
  dir,
  onSort,
}: {
  rows: AddressRow[];
  sort: AddressFilters['sort'];
  dir: Dir;
  onSort: (key: AddressFilters['sort']) => void;
}) {
  return (
    <table className="mx-table">
      <thead>
        <HeadRow columns={ADDRESS_COLUMNS} sort={sort} dir={dir} onSort={onSort} />
      </thead>
      <tbody>
        {rows.length === 0 && <Empty colSpan={ADDRESS_COLUMNS.length} />}
        {rows.map((a) => (
          <tr key={a.id}>
            <td className="text-[var(--mx-bright)]">{a.hname || '—'}</td>
            <td>{a.island || '—'}</td>
            <td className="text-[var(--mx-dim)]">{a.atoll || '—'}</td>
            <td className="tabular-nums" style={a.residents ? undefined : { opacity: 0.4 }}>
              {a.residents}
            </td>
            <td className="tabular-nums text-[var(--mx-dim)]">{a.lon.toFixed(5)}</td>
            <td className="tabular-nums text-[var(--mx-dim)]">{a.lat.toFixed(5)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
