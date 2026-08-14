'use client';

import type { AddressFilters, Facets, ResidentFilters } from '@/lib/grid';

/**
 * The console's filter rail. Every control is a controlled input that writes one
 * key of the active filter object; the page owns the state and debounces it
 * before hitting the API, so nothing here needs to know about fetching.
 */

/** Narrow setter: `patch({ island: 'Male' })` merges into the current filters. */
type Patch<T> = (partial: Partial<T>) => void;

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <fieldset className="border-t border-[var(--mx-line)] px-3 py-3">
      <legend className="mx-label px-1">{title}</legend>
      <div className="space-y-2.5">{children}</div>
    </fieldset>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mx-label mb-1 block">{label}</span>
      {children}
    </label>
  );
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  list,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  list?: string;
}) {
  return (
    <Field label={label}>
      <input
        className="mx-field"
        value={value}
        list={list}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        autoComplete="off"
        spellCheck={false}
      />
    </Field>
  );
}

function NumberField({
  label,
  value,
  onChange,
  placeholder,
  step,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  step?: string;
}) {
  return (
    <Field label={label}>
      <input
        type="number"
        step={step}
        className="mx-field"
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
      />
    </Field>
  );
}

function Toggle({
  label,
  hint,
  on,
  onChange,
}: {
  label: string;
  hint?: string;
  on: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!on)}
      className="flex w-full items-start gap-2 text-left"
      aria-pressed={on}
    >
      <span
        className="mt-px shrink-0 border px-1 leading-4"
        style={{
          borderColor: 'var(--mx-line)',
          color: on ? '#000' : 'var(--mx-dim)',
          background: on ? 'var(--mx-fg)' : 'transparent',
        }}
      >
        {on ? 'x' : ' '}
      </span>
      <span>
        <span className="block text-[11px] uppercase tracking-[0.12em]">{label}</span>
        {hint && <span className="block text-[10px] text-[var(--mx-dim)]">{hint}</span>}
      </span>
    </button>
  );
}

/** Atoll codes as toggle chips, annotated with how much data each holds. */
function AtollPicker({
  facets,
  selected,
  onChange,
  countOf,
}: {
  facets: Facets | undefined;
  selected: string[];
  onChange: (next: string[]) => void;
  countOf: (a: Facets['atolls'][number]) => number;
}) {
  const atolls = (facets?.atolls ?? []).filter((a) => countOf(a) > 0);
  if (!atolls.length) return <p className="text-[10px] text-[var(--mx-dim)]">awaiting facets…</p>;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="mx-label">Atoll</span>
        {selected.length > 0 && (
          <button
            type="button"
            className="text-[10px] uppercase text-[var(--mx-dim)] hover:text-[var(--mx-fg)]"
            onClick={() => onChange([])}
          >
            clear ({selected.length})
          </button>
        )}
      </div>
      <div className="flex flex-wrap gap-1">
        {atolls.map((a) => {
          const on = selected.includes(a.code);
          return (
            <button
              key={a.code}
              type="button"
              className="mx-chip"
              data-on={on}
              title={`${countOf(a).toLocaleString()} rows`}
              onClick={() =>
                onChange(on ? selected.filter((c) => c !== a.code) : [...selected, a.code])
              }
            >
              {a.code}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export function ResidentFilterPanel({
  filters,
  patch,
  facets,
}: {
  filters: ResidentFilters;
  patch: Patch<ResidentFilters>;
  facets: Facets | undefined;
}) {
  return (
    <>
      <Section title="Query">
        <TextField
          label="Free text"
          value={filters.q}
          onChange={(q) => patch({ q })}
          placeholder="name / id / address / island"
        />
        <p className="text-[10px] text-[var(--mx-dim)]">
          % and _ act as wildcards in every text field.
        </p>
      </Section>

      <Section title="Identity">
        <TextField label="Name contains" value={filters.name} onChange={(name) => patch({ name })} />
        <TextField label="ID number" value={filters.id} onChange={(id) => patch({ id })} />
        <Field label="Gender">
          <select
            className="mx-field"
            value={filters.gender}
            onChange={(e) => patch({ gender: e.target.value as ResidentFilters['gender'] })}
          >
            <option value="">any</option>
            <option value="M">male</option>
            <option value="F">female</option>
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Age min"
            value={filters.ageMin}
            onChange={(ageMin) => patch({ ageMin })}
            placeholder="0"
          />
          <NumberField
            label="Age max"
            value={filters.ageMax}
            onChange={(ageMax) => patch({ ageMax })}
            placeholder="120"
          />
        </div>
        <p className="text-[10px] text-[var(--mx-dim)]">
          Age is completed years today. Records with an unreadable DOB drop out
          of the set whenever either bound is set.
        </p>
      </Section>

      <Section title="Location">
        <TextField
          label="Address contains"
          value={filters.address}
          onChange={(address) => patch({ address })}
        />
        <TextField
          label="Island"
          value={filters.island}
          onChange={(island) => patch({ island })}
          list="mx-islands"
        />
        <AtollPicker
          facets={facets}
          selected={filters.atolls}
          onChange={(atolls) => patch({ atolls })}
          countOf={(a) => a.residents}
        />
        <Toggle
          label="Geo-linked only"
          hint="address resolves to a mapped house"
          on={filters.geoLinked}
          onChange={(geoLinked) => patch({ geoLinked })}
        />
      </Section>
    </>
  );
}

export function AddressFilterPanel({
  filters,
  patch,
  facets,
}: {
  filters: AddressFilters;
  patch: Patch<AddressFilters>;
  facets: Facets | undefined;
}) {
  return (
    <>
      <Section title="Query">
        <TextField
          label="Free text"
          value={filters.q}
          onChange={(q) => patch({ q })}
          placeholder="house / island"
        />
        <TextField
          label="House name"
          value={filters.hname}
          onChange={(hname) => patch({ hname })}
        />
      </Section>

      <Section title="Location">
        <TextField
          label="Island"
          value={filters.island}
          onChange={(island) => patch({ island })}
          list="mx-islands"
        />
        <AtollPicker
          facets={facets}
          selected={filters.atolls}
          onChange={(atolls) => patch({ atolls })}
          countOf={(a) => a.addresses}
        />
        <Toggle
          label="Occupied only"
          hint="at least one registered resident"
          on={filters.occupiedOnly}
          onChange={(occupiedOnly) => patch({ occupiedOnly })}
        />
      </Section>

      <Section title="Bounding box">
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Min lon"
            step="0.001"
            value={filters.minLon}
            onChange={(minLon) => patch({ minLon })}
            placeholder="72.6"
          />
          <NumberField
            label="Max lon"
            step="0.001"
            value={filters.maxLon}
            onChange={(maxLon) => patch({ maxLon })}
            placeholder="73.8"
          />
          <NumberField
            label="Min lat"
            step="0.001"
            value={filters.minLat}
            onChange={(minLat) => patch({ minLat })}
            placeholder="-0.7"
          />
          <NumberField
            label="Max lat"
            step="0.001"
            value={filters.maxLat}
            onChange={(maxLat) => patch({ maxLat })}
            placeholder="7.1"
          />
        </div>
        <p className="text-[10px] text-[var(--mx-dim)]">
          Any side may be left blank — it opens out to world bounds.
        </p>
      </Section>
    </>
  );
}

/** Island suggestions shared by both panels' island inputs. */
export function IslandDatalist({ islands }: { islands: string[] }) {
  return (
    <datalist id="mx-islands">
      {islands.map((i) => (
        <option key={i} value={i} />
      ))}
    </datalist>
  );
}
