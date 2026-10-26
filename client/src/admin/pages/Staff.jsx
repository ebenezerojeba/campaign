import { useState } from 'react';
import { UserPlus } from 'lucide-react';
import { useAdmin } from '../context.jsx';
import { useFetch } from '../../lib/useFetch.js';
import { PageHeader, th, td } from '../ui.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { TextField, SelectField } from '../../components/ui/Field.jsx';
import { Alert, Badge, Dialog, ErrorState, Skeleton } from '../../components/ui/Feedback.jsx';
import { useToast } from '../../components/ui/Toast.jsx';
import { formatDateTime } from '../../lib/format.js';
import { accountRoleLabel } from '../../../../shared/options.js';

const ROLES = [
  { value: 'reviewer', label: 'Reviewer: view and decide on applications' },
  { value: 'admin', label: 'Administrator: full access, exports and staff management' },
];

function CreateStaff({ onClose, onCreated }) {
  const { api } = useAdmin();
  const notify = useToast();
  const [form, setForm] = useState({ name: '', email: '', role: 'reviewer', password: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api.post('/staff', form);
      notify('Staff account created');
      onCreated();
    } catch (err) {
      setErrors(err.fields ?? {});
      setError(err.message);
      setBusy(false);
    }
  };
  return (
    <Dialog open onClose={onClose} title="Add a staff account" footer={<><Button variant="secondary" onClick={onClose}>Cancel</Button><Button type="submit" form="staff-form" loading={busy}>Create account</Button></>}>
      <form id="staff-form" onSubmit={submit} className="grid gap-4" noValidate>
        <TextField label="Full name" value={form.name} onChange={set('name')} error={errors.name} />
        <TextField label="Email address" type="email" value={form.email} onChange={set('email')} error={errors.email} />
        <SelectField label="Role" options={ROLES} value={form.role} onChange={set('role')} />
        <TextField label="Temporary password" type="password" autoComplete="new-password" hint="At least 12 characters. Share it securely and ask them to change it." value={form.password} onChange={set('password')} error={errors.password} />
        {error && <Alert tone="error">{error}</Alert>}
      </form>
    </Dialog>
  );
}

export default function Staff() {
  const { api, user } = useAdmin();
  const notify = useToast();
  const { data, loading, error, reload } = useFetch((signal) => api.get('/staff', { signal }), 'staff');
  const [creating, setCreating] = useState(false);

  const toggle = async (s) => {
    try {
      await api.patch(`/staff/${s.id}`, { active: !s.active });
      notify(s.active ? 'Account deactivated' : 'Account reactivated');
      reload();
    } catch (err) {
      notify(err.message, 'error');
    }
  };

  return (
    <>
      <PageHeader title="Staff accounts" description="There is no public sign-up. Only administrators can add staff." actions={<Button icon={UserPlus} onClick={() => setCreating(true)}>Add staff</Button>} />
      <div className="rounded-[var(--radius-lg)] border border-line bg-white">
        {error ? <div className="p-4"><ErrorState error={error} onRetry={reload} /></div> : loading ? <div className="p-4"><Skeleton className="h-40" /></div> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px]">
              <thead className="border-b border-line bg-paper"><tr><th className={th}>Name</th><th className={th}>Role</th><th className={th}>Last sign-in</th><th className={th}>Status</th><th className={th}><span className="sr-only">Actions</span></th></tr></thead>
              <tbody className="divide-y divide-line">
                {data.map((s) => (
                  <tr key={s.id}>
                    <td className={td}><span className="font-medium">{s.name}</span><span className="block text-xs text-slate-500">{s.email}</span></td>
                    <td className={td}>{accountRoleLabel(s.role)}{s.assignment ? <span className="block text-xs text-slate-500">{s.assignment.ward ? `${s.assignment.ward} ward, ` : ''}{s.assignment.lga} LGA</span> : null}</td>
                    <td className={`${td} text-slate-500`}>{s.lastLoginAt ? formatDateTime(s.lastLoginAt) : 'Never'}</td>
                    <td className={td}><Badge tone={s.active ? 'approved' : 'neutral'}>{s.active ? 'Active' : 'Deactivated'}</Badge></td>
                    <td className={`${td} text-right`}>{String(s.id) !== String(user.id) && <Button size="sm" variant={s.active ? 'dangerSoft' : 'secondary'} onClick={() => toggle(s)}>{s.active ? 'Deactivate' : 'Reactivate'}</Button>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {creating && <CreateStaff onClose={() => setCreating(false)} onCreated={() => { setCreating(false); reload(); }} />}
    </>
  );
}
