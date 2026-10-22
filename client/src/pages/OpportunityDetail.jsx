import { useParams, Link } from 'react-router';
import { ArrowLeft, ArrowRight, Compass } from 'lucide-react';
import { AdireTile } from '../components/brand/Adire.jsx';
import { OpportunityMeta } from '../components/OpportunityCard.jsx';
import { ButtonLink } from '../components/ui/Button.jsx';
import { EmptyState, ErrorState, SampleBadge, Skeleton } from '../components/ui/Feedback.jsx';
import { get } from '../lib/api.js';
import { useFetch } from '../lib/useFetch.js';
import { artFor } from '../lib/motifs.js';
import { INTERESTS, SKILLS, labelFor } from '../../../shared/options.js';

export default function OpportunityDetail() {
  const { id } = useParams();
  const { data: item, loading, error, reload } = useFetch((signal) => get(`/opportunities/${id}`, { signal }), id);

  if (loading) {
    return <div className="container-page max-w-4xl space-y-4 py-16"><Skeleton className="h-10 w-2/3" /><Skeleton className="h-64 w-full" /><Skeleton className="h-4 w-full" /><Skeleton className="h-4 w-5/6" /></div>;
  }
  if (error) {
    return (
      <div className="container-page max-w-3xl py-16">
        {error.status === 404
          ? <EmptyState icon={Compass} title="This opportunity is no longer available" action={<ButtonLink to="/opportunities">See current opportunities</ButtonLink>}>It may have finished or been withdrawn by the programme team.</EmptyState>
          : <ErrorState error={error} onRetry={reload} />}
      </div>
    );
  }

  const art = artFor(item.category);
  return (
    <article className="py-10 sm:py-16">
      <div className="container-page max-w-4xl">
        <Link to="/opportunities" className="inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 hover:underline"><ArrowLeft className="size-4" aria-hidden />All opportunities</Link>
        <div className="mt-6 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-mist px-3 py-1 text-sm font-semibold text-forest-800">{labelFor(INTERESTS, item.category)}</span>
          {item.isSample && <SampleBadge />}
        </div>
        <h1 className="type-h2 mt-4 text-forest-900">{item.title}</h1>
        <p className="type-lead mt-4 text-slate-600">{item.summary}</p>

        <div className="mt-8 overflow-hidden rounded-[var(--radius-xl)] bg-mist">
          {item.coverImage?.url ? (
            <img src={item.coverImage.url} alt={item.coverImage.alt || ''} className="aspect-[16/7] w-full object-cover" />
          ) : (
            <div className="flex aspect-[16/5]">{[0, 1, 2, 3, 4].map((i) => <AdireTile key={i} motif={art.motif} palette={art.palette} className="h-full w-auto" />)}</div>
          )}
        </div>

        <div className="mt-10 grid gap-10 md:grid-cols-[1fr_280px]">
          <div className="space-y-8">
            {item.description && (
              <section>
                <h2 className="font-display text-2xl font-semibold text-forest-900">About this activity</h2>
                <p className="mt-3 whitespace-pre-line text-[16px] leading-relaxed text-slate-600">{item.description}</p>
              </section>
            )}
            {item.eligibility && (
              <section>
                <h2 className="font-display text-2xl font-semibold text-forest-900">Who can take part</h2>
                <p className="mt-3 whitespace-pre-line text-[16px] leading-relaxed text-slate-600">{item.eligibility}</p>
              </section>
            )}
            {item.skills?.length > 0 && (
              <section>
                <h2 className="font-display text-2xl font-semibold text-forest-900">Useful skills</h2>
                <ul className="mt-3 flex flex-wrap gap-2">{item.skills.map((s) => <li key={s} className="rounded-md bg-mist px-3 py-1 text-sm font-medium text-forest-800">{labelFor(SKILLS, s)}</li>)}</ul>
              </section>
            )}
          </div>
          <aside className="h-fit rounded-[var(--radius-lg)] border border-line bg-white p-5">
            <h2 className="font-display text-lg font-semibold text-forest-900">Details</h2>
            <OpportunityMeta item={item} className="mt-3" />
            <ButtonLink to="/register" block className="mt-5" iconRight={ArrowRight}>Register to take part</ButtonLink>
            <p className="mt-3 text-sm text-slate-500">Already approved? <Link to="/portal" className="font-semibold text-green-700 underline underline-offset-4">Sign in</Link> to register your interest.</p>
          </aside>
        </div>
      </div>
    </article>
  );
}
