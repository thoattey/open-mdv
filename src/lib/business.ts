/**
 * Shared contract for the /business console — the filter shape the client holds
 * in state, the row shapes the API returns, and the serialiser that turns one
 * into the other. Imported by both the route handlers and the client
 * components, so nothing in here may touch the database or `server-only`.
 *
 * Mirrors src/lib/grid.ts, which does the same job for the resident and address
 * registers.
 */

import type { Dir } from './grid';

// Sort direction is the same idea in both consoles; re-exported so /business
// modules need only one import.
export type { Dir };

export interface BusinessFilters {
  q: string;
  name: string;
  /** Registration number contains, e.g. "C-0883". */
  reg: string;
  /** Unique permit number contains. */
  upn: string;
  address: string;
  /** Officer name contains — matches through the business_owners table. */
  owner: string;
  /** Exact `type` values, OR'd within the set. */
  types: string[];
  /** Exact `status` values, OR'd within the set. */
  statuses: string[];
  /** Only businesses with at least one listed officer. */
  withOwners: boolean;
  sort: 'name' | 'reg' | 'type' | 'status' | 'owners';
  dir: Dir;
}

export const EMPTY_BUSINESS_FILTERS: BusinessFilters = {
  q: '',
  name: '',
  reg: '',
  upn: '',
  address: '',
  owner: '',
  types: [],
  statuses: [],
  withOwners: false,
  sort: 'name',
  dir: 'asc',
};

export interface BusinessRow {
  id: string;
  name: string;
  type: string | null;
  status: string | null;
  registration_no: string | null;
  upn: string | null;
  address: string | null;
  owner_entity: string | null;
  detail_url: string | null;
  /** Count of rows in business_owners, not the officers themselves. */
  owners: number;
}

export interface OwnerRow {
  ordinal: number;
  owner_name: string;
  owner_role: string | null;
  appointed_on: string | null;
}

/** One business with its officers — the payload of /api/business/[id]. */
export interface BusinessDetail extends BusinessRow {
  imported_at: string | null;
  owner_list: OwnerRow[];
}

export interface BusinessListResponse {
  results: BusinessRow[];
  total: number;
  /** Server-side query time in ms, shown in the console readout. */
  took: number;
  error?: string;
}

export interface BusinessFacets {
  types: { value: string; n: number }[];
  statuses: { value: string; n: number }[];
  /** Total rows in the register, so an empty console can say whether it is
   *  empty because of the filters or because nothing has been imported. */
  total: number;
}

export const BUSINESS_PAGE_SIZE = 50;

/** Drops empty values so the request URL only carries live filters. */
function pack(entries: Record<string, string | number | boolean | string[]>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) {
      if (value.length) p.set(key, value.join('|'));
    } else if (typeof value === 'boolean') {
      if (value) p.set(key, '1');
    } else if (String(value).trim() !== '') {
      p.set(key, String(value).trim());
    }
  }
  return p;
}

export function businessParams(f: BusinessFilters, offset: number): URLSearchParams {
  return pack({
    q: f.q,
    name: f.name,
    reg: f.reg,
    upn: f.upn,
    address: f.address,
    owner: f.owner,
    // `|` rather than `,` because registry statuses and types are free text and
    // a comma inside one would split it into two bogus values.
    types: f.types,
    statuses: f.statuses,
    owned: f.withOwners,
    sort: f.sort,
    dir: f.dir,
    limit: BUSINESS_PAGE_SIZE,
    offset,
  });
}

/** How many of a filter set are actually doing something, for the HUD counter. */
export function activeBusinessFilterCount(f: BusinessFilters): number {
  return Object.entries(f).filter(([key, value]) => {
    if (key === 'sort' || key === 'dir') return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'boolean') return value;
    return String(value).trim() !== '';
  }).length;
}
