/**
 * Shared contract for the /grid console — the filter shapes the client holds in
 * state, the row shapes the API returns, and the serialiser that turns one into
 * the other. Imported by both the route handlers and the client components, so
 * nothing in here may touch the database or `server-only`.
 */

export type Dir = 'asc' | 'desc';

export interface ResidentFilters {
  q: string;
  name: string;
  id: string;
  address: string;
  island: string;
  gender: '' | 'M' | 'F';
  atolls: string[];
  ageMin: string;
  ageMax: string;
  /** Only residents whose permanent address resolves to a mapped house. */
  geoLinked: boolean;
  sort: 'name' | 'id' | 'age' | 'island' | 'address';
  dir: Dir;
}

export interface AddressFilters {
  q: string;
  hname: string;
  island: string;
  atolls: string[];
  /** Bounding box, decimal degrees. Empty strings mean "unbounded". */
  minLon: string;
  minLat: string;
  maxLon: string;
  maxLat: string;
  /** Only addresses that at least one resident is registered at. */
  occupiedOnly: boolean;
  sort: 'hname' | 'island' | 'residents';
  dir: Dir;
}

export const EMPTY_RESIDENT_FILTERS: ResidentFilters = {
  q: '',
  name: '',
  id: '',
  address: '',
  island: '',
  gender: '',
  atolls: [],
  ageMin: '',
  ageMax: '',
  geoLinked: false,
  sort: 'name',
  dir: 'asc',
};

export const EMPTY_ADDRESS_FILTERS: AddressFilters = {
  q: '',
  hname: '',
  island: '',
  atolls: [],
  minLon: '',
  minLat: '',
  maxLon: '',
  maxLat: '',
  occupiedOnly: false,
  sort: 'hname',
  dir: 'asc',
};

export interface ResidentRow {
  id_no: string;
  full_name: string;
  dob: string | null;
  gender: string | null;
  permanent_address: string | null;
  island: string | null;
  atoll: string | null;
}

export interface AddressRow {
  id: number;
  hname: string;
  island: string;
  atoll: string;
  hfname: string;
  lon: number;
  lat: number;
  residents: number;
}

export interface GridResponse<T> {
  results: T[];
  total: number;
  /** Server-side query time in ms, shown in the console readout. */
  took: number;
  error?: string;
}

export interface Facets {
  atolls: { code: string; residents: number; addresses: number }[];
  islands: string[];
}

export const PAGE_SIZE = 50;

/** Drops empty values so the request URL only carries live filters. */
function pack(entries: Record<string, string | number | boolean | string[]>): URLSearchParams {
  const p = new URLSearchParams();
  for (const [key, value] of Object.entries(entries)) {
    if (Array.isArray(value)) {
      if (value.length) p.set(key, value.join(','));
    } else if (typeof value === 'boolean') {
      if (value) p.set(key, '1');
    } else if (String(value).trim() !== '') {
      p.set(key, String(value).trim());
    }
  }
  return p;
}

export function residentParams(f: ResidentFilters, offset: number): URLSearchParams {
  return pack({
    q: f.q,
    name: f.name,
    id: f.id,
    address: f.address,
    island: f.island,
    gender: f.gender,
    atolls: f.atolls,
    ageMin: f.ageMin,
    ageMax: f.ageMax,
    geo: f.geoLinked,
    sort: f.sort,
    dir: f.dir,
    limit: PAGE_SIZE,
    offset,
  });
}

export function addressParams(f: AddressFilters, offset: number): URLSearchParams {
  return pack({
    q: f.q,
    hname: f.hname,
    island: f.island,
    atolls: f.atolls,
    minLon: f.minLon,
    minLat: f.minLat,
    maxLon: f.maxLon,
    maxLat: f.maxLat,
    occupied: f.occupiedOnly,
    sort: f.sort,
    dir: f.dir,
    limit: PAGE_SIZE,
    offset,
  });
}

/** How many of a filter set are actually doing something, for the HUD counter. */
export function activeFilterCount(f: ResidentFilters | AddressFilters): number {
  return Object.entries(f).filter(([key, value]) => {
    if (key === 'sort' || key === 'dir') return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === 'boolean') return value;
    return String(value).trim() !== '';
  }).length;
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const cell = (v: unknown) => {
    const s = v === null || v === undefined ? '' : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => cell(r[c])).join(','))].join('\n');
}
