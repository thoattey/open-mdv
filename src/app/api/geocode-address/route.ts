import { NextResponse } from 'next/server';

import { query, dialect, likeOperator } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/geocode-address?hname=<house name>&island=<island>
 *
 * Resolves an address to a coordinate for the "view on map" action. Tries an
 * exact house-name + island match in the addresses layer first, then a fuzzy
 * house-name match, and finally falls back to the island centroid so a picked
 * resident always lands somewhere sensible on the map.
 *
 * ST_X/ST_Y return (lon, lat) for both backends: MySQL stores SRID 0 in lon/lat
 * order, and PostGIS 4326 is lon-first.
 */

interface PointRow {
  lon: number | string;
  lat: number | string;
}

async function firstPoint(sql: string, params: unknown[]): Promise<[number, number] | null> {
  const rows = await query<PointRow>(sql, params);
  if (!rows.length) return null;
  const lon = Number(rows[0].lon);
  const lat = Number(rows[0].lat);
  return Number.isFinite(lon) && Number.isFinite(lat) ? [lon, lat] : null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hname = (searchParams.get('hname') ?? '').trim();
  const island = (searchParams.get('island') ?? '').trim();
  const like = likeOperator(dialect);

  try {
    let point: [number, number] | null = null;
    let match: 'exact' | 'fuzzy' | 'island' | 'none' = 'none';

    if (hname && island) {
      point = await firstPoint(
        `SELECT ST_X(geom) AS lon, ST_Y(geom) AS lat
           FROM addresses
          WHERE hname = ? AND island_name = ?
          LIMIT 1`,
        [hname, island],
      );
      if (point) match = 'exact';
    }

    if (!point && hname) {
      point = await firstPoint(
        `SELECT ST_X(geom) AS lon, ST_Y(geom) AS lat
           FROM addresses
          WHERE hname ${like} ?${island ? ' AND island_name = ?' : ''}
          LIMIT 1`,
        island ? [`${hname}%`, island] : [`${hname}%`],
      );
      if (point) match = 'fuzzy';
    }

    if (!point && island) {
      point = await firstPoint(
        `SELECT longitude AS lon, latitude AS lat
           FROM island_names
          WHERE island_name = ?
          LIMIT 1`,
        [island],
      );
      if (point) match = 'island';
    }

    if (!point) return NextResponse.json({ found: false });
    return NextResponse.json({ found: true, match, lon: point[0], lat: point[1] });
  } catch (err) {
    console.error('[api/geocode-address]', err);
    return NextResponse.json({ found: false }, { status: 500 });
  }
}
