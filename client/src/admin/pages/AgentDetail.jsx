import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { ArrowLeft, CircleCheck, CircleX, RotateCcw, Mail, Phone, MessageSquareText, Send, Download, ExternalLink, FileText, Trash2, Eye, ShieldAlert } from 'lucide-react';
import { useAdmin, can } from '../context.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { Card, PageHeader } from '../ui.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { TextArea, TextField, Checkbox } from '../../components/ui/Field.jsx';
import { Alert, Badge, Dialog, ErrorState, SampleBadge, Skeleton, StatusBadge, STATUS_LABEL } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { formatDate, formatDateTime, formatPhone, relativeTime } from '../../lib/format.js';
import { AGENT_CATEGORIES, DOCUMENT_KINDS, labelFor } from '../../../../shared/options.js';
import { formatBytes } from '../../../../shared/agentForm.js';
import { stateLabel } from '../../../../shared/nigeria.js';

const ACTIONS = {
  approved: { label: 'Approve registration', verb: 'Approve', icon: CircleCheck, variant: 'primary', body: 'Confirm that you have checked the passport photograph and voter’s card against the details given.' },
  rejected: { label: 'Decline registration', verb: 'Decline', icon: CircleX, variant: 'danger', body: 'The applicant will be told their registration was not approved at this time.' },
  pending: { label: 'Return to pending', verb: 'Return to pending', icon: RotateCcw, variant: 'secondary', body: 'The registration goes back into the review queue. No message is sent.' },
};

const titleCase = (s = '') => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function Row({ label, children }) {
  if (!children || (Array.isArray(children) && children.length === 0)) return null;
  return (
    <div className="grid gap-0.5 py-3 sm:grid-cols-[170px_1fr] sm:gap-4">
      <dt className="text-sm text-slate-500">{label}</dt>
      <dd className="text-[15px] text-ink">{children}</dd>
    </div>
  );
}

function StatusDialog({ target, agent, onClose, onDone }) {
  const { api } = useAdmin();
  const notify = useToast();
  const [reason, setReason] = useState('');
  const [send, setSend] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const action = ACTIONS[target];
  const canEmail = !agent.isSample && target !== 'pending';

  const confirm = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await api.patch(`/agents/${agent._id}/status`, { status: target, reason, notify: canEmail && send });
      notify(`${agent.reference} marked ${STATUS_LABEL[target].toLowerCase()}`);
      if (result.notification?.status === 'failed') notify('The decision email could not be sent. The status change was saved.', 'error');
      onDone(result);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title={`${action.verb} ${agent.firstName}’s registration?`} footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant={action.variant === 'secondary' ? 'dark' : action.variant} icon={action.icon} loading={busy} onClick={confirm}>{action.verb}</Button>
      </>
    }>
      <p className="text-[15px] text-slate-600">{action.body}</p>
      <div className="mt-4 grid gap-4">
        <TextArea label="Reason" optional rows={3} maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} hint="Recorded in the status history. Not shown to the applicant." />
        {canEmail && <Checkbox checked={send} onChange={setSend}>Email the decision to {agent.email}</Checkbox>}
        {agent.isSample && target !== 'pending' && <p className="text-sm text-slate-500">Sample records never receive messages.</p>}
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Dialog>
  );
}

function DeleteDialog({ agent, onClose }) {
  const { api, base } = useAdmin();
  const notify = useToast();
  const navigate = useNavigate();
  const [confirmReference, setConfirm] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const ready = confirmReference.trim().toUpperCase() === agent.reference && reason.trim().length >= 3;

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await api.del(`/agents/${agent._id}`, { confirmReference, reason });
      notify(`${agent.reference} and its documents were deleted`);
      navigate(`${base}/agents`, { replace: true });
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  };

  return (
    <Dialog open onClose={onClose} title="Permanently delete this registration?" footer={
      <>
        <Button variant="secondary" onClick={onClose}>Cancel</Button>
        <Button variant="danger" icon={Trash2} loading={busy} disabled={!ready} onClick={remove}>Delete permanently</Button>
      </>
    }>
      <p className="text-[15px] text-slate-600">This removes {agent.firstName} {agent.lastName}’s record, passport photograph and voter’s card. It cannot be undone. Use it for deletion requests and records past their retention period.</p>
      <div className="mt-4 grid gap-4">
        <TextArea label="Reason" rows={2} maxLength={300} value={reason} onChange={(e) => setReason(e.target.value)} hint="Kept in the audit log, which records only the reference." />
        <TextField label={`Type ${agent.reference} to confirm`} value={confirmReference} onChange={(e) => setConfirm(e.target.value)} autoComplete="off" spellCheck={false} inputClassName="font-mono uppercase" />
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Dialog>
  );
}

function Documents({ agent }) {
  const { user, demo } = useAdmin();
  const allowed = can(user, 'documents:read');
  const kinds = DOCUMENT_KINDS.filter((k) => agent.documents?.[k.value]);
  const src = (kind) => `/api/admin/agents/${agent._id}/documents/${kind}`;

  return (
    <Card title="Documents" description="Opening a document is recorded in the audit log.">
      <Alert tone="info" className="mb-4">
        Upload checks confirmed each file is a complete image or PDF of a usable size. They do not prove a voter’s card is genuine: compare the card with the details and photo before approving.
      </Alert>
      {!allowed ? (
        <p className="text-sm text-slate-500">Your role cannot open documents.</p>
      ) : kinds.length === 0 ? (
        <p className="text-sm text-slate-500">{agent.isSample || demo ? 'Sample records have no documents.' : 'No documents are on file.'}</p>
      ) : (
        <ul className="grid gap-5 sm:grid-cols-2">
          {kinds.map(({ value: kind, label }) => {
            const d = agent.documents[kind];
            const isPdf = d.contentType === 'application/pdf';
            return (
              <li key={kind} className="rounded-xl border border-line p-3">
                <p className="font-semibold text-ink">{label}</p>
                <p className="text-xs text-slate-500">{isPdf ? 'PDF' : `${d.width} × ${d.height} px`} · {formatBytes(d.bytes)} · uploaded {formatDate(d.uploadedAt)}</p>
                {isPdf ? (
                  <a href={src(kind)} className="mt-3 flex h-40 flex-col items-center justify-center gap-2 rounded-lg bg-mist text-sm font-semibold text-forest-900 hover:bg-green-50">
                    <FileText className="size-8" aria-hidden />Download PDF
                  </a>
                ) : (
                  <a href={src(kind)} target="_blank" rel="noreferrer" className="group mt-3 block overflow-hidden rounded-lg bg-mist ring-1 ring-line">
                    <img src={src(kind)} alt={`${label} uploaded by ${agent.firstName} ${agent.lastName}`} className={`w-full object-contain ${kind === 'pvc' ? 'aspect-[8/5]' : 'aspect-[4/5]'}`} loading="lazy" />
                  </a>
                )}
                <a href={src(kind)} target={isPdf ? undefined : '_blank'} rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 hover:underline">
                  {isPdf ? <><Download className="size-3.5" aria-hidden />Download</> : <><ExternalLink className="size-3.5" aria-hidden />Open full size</>}
                </a>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

function Nin({ agent }) {
  const { api, user } = useAdmin();
  const [nin, setNin] = useState(null);
  const [error, setError] = useState(null);
  if (!agent.nin?.last4) return null;
  const reveal = async () => {
    setError(null);
    try { setNin((await api.post(`/agents/${agent._id}/nin`)).nin); } catch (err) { setError(err.message); }
  };
  return (
    <Row label="NIN">
      <span className="flex flex-wrap items-center gap-3">
        <span className="font-mono tabular">{nin ?? `•••••••${agent.nin.last4}`}</span>
        {!nin && can(user, 'documents:read') && <button type="button" onClick={reveal} className="inline-flex items-center gap-1 text-sm font-semibold text-green-700 hover:underline"><Eye className="size-3.5" aria-hidden />Reveal (logged)</button>}
        {error && <span className="text-sm text-danger-700">{error}</span>}
      </span>
    </Row>
  );
}

function Notes({ agent, onAdded }) {
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
      onAdded(await api.post(`/agents/${agent._id}/notes`, { body }));
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
      {agent.notes.length === 0 ? <p className="text-sm text-slate-500">No notes yet.</p> : (
        <ul className="space-y-3">
          {[...agent.notes].reverse().map((n) => (
            <li key={n._id ?? n.createdAt} className="rounded-xl bg-paper p-3.5">
              <p className="whitespace-pre-line text-[15px] text-ink">{n.body}</p>
              <p className="mt-1.5 text-xs text-slate-500">{n.authorName} · {relativeTime(n.createdAt)}</p>
            </li>
          ))}
        </ul>
      )}
      {can(user, 'agents:review') && (
        <form onSubmit={add} className="mt-4 grid gap-3">
          <TextArea label="Add a note" rows={3} maxLength={2000} value={body} onChange={(e) => setBody(e.target.value)} />
          {error && <Alert tone="error">{error}</Alert>}
          <Button type="submit" variant="dark" size="sm" icon={MessageSquareText} loading={busy} disabled={!body.trim()} className="justify-self-start">Add note</Button>
        </form>
      )}
    </Card>
  );
}

export default function AgentDetail() {
  const { id } = useParams();
  const { api, base, user, demo } = useAdmin();
  const { data: a, loading, error, reload, setData } = useFetch((signal) => api.get(`/agents/${id}`, { signal }), id);
  const [target, setTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  if (loading) return <div className="space-y-4"><Skeleton className="h-10 w-72" /><Skeleton className="h-64" /><Skeleton className="h-48" /></div>;
  if (error) return <ErrorState error={error} onRetry={reload} />;

  const reviewer = can(user, 'agents:review');
  const options = ['approved', 'rejected', 'pending'].filter((s) => s !== a.status);
  const fullName = [a.firstName, a.middleName, a.lastName].filter(Boolean).join(' ');

  return (
    <>
      <PageHeader
        title={fullName}
        description={<span className="flex flex-wrap items-center gap-2"><span className="font-mono font-semibold text-forest-900">{a.reference}</span><StatusBadge status={a.status} /><Badge tone="info">{labelFor(AGENT_CATEGORIES, a.agentCategory)}</Badge>{a.isSample && <SampleBadge />}<span>Registered {formatDate(a.createdAt)}</span></span>}
        actions={reviewer && options.map((s) => {
          const act = ACTIONS[s];
          return <Button key={s} variant={act.variant} icon={act.icon} onClick={() => setTarget(s)}>{act.label}</Button>;
        })}
      >
        <Link to={`${base}/agents`} className="mb-3 inline-flex items-center gap-1.5 text-sm font-semibold text-green-700 hover:underline"><ArrowLeft className="size-4" aria-hidden />All registrations</Link>
      </PageHeader>

      {demo && <Alert tone="info" className="mb-6">This is a fictional sample record shown in the demonstration preview.</Alert>}

      <div className="grid gap-6 xl:grid-cols-[1.4fr_1fr]">
        <div className="space-y-6">
          <Card title="Registration" bodyClassName="py-2">
            <dl className="divide-y divide-line">
              <Row label="Agent category">{labelFor(AGENT_CATEGORIES, a.agentCategory)}</Row>
              <Row label="Email"><a href={`mailto:${a.email}`} className="inline-flex items-center gap-1.5 hover:underline"><Mail className="size-4 text-slate-400" aria-hidden />{a.email}</a></Row>
              <Row label="Phone">
                <span className="flex flex-wrap items-center gap-3">
                  <span className="tabular">{formatPhone(a.phone)}</span>
                  <a href={`tel:${a.phone}`} className="inline-flex items-center gap-1 text-sm font-semibold text-green-700 hover:underline"><Phone className="size-3.5" aria-hidden />Call</a>
                </span>
              </Row>
              <Row label="Date of birth">{a.dateOfBirth && formatDate(`${a.dateOfBirth}T12:00:00+01:00`)}</Row>
              <Nin agent={a} />
              <Row label="Origin">{a.lgaOfOrigin && `${a.lgaOfOrigin} LGA, ${stateLabel(a.stateOfOrigin)}`}</Row>
              <Row label="LGA">{`${a.lga} LGA, ${a.state ?? 'Lagos'} State`}</Row>
              <Row label="Ward">{a.ward && <>{a.ward}<span className="ml-1.5 text-sm text-slate-500 tabular">{a.wardCode}</span></>}</Row>
              <Row label="Polling unit">{a.pollingUnit}</Row>
              <Row label="Delimitation">{a.pollingUnitCode && <><span className="font-mono">{a.pollingUnitCode}</span>{a.senatorialDistrict && <span className="text-slate-500"> · {titleCase(a.senatorialDistrict)} senatorial district</span>}</>}</Row>
              <Row label="Consent">
                Processing and document storage agreed {formatDateTime(a.consent?.at)} (notice {a.consent?.noticeVersion}).
              </Row>
            </dl>
          </Card>
          <Documents agent={a} />
          <Notes agent={a} onAdded={(notes) => setData((d) => ({ ...d, notes }))} />
        </div>

        <div className="space-y-6">
          <Card title="Status history">
            <ol className="relative space-y-5 border-l-2 border-line pl-5">
              {[...a.statusHistory].reverse().map((h, i) => (
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
            {a.notifications.length === 0 ? <p className="text-sm text-slate-500">No messages recorded.</p> : (
              <ul className="space-y-2.5">
                {[...a.notifications].reverse().map((n, i) => (
                  <li key={i} className="flex items-start justify-between gap-3 text-sm">
                    <span><span className="flex items-center gap-1.5 font-medium text-ink"><Send className="size-3.5 text-slate-400" aria-hidden />{n.type.replace(/_/g, ' ')}</span><span className="text-slate-500">{formatDateTime(n.at)}{n.error ? ` · ${n.error}` : ''}</span></span>
                    <Badge tone={n.status === 'sent' ? 'approved' : n.status === 'failed' ? 'rejected' : 'neutral'}>{n.status}</Badge>
                  </li>
                ))}
              </ul>
            )}
          </Card>
          <Card title="Audit trail" description="Staff actions on this record">
            {!a.auditTrail?.length ? <p className="text-sm text-slate-500">No actions recorded.</p> : (
              <ul className="space-y-2.5">
                {a.auditTrail.slice(0, 15).map((e) => (
                  <li key={e._id} className="text-sm"><span className="font-medium text-ink">{e.actorName ?? 'System'}</span> <span className="text-slate-600">{e.summary}</span><span className="block text-xs text-slate-500">{formatDateTime(e.createdAt)}</span></li>
                ))}
              </ul>
            )}
          </Card>
          {can(user, 'agents:delete') && (
            <Card title="Delete registration">
              <p className="flex gap-2 text-sm text-slate-600"><ShieldAlert className="size-4 shrink-0 text-danger-700" aria-hidden />For deletion requests and records past their retention period. Removes the record and all documents.</p>
              <Button variant="secondary" size="sm" icon={Trash2} className="mt-3 text-danger-700" onClick={() => setDeleting(true)} disabled={demo}>Delete permanently</Button>
            </Card>
          )}
        </div>
      </div>

      {target && (
        <StatusDialog
          target={target}
          agent={a}
          onClose={() => setTarget(null)}
          onDone={(result) => { setTarget(null); setData((d) => ({ ...d, ...result, notifications: result.notification ? [...d.notifications, result.notification] : d.notifications })); }}
        />
      )}
      {deleting && <DeleteDialog agent={a} onClose={() => setDeleting(false)} />}
    </>
  );
}
