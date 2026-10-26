import { useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { LogIn, Eye, Lock } from 'lucide-react';
import { Logo } from '../../components/brand/Logo.jsx';
import { AdireTile } from '../../components/brand/Adire.jsx';
import { Button, ButtonLink } from '../../components/ui/Button.jsx';
import { TextField } from '../../components/ui/Field.jsx';
import { Alert } from '../../components/ui/Feedback.jsx';
import { api } from '../../lib/api.js';
import { useConfig } from '../../lib/config.jsx';

const schema = z.object({
  email: z.string().trim().email('Enter your email address'),
  password: z.string().min(1, 'Enter your password'),
});

export default function Login() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const config = useConfig();
  const [error, setError] = useState(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema) });
  const dbMissing = config.loaded && config.reachable && !config.registrationOpen;

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await api('/admin/auth/login', { method: 'POST', body: values });
      const next = params.get('next');
      navigate(next && next.startsWith('/admin') && !next.startsWith('/admin/login') ? next : '/admin', { replace: true });
    } catch (err) {
      setError(err.message);
    }
  });

  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_minmax(0,0.9fr)]">
      <div className="flex flex-col px-5 py-8 sm:px-10">
        <Logo />
        <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">
          <span className="flex size-12 items-center justify-center rounded-xl bg-mist text-forest-900"><Lock className="size-6" aria-hidden /></span>
          <h1 className="mt-6 font-display text-3xl font-bold tracking-tight text-forest-900">Sign in</h1>
          <p className="mt-2 text-[15px] text-slate-500">For APC Lagos staff and approved collation officers. There is no public sign-up: staff accounts are created by an administrator, and collation officers receive an invitation by email.</p>

          {params.get('expired') && <Alert tone="info" className="mt-6">Your session ended. Sign in again to continue.</Alert>}
          {dbMissing && (
            <Alert tone="warning" className="mt-6" title="Database not connected" action={<ButtonLink to="/admin/preview" size="sm" variant="secondary" icon={Eye}>Open the demonstration preview</ButtonLink>}>
              Staff sign-in needs the registration database. You can explore the dashboard with fictional sample data in the meantime.
            </Alert>
          )}

          <form onSubmit={onSubmit} noValidate className="mt-6 grid gap-5">
            <TextField label="Email address" type="email" autoComplete="username" error={errors.email?.message} {...register('email')} />
            <TextField label="Password" type="password" autoComplete="current-password" error={errors.password?.message} {...register('password')} />
            {error && <Alert tone="error">{error}</Alert>}
            <Button type="submit" size="lg" icon={LogIn} loading={isSubmitting} loadingText="Signing in" disabled={dbMissing}>Sign in</Button>
          </form>
          <p className="mt-8 text-sm text-slate-500"><Link to="/" className="font-semibold text-green-700 hover:underline">Return to the public site</Link></p>
        </div>
      </div>
      <div className="relative hidden overflow-hidden bg-forest-900 lg:block" aria-hidden>
        <div className="grid h-full grid-cols-3 grid-rows-4 gap-2 p-2">
          {[['oniko', 'forest'], ['dots', 'gold'], ['lagoon', 'green'], ['stitch', 'deep'], ['leaf', 'mist'], ['sun', 'gold'], ['chevron', 'green'], ['checks', 'forest'], ['oniko', 'deep'], ['lagoon', 'deep'], ['oniko', 'gold'], ['dots', 'green']].map(([mo, p], i) => (
            <AdireTile key={i} motif={mo} palette={p} className="size-full rounded-xl" />
          ))}
        </div>
      </div>
    </div>
  );
}
