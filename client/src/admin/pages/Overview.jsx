import { useState } from 'react';
import { Link } from 'react-router';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { Users, Hourglass, CircleCheck, CircleX, ArrowRight, Download, Mail, Send } from 'lucide-react';
import { useAdmin, can } from '../context.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { PageHeader, Card, StatTile, BarList, th, td } from '../ui.jsx';
import { Badge, StatusBadge, SampleBadge, Skeleton, ErrorState, EmptyState } from '../../components/ui/Feedback.jsx';
import { formatShortDate, relativeTime, formatNumber, formatDateTime } from '../../lib/format.js';
import { AGENT_CATEGORIES, labelFor } from '../../../../shared/options.js';

function TrendTooltip({ active, payload }) {
  if (!active || !payload?.length) return null;
  const p = payload[0].payload;
  return (
    <div className="rounded-lg border border-line bg-white px-3 py-2 text-sm shadow-soft">
      <p className="text-slate-500">{formatShortDate(`${p.date}T12:00:00+01:00`)}</p>
      <p className="font-semibold text-forest-900 tabular">{formatNumber(p.registrations)} {p.registrations === 1 ? 'registration' : 'registrations'}</p>
    </div>
  );
}

function Trend({ data }) {
  const total = data.reduce((t, d) => t + d.registrations, 0);
  return (
    <Card title="Registrations, last 30 days" description={`${formatNumber(total)} new registrations`} className="lg:col-span-2" bodyClassName="p-3 pt-5 sm:p-5">
      <div className="h-64" role="img" aria-label={`Line chart of daily registrations over the last 30 days, ${total} in total.`}>
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 4, right: 8, left: -18, bottom: 0 }}>
            <defs>
              <linearGradient id="trendFill" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#12813C" stopOpacity={0.18} />
                <stop offset="100%" stopColor="#12813C" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} stroke="#E6ECE8" />
            <XAxis dataKey="date" tickFormatter={(d) => formatShortDate(`${d}T12:00:00+01:00`)} tick={{ fontSize: 12, fill: '#5B665F' }} tickLine={false} axisLine={{ stroke: '#DCE4DE' }} interval="preserveStartEnd" minTickGap={28} />
            <YAxis allowDecimals={false} tick={{ fontSize: 12, fill: '#5B665F' }} tickLine={false} axisLine={false} width={44} />
            <Tooltip content={<TrendTooltip />} cursor={{ stroke: '#0E2A1C', strokeWidth: 1, strokeDasharray: '3 3' }} />
            <Area type="monotone" dataKey="registrations" stroke="#12813C" strokeWidth={2} fill="url(#trendFill)" activeDot={{ r: 5, stroke: '#fff', strokeWidth: 2, fill: '#12813C' }} />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </Card>
  );
}

const EMAIL_TYPES = [['registration_confirmation', 'Confirmations'], ['admin_alert', 'Admin alerts'], ['decision', 'Decisions'], ['admin_digest', 'Hourly summaries']];

// Outbox health: queued and delivered counts, provider pauses and the latest
// refusal reason. Hidden when the status cannot be loaded (e.g. the preview).
function EmailDelivery() {
  const { api, user, demo } = useAdmin();
  const notify = useToast();
  const { data, error, reload } = useFetch((signal) => api.get('/email/status', { signal }), 'email-status');
  const [busy, setBusy] = useState(false);
  if (error || !data || demo) return null;
  const sum = (status) => Object.values(data.counts).reduce((t, c) => t + (c[status] ?? 0), 0);
  const waiting = sum('queued') + sum('sending');
  const drain = async () => {
    setBusy(true);
    try {
      const r = await api.post('/email/drain');
      notify(r.sent ? `${r.sent} email${r.sent === 1 ? '' : 's'} accepted by the mail server` : r.stoppedBy === 'paused' ? 'The mail server asked us to wait. Sending resumes automatically.' : 'Nothing could be sent right now.');
      reload();
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Email delivery" description={`Sent at up to ${data.limits.perMinute} a minute and ${data.limits.perHour} an hour to stay within the mail provider's limits. “Accepted” does not confirm inbox delivery.`}
      actions={can(user, 'agents:review') && <Button size="sm" variant="secondary" icon={Send} loading={busy} disabled={!waiting} onClick={drain}>Send queued emails now</Button>}>
      <div className="grid gap-4 sm:grid-cols-3">
        <div><p className="text-sm text-slate-500">Waiting to send</p><p className="font-display text-2xl font-bold tabular text-forest-900">{formatNumber(waiting)}</p>{data.oldestQueuedAt && <p className="text-xs text-slate-500">oldest {relativeTime(data.oldestQueuedAt)}</p>}</div>
        <div><p className="text-sm text-slate-500">Accepted by mail server</p><p className="font-display text-2xl font-bold tabular text-forest-900">{formatNumber(sum('sent'))}</p><p className="text-xs text-slate-500">{data.sentThisHour} this hour</p></div>
        <div><p className="text-sm text-slate-500">Failed after retries</p><p className="font-display text-2xl font-bold tabular text-forest-900">{formatNumber(sum('failed'))}</p></div>
      </div>
      <ul className="mt-4 grid gap-1 text-sm text-slate-600 sm:grid-cols-2">
        {EMAIL_TYPES.filter(([t]) => data.counts[t]).map(([t, label]) => (
          <li key={t} className="flex items-center gap-2"><Mail className="size-3.5 text-slate-400" aria-hidden />{label}: {formatNumber(data.counts[t].sent ?? 0)} accepted, {formatNumber((data.counts[t].queued ?? 0) + (data.counts[t].sending ?? 0))} waiting, {formatNumber(data.counts[t].failed ?? 0)} failed</li>
        ))}
      </ul>
      {data.pausedUntil && <p className="mt-4 rounded-lg border border-line bg-mist px-3 py-2 text-sm text-ink">Sending paused until {formatDateTime(data.pausedUntil)} ({data.pauseReason === 'rateLimited' ? 'the mail server asked us to slow down' : data.pauseReason === 'auth' ? 'mail server login failed: check SMTP settings' : data.pauseReason === 'sender' ? 'the mail provider refused the sender: check the sender and domain authentication in Brevo' : 'mail server unavailable'}). It resumes automatically.</p>}
      {data.recentRefusals[0] && <p className="mt-3 text-xs text-slate-500">Latest refusal: {data.recentRefusals[0].code} {data.recentRefusals[0].reason ?? ''} ({formatDateTime(data.recentRefusals[0].last)})</p>}
      <p className="mt-3 text-xs text-slate-500">Admin alerts: {data.adminAlertMode === 'digest' ? 'one hourly summary' : data.adminAlertMode === 'off' ? 'switched off, so all sending goes to applicants. New registrations appear here in the dashboard' : 'one email per registration'}.</p>
    </Card>
  );
}

export default function Overview() {
  const { api, base, user } = useAdmin();
  const { data, loading, error, reload } = useFetch((signal) => api.get('/dashboard', { signal }), 'dashboard');

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-64" />
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <Skeleton key={i} className="h-32" />)}</div>
        <div className="grid gap-6 lg:grid-cols-3"><Skeleton className="h-80 lg:col-span-2" /><Skeleton className="h-80" /></div>
      </div>
    );
  }
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const { totals } = data;
  return (
    <>
      <PageHeader
        title={`Welcome, ${user.name.split(' ')[0]}`}
        description="Polling unit agent registrations across Lagos State."
        actions={data.sampleCount > 0 && <Badge tone="sample">{formatNumber(data.sampleCount)} sample records included</Badge>}
      />

      {totals.all === 0 ? (
        <EmptyState icon={Users} title="No registrations yet" action={<a href="/register" target="_blank" className="font-semibold text-green-700 underline underline-offset-4">Open the registration form</a>}>
          When agents register, their registrations appear here for review.
        </EmptyState>
      ) : (
        <div className="space-y-6">
          <EmailDelivery />
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatTile label="Total registrations" value={totals.all} icon={Users} />
            <StatTile label="Pending review" value={totals.pending} icon={Hourglass} tone="pending" />
            <StatTile label="Approved" value={totals.approved} icon={CircleCheck} tone="approved" hint={totals.all ? `${Math.round((totals.approved / totals.all) * 100)}% of all registrations` : undefined} />
            <StatTile label="Not approved" value={totals.rejected} icon={CircleX} tone="rejected" />
          </div>

          {data.officerPosts && (
            <Card title="Collation officer posts" actions={<Link to={`${base}/officers`} className="text-sm font-semibold text-green-700 hover:underline">See all posts</Link>}>
              <div className="grid gap-4 sm:grid-cols-2">
                {[['LGA Collation Officers', data.officerPosts.lga], ['Ward Collation Officers', data.officerPosts.ward]].map(([label, p]) => (
                  <div key={label} className="rounded-xl border border-line p-4">
                    <p className="text-sm text-slate-500">{label}</p>
                    <p className="mt-1 font-display text-2xl font-semibold text-forest-900 tabular">{formatNumber(p.filled)} <span className="text-base font-normal text-slate-500">of {formatNumber(p.capacity)} filled</span></p>
                    <p className="mt-1 text-sm text-slate-600">{formatNumber(p.approved)} approved · {formatNumber(p.vacant)} vacant{p.contested ? ` · ${formatNumber(p.contested)} contested` : ''}</p>
                    {!p.reconciled && <p className="mt-2 text-sm text-danger-700">The configured total does not match the official data ({p.locations} locations).</p>}
                  </div>
                ))}
              </div>
            </Card>
          )}

          <div className="grid gap-6 lg:grid-cols-3">
            <Trend data={data.trend} />
            <Card title="Needs attention">
              <ul className="space-y-3">
                <li>
                  <Link to={`${base}/agents?status=pending`} className="flex items-center justify-between gap-3 rounded-xl border border-line p-4 hover:border-forest-900">
                    <span className="flex items-center gap-3"><Hourglass className="size-5 text-gold-600" aria-hidden /><span><span className="block font-semibold text-ink">{formatNumber(totals.pending)} pending registrations</span><span className="text-sm text-slate-500">Check documents and decide</span></span></span>
                    <ArrowRight className="size-4 text-slate-400" aria-hidden />
                  </Link>
                </li>
                {user.permissions.includes('agents:export') && (
                  <li>
                    <Link to={`${base}/agents?status=approved`} className="flex items-center justify-between gap-3 rounded-xl border border-line p-4 hover:border-forest-900">
                      <span className="flex items-center gap-3"><Download className="size-5 text-green-700" aria-hidden /><span><span className="block font-semibold text-ink">{formatNumber(totals.approved)} approved agents</span><span className="text-sm text-slate-500">Filter by polling unit and export</span></span></span>
                      <ArrowRight className="size-4 text-slate-400" aria-hidden />
                    </Link>
                  </li>
                )}
              </ul>
            </Card>
          </div>

          <div className="grid gap-6 lg:grid-cols-2">
            <Card title="Registrations by LGA" description={`${data.byLga.length} of 20 local government areas represented`}>
              <BarList items={data.byLga.slice(0, 10).map((l) => ({ label: l.lga, value: l.total }))} />
              {data.byLga.length > 10 && (
                <details className="mt-3">
                  <summary className="cursor-pointer text-sm font-semibold text-green-700">Show all {data.byLga.length} LGAs</summary>
                  <BarList className="mt-3" max={data.byLga[0]?.total} items={data.byLga.slice(10).map((l) => ({ label: l.lga, value: l.total }))} />
                </details>
              )}
            </Card>
            <Card title="Registrations by agent type">
              <BarList items={data.byCategory.map((c) => ({ label: c.label, value: c.count }))} />
            </Card>
          </div>

          <Card title="Recent registrations" actions={<Link to={`${base}/agents`} className="text-sm font-semibold text-green-700 hover:underline">View all</Link>} bodyClassName="p-0">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px]">
                <thead className="border-b border-line bg-paper"><tr><th className={th}>Reference</th><th className={th}>Name</th><th className={th}>Agent type</th><th className={th}>LGA</th><th className={th}>Status</th><th className={th}>Registered</th></tr></thead>
                <tbody className="divide-y divide-line">
                  {data.recent.map((v) => (
                    <tr key={v._id} className="hover:bg-paper">
                      <td className={td}><Link to={`${base}/agents/${v._id}`} className="font-mono text-[13px] font-semibold text-forest-900 hover:underline">{v.reference}</Link></td>
                      <td className={td}><span className="flex items-center gap-2">{v.firstName} {v.lastName}{v.isSample && <SampleBadge />}</span></td>
                      <td className={td}>{labelFor(AGENT_CATEGORIES, v.agentCategory)}</td>
                      <td className={td}>{v.lga}</td>
                      <td className={td}><StatusBadge status={v.status} /></td>
                      <td className={`${td} text-slate-500`}>{relativeTime(v.createdAt)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}
    </>
  );
}
