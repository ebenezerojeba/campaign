import { useState } from 'react';
import { Link } from 'react-router';
import { ShieldCheck } from 'lucide-react';
import { useAdmin } from '../context.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { PageHeader } from '../ui.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { TextArea } from '../../components/ui/Field.jsx';
import { Alert, Badge, Dialog, EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { formatDateTime } from '../../lib/format.js';

const TYPE = { correction: 'Correction', deletion: 'Deletion', export: 'Data export' };

function Resolve({ request, onClose, onDone }) {
  const { api } = useAdmin();
  const notify = useToast();
  const [resolution, setResolution] = useState('');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const act = async (status) => {
    setBusy(status);
    try {
      await api.patch(`/requests/${request._id}`, { status, resolution });
      notify(status === 'completed' ? 'Request completed' : 'Request declined');
      onDone();
    } catch (err) {
      setError(err.message);
      setBusy(null);
    }
  };
  return (
    <Dialog open onClose={onClose} title={`${TYPE[request.type]} request`} footer={<><Button variant="secondary" loading={busy === 'declined'} onClick={() => act('declined')}>Decline</Button><Button variant={request.type === 'deletion' ? 'danger' : 'primary'} loading={busy === 'completed'} onClick={() => act('completed')}>{request.type === 'deletion' ? 'Delete record and complete' : 'Mark completed'}</Button></>}>
      {request.details && <p className="rounded-lg bg-paper p-3 text-[15px] text-ink">{request.details}</p>}
      {request.type === 'deletion' && <Alert tone="warning" className="mt-4" title="This permanently deletes the volunteer record">This cannot be undone. The request itself is kept, without personal details, as evidence it was handled.</Alert>}
      {request.type === 'correction' && <p className="mt-4 text-sm text-slate-500">Make the correction (for example by contacting the volunteer to confirm), then record what you did.</p>}
      <TextArea label="Resolution note" optional rows={3} className="mt-4" value={resolution} onChange={(e) => setResolution(e.target.value)} />
      {error && <Alert tone="error" className="mt-3">{error}</Alert>}
    </Dialog>
  );
}

export default function Requests() {
  const { api, base } = useAdmin();
  const { data, loading, error, reload } = useFetch((signal) => api.get('/requests', { signal }), 'requests');
  const [active, setActive] = useState(null);
  return (
    <>
      <PageHeader title="Data requests" description="Correction, export and deletion requests from volunteers, under the Nigeria Data Protection Act 2023." />
      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <Skeleton className="h-40" /> : data.length === 0 ? (
        <EmptyState icon={ShieldCheck} title="No requests">Requests made from volunteer accounts appear here.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {data.map((r) => (
            <li key={r._id} className="flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-lg)] border border-line bg-white p-5">
              <div>
                <p className="flex items-center gap-2 font-semibold text-ink">{TYPE[r.type]}<Badge tone={r.status === 'open' ? 'pending' : r.status === 'completed' ? 'approved' : 'neutral'}>{r.status}</Badge></p>
                <p className="mt-1 text-sm text-slate-500">
                  {r.volunteer ? <Link className="font-semibold text-green-700 hover:underline" to={`${base}/volunteers/${r.volunteer._id}`}>{r.volunteer.firstName} {r.volunteer.lastName}</Link> : 'Record deleted'} · {r.reference} · {formatDateTime(r.createdAt)}
                </p>
                {r.details && <p className="mt-2 max-w-2xl text-[15px] text-slate-600">{r.details}</p>}
                {r.resolution && <p className="mt-2 text-sm text-slate-500">Resolution: {r.resolution}</p>}
              </div>
              {r.status === 'open' && <Button variant="secondary" onClick={() => setActive(r)}>Resolve</Button>}
            </li>
          ))}
        </ul>
      )}
      {active && <Resolve request={active} onClose={() => setActive(null)} onDone={() => { setActive(null); reload(); }} />}
    </>
  );
}
