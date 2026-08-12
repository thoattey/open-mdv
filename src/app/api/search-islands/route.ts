import { NextResponse } from 'next/server';

import { query, dialect, likeOperator } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/search-islands?q=<term>
 *
 * Name search over the island_names layer, returning a centroid so the UI can
 * fly to a picked island. Inhabited islands rank first.
 */

interface IslandRow {
  island_name: string;
  atoll: string | null;
  longitude: string | null;
  latitude: string | null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = (searchParams.get('q') ?? '').trim();
  if (q.length < 2) return NextResponse.json({ results: [] });

  const like = likeOperator(dialect);
  try {
    const rows = await query<IslandRow>(
      `SELECT island_name, atoll, longitude, latitude
         FROM island_names
        WHERE island_name ${like} ?
        ORDER BY CASE WHEN category = 'Inhabited' THEN 0 ELSE 1 END,
                 CASE WHEN island_name ${like} ? THEN 0 ELSE 1 END,
                 island_name
        LIMIT 20`,
      [`%${q}%`, `${q}%`],
    );

    const results = rows
      .map((r) => ({
        island_name: r.island_name,
        atoll: r.atoll ?? '',
        lon: Number(r.longitude),
        lat: Number(r.latitude),
      }))
      .filter((r) => Number.isFinite(r.lon) && Number.isFinite(r.lat));

    return NextResponse.json({ results });
  } catch (err) {
    console.error('[api/search-islands]', err);
    return NextResponse.json({ results: [] }, { status: 500 });
  }
}
