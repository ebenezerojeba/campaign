import { useState } from 'react';
import { Megaphone, Plus, Pencil } from 'lucide-react';
import { useAdmin } from '../context.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { PageHeader } from '../ui.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { TextField, TextArea } from '../../components/ui/Field.jsx';
import { Alert, Badge, Dialog, EmptyState, ErrorState, Skeleton } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { formatDate } from '../../lib/format.js';

function Editor({ item, onClose, onSaved }) {
  const { api } = useAdmin();
  const notify = useToast();
  const [title, setTitle] = useState(item?.title ?? '');
  const [body, setBody] = useState(item?.body ?? '');
  const [busy, setBusy] = useState(null);
  const [error, setError] = useState(null);

  const save = async (status) => {
    setBusy(status);
    setError(null);
    try {
      const payload = { title, body, status };
      const saved = item ? await api.patch(`/announcements/${item._id}`, payload) : await api.post('/announcements', payload);
      notify(status === 'published' ? 'Announcement published' : status === 'archived' ? 'Announcement archived' : 'Draft saved');
      onSaved(saved);
    } catch (err) {
      setError(Object.values(err.fields ?? {})[0] ?? err.message);
      setBusy(null);
    }
  };

  return (
    <Dialog open onClose={onClose} size="lg" title={item ? 'Edit announcement' : 'New announcement'} footer={
      <>
        {item && <Button variant="dangerSoft" loading={busy === 'archived'} onClick={() => save('archived')}>Archive</Button>}
        <Button variant="secondary" loading={busy === 'draft'} onClick={() => save('draft')}>Save as draft</Button>
        <Button loading={busy === 'published'} onClick={() => save('published')}>Publish to volunteers</Button>
      </>
    }>
      <div className="grid gap-4">
        <TextField label="Title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} />
        <TextArea label="Message" rows={7} maxLength={3000} value={body} onChange={(e) => setBody(e.target.value)} hint="Shown to signed-in volunteers in their account." />
        {error && <Alert tone="error">{error}</Alert>}
      </div>
    </Dialog>
  );
}

export default function Announcements() {
  const { api } = useAdmin();
  const { data, loading, error, reload } = useFetch((signal) => api.get('/announcements', { signal }), 'ann');
  const [editing, setEditing] = useState(undefined);

  return (
    <>
      <PageHeader title="Announcements" description="Messages for signed-in volunteers." actions={<Button icon={Plus} onClick={() => setEditing(null)}>New announcement</Button>} />
      {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <Skeleton className="h-48" /> : data.length === 0 ? (
        <EmptyState icon={Megaphone} title="No announcements yet" action={<Button icon={Plus} onClick={() => setEditing(null)}>Write the first one</Button>}>Published announcements appear in every volunteer’s account.</EmptyState>
      ) : (
        <ul className="space-y-3">
          {data.map((a) => (
            <li key={a._id} className="rounded-[var(--radius-lg)] border border-line bg-white p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h2 className="font-display text-xl font-semibold text-forest-900">{a.title}</h2>
                  <p className="mt-1 flex items-center gap-2 text-sm text-slate-500"><Badge tone={a.status === 'published' ? 'approved' : 'neutral'}>{a.status === 'published' ? 'Published' : 'Draft'}</Badge>{a.isSample && <Badge tone="sample">Sample</Badge>}{a.publishedAt ? formatDate(a.publishedAt) : `Created ${formatDate(a.createdAt)}`}</p>
                </div>
                <Button variant="secondary" size="sm" icon={Pencil} onClick={() => setEditing(a)}>Edit</Button>
              </div>
              <p className="mt-3 line-clamp-3 whitespace-pre-line text-[15px] text-slate-600">{a.body}</p>
            </li>
          ))}
        </ul>
      )}
      {editing !== undefined && <Editor item={editing} onClose={() => setEditing(undefined)} onSaved={() => { setEditing(undefined); reload(); }} />}
    </>
  );
}
