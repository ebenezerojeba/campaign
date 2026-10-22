import { ChevronLeft, ChevronRight } from 'lucide-react';
import { cx, formatNumber } from '../lib/format.js';

export function PageHeader({ title, description, actions, children }) {
  return (
    <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {children}
        <h1 className="font-display text-3xl font-bold tracking-tight text-forest-900">{title}</h1>
        {description && <p className="mt-1 text-[15px] text-slate-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap gap-2">{actions}</div>}
    </div>
  );
}

export function Card({ title, description, actions, children, className, bodyClassName, id }) {
  return (
    <section aria-labelledby={title ? id ?? title.replace(/\W+/g, '-').toLowerCase() : undefined} className={cx('rounded-[var(--radius-lg)] border border-line bg-white', className)}>
      {(title || actions) && (
        <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
          <div>
            {title && <h2 id={id ?? title.replace(/\W+/g, '-').toLowerCase()} className="font-display text-lg font-semibold text-forest-900">{title}</h2>}
            {description && <p className="mt-0.5 text-sm text-slate-500">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      <div className={cx('p-5', bodyClassName)}>{children}</div>
    </section>
  );
}

export function StatTile({ label, value, tone = 'default', icon: Icon, hint }) {
  const tones = {
    default: 'text-forest-900',
    pending: 'text-gold-600',
    approved: 'text-green-700',
    rejected: 'text-danger-700',
  };
  return (
    <div className="rounded-[var(--radius-lg)] border border-line bg-white p-5">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        {Icon && <Icon className={cx('size-5', tones[tone])} aria-hidden />}
      </div>
      <p className="mt-3 font-display text-4xl font-bold tracking-tight text-forest-900 tabular">{formatNumber(value)}</p>
      {hint && <p className="mt-1 text-sm text-slate-500">{hint}</p>}
    </div>
  );
}

// Horizontal bar list: a chart that is also a readable table.
export function BarList({ items, max, valueLabel = (v) => formatNumber(v), className }) {
  const top = max ?? Math.max(1, ...items.map((i) => i.value));
  return (
    <ul className={cx('space-y-2.5', className)}>
      {items.map((item) => (
        <li key={item.label} className="grid grid-cols-[minmax(0,9.5rem)_1fr_auto] items-center gap-3 text-sm">
          <span className="truncate text-ink" title={item.label}>{item.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-mist" aria-hidden>
            <span className="block h-full rounded-full bg-green-600" style={{ width: `${Math.max(2, (item.value / top) * 100)}%` }} />
          </span>
          <span className="w-10 text-right font-semibold text-forest-900 tabular">{valueLabel(item.value)}</span>
        </li>
      ))}
    </ul>
  );
}

export function Pagination({ meta, onPage }) {
  if (!meta || meta.pages <= 1) return meta ? <p className="text-sm text-slate-500">{formatNumber(meta.total)} {meta.total === 1 ? 'record' : 'records'}</p> : null;
  const from = (meta.page - 1) * meta.limit + 1;
  const to = Math.min(meta.total, meta.page * meta.limit);
  return (
    <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-slate-500">Showing <span className="font-semibold text-ink tabular">{formatNumber(from)}–{formatNumber(to)}</span> of <span className="font-semibold text-ink tabular">{formatNumber(meta.total)}</span></p>
      <div className="flex items-center gap-1">
        <button type="button" onClick={() => onPage(meta.page - 1)} disabled={meta.page <= 1} className="inline-flex h-9 items-center gap-1 rounded-md border border-line-strong bg-white px-3 text-sm font-semibold text-forest-900 hover:bg-mist disabled:opacity-40" aria-label="Previous page">
          <ChevronLeft className="size-4" aria-hidden />Previous
        </button>
        <span className="px-3 text-sm text-slate-600 tabular">Page {meta.page} of {meta.pages}</span>
        <button type="button" onClick={() => onPage(meta.page + 1)} disabled={meta.page >= meta.pages} className="inline-flex h-9 items-center gap-1 rounded-md border border-line-strong bg-white px-3 text-sm font-semibold text-forest-900 hover:bg-mist disabled:opacity-40" aria-label="Next page">
          Next<ChevronRight className="size-4" aria-hidden />
        </button>
      </div>
    </nav>
  );
}

export const th = 'px-4 py-3 text-left text-xs font-semibold text-slate-500 whitespace-nowrap';
export const td = 'px-4 py-3.5 text-sm text-ink align-middle';
