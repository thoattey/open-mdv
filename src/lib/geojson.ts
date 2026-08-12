import 'server-only';

import { query, dialect, bboxPredicate, geoJsonColumn } from '@/lib/db';
import { LAYER_BY_KEY, type LayerDef } from '@/lib/layers';

export interface GeoJsonFeature {
  type: 'Feature';
  id: number;
  properties: Record<string, unknown>;
  geometry: unknown;
}

export interface FeatureCollection {
  type: 'FeatureCollection';
  name: string;
  crs: { type: 'name'; properties: { name: string } };
  features: GeoJsonFeature[];
}

const CRS84 = {
  type: 'name' as const,
  properties: { name: 'urn:ogc:def:crs:OGC:1.3:CRS84' },
};

interface Row {
  id: number;
  // MySQL 8's ST_AsGeoJSON returns a JSON-typed value that mysql2 auto-parses
  // into an object; PostGIS returns text. So this is already-parsed or a string.
  geojson: string | Record<string, unknown>;
  [column: string]: unknown;
}

/** Reassemble a database row into the exact GeoJSON feature shape the upstream
 *  API produced, using the layer's column↔property mapping. */
function rowToFeature(layer: LayerDef, row: Row): GeoJsonFeature {
  const properties: Record<string, unknown> = {};
  for (const col of layer.columns) {
    let value = row[col.column];
    if (value === undefined) value = null;
    if (col.emit) value = col.emit(value);
    properties[col.prop] = value;
  }
  return {
    type: 'Feature',
    id: row.id,
    properties,
    geometry: typeof row.geojson === 'string' ? JSON.parse(row.geojson) : row.geojson,
  };
}

export function emptyCollection(name: string): FeatureCollection {
  return { type: 'FeatureCollection', name, crs: CRS84, features: [] };
}

/**
 * Fetch a layer as a GeoJSON FeatureCollection.
 *
 * Tiled layers require a bbox and are capped at the layer's `limit`, mirroring
 * the original API's LIMIT behaviour. Static layers return everything.
 */
export async function fetchLayer(
  layerKey: string,
  bbox?: [number, number, number, number],
): Promise<FeatureCollection | null> {
  const layer = LAYER_BY_KEY.get(layerKey);
  if (!layer) return null;

  const cols = layer.columns.map((c) => c.column).join(', ');
  const select = `SELECT id, ${cols}, ${geoJsonColumn('geom')} FROM ${layer.table}`;

  let sql: string;
  let params: unknown[] = [];

  if (layer.tiled) {
    if (!bbox) return emptyCollection(layer.key);
    const pred = bboxPredicate(dialect, 'geom', bbox);
    sql = `${select} WHERE ${pred.sql} LIMIT ${layer.limit ?? 4000}`;
    params = pred.params;
  } else {
    sql = select;
  }

  const rows = await query<Row>(sql, params);
  return {
    type: 'FeatureCollection',
    name: layer.key,
    crs: CRS84,
    features: rows.map((r) => rowToFeature(layer, r)),
  };
}
