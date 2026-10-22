import { useState } from 'react';
import { Link, useParams } from 'react-router';
import { ArrowLeft, CircleCheck, CircleX, RotateCcw, Mail, Phone, MessageCircle, MessageSquareText, Send } from 'lucide-react';
import { useAdmin, can } from '../context.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { Card, PageHeader } from '../ui.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { TextArea, Checkbox, SelectField } from '../../components/ui/Field.jsx';
import { Alert, Badge, Dialog, ErrorState, SampleBadge, Skeleton, StatusBadge, STATUS_LABEL } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { formatDate, formatDateTime, formatPhone, relativeTime } from '../../lib/format.js';
import { whatsappLink } from '../../lib/config.jsx';
import {
  AGENT_TYPES, INTERESTS, SKILLS, AVAILABILITY, CONTACT_METHODS, PARTICIPATION_FORMATS, labelFor,
} from '../../../../shared/options.js';
import { stateLabel } from '../../../../shared/nigeria.js';

const ACTIONS = {
  approved: { label: 'Approve application', verb: 'Approve', icon: CircleCheck, variant: 'primary', body: 'The volunteer will be able to register interest in activities and sign in to their volunteer account.' },
  rejected: { label: 'Decline application', verb: 'Decline', icon: CircleX, variant: 'danger', body: 'The applicant will be told their application was not approved at this time.' },
  pending: { label: 'Return to pending', verb: 'Return to pending', icon: RotateCcw, variant: 'secondary', body: 'The application goes back into the review queue. No message is sent.' },
};

function Row({ label, children }) {
  if (!children || (Array.isArray(children) && children.length === 0)) return null;
  return (
    <div className="grid gap-0.5 py-3 sm:grid-cols-[170px_1fr] sm:gap-4">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-[15px] text-ink">{children}</dd>
    </div>
  );
}

const Chips = ({ list, values }) => (
  <ul className="flex flex-wrap gap-1.5">{values.map((v) => <li key={v} className="rounded-md bg-mist px-2 py-0.5 text-sm font-medium text-forest-800">{labelFor(list, v)}</li>)}</ul>
);

function StatusDialog({ target, volunteer, onClose, onDone }) {
  const { api } = useAdmin();
  const notify = useToast();
  const [reason, setReason] = useState('');
  const [send, setSend] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const action = ACTIONS[target];
  const canEmail = volunteer.email && !volunteer.isSample && target !== 'pending';

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.patch(`/volunteers/${volunteer._id}/status`, { status: target, reason, notify: canEmail && send });
      notify(`${volunteer.reference} marked ${STATUS_LABEL[target].toLowerCase()}`);
      if (result.notification?.status === 'failed') notify('The decision email could not be sent. The status change was saved.', 'error');
      onDone(result);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={`${action.verb} ${volunteer.firstName}’s application?`} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant={action.variant === 'secondary' ? 'dark' : action.variant} icon={action.icon} loading={busy} onClick={confirm}>{action.verb}</Button>
      </>
    }>
      <p className="text-[15px] text-slate-600">{action.body}</p>
      <div className="mt-4 grid gap-4">
        <TextArea label="Reason" optional rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} hint="Recorded in the status history. Not shown to the applicant." />
        {canEmail && <Checkbox checked={send} onChange={setSend}>Email the decision to {volunteer.email}</Checkbox>}
        {!canEmail && target !== 'pending' && <p className="text-sm text-slate-500">{volunteer.isSample ? 'Sample records never receive messages.' : `No email address: contact them ${CONTACT_METHODS.find((c) => c.value === volunteer.contactMethod)?.phrase ?? 'by phone'}.`}</p>}
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Dialog>
  );
}

function Notes({ volunteer, onAdded }) {
  const { api, user } = useAdmin();
  const notify = useToast();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const add = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setBusy(true);
    setError(null);
    try {
      onAdded(await api.post(`/volunteers/${volunteer._id}/notes`, { body }));
      setBody('');
      notify('Note added');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title="Internal notes" description="Visible to staff only">
      {volunteer.notes.length === 0 ? <p className="text-sm text-slate-500">No notes yet.</p> : (
        <ul className="space-y-3">
          {[...volunteer.notes].reverse().map((n) => (
            <li key={n._id ?? n.createdAt} className="rounded-xl bg-paper p-3.5">
              <p className="whitespace-pre-line text-[15px] text-ink">{n.body}</p>
              <p className="mt-1.5 text-xs text-slate-500">{n.authorName} · {relativeTime(n.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
      {can(user, 'volunteers:review') && (
        <form onSubmit={add} className="mt-4 grid gap-3">
          <TextArea label="Add a note" rows={3} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" variant="dark" size="sm" icon={MessageSquareText} loading={busy} disabled={!body.trim()} className="justify-self-start">Add note</Button>
        </form>
      )}
    </Card>
  );
}

function Assignments({ volunteer, onChange }) {
  const { api, user } = useAdmin();
  const notify = useToast();
  const { data: opps } = useFetch((signal) => api.get('/opportunities?status=published', { signal }), 'published-opps');
  const [oppId, setOppId] = useState('');
  const [busy, setBusy] = useState(false);
  const manage = can(user, 'opportunities:manage');

  const assign = async (opportunityId, status) => {
    setBusy(true);
    try {
      onChange(await api.put(`/volunteers/${volunteer._id}/assignments`, { opportunityId, status }));
      notify(status === 'assigned' ? 'Volunteer assigned' : 'Assignment updated');
      setOppId('');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(false);
    }
  };

  const title = (a) => a.opportunity?.title ?? opps?.find((o) => o._id === (a.opportunity?._id ?? a.opportunity))?.title ?? 'Opportunity';
  return (
    <Card title="Activities">
      {volunteer.assignments.length === 0 ? <p className="text-sm text-slate-500">Not linked to any activities yet.</p> : (
        <ul className="divide-y divide-line">
          {volunteer.assignments.map((a) => {
            const id = a.opportunity?._id ?? a.opportunity;
            return (
              <li key={id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                <span className="text-[15px] font-medium">{title(a)}</span>
                <span className="flex items-center gap-2">
                  <Badge tone={a.status === 'assigned' ? 'approved' : a.status === 'interested' ? 'info' : 'neutral'}>{a.status === 'assigned' ? 'Assigned' : a.status === 'interested' ? 'Interested' : 'Withdrawn'}</Badge>
                  {manage && a.status === 'interested' && volunteer.status === 'approved' && <Button size="sm" variant="secondary" disabled={busy} onClick={() => assign(id, 'assigned')}>Assign</Button>}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {manage && volunteer.status === 'approved' && opps?.length > 0 && (
        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-end">
          <SelectField label="Assign to an activity" className="flex-1" placeholder="Choose an opportunity" value={oppId} onChange={(e) => setOppId(e.target.value)} options={opps.map((o) => ({ value: o._id, label: o.title }))} />
          <Button variant="dark" disabled={!oppId || busy} onClick={() => assign(oppId, 'assigned')}>Assign</Button>
        </div>
      )}
      {volunteer.status !== 'approved' && <p className="mt-3 text-sm text-slate-500">Approve the application before assigning activities.</p>}
    </Card>
  );
}

export default function VolunteerDetail() {
  const { id } = useParams();
  const { api, base, user, demo } = useAdmin();
  const { data: v, loading, error, reload, setData } = useFetch((signal) => api.get(`/volunteers/${id}`, { signal }), id);
  const [target, setTarget] = useState(null);

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-64" /><Skeleton className="h-48" /></div>;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const wa = v.contactMethod === 'whatsapp' ? whatsappLink(v.phone) : '';
  const reviewer = can(user, 'volunteers:review');
  const options = ['approved', 'rejected', 'pending'].filter((s) => s !== v.status);

  return (
    <>
      <PageHeader
        title={`${v.firstName} ${v.lastName}`}
        description={<span className="flex flex-wrap items-center gap-2"><span className="font-mono font-semibold text-forest-900">{v.reference}</span><StatusBadge status={v.status} />{v.isSample && <SampleBadge />}<span>Registered {formatDate(v.createdAt)}</span></span>}
        actions={reviewer && options.map((s) => {
          const a = ACTIONS[s];
          return <Button key={s} variant={a.variant} icon={a.icon} onClick={() => setTarget(s)}>{a.label}</Button>;
        })}
      >
        <Link to={`${base}/volunteers`} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 hover:underline"><ArrowLeft className="size-4" aria-hidden />All volunteers</Link>
      </PageHeader>

      {demo && <Alert tone="info" className="mb-6">This is a fictional sample record shown in the demonstration preview.</Alert>}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card title="Application" bodyClassName="py-2">
            <dl className="divide-y divide-line">
              <Row label="Phone">
                <span className="flex flex-wrap items-center gap-3">
                  <span className="tabular">{formatPhone(v.phone)}</span>
                  <a href={`tel:${v.phone}`} className="inline-flex items-center gap-1 text-sm font-semibold text-green-700 hover:underline"><Phone className="size-3.5" aria-hidden />Call</a>
                  {wa && <a href={wa} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-sm font-semibold text-green-700 hover:underline"><MessageCircle className="size-3.5" aria-hidden />WhatsApp</a>}
                </span>
              </Row>
              <Row label="Email">{v.email && <a href={`mailto:${v.email}`} className="inline-flex items-center gap-1.5 hover:underline"><Mail className="size-4 text-slate-400" aria-hidden />{v.email}</a>}</Row>
              <Row label="Contact by">{labelFor(CONTACT_METHODS, v.contactMethod)}</Row>
              <Row label="Agent type">{v.agentType ? labelFor(AGENT_TYPES, v.agentType) : <span className="text-slate-500">Not recorded</span>}</Row>
              <Row label="Origin">{v.lgaOfOrigin ? `${v.lgaOfOrigin} LGA, ${stateLabel(v.stateOfOrigin)}` : <span className="text-slate-500">Not recorded</span>}</Row>
              <Row label="Residence">{[v.community, v.lcda && v.lcda !== v.lga ? `${v.lcda} LCDA` : null, `${v.lga} LGA`, `${v.state ?? 'Lagos'} State`].filter(Boolean).join(', ')}</Row>
              <Row label="Senatorial district">{v.senatorialDistrict}</Row>
              <Row label="Ward">{v.ward && <>{v.ward}{v.wardCode && <span className="ml-1.5 text-sm text-slate-500 tabular">{v.wardCode}</span>}</>}</Row>
              <Row label="Polling unit">{v.pollingUnit && <>{v.pollingUnit}<span className="ml-1.5 font-mono text-sm text-slate-500">{v.pollingUnitCode}</span></>}</Row>
              <Row label="Interests"><Chips list={INTERESTS} values={v.interests} /></Row>
              <Row label="Skills">{v.skills.length > 0 && <Chips list={SKILLS} values={v.skills} />}</Row>
              <Row label="Availability">{v.availability.map((a) => labelFor(AVAILABILITY, a)).join(', ')}</Row>
              <Row label="Takes part">{labelFor(PARTICIPATION_FORMATS, v.participationFormat)}</Row>
              <Row label="Why volunteer">{v.motivation && <span className="whitespace-pre-line">{v.motivation}</span>}</Row>
              <Row label="Consent">
                Data processing agreed {formatDateTime(v.consent?.at)} (notice {v.consent?.noticeVersion}). Communications: {v.consent?.communications ? 'opted in' : 'not opted in'}.
              </Row>
            </dl>
          </Card>
          <Assignments volunteer={v} onChange={(assignments) => setData((d) => ({ ...d, assignments }))} />
          <Notes volunteer={v} onAdded={(notes) => setData((d) => ({ ...d, notes }))} />
        </div>

        <div className="space-y-6">
          <Card title="Status history">
            <ol className="relative space-y-5 border-l-2 border-line pl-5">
              {[...v.statusHistory].reverse().map((h, i) => (
                <li key={`${h.at}-${i}`} className="relative">
                  <span className="absolute -left-[27px] top-1 size-3 rounded-full border-2 border-white bg-forest-900 ring-2 ring-line" aria-hidden />
                  <p className="text-[15px] font-semibold text-ink">{STATUS_LABEL[h.to] ?? h.to}</p>
                  <p className="text-sm text-slate-500">{formatDateTime(h.at)}{h.byName ? ` by ${h.byName}` : ''}</p>
                  {h.reason && <p className="mt-1 text-sm text-slate-600">{h.reason}</p>}
                </li>
              ))}
            </ol>
          </Card>
          <Card title="Messages sent">
            {v.notifications.length === 0 ? <p className="text-sm text-slate-500">No messages recorded.</p> : (
              <ul className="space-y-2.5">
                {[...v.notifications].reverse().map((n, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 text-sm">
                    <span><span className="flex items-center gap-1.5 font-medium text-ink"><Send className="size-3.5 text-slate-400" aria-hidden />{n.type.replace(/_/g, ' ')}</span><span className="text-slate-500">{formatDateTime(n.at)}{n.error ? ` · ${n.error}` : ''}</span></span>
                    <Badge tone={n.status === 'sent' ? 'approved' : n.status === 'failed' ? 'rejected' : 'neutral'}>{n.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Audit trail" description="Staff actions on this record">
            {!v.auditTrail?.length ? <p className="text-sm text-slate-500">No actions recorded.</p> : (
              <ul className="space-y-2.5">
                {v.auditTrail.slice(0, 15).map((a) => (
                  <li key={a._id} className="text-sm"><span className="font-medium text-ink">{a.actorName ?? 'System'}</span> <span className="text-slate-600">{a.summary}</span><span className="block text-xs text-slate-500">{formatDateTime(a.createdAt)}</span></li>
                ))}
              </ul>
            )}
          </Card>
        </div>
      </div>

      {target && (
        <StatusDialog
          target={target}
          volunteer={v}
          onClose={() => setTarget(null)}
          onDone={(result) => { setTarget(null); setData((d) => ({ ...d, ...result, notifications: result.notification ? [...d.notifications, result.notification] : d.notifications })); }}
        />
      )}
    </>
  );
}
