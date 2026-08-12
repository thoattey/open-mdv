/**
 * Date-of-birth parsing for resident records.
 *
 * The register stores `dob` as free text in US month/day order with a two-digit
 * year — "7/28/89". A handful of rows use ISO "YYYY-MM-DD" instead.
 *
 * Two-digit years are read as 19xx: every birth year in the dataset falls on a
 * single smooth 1900–1994 curve (nothing after mid-1994, and the sparse 00–13
 * counts are the tail of that curve, not infants), so a "pivot at today" rule
 * would wrongly turn centenarians into toddlers.
 */

const DMY = /^(\d{1,2})\/(\d{1,2})\/(\d{2}|\d{4})$/;
const ISO = /^(\d{4})-(\d{1,2})-(\d{1,2})$/;

/** Parses a stored dob into y/m/d parts, or null when it isn't a date we know. */
export function parseDob(raw: string | null | undefined): { y: number; m: number; d: number } | null {
  const s = (raw ?? '').trim();
  if (!s) return null;

  let y: number, m: number, d: number;
  const iso = ISO.exec(s);
  if (iso) {
    [y, m, d] = [Number(iso[1]), Number(iso[2]), Number(iso[3])];
  } else {
    const md = DMY.exec(s);
    if (!md) return null;
    m = Number(md[1]);
    d = Number(md[2]);
    const yy = md[3];
    y = yy.length === 4 ? Number(yy) : 1900 + Number(yy);
  }

  if (m < 1 || m > 12 || d < 1 || d > 31) return null;
  // Reject impossible days (31 Feb and friends) by round-tripping through Date.
  const probe = new Date(Date.UTC(y, m - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== m - 1 || probe.getUTCDate() !== d) {
    return null;
  }
  return { y, m, d };
}

/** "7/28/89" -> "28/07/1989". Unparsable values are passed through unchanged. */
export function formatDob(raw: string | null | undefined): string {
  const p = parseDob(raw);
  if (!p) return (raw ?? '').trim();
  return `${String(p.d).padStart(2, '0')}/${String(p.m).padStart(2, '0')}/${p.y}`;
}

/** Completed years as of `now`, or null when the dob can't be read. */
export function ageFromDob(raw: string | null | undefined, now: Date = new Date()): number | null {
  const p = parseDob(raw);
  if (!p) return null;
  let age = now.getFullYear() - p.y;
  const monthDay = (now.getMonth() + 1) * 100 + now.getDate();
  if (monthDay < p.m * 100 + p.d) age--;
  return age >= 0 && age < 130 ? age : null;
}

export function genderLabel(gender: string | null | undefined): string {
  return gender === 'F' ? 'Female' : gender === 'M' ? 'Male' : (gender ?? '');
}

/** "(35 Y) / Male" — falls back to whichever half is known. */
export function formatAgeGender(
  dob: string | null | undefined,
  gender: string | null | undefined,
): string {
  const age = ageFromDob(dob);
  const g = genderLabel(gender);
  if (age === null) return g;
  return g ? `(${age} Y) / ${g}` : `(${age} Y)`;
}
