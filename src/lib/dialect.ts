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

/**
 * Case-insensitive equality between two SQL expressions.
 *
 * `likeOperator` covers the case where one side is a user-supplied pattern, but
 * ILIKE against another *column* is unindexable and forces a nested loop. Where
 * both sides are columns — joining free-text addresses to house names — this
 * gives the planner a plain equality it can hash-join instead.
 */
export function ciEquals(dialect: Dialect, left: string, right: string): string {
  return `${ciKey(dialect, left)} = ${ciKey(dialect, right)}`;
}

/**
 * Case-folded form of an expression, for use as a join or GROUP BY key. MySQL's
 * default collation already folds case, so folding again would only cost work.
 */
export function ciKey(dialect: Dialect, expr: string): string {
  return dialect === 'postgres' ? `lower(${expr})` : expr;
}

/**
 * SQL expression yielding a sortable `YYYYMMDD` integer from a stored `dob`, or
 * NULL when the value isn't a date we recognise. Mirrors the parsing rules in
 * `src/lib/dob.ts`: "M/D/YY" (two-digit years are 19xx), "M/D/YYYY", or ISO
 * "YYYY-MM-DD".
 *
 * Full precision rather than just the year, so an age filter agrees exactly with
 * the age the UI computes for the same row — comparing "born on or before this
 * date" needs the day, not only the year.
 *
 * The expression consumes no placeholders, so it is safe to embed anywhere. It
 * cannot use an index: every age filter is a scan of the residents table.
 */
export function birthKeyExpr(dialect: Dialect, column: string): string {
  const SLASH_SHORT = '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{2}$';
  const SLASH_LONG = '^[0-9]{1,2}/[0-9]{1,2}/[0-9]{4}$';
  const ISO = '^[0-9]{4}-[0-9]{1,2}-[0-9]{1,2}$';

  if (dialect === 'postgres') {
    const part = (sep: string, n: number) => `split_part(${column}, '${sep}', ${n})::int`;
    const ymd = (y: string, m: string, d: string) => `${y} * 10000 + ${m} * 100 + ${d}`;
    return `CASE
              WHEN ${column} ~ '${ISO}'
                THEN ${ymd(part('-', 1), part('-', 2), part('-', 3))}
              WHEN ${column} ~ '${SLASH_SHORT}'
                THEN ${ymd(`(1900 + ${part('/', 3)})`, part('/', 1), part('/', 2))}
              WHEN ${column} ~ '${SLASH_LONG}'
                THEN ${ymd(part('/', 3), part('/', 1), part('/', 2))}
            END`;
  }

  // MySQL has no split_part; nesting SUBSTRING_INDEX both ways picks out the
  // middle field.
  const part = (sep: string, n: number) => {
    const expr =
      n === 1
        ? `SUBSTRING_INDEX(${column}, '${sep}', 1)`
        : n === 2
          ? `SUBSTRING_INDEX(SUBSTRING_INDEX(${column}, '${sep}', 2), '${sep}', -1)`
          : `SUBSTRING_INDEX(${column}, '${sep}', -1)`;
    return `CAST(${expr} AS SIGNED)`;
  };
  const ymd = (y: string, m: string, d: string) => `${y} * 10000 + ${m} * 100 + ${d}`;
  return `CASE
            WHEN ${column} REGEXP '${ISO}'
              THEN ${ymd(part('-', 1), part('-', 2), part('-', 3))}
            WHEN ${column} REGEXP '${SLASH_SHORT}'
              THEN ${ymd(`(1900 + ${part('/', 3)})`, part('/', 1), part('/', 2))}
            WHEN ${column} REGEXP '${SLASH_LONG}'
              THEN ${ymd(part('/', 3), part('/', 1), part('/', 2))}
          END`;
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
