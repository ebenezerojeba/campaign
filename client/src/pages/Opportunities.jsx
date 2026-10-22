import { useSearchParams } from 'react-router';
import { Compass } from 'lucide-react';
import { OpportunityCard, OpportunityCardSkeleton } from '../components/OpportunityCard.jsx';
import { EmptyState, ErrorState } from '../components/ui/Feedback.jsx';
import { ButtonLink } from '../components/ui/Button.jsx';
import { get } from '../lib/api.js';
import { useFetch } from '../lib/useFetch.js';
import { cx } from '../lib/format.js';
import { INTERESTS } from '../../../shared/options.js';

export default function Opportunities() {
  const [params, setParams] = useSearchParams();
  const category = params.get('category') || '';
  const { data, loading, error, reload } = useFetch(
    (signal) => get(`/opportunities?limit=50${category ? `&category=${category}` : ''}`, { signal }),
    category,
  );

  return (
    <div className="py-12 sm:py-20">
      <div className="container-page">
        <h1 className="type-h2 max-w-2xl text-forest-900">Volunteer opportunities</h1>
        <p className="type-lead mt-4 max-w-2xl text-slate-600">Activities published by the programme team. Register as a volunteer to be matched with them.</p>

        <div className="-mx-4 mt-8 overflow-x-auto px-4 pb-2">
          <div role="group" aria-label="Filter by category" className="flex gap-2">
            {[{ value: '', label: 'All' }, ...INTERESTS].map((c) => (
              <button
                key={c.value}
                type="button"
                aria-pressed={category === c.value}
                onClick={() => setParams(c.value ? { category: c.value } : {})}
                className={cx('whitespace-nowrap rounded-full border px-4 py-2 text-sm font-semibold transition-colors', category === c.value ? 'border-forest-900 bg-forest-900 text-white' : 'border-line-strong bg-white text-forest-900 hover:border-forest-900')}
              >
                {c.label}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-8">
          {loading ? (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{[0, 1, 2].map((i) => <OpportunityCardSkeleton key={i} />)}</div>
          ) : error ? (
            error.code === 'DB_NOT_CONFIGURED'
              ? <EmptyState icon={Compass} title="Opportunities are not available yet">Published activities will appear here once the programme database is connected.</EmptyState>
              : <ErrorState error={error} onRetry={reload} />
          ) : data.length === 0 ? (
            <EmptyState icon={Compass} title={category ? 'Nothing in this category yet' : 'New opportunities are on the way'} action={<ButtonLink to="/register">Register to be notified</ButtonLink>}>
              Register now and the programme team will contact you as activities are published.
            </EmptyState>
          ) : (
            <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">{data.map((item) => <OpportunityCard key={item._id} item={item} />)}</div>
          )}
        </div>
      </div>
    </div>
  );
}
