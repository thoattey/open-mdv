'use client';

import { Section, TextField, Toggle, ValueChips } from '@/components/console/fields';
import type { BusinessFacets, BusinessFilters } from '@/lib/business';

/**
 * The /business filter rail. Same contract as the /grid rail: every control
 * writes one key of the filter object and the page owns the state.
 *
 * Entity type and registration status are free text in the registry export
 * rather than a fixed enum, so both are offered as chips built from whatever
 * the facets endpoint found in the table.
 */

export function BusinessFilterPanel({
  filters,
  patch,
  facets,
}: {
  filters: BusinessFilters;
  patch: (partial: Partial<BusinessFilters>) => void;
  facets: BusinessFacets | undefined;
}) {
  return (
    <>
      <Section title="Query">
        <TextField
          label="Free text"
          value={filters.q}
          onChange={(q) => patch({ q })}
          placeholder="name / reg no / upn / address"
        />
        <p className="text-[10px] text-[var(--mx-dim)]">
          % and _ act as wildcards in every text field.
        </p>
      </Section>

      <Section title="Entity">
        <TextField label="Name contains" value={filters.name} onChange={(name) => patch({ name })} />
        <TextField
          label="Registration no"
          value={filters.reg}
          onChange={(reg) => patch({ reg })}
          placeholder="C-0883/2017"
        />
        <TextField
          label="UPN"
          value={filters.upn}
          onChange={(upn) => patch({ upn })}
          placeholder="2017PV03901J"
        />
        <ValueChips
          label="Type"
          values={(facets?.types ?? []).map((t) => ({ value: t.value, n: t.n }))}
          selected={filters.types}
          onChange={(types) => patch({ types })}
        />
        <ValueChips
          label="Status"
          values={(facets?.statuses ?? []).map((s) => ({ value: s.value, n: s.n }))}
          selected={filters.statuses}
          onChange={(statuses) => patch({ statuses })}
        />
      </Section>

      <Section title="People">
        <TextField
          label="Officer name"
          value={filters.owner}
          onChange={(owner) => patch({ owner })}
          placeholder="director / shareholder"
        />
        <Toggle
          label="With officers only"
          hint="at least one person listed"
          on={filters.withOwners}
          onChange={(withOwners) => patch({ withOwners })}
        />
        <p className="text-[10px] text-[var(--mx-dim)]">
          An officer name search already implies this, so the toggle is ignored
          while the field above is filled.
        </p>
      </Section>

      <Section title="Address">
        <TextField
          label="Registered address"
          value={filters.address}
          onChange={(address) => patch({ address })}
          placeholder="M. MARINA BUILDING"
        />
      </Section>
    </>
  );
}
