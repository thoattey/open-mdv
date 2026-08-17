import { NextResponse } from 'next/server';

import type { BusinessDetail, BusinessRow, OwnerRow } from '@/lib/business';
import { query, queryOne } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * GET /api/business/[id] — one business with its officers, for the detail panel
 * the /business console opens on a row.
 *
 * The id is the derived natural key described in src/lib/business-import.ts, so
 * it can carry `/` (registration numbers look like "C-0883/2017") and arrives
 * percent-encoded; Next has already decoded it by the time it reaches params.
 */

interface DetailDbRow extends Omit<BusinessRow, 'owners'> {
  imported_at: string | Date | null;
}

export async function GET(_request: Request, ctx: RouteContext<'/api/business/[id]'>) {
  const { id } = await ctx.params;
  if (!id) return NextResponse.json({ error: 'no id given' }, { status: 400 });

  try {
    const business = await queryOne<DetailDbRow>(
      `SELECT id, name, type, status, registration_no, upn, address, owner_entity,
              detail_url, imported_at
         FROM businesses WHERE id = ?`,
      [id],
    );
    if (!business) return NextResponse.json({ error: 'not found' }, { status: 404 });

    const owners = await query<OwnerRow>(
      `SELECT ordinal, owner_name, owner_role, appointed_on
         FROM business_owners WHERE business_id = ? ORDER BY ordinal`,
      [id],
    );

    const detail: BusinessDetail = {
      ...business,
      // pg hands back a Date for timestamptz, mysql2 a Date for DATETIME.
      imported_at: business.imported_at ? new Date(business.imported_at).toISOString() : null,
      owners: owners.length,
      owner_list: owners,
    };
    return NextResponse.json(detail);
  } catch (err) {
    console.error('[api/business/[id]]', err);
    return NextResponse.json({ error: 'query failed' }, { status: 500 });
  }
}
