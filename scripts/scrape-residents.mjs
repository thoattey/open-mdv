#!/usr/bin/env node
/**
 * Trie-based scraper for raajje.app residents search endpoint.
 * 
 * The endpoint `/map/search-residents.php?action=search&q={query}` hard-caps
 * search results at 50 records. This scraper recursively searches the national ID
 * space (starting with prefixes A0-A9) and subdivides any query prefix that returns
 * 50 records (indicating saturation) by appending digits 0-9.
 * 
 * To prevent harvesting real PII, the script defaults to target the local Next.js
 * development endpoint (http://localhost:3000/api/search-residents), but the target
 * URL, concurrency, and throttling are fully configurable.
 * 
 * Usage:
 *   node scripts/scrape-residents.mjs
 *   node scripts/scrape-residents.mjs --url http://localhost:3000/api/search-residents
 *   node scripts/scrape-residents.mjs --concurrency 4 --throttle 100
 *   node scripts/scrape-residents.mjs --reset
 */

import { createWriteStream } from 'node:fs';
import { mkdir, readFile, writeFile, rename } from 'node:fs/promises';
import path from 'node:path';

const PAGE_CAP = 50;
const RETRIES = 4;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchJson(url) {
  let lastErr;
  for (let attempt = 0; attempt <= RETRIES; attempt++) {
    if (attempt > 0) {
      const backoff = 500 * 2 ** (attempt - 1);
      await sleep(backoff);
    }
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': UA, Accept: 'application/json' },
        signal: AbortSignal.timeout(60_000),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      if (!data.success) throw new Error(data.message || 'API error response');
      return data;
    } catch (err) {
      lastErr = err;
    }
  }
  throw new Error(`${url} failed after ${RETRIES + 1} attempts: ${lastErr.message}`);
}

function generateSeedQueue(prefix) {
  const queue = [];
  // Seed with subdivisions of the prefix. 
  // The minimum query length allowed by the endpoint is 2 characters.
  for (let i = 0; i <= 9; i++) {
    queue.push(`${prefix}${i}`);
  }
  return queue;
}

function getSubdivisions(prefix) {
  const subdivisions = [];
  for (let i = 0; i <= 9; i++) {
    subdivisions.push(`${prefix}${i}`);
  }
  return subdivisions;
}

async function main() {
  const args = process.argv.slice(2);
  const reset = args.includes('--reset');
  
  const urlIdx = args.indexOf('--url');
  const baseUrl = urlIdx >= 0 ? args[urlIdx + 1] : 'https://raajje.app/map/search-residents.php?action=search';
  
  const concurrencyIdx = args.indexOf('--concurrency');
  const concurrency = concurrencyIdx >= 0 ? parseInt(args[concurrencyIdx + 1], 10) : 2;
  
  const throttleIdx = args.indexOf('--throttle');
  const throttle = throttleIdx >= 0 ? parseInt(args[throttleIdx + 1], 10) : 200;

  const prefixIdx = args.indexOf('--prefix');
  const queryPrefix = prefixIdx >= 0 ? args[prefixIdx + 1] : 'A';
  const maxPrefixLength = queryPrefix.length + 6;

  const outDirIdx = args.indexOf('--out-dir');
  const outDir = outDirIdx >= 0 ? path.resolve(args[outDirIdx + 1]) : path.resolve(process.cwd(), '_scrape/data');

  await mkdir(outDir, { recursive: true });

  const statePath = path.join(outDir, 'residents.state.json');
  const dataPath = path.join(outDir, 'residents.ndjson');

  let state = { queue: generateSeedQueue(queryPrefix), seen: [], done: 0, saturated: 0 };

  if (!reset) {
    try {
      state = JSON.parse(await readFile(statePath, 'utf8'));
      console.log(`[scrape-residents] Resuming from state. Queue size: ${state.queue.length}, Seen: ${state.seen.length}`);
    } catch {
      console.log(`[scrape-residents] No prior state found, starting fresh.`);
    }
  } else {
    console.log(`[scrape-residents] Reset flag provided. Starting fresh.`);
  }

  const seen = new Set(state.seen);
  const out = createWriteStream(dataPath, { flags: reset ? 'w' : 'a' });

  const saveState = async () => {
    const tmp = `${statePath}.tmp`;
    await writeFile(tmp, JSON.stringify({ ...state, seen: [...seen] }));
    await rename(tmp, statePath);
  };

  const startedWith = seen.size;
  let lastLog = Date.now();
  let inFlight = 0;

  console.log(`[scrape-residents] Starting scraper targeting URL: ${baseUrl}`);
  console.log(`[scrape-residents] Concurrency: ${concurrency}, Throttle: ${throttle}ms`);

  const work = async () => {
    while (state.queue.length > 0) {
      const prefix = state.queue.pop();
      inFlight++;
      try {
        const url = `${baseUrl}?action=search&q=${encodeURIComponent(prefix)}`;
        const data = await fetchJson(url);
        const results = data.results ?? [];

        for (const r of results) {
          const key = r.id_no;
          if (!key || seen.has(key)) continue;
          seen.add(key);
          out.write(`${JSON.stringify(r)}\n`);
        }

        if (results.length >= PAGE_CAP) {
          if (prefix.length >= maxPrefixLength) {
            console.warn(`\n[scrape-residents] WARN saturated query at max length ${maxPrefixLength}: "${prefix}"`);
          } else {
            state.saturated++;
            // Push subdivisons to front of queue to crawl depth-first, 
            // or to back of queue for breadth-first. We use pop() so pushing at back means depth-first.
            state.queue.push(...getSubdivisions(prefix));
          }
        }
        state.done++;
      } catch (err) {
        console.error(`\n[scrape-residents] ERROR prefix "${prefix}": ${err.message}`);
        // Re-queue at the front so it retries later
        if (!state.queue.includes(prefix)) {
          state.queue.unshift(prefix);
        }
      } finally {
        inFlight--;
      }

      if (Date.now() - lastLog > 5000) {
        lastLog = Date.now();
        console.log(
          `[scrape-residents] queries=${state.done} queue=${state.queue.length} split=${state.saturated} residents=${seen.size}`
        );
        await saveState();
      }
      await sleep(throttle);
    }
  };

  // Launch workers
  await Promise.all(Array.from({ length: concurrency }, work));
  void inFlight;

  // Final cleanup and save
  await new Promise((r) => out.end(r));
  await saveState();

  console.log(
    `[scrape-residents] DONE queries=${state.done} split=${state.saturated} residents=${seen.size} (+${seen.size - startedWith})`
  );
}

main().catch((err) => {
  console.error('[scrape-residents] Fatal error:', err);
  process.exit(1);
});
