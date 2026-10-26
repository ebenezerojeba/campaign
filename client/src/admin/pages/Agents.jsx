import { useEffect, useState } from 'react';
import { Link, useSearchParams } from 'react-router';
import { Search, Download, X, Users } from 'lucide-react';
import { useAdmin, can } from '../context.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { get } from '../../lib/api.js';
import { useConfig } from '../../lib/config.jsx';
import { PageHeader, Pagination, th, td } from '../ui.jsx';
import { StatusBadge, SampleBadge, ErrorState, EmptyState, Skeleton } from '../../components/ui/Feedback.jsx';
import { buttonClass } from '../../components/ui/Button.jsx';
import { formatDate, formatPhone, cx } from '../../lib/format.js';
import { LGA_NAMES, STATE } from '../../../../shared/lagos.js';
import { STATE_NAMES, lgasOfState, stateLabel } from '../../../../shared/nigeria.js';
import { AGENT_CATEGORIES, REGISTRATION_STATUSES, labelFor } from '../../../../shared/options.js';

const FILTER_KEYS = ['q', 'status', 'agentCategory', 'lga', 'wardCode', 'pollingUnitCode', 'senatorialDistrict', 'stateOfOrigin', 'lgaOfOrigin', 'from', 'to', 'sample', 'sort'];

// Changing a parent filter clears the filters that depend on it.
const DEPENDENTS = { lga: ['wardCode', 'pollingUnitCode'], wardCode: ['pollingUnitCode'], stateOfOrigin: ['lgaOfOrigin'] };
const selectCls = 'h-10 rounded-[10px] border border-line-strong bg-white px-3 text-sm text-ink focus:border-forest-900 focus:outline-none focus:ring-3 focus:ring-gold-500/45 disabled:bg-mist disabled:text-slate-400';

export default function Agents() {
  const { api, base, user, demo } = useAdmin();
  const [params, setParams] = useSearchParams();
  const [q, setQ] = useState(params.get('q') ?? '');
  const query = params.toString();

  const { data, meta, loading, error, reload } = useFetch((signal) => api.get(`/agents?${query}`, { signal }), query);
  const config = useConfig();
  const lga = params.get('lga') ?? '';
  const wardCode = params.get('wardCode') ?? '';
  const stateOfOrigin = params.get('stateOfOrigin') ?? '';
  const wards = useFetch((signal) => (lga ? get(`/locations/wards?state=${STATE}&lga=${encodeURIComponent(lga)}`, { signal }) : null), lga);
  const units = useFetch((signal) => (lga && wardCode ? get(`/locations/polling-units?state=${STATE}&lga=${encodeURIComponent(lga)}&ward=${wardCode}`, { signal }) : null), `${lga}|${wardCode}`);
  const wardList = wards.data?.configured ? wards.data.wards : [];

  // Debounced search box.
  useEffect(() => {
    const t = setTimeout(() => {
      if ((params.get('q') ?? '') !== q) update({ q });
    }, 350);
    return () => clearTimeout(t);
  }, [q]); // eslint-disable-line react-hooks/exhaustive-deps

  function update(changes) {
    const next = new URLSearchParams(params);
    Object.entries(changes).forEach(([k, v]) => {
      if (v) next.set(k, v); else next.delete(k);
      (DEPENDENTS[k] ?? []).forEach((d) => next.delete(d));
    });
    if (!('page' in changes)) next.delete('page');
    setParams(next, { replace: true });
  }

  const active = FILTER_KEYS.some((k) => params.get(k));
  // Masked bank column, only for roles allowed to see identity and bank details.
  const showBank = can(user, 'agents:sensitive:read');
  const exportQuery = new URLSearchParams([...params].filter(([k]) => k !== 'page'));

  return (
    <>
      <PageHeader
        title="Registrations"
        description="Search, filter and review registrations for all four roles."
        actions={can(user, 'agents:export') && (
          demo
            ? <span className={buttonClass({ variant: 'secondary', className: 'opacity-55' })} aria-disabled="true"><Download className="size-4" aria-hidden />Export CSV</span>
            : (
              <>
                <a href={`/api/admin/exports/agents?${exportQuery}`} className={buttonClass({ variant: 'secondary' })} download><Download className="size-4" aria-hidden />Export CSV (masked)</a>
                {can(user, 'agents:sensitive:read') && (
                  <a
                    href={`/api/admin/exports/agents?${new URLSearchParams([...exportQuery, ['sensitive', 'full']])}`}
                    className={buttonClass({ variant: 'secondary' })}
                    download
                    onClick={(e) => { if (!window.confirm('This file will contain full NIN, VIN, party registration and bank account numbers. The export is logged. Store it securely and delete it when no longer needed. Continue?')) e.preventDefault(); }}
                  >
                    <Download className="size-4" aria-hidden />Export with identity and bank details
                  </a>
                )}
              </>
            )
        )}
      />

      <div className="rounded-[var(--radius-lg)] border border-line bg-white">
        <div className="flex flex-col gap-3 border-b border-line p-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" aria-hidden />
            <label htmlFor="agent-search" className="sr-only">Search registrations</label>
            <input id="agent-search" type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by reference, name, phone, email or polling unit code" className="h-11 w-full rounded-[10px] border border-line-strong bg-white pl-9 pr-3 text-[15px] focus:border-forest-900 focus:outline-none focus:ring-3 focus:ring-gold-500/45" />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <label className="sr-only" htmlFor="f-status">Status</label>
            <select id="f-status" className={selectCls} value={params.get('status') ?? ''} onChange={(e) => update({ status: e.target.value })}>
              <option value="">All statuses</option>
              {REGISTRATION_STATUSES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
            <label className="sr-only" htmlFor="f-category">Role</label>
            <select id="f-category" className={selectCls} value={params.get('agentCategory') ?? ''} onChange={(e) => update({ agentCategory: e.target.value })}>
              <option value="">All roles</option>
              {AGENT_CATEGORIES.map((a) => <option key={a.value} value={a.value}>{a.label}</option>)}
            </select>
            <label className="sr-only" htmlFor="f-lga">LGA</label>
            <select id="f-lga" className={selectCls} value={lga} onChange={(e) => update({ lga: e.target.value })}>
              <option value="">All LGAs</option>
              {LGA_NAMES.map((l) => <option key={l} value={l}>{l}</option>)}
            </select>
            <label className="sr-only" htmlFor="f-ward">Ward</label>
            <select id="f-ward" className={cx(selectCls, 'max-w-[220px]')} value={wardCode} disabled={!wardList.length} onChange={(e) => update({ wardCode: e.target.value })}>
              <option value="">{!lga ? 'Choose an LGA for wards' : wards.loading ? 'Loading wards…' : wardList.length ? 'All wards' : 'No ward data'}</option>
              {wardList.map((w) => <option key={w.code} value={w.code}>{w.name}</option>)}
            </select>
            <label className="sr-only" htmlFor="f-pu">Polling unit</label>
            <select id="f-pu" className={cx(selectCls, 'max-w-[240px]')} value={params.get('pollingUnitCode') ?? ''} disabled={!units.data?.length} onChange={(e) => update({ pollingUnitCode: e.target.value })}>
              <option value="">{!wardCode ? 'Choose a ward for polling units' : units.loading ? 'Loading polling units…' : 'All polling units'}</option>
              {(units.data ?? []).map((u) => <option key={u.code} value={u.code}>{u.code.slice(-3)} · {u.name}</option>)}
            </select>
            <label className="sr-only" htmlFor="f-senatorial">Senatorial district</label>
            <select id="f-senatorial" className={selectCls} value={params.get('senatorialDistrict') ?? ''} onChange={(e) => update({ senatorialDistrict: e.target.value })}>
              <option value="">All senatorial districts</option>
              {(config.senatorialDistricts ?? []).map((d) => <option key={d} value={d}>{d}</option>)}
            </select>
            <label className="sr-only" htmlFor="f-origin">State of origin</label>
            <select id="f-origin" className={selectCls} value={stateOfOrigin} onChange={(e) => update({ stateOfOrigin: e.target.value })}>
              <option value="">All states of origin</option>
              {STATE_NAMES.map((st) => <option key={st} value={st}>{stateLabel(st)}</option>)}
            </select>
            <label className="sr-only" htmlFor="f-origin-lga">LGA of origin</label>
            <select id="f-origin-lga" className={selectCls} value={params.get('lgaOfOrigin') ?? ''} disabled={!stateOfOrigin} onChange={(e) => update({ lgaOfOrigin: e.target.value })}>
              <option value="">{stateOfOrigin ? 'All LGAs of origin' : 'Choose a state of origin'}</option>
              {lgasOfState(stateOfOrigin).map((l) => <option key={l} value={l}>{l}</option>)}
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
            <EmptyState icon={Users} title={active ? 'No registrations match these filters' : 'No registrations yet'}>
              {active ? 'Try removing a filter or searching for something else.' : 'Registrations will appear here as people register.'}
            </EmptyState>
          </div>
        ) : (
          <div className={cx('overflow-x-auto transition-opacity', loading && 'opacity-60')} aria-busy={loading}>
            <table className="w-full min-w-[1080px]">
              <caption className="sr-only">Registrations</caption>
              <thead className="border-b border-line bg-paper">
                <tr>
                  <th scope="col" className={th}>Reference</th><th scope="col" className={th}>Name</th><th scope="col" className={th}>Role</th>
                  <th scope="col" className={th}>Phone</th><th scope="col" className={th}>LGA</th><th scope="col" className={th}>Ward</th>
                  <th scope="col" className={th}>Polling unit</th>{showBank && <th scope="col" className={th}>Bank account</th>}<th scope="col" className={th}>Status</th><th scope="col" className={th}>Registered</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {data.map((a) => (
                  <tr key={a._id} className="group relative hover:bg-paper">
                    <td className={td}>
                      <Link to={`${base}/agents/${a._id}`} className="font-mono text-[13px] font-semibold text-forest-900 after:absolute after:inset-0 hover:underline">{a.reference}</Link>
                    </td>
                    <td className={td}><span className="flex items-center gap-2 font-medium">{a.firstName} {a.lastName}{a.isSample && <SampleBadge />}</span></td>
                    <td className={`${td} whitespace-nowrap`}>{labelFor(AGENT_CATEGORIES, a.agentCategory)}</td>
                    <td className={`${td} whitespace-nowrap text-slate-600 tabular`}>{formatPhone(a.phone)}</td>
                    <td className={td}>{a.lga}</td>
                    <td className={`${td} max-w-[160px] truncate text-slate-600`} title={a.ward}>{a.ward ?? '–'}</td>
                    <td className={`${td} max-w-[200px] truncate text-slate-600`} title={a.pollingUnit ? `${a.pollingUnit} (${a.pollingUnitCode})` : undefined}>{a.pollingUnitCode ?? '–'}</td>
                    {showBank && <td className={`${td} whitespace-nowrap text-slate-600`}>{a.bankDetails?.bankName ? <>{a.bankDetails.bankName} <span className="font-mono">••••{a.bankDetails.accountNumberLast4}</span></> : '–'}</td>}
                    <td className={td}><StatusBadge status={a.status} /></td>
                    <td className={`${td} whitespace-nowrap text-slate-500`}>{formatDate(a.createdAt)}</td>
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
