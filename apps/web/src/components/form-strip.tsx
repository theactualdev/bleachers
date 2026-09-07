'use client';

export type FormResult = 'W' | 'D' | 'L';

/** Colour per result. Exported so the mapping is unit-testable without a DOM. */
export function formChipClass(r: FormResult): string {
  if (r === 'W') return 'bg-brand/15 text-brand border-brand/30';
  if (r === 'L') return 'bg-negative/15 text-negative border-negative/30';
  return 'bg-glass text-ink-2 border-hairline';
}

/**
 * Last results, most recent first — the shape `TeamStats.form` already arrives in.
 * Capped at five: a form strip is a glance, not a history.
 */
export function FormStrip({ form }: { form: FormResult[] }) {
  if (form.length === 0) return null;
  return (
    <div className="flex items-center gap-1">
      {form.slice(0, 5).map((r, i) => (
        <span
          key={i}
          className={`flex h-6 w-6 items-center justify-center rounded-md border text-[11px] font-bold ${formChipClass(r)}`}
        >
          {r}
        </span>
      ))}
    </div>
  );
}
