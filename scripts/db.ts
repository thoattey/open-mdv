#!/usr/bin/env tsx
/**
 * Database CLI for Raajje Atlas.
 *
 *   npm run db:migrate           apply the schema for the configured dialect
 *   npm run db:import            load _scrape/data/*.ndjson into the tables
 *   npm run db:seed              generate the synthetic residents directory
 *   npm run db:stats             row counts per table
 *   npm run db:reset             drop every table, then migrate
 *
 * Runs standalone (tsx), so it opens its own pool rather than importing the
 * Next-only `src/lib/db` module.
 */

import { createReadStream } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createInterface } from 'node:readline';
import path from 'node:path';

import { config } from 'dotenv';

import {
  geomFromGeoJson,
  resolveDialect,
  upsertClause,
  type Dialect,
} from '../src/lib/dialect';
import { LAYERS, coerceForColumn, type LayerDef } from '../src/lib/layers';

config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

const dialect: Dialect = resolveDialect();
const DATA_DIR = path.resolve(process.cwd(), '_scrape/data');

/* ---------------------------------------------------------------- connection */

type Runner = {
  exec: (sql: string, params?: unknown[]) => Promise<unknown[]>;
  end: () => Promise<void>;
};

async function connect(): Promise<Runner> {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local.');

  if (dialect === 'postgres') {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: url, max: 4 });
    return {
      exec: async (sql, params = []) => {
        let i = 0;
        const res = await pool.query(
          sql.replace(/\?/g, () => `$${++i}`),
          params,
        );
        return res.rows;
      },
      end: () => pool.end(),
    };
  }

  const { createPool } = await import('mysql2/promise');
  const pool = createPool({ uri: url, connectionLimit: 4, charset: 'utf8mb4' });
  return {
    exec: async (sql, params = []) => {
      const [rows] = await pool.query(sql, params);
      return Array.isArray(rows) ? (rows as unknown[]) : [];
    },
    end: () => pool.end(),
  };
}

/* ------------------------------------------------------------------- migrate */

/** Split a schema file into individual statements, ignoring `--` comment lines. */
function splitStatements(sql: string): string[] {
  return sql
    .split('\n')
    .filter((line) => !line.trimStart().startsWith('--'))
    .join('\n')
    .split(';')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function migrate(db: Runner) {
  const file = path.resolve(process.cwd(), `db/schema.${dialect}.sql`);
  const statements = splitStatements(await readFile(file, 'utf8'));
  console.log(`[migrate] ${dialect}: applying ${statements.length} statements`);
  for (const stmt of statements) {
    try {
      await db.exec(stmt);
    } catch (err) {
      console.error(`\n[migrate] FAILED:\n${stmt}\n`);
      throw err;
    }
  }
  console.log('[migrate] done');
}

async function reset(db: Runner) {
  const tables = [...LAYERS.map((l) => l.table), 'residents'];
  console.log(`[reset] dropping ${tables.length} tables`);
  if (dialect === 'mysql') await db.exec('SET FOREIGN_KEY_CHECKS = 0');
  for (const t of tables) await db.exec(`DROP TABLE IF EXISTS ${t}`);
  if (dialect === 'mysql') await db.exec('SET FOREIGN_KEY_CHECKS = 1');
  await migrate(db);
}

/* -------------------------------------------------------------------- import */

// Batches are bounded by row count *and* serialized size: a single atoll
// MultiPolygon can be hundreds of kilobytes, and MySQL rejects any packet over
// max_allowed_packet (4MB by default).
const MAX_ROWS_PER_BATCH = 400;
const MAX_BYTES_PER_BATCH = 2_000_000;

interface Batch {
  rows: unknown[][];
  bytes: number;
}

function insertSql(layer: LayerDef, rowCount: number): string {
  const cols = ['id', ...layer.columns.map((c) => c.column), 'geom'];
  const geomExpr = geomFromGeoJson(dialect);
  const placeholders = `(${['?', ...layer.columns.map(() => '?'), geomExpr].join(', ')})`;
  const values = Array.from({ length: rowCount }, () => placeholders).join(', ');
  const updatable = [...layer.columns.map((c) => c.column), 'geom'];
  return (
    `INSERT INTO ${layer.table} (${cols.join(', ')}) VALUES ${values} ` +
    upsertClause(dialect, 'id', updatable)
  );
}

async function flush(db: Runner, layer: LayerDef, batch: Batch) {
  if (batch.rows.length === 0) return;
  await db.exec(insertSql(layer, batch.rows.length), batch.rows.flat());
  batch.rows = [];
  batch.bytes = 0;
}

async function importLayer(db: Runner, layer: LayerDef) {
  const file = path.join(DATA_DIR, `${layer.key}.ndjson`);
  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });

  const batch: Batch = { rows: [], bytes: 0 };
  let count = 0;
  let skipped = 0;
  const t0 = Date.now();

  for await (const line of rl) {
    if (!line.trim()) continue;
    const feature = JSON.parse(line) as {
      id?: number;
      properties?: Record<string, unknown>;
      geometry?: unknown;
    };
    if (!feature.geometry) {
      skipped++;
      continue;
    }

    const geom = JSON.stringify(feature.geometry);
    const props = feature.properties ?? {};
    const row: unknown[] = [
      feature.id ?? Number(props.feature_id),
      ...layer.columns.map((c) => coerceForColumn(props[c.prop], c.type)),
      geom,
    ];

    batch.rows.push(row);
    batch.bytes += geom.length;
    count++;

    if (batch.rows.length >= MAX_ROWS_PER_BATCH || batch.bytes >= MAX_BYTES_PER_BATCH) {
      await flush(db, layer, batch);
      process.stdout.write(`\r[import] ${layer.key}: ${count}`);
    }
  }
  await flush(db, layer, batch);

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(
    `\r[import] ${layer.key}: ${count} rows in ${secs}s` +
      (skipped ? ` (${skipped} skipped, no geometry)` : ''),
  );
}

async function importAll(db: Runner, only: string[]) {
  const targets = only.length ? LAYERS.filter((l) => only.includes(l.key)) : LAYERS;
  if (targets.length === 0) throw new Error(`no layers matched: ${only.join(', ')}`);
  for (const layer of targets) await importLayer(db, layer);
}

async function importResidents(db: Runner) {
  const file = path.join(DATA_DIR, 'residents.ndjson');
  console.log('[import-residents] clearing existing residents table...');
  await db.exec('DELETE FROM residents');

  const rl = createInterface({ input: createReadStream(file), crlfDelay: Infinity });

  const COLUMNS = ['id_no', 'full_name', 'dob', 'gender', 'permanent_address', 'island', 'atoll'];
  const BATCH = 500;
  const upsert = upsertClause(dialect, 'id_no', COLUMNS.slice(1));

  let batch: unknown[][] = [];
  let count = 0;
  const t0 = Date.now();

  const flushBatch = async () => {
    if (batch.length === 0) return;
    const values = batch.map(() => `(${COLUMNS.map(() => '?').join(', ')})`).join(', ');
    await db.exec(
      `INSERT INTO residents (${COLUMNS.join(', ')}) VALUES ${values} ${upsert}`,
      batch.flat()
    );
    count += batch.length;
    batch = [];
    process.stdout.write(`\r[import-residents] residents: ${count}`);
  };

  for await (const line of rl) {
    if (!line.trim()) continue;
    const r = JSON.parse(line);
    batch.push([
      r.id_no,
      r.full_name || r.name || null,
      r.dob || r.date_of_birth || null,
      r.gender || null,
      r.permanent_address || r.address || null,
      r.island || null,
      r.atoll || null
    ]);

    if (batch.length >= BATCH) {
      await flushBatch();
    }
  }
  await flushBatch();

  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`\n[import-residents] DONE: ${count} residents imported in ${secs}s`);
}

/* --------------------------------------------------------------------- stats */

async function stats(db: Runner) {
  const tables = [...LAYERS.map((l) => l.table), 'residents'];
  console.log(`\n${'table'.padEnd(24)}rows`);
  console.log('-'.repeat(34));
  let total = 0;
  for (const t of tables) {
    try {
      const rows = (await db.exec(`SELECT COUNT(*) AS c FROM ${t}`)) as { c: number | string }[];
      const c = Number(rows[0]?.c ?? 0);
      total += c;
      console.log(`${t.padEnd(24)}${c.toLocaleString()}`);
    } catch {
      console.log(`${t.padEnd(24)}(missing)`);
    }
  }
  console.log('-'.repeat(34));
  console.log(`${'total'.padEnd(24)}${total.toLocaleString()}\n`);
}

/* ---------------------------------------------------------------------- main */

async function main() {
  const [cmd = 'help', ...rest] = process.argv.slice(2);
  const db = await connect();
  try {
    switch (cmd) {
      case 'migrate':
        await migrate(db);
        break;
      case 'reset':
        await reset(db);
        break;
      case 'import':
        await importAll(db, rest);
        break;
      case 'import-residents':
        await importResidents(db);
        break;
      case 'stats':
        await stats(db);
        break;
      default:
        console.log('usage: tsx scripts/db.ts <migrate|reset|import [layer...]|import-residents|stats>');
        process.exitCode = 1;
    }
  } finally {
    await db.end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
