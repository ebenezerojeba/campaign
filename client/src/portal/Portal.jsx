import { useCallback, useEffect, useState } from 'react';
import { Link, NavLink, Navigate, Route, Routes } from 'react-router';
import { useForm, Controller } from 'react-hook-form';
import { LogOut, Mail, KeyRound, Megaphone, Compass, UserRound, ShieldCheck, Hourglass, CircleCheck, CircleX, Download, Save, Heart, HeartOff } from 'lucide-react';
import { Button } from '../components/ui/Button.jsx';
import { TextField, ChoiceGroup, Checkbox, TextArea, SelectField } from '../components/ui/Field.jsx';
import { Alert, Badge, EmptyState, ErrorState, Skeleton, Spinner, SampleBadge } from '../components/ui/Feedback.jsx';
import { useToast } from '../components/ui/Toast.jsx';
import { OpportunityCard } from '../components/OpportunityCard.jsx';
import { api, ApiError } from '../lib/api.js';
import { useFetch } from '../lib/useFetch.js';
import { formatDate, cx } from '../lib/format.js';
import { CONTACT_METHODS, AGENT_TYPES, INTERESTS, SKILLS, AVAILABILITY, PARTICIPATION_FORMATS, labelFor } from '../../../shared/options.js';

const p = (path, opts) => api(`/portal${path}`, opts);

function SignIn({ onSignedIn }) {
  const [stage, setStage] = useState('email');
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const requestCode = async (e) => {
    e.preventDefault();
    setError(null);
    if (!/^\S+@\S+\.\S+$/.test(email)) return setError('Enter the email address you registered with.');
    setBusy(true);
    try {
      await p('/auth/request-code', { method: 'POST', body: { email } });
      setStage('code');
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
    return undefined;
  };

  const verify = async (e) => {
    e.preventDefault();
    setError(null);
    if (!/^\d{6}$/.test(code)) return setError('Enter the 6-digit code from the email.');
    setBusy(true);
    try {
      await p('/auth/verify', { method: 'POST', body: { email, code } });
      onSignedIn();
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
    return undefined;
  };

  return (
    <div className="bg-mist py-12 sm:py-20">
      <div className="container-page max-w-md">
        <h1 className="type-h2 text-forest-900">Volunteer sign in</h1>
        <p className="type-lead mt-3 text-slate-600">{stage === 'email' ? 'We’ll email you a one-time code. No password needed.' : `If ${email} is registered, a 6-digit code is on its way. It expires in 10 minutes.`}</p>
        <div className="mt-8 rounded-[var(--radius-xl)] border border-line bg-paper p-5 shadow-soft sm:p-7">
          {stage === 'email' ? (
            <form onSubmit={requestCode} noValidate className="grid gap-5">
              <TextField label="Email address" type="email" inputMode="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              {error && <Alert tone="error">{error}</Alert>}
              <Button type="submit" size="lg" icon={Mail} loading={busy} loadingText="Sending code">Email me a code</Button>
            </form>
          ) : (
            <form onSubmit={verify} noValidate className="grid gap-5">
              <TextField label="6-digit code" inputMode="numeric" autoComplete="one-time-code" maxLength={6} value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))} inputClassName="font-mono text-2xl tracking-[0.5em]" />
              {error && <Alert tone="error">{error}</Alert>}
              <Button type="submit" size="lg" icon={KeyRound} loading={busy} loadingText="Checking">Sign in</Button>
              <button type="button" className="text-sm font-semibold text-green-700 hover:underline" onClick={() => { setStage('email'); setCode(''); setError(null); }}>Use a different email or send a new code</button>
            </form>
          )}
        </div>
        <p className="mt-6 text-[15px] text-slate-600">Registered without an email? <Link to="/status" className="font-semibold text-green-700 underline underline-offset-4">Check your status with your reference</Link></p>
      </div>
    </div>
  );
}

const STATUS = {
  pending: { Icon: Hourglass, cls: 'text-gold-600', title: 'Your application is being reviewed', body: 'The programme team will contact you when a decision is made.' },
  approved: { Icon: CircleCheck, cls: 'text-green-700', title: 'You are an approved volunteer', body: 'Browse opportunities and register your interest in activities.' },
  rejected: { Icon: CircleX, cls: 'text-danger-700', title: 'Your application was not approved', body: 'You can still update your details or ask us to delete your record.' },
};

function Home({ me }) {
  const { data, loading, error, reload } = useFetch((signal) => p('/announcements', { signal }), 'ann');
  const s = STATUS[me.status];
  return (
    <div className="grid gap-6">
      <div className="flex gap-4 rounded-[var(--radius-lg)] border border-line bg-white p-5 sm:p-6">
        <s.Icon className={cx('size-8 shrink-0', s.cls)} aria-hidden />
        <div>
          <h2 className="font-display text-2xl font-semibold text-forest-900">{s.title}</h2>
          <p className="mt-1 text-[15px] text-slate-600">{s.body}</p>
          <p className="mt-3 text-sm text-slate-500">Reference <span className="font-mono font-semibold text-forest-900">{me.reference}</span> · Registered {formatDate(me.createdAt)}</p>
        </div>
      </div>
      <section aria-labelledby="ann-title">
        <h2 id="ann-title" className="font-display text-2xl font-semibold text-forest-900">Announcements</h2>
        <div className="mt-4">
          {error ? <ErrorState error={error} onRetry={reload} /> : loading ? <Skeleton className="h-32" /> : data.length === 0 ? (
            <EmptyState icon={Megaphone} title="No announcements yet">News from the programme team will appear here.</EmptyState>
          ) : (
            <ul className="space-y-3">
              {data.map((a) => (
                <li key={a._id} className="rounded-[var(--radius-lg)] border border-line bg-white p-5">
                  <p className="flex items-center gap-2 text-sm text-slate-500">{formatDate(a.publishedAt)}{a.isSample && <SampleBadge />}</p>
                  <h3 className="mt-1 font-display text-xl font-semibold text-forest-900">{a.title}</h3>
                  <p className="mt-2 whitespace-pre-line text-[15px] leading-relaxed text-slate-600">{a.body}</p>
                </li>
              ))}
            </ul>
          )}
        </div>
      </section>
    </div>
  );
}

function Opportunities({ me }) {
  const notify = useToast();
  const { data, loading, error, reload, setData } = useFetch((signal) => p('/opportunities', { signal }), 'opps');
  const [busy, setBusy] = useState(null);
  const toggle = async (o) => {
    setBusy(o._id);
    try {
      const { myStatus } = await p(`/opportunities/${o._id}/interest`, { method: 'POST' });
      setData((list) => list.map((x) => (x._id === o._id ? { ...x, myStatus } : x)));
      notify(myStatus === 'interested' ? 'Interest registered. The team will be in touch.' : 'Interest withdrawn');
    } catch (err) {
      notify(err.message, 'error');
    } finally {
      setBusy(null);
    }
  };
  if (error) return <ErrorState error={error} onRetry={reload} />;
  if (loading) return <div className="grid gap-6 md:grid-cols-2"><Skeleton className="h-80" /><Skeleton className="h-80" /></div>;
  if (data.length === 0) return <EmptyState icon={Compass} title="No opportunities published yet">The programme team will publish activities here.</EmptyState>;
  return (
    <div className="grid gap-6">
      {me.status !== 'approved' && <Alert tone="info">You can register interest in activities once your application is approved.</Alert>}
      <div className="grid gap-6 md:grid-cols-2">
        {data.map((o) => (
          <OpportunityCard key={o._id} item={o} action={
            o.myStatus === 'assigned' ? <Badge tone="approved" dot>You are assigned to this activity</Badge>
              : me.status === 'approved' && (
                <Button size="sm" variant={o.myStatus === 'interested' ? 'secondary' : 'primary'} icon={o.myStatus === 'interested' ? HeartOff : Heart} loading={busy === o._id} onClick={() => toggle(o)}>
                  {o.myStatus === 'interested' ? 'Withdraw interest' : 'I’m interested'}
                </Button>
              )
          } />
        ))}
      </div>
    </div>
  );
}

function Profile({ me, onUpdated }) {
  const notify = useToast();
  const [error, setError] = useState(null);
  const { register, control, handleSubmit, formState: { isSubmitting, isDirty }, reset } = useForm({
    defaultValues: {
      contactMethod: me.contactMethod, community: me.community ?? '', interests: me.interests, skills: me.skills,
      availability: me.availability, participationFormat: me.participationFormat, consentCommunications: me.consentCommunications,
    },
  });
  const save = handleSubmit(async (values) => {
    setError(null);
    try {
      const updated = await p('/me', { method: 'PATCH', body: values });
      onUpdated(updated);
      reset(values);
      notify('Your details were saved');
    } catch (err) {
      setError(Object.values(err.fields ?? {})[0] ?? err.message);
    }
  });
  const contactOptions = me.email ? CONTACT_METHODS : CONTACT_METHODS.filter((c) => c.value !== 'email');
  return (
    <form onSubmit={save} className="grid gap-6">
      <div className="rounded-[var(--radius-lg)] border border-line bg-white p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold text-forest-900">Your details</h2>
        <dl className="mt-4 grid gap-3 text-[15px] sm:grid-cols-2">
          <div><dt className="text-sm text-slate-500">Name</dt><dd>{me.firstName} {me.lastName}</dd></div>
          <div><dt className="text-sm text-slate-500">Phone</dt><dd>{me.phone}</dd></div>
          <div><dt className="text-sm text-slate-500">Email</dt><dd>{me.email}</dd></div>
          <div><dt className="text-sm text-slate-500">LGA</dt><dd>{me.lga}{me.lcda && me.lcda !== me.lga ? ` (${me.lcda})` : ''}</dd></div>
          <div><dt className="text-sm text-slate-500">Agent type</dt><dd>{me.agentType ? labelFor(AGENT_TYPES, me.agentType) : 'Not recorded'}</dd></div>
          {me.stateOfOrigin && <div><dt className="text-sm text-slate-500">Origin</dt><dd>{me.lgaOfOrigin}, {me.stateOfOrigin}</dd></div>}
          {me.ward && <div><dt className="text-sm text-slate-500">Ward</dt><dd>{me.ward}</dd></div>}
          {me.pollingUnit && <div><dt className="text-sm text-slate-500">Polling unit</dt><dd>{me.pollingUnit} <span className="text-slate-500 tabular">({me.pollingUnitCode})</span></dd></div>}
        </dl>
        <p className="mt-4 text-sm text-slate-500">To change your name, phone, email, LGA, ward or polling unit, send a correction request from the Privacy tab so the team can verify it.</p>
      </div>
      <div className="grid gap-6 rounded-[var(--radius-lg)] border border-line bg-white p-5 sm:p-6">
        <Controller control={control} name="contactMethod" render={({ field }) => <ChoiceGroup legend="Preferred contact method" type="radio" name="contactMethod" options={contactOptions} value={field.value} onChange={field.onChange} />} />
        <TextField label="Community" optional {...register('community')} className="sm:max-w-md" />
        <Controller control={control} name="interests" render={({ field }) => <ChoiceGroup legend="Areas of interest" options={INTERESTS} value={field.value} onChange={field.onChange} />} />
        <Controller control={control} name="skills" render={({ field }) => <ChoiceGroup legend="Skills" optional options={SKILLS} value={field.value} onChange={field.onChange} />} />
        <Controller control={control} name="availability" render={({ field }) => <ChoiceGroup legend="When you are usually free" options={AVAILABILITY} value={field.value} onChange={field.onChange} />} />
        <Controller control={control} name="participationFormat" render={({ field }) => <ChoiceGroup legend="How you take part" type="radio" name="participationFormat" columns={3} options={PARTICIPATION_FORMATS} value={field.value} onChange={field.onChange} />} />
        <Controller control={control} name="consentCommunications" render={({ field }) => <Checkbox checked={field.value} onChange={field.onChange} description="You can change this at any time.">Send me news about upcoming programme activities and events.</Checkbox>} />
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" icon={Save} loading={isSubmitting} disabled={!isDirty} className="justify-self-start">Save changes</Button>
      </div>
    </form>
  );
}

function Privacy() {
  const notify = useToast();
  const { data, loading, reload } = useFetch((signal) => p('/requests', { signal }), 'req');
  const [type, setType] = useState('correction');
  const [details, setDetails] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await p('/requests', { method: 'POST', body: { type, details } });
      notify('Request sent to the programme team');
      setDetails('');
      reload();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-6">
      <div className="rounded-[var(--radius-lg)] border border-line bg-white p-5 sm:p-6">
        <h2 className="font-display text-xl font-semibold text-forest-900">Download your information</h2>
        <p className="mt-1 text-[15px] text-slate-600">A copy of everything you gave us, as a file you can keep.</p>
        <a href="/api/portal/me/export" download className="mt-4 inline-flex h-11 items-center gap-2 rounded-[10px] border border-line-strong bg-white px-5 text-[15px] font-semibold text-forest-900 hover:bg-mist"><Download className="size-4" aria-hidden />Download my data</a>
      </div>
      <form onSubmit={submit} className="grid gap-5 rounded-[var(--radius-lg)] border border-line bg-white p-5 sm:p-6">
        <div>
          <h2 className="font-display text-xl font-semibold text-forest-900">Ask for a correction or deletion</h2>
          <p className="mt-1 text-[15px] text-slate-600">Under the Nigeria Data Protection Act 2023 you can ask us to correct or delete your record. The team responds by your preferred contact method.</p>
        </div>
        <SelectField label="Request" value={type} onChange={(e) => setType(e.target.value)} options={[{ value: 'correction', label: 'Correct my details' }, { value: 'deletion', label: 'Delete my record and leave the programme' }]} />
        <TextArea label={type === 'correction' ? 'What needs correcting?' : 'Anything we should know?'} optional={type === 'deletion'} rows={3} maxLength={1000} value={details} onChange={(e) => setDetails(e.target.value)} />
        {error && <Alert tone="error">{error}</Alert>}
        <Button type="submit" variant={type === 'deletion' ? 'danger' : 'primary'} loading={busy} className="justify-self-start">Send request</Button>
      </form>
      {!loading && data?.length > 0 && (
        <div className="rounded-[var(--radius-lg)] border border-line bg-white p-5 sm:p-6">
          <h2 className="font-display text-xl font-semibold text-forest-900">Your requests</h2>
          <ul className="mt-3 divide-y divide-line">
            {data.map((r) => <li key={r._id} className="flex justify-between gap-3 py-2.5 text-[15px]"><span className="capitalize">{r.type} · {formatDate(r.createdAt)}</span><Badge tone={r.status === 'open' ? 'pending' : 'approved'}>{r.status}</Badge></li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

const TABS = [
  { to: '', label: 'Overview', icon: Megaphone, end: true },
  { to: 'opportunities', label: 'Opportunities', icon: Compass },
  { to: 'profile', label: 'Profile', icon: UserRound },
  { to: 'privacy', label: 'Privacy', icon: ShieldCheck },
];

export default function Portal() {
  const [me, setMe] = useState(undefined);
  const [error, setError] = useState(null);

  const load = useCallback(() => {
    p('/me').then(setMe).catch((err) => {
      if (err instanceof ApiError && err.status === 401) setMe(null);
      else { setError(err); setMe(null); }
    });
  }, []);
  useEffect(load, [load]);

  const signOut = async () => {
    await p('/auth/logout', { method: 'POST' }).catch(() => {});
    setMe(null);
  };

  if (me === undefined) return <Spinner className="min-h-[50vh]" />;
  if (error && error.status !== 401) {
    return (
      <div className="container-page max-w-xl py-16">
        <ErrorState error={error} onRetry={() => { setError(null); setMe(undefined); load(); }} />
      </div>
    );
  }
  if (!me) return <SignIn onSignedIn={() => { setMe(undefined); load(); }} />;

  return (
    <div className="bg-mist pb-20">
      <div className="border-b border-line bg-white">
        <div className="container-page flex flex-wrap items-end justify-between gap-4 pt-8">
          <div className="pb-4">
            <p className="text-sm text-slate-500">Volunteer account</p>
            <h1 className="type-h2 mt-1 text-forest-900">Hello, {me.firstName}</h1>
          </div>
          <Button variant="ghost" icon={LogOut} onClick={signOut} className="mb-4">Sign out</Button>
          <nav aria-label="Account" className="-mb-px flex w-full gap-1 overflow-x-auto">
            {TABS.map(({ to, label, icon: Icon, end }) => (
              <NavLink key={label} to={to ? `/portal/${to}` : '/portal'} end={end} className={({ isActive }) => cx('flex items-center gap-2 whitespace-nowrap border-b-2 px-3 py-3 text-[15px] font-semibold', isActive ? 'border-forest-900 text-forest-900' : 'border-transparent text-slate-500 hover:text-forest-900')}>
                <Icon className="size-4" aria-hidden />{label}
              </NavLink>
            ))}
          </nav>
        </div>
      </div>
      <div className="container-page max-w-4xl pt-8">
        <Routes>
          <Route index element={<Home me={me} />} />
          <Route path="opportunities" element={<Opportunities me={me} />} />
          <Route path="profile" element={<Profile me={me} onUpdated={setMe} />} />
          <Route path="privacy" element={<Privacy />} />
          <Route path="*" element={<Navigate to="/portal" replace />} />
        </Routes>
      </div>
    </div>
  );
}
