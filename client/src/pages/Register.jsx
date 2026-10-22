import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { m, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Pencil, ShieldCheck, Clock, Smartphone, Send, RotateCw } from 'lucide-react';
import { Button } from '../components/ui/Button.jsx';
import { TextField, SelectField, TextArea, ChoiceGroup, Checkbox } from '../components/ui/Field.jsx';
import { Combobox } from '../components/ui/Combobox.jsx';
import { Alert } from '../components/ui/Feedback.jsx';
import { RegistrationSuccess } from '../components/RegistrationSuccess.jsx';
import { STEP_SCHEMAS, STEP_FIELDS } from '../../../shared/schemas.js';
import { LAGOS_AREAS, lcdasFor, STATE } from '../../../shared/lagos.js';
import { STATE_NAMES, lgasOfState, stateLabel } from '../../../shared/nigeria.js';
import { CONTACT_METHODS, AGENT_TYPES, INTERESTS, SKILLS, AVAILABILITY, PARTICIPATION_FORMATS, labelFor } from '../../../shared/options.js';
import { privacyNotice } from '../content/site.js';
import { get, post } from '../lib/api.js';
import { useConfig } from '../lib/config.jsx';
import { cx } from '../lib/format.js';

const STEPS = [
  { title: 'Your details', short: 'Details' },
  { title: 'Where you are from and live', short: 'Location' },
  { title: 'How you can help', short: 'Interests' },
  { title: 'Review and submit', short: 'Review' },
];

const DRAFT_KEY = 'apc-registration-draft';
const SUCCESS_KEY = 'apc-registration-success';
const CONSENT_FIELDS = ['ageConfirmed', 'consentProcessing', 'consentCommunications'];

const EMPTY = {
  firstName: '', lastName: '', email: '', phone: '', contactMethod: '', agentType: '',
  stateOfOrigin: '', lgaOfOrigin: '',
  state: STATE, lga: '', lcda: '', wardCode: '', pollingUnitCode: '', ward: '', pollingUnitName: '', community: '', electoralRequired: false,
  interests: [], skills: [], availability: [], participationFormat: '', motivation: '',
  ageConfirmed: false, consentProcessing: false, consentCommunications: false, website: '',
};

const storage = {
  read(key) {
    try { return JSON.parse(sessionStorage.getItem(key) || 'null'); } catch { return null; }
  },
  write(key, value) {
    try { sessionStorage.setItem(key, JSON.stringify(value)); } catch { /* storage unavailable */ }
  },
  remove(key) {
    try { sessionStorage.removeItem(key); } catch { /* storage unavailable */ }
  },
};

function Progress({ step, onJump, maxReached }) {
  return (
    <nav aria-label="Application progress">
      <ol className="grid grid-cols-4 gap-2">
        {STEPS.map((s, i) => {
          const done = i < step;
          const current = i === step;
          const reachable = i <= maxReached && !current;
          return (
            <li key={s.title}>
              <button
                type="button"
                onClick={() => reachable && onJump(i)}
                disabled={!reachable}
                aria-current={current ? 'step' : undefined}
                className="group flex w-full flex-col gap-2 text-left disabled:cursor-default"
              >
                <span className={cx('h-1.5 w-full rounded-full transition-colors duration-300', done ? 'bg-green-600' : current ? 'bg-forest-900' : 'bg-line')} />
                <span className={cx('flex items-center gap-1.5 text-[13px] font-semibold sm:text-sm', current ? 'text-forest-900' : done ? 'text-green-700' : 'text-slate-400', reachable && 'group-hover:underline')}>
                  {done && <Check className="size-3.5" strokeWidth={3} aria-hidden />}
                  <span className="sm:hidden">{s.short}</span>
                  <span className="hidden sm:inline">{s.title}</span>
                  <span className="sr-only">{done ? ' (completed)' : current ? ' (current step)' : ''}</span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

function StepPersonal({ register, errors, control, watch }) {
  const contact = watch('contactMethod');
  return (
    <div className="grid gap-6">
      <div className="grid gap-6 sm:grid-cols-2">
        <TextField label="First name" autoComplete="given-name" error={errors.firstName?.message} {...register('firstName')} />
        <TextField label="Last name" autoComplete="family-name" error={errors.lastName?.message} {...register('lastName')} />
      </div>
      <TextField
        label="Phone number"
        hint="A Nigerian mobile number. We use it to contact you and to confirm your status checks."
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        placeholder="0803 123 4567"
        error={errors.phone?.message}
        {...register('phone')}
      />
      <TextField
        label="Email address"
        optional={contact !== 'email'}
        hint="Add one to receive your confirmation by email and to sign in to your volunteer account later."
        type="email"
        inputMode="email"
        autoComplete="email"
        placeholder="you@example.com"
        error={errors.email?.message}
        {...register('email')}
      />
      <Controller
        control={control}
        name="contactMethod"
        render={({ field }) => (
          <ChoiceGroup legend="How should we contact you?" type="radio" name="contactMethod" options={CONTACT_METHODS} value={field.value} onChange={field.onChange} error={errors.contactMethod?.message} />
        )}
      />
      <SelectField
        label="Agent type"
        placeholder="Choose agent type"
        options={AGENT_TYPES}
        className="sm:max-w-sm"
        error={errors.agentType?.message}
        {...register('agentType')}
      />
    </div>
  );
}

// Official ward and polling-unit lists, fetched per LGA and ward and kept for
// the session so moving between steps does not refetch.
const locationCache = new Map();

function useLocationList(path) {
  const [state, setState] = useState(() => (path && locationCache.has(path) ? { status: 'ready', data: locationCache.get(path) } : { status: path ? 'loading' : 'idle' }));
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    if (!path) { setState({ status: 'idle' }); return undefined; }
    if (locationCache.has(path)) { setState({ status: 'ready', data: locationCache.get(path) }); return undefined; }
    const controller = new AbortController();
    setState({ status: 'loading' });
    get(path, { signal: controller.signal })
      .then((data) => { locationCache.set(path, data); setState({ status: 'ready', data }); })
      .catch((error) => { if (error.name !== 'AbortError') setState({ status: 'error', error }); });
    return () => controller.abort();
  }, [path, attempt]);
  return { ...state, retry: () => setAttempt((n) => n + 1) };
}

function LoadError({ what, onRetry }) {
  return (
    <Alert tone="error" title={`The ${what} list did not load`} action={
      <button type="button" onClick={onRetry} className="inline-flex items-center gap-1.5 font-semibold text-forest-900 underline underline-offset-4"><RotateCw className="size-4" aria-hidden />Try again</button>
    }>
      Check your internet connection. Your other answers are saved on this device.
    </Alert>
  );
}

function FieldGroup({ title, description, children }) {
  return (
    <fieldset className="grid gap-6">
      <legend className="mb-1">
        <span className="block font-display text-lg font-semibold text-forest-900">{title}</span>
        {description && <span className="mt-0.5 block text-sm text-slate-500">{description}</span>}
      </legend>
      {children}
    </fieldset>
  );
}

const titleCase = (s) => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function StepLocation({ errors, control, watch, setValue, register }) {
  const [stateOfOrigin, lga, wardCode] = watch(['stateOfOrigin', 'lga', 'wardCode']);
  const lcdas = lcdasFor(lga);
  const originLgas = lgasOfState(stateOfOrigin);
  const clear = (...names) => names.forEach((n) => setValue(n, ''));

  const wards = useLocationList(lga ? `/locations/wards?state=${encodeURIComponent(STATE)}&lga=${encodeURIComponent(lga)}` : null);
  const configured = wards.status === 'ready' && wards.data.configured;
  const unconfigured = wards.status === 'ready' && !wards.data.configured;
  const required = Boolean(configured && wards.data.required);
  const wardKnown = configured && wards.data.wards.some((w) => w.code === wardCode);
  const units = useLocationList(wardKnown
    ? `/locations/polling-units?state=${encodeURIComponent(STATE)}&lga=${encodeURIComponent(lga)}&ward=${encodeURIComponent(wardCode)}`
    : null);

  // Lets the browser require ward and polling unit only where official data
  // exists. The server applies the same rule independently.
  useEffect(() => { setValue('electoralRequired', required); }, [required, setValue]);

  const wardOptions = configured ? wards.data.wards.map((w) => ({ value: w.code, label: w.name, description: w.code })) : [];
  const unitOptions = units.status === 'ready' ? units.data.map((u) => ({ value: u.code, label: u.name, description: u.code.slice(-3) })) : [];

  return (
    <div className="grid gap-10">
      <FieldGroup title="Where you are from" description="Your state and Local Government Area of origin.">
        <Controller control={control} name="stateOfOrigin" render={({ field }) => (
          <Combobox
            label="State of origin"
            placeholder="Type or choose a state"
            options={STATE_NAMES.map((st) => ({ value: st, label: stateLabel(st) }))}
            value={field.value}
            onBlur={field.onBlur}
            ref={field.ref}
            onChange={(next) => {
              // A different state makes the previous LGA invalid.
              if (next !== field.value) clear('lgaOfOrigin');
              field.onChange(next);
            }}
            error={errors.stateOfOrigin?.message}
          />
        )} />
        <Controller control={control} name="lgaOfOrigin" render={({ field }) => (
          <Combobox
            label="LGA of origin"
            hint={stateOfOrigin ? undefined : 'Choose your state of origin first.'}
            placeholder={stateOfOrigin ? 'Type or choose an LGA' : 'Choose a state first'}
            disabled={!stateOfOrigin}
            options={originLgas.map((l) => ({ value: l, label: l }))}
            emptyText="No LGA in this state matches. Check the spelling."
            value={field.value}
            onBlur={field.onBlur}
            ref={field.ref}
            onChange={field.onChange}
            error={errors.lgaOfOrigin?.message}
          />
        )} />
      </FieldGroup>

      <FieldGroup title="Where you live and vote" description="This programme currently registers volunteers living in Lagos State.">
        <TextField label="State of residence" value="Lagos State" readOnly disabled />
        <Controller control={control} name="lga" render={({ field }) => (
          <Combobox
            label="LGA of residence"
            placeholder="Type or choose your LGA"
            options={LAGOS_AREAS.map((a) => ({ value: a.lga, label: a.lga }))}
            value={field.value}
            onBlur={field.onBlur}
            ref={field.ref}
            onChange={(next) => {
              // Keep dependent selections consistent with the new LGA.
              if (next !== field.value) clear('lcda', 'wardCode', 'ward', 'pollingUnitCode', 'pollingUnitName');
              field.onChange(next);
            }}
            error={errors.lga?.message}
          />
        )} />
        {lga && (
          <SelectField
            label="Local Council Development Area (LCDA)"
            optional
            hint={`Choose ${lga} if you live in the LGA's own core area, or pick your development area.`}
            placeholder="I'm not sure"
            options={[{ value: lga, label: `${lga} (LGA core area)` }, ...lcdas.map((l) => ({ value: l, label: l }))]}
            error={errors.lcda?.message}
            {...register('lcda')}
          />
        )}

        {lga && wards.status === 'error' && <LoadError what="ward" onRetry={wards.retry} />}

        {lga && unconfigured && (
          <>
            <Alert tone="info" title="Ward and polling unit lists are not available here yet">
              The official lists for {lga} have not been added. You can type your ward if you know it and leave the polling unit for now.
            </Alert>
            <TextField label="Ward" optional hint="If you know your ward name or number." autoComplete="off" error={errors.ward?.message} {...register('ward')} />
          </>
        )}

        {lga && (wards.status === 'loading' || configured) && (
          <>
            <Controller control={control} name="wardCode" render={({ field }) => (
              <Combobox
                label="Ward"
                optional={configured && !required}
                hint={configured ? `${wardOptions.length} wards in ${lga} (${titleCase(wards.data.senatorialDistrict)} senatorial district).` : undefined}
                placeholder="Type or choose your ward"
                loading={wards.status === 'loading'}
                loadingText="Loading wards"
                options={wardOptions}
                value={field.value}
                onBlur={field.onBlur}
                ref={field.ref}
                onChange={(next) => {
                  if (next !== field.value) clear('pollingUnitCode', 'pollingUnitName');
                  setValue('ward', wardOptions.find((w) => w.value === next)?.label ?? '');
                  field.onChange(next);
                }}
                error={errors.wardCode?.message}
              />
            )} />
            {units.status === 'error' ? <LoadError what="polling unit" onRetry={units.retry} /> : (
              <Controller control={control} name="pollingUnitCode" render={({ field }) => (
                <Combobox
                  label="Polling unit"
                  optional={configured && !required}
                  hint={wardCode ? 'Search by name, or by the three-digit unit number shown on the right.' : 'Choose your ward first.'}
                  placeholder={wardCode ? 'Type or choose your polling unit' : 'Choose a ward first'}
                  disabled={!wardCode}
                  loading={units.status === 'loading'}
                  loadingText="Loading polling units"
                  options={unitOptions}
                  value={field.value}
                  onBlur={field.onBlur}
                  ref={field.ref}
                  onChange={(next) => {
                    setValue('pollingUnitName', unitOptions.find((u) => u.value === next)?.label ?? '');
                    field.onChange(next);
                  }}
                  error={errors.pollingUnitCode?.message}
                />
              )} />
            )}
          </>
        )}

        <TextField label="Community or neighbourhood" optional placeholder="For example, Ikotun or Ebute Metta" autoComplete="off" hint="Helps us find activities near you. Please don't enter your street address." error={errors.community?.message} {...register('community')} />
      </FieldGroup>
    </div>
  );
}

function StepInterests({ register, errors, control, watch }) {
  const motivation = watch('motivation');
  return (
    <div className="grid gap-8">
      <Controller control={control} name="interests" render={({ field }) => (
        <ChoiceGroup legend="Which areas interest you?" hint="Choose as many as you like." options={INTERESTS} value={field.value} onChange={field.onChange} error={errors.interests?.message} />
      )} />
      <Controller control={control} name="skills" render={({ field }) => (
        <ChoiceGroup legend="Skills you can offer" optional options={SKILLS} value={field.value} onChange={field.onChange} error={errors.skills?.message} />
      )} />
      <Controller control={control} name="availability" render={({ field }) => (
        <ChoiceGroup legend="When are you usually free?" options={AVAILABILITY} value={field.value} onChange={field.onChange} error={errors.availability?.message} />
      )} />
      <Controller control={control} name="participationFormat" render={({ field }) => (
        <ChoiceGroup legend="How would you like to take part?" type="radio" name="participationFormat" columns={3} options={PARTICIPATION_FORMATS} value={field.value} onChange={field.onChange} error={errors.participationFormat?.message} />
      )} />
      <TextArea label="Why would you like to volunteer?" optional rows={4} maxLength={500} value={motivation} placeholder="A sentence or two is plenty." error={errors.motivation?.message} {...register('motivation')} />
    </div>
  );
}

function ReviewSection({ title, step, onEdit, rows }) {
  return (
    <section className="rounded-xl border border-line bg-white">
      <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
        <h3 className="font-display text-lg font-semibold text-forest-900">{title}</h3>
        <button type="button" onClick={() => onEdit(step)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold text-green-700 hover:bg-mist">
          <Pencil className="size-3.5" aria-hidden />Edit<span className="sr-only"> {title.toLowerCase()}</span>
        </button>
      </div>
      <dl className="divide-y divide-line">
        {rows.filter(([, v]) => v).map(([label, value]) => (
          <div key={label} className="grid gap-0.5 px-4 py-3 sm:grid-cols-[180px_1fr] sm:gap-4 sm:px-5">
            <dt className="text-sm text-slate-500">{label}</dt>
            <dd className="text-[15px] font-medium text-ink">{value}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function StepReview({ values, errors, control, onEdit }) {
  const list = (opts, vals) => (vals?.length ? vals.map((v) => labelFor(opts, v)).join(', ') : '');
  return (
    <div className="grid gap-5">
      <ReviewSection title="Your details" step={0} onEdit={onEdit} rows={[
        ['Name', `${values.firstName} ${values.lastName}`],
        ['Phone', values.phone],
        ['Email', values.email || 'Not provided'],
        ['Contact by', labelFor(CONTACT_METHODS, values.contactMethod)],
        ['Agent type', labelFor(AGENT_TYPES, values.agentType)],
      ]} />
      <ReviewSection title="Where you are from and live" step={1} onEdit={onEdit} rows={[
        ['Origin', values.lgaOfOrigin && `${values.lgaOfOrigin}, ${stateLabel(values.stateOfOrigin)}`],
        ['Residence', values.lga && `${values.lga}, Lagos State`],
        ['LCDA', values.lcda],
        ['Ward', values.ward && (values.wardCode ? `${values.ward} (${values.wardCode})` : values.ward)],
        ['Polling unit', values.pollingUnitName && `${values.pollingUnitName} (${values.pollingUnitCode})`],
        ['Community', values.community],
      ]} />
      <ReviewSection title="How you can help" step={2} onEdit={onEdit} rows={[
        ['Interests', list(INTERESTS, values.interests)],
        ['Skills', list(SKILLS, values.skills)],
        ['Availability', list(AVAILABILITY, values.availability)],
        ['Take part', labelFor(PARTICIPATION_FORMATS, values.participationFormat)],
        ['Why volunteer', values.motivation],
      ]} />

      <section aria-labelledby="privacy-title" className="rounded-xl border border-line bg-mist/60 p-4 sm:p-5">
        <h3 id="privacy-title" className="flex items-center gap-2 font-display text-lg font-semibold text-forest-900"><ShieldCheck className="size-5 text-green-700" aria-hidden />How we use your information</h3>
        <ul className="mt-3 space-y-2 text-[15px] leading-relaxed text-slate-600">
          {privacyNotice.summary.map((line) => <li key={line} className="flex gap-2.5"><span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-green-600" aria-hidden />{line}</li>)}
        </ul>
        <p className="mt-3 text-sm"><Link to="/privacy" target="_blank" className="font-semibold text-green-700 underline underline-offset-4">Read the full privacy notice</Link> <span className="text-slate-500">(opens in a new tab)</span></p>
      </section>

      <div className="grid gap-3">
        <Controller control={control} name="ageConfirmed" render={({ field }) => (
          <Checkbox checked={field.value} onChange={field.onChange} error={errors.ageConfirmed?.message}>I confirm that I am 18 years or older.</Checkbox>
        )} />
        <Controller control={control} name="consentProcessing" render={({ field }) => (
          <Checkbox checked={field.value} onChange={field.onChange} error={errors.consentProcessing?.message}>
            I agree that the APC Lagos Volunteer Programme may use the information in this form to register me as a volunteer and contact me about my application, as described in the privacy notice.
          </Checkbox>
        )} />
        <Controller control={control} name="consentCommunications" render={({ field }) => (
          <Checkbox checked={field.value} onChange={field.onChange} description="Optional. You can change this at any time.">
            Send me news about upcoming programme activities and events.
          </Checkbox>
        )} />
      </div>
    </div>
  );
}

export default function Register() {
  const config = useConfig();
  const [success, setSuccess] = useState(() => storage.read(SUCCESS_KEY));
  const [draft] = useState(() => storage.read(DRAFT_KEY));
  const [step, setStep] = useState(() => Math.min(draft?.step ?? 0, STEPS.length - 1));
  const [maxReached, setMaxReached] = useState(() => Math.min(draft?.maxReached ?? draft?.step ?? 0, STEPS.length - 1));
  const [submitError, setSubmitError] = useState(null);
  const stepRef = useRef(step);
  stepRef.current = step;
  const headingRef = useRef(null);
  const firstRender = useRef(true);

  const resolver = useMemo(() => (values, ctx, opts) => zodResolver(STEP_SCHEMAS[stepRef.current])(values, ctx, opts), []);
  const form = useForm({ resolver, mode: 'onTouched', defaultValues: { ...EMPTY, ...(draft?.values ?? {}) }, shouldFocusError: true });
  const { register, control, handleSubmit, watch, setValue, setError, getValues, formState: { errors, isSubmitting } } = form;

  // Save progress (never the consent ticks) so a dropped connection or reload loses nothing.
  useEffect(() => {
    const sub = watch((values) => {
      const toSave = Object.fromEntries(Object.entries(values).filter(([k]) => !CONSENT_FIELDS.includes(k) && k !== 'website'));
      storage.write(DRAFT_KEY, { values: toSave, step: stepRef.current, maxReached });
    });
    return () => sub.unsubscribe();
  }, [watch, maxReached]);

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    const values = getValues();
    storage.write(DRAFT_KEY, { values: Object.fromEntries(Object.entries(values).filter(([k]) => !CONSENT_FIELDS.includes(k))), step, maxReached });
  }, [step, getValues, maxReached]);

  const goTo = (next) => {
    setSubmitError(null);
    setStep(next);
    setMaxReached((mr) => Math.max(mr, next));
  };

  const submitApplication = async (values) => {
    setSubmitError(null);
    try {
      const result = await post('/volunteers/register', values);
      const record = { ...result, email: values.email };
      storage.write(SUCCESS_KEY, record);
      storage.remove(DRAFT_KEY);
      setSuccess(record);
      window.scrollTo(0, 0);
    } catch (err) {
      if (err.code === 'VALIDATION_FAILED' && Object.keys(err.fields).length) {
        // Send the applicant to the first step with a problem.
        const firstStep = STEP_FIELDS.findIndex((fields) => fields.some((f) => err.fields[f]));
        Object.entries(err.fields).forEach(([name, message]) => setError(name, { type: 'server', message }));
        if (firstStep > -1 && firstStep !== step) setStep(firstStep);
        setSubmitError({ tone: 'error', title: 'Some details need attention', message: 'We have highlighted what to fix.' });
      } else if (err.code === 'DUPLICATE_REGISTRATION') {
        setSubmitError({ tone: 'warning', title: 'You may already be registered', message: err.message, duplicate: true });
      } else if (err.code === 'NETWORK') {
        setSubmitError({ tone: 'error', title: 'Your application was not sent', message: err.message, retry: true });
      } else {
        setSubmitError({ tone: 'error', title: 'Your application was not sent', message: err.message, retry: err.status >= 500 || err.status === 429 });
      }
    }
  };

  const onContinue = handleSubmit(() => goTo(step + 1));
  const onSubmit = handleSubmit(submitApplication);
  const isLast = step === STEPS.length - 1;
  const registrationClosed = config.loaded && config.reachable && !config.registrationOpen;

  if (success) {
    return (
      <RegistrationSuccess
        result={success}
        onReset={() => { storage.remove(SUCCESS_KEY); form.reset(EMPTY); setStep(0); setMaxReached(0); setSuccess(null); }}
      />
    );
  }

  const stepProps = { register, errors, control, watch, setValue };

  return (
    <div className="bg-mist pb-32 pt-8 sm:pt-12 lg:pb-20">
      <div className="container-page grid gap-8 lg:grid-cols-[1fr_320px] lg:gap-12">
        <div className="min-w-0">
          <h1 className="type-h2 text-forest-900">Volunteer application</h1>
          <p className="mt-3 text-slate-600">Step {step + 1} of {STEPS.length}. Your answers are kept on this device until you submit.</p>
          <div className="mt-6"><Progress step={step} maxReached={maxReached} onJump={goTo} /></div>

          <form onSubmit={isLast ? onSubmit : onContinue} noValidate className="mt-8 rounded-[var(--radius-xl)] border border-line bg-paper p-5 shadow-soft sm:p-8">
            <h2 ref={headingRef} tabIndex={-1} className="scroll-mt-28 font-display text-2xl font-semibold text-forest-900 outline-none sm:text-3xl">{STEPS[step].title}</h2>

            {/* Honeypot: hidden from people and assistive technology. */}
            <div aria-hidden className="absolute -left-[9999px] h-px w-px overflow-hidden">
              <label>Website<input tabIndex={-1} autoComplete="off" {...register('website')} /></label>
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <m.div key={step} initial={{ opacity: 0, x: 16 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -16 }} transition={{ duration: 0.2 }} className="mt-7">
                {step === 0 && <StepPersonal {...stepProps} />}
                {step === 1 && <StepLocation {...stepProps} />}
                {step === 2 && <StepInterests {...stepProps} />}
                {step === 3 && <StepReview values={getValues()} errors={errors} control={control} onEdit={goTo} />}
              </m.div>
            </AnimatePresence>

            {submitError && (
              <Alert tone={submitError.tone} title={submitError.title} className="mt-6" action={
                submitError.duplicate ? <Link to="/status" className="font-semibold text-forest-900 underline underline-offset-4">Check your application status</Link> : null
              }>
                {submitError.message}
              </Alert>
            )}
            {isLast && registrationClosed && (
              <Alert tone="warning" title="Online registration is not connected yet" className="mt-6">
                The registration database has not been connected, so applications cannot be submitted. Nothing you entered has been sent anywhere.
              </Alert>
            )}

            {/* On phones the actions stay pinned to the bottom of the screen. */}
            <div className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-white/95 px-4 py-3 backdrop-blur lg:static lg:mt-8 lg:border-0 lg:bg-transparent lg:p-0 lg:backdrop-blur-none" style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}>
              <div className="mx-auto flex max-w-[1240px] items-center gap-3">
                {step > 0 && (
                  <Button variant="secondary" size="lg" icon={ArrowLeft} onClick={() => goTo(step - 1)} className="px-4 sm:px-6">
                    <span className="sr-only sm:not-sr-only">Back</span>
                  </Button>
                )}
                {isLast ? (
                  <Button type="submit" size="lg" block className="lg:w-auto" icon={Send} loading={isSubmitting} loadingText="Submitting your application" disabled={registrationClosed}>
                    {submitError?.retry ? 'Try submitting again' : 'Submit application'}
                  </Button>
                ) : (
                  <Button type="submit" size="lg" block className="lg:w-auto" iconRight={ArrowRight}>Continue</Button>
                )}
              </div>
            </div>
          </form>
        </div>

        <aside className="hidden lg:block">
          <div className="sticky top-28 space-y-4">
            <div className="rounded-[var(--radius-lg)] bg-forest-900 p-6 text-white">
              <h2 className="font-display text-xl font-semibold">Before you start</h2>
              <ul className="mt-4 space-y-4 text-[15px] text-green-50/85">
                <li className="flex gap-3"><Clock className="mt-0.5 size-5 shrink-0 text-gold-500" aria-hidden />About five minutes, four short steps.</li>
                <li className="flex gap-3"><Smartphone className="mt-0.5 size-5 shrink-0 text-gold-500" aria-hidden />Have your phone number ready. Email is optional.</li>
                <li className="flex gap-3"><ShieldCheck className="mt-0.5 size-5 shrink-0 text-gold-500" aria-hidden />No voter card, ID documents or bank details are needed.</li>
              </ul>
            </div>
            <p className="px-1 text-sm text-slate-500">Already registered? <Link to="/status" className="font-semibold text-green-700 underline underline-offset-4">Check your status</Link></p>
          </div>
        </aside>
      </div>
    </div>
  );
}
