import { NextResponse } from 'next/server';

import { ADMIN_PAGE_SIZE, type AdminResidentRow, type CensorView } from '@/lib/admin';
import { requireAdmin } from '@/lib/admin-session';
import { dialect, likeOperator, query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * The register as the data-control console sees it — the one place censored
 * residents are still readable, and the only place the flag can be written.
 *
 *   GET   ?q=&island=&view=all|censored|visible&sort=name|id|island|censored
 *         &dir=asc|desc&offset=
 *   PATCH { ids: string[], is_censored: boolean }
 *
 * Both require a valid admin session (see src/lib/admin-session.ts).
 */

const SORT_COLUMNS = {
  name: 'full_name',
  id: 'id_no',
  island: 'island',
  address: 'permanent_address',
  censored: 'is_censored',
} as const;

/** Ids per PATCH. Bounded so one request cannot rewrite the whole register. */
const MAX_BATCH = 500;

interface DbRow extends Omit<AdminResidentRow, 'is_censored'> {
  is_censored: boolean | number | string;
}

export async function GET(request: Request) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;

  const { searchParams } = new URL(request.url);
  const started = Date.now();

  const like = likeOperator(dialect);
  const where: string[] = [];
  const params: unknown[] = [];

  const q = (searchParams.get('q') ?? '').trim();
  if (q) {
    where.push(
      `(full_name ${like} ? OR id_no ${like} ? OR permanent_address ${like} ? OR island ${like} ?)`,
    );
    params.push(`%${q}%`, `%${q}%`, `%${q}%`, `%${q}%`);
  }

  const island = (searchParams.get('island') ?? '').trim();
  if (island) {
    where.push(`island ${like} ?`);
    params.push(`%${island}%`);
  }

  const atolls = (searchParams.get('atolls') ?? '')
    .split(',')
    .map((a) => a.trim())
    .filter(Boolean);
  if (atolls.length) {
    where.push(`atoll IN (${atolls.map(() => '?').join(', ')})`);
    params.push(...atolls);
  }

  const view = (searchParams.get('view') ?? 'all') as CensorView;
  if (view === 'censored') where.push('is_censored = TRUE');
  else if (view === 'visible') where.push('is_censored = FALSE');

  const sort = (searchParams.get('sort') ?? 'name') as keyof typeof SORT_COLUMNS;
  const dir = searchParams.get('dir') === 'desc' ? 'DESC' : 'ASC';
  const orderBy = `${SORT_COLUMNS[sort] ?? SORT_COLUMNS.name} ${dir}, id_no`;

  const rawOffset = Number.parseInt(searchParams.get('offset') ?? '', 10);
  const offset = Number.isFinite(rawOffset) ? Math.min(100_000, Math.max(0, rawOffset)) : 0;
  const whereSql = where.length ? `WHERE ${where.join(' AND ')}` : '';

  try {
    const [rows, counted] = await Promise.all([
      query<DbRow>(
        `SELECT id_no, full_name, dob, gender, permanent_address, island, atoll, is_censored
           FROM residents
           ${whereSql}
          ORDER BY ${orderBy}
          LIMIT ${ADMIN_PAGE_SIZE} OFFSET ${offset}`,
        params,
      ),
      // One pass for both tallies, so the header can show "N censored of M"
      // without a second scan of the same predicate.
      query<{ total: number | string; censored: number | string }>(
        `SELECT COUNT(*) AS total,
                SUM(CASE WHEN is_censored = TRUE THEN 1 ELSE 0 END) AS censored
           FROM residents ${whereSql}`,
        params,
      ),
    ]);

    return NextResponse.json({
      // MySQL hands back TINYINT 0/1 where Postgres gives a real boolean.
      results: rows.map((r) => ({ ...r, is_censored: Boolean(Number(r.is_censored)) })),
      total: Number(counted[0]?.total ?? 0),
      censored: Number(counted[0]?.censored ?? 0),
      took: Date.now() - started,
    });
  } catch (err) {
    console.error('[api/admin/residents]', err);
    return NextResponse.json(
      { results: [], total: 0, censored: 0, took: Date.now() - started, error: 'query failed' },
      { status: 500 },
    );
  }
}

export async function PATCH(request: Request) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;

  let ids: string[] = [];
  let censored = false;
  try {
    const body = (await request.json()) as {
      ids?: unknown;
      id_no?: unknown;
      is_censored?: unknown;
    };
    const raw = Array.isArray(body.ids) ? body.ids : body.id_no ? [body.id_no] : [];
    ids = raw.filter((v): v is string => typeof v === 'string' && v.trim() !== '');
    censored = body.is_censored === true;
    if (typeof body.is_censored !== 'boolean') {
      return NextResponse.json({ error: 'is_censored must be a boolean' }, { status: 400 });
    }
  } catch {
    return NextResponse.json({ error: 'malformed request' }, { status: 400 });
  }

  if (!ids.length) return NextResponse.json({ error: 'no ids given' }, { status: 400 });
  if (ids.length > MAX_BATCH) {
    return NextResponse.json({ error: `at most ${MAX_BATCH} ids per request` }, { status: 400 });
  }

  try {
    await query(
      `UPDATE residents SET is_censored = ? WHERE id_no IN (${ids.map(() => '?').join(', ')})`,
      [censored, ...ids],
    );
    console.log(
      `[admin] ${auth.admin} ${censored ? 'censored' : 'uncensored'} ${ids.length} resident(s)`,
    );
    return NextResponse.json({ ok: true, updated: ids.length, is_censored: censored });
  } catch (err) {
    console.error('[api/admin/residents] PATCH', err);
    return NextResponse.json({ error: 'update failed' }, { status: 500 });
  }
}
