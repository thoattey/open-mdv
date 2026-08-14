import { NextResponse } from 'next/server';

import { VISIBLE_RESIDENT } from '@/lib/censor';
import { birthKeyExpr, ciEquals, dialect, likeOperator, query } from '@/lib/db';
import { PAGE_SIZE, type ResidentRow } from '@/lib/grid';

export const dynamic = 'force-dynamic';

/**
 * GET /api/grid/residents — the filtered resident feed behind the /grid console.
 *
 * Every parameter is optional and they AND together:
 *   q        free text across name, ID, address and island
 *   name     name contains
 *   id       ID number contains
 *   address  permanent address contains
 *   island   island contains
 *   gender   M | F
 *   atolls   comma-separated atoll codes (OR'd within the set)
 *   ageMin   inclusive lower bound, in completed years
 *   ageMax   inclusive upper bound
 *   geo      "1" to keep only residents whose address exists in the map layer
 *   sort     name | id | age | island | address
 *   dir      asc | desc
 *   limit    capped at PAGE_SIZE
 *   offset
 *
 * Backed by the SYNTHETIC register (see scripts/seed-residents.ts). LIKE
 * wildcards in user input are deliberately not escaped: `%` and `_` are usable
 * from the console's text fields.
 */

const SORT_COLUMNS = {
  name: 'full_name',
  id: 'id_no',
  island: 'island',
  address: 'permanent_address',
} as const;

function clampInt(raw: string | null, fallback: number, min: number, max: number): number {
  const n = Number.parseInt(raw ?? '', 10);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const started = Date.now();

  const like = likeOperator(dialect);
  // Censored residents are withheld from every public read; only /api/admin sees
  // them. See src/lib/censor.ts.
  const where: string[] = [VISIBLE_RESIDENT];
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
      `(full_name ${like} ? OR id_no ${like} ? OR permanent_address ${like} ? OR island ${like} ?)`,
    );
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  contains('full_name', searchParams.get('name'));
  contains('id_no', searchParams.get('id'));
  contains('permanent_address', searchParams.get('address'));
  contains('island', searchParams.get('island'));

  const gender = (searchParams.get('gender') ?? '').trim().toUpperCase();
  if (gender === 'M' || gender === 'F') {
    where.push('gender = ?');
    params.push(gender);
  }

  const atolls = (searchParams.get('atolls') ?? '')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
  if (atolls.length) {
    where.push(`atoll IN (${atolls.map(() => '?').join(', ')})`);
    params.push(...atolls);
  }

  // Age becomes a window over the YYYYMMDD birth key, which makes the bounds
  // exact rather than year-approximate:
  //   age >= min  <=>  born on or before today minus `min` years
  //   age <= max  <=>  born after today minus `max + 1` years
  const birthKey = birthKeyExpr(dialect, 'dob');
  const today = new Date();
  const keyAtAge = (years: number) =>
    (today.getFullYear() - years) * 10000 + (today.getMonth() + 1) * 100 + today.getDate();
  const ageMin = Number.parseInt(searchParams.get('ageMin') ?? '', 10);
  const ageMax = Number.parseInt(searchParams.get('ageMax') ?? '', 10);
  if (Number.isFinite(ageMin) && ageMin >= 0) {
    where.push(`${birthKey} <= ?`);
    params.push(keyAtAge(ageMin));
  }
  if (Number.isFinite(ageMax) && ageMax >= 0) {
    where.push(`${birthKey} > ?`);
    params.push(keyAtAge(ageMax + 1));
  }

  if (searchParams.get('geo') === '1') {
    // Column-to-column equality (rather than ILIKE) so the planner can hash-join
    // the two tables instead of scanning addresses once per resident.
    where.push(
      `EXISTS (SELECT 1 FROM addresses a
                WHERE ${ciEquals(dialect, 'a.hname', 'residents.permanent_address')}
                  AND (residents.island IS NULL
                       OR ${ciEquals(dialect, 'a.island_name', 'residents.island')}))`,
    );
  }

  const sort = (searchParams.get('sort') ?? 'name') as keyof typeof SORT_COLUMNS | 'age';
  const dir = searchParams.get('dir') === 'desc' ? 'DESC' : 'ASC';
  let orderBy: string;
  if (sort === 'age') {
    // Ascending age is descending birth date, so this one sort runs inverted.
    orderBy = `${birthKey} ${dir === 'ASC' ? 'DESC' : 'ASC'}, full_name`;
  } else {
    orderBy = `${SORT_COLUMNS[sort] ?? SORT_COLUMNS.name} ${dir}, id_no`;
  }

  const limit = clampInt(searchParams.get('limit'), PAGE_SIZE, 1, PAGE_SIZE);
  const offset = clampInt(searchParams.get('offset'), 0, 0, 100_000);
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const [rows, counted] = await Promise.all([
      query<ResidentRow>(
        `SELECT id_no, full_name, dob, gender, permanent_address, island, atoll
           FROM residents
           ${whereSql}
          ORDER BY ${orderBy}
          LIMIT ${limit} OFFSET ${offset}`,
        params,
      ),
      query<{ total: number | string }>(
        `SELECT COUNT(*) AS total FROM residents ${whereSql}`,
        params,
      ),
    ]);

    return NextResponse.json({
      results: rows,
      total: Number(counted[0]?.total ?? 0),
      took: Date.now() - started,
    });
  } catch (err) {
    console.error('[api/grid/residents]', err);
    return NextResponse.json(
      { results: [], total: 0, took: Date.now() - started, error: 'query failed' },
      { status: 500 },
    );
  }
}
