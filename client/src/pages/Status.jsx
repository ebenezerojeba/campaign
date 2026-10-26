import { useState } from 'react';
import { Link } from 'react-router';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { Search, CircleCheck, Hourglass, CircleX, CircleSlash } from 'lucide-react';
import { Turnstile, useCaptchaSiteKey } from '../components/Turnstile.jsx';
import { Button } from '../components/ui/Button.jsx';
import { TextField } from '../components/ui/Field.jsx';
import { Alert } from '../components/ui/Feedback.jsx';
import { statusLookupSchema } from '../../../shared/schemas.js';
import { post } from '../lib/api.js';
import { formatDate } from '../lib/format.js';

const RESULT = {
  pending: { Icon: Hourglass, tone: 'bg-gold-50 border-gold-200', iconCls: 'text-gold-600', title: 'Your registration is being reviewed', body: 'The coordination team is checking your details and documents. We will email you when a decision is made.' },
  approved: { Icon: CircleCheck, tone: 'bg-green-50 border-green-100', iconCls: 'text-green-700', title: 'Your registration has been approved', body: 'The coordination team will contact you by email with your next steps.' },
  rejected: { Icon: CircleX, tone: 'bg-danger-50 border-[#f1c9c4]', iconCls: 'text-danger-700', title: 'Your registration was not approved', body: 'If you think your details or documents were incorrect, contact the coordination team with your reference.' },
  cancelled: { Icon: CircleSlash, tone: 'bg-mist border-line', iconCls: 'text-slate-500', title: 'Your registration was cancelled', body: 'If you did not ask for this, contact the coordination team with your reference.' },
  revoked: { Icon: CircleSlash, tone: 'bg-mist border-line', iconCls: 'text-slate-500', title: 'Your assignment was revoked', body: 'Your registration was approved, but you no longer hold the position. Contact the coordination team with your reference if you have questions.' },
};

export default function Status() {
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const { register, handleSubmit, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(statusLookupSchema), mode: 'onTouched' });
  const captchaOn = Boolean(useCaptchaSiteKey());
  const [captcha, setCaptcha] = useState('');
  const [attempt, setAttempt] = useState(0);

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    setResult(null);
    if (captchaOn && !captcha) { setError({ message: 'Complete the security check first.' }); return; }
    try {
      setResult(await post('/agents/status', { ...values, ...(captcha ? { captcha } : {}) }));
    } catch (err) {
      setError(err);
    } finally {
      // Each token works once: get a new one for the next check.
      if (captchaOn) { setCaptcha(''); setAttempt((n) => n + 1); }
    }
  });

  const r = result && RESULT[result.status];

  return (
    <div className="bg-mist py-12 sm:py-20">
      <div className="container-page max-w-xl">
        <h1 className="type-h2 text-forest-900">Check your registration</h1>
        <p className="type-lead mt-3 text-slate-600">Enter the reference you received when you registered and the phone number you used.</p>

        <form onSubmit={onSubmit} noValidate className="mt-8 grid gap-5 rounded-[var(--radius-xl)] border border-line bg-paper p-5 shadow-soft sm:p-7">
          <TextField label="Registration reference" placeholder="LAG-7K3M-9QPX" autoCapitalize="characters" autoComplete="off" spellCheck={false} inputClassName="font-mono uppercase tracking-wider" error={errors.reference?.message} {...register('reference')} />
          <TextField label="Phone number" type="tel" inputMode="tel" autoComplete="tel-national" placeholder="0803 123 4567" error={errors.phone?.message} {...register('phone')} />
          <Turnstile onToken={setCaptcha} resetKey={attempt} />
          <Button type="submit" size="lg" icon={Search} loading={isSubmitting} loadingText="Checking">Check status</Button>
        </form>

        <div aria-live="polite" className="mt-6">
          {error && <Alert tone={error.status === 404 ? 'warning' : 'error'} title={error.status === 404 ? 'No matching registration' : 'We could not check your status'}>{error.message}</Alert>}
          {r && (
            <div className={`flex gap-4 rounded-xl border p-5 ${r.tone}`}>
              <r.Icon className={`size-7 shrink-0 ${r.iconCls}`} aria-hidden />
              <div>
                <p className="font-display text-xl font-semibold text-forest-900">{result.firstName}, {r.title.charAt(0).toLowerCase() + r.title.slice(1)}</p>
                <p className="mt-1 text-[15px] text-slate-600">{r.body}</p>
                <p className="mt-3 text-sm text-slate-500">Submitted {formatDate(result.submittedAt)}{result.reviewedAt ? `, reviewed ${formatDate(result.reviewedAt)}` : ''}</p>
              </div>
            </div>
          )}
        </div>

        <p className="mt-8 text-[15px] text-slate-600">Not registered yet? <Link to="/register" className="font-semibold text-green-700 underline underline-offset-4">Start registration</Link></p>
      </div>
    </div>
  );
}
