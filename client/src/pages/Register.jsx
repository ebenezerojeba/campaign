import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { m, AnimatePresence } from 'framer-motion';
import { ArrowLeft, ArrowRight, Check, Pencil, ShieldCheck, Clock, Camera, IdCard, Send, RotateCw, Info, Landmark } from 'lucide-react';
import { Button } from '../components/ui/Button.jsx';
import { TextField, SelectField, Checkbox } from '../components/ui/Field.jsx';
import { DateField } from '../components/ui/DateField.jsx';
import { Combobox } from '../components/ui/Combobox.jsx';
import { FileField } from '../components/ui/FileField.jsx';
import { Alert } from '../components/ui/Feedback.jsx';
import { Turnstile, useCaptchaSiteKey } from '../components/Turnstile.jsx';
import { RegistrationSuccess } from '../components/RegistrationSuccess.jsx';
import { STEP_SCHEMAS, STEP_FIELDS, todayInLagos } from '../../../shared/schemas.js';
import { LGA_NAMES, STATE } from '../../../shared/lagos.js';
import { STATE_NAMES, lgasOfState, stateLabel } from '../../../shared/nigeria.js';
import { AGENT_CATEGORIES, NIGERIAN_BANKS, REGISTRATION_CATEGORIES, labelFor, levelOf } from '../../../shared/options.js';
import { DOCUMENT_RULES, requiredDocuments } from '../../../shared/agentForm.js';
import { privacyNotice } from '../content/site.js';
import { get, post } from '../lib/api.js';
import { prepareFile, describeRules, acceptFor } from '../lib/documentFiles.js';
import { useConfig } from '../lib/config.jsx';
import { cx } from '../lib/format.js';
import { compareVin, normaliseVin } from '../../../shared/cardCheck.js';

const STEPS = [
  { title: 'Your details', short: 'Details' },
  { title: 'Your role and location', short: 'Role' },
  { title: 'Identity and bank details', short: 'ID & bank' },
  { title: 'Your documents', short: 'Documents' },
  { title: 'Review and submit', short: 'Review' },
];

// Step indexes.
const IDENTITY_STEP = 2;
const DOCUMENTS_STEP = 3;
// Drafts never reach the identity step: those values are never saved on the device.
const LAST_DRAFT_STEP = 1;

const DRAFT_KEY = 'apc-agent-registration-draft';
const SUCCESS_KEY = 'apc-agent-registration-success';
// Never kept in the saved draft: consents, the honeypot and sensitive identifiers.
const UNSAVED_FIELDS = [
  'declarationAccurate', 'consentProcessing', 'consentSensitive', 'consentFinancialIdentity', 'website',
  'nin', 'dateOfBirth', 'vin', 'apcPartyRegistrationNumber', 'bankName', 'accountName', 'accountNumber',
];

const EMPTY = {
  firstName: '', middleName: '', lastName: '', dateOfBirth: '', email: '', phone: '',
  nin: '', vin: '', apcPartyRegistrationNumber: '', bankName: '', accountName: '', accountNumber: '',
  stateOfOrigin: '', lgaOfOrigin: '',
  agentCategory: '', state: STATE, lga: '', wardCode: '', pollingUnitCode: '', electoralRequired: false,
  ward: '', pollingUnitName: '', senatorialDistrict: '',
  declarationAccurate: false, consentProcessing: false, consentSensitive: false, consentFinancialIdentity: false, website: '',
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
      <ol className="grid grid-cols-5 gap-2">
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
        <Controller control={control} name="dateOfBirth" render={({ field }) => (
          <DateField
            label="Date of birth"
            hint="For example, 17/05/1990. Type it or use the calendar."
            className="sm:max-w-xs"
            max={todayInLagos()}
            min="1900-01-01"
            value={field.value}
            onChange={field.onChange}
            onBlur={field.onBlur}
            ref={field.ref}
            error={errors.dateOfBirth?.message}
          />
        )} />
      </FieldGroup>

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

function StepIdentity({ register, errors, control }) {
  return (
    <div className="grid gap-10">
      <Alert tone="info" title="Why we ask for these details">
        Your NIN, VIN and APC party registration number let the coordination team confirm your identity, voter registration and party membership. Your bank details are used only to pay any allowance due to you for your role. They are stored encrypted and only authorised administrators can see them. This form checks the format of each number; it does not verify them with NIMC, INEC, APC or your bank.
      </Alert>

      <FieldGroup title="Identification" description="Enter each number exactly as printed on your documents.">
        <TextField
          label="National Identification Number (NIN)"
          hint="Exactly 11 digits, with no spaces."
          inputMode="numeric"
          autoComplete="off"
          maxLength={11}
          className="sm:max-w-sm"
          inputClassName="tabular tracking-wider"
          error={errors.nin?.message}
          {...register('nin')}
        />
        <TextField
          label="Voter Identification Number (VIN)"
          hint="Printed next to “VIN” on your voter’s card. It is not the polling unit code or the card’s serial number. Format check pending official INEC rules."
          autoComplete="off"
          autoCapitalize="characters"
          spellCheck={false}
          maxLength={30}
          inputClassName="font-mono tracking-wider"
          error={errors.vin?.message}
          {...register('vin')}
        />
        <TextField
          label="APC party registration number"
          hint="As shown on your APC membership card. Format check pending official APC rules."
          autoComplete="off"
          spellCheck={false}
          maxLength={40}
          className="sm:max-w-sm"
          inputClassName="font-mono"
          error={errors.apcPartyRegistrationNumber?.message}
          {...register('apcPartyRegistrationNumber')}
        />
      </FieldGroup>

      <FieldGroup title="Bank details" description="The account any allowance will be paid into. It should be in your own name.">
        <Controller control={control} name="bankName" render={({ field }) => (
          <Combobox
            label="Bank name"
            placeholder="Type to search Nigerian banks"
            options={NIGERIAN_BANKS}
            emptyText="No bank matches. Check the spelling, or contact the coordination team if your bank is not listed."
            value={field.value}
            onBlur={field.onBlur}
            ref={field.ref}
            onChange={field.onChange}
            error={errors.bankName?.message}
          />
        )} />
        <TextField label="Account name" hint="The full name on the account, as your bank shows it." autoComplete="off" maxLength={100} error={errors.accountName?.message} {...register('accountName')} />
        <TextField
          label="Account number"
          hint="Exactly 10 digits (NUBAN), with no spaces."
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          className="sm:max-w-sm"
          inputClassName="tabular tracking-wider"
          error={errors.accountNumber?.message}
          {...register('accountNumber')}
        />
      </FieldGroup>
    </div>
  );
}

function StepRole({ register, errors, control, watch, setValue }) {
  const [lga, wardCode, pollingUnitCode, agentCategory] = watch(['lga', 'wardCode', 'pollingUnitCode', 'agentCategory']);
  const clear = (...names) => names.forEach((n) => setValue(n, ''));

  const wards = useLocationList(lga ? `/locations/wards?state=${encodeURIComponent(STATE)}&lga=${encodeURIComponent(lga)}` : null);
  const configured = wards.status === 'ready' && wards.data.configured;
  const unconfigured = wards.status === 'ready' && !wards.data.configured;
  const required = Boolean(configured && wards.data.required);
  const wardKnown = configured && wards.data.wards.some((w) => w.code === wardCode);
  // Where the chosen role serves: agents at a polling unit, ward officers at a
  // ward, LGA officers across an LGA. Only that level's fields are shown.
  const level = agentCategory ? levelOf(agentCategory) : 'pollingUnit';
  const units = useLocationList(wardKnown && level === 'pollingUnit'
    ? `/locations/polling-units?state=${encodeURIComponent(STATE)}&lga=${encodeURIComponent(lga)}&ward=${encodeURIComponent(wardCode)}`
    : null);
  // Officer posts already filled in this LGA (never who holds them).
  const officerPosts = configured ? wards.data.officerPosts ?? { lgaOfficer: false, wardOfficers: [] } : null;
  const lgaPostFilled = level === 'lga' && Boolean(officerPosts?.lgaOfficer);
  const wardPostFilled = level === 'ward' && Boolean(wardCode && officerPosts?.wardOfficers?.includes(wardCode));

  // Lets the browser require ward and polling unit only where official data
  // exists. The server applies the same rule independently.
  useEffect(() => { setValue('electoralRequired', required); }, [required, setValue]);
  useEffect(() => { setValue('senatorialDistrict', configured ? wards.data.senatorialDistrict : ''); }, [configured, wards.data, setValue]);

  const wardOptions = configured ? wards.data.wards.map((w) => ({ value: w.code, label: w.name, description: `${w.code}${level === 'ward' && officerPosts?.wardOfficers?.includes(w.code) ? ' · officer post filled' : ''}` })) : [];
  // Shows which agent positions are already filled at each polling unit.
  const filledNote = (taken = []) => (taken.length >= 2 ? ' · both agents filled' : taken.length ? ` · ${labelFor(AGENT_CATEGORIES, taken[0])} filled` : '');
  const unitOptions = units.status === 'ready' ? units.data.map((u) => ({ value: u.code, label: u.name, description: `${u.code.slice(-3)}${filledNote(u.taken)}` })) : [];
  const chosenUnit = units.status === 'ready' ? units.data.find((u) => u.code === pollingUnitCode) : null;
  const positionFilled = Boolean(chosenUnit && agentCategory && chosenUnit.taken?.includes(agentCategory));

  // Switching role clears location answers the new role does not use.
  useEffect(() => {
    if (level === 'lga') clear('wardCode', 'ward', 'pollingUnitCode', 'pollingUnitName');
    if (level === 'ward') clear('pollingUnitCode', 'pollingUnitName');
  }, [level]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div className="grid gap-10">
      <SelectField
        label="Role"
        hint="Choose the role you have been asked to serve in. Agents serve at one polling unit; collation officers serve a whole ward or LGA."
        placeholder="Choose your role"
        options={REGISTRATION_CATEGORIES}
        className="sm:max-w-sm"
        error={errors.agentCategory?.message}
        {...register('agentCategory')}
      />

      <FieldGroup title={{ lga: 'Your LGA', ward: 'Your ward' }[level] ?? 'Your polling unit'} description="Choose from the official INEC list for Lagos State.">
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
            The official ward and polling unit list for {lga} has not been added. Contact the coordination team before continuing.
          </Alert>
        )}

        {lgaPostFilled && (
          <Alert tone="warning" title={`The LGA Collation Officer post for ${lga} is already filled`}>
            Each LGA has one LGA Collation Officer. If you were asked to serve here, contact the coordination team.
          </Alert>
        )}

        {lga && level !== 'lga' && (wards.status === 'loading' || configured) && (
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
            {wardPostFilled && (
              <Alert tone="warning" title="The Ward Collation Officer post for this ward is already filled">
                Each ward has one Ward Collation Officer. If you were asked to serve here, contact the coordination team.
              </Alert>
            )}
            {level === 'pollingUnit' && (units.status === 'error' ? <LoadError what="polling unit" onRetry={units.retry} /> : (
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
            ))}
            {positionFilled && (
              <Alert tone="warning" title={`The ${labelFor(AGENT_CATEGORIES, agentCategory)} position here is already filled`}>
                Each polling unit has one Agent 1 and one Agent 2. Check that you chose the right role and polling unit. If you were asked to serve here, contact the coordination team.
              </Alert>
            )}
          </>
        )}

        {configured && (
          <section aria-labelledby="delimitation-title" className="rounded-xl border border-line bg-mist/60 p-4 sm:p-5">
            <h3 id="delimitation-title" className="font-display text-base font-semibold text-forest-900">Delimitation</h3>
            <p className="mt-0.5 text-sm text-slate-500">Filled in from the official INEC data as you choose.</p>
            <dl className="mt-3 grid gap-3 text-[15px] sm:grid-cols-2">
              <div><dt className="text-sm text-slate-500">Senatorial district</dt><dd className="font-medium text-ink">{titleCase(wards.data.senatorialDistrict)}</dd></div>
              {level === 'pollingUnit' && <div><dt className="text-sm text-slate-500">Polling unit code</dt><dd className="font-mono font-semibold text-ink">{pollingUnitCode || '–'}</dd></div>}
              {level === 'ward' && <div><dt className="text-sm text-slate-500">Ward code</dt><dd className="font-mono font-semibold text-ink">{wardCode || '–'}</dd></div>}
            </dl>
          </section>
        )}
      </FieldGroup>
    </div>
  );
}

// What the browser read from the voter's card, compared with the typed VIN.
// The team checks every card again; this only catches typos early.
function CardCheckNotice({ scan, vinCheck, confirmed, onConfirm, onEditVin }) {
  if (!scan || scan.status === 'idle' || scan.status === 'skipped') return null;
  if (scan.status === 'reading') {
    return <p className="flex items-center gap-2 text-sm text-slate-600"><RotateCw className="size-4 animate-spin" aria-hidden />Checking the VIN on your voter’s card…</p>;
  }
  if (vinCheck.result === 'match') return <Alert tone="success" title="The VIN on your card matches the one you entered" />;
  if (vinCheck.result === 'unreadable') {
    return <Alert tone="info" title="We could not read the VIN on your card photo">That is fine: the coordination team will check it. A sharp, well-lit photo of the whole card helps.</Alert>;
  }
  if (confirmed) return <Alert tone="info" title="You confirmed your VIN">The coordination team will check it against your card.</Alert>;
  return (
    <Alert tone="warning" title="Your VIN may not match your voter’s card" action={
      <div className="flex flex-wrap gap-2">
        <Button size="sm" onClick={onEditVin}>Change my VIN</Button>
        <Button size="sm" variant="secondary" onClick={onConfirm}>My VIN is correct</Button>
      </div>
    }>
      Your card seems to show <span className="font-mono font-semibold">{vinCheck.read}</span>. Reading photos is not perfect, so compare it with the card itself.
    </Alert>
  );
}

function StepDocuments({ files, setFile, fileErrors, setFileError, cardNotice }) {
  return (
    <div className="grid gap-8">
      <Alert tone="info" title="How your files are checked">
        We check that each file really is a photo or PDF, is complete, and is clear enough to read. These checks do not prove that a voter’s card is genuine: the coordination team verifies cards separately. Photos are resized and location data is removed before upload.
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
      {cardNotice}
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

function StepReview({ values, files, errors, control, onEdit, cardNotice }) {
  return (
    <div className="grid gap-5">
      {cardNotice}
      <ReviewSection title="Your details" step={0} onEdit={onEdit} rows={[
        ['Name', [values.firstName, values.middleName, values.lastName].filter(Boolean).join(' ')],
        ['Date of birth', /^\d{4}-\d{2}-\d{2}$/.test(values.dateOfBirth) ? `${values.dateOfBirth.slice(8, 10)}/${values.dateOfBirth.slice(5, 7)}/${values.dateOfBirth.slice(0, 4)}` : ''],
        ['Email', values.email],
        ['Phone', values.phone],
        ['Origin', values.lgaOfOrigin && `${values.lgaOfOrigin}, ${stateLabel(values.stateOfOrigin)}`],
      ]} />
      <ReviewSection title="Your role and location" step={1} onEdit={onEdit} rows={[
        ['Role', labelFor(AGENT_CATEGORIES, values.agentCategory)],
        ['LGA', values.lga && `${values.lga}, Lagos State`],
        ['Ward', levelOf(values.agentCategory) !== 'lga' && values.ward && `${values.ward} (${values.wardCode})`],
        ['Polling unit', levelOf(values.agentCategory) === 'pollingUnit' && values.pollingUnitName],
        ['Polling unit code', levelOf(values.agentCategory) === 'pollingUnit' && values.pollingUnitCode],
        ['Senatorial district', titleCase(values.senatorialDistrict)],
      ]} />
      <ReviewSection title="Identity and bank details" step={IDENTITY_STEP} onEdit={onEdit} rows={[
        ['NIN', values.nin],
        ['VIN', values.vin],
        ['APC party registration number', values.apcPartyRegistrationNumber],
        ['Bank', labelFor(NIGERIAN_BANKS, values.bankName)],
        ['Account name', values.accountName],
        ['Account number', values.accountNumber],
      ]}>
        <p className="border-t border-line px-4 py-3 text-sm text-slate-500 sm:px-5">Check these carefully: they are saved exactly as you typed them.</p>
      </ReviewSection>
      <ReviewSection title="Your documents" step={DOCUMENTS_STEP} onEdit={onEdit}>
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
        <Controller control={control} name="declarationAccurate" render={({ field }) => (
          <Checkbox checked={field.value} onChange={field.onChange} error={errors.declarationAccurate?.message}>
            I confirm that the details I have given are accurate, and that the passport photograph and voter’s card are my own and unaltered.
          </Checkbox>
        )} />
        <Controller control={control} name="consentSensitive" render={({ field }) => (
          <Checkbox checked={field.value} onChange={field.onChange} error={errors.consentSensitive?.message}>
            I consent to APC Lagos storing my passport photograph and voter’s card so that authorised staff can verify my registration.
          </Checkbox>
        )} />
        <Controller control={control} name="consentFinancialIdentity" render={({ field }) => (
          <Checkbox checked={field.value} onChange={field.onChange} error={errors.consentFinancialIdentity?.message}>
            I consent to APC Lagos storing my NIN, VIN, APC party registration number and bank details, encrypted, so that authorised administrators can verify my registration and pay any allowance due to me.
          </Checkbox>
        )} />
        <Controller control={control} name="consentProcessing" render={({ field }) => (
          <Checkbox checked={field.value} onChange={field.onChange} error={errors.consentProcessing?.message}>
            I agree that APC Lagos may use the information in this form to register me in the role I chose and contact me about it, as described in the privacy notice.
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
  const [step, setStep] = useState(() => Math.min(draft?.step ?? 0, LAST_DRAFT_STEP));
  const [maxReached, setMaxReached] = useState(() => Math.min(draft?.maxReached ?? 0, LAST_DRAFT_STEP));
  const [submitError, setSubmitError] = useState(null);
  const captchaOn = Boolean(useCaptchaSiteKey());
  const [captcha, setCaptcha] = useState('');
  const [captchaRound, setCaptchaRound] = useState(0);
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

  // Read the VIN on the voter's card in the browser as soon as it is chosen.
  const [cardScan, setCardScan] = useState({ status: 'idle', candidates: [] });
  const [vinConfirmed, setVinConfirmed] = useState(false);
  const pvc = files.pvc;
  useEffect(() => {
    if (!pvc) { setCardScan({ status: 'idle', candidates: [] }); return undefined; }
    if (pvc.type === 'application/pdf') { setCardScan({ status: 'skipped', candidates: [] }); return undefined; }
    let cancelled = false;
    setCardScan({ status: 'reading', candidates: [] });
    import('../lib/cardReader.js')
      .then(({ readCard }) => readCard(pvc.original ?? pvc.blob))
      .then(({ candidates }) => { if (!cancelled) setCardScan({ status: 'done', candidates }); })
      .catch(() => { if (!cancelled) setCardScan({ status: 'failed', candidates: [] }); });
    return () => { cancelled = true; };
  }, [pvc]);
  const typedVin = watch('vin');
  useEffect(() => { setVinConfirmed(false); }, [typedVin, cardScan.candidates]);
  const vinCheck = ['done', 'failed'].includes(cardScan.status) ? compareVin(normaliseVin(typedVin), cardScan.candidates) : { result: 'skipped' };
  const vinNeedsAnswer = ['close', 'mismatch'].includes(vinCheck.result) && !vinConfirmed;

  // Free preview images when leaving the page.
  const filesRef = useRef(files);
  filesRef.current = files;
  useEffect(() => () => Object.values(filesRef.current).forEach((f) => f?.previewUrl && URL.revokeObjectURL(f.previewUrl)), []);

  // Save text answers (never documents, consents or sensitive identifiers) so a dropped connection loses little.
  useEffect(() => {
    const sub = watch((values) => storage.write(DRAFT_KEY, { values: savable(values), step: Math.min(stepRef.current, LAST_DRAFT_STEP), maxReached: Math.min(maxReached, LAST_DRAFT_STEP) }));
    return () => sub.unsubscribe();
  }, [watch, maxReached]);

  useEffect(() => {
    if (firstRender.current) { firstRender.current = false; return; }
    headingRef.current?.focus({ preventScroll: true });
    headingRef.current?.scrollIntoView({ block: 'start', behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    storage.write(DRAFT_KEY, { values: savable(getValues()), step: Math.min(step, LAST_DRAFT_STEP), maxReached: Math.min(maxReached, LAST_DRAFT_STEP) });
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
    if (missingDocuments()) { goTo(DOCUMENTS_STEP); return; }
    if (vinNeedsAnswer) {
      setSubmitError({ tone: 'warning', title: 'Check your VIN', message: 'The VIN you entered may not match your voter’s card. Change it, or confirm that it is correct.' });
      return;
    }
    const body = new FormData();
    body.append('data', JSON.stringify({ ...values, cardCheck: { vin: vinCheck.result, applicantConfirmed: vinConfirmed } }));
    for (const kind of requiredDocuments()) body.append(kind, files[kind].blob, files[kind].filename);
    if (captchaOn && !captcha) {
      setSubmitError({ tone: 'warning', title: 'Complete the security check', message: 'Tick the security check above the button, then submit again.' });
      return;
    }
    if (captcha) body.append('captcha', captcha);
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
      } else if (err.code === 'CAPTCHA_FAILED') {
        setSubmitError({ tone: 'warning', title: 'Complete the security check', message: err.message });
      } else if (err.code === 'TOO_LARGE') {
        setSubmitError({ tone: 'error', title: 'Your files are too large', message: err.message });
      } else {
        setSubmitError({ tone: 'error', title: 'Your registration was not sent', message: err.message, retry: err.code === 'NETWORK' || err.status >= 500 || err.status === 429 });
      }
      // Each security-check token works once: get a new one for the next try.
      if (captchaOn) { setCaptcha(''); setCaptchaRound((n) => n + 1); }
    }
  };

  const onContinue = handleSubmit(() => {
    if (step === DOCUMENTS_STEP && missingDocuments()) return;
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
  const cardNotice = <CardCheckNotice scan={cardScan} vinCheck={vinCheck} confirmed={vinConfirmed} onConfirm={() => { setVinConfirmed(true); setSubmitError(null); }} onEditVin={() => goTo(IDENTITY_STEP)} />;

  return (
    <div className="bg-mist pb-32 pt-8 sm:pt-12 lg:pb-20">
      <div className="container-page grid gap-8 lg:grid-cols-[1fr_320px] lg:gap-12">
        <div className="min-w-0">
          <h1 className="type-h2 text-forest-900">Registration</h1>
          <p className="mt-3 text-slate-600">Step {step + 1} of {STEPS.length}. Your contact and polling unit answers are kept on this device until you submit. Identity and bank details and documents are never saved on the device, so add them in one sitting.</p>
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
                {step === IDENTITY_STEP && <StepIdentity {...stepProps} />}
                {step === DOCUMENTS_STEP && <StepDocuments files={files} setFile={setFile} fileErrors={fileErrors} setFileError={setFileError} cardNotice={cardNotice} />}
                {step === 4 && <StepReview values={getValues()} files={files} errors={errors} control={control} onEdit={goTo} cardNotice={cardNotice} />}
              </m.div>
            </AnimatePresence>

            {submitError && (
              <Alert tone={submitError.tone} title={submitError.title} className="mt-6" action={
                submitError.duplicate ? <Link to="/status" className="font-semibold text-forest-900 underline underline-offset-4">Check your registration status</Link> : null
              }>
                {submitError.message}
              </Alert>
            )}
            {isLast && !registrationClosed && <div className="mt-6"><Turnstile onToken={setCaptcha} resetKey={captchaRound} /></div>}
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
                <li className="flex gap-3"><Clock className="mt-0.5 size-5 shrink-0 text-gold-500" aria-hidden />About ten minutes, five short steps.</li>
                <li className="flex gap-3"><Landmark className="mt-0.5 size-5 shrink-0 text-gold-500" aria-hidden />Your NIN, VIN, APC party registration number and bank account details.</li>
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
