import { forwardRef, useEffect, useId, useMemo, useRef, useState } from 'react';
import { ChevronDown, Loader2, X } from 'lucide-react';
import { FieldShell, inputBase, borderFor, describedBy } from './Field.jsx';
import { cx } from '../../lib/format.js';

const MAX_SHOWN = 200;

// Case- and accent-insensitive, ignoring punctuation, so "ifako ijaye" finds "Ifako-Ijaye".
const fold = (s) => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();

// Searchable single-select (WAI-ARIA 1.2 combobox with a listbox popup).
// Only listed options can be chosen; typing filters, it never becomes the value.
export const Combobox = forwardRef(function Combobox({
  label, hint, error, optional, className, options, value, onChange, onBlur, name,
  placeholder = 'Type to search', disabled, loading, loadingText = 'Loading options', emptyText = 'No matches. Check the spelling and try again.',
}, ref) {
  const id = useId();
  const listId = `${id}-list`;
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);

  const selected = options.find((o) => o.value === value);
  const filtered = useMemo(() => {
    const q = fold(query);
    if (!q) return options;
    return options.filter((o) => fold(`${o.label} ${o.description ?? ''}`).includes(q));
  }, [options, query]);
  const shown = filtered.slice(0, MAX_SHOWN);

  useEffect(() => {
    if (!open || active < 0) return;
    listRef.current?.querySelector(`[data-index="${active}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const setRefs = (node) => {
    inputRef.current = node;
    if (typeof ref === 'function') ref(node); else if (ref) ref.current = node;
  };

  const openList = () => {
    if (disabled || loading) return;
    setOpen(true);
    setActive(Math.max(0, shown.findIndex((o) => o.value === value)));
  };
  const close = () => { setOpen(false); setQuery(''); setActive(-1); };
  const choose = (o) => { onChange(o.value); close(); };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (!open) openList(); else setActive((i) => Math.min(shown.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (open) setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Home' && open) {
      setActive(0);
    } else if (e.key === 'End' && open) {
      setActive(shown.length - 1);
    } else if (e.key === 'Enter') {
      if (open && shown[active]) { e.preventDefault(); choose(shown[active]); }
    } else if (e.key === 'Escape') {
      if (open) { e.preventDefault(); close(); }
    } else if (e.key === 'Tab' && open) {
      close();
    }
  };

  const display = open ? query : selected?.label ?? '';
  const statusText = loading ? loadingText : open ? `${filtered.length} ${filtered.length === 1 ? 'option' : 'options'}` : '';

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional} className={className}>
      <div className="relative">
        <input
          ref={setRefs}
          id={id}
          name={name}
          type="text"
          role="combobox"
          autoComplete="off"
          autoCapitalize="off"
          spellCheck={false}
          aria-autocomplete="list"
          aria-expanded={open}
          aria-controls={listId}
          aria-activedescendant={open && shown[active] ? `${id}-opt-${active}` : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          aria-busy={loading || undefined}
          disabled={disabled || loading}
          placeholder={loading ? `${loadingText}…` : selected ? selected.label : placeholder}
          value={display}
          onChange={(e) => { setQuery(e.target.value); setOpen(true); setActive(0); }}
          onFocus={openList}
          onClick={openList}
          onKeyDown={onKeyDown}
          onBlur={() => { close(); onBlur?.(); }}
          className={cx(inputBase, 'h-12 pr-16', borderFor(error))}
        />
        <span className="absolute inset-y-0 right-2 flex items-center gap-0.5">
          {loading ? (
            <Loader2 className="mr-1.5 size-5 animate-spin text-slate-400" aria-hidden />
          ) : (
            <>
              {optional && value && !disabled && (
                <button
                  type="button"
                  tabIndex={-1}
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={() => { onChange(''); inputRef.current?.focus(); }}
                  className="rounded-md p-1.5 text-slate-500 hover:bg-mist hover:text-ink"
                >
                  <X className="size-4" aria-hidden /><span className="sr-only">Clear {label}</span>
                </button>
              )}
              <ChevronDown className={cx('mr-1.5 size-5 text-forest-900 transition-transform', open && 'rotate-180', disabled && 'opacity-40')} aria-hidden />
            </>
          )}
        </span>

        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label={label}
          hidden={!open}
          className="absolute inset-x-0 top-full z-40 mt-1.5 max-h-72 overflow-y-auto overscroll-contain rounded-[10px] border border-line-strong bg-white py-1 shadow-soft"
        >
          {shown.map((o, i) => (
            <li
              key={o.value}
              id={`${id}-opt-${i}`}
              data-index={i}
              role="option"
              aria-selected={o.value === value}
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => choose(o)}
              onMouseMove={() => active !== i && setActive(i)}
              className={cx(
                'flex cursor-pointer items-baseline justify-between gap-3 px-3.5 py-2.5 text-[15px] leading-snug',
                i === active ? 'bg-green-50 text-forest-900' : 'text-ink',
                o.value === value && 'font-semibold',
              )}
            >
              <span className="min-w-0">{o.label}</span>
              {o.description && <span className="shrink-0 text-xs text-slate-500 tabular">{o.description}</span>}
            </li>
          ))}
          {filtered.length === 0 && <li role="presentation" className="px-3.5 py-3 text-sm text-slate-500">{emptyText}</li>}
          {filtered.length > MAX_SHOWN && (
            <li role="presentation" className="px-3.5 py-2 text-xs text-slate-500">Showing {MAX_SHOWN} of {filtered.length}. Keep typing to narrow the list.</li>
          )}
        </ul>
      </div>
      <span className="sr-only" role="status" aria-live="polite">{statusText}</span>
    </FieldShell>
  );
});
