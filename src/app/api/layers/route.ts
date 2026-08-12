import { NextResponse } from 'next/server';

import { fetchLayer } from '@/lib/geojson';
import { LAYER_BY_KEY } from '@/lib/layers';

export const dynamic = 'force-dynamic';

/**
 * GET /api/layers?layer=<key>[&bbox=minLon,minLat,maxLon,maxLat]
 *
 * Wire-compatible with the upstream `/map/api/layers.php`: same query params,
 * same GeoJSON FeatureCollection shape. Tiled layers require a bbox; static
 * layers ignore it.
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const layer = searchParams.get('layer');

  if (!layer || !LAYER_BY_KEY.has(layer)) {
    return NextResponse.json(
      { error: `unknown layer: ${layer ?? '(none)'}` },
      { status: 400 },
    );
  }

  let bbox: [number, number, number, number] | undefined;
  const bboxRaw = searchParams.get('bbox');
  if (bboxRaw) {
    const parts = bboxRaw.split(',').map(Number);
    if (parts.length !== 4 || parts.some((n) => !Number.isFinite(n))) {
      return NextResponse.json({ error: 'bbox must be minLon,minLat,maxLon,maxLat' }, { status: 400 });
    }
    bbox = parts as [number, number, number, number];
  }

  try {
    const collection = await fetchLayer(layer, bbox);
    if (!collection) {
      return NextResponse.json({ error: `unknown layer: ${layer}` }, { status: 400 });
    }
    return NextResponse.json(collection, {
      headers: {
        // Viewport tiles are re-requested constantly as the user pans; a short
        // shared cache keeps the DB from re-running identical bbox queries.
        'Cache-Control': 'public, max-age=30, s-maxage=300, stale-while-revalidate=600',
      },
    });
  } catch (err) {
    console.error('[api/layers]', err);
    return NextResponse.json({ error: 'internal error' }, { status: 500 });
  }
}
