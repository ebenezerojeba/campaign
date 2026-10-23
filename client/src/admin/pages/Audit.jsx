import { useState } from 'react';
import { ScrollText } from 'lucide-react';
import { useAdmin } from '../context.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { PageHeader, Pagination, th, td } from '../ui.jsx';
import { EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback.jsx';
import { formatDateTime } from '../../lib/format.js';

export default function Audit() {
  const { api } = useAdmin();
  const [page, setPage] = useState(1);
  const { data, meta, loading, error, reload } = useFetch((signal) => api.get(`/audit?page=${page}`, { signal }), page);
  return (
    <>
      <PageHeader title="Audit log" description="Sensitive staff actions: sign-ins, decisions, exports, edits and deletions. Record and document views are logged on each registration’s page." />
      <div className="rounded-[var(--radius-lg)] border border-line bg-white">
        {error ? <div className="p-4"><ErrorState error={error} onRetry={reload} /></div> : loading ? <div className="p-4"><Skeleton className="h-64" /></div> : data.length === 0 ? (
          <div className="p-4"><EmptyState icon={ScrollText} title="No actions recorded yet" /></div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px]">
              <thead className="border-b border-line bg-paper"><tr><th className={th}>When</th><th className={th}>Who</th><th className={th}>Action</th><th className={th}>Details</th></tr></thead>
              <tbody className="divide-y divide-line">
                {data.map((a) => (
                  <tr key={a._id}>
                    <td className={`${td} whitespace-nowrap text-slate-500`}>{formatDateTime(a.createdAt)}</td>
                    <td className={td}><span className="font-medium">{a.actorName ?? 'System'}</span><span className="block text-xs capitalize text-slate-500">{a.actorRole}</span></td>
                    <td className={td}><code className="rounded bg-mist px-1.5 py-0.5 text-xs text-forest-800">{a.action}</code></td>
                    <td className={`${td} text-slate-600`}>{a.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-line p-4"><Pagination meta={meta} onPage={setPage} /></div>
      </div>
    </>
  );
}
