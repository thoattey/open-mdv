/**
 * Everything that differs between the MySQL and PostGIS backends lives here, so
 * the rest of the app can be written once against a single set of SQL fragments.
 *
 * The two differ in more than syntax:
 *   - MySQL stores geometry as SRID 0 in (lon, lat) order and filters with
 *     MBRIntersects against a WKT polygon.
 *   - PostGIS stores true SRID 4326 and filters with the `&&` bbox operator
 *     against ST_MakeEnvelope, which the GIST index serves directly.
 */

export type Dialect = 'mysql' | 'postgres';

export function resolveDialect(): Dialect {
  const raw = (process.env.DB_DIALECT ?? 'mysql').toLowerCase();
  if (raw === 'mysql') return 'mysql';
  if (raw === 'postgres' || raw === 'postgresql' || raw === 'pg') return 'postgres';
  throw new Error(`DB_DIALECT must be "mysql" or "postgres", got "${raw}"`);
}

/** SRID the geometry columns are declared with, per dialect. */
export const SRID: Record<Dialect, number> = { mysql: 0, postgres: 4326 };

/**
 * Index-backed bounding-box predicate. Returns a SQL fragment plus the params
 * it consumes, in order.
 */
export function bboxPredicate(
  dialect: Dialect,
  column: string,
  bbox: [number, number, number, number],
): { sql: string; params: (number | string)[] } {
  const [minLon, minLat, maxLon, maxLat] = bbox;
  if (dialect === 'postgres') {
    return {
      sql: `${column} && ST_MakeEnvelope(?, ?, ?, ?, 4326)`,
      params: [minLon, minLat, maxLon, maxLat],
    };
  }
  // MySQL has no envelope constructor, so the box is built as WKT. MBRIntersects
  // compares minimum bounding rectangles, which is exactly the index's unit of
  // work — no per-row geometry refinement.
  const wkt =
    `POLYGON((${minLon} ${minLat}, ${maxLon} ${minLat}, ` +
    `${maxLon} ${maxLat}, ${minLon} ${maxLat}, ${minLon} ${minLat}))`;
  return { sql: `MBRIntersects(${column}, ST_GeomFromText(?, 0))`, params: [wkt] };
}

/** Select expression producing a GeoJSON geometry string. Identical in both. */
export function geoJsonColumn(column: string, alias = 'geojson'): string {
  return `ST_AsGeoJSON(${column}) AS ${alias}`;
}

/**
 * Expression converting a GeoJSON geometry parameter into a storable geometry.
 * Consumes exactly one placeholder.
 */
export function geomFromGeoJson(dialect: Dialect): string {
  return dialect === 'postgres'
    ? 'ST_SetSRID(ST_GeomFromGeoJSON(?), 4326)'
    : 'ST_GeomFromGeoJSON(?, 1, 0)';
}

/** Case-insensitive prefix/substring match. MySQL's default collation is already
 *  case-insensitive; Postgres needs an explicit ILIKE. */
export function likeOperator(dialect: Dialect): string {
  return dialect === 'postgres' ? 'ILIKE' : 'LIKE';
}

/** Upsert clause for a batch INSERT, given the columns to overwrite. */
export function upsertClause(dialect: Dialect, conflictKey: string, columns: string[]): string {
  if (dialect === 'postgres') {
    const sets = columns.map((c) => `${c} = EXCLUDED.${c}`).join(', ');
    return `ON CONFLICT (${conflictKey}) DO UPDATE SET ${sets}`;
  }
  const sets = columns.map((c) => `${c} = VALUES(${c})`).join(', ');
  return `ON DUPLICATE KEY UPDATE ${sets}`;
}
