/**
 * The three statements a business import runs, built for either dialect.
 *
 * Kept apart from the route handler (and free of `server-only`) so the same
 * writes can be driven from `scripts/db.ts`, which opens its own pool and can
 * never import the Next-only `src/lib/db`.
 *
 * All three use the `?` placeholder convention that src/lib/db rewrites to
 * `$1..$n` for Postgres — so none of them may contain a literal `?` in a string.
 */

import type { NormalisedBusiness } from './business-import';
import { ownerKey } from './business-import';
import { upsertClause, type Dialect } from './dialect';

export interface Statement {
  sql: string;
  params: unknown[];
}

const BUSINESS_COLUMNS = [
  'id',
  'name',
  'type',
  'status',
  'registration_no',
  'detail_url',
  'upn',
  'address',
  'owner_entity',
  'imported_at',
] as const;

const OWNER_COLUMNS = [
  'id',
  'business_id',
  'ordinal',
  'owner_name',
  'owner_role',
  'appointed_on',
] as const;

function valuesClause(columns: readonly string[], rows: number): string {
  const one = `(${columns.map(() => '?').join(', ')})`;
  return Array.from({ length: rows }, () => one).join(', ');
}

/** Insert-or-update every business in the batch. */
export function businessUpsert(
  dialect: Dialect,
  records: NormalisedBusiness[],
  importedAt: Date,
): Statement | null {
  if (!records.length) return null;
  const params = records.flatMap((r) => [
    r.id,
    r.name,
    r.type,
    r.status,
    r.registration_no,
    r.detail_url,
    r.upn,
    r.address,
    r.owner_entity,
    importedAt,
  ]);
  return {
    sql:
      `INSERT INTO businesses (${BUSINESS_COLUMNS.join(', ')}) ` +
      `VALUES ${valuesClause(BUSINESS_COLUMNS, records.length)} ` +
      // Every column but the key is refreshed, so a corrected export overwrites
      // a stale row rather than leaving half of it behind.
      upsertClause(dialect, 'id', BUSINESS_COLUMNS.slice(1)),
    params,
  };
}

/**
 * Removes officers a later export dropped.
 *
 * Deleting by `ordinal >= <new count>` rather than clearing the business first
 * means the officers that survive are never absent, even for the moment between
 * two statements — these writes do not run in one transaction.
 */
export function staleOwnerDelete(records: NormalisedBusiness[]): Statement | null {
  if (!records.length) return null;
  const clauses = records.map(() => '(business_id = ? AND ordinal >= ?)').join(' OR ');
  return {
    sql: `DELETE FROM business_owners WHERE ${clauses}`,
    params: records.flatMap((r) => [r.id, r.owners.length]),
  };
}

/** Insert-or-update the officers of every business in the batch. */
export function ownerUpsert(dialect: Dialect, records: NormalisedBusiness[]): Statement | null {
  const rows = records.flatMap((r) =>
    r.owners.map((o) => [
      ownerKey(r.id, o.ordinal),
      r.id,
      o.ordinal,
      o.owner_name,
      o.owner_role,
      o.appointed_on,
    ]),
  );
  if (!rows.length) return null;
  return {
    sql:
      `INSERT INTO business_owners (${OWNER_COLUMNS.join(', ')}) ` +
      `VALUES ${valuesClause(OWNER_COLUMNS, rows.length)} ` +
      upsertClause(dialect, 'id', OWNER_COLUMNS.slice(1)),
    params: rows.flat(),
  };
}

/** Officer rows the batch will write, for the importer's running tally. */
export function ownerCount(records: NormalisedBusiness[]): number {
  return records.reduce((n, r) => n + r.owners.length, 0);
}
