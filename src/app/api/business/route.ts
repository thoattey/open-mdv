import { NextResponse } from 'next/server';

import { BUSINESS_PAGE_SIZE, type BusinessRow } from '@/lib/business';
import { dialect, likeOperator, query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/business — the filtered feed behind the /business console.
 *
 * Every parameter is optional and they AND together:
 *   q        free text across name, registration no, UPN and address
 *   name     name contains
 *   reg      registration number contains
 *   upn      unique permit number contains
 *   address  registered address contains
 *   owner    officer name contains (matched through business_owners)
 *   types    `|`-separated exact `type` values (OR'd within the set)
 *   statuses `|`-separated exact `status` values (OR'd within the set)
 *   owned    "1" to keep only businesses with at least one listed officer
 *   sort     name | reg | type | status | owners
 *   dir      asc | desc
 *   limit    capped at BUSINESS_PAGE_SIZE
 *   offset
 *
 * The register is public-record data from the national business registry, so
 * unlike the resident feeds there is no censor gate to apply here.
 *
 * LIKE wildcards in user input are deliberately not escaped, matching /grid:
 * `%` and `_` are usable from the console's text fields.
 */

const SORT_COLUMNS = {
  name: 'b.name',
  reg: 'b.registration_no',
  type: 'b.type',
  status: 'b.status',
} as const;

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

/** Splits a `|`-separated multi-value parameter. See src/lib/business.ts. */
function multi(raw: string | null): string[] {
  return (raw ?? '')
    .split('|')
    .map((v) => v.trim())
    .filter(Boolean);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const started = Date.now();

  const like = likeOperator(dialect);
  const where: string[] = [];
  const params: unknown[] = [];

  const contains = (column: string, raw: string | null) => {
    const v = (raw ?? '').trim();
    if (!v) return;
    where.push(`${column} ${like} ?`);
    params.push(`%${v}%`);
  };

  const q = (searchParams.get('q') ?? '').trim();
  if (q) {
    where.push(
      `(b.name ${like} ? OR b.registration_no ${like} ? OR b.upn ${like} ? OR b.address ${like} ?)`,
    );
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  contains('b.name', searchParams.get('name'));
  contains('b.registration_no', searchParams.get('reg'));
  contains('b.upn', searchParams.get('upn'));
  contains('b.address', searchParams.get('address'));

  for (const [column, values] of [
    ['b.type', multi(searchParams.get('types'))],
    ['b.status', multi(searchParams.get('statuses'))],
  ] as const) {
    if (!values.length) continue;
    where.push(`${column} IN (${values.map(() => '?').join(', ')})`);
    params.push(...values);
  }

  const owner = (searchParams.get('owner') ?? '').trim();
  if (owner) {
    where.push(
      `EXISTS (SELECT 1 FROM business_owners o
                WHERE o.business_id = b.id AND o.owner_name ${like} ?)`,
    );
    params.push(`%${owner}%`);
  } else if (searchParams.get('owned') === '1') {
    // Only when no name was given: the EXISTS above already implies this one.
    where.push(`EXISTS (SELECT 1 FROM business_owners o WHERE o.business_id = b.id)`);
  }

  const sort = (searchParams.get('sort') ?? 'name') as keyof typeof SORT_COLUMNS | 'owners';
  const dir = searchParams.get('dir') === 'desc' ? 'DESC' : 'ASC';
  // `owners` is the correlated count selected below; both backends allow a
  // select alias in ORDER BY, so it is not recomputed here.
  const orderBy =
    sort === 'owners'
      ? `owners ${dir}, b.name`
      : `${SORT_COLUMNS[sort] ?? SORT_COLUMNS.name} ${dir}, b.id`;

  const limit = clampInt(searchParams.get('limit'), BUSINESS_PAGE_SIZE, 1, BUSINESS_PAGE_SIZE);
  const offset = clampInt(searchParams.get('offset'), 0, 0, 500_000);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const [rows, counted] = await Promise.all([
      query<BusinessRow & { owners: number | string }>(
        `SELECT b.id, b.name, b.type, b.status, b.registration_no, b.upn, b.address,
                b.owner_entity, b.detail_url,
                (SELECT COUNT(*) FROM business_owners o WHERE o.business_id = b.id) AS owners
           FROM businesses b
           ${whereSql}
          ORDER BY ${orderBy}
          LIMIT ${limit} OFFSET ${offset}`,
        params,
      ),
      query<{ total: number | string }>(
        `SELECT COUNT(*) AS total FROM businesses b ${whereSql}`,
        params,
      ),
    ]);

    return NextResponse.json({
      // COUNT() comes back as a string from pg (bigint) and a number from mysql2.
      results: rows.map((r) => ({ ...r, owners: Number(r.owners) })),
      total: Number(counted[0]?.total ?? 0),
      took: Date.now() - started,
    });
  } catch (err) {
    console.error('[api/business]', err);
    return NextResponse.json(
      { results: [], total: 0, took: Date.now() - started, error: 'query failed' },
      { status: 500 },
    );
  }
}
