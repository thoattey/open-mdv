'use client';

import {
  Check,
  Copy,
  Home,
  Loader2,
  MapPin,
  MapPinned,
  Plane,
  Search,
  Square,
  User,
  Users,
  X,
  type LucideIcon,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import type { FeatureHit } from '@/components/map/map-view';
import type { ResidentResult } from '@/components/map/search-box';
import { ageFromDob, formatAgeGender, formatDob, genderLabel } from '@/lib/dob';
import { UI_LAYERS } from '@/lib/map-config';
import { cn } from '@/lib/utils';

const LAYER_LABEL = new Map(UI_LAYERS.map((l) => [l.key, l.label]));
// Result groups that aren't map layers (e.g. a picked resident) get their label
// here so the panel header still reads correctly.
const EXTRA_LABEL: Record<string, string> = { resident: 'Resident' };

function labelFor(key: string): string {
  return EXTRA_LABEL[key] ?? LAYER_LABEL.get(key) ?? key;
}

/** Header icon per result kind, so the panel is identifiable at a glance. */
const LAYER_ICON: Record<string, LucideIcon> = {
  resident: User,
  addresses: Home,
  house_parcels: Home,
  island_names: MapPinned,
  atoll_capitals: MapPinned,
  administrative_atolls: MapPinned,
  airports: Plane,
};

/** Per-layer field ordering and human labels for the detail list. Anything not
 *  listed is hidden, so internal ids and empty upstream columns stay out.
 *  `format` also receives the whole property bag, for fields that read a
 *  sibling column (age is derived from `dob` but shown on the gender row). */
interface FieldSpec {
  prop: string;
  label: string;
  format?: (v: string, props: Record<string, unknown>) => string;
}

const FIELD_SPEC: Record<string, FieldSpec[]> = {
  resident: [
    { prop: 'id_no', label: 'ID Number' },
    { prop: 'dob', label: 'Date of birth', format: (v) => formatDob(v) },
    {
      prop: 'gender',
      label: 'Age / Gender',
      format: (v, p) => formatAgeGender(p.dob as string | null, v),
    },
    { prop: 'permanent_address', label: 'Address' },
    { prop: 'island', label: 'Island' },
    { prop: 'atoll', label: 'Atoll' },
  ],
  parcels: [
    { prop: 'Category', label: 'Category' },
    { prop: 'Shape_Area', label: 'Area', format: (v) => `${Number(v).toLocaleString()} m²` },
  ],
  house_parcels: [
    { prop: 'hname', label: 'House name' },
    { prop: 'Category', label: 'Category' },
    { prop: 'area_sqm', label: 'Area', format: (v) => `${Number(v).toLocaleString()} m²` },
    { prop: 'block_code', label: 'Block' },
  ],
  addresses: [
    { prop: 'hname', label: 'House name' },
    { prop: 'IslandName', label: 'Island' },
    { prop: 'Atoll', label: 'Atoll' },
  ],
  island_names: [
    { prop: 'IslandName', label: 'Island' },
    { prop: 'Atoll', label: 'Atoll' },
    { prop: 'category', label: 'Status' },
    { prop: 'v01', label: 'Population' },
  ],
  administrative_atolls: [
    { prop: 'Name_Engli', label: 'Name' },
    { prop: 'Name_Offic', label: 'Official' },
    { prop: 'Name_Capit', label: 'Capital' },
    { prop: 'cityStatus', label: 'Status' },
    { prop: 'V01', label: 'Population' },
  ],
  atoll_capitals: [
    { prop: 'islandName', label: 'Capital' },
    { prop: 'atoll', label: 'Atoll' },
  ],
  airports: [
    { prop: 'Aerodrome', label: 'Airport' },
    { prop: 'Three_lett', label: 'IATA' },
    { prop: 'Four_Lette', label: 'ICAO' },
    { prop: 'Internatio', label: 'International', format: (v) => (v === '1' ? 'Yes' : 'No') },
  ],
  plot_lines: [{ prop: 'block_code', label: 'Block' }],
  atoll_boundaries: [{ prop: 'name', label: 'Boundary' }],
};

function titleFor(hit: FeatureHit): string {
  const p = hit.properties;
  switch (hit.layer) {
    case 'resident':
      return String(p.full_name || 'Resident');
    case 'addresses':
    case 'house_parcels':
      return String(p.hname || 'Address');
    case 'island_names':
      return String(p.IslandName || 'Island');
    case 'administrative_atolls':
      return String(p.Name_Engli || 'Atoll');
    case 'atoll_capitals':
      return String(p.islandName || 'Capital');
    case 'airports':
      return String(p.Aerodrome || 'Airport');
    case 'parcels':
      return `${p.Category || 'Parcel'}`;
    default:
      return labelFor(hit.layer);
  }
}

/** Island / atoll line under the title, when the record carries one. */
function subtitleFor(hit: FeatureHit): string {
  const p = hit.properties;
  const parts = [p.IslandName ?? p.island ?? p.islandName, p.Atoll ?? p.atoll];
  return parts
    .map((v) => (v === null || v === undefined ? '' : String(v).trim()))
    .filter(Boolean)
    .join(' · ');
}

/** Props already spoken for by the panel header (title + subtitle). The leading
 *  record hides them so the field list doesn't repeat what's above it. */
const HEADER_PROPS = new Set([
  'full_name',
  'hname',
  'IslandName',
  'islandName',
  'island',
  'Name_Engli',
  'Aerodrome',
  'Atoll',
  'atoll',
]);

interface FeatureSheetProps {
  hits: FeatureHit[] | null;
  coordinate: [number, number] | null;
  /** For a picked resident whose address was resolved: how it was matched. */
  locationNote?: string | null;
  /** For a picked address: everyone registered there (null when not applicable). */
  residents?: ResidentResult[] | null;
  residentsLoading?: boolean;
  onClose: () => void;
}

export function FeatureSheet({
  hits,
  coordinate,
  locationNote,
  residents,
  residentsLoading,
  onClose,
}: FeatureSheetProps) {
  const open = !!hits && hits.length > 0;
  const head = open ? hits![0] : null;
  const HeadIcon = head ? (LAYER_ICON[head.layer] ?? Square) : Square;
  const subtitle = head ? subtitleFor(head) : '';

  // Escape closes the panel — it now covers the map on small screens, so a
  // keyboard exit matters more than it did for the old floating card.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  return (
    <aside
      aria-hidden={!open}
      className={cn(
        'glass absolute inset-y-0 left-0 z-30 flex w-full flex-col border-y-0 border-l-0 shadow-2xl transition-transform duration-300 ease-out sm:w-[24rem] lg:w-[26rem]',
        open ? 'translate-x-0' : 'pointer-events-none -translate-x-full',
      )}
    >
      {open && head && (
        <>
          {/* Padded clear of the floating logo / search bar that sits above. */}
          <header className="flex items-start gap-3 border-b border-border/60 px-4 pb-4 pt-16">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary">
              <HeadIcon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[11px] font-semibold uppercase tracking-wide text-primary">
                {labelFor(head.layer)}
              </p>
              <h2 className="truncate text-lg font-semibold leading-tight" title={titleFor(head)}>
                {titleFor(head)}
              </h2>
              {subtitle && (
                <p className="truncate text-xs text-muted-foreground" title={subtitle}>
                  {subtitle}
                </p>
              )}
            </div>
            <button
              onClick={onClose}
              aria-label="Close"
              className="rounded-full p-1.5 text-muted-foreground transition hover:bg-accent hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </header>

          <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4">
            {hits!.slice(0, 6).map((hit, i) => (
              <FeatureBlock
                key={i}
                hit={hit}
                showLayer={hits!.length > 1}
                hideHeaderProps={i === 0}
              />
            ))}

            {(residentsLoading || residents) && (
              <ResidentList residents={residents ?? []} loading={!!residentsLoading} />
            )}
          </div>

          <footer className="border-t border-border/60 px-4 py-3">
            {locationNote && (
              <p className="mb-2 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <MapPin className="size-3 shrink-0 text-primary" />
                {locationNote}
              </p>
            )}
            {coordinate && <CoordinateRow coordinate={coordinate} />}
          </footer>
        </>
      )}
    </aside>
  );
}

/** Latitude/longitude with a one-click copy, for pasting into other tools. */
function CoordinateRow({ coordinate }: { coordinate: [number, number] }) {
  const [copied, setCopied] = useState(false);
  const text = `${coordinate[1].toFixed(6)}, ${coordinate[0].toFixed(6)}`;

  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(t);
  }, [copied]);

  return (
    <div className="flex items-center justify-between gap-2">
      <span className="font-mono text-[11px] text-muted-foreground">{text}</span>
      <button
        onClick={() => {
          navigator.clipboard?.writeText(text).then(
            () => setCopied(true),
            () => undefined,
          );
        }}
        aria-label="Copy coordinates"
        className="flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] text-muted-foreground transition hover:bg-accent hover:text-foreground"
      >
        {copied ? <Check className="size-3 text-primary" /> : <Copy className="size-3" />}
        {copied ? 'Copied' : 'Copy'}
      </button>
    </div>
  );
}

/** Everyone registered at a picked address. */
function ResidentList({ residents, loading }: { residents: ResidentResult[]; loading: boolean }) {
  const [filter, setFilter] = useState('');

  const counts = useMemo(() => {
    let male = 0;
    let female = 0;
    for (const r of residents) {
      if (r.gender === 'M') male++;
      else if (r.gender === 'F') female++;
    }
    return { male, female };
  }, [residents]);

  const shown = useMemo(() => {
    const q = filter.trim().toLowerCase();
    if (!q) return residents;
    return residents.filter(
      (r) => r.full_name.toLowerCase().includes(q) || r.id_no.toLowerCase().includes(q),
    );
  }, [residents, filter]);

  const synthetic = residents.some((r) => r.id_no.startsWith('SYN-'));

  return (
    <section>
      <div className="mb-2 flex items-center gap-2">
        <Users className="size-4 shrink-0 text-primary" />
        <h3 className="text-sm font-semibold">Residents</h3>
        {loading ? (
          <Loader2 className="size-3.5 animate-spin text-muted-foreground" />
        ) : (
          <span className="rounded-full bg-accent px-2 py-0.5 text-[11px] font-semibold tabular-nums">
            {residents.length}
          </span>
        )}
      </div>

      {!loading && residents.length > 0 && (
        <p className="mb-2 text-xs text-muted-foreground">
          {counts.male} male · {counts.female} female
        </p>
      )}

      {/* A filter only earns its space once the list stops fitting on screen. */}
      {!loading && residents.length > 8 && (
        <div className="mb-2 flex h-9 items-center gap-2 rounded-xl border border-border/60 bg-background/40 px-3">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            placeholder="Filter by name or ID"
            className="w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
          />
          {filter && (
            <button onClick={() => setFilter('')} aria-label="Clear filter">
              <X className="size-3.5 text-muted-foreground" />
            </button>
          )}
        </div>
      )}

      {loading && <ResidentSkeleton />}

      {!loading && residents.length === 0 && (
        <p className="rounded-xl border border-dashed border-border/70 px-3 py-4 text-center text-xs text-muted-foreground">
          No residents registered at this address
        </p>
      )}

      {!loading && residents.length > 0 && shown.length === 0 && (
        <p className="px-1 py-3 text-center text-xs text-muted-foreground">
          No resident matches “{filter}”
        </p>
      )}

      <ul className="space-y-1.5">
        {shown.map((r) => (
          <ResidentRow key={r.id_no} resident={r} />
        ))}
      </ul>

      {synthetic && (
        <p className="mt-3 rounded-lg bg-muted/60 px-2.5 py-1.5 text-[11px] leading-snug text-muted-foreground">
          Synthetic records — generated sample data, not real people.
        </p>
      )}
    </section>
  );
}

function ResidentRow({ resident }: { resident: ResidentResult }) {
  const age = ageFromDob(resident.dob);
  const gender = genderLabel(resident.gender);

  return (
    <li className="flex items-center gap-3 rounded-xl border border-border/50 bg-background/40 px-3 py-2.5">
      <span
        className={cn(
          'flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
          resident.gender === 'F'
            ? 'bg-violet-500/15 text-violet-600 dark:text-violet-300'
            : 'bg-sky-500/15 text-sky-600 dark:text-sky-300',
        )}
        aria-hidden
      >
        {initials(resident.full_name)}
      </span>

      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm font-medium" title={resident.full_name}>
          {resident.full_name}
        </span>
        <span className="block truncate text-[11px] text-muted-foreground">
          {[age !== null ? `${age} Y` : '', gender, formatDob(resident.dob)]
            .filter(Boolean)
            .join(' · ')}
        </span>
      </span>

      <span className="shrink-0 rounded-md bg-accent/70 px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
        {resident.id_no}
      </span>
    </li>
  );
}

function ResidentSkeleton() {
  return (
    <ul className="space-y-1.5">
      {[0, 1, 2].map((i) => (
        <li
          key={i}
          className="flex items-center gap-3 rounded-xl border border-border/50 px-3 py-2.5"
        >
          <span className="size-9 shrink-0 animate-pulse rounded-full bg-accent" />
          <span className="flex-1 space-y-1.5">
            <span className="block h-3 w-2/5 animate-pulse rounded bg-accent" />
            <span className="block h-2.5 w-3/5 animate-pulse rounded bg-accent/70" />
          </span>
        </li>
      ))}
    </ul>
  );
}

/** First and last initials — "Adam Shuzain" -> "AS". */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0] ?? '';
  const last = parts.length > 1 ? (parts[parts.length - 1][0] ?? '') : '';
  return (first + last).toUpperCase();
}

function FeatureBlock({
  hit,
  showLayer,
  hideHeaderProps,
}: {
  hit: FeatureHit;
  showLayer: boolean;
  hideHeaderProps: boolean;
}) {
  const spec = FIELD_SPEC[hit.layer] ?? [];
  const rows = spec
    .filter((f) => !(hideHeaderProps && HEADER_PROPS.has(f.prop)))
    .map((f) => {
      const raw = hit.properties[f.prop];
      if (raw === null || raw === undefined || raw === '') return null;
      const value = f.format ? f.format(String(raw), hit.properties) : String(raw);
      return { label: f.label, value };
    })
    .filter((r): r is { label: string; value: string } => r !== null);

  if (rows.length === 0) return null;

  return (
    <section>
      {showLayer && (
        <h3 className="mb-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {labelFor(hit.layer)}
        </h3>
      )}
      <dl className="overflow-hidden rounded-xl border border-border/50 bg-background/40">
        {rows.map((r) => (
          <div
            key={r.label}
            className="flex items-baseline justify-between gap-4 border-b border-border/40 px-3 py-2 last:border-b-0"
          >
            <dt className="shrink-0 text-xs text-muted-foreground">{r.label}</dt>
            <dd className="min-w-0 truncate text-right text-sm font-medium" title={r.value}>
              {r.value}
            </dd>
          </div>
        ))}
      </dl>
    </section>
  );
}
