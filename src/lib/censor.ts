/**
 * Censorship gate for the resident register.
 *
 * A resident censored from /admin is never deleted — the row keeps its place in
 * the register (address head-counts, atoll facets and re-seeding all depend on
 * `id_no` staying stable) and is instead filtered out of every public read.
 * Anything that serves resident data to an unauthenticated caller must AND this
 * fragment into its WHERE clause; the only queries that may omit it live under
 * `/api/admin`, which is the console that sets the flag.
 *
 * `FALSE` is spelled the same on both backends: Postgres has a real boolean and
 * MySQL treats the keyword as 0, which is what its TINYINT(1) column stores.
 */
export const VISIBLE_RESIDENT = 'is_censored = FALSE';
