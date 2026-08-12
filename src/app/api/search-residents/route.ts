import { NextResponse } from 'next/server';

import { query, dialect, likeOperator } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/search-residents?action=search&q=<term>
 * GET /api/search-residents?action=test
 *
 * Mirrors the upstream `search-residents.php` contract. The upstream endpoint
 * serves a real national ID register; this clone is backed entirely by
 * SYNTHETIC records (see scripts/seed-residents.ts) whose IDs are `SYN-`
 * prefixed. Nothing here exposes real personal data.
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

const RESULT_LIMIT = 50;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const action = searchParams.get('action') ?? 'search';

  if (action === 'test') {
    try {
      await query('SELECT 1');
      return NextResponse.json({
        success: true,
        message: 'Database connection successful',
        table_exists: true,
        columns: ['id_no', 'full_name', 'dob', 'gender', 'permanent_address', 'island', 'atoll'],
      });
    } catch {
      return NextResponse.json(
        { success: false, message: 'Database connection failed' },
        { status: 500 },
      );
    }
  }

  const q = (searchParams.get('q') ?? '').trim();
  if (q.length < 2) {
    return NextResponse.json({ success: true, results: [] });
  }

  const like = likeOperator(dialect);
  // Rank exact-ish name prefix matches ahead of substring hits so the most
  // relevant residents surface first without a full-text index dependency.
  const prefix = `${q}%`;
  const anywhere = `%${q}%`;

  try {
    const rows = await query<ResidentRow>(
      // `rank` is a reserved word in MySQL 8 (the RANK() window function), so the
      // ordering expression is aliased as match_rank.
      `SELECT id_no, full_name, dob, gender, permanent_address, island, atoll,
              CASE
                WHEN full_name ${like} ? THEN 0
                WHEN id_no ${like} ? THEN 1
                WHEN permanent_address ${like} ? THEN 2
                ELSE 3
              END AS match_rank
         FROM residents
        WHERE full_name ${like} ?
           OR id_no ${like} ?
           OR permanent_address ${like} ?
           OR island ${like} ?
        ORDER BY match_rank, full_name
        LIMIT ${RESULT_LIMIT}`,
      [prefix, prefix, prefix, anywhere, anywhere, anywhere, anywhere],
    );

    const results = rows.map(({ id_no, full_name, dob, gender, permanent_address, island, atoll }) => ({
      id_no,
      full_name,
      dob,
      gender,
      permanent_address,
      island,
      atoll,
    }));

    return NextResponse.json({ success: true, results });
  } catch (err) {
    console.error('[api/search-residents]', err);
    return NextResponse.json({ success: false, message: 'search failed' }, { status: 500 });
  }
}
