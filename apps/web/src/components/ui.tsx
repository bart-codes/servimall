import type { ReactNode } from 'react';
import { STATUS_LABEL } from '../api';

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1 block text-xs text-ink/60">{hint}</span>}
    </label>
  );
}

export function Notice({ kind = 'error', children }: { kind?: 'error' | 'info' | 'ok'; children: ReactNode }) {
  const cls = { error: 'border-brick/40 bg-brick/5 text-brick', info: 'border-mist bg-lake-soft text-ink', ok: 'border-lake/40 bg-lake-soft text-lake-dark' }[kind];
  return (
    <p role={kind === 'error' ? 'alert' : 'status'} className={`rounded-md border px-3 py-2 text-sm ${cls}`}>
      {children}
    </p>
  );
}

export function Badge({ status }: { status: string }) {
  const tone =
    status === 'confirmed' || status === 'delivered' || status === 'completed'
      ? 'bg-lake-soft text-lake-dark'
      : status === 'pending_payment' || status === 'packed' || status === 'out_for_delivery'
        ? 'bg-sun-soft text-ink'
        : 'bg-brick/10 text-brick';
  return <span className={`inline-block rounded px-2 py-0.5 text-xs font-semibold ${tone}`}>{STATUS_LABEL[status] ?? status}</span>;
}

export const Loading = ({ text = 'Loading' }: { text?: string }) => <p className="py-8 text-center text-ink/60">{text}...</p>;

export function Tabs<T extends string>({ tabs, value, onChange }: { tabs: { id: T; label: string }[]; value: T; onChange: (t: T) => void }) {
  return (
    <div role="tablist" className="mb-4 flex gap-1 overflow-x-auto border-b border-mist">
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={`whitespace-nowrap px-4 py-2 text-sm font-semibold ${value === t.id ? 'border-b-2 border-lake text-lake-dark' : 'text-ink/60 hover:text-ink'}`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
