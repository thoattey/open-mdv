#!/usr/bin/env node
/**
 * Quadtree scraper for raajje.app map layers.
 *
 * The upstream endpoint (`/map/api/layers.php`) hard-caps every bbox query at
 * 1000 features, so full coverage means recursively subdividing any tile that
 * comes back saturated. Tiles that return fewer than the cap are complete and
 * are never split.
 *
 * Output is NDJSON (one GeoJSON feature per line) plus a sidecar state file so
 * an interrupted run resumes from its pending tile queue instead of starting over.
 *
 *   node scripts/scrape.mjs                 # all layers
 *   node scripts/scrape.mjs parcels addresses
 *   node scripts/scrape.mjs --reset         # discard prior state
 */

import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

const BASE = 'https://raajje.app/map/api/layers.php';
const OUT_DIR = path.resolve(process.cwd(), '_scrape/data');

// Server-side LIMIT. A tile returning exactly this many features is saturated
// and its contents are assumed truncated.
const PAGE_CAP = 1000;

const CONCURRENCY = 4;
const RETRIES = 4;
const THROTTLE_MS = 120; // polite pacing between request starts
const MAX_DEPTH = 16;

// National extent, generous padding around the Maldives EEZ landmass.
const ROOT = { minLon: 72.4, minLat: -0.9, maxLon: 74.1, maxLat: 7.4 };
// Coarse seed grid. Ocean tiles return empty in one cheap request; only
// populated tiles ever get subdivided.
const SEED_STEP = 0.25;

/** Layers served whole, with no bbox parameter and no cap. */
const STATIC_LAYERS = [
  'atoll_boundaries',
  'administrative_atolls',
  'airports',
  'atoll_capitals',
  'island_names',
];

/** Layers that require a bbox and are subject to the 1000-feature cap. */
const TILED_LAYERS = ['parcels', 'house_parcels', 'plot_lines', 'addresses'];

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  let lastErr;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) await sleep(500 * 2 ** (attempt - 1));
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(120_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`${url} failed after ${RETRIES + 1} attempts: ${lastErr.message}`);
}

const bboxParam = (t) => `${t.minLon},${t.minLat},${t.maxLon},${t.maxLat}`;

function quarters(t) {
  const midLon = (t.minLon + t.maxLon) / 2;
  const midLat = (t.minLat + t.maxLat) / 2;
  return [
    { minLon: t.minLon, minLat: t.minLat, maxLon: midLon, maxLat: midLat, depth: t.depth + 1 },
    { minLon: midLon, minLat: t.minLat, maxLon: t.maxLon, maxLat: midLat, depth: t.depth + 1 },
    { minLon: t.minLon, minLat: midLat, maxLon: midLon, maxLat: t.maxLat, depth: t.depth + 1 },
    { minLon: midLon, minLat: midLat, maxLon: t.maxLon, maxLat: t.maxLat, depth: t.depth + 1 },
  ];
}

function seedTiles() {
  const tiles = [];
  for (let lon = ROOT.minLon; lon < ROOT.maxLon - 1e-9; lon += SEED_STEP) {
    for (let lat = ROOT.minLat; lat < ROOT.maxLat - 1e-9; lat += SEED_STEP) {
      tiles.push({
        minLon: +lon.toFixed(6),
        minLat: +lat.toFixed(6),
        maxLon: +(lon + SEED_STEP).toFixed(6),
        maxLat: +(lat + SEED_STEP).toFixed(6),
        depth: 0,
      });
    }
  }
  return tiles;
}

const statePath = (layer) => path.join(OUT_DIR, `${layer}.state.json`);
const dataPath = (layer) => path.join(OUT_DIR, `${layer}.ndjson`);

async function loadState(layer, reset) {
  if (!reset) {
    try {
      return JSON.parse(await readFile(statePath(layer), 'utf8'));
    } catch {
      /* no prior run */
    }
  }
  return { layer, queue: seedTiles(), seen: [], done: 0, saturated: 0 };
}

async function saveState(layer, state, seen) {
  const tmp = `${statePath(layer)}.tmp`;
  await writeFile(tmp, JSON.stringify({ ...state, seen: [...seen] }));
  await rename(tmp, statePath(layer));
}

async function scrapeStatic(layer) {
  process.stdout.write(`[${layer}] fetching (untiled)... `);
  const fc = await fetchJson(`${BASE}?layer=${layer}`);
  const features = fc.features ?? [];
  const out = createWriteStream(dataPath(layer));
  for (const f of features) out.write(`${JSON.stringify(f)}\n`);
  await new Promise((r) => out.end(r));
  console.log(`${features.length} features`);
  return features.length;
}

async function scrapeTiled(layer, reset) {
  const state = await loadState(layer, reset);
  const seen = new Set(state.seen);
  // Append on resume so features already written are preserved; the seen set
  // keeps the file free of duplicates across runs.
  const out = createWriteStream(dataPath(layer), { flags: reset ? 'w' : 'a' });

  const startedWith = seen.size;
  let lastLog = Date.now();
  let inFlight = 0;

  const work = async () => {
    while (state.queue.length > 0) {
      const tile = state.queue.pop();
      inFlight++;
      try {
        const fc = await fetchJson(`${BASE}?layer=${layer}&bbox=${bboxParam(tile)}`);
        const features = fc.features ?? [];

        for (const f of features) {
          const key = String(f.id ?? f.properties?.feature_id);
          if (seen.has(key)) continue;
          seen.add(key);
          out.write(`${JSON.stringify(f)}\n`);
        }

        if (features.length >= PAGE_CAP) {
          if (tile.depth >= MAX_DEPTH) {
            console.warn(
              `\n[${layer}] WARN saturated tile at max depth ${MAX_DEPTH}: ${bboxParam(tile)}`,
            );
          } else {
            state.saturated++;
            state.queue.push(...quarters(tile));
          }
        }
        state.done++;
      } catch (err) {
        console.error(`\n[${layer}] ERROR ${bboxParam(tile)}: ${err.message}`);
        // Re-queue once at the back so a transient failure is not a data hole.
        if (!tile.requeued) state.queue.unshift({ ...tile, requeued: true });
      } finally {
        inFlight--;
      }

      if (Date.now() - lastLog > 5000) {
        lastLog = Date.now();
        console.log(
          `[${layer}] tiles=${state.done} queue=${state.queue.length} split=${state.saturated} features=${seen.size}`,
        );
        await saveState(layer, state, seen);
      }
      await sleep(THROTTLE_MS);
    }
  };

  await Promise.all(Array.from({ length: CONCURRENCY }, work));
  void inFlight;

  await new Promise((r) => out.end(r));
  await saveState(layer, { ...state, queue: [] }, seen);
  console.log(
    `[${layer}] DONE tiles=${state.done} split=${state.saturated} features=${seen.size} (+${seen.size - startedWith})`,
  );
  return seen.size;
}

async function main() {
  const args = process.argv.slice(2);
  const reset = args.includes('--reset');
  const requested = args.filter((a) => !a.startsWith('--'));
  const all = [...STATIC_LAYERS, ...TILED_LAYERS];
  const layers = requested.length ? requested : all;

  for (const l of layers) {
    if (!all.includes(l)) throw new Error(`unknown layer: ${l}`);
  }

  await mkdir(OUT_DIR, { recursive: true });
  const summary = {};

  for (const layer of layers) {
    const t0 = Date.now();
    summary[layer] = STATIC_LAYERS.includes(layer)
      ? await scrapeStatic(layer)
      : await scrapeTiled(layer, reset);
    console.log(`[${layer}] ${((Date.now() - t0) / 1000).toFixed(1)}s\n`);
  }

  await writeFile(
    path.join(OUT_DIR, 'summary.json'),
    JSON.stringify({ scrapedAt: new Date().toISOString(), counts: summary }, null, 2),
  );
  console.log('SUMMARY', summary);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
