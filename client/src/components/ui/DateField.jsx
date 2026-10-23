import { forwardRef, useEffect, useId, useRef, useState } from 'react';
import { CalendarDays } from 'lucide-react';
import { FieldShell, inputBase, borderFor, describedBy } from './Field.jsx';
import { cx } from '../../lib/format.js';

const isoToDisplay = (iso) => (/^\d{4}-\d{2}-\d{2}$/.test(iso ?? '') ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '');

// Inserts the slashes as the person types digits: 17051990 -> 17/05/1990.
function formatTyped(raw) {
  const digits = raw.replace(/\D/g, '').slice(0, 8);
  if (digits.length <= 2) return digits;
  if (digits.length <= 4) return `${digits.slice(0, 2)}/${digits.slice(2)}`;
  return `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
}

// A date typed as DD/MM/YYYY or picked from the device calendar. The form
// value is YYYY-MM-DD once all eight digits are in; anything shorter is passed
// through as typed so validation can explain what is missing.
export const DateField = forwardRef(function DateField({ label, hint, error, optional, className, value, onChange, onBlur, name, max, min }, ref) {
  const id = useId();
  const pickerRef = useRef(null);
  const [text, setText] = useState(() => isoToDisplay(value) || (value ?? ''));

  // Follow outside changes, such as a restored draft or a form reset.
  useEffect(() => {
    const shown = isoToDisplay(value);
    if (shown && shown !== text) setText(shown);
    if (!value && text) setText('');
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  const commit = (display) => {
    setText(display);
    const digits = display.replace(/\D/g, '');
    onChange(digits.length === 8 ? `${digits.slice(4)}-${digits.slice(2, 4)}-${digits.slice(0, 2)}` : display);
  };

  const openPicker = () => {
    const picker = pickerRef.current;
    if (!picker) return;
    try {
      picker.showPicker();
    } catch {
      picker.focus(); // older browsers: focusing the native date input opens it
    }
  };

  return (
    <FieldShell id={id} label={label} hint={hint} error={error} optional={optional} className={className}>
      <div className="relative">
        <input
          ref={ref}
          id={id}
          name={name}
          type="text"
          inputMode="numeric"
          autoComplete="bday"
          placeholder="DD/MM/YYYY"
          maxLength={10}
          value={text}
          onChange={(e) => commit(formatTyped(e.target.value))}
          onBlur={onBlur}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(id, hint, error)}
          className={cx(inputBase, 'h-12 pr-14 tabular tracking-wide', borderFor(error))}
        />
        <button
          type="button"
          onClick={openPicker}
          className="absolute inset-y-1 right-1 flex w-11 items-center justify-center rounded-lg text-forest-900 hover:bg-mist focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-gold-500/45"
        >
          <CalendarDays className="size-5" aria-hidden />
          <span className="sr-only">Choose {label.toLowerCase()} from a calendar</span>
        </button>
        {/* The device's own date picker, opened by the button above. */}
        <input
          ref={pickerRef}
          type="date"
          tabIndex={-1}
          aria-hidden
          max={max}
          min={min}
          value={/^\d{4}-\d{2}-\d{2}$/.test(value ?? '') ? value : ''}
          onChange={(e) => { if (e.target.value) commit(isoToDisplay(e.target.value)); }}
          className="pointer-events-none absolute bottom-0 right-0 h-px w-px opacity-0"
        />
      </div>
    </FieldShell>
  );
});
