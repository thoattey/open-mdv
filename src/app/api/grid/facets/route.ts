import { NextResponse } from 'next/server';

import { VISIBLE_RESIDENT } from '@/lib/censor';
import { dialect, query } from '@/lib/db';
import type { Facets } from '@/lib/grid';
import { ADDRESS_ATOLL, islandAtollTable, islandKey } from '@/lib/grid-sql';

export const dynamic = 'force-dynamic';

/**
 * GET /api/grid/facets — the value lists the /grid filter panel offers: every
 * atoll code with how many residents and addresses sit under it, plus the
 * island names for the datalist. Fetched once per session and cached client-side.
 */

export async function GET() {
  try {
    const [residentAtolls, addressAtolls, islands] = await Promise.all([
      query<{ atoll: string | null; n: number | string }>(
        `SELECT atoll, COUNT(*) AS n FROM residents
          WHERE ${VISIBLE_RESIDENT} AND atoll IS NOT NULL AND atoll <> ''
          GROUP BY atoll`,
      ),
      // The addresses layer stores no atoll of its own, so the code comes from
      // the island gazetteer — see islandAtollTable.
      query<{ atoll: string | null; n: number | string }>(
        `SELECT ${ADDRESS_ATOLL} AS atoll, COUNT(*) AS n
           FROM addresses a
           LEFT JOIN ${islandAtollTable(dialect)} il ON il.isl = ${islandKey(dialect, 'a.island_name')}
          WHERE ${ADDRESS_ATOLL} IS NOT NULL AND ${ADDRESS_ATOLL} <> ''
          GROUP BY ${ADDRESS_ATOLL}`,
      ),
      query<{ island_name: string | null }>(
        `SELECT DISTINCT island_name FROM island_names
          WHERE island_name IS NOT NULL AND island_name <> ''
          ORDER BY island_name`,
      ),
    ]);

    const merged = new Map<string, { code: string; residents: number; addresses: number }>();
    const bucket = (code: string) => {
      const existing = merged.get(code);
      if (existing) return existing;
      const fresh = { code, residents: 0, addresses: 0 };
      merged.set(code, fresh);
      return fresh;
    };
    for (const row of residentAtolls) bucket(row.atoll!).residents = Number(row.n);
    for (const row of addressAtolls) bucket(row.atoll!).addresses = Number(row.n);

    const facets: Facets = {
      atolls: [...merged.values()].sort((a, b) => a.code.localeCompare(b.code)),
      islands: islands.map((i) => i.island_name!).filter(Boolean),
    };
    return NextResponse.json(facets);
  } catch (err) {
    console.error('[api/grid/facets]', err);
    return NextResponse.json({ atolls: [], islands: [] } satisfies Facets, { status: 500 });
  }
}
