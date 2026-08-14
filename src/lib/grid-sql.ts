import { ciKey, type Dialect } from './dialect';

/**
 * Join key for matching an island name across layers.
 *
 * Beyond case, the two exports disagree on doubled vowels: the addresses layer
 * writes the capital "Male" where the gazetteer writes "Maale" — 7.4k rows,
 * including all of the capital. Collapsing "aa" to "a" on *both* sides settles
 * that romanisation difference; names that already agree (e.g. "Hulhumaale")
 * still agree after the rewrite, since the same fold is applied either way.
 */
export function islandKey(dialect: Dialect, expr: string): string {
  return `REPLACE(${ciKey(dialect, expr)}, 'aa', 'a')`;
}

/**
 * The `addresses` layer ships with its `atoll` column blank on every row — the
 * upstream export only carries the island name. The island gazetteer does have
 * the code, so an atoll for an address is resolved through it.
 *
 * Returns a derived table `(isl, atoll)` keyed by `islandKey`; one row per
 * island, since the gazetteer can list a name more than once.
 */
export function islandAtollTable(dialect: Dialect): string {
  const key = islandKey(dialect, 'island_name');
  return `(SELECT ${key} AS isl, MIN(atoll) AS atoll
             FROM island_names
            WHERE island_name IS NOT NULL AND atoll IS NOT NULL AND atoll <> ''
            GROUP BY ${key})`;
}

/** Atoll for an address row: whatever the layer stored, else the gazetteer's. */
export const ADDRESS_ATOLL = `COALESCE(NULLIF(a.atoll, ''), il.atoll)`;
