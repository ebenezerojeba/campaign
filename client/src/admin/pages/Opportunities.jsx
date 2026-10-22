import { Link, useSearchParams } from 'react-router';
import { Plus, Compass } from 'lucide-react';
import { useAdmin, can } from '../context.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { PageHeader, th, td } from '../ui.jsx';
import { ButtonLink } from '../../components/ui/Button.jsx';
import { Badge, EmptyState, ErrorState, SampleBadge, Skeleton } from '../../components/ui/Feedback.jsx';
import { formatDate, cx } from '../../lib/format.js';
import { INTERESTS, labelFor } from '../../../../shared/options.js';

export const OPP_STATUS = { draft: { label: 'Draft', tone: 'neutral' }, published: { label: 'Published', tone: 'approved' }, archived: { label: 'Archived', tone: 'dark' } };

export default function Opportunities() {
  const { api, base, user } = useAdmin();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const { data, loading, error, reload } = useFetch((signal) => api.get(`/opportunities${status ? `?status=${status}` : ''}`, { signal }), status);
  const manage = can(user, 'opportunities:manage');

  return (
    <>
      <PageHeader title="Opportunities" description="Activities volunteers can take part in." actions={manage && <ButtonLink to={`${base}/opportunities/new`} icon={Plus}>New opportunity</ButtonLink>} />
      <div role="group" aria-label="Filter by status" className="mb-4 flex flex-wrap gap-2">
        {[['', 'Active'], ['published', 'Published'], ['draft', 'Drafts'], ['archived', 'Archived']].map(([value, label]) => (
          <button key={label} type="button" aria-pressed={status === value} onClick={() => setParams(value ? { status: value } : {})} className={cx('rounded-full border px-3.5 py-1.5 text-sm font-semibold', status === value ? 'border-forest-900 bg-forest-900 text-white' : 'border-line-strong bg-white text-forest-900 hover:border-forest-900')}>{label}</button>
        ))}
      </div>
      <div className="rounded-[var(--radius-lg)] border border-line bg-white">
        {error ? <div className="p-4"><ErrorState error={error} onRetry={reload} /></div>
          : loading ? <div className="space-y-2 p-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-12" />)}</div>
            : data.length === 0 ? (
              <div className="p-4"><EmptyState icon={Compass} title="No opportunities here" action={manage && <ButtonLink to={`${base}/opportunities/new`} icon={Plus}>Create the first one</ButtonLink>}>Published opportunities appear on the public site and in volunteer accounts.</EmptyState></div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[760px]">
                  <thead className="border-b border-line bg-paper"><tr><th className={th}>Title</th><th className={th}>Category</th><th className={th}>Location</th><th className={th}>Starts</th><th className={th}>Interested</th><th className={th}>Assigned</th><th className={th}>Status</th></tr></thead>
                  <tbody className="divide-y divide-line">
                    {data.map((o) => (
                      <tr key={o._id} className="relative hover:bg-paper">
                        <td className={td}><Link to={`${base}/opportunities/${o._id}`} className="font-semibold text-forest-900 after:absolute after:inset-0 hover:underline">{o.title}</Link>{o.isSample && <span className="ml-2"><SampleBadge /></span>}</td>
                        <td className={`${td} text-slate-600`}>{labelFor(INTERESTS, o.category)}</td>
                        <td className={`${td} text-slate-600`}>{o.location?.isRemote ? 'Remote' : o.location?.lga || '—'}</td>
                        <td className={`${td} whitespace-nowrap text-slate-600`}>{formatDate(o.startDate) || '—'}</td>
                        <td className={`${td} tabular`}>{o.interested ?? 0}</td>
                        <td className={`${td} tabular`}>{o.assigned ?? 0}{o.capacity ? <span className="text-slate-500"> / {o.capacity}</span> : null}</td>
                        <td className={td}><Badge tone={OPP_STATUS[o.status].tone}>{OPP_STATUS[o.status].label}</Badge></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
      </div>
    </>
  );
}
