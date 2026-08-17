import { NextResponse } from 'next/server';

import type { BusinessFacets } from '@/lib/business';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/business/facets — the value lists the /business filter panel offers:
 * every entity type and registration status actually present in the register,
 * with a row count each. Fetched once per session and cached client-side.
 *
 * The values are free text from the registry export rather than an enum, so the
 * only way to know what exists is to ask the table.
 */

/** Cap on distinct values returned per facet, in case an import carries junk. */
const MAX_VALUES = 60;

export async function GET() {
  try {
    const bucket = (column: string) =>
      query<{ value: string | null; n: number | string }>(
        `SELECT ${column} AS value, COUNT(*) AS n
           FROM businesses
          WHERE ${column} IS NOT NULL AND ${column} <> ''
          GROUP BY ${column}
          ORDER BY COUNT(*) DESC
          LIMIT ${MAX_VALUES}`,
      );

    const [types, statuses, total] = await Promise.all([
      bucket('type'),
      bucket('status'),
      query<{ total: number | string }>('SELECT COUNT(*) AS total FROM businesses'),
    ]);

    const clean = (rows: { value: string | null; n: number | string }[]) =>
      rows.map((r) => ({ value: r.value!, n: Number(r.n) }));

    const facets: BusinessFacets = {
      types: clean(types),
      statuses: clean(statuses),
      total: Number(total[0]?.total ?? 0),
    };
    return NextResponse.json(facets);
  } catch (err) {
    console.error('[api/business/facets]', err);
    return NextResponse.json({ types: [], statuses: [], total: 0 } satisfies BusinessFacets, {
      status: 500,
    });
  }
}
