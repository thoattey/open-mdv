'use client';

/**
 * Form primitives for the terminal consoles (/grid and /business).
 *
 * Every control here is presentational: it renders one labelled slab in the
 * phosphor treatment and reports changes upward. The page owns the filter state
 * and the debouncing, so nothing in this file knows about fetching.
 */

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

/**
 * A facet as toggle chips: one per distinct value, annotated with how many rows
 * carry it. Values with no rows are dropped rather than shown disabled — an
 * empty chip is only noise in a rail this narrow.
 */
function ValueChips({
  label,
  values,
  selected,
  onChange,
  pending = 'awaiting facets…',
}: {
  label: string;
  values: { value: string; n: number }[];
  selected: string[];
  onChange: (next: string[]) => void;
  /** Shown in place of the chips while the facet list is still empty. */
  pending?: string;
}) {
  const live = values.filter((v) => v.n > 0);
  if (!live.length) return <p className="text-[10px] text-[var(--mx-dim)]">{pending}</p>;

  return (
    <div>
      <div className="mb-1 flex items-center justify-between">
        <span className="mx-label">{label}</span>
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
        {live.map((v) => {
          const on = selected.includes(v.value);
          return (
            <button
              key={v.value}
              type="button"
              className="mx-chip"
              data-on={on}
              title={`${v.n.toLocaleString()} rows`}
              onClick={() =>
                onChange(on ? selected.filter((c) => c !== v.value) : [...selected, v.value])
              }
            >
              {v.value}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export { Field, NumberField, Section, TextField, Toggle, ValueChips };
