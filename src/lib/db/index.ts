import 'server-only';

import type { Pool as MySqlPool } from 'mysql2/promise';
import type { Pool as PgPool } from 'pg';

import { resolveDialect, type Dialect } from '../dialect';

export * from '../dialect';

export const dialect: Dialect = resolveDialect();

type AnyPool = { kind: 'mysql'; pool: MySqlPool } | { kind: 'postgres'; pool: PgPool };

// Next dev-mode hot reload re-evaluates modules; without this the pool would be
// recreated on every edit until the database runs out of connections.
const globalForDb = globalThis as unknown as { __mdvPool?: AnyPool };

async function getPool(): Promise<AnyPool> {
  if (globalForDb.__mdvPool) return globalForDb.__mdvPool;

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local.');

  if (dialect === 'postgres') {
    const { Pool } = await import('pg');
    globalForDb.__mdvPool = {
      kind: 'postgres',
      pool: new Pool({ connectionString: url, max: 10 }),
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
