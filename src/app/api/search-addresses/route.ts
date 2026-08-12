import { NextResponse } from 'next/server';

import { query, dialect, likeOperator } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/search-addresses?q=<term>
 *
 * House-name search over the addresses layer, returning a coordinate so the UI
 * can fly to and highlight a picked address. This is cadastral data (house name
 * + island + location), not personal data.
 */

interface AddressRow {
  hname: string;
  island_name: string | null;
  atoll: string | null;
  lon: number | string;
  lat: number | string;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const like = likeOperator(dialect);
  try {
    const rows = await query<AddressRow>(
      `SELECT hname, island_name, atoll, ST_X(geom) AS lon, ST_Y(geom) AS lat
         FROM addresses
        WHERE hname ${like} ?
        ORDER BY CASE WHEN hname ${like} ? THEN 0 ELSE 1 END, hname
        LIMIT 20`,
      [`%${q}%`, `${q}%`],
    );

    const results = rows
      .map((r) => ({
        hname: r.hname,
        island: r.island_name ?? '',
        atoll: r.atoll ?? '',
        lon: Number(r.lon),
        lat: Number(r.lat),
      }))
      .filter((r) => Number.isFinite(r.lon) && Number.isFinite(r.lat));

    return NextResponse.json({ results });
  } catch (err) {
    console.error('[api/search-addresses]', err);
    return NextResponse.json({ results: [] }, { status: 500 });
  }
}
