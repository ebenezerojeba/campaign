import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Search, Download, X, Users } from 'lucide-react';
import { useAdmin, can } from '../context.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { PageHeader, Pagination, th, td } from '../ui.jsx';
import { StatusBadge, SampleBadge, ErrorState, EmptyState, Skeleton } from '../../components/ui/Feedback.jsx';
import { buttonClass } from '../../components/ui/Button.jsx';
import { formatDate, formatPhone, cx } from '../../lib/format.js';
import { LGA_NAMES } from '../../../../shared/lagos.js';
import { INTERESTS, VOLUNTEER_STATUSES, labelFor } from '../../../../shared/options.js';

const FILTER_KEYS = ['q', 'status', 'lga', 'interest', 'from', 'to', 'sample', 'sort'];
const selectCls = 'h-10 rounded-[10px] border border-line-strong bg-white px-3 text-sm text-ink focus:border-forest-900 focus:outline-none focus:ring-3 focus:ring-gold-500/45';

export default function Volunteers() {
  const { api, base, user, demo } = useAdmin();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const query = params.toString();

  const { data, meta, loading, error, reload } = useFetch((signal) => api.get(`/volunteers?${query}`, { signal }), query);

  // Debounced search box.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('q') ?? '') !== q) update({ q });
    }, 350);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  function update(changes) {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => (v ? next.set(k, v) : next.delete(k)));
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  }

  const active = FILTER_KEYS.some((k) => params.get(k));
  const exportQuery = new URLSearchParams([...params].filter(([k]) => k !== 'page'));

  return (
    <>
      <PageHeader
        title="Volunteers"
        description="Search, filter and review applications."
        actions={can(user, 'volunteers:export') && (
          demo
            ? <span className={buttonClass({ variant: 'secondary', className: 'opacity-55' })} aria-disabled="true"><Download className="size-4" aria-hidden />Export CSV</span>
            : <a href={`/api/admin/exports/volunteers?${exportQuery}`} className={buttonClass({ variant: 'secondary' })} download><Download className="size-4" aria-hidden />Export CSV</a>
        )}
      />

      <div className="rounded-[var(--radius-lg)] border border-line bg-white">
        <div className="flex flex-col gap-3 border-b border-line p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <label htmlFor="vol-search" className="sr-only">Search volunteers</label>
            <input id="vol-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by reference, name, phone or email" className="h-11 w-full rounded-[10px] border border-line-strong bg-white pl-9 pr-3 text-[15px] focus:border-forest-900 focus:outline-none focus:ring-3 focus:ring-gold-500/45" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="f-status">Status</label>
            <select id="f-status" className={selectCls} value={params.get('status') ?? ''} onChange={(e) => update({ status: e.target.value })}>
              <option value="">All statuses</option>
              {VOLUNTEER_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <label className="sr-only" htmlFor="f-lga">LGA</label>
            <select id="f-lga" className={selectCls} value={params.get('lga') ?? ''} onChange={(e) => update({ lga: e.target.value })}>
              <option value="">All LGAs</option>
              {LGA_NAMES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <label className="sr-only" htmlFor="f-interest">Interest</label>
            <select id="f-interest" className={selectCls} value={params.get('interest') ?? ''} onChange={(e) => update({ interest: e.target.value })}>
              <option value="">All interests</option>
              {INTERESTS.map((i) => <option key={i.value} value={i.value}>{i.label}</option>)}
            </select>
            <span className="flex items-center gap-1.5 text-sm text-slate-500">
              <label htmlFor="f-from">From</label>
              <input id="f-from" type="date" className={selectCls} value={params.get('from') ?? ''} onChange={(e) => update({ from: e.target.value })} />
              <label htmlFor="f-to">to</label>
              <input id="f-to" type="date" className={selectCls} value={params.get('to') ?? ''} onChange={(e) => update({ to: e.target.value })} />
            </span>
            <label className="sr-only" htmlFor="f-sample">Record type</label>
            <select id="f-sample" className={selectCls} value={params.get('sample') ?? ''} onChange={(e) => update({ sample: e.target.value })}>
              <option value="">Real and sample</option>
              <option value="real">Real registrations only</option>
              <option value="sample">Sample records only</option>
            </select>
            <label className="sr-only" htmlFor="f-sort">Sort</label>
            <select id="f-sort" className={selectCls} value={params.get('sort') ?? ''} onChange={(e) => update({ sort: e.target.value })}>
              <option value="">Newest first</option>
              <option value="oldest">Oldest first</option>
              <option value="name">Last name A–Z</option>
            </select>
            {active && (
              <button type="button" onClick={() => { setQ(''); setParams({}, { replace: true }); }} className="inline-flex h-10 items-center gap-1 rounded-[10px] px-3 text-sm font-semibold text-green-700 hover:bg-mist">
                <X className="size-4" aria-hidden />Clear filters
              </button>
            )}
          </div>
        </div>

        {error ? (
          <div className="p-4"><ErrorState error={error} onRetry={reload} /></div>
        ) : loading && !data ? (
          <div className="space-y-2 p-4">{Array.from({ length: 8 }, (_, i) => <Skeleton key={i} className="h-12" />)}</div>
        ) : data.length === 0 ? (
          <div className="p-4">
            <EmptyState icon={Users} title={active ? 'No volunteers match these filters' : 'No registrations yet'}>
              {active ? 'Try removing a filter or searching for something else.' : 'Applications will appear here as people register.'}
            </EmptyState>
          </div>
        ) : (
          <div className={cx('overflow-x-auto transition-opacity', loading && 'opacity-60')} aria-busy={loading}>
            <table className="w-full min-w-[820px]">
              <caption className="sr-only">Volunteer applications</caption>
              <thead className="border-b border-line bg-paper">
                <tr><th scope="col" className={th}>Reference</th><th scope="col" className={th}>Name</th><th scope="col" className={th}>Phone</th><th scope="col" className={th}>LGA</th><th scope="col" className={th}>Interests</th><th scope="col" className={th}>Status</th><th scope="col" className={th}>Registered</th></tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.map((v) => (
                  <tr key={v._id} className="group relative hover:bg-paper">
                    <td className={td}>
                      <Link to={`${base}/volunteers/${v._id}`} className="font-mono text-[13px] font-semibold text-forest-900 after:absolute after:inset-0 hover:underline">{v.reference}</Link>
                    </td>
                    <td className={td}><span className="flex items-center gap-2 font-medium">{v.firstName} {v.lastName}{v.isSample && <SampleBadge />}</span></td>
                    <td className={`${td} whitespace-nowrap text-slate-600 tabular`}>{formatPhone(v.phone)}</td>
                    <td className={td}>{v.lga}</td>
                    <td className={`${td} max-w-[220px] truncate text-slate-600`}>{v.interests.map((i) => labelFor(INTERESTS, i)).join(', ')}</td>
                    <td className={td}><StatusBadge status={v.status} /></td>
                    <td className={`${td} whitespace-nowrap text-slate-500`}>{formatDate(v.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="border-t border-line p-4"><Pagination meta={meta} onPage={(page) => update({ page: String(page) })} /></div>
      </div>
    </>
  );
}
