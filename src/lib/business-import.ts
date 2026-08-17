/**
 * Batch import for the business register.
 *
 * The parsing and normalisation here is deliberately free of any database or
 * `server-only` import: the /admin import panel runs it in the browser to
 * validate and count a file before uploading anything, and the route handler
 * runs the exact same code again on what arrives. The client-side pass is a
 * convenience — the server never trusts it.
 *
 * Input is the shape the national registry export uses:
 *
 *   [{ name, type, status, registration_no, detail_url, upn, address,
 *      owner_entity, owners: [{ name, role, date }] }]
 *
 * Every field except `name` may be missing or blank.
 */

/** A record as it appears in the uploaded file. Every field is untrusted. */
export interface RawBusiness {
  name?: unknown;
  type?: unknown;
  status?: unknown;
  registration_no?: unknown;
  detail_url?: unknown;
  upn?: unknown;
  address?: unknown;
  owner_entity?: unknown;
  owners?: unknown;
}

export interface NormalisedOwner {
  ordinal: number;
  owner_name: string;
  owner_role: string | null;
  appointed_on: string | null;
}

export interface NormalisedBusiness {
  id: string;
  name: string;
  type: string | null;
  status: string | null;
  registration_no: string | null;
  detail_url: string | null;
  upn: string | null;
  address: string | null;
  owner_entity: string | null;
  owners: NormalisedOwner[];
}

/** A record the parser refused, with its position in the file. */
export interface ImportIssue {
  index: number;
  reason: string;
}

export interface ParsedImport {
  records: NormalisedBusiness[];
  skipped: ImportIssue[];
}

/**
 * Column widths, mirroring db/schema.mysql.sql. Postgres TEXT has no limit, but
 * MySQL in strict mode rejects the whole statement on the first over-long value
 * — so one 600-character address would fail a batch of 200 good records.
 * Clamping here keeps the two backends accepting the same files.
 */
const LIMITS = {
  id: 128,
  name: 255,
  type: 128,
  status: 128,
  registration_no: 128,
  detail_url: 1024,
  upn: 128,
  address: 512,
  owner_entity: 255,
  owner_name: 255,
  owner_role: 255,
  appointed_on: 32,
} as const;

/** Trimmed string, clamped to the column width, or null when blank. */
function text(value: unknown, limit: number): string | null {
  if (typeof value !== 'string') return value == null ? null : String(value).slice(0, limit);
  const trimmed = value.trim().replace(/\s+/g, ' ');
  return trimmed ? trimmed.slice(0, limit) : null;
}

/**
 * Stable primary key for a source record.
 *
 * The registry's own registration number is the natural identifier, but a fair
 * share of records — sole proprietorships in particular — ship with it blank,
 * so the UPN and finally the name act as fallbacks. Deriving the key rather
 * than generating one is what makes a re-import of an overlapping export an
 * update instead of a duplicate.
 */
export function businessKey(record: {
  registration_no: string | null;
  upn: string | null;
  name: string;
}): string {
  if (record.registration_no) return record.registration_no.toUpperCase().slice(0, LIMITS.id);
  if (record.upn) return `UPN:${record.upn.toUpperCase()}`.slice(0, LIMITS.id);
  const slug = record.name
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
  return `NAME:${slug}`.slice(0, LIMITS.id);
}

function normaliseOwners(raw: unknown): NormalisedOwner[] {
  if (!Array.isArray(raw)) return [];
  const owners: NormalisedOwner[] = [];
  for (const entry of raw) {
    if (!entry || typeof entry !== 'object') continue;
    const o = entry as { name?: unknown; role?: unknown; date?: unknown };
    const name = text(o.name, LIMITS.owner_name);
    // An officer with no name carries nothing the console could show, and would
    // still take an ordinal — which would shift every later officer's key.
    if (!name) continue;
    owners.push({
      ordinal: owners.length,
      owner_name: name,
      owner_role: text(o.role, LIMITS.owner_role),
      appointed_on: text(o.date, LIMITS.appointed_on),
    });
  }
  return owners;
}

/** Primary key for one officer row. See db/schema.postgres.sql. */
export function ownerKey(businessId: string, ordinal: number): string {
  return `${businessId}#${ordinal}`;
}

/** Normalises one record, or explains why it cannot be stored. */
export function normaliseBusiness(raw: unknown): NormalisedBusiness | { error: string } {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { error: 'not an object' };
  }
  const r = raw as RawBusiness;
  const name = text(r.name, LIMITS.name);
  if (!name) return { error: 'missing name' };

  const registration_no = text(r.registration_no, LIMITS.registration_no);
  const upn = text(r.upn, LIMITS.upn);
  const id = businessKey({ registration_no, upn, name });

  return {
    id,
    name,
    type: text(r.type, LIMITS.type),
    status: text(r.status, LIMITS.status),
    registration_no,
    detail_url: text(r.detail_url, LIMITS.detail_url),
    upn,
    address: text(r.address, LIMITS.address),
    owner_entity: text(r.owner_entity, LIMITS.owner_entity),
    owners: normaliseOwners(r.owners),
  };
}

/**
 * Parses a whole upload. Accepts a bare array, or an object wrapping one under
 * `businesses`/`records`/`data` — exports differ on that and the difference is
 * not worth making the operator fix by hand.
 *
 * Records that cannot be stored are collected rather than thrown, so one bad
 * entry in a 40k-row export does not cost the other 39,999.
 */
export function parseBusinessPayload(payload: unknown): ParsedImport {
  let list: unknown[];
  if (Array.isArray(payload)) {
    list = payload;
  } else if (payload && typeof payload === 'object') {
    const wrapper = payload as Record<string, unknown>;
    const inner = wrapper.businesses ?? wrapper.records ?? wrapper.data;
    if (!Array.isArray(inner)) {
      throw new Error('expected an array of businesses, or an object wrapping one');
    }
    list = inner;
  } else {
    throw new Error('expected an array of businesses');
  }

  const records: NormalisedBusiness[] = [];
  const skipped: ImportIssue[] = [];
  // A file may list the same business twice; the last entry wins, so the upsert
  // never sees two rows with one primary key in a single statement.
  const seen = new Map<string, number>();

  list.forEach((entry, index) => {
    const result = normaliseBusiness(entry);
    if ('error' in result) {
      skipped.push({ index, reason: result.error });
      return;
    }
    const previous = seen.get(result.id);
    if (previous !== undefined) records[previous] = result;
    else {
      seen.set(result.id, records.length);
      records.push(result);
    }
  });

  return { records, skipped };
}

/**
 * Records per request from the import panel. Large enough that a 40k-row export
 * is a few hundred round trips rather than tens of thousands, small enough that
 * one request stays well inside a serverless body limit and the progress bar
 * actually moves.
 */
export const IMPORT_CHUNK_SIZE = 250;

/** Hard ceiling the route enforces, independent of what the client sends. */
export const MAX_IMPORT_RECORDS = 1000;

export interface ImportResponse {
  /** Businesses written (inserted or updated — the upsert does not distinguish). */
  written: number;
  /** Officer rows written across those businesses. */
  owners: number;
  skipped: ImportIssue[];
  took: number;
  error?: string;
}
