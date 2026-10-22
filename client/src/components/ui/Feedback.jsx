import { useEffect, useRef } from 'react';
import { AlertTriangle, CheckCircle2, Info, XCircle, Loader2, X } from 'lucide-react';
import { cx } from '../../lib/format.js';
import { Button } from './Button.jsx';

const ALERT = {
  info: { cls: 'bg-info-50 border-[#c9d9ef] text-info-700', Icon: Info },
  success: { cls: 'bg-green-50 border-green-100 text-green-700', Icon: CheckCircle2 },
  warning: { cls: 'bg-gold-50 border-gold-200 text-[#6f5610]', Icon: AlertTriangle },
  error: { cls: 'bg-danger-50 border-[#f1c9c4] text-danger-700', Icon: XCircle },
};

export function Alert({ tone = 'info', title, children, action, className }) {
  const { cls, Icon } = ALERT[tone];
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={cx('flex gap-3 rounded-xl border p-4', cls, className)}>
      <Icon className="mt-0.5 size-5 shrink-0" aria-hidden />
      <div className="min-w-0 flex-1 text-[15px] leading-relaxed">
        {title && <p className="font-semibold">{title}</p>}
        {children && <div className={cx(title && 'mt-0.5', 'text-ink/85')}>{children}</div>}
        {action && <div className="mt-3">{action}</div>}
      </div>
    </div>
  );
}

const BADGE = {
  pending: 'bg-gold-50 text-[#6f5610] ring-gold-200',
  approved: 'bg-green-50 text-green-700 ring-green-100',
  rejected: 'bg-danger-50 text-danger-700 ring-[#f1c9c4]',
  neutral: 'bg-mist text-slate-600 ring-line',
  dark: 'bg-forest-900 text-white ring-forest-900',
  info: 'bg-info-50 text-info-700 ring-[#c9d9ef]',
  sample: 'bg-[#F3EEFB] text-[#5B3E8E] ring-[#E0D5F2]',
};

export function Badge({ tone = 'neutral', children, className, dot = false }) {
  return (
    <span className={cx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset', BADGE[tone] ?? BADGE.neutral, className)}>
      {dot && <span className="size-1.5 rounded-full bg-current" aria-hidden />}
      {children}
    </span>
  );
}

export const STATUS_TONE = { pending: 'pending', approved: 'approved', rejected: 'rejected' };
export const STATUS_LABEL = { pending: 'Pending', approved: 'Approved', rejected: 'Not approved' };

export function StatusBadge({ status }) {
  return <Badge tone={STATUS_TONE[status]} dot>{STATUS_LABEL[status] ?? status}</Badge>;
}

export function SampleBadge() {
  return <Badge tone="sample" className="!text-[11px]">Sample</Badge>;
}

export function Spinner({ label = 'Loading', className }) {
  return (
    <div role="status" className={cx('flex items-center justify-center gap-2 py-10 text-slate-500', className)}>
      <Loader2 className="size-5 animate-spin" aria-hidden />
      <span className="text-sm">{label}…</span>
    </div>
  );
}

export function Skeleton({ className }) {
  return <div className={cx('skeleton', className)} aria-hidden />;
}

export function EmptyState({ icon: Icon = Info, title, children, action, className }) {
  return (
    <div className={cx('flex flex-col items-center rounded-xl border border-dashed border-line-strong bg-white/60 px-6 py-12 text-center', className)}>
      <span className="flex size-12 items-center justify-center rounded-full bg-mist text-forest-800"><Icon className="size-6" aria-hidden /></span>
      <h3 className="mt-4 font-display text-xl font-semibold text-forest-900">{title}</h3>
      {children && <div className="mt-1.5 max-w-md text-[15px] text-slate-500">{children}</div>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function ErrorState({ error, onRetry, className }) {
  return (
    <Alert tone="error" title="This could not be loaded" className={className} action={onRetry && <Button size="sm" variant="secondary" onClick={onRetry}>Try again</Button>}>
      {error?.message}
    </Alert>
  );
}

// Accessible modal dialog built on <dialog>, which handles focus trapping and Escape.
export function Dialog({ open, onClose, title, children, footer, size = 'md' }) {
  const ref = useRef(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}
      aria-labelledby="dialog-title"
      className={cx('m-auto w-[calc(100%-2rem)] rounded-2xl border border-line bg-white p-0 text-ink shadow-lift backdrop:bg-forest-950/55 backdrop:backdrop-blur-[2px]', size === 'lg' ? 'max-w-2xl' : 'max-w-md')}
    >
      {open && (
        <div className="flex max-h-[85vh] flex-col">
          <div className="flex items-start justify-between gap-4 border-b border-line px-5 py-4">
            <h2 id="dialog-title" className="font-display text-xl font-semibold text-forest-900">{title}</h2>
            <button type="button" onClick={onClose} className="-m-1.5 rounded-md p-1.5 text-slate-500 hover:bg-mist hover:text-ink" aria-label="Close">
              <X className="size-5" aria-hidden />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-4">{children}</div>
          {footer && <div className="flex flex-wrap justify-end gap-2 border-t border-line bg-paper px-5 py-3.5">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}
