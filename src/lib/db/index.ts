import 'server-only';

import type { Pool as MySqlPool } from 'mysql2/promise';
import type { Pool as PgPool } from 'pg';

import { resolveDialect, type Dialect } from '../dialect';
import { SUPABASE_ROOT_CA } from './supabase-ca';

export * from '../dialect';

export const dialect: Dialect = resolveDialect();

type AnyPool = { kind: 'mysql'; pool: MySqlPool } | { kind: 'postgres'; pool: PgPool };

// Next dev-mode hot reload re-evaluates modules; without this the pool would be
// recreated on every edit until the database runs out of connections.
const globalForDb = globalThis as unknown as { __mdvPool?: AnyPool; __mdvPoolKey?: string };

/**
 * Postgres pool config for a connection string.
 *
 * `sslrootcert=<path>` is handled here rather than by pg. pg reads the path with
 * `fs.readFileSync` relative to the process CWD, which is the repo root under
 * `next dev` but not inside a deployed serverless function — and because the
 * cert is only ever named in a connection string, Next's output file tracing
 * never bundles it either. The result is an ENOENT the moment the first pool is
 * built, so every query fails in production while dev looks fine. Strip the
 * parameter and hand pg the inlined CA instead.
 */
function pgConnection(url: string): { connectionString: string; ssl?: object } {
  // A bare URL that names no root cert keeps pg's own sslmode handling.
  if (!/[?&]sslrootcert=/.test(url)) return { connectionString: url };

  const parsed = new URL(url);
  parsed.searchParams.delete('sslrootcert');
  // pg derives `ssl` from sslmode only when we don't supply one; dropping it
  // keeps the two from fighting over the same field.
  const verifyFull = parsed.searchParams.get('sslmode') === 'verify-full';
  parsed.searchParams.delete('sslmode');

  return {
    connectionString: parsed.toString(),
    ssl: {
      ca: SUPABASE_ROOT_CA,
      rejectUnauthorized: true,
      // verify-full also pins the hostname; pg checks it against `servername`.
      ...(verifyFull ? { servername: parsed.hostname } : {}),
    },
  };
}

async function getPool(): Promise<AnyPool> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local.');

  // Editing .env.local re-evaluates this module, so `dialect` tracks the new
  // value — but the cached pool would still point at the previous database, and
  // the SQL built for one dialect then gets sent to the other. Key the cache on
  // the target so a switch discards the old pool instead of silently reusing it.
  const key = `${dialect}:${url}`;
  if (globalForDb.__mdvPool && globalForDb.__mdvPoolKey === key) return globalForDb.__mdvPool;

  const stale = globalForDb.__mdvPool;
  if (stale) {
    globalForDb.__mdvPool = undefined;
    void Promise.resolve(stale.pool.end()).catch(() => {});
  }

  if (dialect === 'postgres') {
    const { Pool } = await import('pg');
    globalForDb.__mdvPool = {
      kind: 'postgres',
      pool: new Pool({ ...pgConnection(url), max: 10 }),
    };
  } else {
    const { createPool } = await import('mysql2/promise');
    globalForDb.__mdvPool = {
      kind: 'mysql',
      pool: createPool({
        uri: url,
        connectionLimit: 10,
        // Large GeoJSON payloads come back as text; without this mysql2 hands
        // back Buffers for some column types.
        charset: 'utf8mb4',
      }),
    };
  }
  globalForDb.__mdvPoolKey = key;
  return globalForDb.__mdvPool;
}

/**
 * SQL throughout this codebase is written with `?` placeholders. Postgres wants
 * `$1..$n`, so rewrite on the way out. Callers must not put a literal `?`
 * inside a string literal in their SQL.
 */
function toPgPlaceholders(sql: string): string {
  let i = 0;
  return sql.replace(/\?/g, () => `$${++i}`);
}

export async function query<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T[]> {
  const db = await getPool();
  if (db.kind === 'postgres') {
    const res = await db.pool.query(toPgPlaceholders(sql), params);
    return res.rows as T[];
  }
  const [rows] = await db.pool.query(sql, params);
  return rows as T[];
}

export async function queryOne<T = Record<string, unknown>>(
  sql: string,
  params: unknown[] = [],
): Promise<T | undefined> {
  return (await query<T>(sql, params))[0];
}
