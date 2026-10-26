import { useEffect, useState } from 'react';
import { Link } from 'react-router';
import { KeyRound, CircleCheck } from 'lucide-react';
import { Logo } from '../../components/brand/Logo.jsx';
import { Button } from '../../components/ui/Button.jsx';
import { TextField } from '../../components/ui/Field.jsx';
import { Alert } from '../../components/ui/Feedback.jsx';
import { post } from '../../lib/api.js';

// From the emailed invitation. The token is in the URL fragment (after #), so
// it is never sent to the server in a request line or a Referer header; it is
// removed from the address bar as soon as it is read.
export default function SetPassword() {
  const [token, setToken] = useState('');
  const [values, setValues] = useState({ password: '', confirm: '' });
  const [errors, setErrors] = useState({});
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const t = new URLSearchParams(window.location.hash.slice(1)).get('token') ?? '';
    setToken(t);
    if (window.location.hash) window.history.replaceState(null, '', window.location.pathname);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErrors({});
    setError(null);
    if (values.password.length < 12) { setErrors({ password: 'Use at least 12 characters' }); return; }
    if (values.password !== values.confirm) { setErrors({ confirm: 'The two passwords do not match' }); return; }
    setBusy(true);
    try {
      await post('/admin/auth/set-password', { token, password: values.password });
      setDone(true);
    } catch (err) {
      setErrors(err.fields ?? {});
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-mist px-4 py-12">
      <div className="w-full max-w-md rounded-[var(--radius-xl)] border border-line bg-paper p-6 shadow-soft sm:p-8">
        <Logo />
        <h1 className="mt-6 font-display text-2xl font-semibold text-forest-900">Set your dashboard password</h1>
        {done ? (
          <>
            <Alert tone="success" className="mt-5" title="Your password is set">You can now sign in to your collation officer dashboard.</Alert>
            <Link to="/admin/login" className="mt-5 inline-flex items-center gap-2 font-semibold text-green-700 underline underline-offset-4"><CircleCheck className="size-4" aria-hidden />Go to sign in</Link>
          </>
        ) : !token ? (
          <Alert tone="warning" className="mt-5" title="This link is incomplete">Open the link from your invitation email again, or ask the coordination team to send a new one.</Alert>
        ) : (
          <form onSubmit={submit} noValidate className="mt-5 grid gap-4">
            <p className="text-[15px] text-slate-600">Choose a password of at least 12 characters. A few unrelated words work well. This link works once.</p>
            <TextField label="New password" type="password" autoComplete="new-password" value={values.password} onChange={(e) => setValues((v) => ({ ...v, password: e.target.value }))} error={errors.password} />
            <TextField label="Repeat the password" type="password" autoComplete="new-password" value={values.confirm} onChange={(e) => setValues((v) => ({ ...v, confirm: e.target.value }))} error={errors.confirm} />
            {error && !Object.keys(errors).length && <Alert tone="error">{error}</Alert>}
            <Button type="submit" icon={KeyRound} loading={busy} loadingText="Saving">Set password</Button>
          </form>
        )}
      </div>
    </div>
  );
}
