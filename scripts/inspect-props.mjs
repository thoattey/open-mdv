import { createReadStream } from 'node:fs';
import { createInterface } from 'node:readline';
import { readdir } from 'node:fs/promises';
import path from 'node:path';

const dir = path.resolve(process.cwd(), '_scrape/data');
for (const file of (await readdir(dir)).filter((f) => f.endsWith('.ndjson'))) {
  const keys = new Map();
  const geomTypes = new Set();
  let n = 0;
  const rl = createInterface({ input: createReadStream(path.join(dir, file)), crlfDelay: Infinity });
  for await (const line of rl) {
    if (!line.trim()) continue;
    const f = JSON.parse(line);
    geomTypes.add(f.geometry?.type);
    for (const [k, v] of Object.entries(f.properties ?? {})) {
      if (!keys.has(k)) keys.set(k, new Set());
      if (v !== null) keys.get(k).add(typeof v);
    }
    if (++n >= 4000) break;
  }
  console.log(`\n== ${file}  (sampled ${n})  geom=${[...geomTypes].join('|')}`);
  for (const [k, t] of keys) console.log(`   ${k}: ${[...t].join('|') || 'null'}`);
}
