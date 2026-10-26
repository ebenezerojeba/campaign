import { useState } from 'react';
import { FileSpreadsheet, Download } from 'lucide-react';
import { useAdmin } from '../context.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { downloadFile } from '../../lib/download.js';
import { PageHeader } from '../ui.jsx';
import { Alert, ErrorState, Skeleton } from '../../components/ui/Feedback.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { SelectField, TextField } from '../../components/ui/Field.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { AGENT_CATEGORIES, REGISTRATION_STATUSES } from '../../../../shared/options.js';
import { LGA_NAMES } from '../../../../shared/lagos.js';

const ROLE_OPTIONS = AGENT_CATEGORIES.filter((c) => ['agent_1', 'agent_2', 'ward_collation_officer', 'lga_collation_officer'].includes(c.value));

function ReportCard({ report, demo }) {
  const notify = useToast();
  const [f, setF] = useState({});
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);
  const set = (k) => (e) => setF((v) => ({ ...v, [k]: e.target.value }));
  const has = (k) => report.filters.includes(k);

  const download = async (format) => {
    setBusy(format);
    setError(null);
    const qs = new URLSearchParams({ format, ...Object.fromEntries(Object.entries(f).filter(([k, v]) => v && has(k))) });
    try {
      notify(`Downloaded ${await downloadFile(`/admin/reports/${report.id}?${qs}`)}`);
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(null);
    }
  };

  return (
    <section className="rounded-[var(--radius-lg)] border border-line bg-white p-5">
      <h2 className="font-display text-lg font-semibold text-forest-900">{report.title}</h2>
      <p className="mt-1 text-sm text-slate-600">{report.description}</p>
      {report.filters.length > 0 && (
        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {has('role') && <SelectField label="Role" placeholder="All roles" options={ROLE_OPTIONS} value={f.role ?? ''} onChange={set('role')} />}
          {has('lga') && <SelectField label="LGA" placeholder="All LGAs" options={LGA_NAMES.map((l) => ({ value: l, label: l }))} value={f.lga ?? ''} onChange={set('lga')} />}
          {has('wardCode') && <TextField label="Ward code" optional placeholder="For example 20-01" value={f.wardCode ?? ''} onChange={set('wardCode')} />}
          {has('status') && <SelectField label="Status" placeholder="All statuses" options={REGISTRATION_STATUSES} value={f.status ?? ''} onChange={set('status')} />}
          {has('from') && <TextField label="Registered from" type="date" value={f.from ?? ''} onChange={set('from')} />}
          {has('to') && <TextField label="Registered to" type="date" value={f.to ?? ''} onChange={set('to')} />}
        </div>
      )}
      {error && <Alert tone="error" className="mt-4">{error}</Alert>}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button icon={FileSpreadsheet} loading={busy === 'xlsx'} loadingText="Preparing Excel" disabled={Boolean(busy) || demo} onClick={() => download('xlsx')}>Download Excel</Button>
        <Button variant="secondary" icon={Download} loading={busy === 'csv'} loadingText="Preparing CSV" disabled={Boolean(busy) || demo} onClick={() => download('csv')}>Download CSV</Button>
      </div>
    </section>
  );
}

// Reports and downloads centre: every file is generated on request for the
// signed-in admin and is never stored. Each download is recorded in the audit log.
export default function Reports() {
  const { api, demo } = useAdmin();
  const { data, loading, error, reload } = useFetch((signal) => api.get('/reports', { signal }), 'reports');
  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-48" /><Skeleton className="h-48" /></div>;
  if (error) return <ErrorState error={error} onRetry={reload} />;
  return (
    <>
      <PageHeader title="Reports and downloads" description="Each file is created when you download it, shows the filters, time and number of records, and is recorded in the audit log. Reports never contain NIN, VIN, party numbers, bank details or documents." />
      {demo && <Alert tone="info" className="mb-4">Downloads are switched off in the preview.</Alert>}
      <div className="grid gap-4 xl:grid-cols-2">
        {data.map((r) => <ReportCard key={r.id} report={r} demo={demo} />)}
      </div>
    </>
  );
}
