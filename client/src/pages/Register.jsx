import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { m, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Pencil, ShieldCheck, Clock, Camera, IdCard, Send, RotateCw, Info } from 'lucide-react';
import { Button } from '../components/ui/Button.jsx';
import { TextField, ChoiceGroup, Checkbox } from '../components/ui/Field.jsx';
import { Combobox } from '../components/ui/Combobox.jsx';
import { FileField } from '../components/ui/FileField.jsx';
import { Alert } from '../components/ui/Feedback.jsx';
import { RegistrationSuccess } from '../components/RegistrationSuccess.jsx';
import { STEP_SCHEMAS, STEP_FIELDS } from '../../../shared/schemas.js';
import { LGA_NAMES, STATE } from '../../../shared/lagos.js';
import { STATE_NAMES, lgasOfState, stateLabel } from '../../../shared/nigeria.js';
import { AGENT_CATEGORIES, NIGERIAN_BANKS, REGISTRATION_CATEGORIES, labelFor } from '../../../shared/options.js';
import { OPTIONAL_FIELDS, DOCUMENT_RULES, requiredDocuments } from '../../../shared/agentForm.js';
import { privacyNotice } from '../content/site.js';
import { get, post } from '../lib/api.js';
import { prepareFile, describeRules, acceptFor } from '../lib/documentFiles.js';
import { useConfig } from '../lib/config.jsx';
import { cx } from '../lib/format.js';

const STEPS = [
  { title: 'Your details', short: 'Details' },
  { title: 'Your role and polling unit', short: 'Polling unit' },
  { title: 'Your documents', short: 'Documents' },
  { title: 'Review and submit', short: 'Review' },
];

const DRAFT_KEY = 'apc-agent-registration-draft';
const SUCCESS_KEY = 'apc-agent-registration-success';
// Never kept in the saved draft: consents, the honeypot and sensitive identifiers.
const UNSAVED_FIELDS = [
  'ageConfirmed', 'declarationAccurate', 'consentProcessing', 'consentSensitive', 'consentFinancialIdentity', 'website',
  'nin', 'dateOfBirth', 'voterRegistrationNumber', 'apcPartyCardNumber', 'bankName', 'accountName', 'accountNumber',
];

const EMPTY = {
  firstName: '', middleName: '', lastName: '', email: '', phone: '',
  ...(OPTIONAL_FIELDS.dateOfBirth ? { dateOfBirth: '' } : {}),
  ...(OPTIONAL_FIELDS.financialIdentityDetails
    ? { nin: '', voterRegistrationNumber: '', apcPartyCardNumber: '', bankName: '', accountName: '', accountNumber: '', consentFinancialIdentity: false }
    : OPTIONAL_FIELDS.nin ? { nin: '' } : {}),
  stateOfOrigin: '', lgaOfOrigin: '',
  agentCategory: '', state: STATE, lga: '', wardCode: '', pollingUnitCode: '', electoralRequired: false,
  ward: '', pollingUnitName: '', senatorialDistrict: '',
  ageConfirmed: false, declarationAccurate: false, consentProcessing: false, consentSensitive: false, website: '',
};

const DOC_COPY = {
  passport: {
    icon: Camera,
    hint: 'A recent head-and-shoulders photo, facing the camera, on a plain light background. No sunglasses, hats or filters.',
    guidance: 'Portrait or square. Your face should fill most of the frame.',
    aspectClass: 'aspect-[4/5]',
  },
  pvc: {
    icon: IdCard,
    hint: 'The front of your Permanent Voter Card. All four corners in frame, flat, in good light, with every detail readable.',
    guidance: 'A photo or a PDF scan of the card.',
    aspectClass: 'aspect-[8/5]',
  },
  selfie: {
    icon: Camera,
    hint: 'A photo of you taken now, holding your voter’s card next to your face.',
    guidance: 'Both your face and the card should be clear.',
    aspectClass: 'aspect-[4/5]',
  },
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

const savable = (values) => Object.fromEntries(Object.entries(values).filter(([k]) => !UNSAVED_FIELDS.includes(k)));
const titleCase = (s = '') => s.toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());

function Progress({ step, onJump, maxReached }) {
  return (
    <nav aria-label="Registration progress">
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

function StepPersonal({ register, errors, control, watch, setValue }) {
  const stateOfOrigin = watch('stateOfOrigin');
  return (
    <div className="grid gap-10">
      <FieldGroup title="Your name and contact details" description="Use your name exactly as it appears on your voter’s card.">
        <div className="grid gap-6 sm:grid-cols-3">
          <TextField label="First name" autoComplete="given-name" error={errors.firstName?.message} {...register('firstName')} />
          <TextField label="Middle name" optional autoComplete="additional-name" error={errors.middleName?.message} {...register('middleName')} />
          <TextField label="Last name" autoComplete="family-name" error={errors.lastName?.message} {...register('lastName')} />
        </div>
        <TextField
          label="Email address"
          hint="Your confirmation and the decision on your registration are sent here."
          type="email"
          inputMode="email"
          autoComplete="email"
          placeholder="you@example.com"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Phone number"
          hint="A Nigerian mobile number. You will need it with your reference to check your status."
          type="tel"
          inputMode="tel"
          autoComplete="tel-national"
          placeholder="0803 123 4567"
          error={errors.phone?.message}
          {...register('phone')}
        />
        {OPTIONAL_FIELDS.dateOfBirth && (
          <TextField label="Date of birth" type="date" autoComplete="bday" className="sm:max-w-xs" error={errors.dateOfBirth?.message} {...register('dateOfBirth')} />
        )}
        {OPTIONAL_FIELDS.nin && (
          <TextField
            label="National Identification Number (NIN)"
            hint="The 11-digit number on your NIN slip or National ID card. It is encrypted when saved."
            inputMode="numeric"
            autoComplete="off"
            maxLength={13}
            className="sm:max-w-sm"
            inputClassName="tabular tracking-wider"
            error={errors.nin?.message}
            {...register('nin')}
          />
        )}
      </FieldGroup>

      {OPTIONAL_FIELDS.financialIdentityDetails ? (
        <>
          <FieldGroup title="Bank details" description="Enter the banking information requested by the programme. Account details are not verified by this form.">
            <Controller control={control} name="bankName" render={({ field }) => (
              <Combobox
                label="Bank name"
                placeholder="Type to search Nigerian banks"
                options={NIGERIAN_BANKS}
                value={field.value}
                onBlur={field.onBlur}
                ref={field.ref}
                onChange={field.onChange}
                error={errors.bankName?.message}
              />
            )} />
            <TextField label="Account name" autoComplete="name" maxLength={100} error={errors.accountName?.message} {...register('accountName')} />
            <TextField
              label="Account number"
              hint="Enter exactly 10 digits. This checks the format only; it does not verify the account or account name."
              inputMode="numeric"
              autoComplete="off"
              maxLength={10}
              error={errors.accountNumber?.message}
              {...register('accountNumber')}
            />
          </FieldGroup>
          <FieldGroup title="Identification details" description="Enter the numbers exactly as printed on your documents.">
            <TextField label="National Identification Number (NIN)" hint="Exactly 11 digits." inputMode="numeric" autoComplete="off" maxLength={11} error={errors.nin?.message} {...register('nin')} />
            <TextField label="Voter registration number" hint="Format pending verification against the official voter card format." autoComplete="off" maxLength={40} error={errors.voterRegistrationNumber?.message} {...register('voterRegistrationNumber')} />
            <TextField label="APC party card number" hint="Format pending verification against the official party card format." autoComplete="off" maxLength={40} error={errors.apcPartyCardNumber?.message} {...register('apcPartyCardNumber')} />
          </FieldGroup>
        </>
      ) : (
        <Alert tone="info" title="Bank and identification details are not being collected">
          These additional fields remain switched off until their approved collection purposes and privacy notice are provided. No bank account verification service is configured.
        </Alert>
      )}

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
              if (next !== field.value) setValue('lgaOfOrigin', '');
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
            options={lgasOfState(stateOfOrigin).map((l) => ({ value: l, label: l }))}
            emptyText="No LGA in this state matches. Check the spelling."
            value={field.value}
            onBlur={field.onBlur}
            ref={field.ref}
            onChange={field.onChange}
            error={errors.lgaOfOrigin?.message}
          />
        )} />
      </FieldGroup>
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

function StepRole({ errors, control, watch, setValue }) {
  const [lga, wardCode, pollingUnitCode] = watch(['lga', 'wardCode', 'pollingUnitCode']);
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
  useEffect(() => { setValue('senatorialDistrict', configured ? wards.data.senatorialDistrict : ''); }, [configured, wards.data, setValue]);

  const wardOptions = configured ? wards.data.wards.map((w) => ({ value: w.code, label: w.name, description: w.code })) : [];
  const unitOptions = units.status === 'ready' ? units.data.map((u) => ({ value: u.code, label: u.name, description: u.code.slice(-3) })) : [];

  return (
    <div className="grid gap-10">
      <Controller control={control} name="agentCategory" render={({ field }) => (
        <ChoiceGroup legend="Agent category" hint="Choose the role you have been asked to serve in." type="radio" name="agentCategory" options={REGISTRATION_CATEGORIES} value={field.value} onChange={field.onChange} error={errors.agentCategory?.message} />
      )} />

      <FieldGroup title="Your polling unit" description="Choose from the official INEC list for Lagos State.">
        <TextField label="State" value="Lagos State" readOnly disabled />
        <Controller control={control} name="lga" render={({ field }) => (
          <Combobox
            label="Local Government Area (LGA)"
            placeholder="Type or choose your LGA"
            options={LGA_NAMES.map((l) => ({ value: l, label: l }))}
            value={field.value}
            onBlur={field.onBlur}
            ref={field.ref}
            onChange={(next) => {
              // Keep dependent selections consistent with the new LGA.
              if (next !== field.value) clear('wardCode', 'ward', 'pollingUnitCode', 'pollingUnitName');
              field.onChange(next);
            }}
            error={errors.lga?.message}
          />
        )} />

        {lga && wards.status === 'error' && <LoadError what="ward" onRetry={wards.retry} />}

        {lga && unconfigured && (
          <Alert tone="warning" title="Polling units for this LGA are not available yet">
            The official ward and polling unit list for {lga} has not been added. Contact the registration team before continuing.
          </Alert>
        )}

        {lga && (wards.status === 'loading' || configured) && (
          <>
            <Controller control={control} name="wardCode" render={({ field }) => (
              <Combobox
                label="Ward"
                optional={configured && !required}
                hint={configured ? `${wardOptions.length} wards in ${lga}.` : undefined}
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

        {configured && (
          <section aria-labelledby="delimitation-title" className="rounded-xl border border-line bg-mist/60 p-4 sm:p-5">
            <h3 id="delimitation-title" className="font-display text-base font-semibold text-forest-900">Delimitation</h3>
            <p className="mt-0.5 text-sm text-slate-500">Filled in from the official INEC data as you choose.</p>
            <dl className="mt-3 grid gap-3 text-[15px] sm:grid-cols-2">
              <div><dt className="text-sm text-slate-500">Senatorial district</dt><dd className="font-medium text-ink">{titleCase(wards.data.senatorialDistrict)}</dd></div>
              <div><dt className="text-sm text-slate-500">Polling unit code</dt><dd className="font-mono font-semibold text-ink">{pollingUnitCode || '–'}</dd></div>
            </dl>
          </section>
        )}
      </FieldGroup>
    </div>
  );
}

function StepDocuments({ files, setFile, fileErrors, setFileError }) {
  return (
    <div className="grid gap-8">
      <Alert tone="info" title="How your files are checked">
        We check that each file really is a photo or PDF, is complete, and is clear enough to read. These checks do not prove that a voter’s card is genuine: the registration team verifies cards separately. Photos are resized and location data is removed before upload.
      </Alert>
      {requiredDocuments().map((kind) => (
        <FileField
          key={kind}
          label={DOCUMENT_RULES[kind].label}
          hint={DOC_COPY[kind].hint}
          guidance={DOC_COPY[kind].guidance}
          rulesText={describeRules(kind)}
          accept={acceptFor(kind)}
          aspectClass={DOC_COPY[kind].aspectClass}
          value={files[kind]}
          onChange={(v) => setFile(kind, v)}
          prepare={(file) => prepareFile(kind, file)}
          error={fileErrors[kind]}
          onError={(msg) => setFileError(kind, msg)}
        />
      ))}
    </div>
  );
}

function ReviewSection({ title, step, onEdit, rows, children }) {
  return (
    <section className="rounded-xl border border-line bg-white">
      <div className="flex items-center justify-between border-b border-line px-4 py-3 sm:px-5">
        <h3 className="font-display text-lg font-semibold text-forest-900">{title}</h3>
        <button type="button" onClick={() => onEdit(step)} className="inline-flex items-center gap-1.5 rounded-md px-2 py-1 text-sm font-semibold text-green-700 hover:bg-mist">
          <Pencil className="size-3.5" aria-hidden />Edit<span className="sr-only"> {title.toLowerCase()}</span>
        </button>
      </div>
      {rows && (
        <dl className="divide-y divide-line">
          {rows.filter(([, v]) => v).map(([label, value]) => (
            <div key={label} className="grid gap-0.5 px-4 py-3 sm:grid-cols-[180px_1fr] sm:gap-4 sm:px-5">
              <dt className="text-sm text-slate-500">{label}</dt>
              <dd className="text-[15px] font-medium text-ink">{value}</dd>
            </div>
          ))}
        </dl>
      )}
      {children}
    </section>
  );
}

function StepReview({ values, files, errors, control, onEdit }) {
  return (
    <div className="grid gap-5">
      <ReviewSection title="Your details" step={0} onEdit={onEdit} rows={[
        ['Name', [values.firstName, values.middleName, values.lastName].filter(Boolean).join(' ')],
        ['Email', values.email],
        ['Phone', values.phone],
        ['Date of birth', values.dateOfBirth],
        ['NIN', values.nin && `•••••••${values.nin.replace(/\s/g, '').slice(-4)}`],
        ...(OPTIONAL_FIELDS.financialIdentityDetails ? [
          ['Bank', labelFor(NIGERIAN_BANKS, values.bankName)],
          ['Account name', values.accountName],
          ['Account number', values.accountNumber && `••••••${values.accountNumber.slice(-4)}`],
          ['Voter registration number', values.voterRegistrationNumber && `••••${values.voterRegistrationNumber.slice(-4)}`],
          ['APC party card number', values.apcPartyCardNumber && `••••${values.apcPartyCardNumber.slice(-4)}`],
        ] : []),
        ['Origin', values.lgaOfOrigin && `${values.lgaOfOrigin}, ${stateLabel(values.stateOfOrigin)}`],
      ]} />
      <ReviewSection title="Your role and polling unit" step={1} onEdit={onEdit} rows={[
        ['Agent category', labelFor(AGENT_CATEGORIES, values.agentCategory)],
        ['LGA', values.lga && `${values.lga}, Lagos State`],
        ['Ward', values.ward && `${values.ward} (${values.wardCode})`],
        ['Polling unit', values.pollingUnitName],
        ['Polling unit code', values.pollingUnitCode],
        ['Senatorial district', titleCase(values.senatorialDistrict)],
      ]} />
      <ReviewSection title="Your documents" step={2} onEdit={onEdit}>
        <ul className="grid gap-4 p-4 sm:grid-cols-3 sm:p-5">
          {requiredDocuments().map((kind) => (
            <li key={kind} className="flex items-center gap-3 sm:flex-col sm:items-start">
              {files[kind]?.previewUrl
                ? <img src={files[kind].previewUrl} alt={`Your ${DOCUMENT_RULES[kind].label.toLowerCase()}`} className="h-20 w-auto rounded-lg object-cover ring-1 ring-line" />
                : <span className="flex h-20 w-16 items-center justify-center rounded-lg bg-mist text-xs font-semibold text-forest-900">{files[kind] ? 'PDF' : 'Missing'}</span>}
              <span className="text-sm font-medium text-ink">{DOCUMENT_RULES[kind].label}</span>
            </li>
          ))}
        </ul>
      </ReviewSection>

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
        <Controller control={control} name="declarationAccurate" render={({ field }) => (
          <Checkbox checked={field.value} onChange={field.onChange} error={errors.declarationAccurate?.message}>
            I confirm that the details I have given are accurate, and that the passport photograph and voter’s card are my own and unaltered.
          </Checkbox>
        )} />
        <Controller control={control} name="consentSensitive" render={({ field }) => (
          <Checkbox checked={field.value} onChange={field.onChange} error={errors.consentSensitive?.message}>
            I consent to APC Lagos storing my passport photograph and voter’s card{OPTIONAL_FIELDS.nin || OPTIONAL_FIELDS.financialIdentityDetails ? ', and my NIN,' : ''} so that authorised staff can verify my registration.
          </Checkbox>
        )} />
        {OPTIONAL_FIELDS.financialIdentityDetails && (
          <Controller control={control} name="consentFinancialIdentity" render={({ field }) => (
            <Checkbox checked={field.value} onChange={field.onChange} error={errors.consentFinancialIdentity?.message}>
              I consent to the use of my banking and identification details as described in the approved privacy notice.
            </Checkbox>
          )} />
        )}
        <Controller control={control} name="consentProcessing" render={({ field }) => (
          <Checkbox checked={field.value} onChange={field.onChange} error={errors.consentProcessing?.message}>
            I agree that APC Lagos may use the information in this form to register me as a polling unit agent and contact me about it, as described in the privacy notice.
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
  const [step, setStep] = useState(() => Math.min(draft?.step ?? 0, 1)); // documents are never in a draft
  const [maxReached, setMaxReached] = useState(() => Math.min(draft?.maxReached ?? 0, 1));
  const [submitError, setSubmitError] = useState(null);
  const [files, setFiles] = useState({});
  const [fileErrors, setFileErrors] = useState({});
  const stepRef = useRef(step);
  stepRef.current = step;
  const headingRef = useRef(null);
  const firstRender = useRef(true);

  const resolver = useMemo(() => (values, ctx, opts) => zodResolver(STEP_SCHEMAS[stepRef.current])(values, ctx, opts), []);
  const form = useForm({ resolver, mode: 'onTouched', defaultValues: { ...EMPTY, ...(draft?.values ?? {}) }, shouldFocusError: true });
  const { register, control, handleSubmit, watch, setValue, setError, getValues, formState: { errors, isSubmitting } } = form;

  const setFile = (kind, value) => {
    setFiles((f) => ({ ...f, [kind]: value }));
    if (value) setFileErrors((e) => ({ ...e, [kind]: null }));
  };
  const setFileError = (kind, message) => setFileErrors((e) => ({ ...e, [kind]: message }));

  // Free preview images when leaving the page.
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(() => () => Object.values(filesRef.current).forEach((f) => f?.previewUrl && URL.revokeObjectURL(f.previewUrl)), []);

  // Save text answers (never documents, consents or sensitive identifiers) so a dropped connection loses little.
  useEffect(() => {
    const sub = watch((values) => storage.write(DRAFT_KEY, { values: savable(values), step: Math.min(stepRef.current, 1), maxReached: Math.min(maxReached, 1) }));
    return () => sub.unsubscribe();
  }, [watch, maxReached]);

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    storage.write(DRAFT_KEY, { values: savable(getValues()), step: Math.min(step, 1), maxReached: Math.min(maxReached, 1) });
  }, [step, getValues, maxReached]);

  const goTo = (next) => {
    setSubmitError(null);
    setStep(next);
    setMaxReached((mr) => Math.max(mr, next));
  };

  const missingDocuments = () => {
    const missing = requiredDocuments().filter((k) => !files[k]);
    missing.forEach((k) => setFileError(k, `Add your ${DOCUMENT_RULES[k].label.toLowerCase()}`));
    return missing.length > 0;
  };

  const submitRegistration = async (values) => {
    setSubmitError(null);
    if (missingDocuments()) { goTo(2); return; }
    const body = new FormData();
    body.append('data', JSON.stringify(values));
    for (const kind of requiredDocuments()) body.append(kind, files[kind].blob, files[kind].filename);
    try {
      const result = await post('/agents/register', body);
      const record = { ...result, email: values.email };
      storage.write(SUCCESS_KEY, record);
      storage.remove(DRAFT_KEY);
      setSuccess(record);
      window.scrollTo(0, 0);
    } catch (err) {
      if (err.code === 'VALIDATION_FAILED' && Object.keys(err.fields).length) {
        // Send the applicant to the first step with a problem.
        const firstStep = STEP_FIELDS.findIndex((fields) => fields.some((f) => err.fields[f]));
        Object.entries(err.fields).forEach(([name, message]) => {
          if (DOCUMENT_RULES[name]) setFileError(name, message);
          else setError(name, { type: 'server', message });
        });
        if (firstStep > -1 && firstStep !== step) setStep(firstStep);
        setSubmitError({ tone: 'error', title: 'Some details need attention', message: 'We have highlighted what to fix.' });
      } else if (err.code === 'DUPLICATE_REGISTRATION') {
        setSubmitError({ tone: 'warning', title: 'You may already be registered', message: err.message, duplicate: true });
      } else if (err.code === 'TOO_LARGE') {
        setSubmitError({ tone: 'error', title: 'Your files are too large', message: err.message });
      } else {
        setSubmitError({ tone: 'error', title: 'Your registration was not sent', message: err.message, retry: err.code === 'NETWORK' || err.status >= 500 || err.status === 429 });
      }
    }
  };

  const onContinue = handleSubmit(() => {
    if (step === 2 && missingDocuments()) return;
    goTo(step + 1);
  });
  const onSubmit = handleSubmit(submitRegistration);
  const isLast = step === STEPS.length - 1;
  const registrationClosed = config.loaded && config.reachable && !config.registrationOpen;

  if (success) {
    return (
      <RegistrationSuccess
        result={success}
        onReset={() => { storage.remove(SUCCESS_KEY); form.reset(EMPTY); setFiles({}); setFileErrors({}); setStep(0); setMaxReached(0); setSuccess(null); }}
      />
    );
  }

  const stepProps = { register, errors, control, watch, setValue };

  return (
    <div className="bg-mist pb-32 pt-8 sm:pt-12 lg:pb-20">
      <div className="container-page grid gap-8 lg:grid-cols-[1fr_320px] lg:gap-12">
        <div className="min-w-0">
          <h1 className="type-h2 text-forest-900">Polling unit agent registration</h1>
          <p className="mt-3 text-slate-600">Step {step + 1} of {STEPS.length}. Your typed answers are kept on this device until you submit. Documents are not saved, so add them in one sitting.</p>
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
                {step === 1 && <StepRole {...stepProps} />}
                {step === 2 && <StepDocuments files={files} setFile={setFile} fileErrors={fileErrors} setFileError={setFileError} />}
                {step === 3 && <StepReview values={getValues()} files={files} errors={errors} control={control} onEdit={goTo} />}
              </m.div>
            </AnimatePresence>

            {submitError && (
              <Alert tone={submitError.tone} title={submitError.title} className="mt-6" action={
                submitError.duplicate ? <Link to="/status" className="font-semibold text-forest-900 underline underline-offset-4">Check your registration status</Link> : null
              }>
                {submitError.message}
              </Alert>
            )}
            {isLast && registrationClosed && (
              <Alert tone="warning" title="Online registration is not connected yet" className="mt-6">
                The registration database has not been connected, so registrations cannot be submitted. Nothing you entered has been sent anywhere.
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
                  <Button type="submit" size="lg" block className="lg:w-auto" icon={Send} loading={isSubmitting} loadingText="Uploading your registration" disabled={registrationClosed}>
                    {submitError?.retry ? 'Try submitting again' : 'Submit registration'}
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
                <li className="flex gap-3"><Clock className="mt-0.5 size-5 shrink-0 text-gold-500" aria-hidden />About ten minutes, four short steps.</li>
                <li className="flex gap-3"><Camera className="mt-0.5 size-5 shrink-0 text-gold-500" aria-hidden />A clear passport photograph on a plain background.</li>
                <li className="flex gap-3"><IdCard className="mt-0.5 size-5 shrink-0 text-gold-500" aria-hidden />Your voter’s card, to photograph or scan.</li>
                <li className="flex gap-3"><Info className="mt-0.5 size-5 shrink-0 text-gold-500" aria-hidden />An email address you can open, for your confirmation.</li>
              </ul>
            </div>
            <p className="px-1 text-sm text-slate-500">Already registered? <Link to="/status" className="font-semibold text-green-700 underline underline-offset-4">Check your status</Link></p>
          </div>
        </aside>
      </div>
    </div>
  );
}
