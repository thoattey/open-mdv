import { NextResponse } from 'next/server';

import { requireAdmin } from '@/lib/admin-session';
import {
  MAX_IMPORT_RECORDS,
  parseBusinessPayload,
  type ImportResponse,
} from '@/lib/business-import';
import { businessUpsert, ownerCount, ownerUpsert, staleOwnerDelete } from '@/lib/business-sql';
import { dialect, query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * POST /api/admin/import-businesses — the batch importer behind the /admin
 * import panel.
 *
 * Body is one chunk of the operator's file: either a bare array of registry
 * records or `{ businesses: [...] }`. The panel splits a large upload into
 * chunks of IMPORT_CHUNK_SIZE and posts them in sequence, so this handler only
 * ever sees a slice — `MAX_IMPORT_RECORDS` is the ceiling it enforces for
 * itself, independent of what the client claims to have sent.
 *
 * Writes are idempotent: the primary keys are derived from the record (see
 * src/lib/business-import.ts), so re-uploading the same file updates rows in
 * place. Requires a valid admin session.
 */

export async function POST(request: Request) {
  const auth = await requireAdmin();
  if ('response' in auth) return auth.response;

  const started = Date.now();

  let payload: unknown;
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: 'body is not valid JSON' }, { status: 400 });
  }

  let parsed;
  try {
    parsed = parseBusinessPayload(payload);
  } catch (err) {
    return NextResponse.json(
      { error: err instanceof Error ? err.message : 'unreadable payload' },
      { status: 400 },
    );
  }

  const { records, skipped } = parsed;
  if (records.length > MAX_IMPORT_RECORDS) {
    return NextResponse.json(
      { error: `at most ${MAX_IMPORT_RECORDS} records per request` },
      { status: 413 },
    );
  }
  if (!records.length) {
    return NextResponse.json({
      written: 0,
      owners: 0,
      skipped,
      took: Date.now() - started,
    } satisfies ImportResponse);
  }

  try {
    const importedAt = new Date();
    // Parents first: business_owners carries a foreign key onto businesses, so
    // a new business must exist before its officers can be written.
    const insert = businessUpsert(dialect, records, importedAt);
    if (insert) await query(insert.sql, insert.params);

    const prune = staleOwnerDelete(records);
    if (prune) await query(prune.sql, prune.params);

    const owners = ownerUpsert(dialect, records);
    if (owners) await query(owners.sql, owners.params);

    console.log(
      `[admin] ${auth.admin} imported ${records.length} business(es), ` +
        `${ownerCount(records)} officer(s)`,
    );

    return NextResponse.json({
      written: records.length,
      owners: ownerCount(records),
      skipped,
      took: Date.now() - started,
    } satisfies ImportResponse);
  } catch (err) {
    console.error('[api/admin/import-businesses]', err);
    return NextResponse.json(
      { error: 'import failed — is the businesses table migrated?' },
      { status: 500 },
    );
  }
}
