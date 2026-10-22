import { Link } from 'react-router';
import { MapPin, CalendarDays, Clock, Wifi } from 'lucide-react';
import { AdireTile } from './brand/Adire.jsx';
import { SampleBadge } from './ui/Feedback.jsx';
import { artFor } from '../lib/motifs.js';
import { formatDate } from '../lib/format.js';
import { INTERESTS, SKILLS, labelFor } from '../../../shared/options.js';

export function OpportunityMeta({ item, className = '' }) {
  return (
    <ul className={`space-y-1.5 text-sm text-slate-600 ${className}`}>
      {item.location?.isRemote ? (
        <li className="flex items-center gap-2"><Wifi className="size-4 text-green-600" aria-hidden />Remote</li>
      ) : item.location?.lga ? (
        <li className="flex items-center gap-2"><MapPin className="size-4 text-green-600" aria-hidden />{item.location.lga} LGA{item.location.venue ? `, ${item.location.venue}` : ''}</li>
      ) : null}
      {item.startDate && (
        <li className="flex items-center gap-2"><CalendarDays className="size-4 text-green-600" aria-hidden />From {formatDate(item.startDate)}{item.endDate ? ` to ${formatDate(item.endDate)}` : ''}</li>
      )}
      {item.commitment && <li className="flex items-center gap-2"><Clock className="size-4 text-green-600" aria-hidden />{item.commitment}</li>}
    </ul>
  );
}

export function OpportunityCard({ item, to = `/opportunities/${item._id}`, action }) {
  const art = artFor(item.category);
  return (
    <article className="group relative flex flex-col overflow-hidden rounded-[var(--radius-lg)] border border-line bg-white transition-shadow duration-200 hover:shadow-soft">
      <div className="relative aspect-[16/7] overflow-hidden bg-mist">
        {item.coverImage?.url ? (
          <img src={item.coverImage.url} alt={item.coverImage.alt || ''} loading="lazy" decoding="async" className="size-full object-cover" />
        ) : (
          <div className="flex size-full">
            <AdireTile motif={art.motif} palette={art.palette} className="h-full w-auto" />
            <AdireTile motif={art.motif} palette={art.palette} className="h-full w-auto" />
            <AdireTile motif={art.motif} palette={art.palette} className="h-full w-auto" />
          </div>
        )}
        <span className="absolute left-3 top-3 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-forest-900 shadow-sm">{labelFor(INTERESTS, item.category)}</span>
        {item.isSample && <span className="absolute right-3 top-3"><SampleBadge /></span>}
      </div>
      <div className="flex flex-1 flex-col p-5">
        <h3 className="type-h3 text-forest-900">
          <Link to={to} className="after:absolute after:inset-0 focus-visible:outline-none group-has-[:focus-visible]:underline">{item.title}</Link>
        </h3>
        <p className="mt-2 text-[15px] leading-relaxed text-slate-600">{item.summary}</p>
        {item.skills?.length > 0 && (
          <ul className="mt-4 flex flex-wrap gap-1.5" aria-label="Useful skills">
            {item.skills.slice(0, 3).map((s) => <li key={s} className="rounded-md bg-mist px-2 py-0.5 text-xs font-medium text-forest-800">{labelFor(SKILLS, s)}</li>)}
          </ul>
        )}
        <OpportunityMeta item={item} className="mt-4 border-t border-line pt-4" />
        {action && <div className="relative z-10 mt-5">{action}</div>}
      </div>
    </article>
  );
}

export function OpportunityCardSkeleton() {
  return (
    <div className="overflow-hidden rounded-[var(--radius-lg)] border border-line bg-white">
      <div className="skeleton aspect-[16/7] rounded-none" />
      <div className="space-y-3 p-5">
        <div className="skeleton h-6 w-3/4" />
        <div className="skeleton h-4 w-full" />
        <div className="skeleton h-4 w-5/6" />
        <div className="skeleton mt-4 h-4 w-1/2" />
      </div>
    </div>
  );
}
