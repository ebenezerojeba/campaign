import { forwardRef } from 'react';
import { Link } from 'react-router';
import { Loader2 } from 'lucide-react';
import { cx } from '../../lib/format.js';

const VARIANTS = {
  primary: 'bg-green-600 text-white hover:bg-green-700 active:bg-green-700 shadow-[inset_0_-2px_0_rgb(0_0_0/0.15)]',
  gold: 'bg-gold-500 text-forest-950 hover:bg-[#d6b03a] active:bg-gold-600 shadow-[inset_0_-2px_0_rgb(0_0_0/0.12)]',
  dark: 'bg-forest-900 text-white hover:bg-forest-800',
  secondary: 'bg-white text-forest-900 border border-line-strong hover:border-forest-900 hover:bg-mist',
  ghost: 'text-forest-900 hover:bg-mist',
  onDark: 'bg-white/10 text-white border border-white/25 hover:bg-white/15 hover:border-white/45',
  danger: 'bg-danger-700 text-white hover:bg-[#8a1f19]',
  dangerSoft: 'bg-danger-50 text-danger-700 border border-[#f1c9c4] hover:bg-[#f9dfdb]',
};

const SIZES = {
  sm: 'h-9 px-3.5 text-sm gap-1.5 rounded-md',
  md: 'h-11 px-5 text-[15px] gap-2 rounded-[10px]',
  lg: 'h-13 px-6 text-base gap-2.5 rounded-xl',
};

export const buttonClass = ({ variant = 'primary', size = 'md', block = false, className } = {}) =>
  cx(
    'inline-flex items-center justify-center font-semibold whitespace-nowrap select-none transition-colors duration-150',
    'disabled:opacity-55 disabled:cursor-not-allowed aria-disabled:opacity-55 aria-disabled:pointer-events-none',
    VARIANTS[variant],
    SIZES[size],
    block && 'w-full',
    className,
  );

export const Button = forwardRef(function Button(
  { variant, size, block, loading = false, loadingText, icon: Icon, iconRight: IconRight, className, children, disabled, type = 'button', ...rest },
  ref,
) {
  return (
    <button
      ref={ref}
      type={type}
      className={buttonClass({ variant, size, block, className })}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...rest}
    >
      {loading ? <Loader2 className="size-4 animate-spin" aria-hidden /> : Icon && <Icon className="size-[1.1em] shrink-0" aria-hidden />}
      <span>{loading && loadingText ? loadingText : children}</span>
      {!loading && IconRight && <IconRight className="size-[1.1em] shrink-0" aria-hidden />}
    </button>
  );
});

export function ButtonLink({ to, href, variant, size, block, className, icon: Icon, iconRight: IconRight, children, ...rest }) {
  const cls = buttonClass({ variant, size, block, className });
  const content = (
    <>
      {Icon && <Icon className="size-[1.1em] shrink-0" aria-hidden />}
      <span>{children}</span>
      {IconRight && <IconRight className="size-[1.1em] shrink-0" aria-hidden />}
    </>
  );
  if (href) return <a href={href} className={cls} {...rest}>{content}</a>;
  return <Link to={to} className={cls} {...rest}>{content}</Link>;
}
