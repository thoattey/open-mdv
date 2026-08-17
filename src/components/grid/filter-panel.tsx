'use client';

import {
  Field,
  NumberField,
  Section,
  TextField,
  Toggle,
  ValueChips,
} from '@/components/console/fields';
import type { AddressFilters, Facets, ResidentFilters } from '@/lib/grid';

/**
 * The console's filter rail. Every control is a controlled input that writes one
 * key of the active filter object; the page owns the state and debounces it
 * before hitting the API, so nothing here needs to know about fetching.
 *
 * The controls themselves live in components/console/fields, shared with the
 * /business console.
 */

/** Narrow setter: `patch({ island: 'Male' })` merges into the current filters. */
type Patch<T> = (partial: Partial<T>) => void;

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
  return (
    <ValueChips
      label="Atoll"
      values={(facets?.atolls ?? []).map((a) => ({ value: a.code, n: countOf(a) }))}
      selected={selected}
      onChange={onChange}
    />
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
