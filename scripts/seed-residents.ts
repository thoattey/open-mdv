#!/usr/bin/env tsx
/**
 * Generates the synthetic residents directory backing the search box.
 *
 * The site this clones exposes a live national ID register at
 * `search-residents.php` — real names, ID numbers, dates of birth and home
 * addresses. None of that is scraped or reproduced here. This script instead
 * fabricates records from a fixed name pool, combined with island and house
 * names drawn from the public cadastral layers, so the search UI and API can be
 * exercised end-to-end against realistic-shaped but entirely made-up data.
 *
 * ID numbers deliberately use a `SYN-` prefix so a synthetic record can never be
 * mistaken for a real one.
 *
 *   npm run db:seed -- --count 25000
 */

import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import path from 'node:path';

import { config } from 'dotenv';

import { resolveDialect, upsertClause, type Dialect } from '../src/lib/dialect';

config({ path: '.env.local', quiet: true });
config({ path: '.env', quiet: true });

const dialect: Dialect = resolveDialect();
const DATA_DIR = path.resolve(process.cwd(), '_scrape/data');

const GIVEN = [
  'Ahmed', 'Ali', 'Mohamed', 'Ibrahim', 'Hassan', 'Hussain', 'Adam', 'Yoosuf',
  'Abdulla', 'Ismail', 'Shifaz', 'Nasheed', 'Rifau', 'Sameer', 'Nazim',
  'Aishath', 'Fathimath', 'Mariyam', 'Hawwa', 'Khadheeja', 'Aminath', 'Shaziya',
  'Zeenath', 'Raushan', 'Nashida', 'Sofiya', 'Leena', 'Hudha', 'Yumna',
];
const MIDDLE = [
  'Faris', 'Shareef', 'Naseem', 'Latheef', 'Rasheed', 'Waheed', 'Saeed',
  'Manik', 'Didi', 'Fulhu', 'Zahir', 'Nizar', 'Haleem', 'Areef', 'Sodiq',
];
const FAMILY = [
  'Maumoon', 'Haneef', 'Hashim', 'Adnan', 'Zahir', 'Naseer', 'Latheef',
  'Rasheed', 'Shakir', 'Fulhu', 'Didi', 'Manik', 'Waheed', 'Nazeer', 'Solih',
];

/** Deterministic PRNG so reseeding produces a stable dataset. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function readNdjson(file: string): Promise<Record<string, unknown>[]> {
  const out: Record<string, unknown>[] = [];
  const rl = createInterface({
    input: createReadStream(path.join(DATA_DIR, file)),
    crlfDelay: Infinity,
  });
  for await (const line of rl) {
    if (line.trim()) out.push(JSON.parse(line).properties ?? {});
  }
  return out;
}

async function main() {
  const args = process.argv.slice(2);
  const countIdx = args.indexOf('--count');
  const total = countIdx >= 0 ? Number(args[countIdx + 1]) : 25_000;

  const rand = mulberry32(20260811);
  const pick = <T,>(arr: T[]): T => arr[Math.floor(rand() * arr.length)];

  // Islands and house names come from the public cadastral layers, so the
  // synthetic addresses at least point at places that exist.
  const islands = (await readNdjson('island_names.ndjson'))
    .map((p) => ({
      island: String(p.IslandName ?? ''),
      atoll: String(p.Atoll ?? ''),
      category: String(p.category ?? ''),
    }))
    .filter((x) => x.island && x.category === 'Inhabited');

  const addresses = await readNdjson('addresses.ndjson');
  const byIsland = new Map<string, string[]>();
  for (const a of addresses) {
    const island = String(a.IslandName ?? '');
    const hname = String(a.hname ?? '');
    if (!island || !hname) continue;
    if (!byIsland.has(island)) byIsland.set(island, []);
    const list = byIsland.get(island)!;
    if (list.length < 400) list.push(hname);
  }

  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL is not set. Copy .env.example to .env.local.');

  let exec: (sql: string, params: unknown[]) => Promise<unknown>;
  let end: () => Promise<void>;

  if (dialect === 'postgres') {
    const { Pool } = await import('pg');
    const pool = new Pool({ connectionString: url, max: 4 });
    exec = (sql, params) => {
      let i = 0;
      return pool.query(
        sql.replace(/\?/g, () => `$${++i}`),
        params,
      );
    };
    end = () => pool.end();
  } else {
    const { createPool } = await import('mysql2/promise');
    const pool = createPool({ uri: url, connectionLimit: 4, charset: 'utf8mb4' });
    exec = (sql, params) => pool.query(sql, params);
    end = () => pool.end();
  }

  const COLUMNS = ['id_no', 'full_name', 'dob', 'gender', 'permanent_address', 'island', 'atoll'];
  const BATCH = 500;
  const upsert = upsertClause(dialect, 'id_no', COLUMNS.slice(1));

  try {
    let written = 0;
    let batch: unknown[][] = [];

    const flush = async () => {
      if (!batch.length) return;
      const values = batch.map(() => `(${COLUMNS.map(() => '?').join(', ')})`).join(', ');
      await exec(
        `INSERT INTO residents (${COLUMNS.join(', ')}) VALUES ${values} ${upsert}`,
        batch.flat(),
      );
      written += batch.length;
      batch = [];
      process.stdout.write(`\r[seed] residents: ${written}`);
    };

    for (let i = 1; i <= total; i++) {
      const place = pick(islands);
      const houses = byIsland.get(place.island);
      const address = houses?.length
        ? pick(houses)
        : `${pick(FAMILY)} ${pick(['Villa', 'Manzil', 'Ge', 'House'])}`;

      const female = rand() < 0.49;
      const name = [
        pick(female ? GIVEN.slice(15) : GIVEN.slice(0, 15)),
        pick(MIDDLE),
        pick(FAMILY),
      ].join(' ');

      const year = 1940 + Math.floor(rand() * 68);
      const month = 1 + Math.floor(rand() * 12);
      const day = 1 + Math.floor(rand() * 28);

      batch.push([
        `SYN-${String(i).padStart(6, '0')}`,
        name,
        `${month}/${day}/${String(year).slice(2)}`,
        female ? 'F' : 'M',
        address,
        place.island,
        place.atoll,
      ]);

      if (batch.length >= BATCH) await flush();
    }
    await flush();
    console.log(`\n[seed] done — ${written} synthetic residents`);
  } finally {
    await end();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
