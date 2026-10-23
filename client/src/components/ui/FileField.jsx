import { useId, useRef, useState } from 'react';
import { FileText, ImageUp, Loader2, RefreshCw, X } from 'lucide-react';
import { FieldError } from './Field.jsx';
import { formatBytes } from '../../../../shared/agentForm.js';
import { cx } from '../../lib/format.js';

// Upload control for one document: pick or photograph a file, see it, replace
// or remove it. `prepare(file)` checks and converts the file; it throws with a
// message for the applicant when the file is unusable.
export function FileField({ label, hint, rulesText, accept, value, onChange, prepare, error, onError, guidance, aspectClass = 'aspect-[4/5]' }) {
  const id = useId();
  const inputRef = useRef(null);
  const [busy, setBusy] = useState(false);
  const describedBy = [hint && `${id}-hint`, `${id}-rules`, error && `${id}-error`].filter(Boolean).join(' ');

  const choose = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow choosing the same file again after a fix
    if (!file) return;
    setBusy(true);
    onError(null);
    try {
      const prepared = await prepare(file);
      if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
      onChange(prepared);
    } catch (err) {
      onError(err.message || 'This file could not be used. Try another.');
    } finally {
      setBusy(false);
    }
  };

  const remove = () => {
    if (value?.previewUrl) URL.revokeObjectURL(value.previewUrl);
    onChange(null);
    inputRef.current?.focus();
  };

  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-[15px] font-semibold text-forest-900">{label}</label>
      {hint && <p id={`${id}-hint`} className="-mt-0.5 text-sm text-slate-500">{hint}</p>}
      <p id={`${id}-rules`} className="-mt-0.5 text-sm text-slate-500">{rulesText}</p>

      <input ref={inputRef} id={id} type="file" accept={accept} onChange={choose} className="peer sr-only" aria-describedby={describedBy} aria-invalid={error ? true : undefined} disabled={busy} />

      {value ? (
        <div className={cx('mt-1 flex flex-col gap-4 rounded-xl border bg-white p-3 sm:flex-row sm:items-center', error ? 'border-danger-700' : 'border-line-strong')}>
          {value.previewUrl ? (
            <img src={value.previewUrl} alt={`Preview of your ${label.toLowerCase()}`} className={cx('w-32 shrink-0 rounded-lg bg-mist object-cover ring-1 ring-line', aspectClass)} />
          ) : (
            <span className="flex size-20 shrink-0 items-center justify-center rounded-lg bg-mist text-forest-900"><FileText className="size-8" aria-hidden /></span>
          )}
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-ink">{value.originalName}</p>
            <p className="text-sm text-slate-500">
              {value.type === 'application/pdf' ? 'PDF' : `Photo, ${value.width} × ${value.height} pixels`} · {formatBytes(value.bytes)} to upload
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <label htmlFor={id} className="inline-flex h-10 cursor-pointer items-center gap-1.5 rounded-[10px] border border-line-strong bg-white px-3.5 text-sm font-semibold text-forest-900 hover:border-forest-900 peer-focus-visible:ring-3">
                <RefreshCw className="size-4" aria-hidden />Replace
              </label>
              <button type="button" onClick={remove} className="inline-flex h-10 items-center gap-1.5 rounded-[10px] px-3 text-sm font-semibold text-danger-700 hover:bg-danger-50">
                <X className="size-4" aria-hidden />Remove<span className="sr-only"> {label.toLowerCase()}</span>
              </button>
            </div>
          </div>
        </div>
      ) : (
        <label
          htmlFor={id}
          className={cx(
            'mt-1 flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-8 text-center transition-colors',
            'peer-focus-visible:ring-3 peer-focus-visible:ring-gold-500/50',
            error ? 'border-danger-700 bg-danger-50/40' : 'border-line-strong bg-white hover:border-forest-900 hover:bg-mist/50',
          )}
        >
          {busy ? <Loader2 className="size-8 animate-spin text-green-700" aria-hidden /> : <ImageUp className="size-8 text-green-700" aria-hidden />}
          <span className="font-semibold text-forest-900">{busy ? 'Checking your file…' : 'Choose a file or take a photo'}</span>
          {guidance && <span className="max-w-sm text-sm text-slate-500">{guidance}</span>}
        </label>
      )}
      <span className="sr-only" role="status" aria-live="polite">{busy ? 'Checking your file' : value ? `${label} added` : ''}</span>
      {error && <FieldError id={`${id}-error`}>{error}</FieldError>}
    </div>
  );
}
