/**
 * Shared contract for /admin — the data-control console. Imported by both the
 * route handlers and the client components, so nothing in here may touch the
 * database, the session secret, or `server-only`.
 */

import type { ResidentRow } from './grid';

/** A resident as the console sees it: the public row plus its censor flag. */
export interface AdminResidentRow extends ResidentRow {
  is_censored: boolean;
}

export interface AdminResidentsResponse {
  results: AdminResidentRow[];
  total: number;
  /** How many of the matched rows are currently censored. */
  censored: number;
  took: number;
  error?: string;
}

/** Which side of the censor flag to list. */
export type CensorView = 'all' | 'censored' | 'visible';

export const ADMIN_PAGE_SIZE = 50;

export const SESSION_COOKIE = 'rj_admin';

/** Session lifetime, in seconds. Also used as the cookie's Max-Age. */
export const SESSION_TTL_SECONDS = 8 * 60 * 60;
