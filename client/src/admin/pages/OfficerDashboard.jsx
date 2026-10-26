import { useMemo, useState } from 'react';
import { MapPinned, Download, FileSpreadsheet, ShieldAlert } from 'lucide-react';
import { useAdmin } from '../context.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { downloadFile } from '../../lib/download.js';
import { PageHeader, Card, StatTile, th, td } from '../ui.jsx';
import { Alert, Badge, EmptyState, Skeleton } from '../../components/ui/Feedback.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { TextField } from '../../components/ui/Field.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { formatNumber } from '../../lib/format.js';

const SLOT = {
  vacant: ['neutral', 'Vacant'],
  pending: ['pending', 'Pending review'],
  approved: ['approved', 'Approved'],
};
const Slot = ({ value }) => {
  const [tone, label] = SLOT[value?.status] ?? SLOT.vacant;
  return <Badge tone={tone} dot>{label}{value?.contested ? ' · contested' : ''}</Badge>;
};

// Collation officer home: figures for the officer's own LGA or ward only. The
// server decides the area from the signed-in account; nothing here can change it.
export default function OfficerDashboard() {
  const { api, user } = useAdmin();
  const notify = useToast();
  const { data, loading, error, reload } = useFetch((signal) => api.get('/officer/dashboard', { signal }), 'officer');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(null);

  const rows = useMemo(() => {
    if (!data) return [];
    const list = data.level === 'lga' ? data.wards : data.pollingUnits;
    const q = search.trim().toLowerCase();
    return q ? list.filter((r) => `${r.name} ${r.code}`.toLowerCase().includes(q)) : list;
  }, [data, search]);

  const download = async (format) => {
    setBusy(format);
    try {
      notify(`Downloaded ${await downloadFile(`/admin/officer/report?format=${format}`)}`);
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-32" /><Skeleton className="h-80" /></div>;
  if (error) {
    return (
      <EmptyState icon={ShieldAlert} title={error.status === 403 ? 'Your dashboard is not available' : 'The dashboard could not load'} action={error.status !== 403 && <Button variant="secondary" onClick={reload}>Try again</Button>}>
        {error.message}
      </EmptyState>
    );
  }

  const { totals, assignment } = data;
  const where = data.level === 'lga' ? `${assignment.lga} LGA` : `${assignment.ward} ward (${assignment.wardCode}), ${assignment.lga} LGA`;
  return (
    <>
      <PageHeader
        title={`Welcome, ${user.name.split(' ')[0]}`}
        description={<span className="flex flex-wrap items-center gap-2"><Badge tone="info">{data.level === 'lga' ? 'LGA Collation Officer' : 'Ward Collation Officer'}</Badge><span>{where}</span><Badge tone="approved" dot>Assignment active</Badge></span>}
        actions={(
          <>
            <Button variant="secondary" icon={FileSpreadsheet} loading={busy === 'xlsx'} loadingText="Preparing" onClick={() => download('xlsx')}>Excel</Button>
            <Button variant="secondary" icon={Download} loading={busy === 'csv'} loadingText="Preparing" onClick={() => download('csv')}>CSV</Button>
          </>
        )}
      />
      <Alert tone="info" className="mb-6">These figures cover {where} only. They show which positions are filled and vacant, never applicants’ personal details.</Alert>

      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {data.level === 'lga' && <StatTile label="Wards" value={totals.wards} icon={MapPinned} hint={`${totals.wardOfficersFilled} of ${totals.wards} Ward Collation Officer positions filled`} />}
        <StatTile label="Polling units" value={totals.pollingUnits} icon={MapPinned} />
        <StatTile label="Agent positions filled" value={totals.filled} tone="pending" hint={`of ${formatNumber(totals.agentPositions)} (Agent 1 and Agent 2)`} />
        <StatTile label="Approved agents" value={totals.approved} tone="approved" />
        <StatTile label="Vacant agent positions" value={totals.vacant} />
      </div>

      <Card title={data.level === 'lga' ? 'Wards' : 'Polling units'} actions={<TextField label="Search" className="w-56" placeholder={data.level === 'lga' ? 'Ward name or code' : 'Polling unit or number'} value={search} onChange={(e) => setSearch(e.target.value)} />} bodyClassName="p-0">
        {rows.length === 0 ? <p className="p-5 text-sm text-slate-500">Nothing matches “{search}”.</p> : (
          <div className="overflow-x-auto">
            {data.level === 'lga' ? (
              <table className="w-full min-w-[720px]">
                <thead className="border-b border-line bg-paper"><tr><th className={th}>Ward</th><th className={th}>Polling units</th><th className={th}>Filled</th><th className={th}>Approved</th><th className={th}>Vacant</th><th className={th}>Ward Collation Officer</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {rows.map((w) => (
                    <tr key={w.code}>
                      <td className={td}><span className="font-medium">{w.name}</span><span className="ml-2 font-mono text-xs text-slate-500">{w.code}</span></td>
                      <td className={`${td} tabular`}>{w.pollingUnits}</td>
                      <td className={`${td} tabular`}>{w.filled} / {w.agentPositions}</td>
                      <td className={`${td} tabular`}>{w.approved}</td>
                      <td className={`${td} tabular`}>{w.vacant}</td>
                      <td className={td}><Slot value={w.wardOfficer} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <table className="w-full min-w-[640px]">
                <thead className="border-b border-line bg-paper"><tr><th className={th}>Polling unit</th><th className={th}>Agent 1</th><th className={th}>Agent 2</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {rows.map((u) => (
                    <tr key={u.code}>
                      <td className={td}><span className="font-medium">{u.name}</span><span className="ml-2 font-mono text-xs text-slate-500">{u.code}</span></td>
                      <td className={td}><Slot value={u.agent_1} /></td>
                      <td className={td}><Slot value={u.agent_2} /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}
      </Card>
    </>
  );
}
