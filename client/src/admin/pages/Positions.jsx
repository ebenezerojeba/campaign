import { Link } from 'react-router';
import { MapPinned } from 'lucide-react';
import { useAdmin } from '../context.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { PageHeader, th, td } from '../ui.jsx';
import { Badge, EmptyState, ErrorState, Skeleton, StatusBadge } from '../../components/ui/Feedback.jsx';
import { formatDate } from '../../lib/format.js';
import { AGENT_CATEGORIES, labelFor } from '../../../../shared/options.js';

// Polling-unit positions with more than one Pending or Approved registration.
// Nothing here changes on its own: reviewers settle each one by declining or
// cancelling the registrations that should not hold the position.
export default function Positions() {
  const { api, base } = useAdmin();
  const { data, loading, error, reload } = useFetch((signal) => api.get('/positions/conflicts', { signal }), 'conflicts');

  return (
    <>
      <PageHeader
        title="Contested positions"
        description="Each polling unit has one Agent 1 and one Agent 2 position, each ward one Ward Collation Officer and each LGA one LGA Collation Officer. These positions have more than one active registration from before the rule was introduced. The first registration listed holds the position; decline or cancel the others, or the holder, to settle it."
      />
      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <Skeleton className="h-64" /> : data.total === 0 ? (
        <EmptyState icon={MapPinned} title="No contested positions">Every polling-unit position has at most one active registration.</EmptyState>
      ) : (
        <>
          <p className="mb-4 text-[15px] text-slate-600">
            <span className="font-semibold text-ink">{data.total}</span> contested positions, with <span className="font-semibold text-ink">{data.surplus}</span> registrations waiting for a decision.
            {data.items.length < data.total && ` Showing the first ${data.items.length}.`}
          </p>
          <div className="space-y-4">
            {data.items.map((p) => (
              <section key={`${p.pollingUnitCode ?? p.wardCode ?? p.lga}|${p.agentCategory}`} className="rounded-[var(--radius-lg)] border border-line bg-white">
                <header className="flex flex-wrap items-baseline justify-between gap-2 border-b border-line px-4 py-3">
                  <h2 className="font-semibold text-ink">{p.level === 'lga' ? `${p.lga} LGA` : p.level === 'ward' ? `${p.ward} ward` : (p.pollingUnit || p.pollingUnitCode)} <span className="font-mono text-sm font-normal text-slate-500">{p.level === 'lga' ? '' : p.level === 'ward' ? p.wardCode : p.pollingUnitCode}</span></h2>
                  <span className="flex items-center gap-2 text-sm text-slate-500">{p.ward && `${p.ward}, `}{p.lga}<Badge tone="info">{labelFor(AGENT_CATEGORIES, p.agentCategory)}</Badge></span>
                </header>
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[560px]">
                    <thead className="bg-paper"><tr><th className={th}>Reference</th><th className={th}>Name</th><th className={th}>Status</th><th className={th}>Registered</th><th className={th}>Position</th></tr></thead>
                    <tbody className="divide-y divide-line">
                      {p.registrations.map((r) => (
                        <tr key={r.id}>
                          <td className={td}><Link to={`${base}/agents/${r.id}`} className="font-mono font-semibold text-green-700 hover:underline">{r.reference}</Link></td>
                          <td className={td}>{r.firstName} {r.lastName}</td>
                          <td className={td}><StatusBadge status={r.status} /></td>
                          <td className={`${td} whitespace-nowrap text-slate-500`}>{formatDate(r.createdAt)}</td>
                          <td className={td}>{r.holder ? <Badge tone="approved">Holds position</Badge> : <Badge tone="pending">Waiting</Badge>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            ))}
          </div>
        </>
      )}
    </>
  );
}
