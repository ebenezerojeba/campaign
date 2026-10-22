import { forwardRef, useId } from 'react';
import { AlertCircle, Check } from 'lucide-react';
import { cx } from '../../lib/format.js';

const inputBase =
  'block w-full rounded-[10px] border bg-white px-3.5 text-[16px] text-ink placeholder:text-slate-400 transition-colors ' +
  'focus:outline-none focus:ring-3 focus:ring-gold-500/45 focus:border-forest-900 disabled:bg-mist disabled:text-slate-500';

const borderFor = (error) => (error ? 'border-danger-700' : 'border-line-strong hover:border-slate-400');

export function FieldShell({ id, label, hint, error, optional, children, className }) {
  return (
    <div className={cx('flex flex-col gap-1.5', className)}>
      {label && (
        <label htmlFor={id} className="text-[15px] font-semibold text-forest-900">
          {label}
          {optional && <span className="ml-1.5 font-normal text-slate-500">(optional)</span>}
        </label>
      )}
      {hint && <p id={`${id}-hint`} className="-mt-0.5 text-sm text-slate-500">{hint}</p>}
      {children}
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  );
}

export function FieldError({ id, children }) {
  return (
    <p id={id} role="alert" className="flex items-start gap-1.5 text-sm font-medium text-danger-700">
      <AlertCircle className="mt-0.5 size-4 shrink-0" aria-hidden />
      <span>{children}</span>
    </p>
  );
}

const describedBy = (id, hint, error) => [hint && `${id}-hint`, error && `${id}-error`].filter(Boolean).join(' ') || undefined;

export const TextField = forwardRef(function TextField({ label, hint, error, optional, className, inputClassName, prefix, ...props }, ref) {
  const autoId = useId();
  const id = props.id ?? autoId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional} className={className}>
      <div className="relative">
        {prefix && <span className="pointer-events-none absolute inset-y-0 left-3.5 flex items-center text-slate-500">{prefix}</span>}
        <input
          ref={ref}
          id={id}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cx(inputBase, 'h-12', borderFor(error), prefix && 'pl-14', inputClassName)}
          {...props}
        />
      </div>
    </FieldShell>
  );
});

export const TextArea = forwardRef(function TextArea({ label, hint, error, optional, className, rows = 4, maxLength, value, ...props }, ref) {
  const autoId = useId();
  const id = props.id ?? autoId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional} className={className}>
      <textarea
        ref={ref}
        id={id}
        rows={rows}
        maxLength={maxLength}
        value={value}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(inputBase, 'py-3 leading-relaxed', borderFor(error))}
        {...props}
      />
      {maxLength && typeof value === 'string' && (
        <p className="self-end text-xs text-slate-500 tabular" aria-live="polite">{value.length}/{maxLength}</p>
      )}
    </FieldShell>
  );
});

export const SelectField = forwardRef(function SelectField({ label, hint, error, optional, className, options, placeholder, ...props }, ref) {
  const autoId = useId();
  const id = props.id ?? autoId;
  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional} className={className}>
      <select
        ref={ref}
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(id, hint, error)}
        className={cx(inputBase, 'h-12 appearance-none bg-[url("data:image/svg+xml,%3Csvg%20xmlns=%27http://www.w3.org/2000/svg%27%20viewBox=%270%200%2020%2020%27%20fill=%27%230E2A1C%27%3E%3Cpath%20d=%27M5.3%207.3a1%201%200%200%201%201.4%200L10%2010.6l3.3-3.3a1%201%200%201%201%201.4%201.4l-4%204a1%201%200%200%201-1.4%200l-4-4a1%201%200%200%201%200-1.4z%27/%3E%3C/svg%3E")] bg-[length:20px] bg-[right_12px_center] bg-no-repeat pr-10', borderFor(error))}
        {...props}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </FieldShell>
  );
});

// Large tappable checkbox/radio "chips" for option lists.
export function ChoiceGroup({ legend, hint, error, optional, type = 'checkbox', options, value, onChange, name, columns = 2, size = 'md' }) {
  const id = useId();
  const selected = type === 'checkbox' ? new Set(value ?? []) : value;
  const toggle = (v) => {
    if (type === 'radio') return onChange(v);
    const next = new Set(selected);
    if (next.has(v)) next.delete(v); else next.add(v);
    return onChange(options.map((o) => o.value).filter((x) => next.has(x)));
  };
  return (
    <fieldset aria-describedby={describedBy(id, hint, error)} aria-invalid={error ? true : undefined}>
      <legend className="text-[15px] font-semibold text-forest-900">
        {legend}
        {optional && <span className="ml-1.5 font-normal text-slate-500">(optional)</span>}
      </legend>
      {hint && <p id={`${id}-hint`} className="mt-1 text-sm text-slate-500">{hint}</p>}
      <div className={cx('mt-3 grid gap-2.5', columns === 1 ? 'grid-cols-1' : columns === 3 ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2')}>
        {options.map((o) => {
          const checked = type === 'checkbox' ? selected.has(o.value) : selected === o.value;
          return (
            <label
              key={o.value}
              className={cx(
                'group relative flex cursor-pointer items-center gap-3 rounded-[10px] border bg-white px-3.5 transition-colors',
                size === 'lg' ? 'py-3.5' : 'py-3',
                checked ? 'border-forest-900 bg-green-50 ring-1 ring-forest-900' : 'border-line-strong hover:border-slate-400',
                'has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-gold-500/50',
              )}
            >
              <input
                type={type}
                name={name}
                value={o.value}
                checked={checked}
                onChange={() => toggle(o.value)}
                className="peer sr-only"
              />
              <span
                aria-hidden
                className={cx(
                  'flex size-5 shrink-0 items-center justify-center border-2 transition-colors',
                  type === 'radio' ? 'rounded-full' : 'rounded-[5px]',
                  checked ? 'border-forest-900 bg-forest-900 text-white' : 'border-slate-400 bg-white',
                )}
              >
                {checked && (type === 'radio' ? <span className="size-2 rounded-full bg-white" /> : <Check className="size-3.5" strokeWidth={3} />)}
              </span>
              <span className="min-w-0">
                <span className="block text-[15px] font-medium leading-snug text-ink">{o.label}</span>
                {o.hint && <span className="block text-sm text-slate-500">{o.hint}</span>}
              </span>
            </label>
          );
        })}
      </div>
      {error && <div className="mt-2"><FieldError id={`${id}-error`}>{error}</FieldError></div>}
    </fieldset>
  );
}

export function Checkbox({ checked, onChange, children, error, id: givenId, description }) {
  const autoId = useId();
  const id = givenId ?? autoId;
  return (
    <div>
      <label htmlFor={id} className={cx('flex cursor-pointer items-start gap-3 rounded-[10px] border bg-white p-4 transition-colors', error ? 'border-danger-700' : checked ? 'border-forest-900 bg-green-50' : 'border-line-strong hover:border-slate-400', 'has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-gold-500/50')}>
        <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="sr-only" aria-invalid={error ? true : undefined} aria-describedby={error ? `${id}-error` : undefined} />
        <span aria-hidden className={cx('mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-[5px] border-2', checked ? 'border-forest-900 bg-forest-900 text-white' : 'border-slate-400 bg-white')}>
          {checked && <Check className="size-3.5" strokeWidth={3} />}
        </span>
        <span className="text-[15px] leading-relaxed text-ink">
          {children}
          {description && <span className="mt-1 block text-sm text-slate-500">{description}</span>}
        </span>
      </label>
      {error && <div className="mt-2"><FieldError id={`${id}-error`}>{error}</FieldError></div>}
    </div>
  );
}
