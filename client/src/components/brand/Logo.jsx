import { Link } from 'react-router';
import { cx } from '../../lib/format.js';
import { site } from '../../content/site.js';

// Programme wordmark. If an approved official logo file is supplied, set
// site.brand.logoUrl (see content/site.js) and it replaces the monogram.
export function Logo({ tone = 'dark', className, to = '/' }) {
  const light = tone === 'light';
  return (
    <Link to={to} className={cx('group inline-flex items-center gap-2.5 rounded-md', className)} aria-label={`${site.brand.name} ${site.brand.programme}, home`}>
      {site.brand.logoUrl ? (
        <img src={site.brand.logoUrl} alt="" className="h-10 w-auto" width="40" height="40" />
      ) : (
        <svg viewBox="0 0 64 64" className="size-10 shrink-0" aria-hidden>
          <rect width="64" height="64" rx="14" fill={light ? '#FFFFFF' : '#0E2A1C'} />
          <path d="M14 46 32 14l18 32" fill="none" stroke={light ? '#0E2A1C' : '#FFFFFF'} strokeWidth="6" strokeLinejoin="round" strokeLinecap="round" />
          <path d="M21 37h22" stroke="#C9A227" strokeWidth="6" strokeLinecap="round" />
        </svg>
      )}
      <span className="flex flex-col whitespace-nowrap leading-none">
        <span className={cx('font-display text-[19px] font-bold tracking-tight', light ? 'text-white' : 'text-forest-900')}>{site.brand.name}</span>
        <span className={cx('mt-1 text-[12.5px] font-medium', light ? 'text-green-100/80' : 'text-slate-500')}>{site.brand.programme}</span>
      </span>
    </Link>
  );
}
