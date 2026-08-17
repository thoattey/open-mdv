'use client';

import { useCallback, useRef, useState } from 'react';

import {
  IMPORT_CHUNK_SIZE,
  parseBusinessPayload,
  type ImportIssue,
  type ImportResponse,
  type NormalisedBusiness,
} from '@/lib/business-import';

/**
 * Batch import for the business register.
 *
 * The operator picks a JSON export and the panel parses it here, in the
 * browser, before anything is sent: that turns a malformed file into an
 * immediate message instead of a failed upload, and gives an accurate record
 * count to size the progress bar with. The server re-runs the identical parser
 * on every chunk — this pass is a convenience, not a check the API relies on.
 *
 * The upload itself is chunked and sequential. One request per
 * IMPORT_CHUNK_SIZE records keeps each body small enough for any host's limit,
 * and a serial loop means a failure stops at a known point rather than leaving
 * an unknown subset of parallel requests half-applied.
 */

interface Loaded {
  fileName: string;
  /** Bytes on disk, for the readout. */
  size: number;
  records: NormalisedBusiness[];
  skipped: ImportIssue[];
  owners: number;
}

interface Progress {
  sent: number;
  total: number;
  written: number;
  owners: number;
  /** Records the server refused, accumulated across chunks. */
  skipped: number;
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}

export function ImportPanel() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [parseError, setParseError] = useState<string | null>(null);
  const [progress, setProgress] = useState<Progress | null>(null);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  const reset = () => {
    setLoaded(null);
    setParseError(null);
    setProgress(null);
    setResult(null);
    setFailure(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const onPick = useCallback(async (file: File | undefined) => {
    setLoaded(null);
    setParseError(null);
    setProgress(null);
    setResult(null);
    setFailure(null);
    if (!file) return;

    try {
      // The whole file lands in memory. Registry exports are text-only, so even
      // a national dump is tens of megabytes — well inside what a tab holds.
      const parsed = parseBusinessPayload(JSON.parse(await file.text()));
      setLoaded({
        fileName: file.name,
        size: file.size,
        records: parsed.records,
        skipped: parsed.skipped,
        owners: parsed.records.reduce((n, r) => n + r.owners.length, 0),
      });
    } catch (err) {
      setParseError(err instanceof Error ? err.message : 'could not read that file');
    }
  }, []);

  const run = useCallback(async () => {
    if (!loaded) return;
    setRunning(true);
    setResult(null);
    setFailure(null);

    const total = loaded.records.length;
    const tally: Progress = { sent: 0, total, written: 0, owners: 0, skipped: 0 };
    setProgress({ ...tally });
    const started = Date.now();

    try {
      for (let i = 0; i < total; i += IMPORT_CHUNK_SIZE) {
        const chunk = loaded.records.slice(i, i + IMPORT_CHUNK_SIZE);
        const res = await fetch('/api/admin/import-businesses', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          // Chunks are already normalised; the server normalises again anyway,
          // and the normalised shape is a strict subset of what it accepts.
          body: JSON.stringify(chunk.map(toSourceShape)),
        });
        const body = (await res.json().catch(() => ({}))) as Partial<ImportResponse> & {
          error?: string;
        };
        if (!res.ok) throw new Error(body.error ?? `chunk failed with ${res.status}`);

        tally.sent += chunk.length;
        tally.written += body.written ?? 0;
        tally.owners += body.owners ?? 0;
        tally.skipped += body.skipped?.length ?? 0;
        setProgress({ ...tally });
      }

      const secs = ((Date.now() - started) / 1000).toFixed(1);
      setResult(
        `${tally.written.toLocaleString()} entities and ${tally.owners.toLocaleString()} officers written in ${secs}s` +
          (tally.skipped ? ` · ${tally.skipped} refused by the server` : ''),
      );
    } catch (err) {
      setFailure(err instanceof Error ? err.message : 'import failed');
    } finally {
      setRunning(false);
    }
  }, [loaded]);

  const pct = progress && progress.total ? Math.round((progress.sent / progress.total) * 100) : 0;

  return (
    <div className="mx-boot min-h-0 flex-1 overflow-auto bg-black/60 px-3 py-4">
      <div className="max-w-3xl space-y-4">
        {/* ------------------------------------------------------------ pick -- */}
        <section className="mx-panel px-3 py-3">
          <p className="mx-label mb-2">1 · Choose a registry export</p>
          <input
            ref={inputRef}
            type="file"
            accept=".json,application/json"
            className="mx-field"
            disabled={running}
            onChange={(e) => void onPick(e.target.files?.[0])}
          />
          <p className="mt-2 text-[10px] text-[var(--mx-dim)]">
            A JSON array of records — or an object wrapping one under{' '}
            <code>businesses</code>, <code>records</code> or <code>data</code>. Each record needs a{' '}
            <code>name</code>; <code>type</code>, <code>status</code>,{' '}
            <code>registration_no</code>, <code>detail_url</code>, <code>upn</code>,{' '}
            <code>address</code>, <code>owner_entity</code> and an <code>owners</code> array of{' '}
            <code>{'{ name, role, date }'}</code> are all optional.
          </p>
        </section>

        {parseError && (
          <p className="border border-[var(--mx-danger)] px-3 py-2 text-[11px]"
             style={{ color: 'var(--mx-danger)' }}>
            {parseError}
          </p>
        )}

        {/* --------------------------------------------------------- preview -- */}
        {loaded && (
          <section className="mx-panel px-3 py-3">
            <p className="mx-label mb-2">2 · Review</p>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-[11px] sm:grid-cols-4">
              <Stat label="File" value={loaded.fileName} />
              <Stat label="Size" value={formatBytes(loaded.size)} />
              <Stat label="Entities" value={loaded.records.length.toLocaleString()} />
              <Stat label="Officers" value={loaded.owners.toLocaleString()} />
            </dl>

            {loaded.skipped.length > 0 && (
              <div className="mt-3 border-t border-[var(--mx-line)] pt-2">
                <p className="text-[10px]" style={{ color: 'var(--mx-danger)' }}>
                  {loaded.skipped.length.toLocaleString()} record
                  {loaded.skipped.length === 1 ? '' : 's'} will be skipped:
                </p>
                <ul className="mt-1 space-y-0.5 text-[10px] text-[var(--mx-dim)]">
                  {loaded.skipped.slice(0, 5).map((s) => (
                    <li key={s.index}>
                      index {s.index} — {s.reason}
                    </li>
                  ))}
                  {loaded.skipped.length > 5 && <li>…and {loaded.skipped.length - 5} more</li>}
                </ul>
              </div>
            )}

            <p className="mt-3 text-[10px] text-[var(--mx-dim)]">
              Importing is idempotent: a record&apos;s key comes from its registration number
              (else UPN, else name), so re-running the same file updates rows in place instead of
              duplicating them. Officers dropped from a newer export are removed.
            </p>

            <div className="mt-3 flex flex-wrap items-center gap-2">
              <button
                className="mx-btn"
                disabled={running || loaded.records.length === 0}
                onClick={() => void run()}
              >
                {running ? 'importing…' : `import ${loaded.records.length.toLocaleString()} entities`}
              </button>
              <button className="mx-btn" disabled={running} onClick={reset}>
                clear
              </button>
            </div>
          </section>
        )}

        {/* -------------------------------------------------------- progress -- */}
        {progress && (
          <section className="mx-panel px-3 py-3">
            <p className="mx-label mb-2">3 · Writing</p>
            <div
              className="h-2 w-full border"
              style={{ borderColor: 'var(--mx-line)' }}
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div
                className="h-full transition-[width]"
                style={{ width: `${pct}%`, background: 'var(--mx-fg)' }}
              />
            </div>
            <p className="mt-2 text-[11px] text-[var(--mx-dim)]">
              {progress.sent.toLocaleString()} / {progress.total.toLocaleString()} sent · {pct}% ·{' '}
              {progress.written.toLocaleString()} written · {progress.owners.toLocaleString()}{' '}
              officers
            </p>

            {result && (
              <p className="mt-2 text-[11px] text-[var(--mx-bright)]">&gt; done. {result}</p>
            )}
            {failure && (
              <p className="mt-2 text-[11px]" style={{ color: 'var(--mx-danger)' }}>
                &gt; stopped after {progress.sent.toLocaleString()} records — {failure}. Records
                already written are kept; re-running the same file resumes safely.
              </p>
            )}
          </section>
        )}

        <p className="text-[10px] text-[var(--mx-dim)]">
          Imported entities appear immediately at <code>/business</code>. This register is
          public-record data from the national business registry and is not subject to the censor
          gate that covers residents.
        </p>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="mx-label">{label}</dt>
      <dd className="truncate text-[var(--mx-bright)]" title={value}>
        {value}
      </dd>
    </div>
  );
}

/**
 * Turns a normalised record back into the source shape the API parses.
 *
 * The alternative — posting the normalised form and having the server detect
 * it — would mean two accepted input shapes on the endpoint, and the second one
 * would only ever be exercised by this panel. One shape is worth the re-parse.
 */
function toSourceShape(r: NormalisedBusiness) {
  return {
    name: r.name,
    type: r.type ?? '',
    status: r.status ?? '',
    registration_no: r.registration_no ?? '',
    detail_url: r.detail_url ?? '',
    upn: r.upn ?? '',
    address: r.address ?? '',
    owner_entity: r.owner_entity ?? '',
    owners: r.owners.map((o) => ({
      name: o.owner_name,
      role: o.owner_role ?? '',
      date: o.appointed_on ?? '',
    })),
  };
}
