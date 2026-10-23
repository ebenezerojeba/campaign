// Validation schemas shared by the browser form and the API.
// The server re-validates every request with these exact rules. Uploaded
// files are checked separately (server/src/services/documents.js).
import { z } from 'zod';
import { STATE, LGA_NAMES } from './lagos.js';
import { STATE_NAMES, isValidStateLga } from './nigeria.js';
import { NIGERIAN_BANKS, REGISTRATION_CATEGORIES, valuesOf } from './options.js';
import { OPTIONAL_FIELDS } from './agentForm.js';

const NAME_RE = /^[\p{L}][\p{L}\p{M}' .-]*$/u;

// Accepts 0803..., 803..., +234803..., 234803... (spaces, dashes allowed) and
// returns +234XXXXXXXXXX, or null when the number is not a valid Nigerian mobile.
export function normalisePhone(input) {
  if (typeof input !== 'string') return null;
  let digits = input.replace(/[\s().-]/g, '');
  if (digits.startsWith('+')) digits = digits.slice(1);
  if (!/^\d+$/.test(digits)) return null;
  if (digits.startsWith('234')) digits = digits.slice(3);
  else if (digits.startsWith('0')) digits = digits.slice(1);
  if (!/^[789][01]\d{8}$/.test(digits)) return null;
  return `+234${digits}`;
}

const name = (label) =>
  z.string({ required_error: `Enter your ${label}` }).trim()
    .min(2, `Enter your ${label}`)
    .max(60, `${label[0].toUpperCase() + label.slice(1)} must be 60 characters or fewer`)
    .regex(NAME_RE, `Use letters only in your ${label}`);

export const phoneSchema = z.string({ required_error: 'Enter your phone number' }).trim()
  .min(1, 'Enter your phone number')
  .refine((v) => normalisePhone(v) !== null, 'Enter a valid Nigerian mobile number, for example 0803 123 4567');

export const emailSchema = z.string({ required_error: 'Enter your email address' }).trim().toLowerCase()
  .min(1, 'Enter your email address')
  .max(120, 'Email address must be 120 characters or fewer')
  .email('Enter a valid email address, for example name@example.com');

export const WARD_CODE_RE = /^\d{2}-\d{2}$/;
export const POLLING_UNIT_CODE_RE = /^\d{2}-\d{2}-\d{2}-\d{3}$/;
export const NIN_RE = /^\d{11}$/;

// Whole years between an ISO date and today.
export function ageOn(isoDate, today = new Date()) {
  const d = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return NaN;
  let age = today.getUTCFullYear() - d.getUTCFullYear();
  const m = today.getUTCMonth() - d.getUTCMonth();
  if (m < 0 || (m === 0 && today.getUTCDate() < d.getUTCDate())) age -= 1;
  return age;
}

const dateOfBirth = z.string({ required_error: 'Enter your date of birth' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Enter your date of birth')
  .refine((v) => ageOn(v) >= 18, 'You must be 18 or older to register')
  .refine((v) => ageOn(v) <= 110, 'Check the year of your date of birth');

const nin = z.string({ required_error: 'Enter your NIN' }).trim()
  .regex(NIN_RE, 'Enter your 11-digit NIN without spaces');
const accountNumber = z.string({ required_error: 'Enter your account number' }).trim()
  .regex(/^\d{10}$/, 'Enter the 10-digit account number without spaces');
const identityNumber = (label) => z.string({ required_error: `Enter your ${label}` }).trim()
  .min(3, `Enter your ${label}`)
  .max(40, `${label[0].toUpperCase()}${label.slice(1)} must be 40 characters or fewer`)
  .regex(/^[\p{L}\p{N}][\p{L}\p{N} /-]*$/u, `Use letters, numbers, spaces, hyphens or slashes in your ${label}`);
const accountName = z.string({ required_error: 'Enter the account name' }).trim()
  .min(2, 'Enter the account name')
  .max(100, 'Account name must be 100 characters or fewer')
  .regex(/^[\p{L}\p{M}\p{N}][\p{L}\p{M}\p{N}' .&()/-]*$/u, 'Check the account name');

const sensitiveDetailsDisabled = z.never().optional();

export const personalSchema = z.object({
  firstName: name('first name'),
  middleName: z.union([z.literal(''), name('middle name')]).optional().default(''),
  lastName: name('last name'),
  email: emailSchema,
  phone: phoneSchema,
  stateOfOrigin: z.enum(STATE_NAMES, { errorMap: () => ({ message: 'Choose your state of origin' }) }),
  lgaOfOrigin: z.string({ required_error: 'Choose your LGA of origin' }).trim().min(1, 'Choose your LGA of origin').max(80),
  ...(OPTIONAL_FIELDS.dateOfBirth ? { dateOfBirth } : {}),
  ...(OPTIONAL_FIELDS.financialIdentityDetails ? {
    nin,
    voterRegistrationNumber: identityNumber('voter registration number'),
    apcPartyCardNumber: identityNumber('APC party card number'),
    bankName: z.enum(valuesOf(NIGERIAN_BANKS), { errorMap: () => ({ message: 'Choose a bank from the list' }) }),
    accountName,
    accountNumber,
  } : OPTIONAL_FIELDS.nin ? { nin } : {
    nin: sensitiveDetailsDisabled,
    voterRegistrationNumber: sensitiveDetailsDisabled,
    apcPartyCardNumber: sensitiveDetailsDisabled,
    bankName: sensitiveDetailsDisabled,
    accountName: sensitiveDetailsDisabled,
    accountNumber: sensitiveDetailsDisabled,
  }),
});

export const roleSchema = z.object({
  agentCategory: z.enum(valuesOf(REGISTRATION_CATEGORIES), { errorMap: () => ({ message: 'Choose your agent category' }) }),
  state: z.literal(STATE, { errorMap: () => ({ message: 'Registration is for polling units in Lagos State' }) }),
  lga: z.enum(LGA_NAMES, { errorMap: () => ({ message: 'Choose your Local Government Area' }) }),
  // Chosen by INEC code. The server checks both against the official dataset
  // and stores the names from that data.
  wardCode: z.union([z.literal(''), z.string().regex(WARD_CODE_RE, 'Choose your ward')]).optional().default(''),
  pollingUnitCode: z.union([z.literal(''), z.string().regex(POLLING_UNIT_CODE_RE, 'Choose your polling unit')]).optional().default(''),
  // Set by the form when official ward data is loaded for the chosen LGA, so
  // the browser can require the fields. The server decides independently.
  electoralRequired: z.boolean().optional().default(false),
});

export const consentSchema = z.object({
  ageConfirmed: z.literal(true, { errorMap: () => ({ message: 'You must be 18 or older to register' }) }),
  declarationAccurate: z.literal(true, { errorMap: () => ({ message: 'Confirm that your details and documents are your own and accurate' }) }),
  consentProcessing: z.literal(true, { errorMap: () => ({ message: 'Agree to the privacy notice to submit your registration' }) }),
  consentSensitive: z.literal(true, { errorMap: () => ({ message: 'Agree to the use of your photograph and voter’s card for verification' }) }),
  ...(OPTIONAL_FIELDS.financialIdentityDetails
    ? { consentFinancialIdentity: z.literal(true, { errorMap: () => ({ message: 'Consent is required to submit these additional details' }) }) }
    : { consentFinancialIdentity: sensitiveDetailsDisabled }),
});

function refinePersonal(data, ctx) {
  if (data.stateOfOrigin && data.lgaOfOrigin && !isValidStateLga(data.stateOfOrigin, data.lgaOfOrigin)) {
    ctx.addIssue({ code: 'custom', path: ['lgaOfOrigin'], message: `Choose an LGA in ${data.stateOfOrigin}` });
  }
}

function refineRole(data, ctx) {
  if (data.electoralRequired && !data.wardCode) ctx.addIssue({ code: 'custom', path: ['wardCode'], message: 'Choose your ward' });
  if (data.electoralRequired && !data.pollingUnitCode) ctx.addIssue({ code: 'custom', path: ['pollingUnitCode'], message: 'Choose your polling unit' });
}

export const registrationSchema = personalSchema
  .merge(roleSchema)
  .merge(consentSchema)
  .extend({ website: z.string().max(0).optional() }) // honeypot: real people leave this empty
  .superRefine((data, ctx) => {
    refinePersonal(data, ctx);
    refineRole(data, ctx);
  });

// Per-step schemas for the multi-step form. Step 3 (documents) holds files,
// which the form checks itself. The final step validates everything.
export const STEP_SCHEMAS = [
  personalSchema.superRefine(refinePersonal),
  roleSchema.superRefine(refineRole),
  z.object({}).passthrough(),
  registrationSchema,
];

export const STEP_FIELDS = [
  Object.keys(personalSchema.shape),
  Object.keys(roleSchema.shape),
  ['passport', 'pvc', 'selfie'],
  Object.keys(consentSchema.shape),
];

export const statusLookupSchema = z.object({
  reference: z.string().trim().toUpperCase().regex(/^(LAG|DEMO)-[A-Z0-9]{4}-[A-Z0-9]{4}$/, 'Enter your reference, for example LAG-7K3M-9QPX'),
  phone: phoneSchema,
});
