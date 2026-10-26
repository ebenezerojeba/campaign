import { useMemo, useState } from 'react';
import { Link } from 'react-router';
import { MapPinned } from 'lucide-react';
import { useAdmin } from '../context.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { PageHeader, StatTile, th, td } from '../ui.jsx';
import { Alert, Badge, ErrorState, Skeleton } from '../../components/ui/Feedback.jsx';
import { SelectField, TextField } from '../../components/ui/Field.jsx';
import { LGA_NAMES } from '../../../../shared/lagos.js';

const STATUS = { vacant: ['neutral', 'Vacant'], pending: ['pending', 'Pending review'], approved: ['approved', 'Approved'] };
const accessText = (d) => (!d ? 'Not given' : !d.active ? 'Switched off' : d.passwordSet ? 'Active' : 'Invited');

// All 20 LGA and 245 ward collation officer positions: filled, vacant or contested.
export default function OfficerPosts() {
  const { api, base } = useAdmin();
  const { data, loading, error, reload } = useFetch((signal) => api.get('/officers/posts', { signal }), 'officer-posts');
  const [tab, setTab] = useState('ward');
  const [lga, setLga] = useState('');
  const [status, setStatus] = useState('');
  const [search, setSearch] = useState('');

  const posts = useMemo(() => {
    if (!data) return [];
    const q = search.trim().toLowerCase();
    return data[tab].posts.filter((p) => (!lga || p.lga === lga)
      && (!status || (status === 'contested' ? p.contested : p.status === status))
      && (!q || `${p.lga} ${p.ward ?? ''} ${p.wardCode ?? ''} ${p.holder?.name ?? ''} ${p.holder?.reference ?? ''}`.toLowerCase().includes(q)));
  }, [data, tab, lga, status, search]);

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-32" /><Skeleton className="h-96" /></div>;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  const s = data[tab];

  return (
    <>
      <PageHeader title="Collation officer positions" description="One LGA Collation Officer position per LGA and one Ward Collation Officer position per ward, from the official INEC list. A registration that is pending review or approved fills its position." />
      <div className="mb-4 flex gap-2" role="tablist" aria-label="Position type">
        {[['ward', `Ward Collation Officer (${data.ward.capacity})`], ['lga', `LGA Collation Officer (${data.lga.capacity})`]].map(([key, label]) => (
          <button key={key} type="button" role="tab" aria-selected={tab === key} onClick={() => setTab(key)} className={`rounded-lg px-4 py-2 text-sm font-semibold ${tab === key ? 'bg-forest-900 text-white' : 'bg-white text-forest-900 ring-1 ring-line hover:bg-mist'}`}>{label}</button>
        ))}
      </div>
      {!s.reconciled && <Alert tone="warning" className="mb-4">The configured number of positions ({s.capacity}) does not match the official data ({s.locations} locations). Check the settings before relying on the vacancy figures.</Alert>}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatTile label="Filled" value={s.filled} icon={MapPinned} hint={`of ${s.capacity} positions`} />
        <StatTile label="Approved" value={s.approved} tone="approved" />
        <StatTile label="Vacant" value={s.vacant} />
        <StatTile label="Contested" value={s.contested} tone={s.contested ? 'rejected' : 'default'} hint={s.contested ? 'More than one active registration' : undefined} />
      </div>
      <div className="mb-4 grid gap-3 sm:grid-cols-3">
        <SelectField label="LGA" placeholder="All LGAs" options={LGA_NAMES.map((l) => ({ value: l, label: l }))} value={lga} onChange={(e) => setLga(e.target.value)} />
        <SelectField label="Status" placeholder="All" options={[{ value: 'vacant', label: 'Vacant' }, { value: 'pending', label: 'Pending review' }, { value: 'approved', label: 'Approved' }, { value: 'contested', label: 'Contested' }]} value={status} onChange={(e) => setStatus(e.target.value)} />
        <TextField label="Search" placeholder="Ward, name or reference" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>
      <div className="overflow-x-auto rounded-[var(--radius-lg)] border border-line bg-white">
        <table className="w-full min-w-[820px]">
          <thead className="border-b border-line bg-paper">
            <tr><th className={th}>LGA</th>{tab === 'ward' && <th className={th}>Ward</th>}<th className={th}>Status</th><th className={th}>Officer</th><th className={th}>Dashboard</th></tr>
          </thead>
          <tbody className="divide-y divide-line">
            {posts.map((p) => {
              const [tone, label] = STATUS[p.status] ?? STATUS.vacant;
              return (
                <tr key={`${p.lga}|${p.wardCode ?? ''}`}>
                  <td className={td}>{p.lga}</td>
                  {tab === 'ward' && <td className={td}><span className="font-medium">{p.ward}</span><span className="ml-2 font-mono text-xs text-slate-500">{p.wardCode}</span></td>}
                  <td className={td}><span className="flex flex-wrap gap-1.5"><Badge tone={tone} dot>{label}</Badge>{p.contested && <Badge tone="rejected">{p.competing} competing</Badge>}</span></td>
                  <td className={td}>{p.holder ? <Link to={`${base}/agents/${p.holder.id}`} className="font-medium text-green-700 hover:underline">{p.holder.name} <span className="font-mono text-xs">{p.holder.reference}</span></Link> : <span className="text-slate-400">–</span>}</td>
                  <td className={`${td} text-slate-600`}>{p.holder ? accessText(p.dashboard) : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        {posts.length === 0 && <p className="p-5 text-sm text-slate-500">No positions match these filters.</p>}
      </div>
    </>
  );
}
