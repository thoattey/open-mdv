import { NextResponse } from 'next/server';

import { VISIBLE_RESIDENT } from '@/lib/censor';
import { query, dialect, likeOperator } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/address-residents?hname=<house name>&island=<island>&atoll=<atoll>
 *
 * Residents registered at a given address, so picking an address in search can
 * list who lives there. Backed by the SYNTHETIC resident register (see
 * scripts/seed-residents.ts) — no real personal data is served.
 *
 * `permanent_address` is free text, so the match is house name first (exact,
 * case-insensitive), narrowed by island/atoll when the caller supplies them.
 */

interface ResidentRow {
  id_no: string;
  full_name: string;
  dob: string | null;
  gender: string | null;
  permanent_address: string | null;
  island: string | null;
  atoll: string | null;
}

const RESULT_LIMIT = 200;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const hname = (searchParams.get('hname') ?? '').trim();
  const island = (searchParams.get('island') ?? '').trim();
  const atoll = (searchParams.get('atoll') ?? '').trim();

  if (!hname) return NextResponse.json({ results: [], total: 0 });

  const like = likeOperator(dialect);
  // LIKE with no wildcards is an equality test that ignores case on both
  // backends (ILIKE on Postgres, the default collation on MySQL).
  const where = [VISIBLE_RESIDENT, `permanent_address ${like} ?`];
  const params: string[] = [hname];
  if (island) {
    where.push(`island ${like} ?`);
    params.push(island);
  }
  if (atoll) {
    where.push(`atoll ${like} ?`);
    params.push(atoll);
  }

  try {
    const rows = await query<ResidentRow>(
      `SELECT id_no, full_name, dob, gender, permanent_address, island, atoll
         FROM residents
        WHERE ${where.join(' AND ')}
        ORDER BY full_name
        LIMIT ${RESULT_LIMIT}`,
      params,
    );

    return NextResponse.json({ results: rows, total: rows.length });
  } catch (err) {
    console.error('[api/address-residents]', err);
    return NextResponse.json({ results: [], total: 0 }, { status: 500 });
  }
}
