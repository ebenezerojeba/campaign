// Validation schemas shared by the browser form and the API.
// The server re-validates every request with these exact rules. Uploaded
// files are checked separately (server/src/services/documents.js).
import { z } from 'zod';
import { STATE, LGA_NAMES } from './lagos.js';
import { STATE_NAMES, isValidStateLga } from './nigeria.js';
import { NIGERIAN_BANKS, REGISTRATION_CATEGORIES, valuesOf } from './options.js';

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

// Today's date in Lagos as YYYY-MM-DD, the latest allowed date of birth.
export function todayInLagos(now = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

// True for a real calendar date written YYYY-MM-DD (rejects 2026-02-30).
export function isRealDate(iso) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso)) return false;
  const d = new Date(`${iso}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === iso;
}

// No age rule is applied: APC Lagos has not supplied an official eligibility rule.
const dateOfBirth = z.string({ required_error: 'Enter your date of birth' }).trim()
  .min(1, 'Enter your date of birth')
  .refine(isRealDate, 'Enter a real date in the format DD/MM/YYYY')
  .refine((v) => !isRealDate(v) || v <= todayInLagos(), 'Your date of birth cannot be in the future')
  .refine((v) => !isRealDate(v) || v >= '1900-01-01', 'Check the year of your date of birth');

// Values are trimmed of surrounding spaces and otherwise kept exactly as typed:
// malformed values are rejected, never silently corrected.
const nin = z.string({ required_error: 'Enter your NIN' }).trim()
  .min(1, 'Enter your NIN')
  .regex(NIN_RE, 'Your NIN must be exactly 11 digits, with no spaces or letters');
const accountNumber = z.string({ required_error: 'Enter your account number' }).trim()
  .min(1, 'Enter your account number')
  .regex(/^\d{10}$/, 'Your account number must be exactly 10 digits, with no spaces or letters');
const accountName = z.string({ required_error: 'Enter the account name' }).trim()
  .min(2, 'Enter the name on the bank account')
  .max(100, 'Account name must be 100 characters or fewer')
  .regex(/^[\p{L}\p{M}][\p{L}\p{M}\p{N}' .&()/-]*$/u, 'Use letters, spaces, hyphens, apostrophes or full stops in the account name');

// INEC and APC have not supplied official formats for these numbers (see
// AUDIT_REPORT.md), so only conservative character and length checks apply.
// Tighten them when official rules are provided.
const vin = z.string({ required_error: 'Enter your VIN' }).trim()
  .min(1, 'Enter your VIN')
  .min(6, 'Enter your full VIN as printed on your voter’s card')
  .max(30, 'Your VIN must be 30 characters or fewer')
  .regex(/^[A-Za-z0-9]+(?: [A-Za-z0-9]+)*$/, 'Use only the letters and numbers shown on your voter’s card')
  .refine((v) => /\d/.test(v), 'Your VIN contains numbers. Check you have entered it correctly');
const apcPartyRegistrationNumber = z.string({ required_error: 'Enter your APC party registration number' }).trim()
  .min(1, 'Enter your APC party registration number')
  .min(3, 'Enter your full APC party registration number')
  .max(40, 'Your APC party registration number must be 40 characters or fewer')
  .regex(/^[A-Za-z0-9]+(?:[ /-][A-Za-z0-9]+)*$/, 'Use only letters, numbers, spaces, hyphens or slashes')
  .refine((v) => /\d/.test(v), 'Your APC party registration number contains numbers. Check you have entered it correctly');

export const personalSchema = z.object({
  firstName: name('first name'),
  middleName: z.union([z.literal(''), name('middle name')]).optional().default(''),
  lastName: name('last name'),
  dateOfBirth,
  email: emailSchema,
  phone: phoneSchema,
  stateOfOrigin: z.enum(STATE_NAMES, { errorMap: () => ({ message: 'Choose your state of origin' }) }),
  lgaOfOrigin: z.string({ required_error: 'Choose your LGA of origin' }).trim().min(1, 'Choose your LGA of origin').max(80),
});

export const roleSchema = z.object({
  agentCategory: z.enum(valuesOf(REGISTRATION_CATEGORIES), { errorMap: () => ({ message: 'Choose your agent type' }) }),
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

export const identitySchema = z.object({
  nin,
  vin,
  apcPartyRegistrationNumber,
  bankName: z.enum(valuesOf(NIGERIAN_BANKS), { errorMap: () => ({ message: 'Choose your bank from the list' }) }),
  accountName,
  accountNumber,
});

export const consentSchema = z.object({
  declarationAccurate: z.literal(true, { errorMap: () => ({ message: 'Confirm that your details and documents are your own and accurate' }) }),
  consentProcessing: z.literal(true, { errorMap: () => ({ message: 'Agree to the privacy notice to submit your registration' }) }),
  consentSensitive: z.literal(true, { errorMap: () => ({ message: 'Agree to the use of your photograph and voter’s card for verification' }) }),
  consentFinancialIdentity: z.literal(true, { errorMap: () => ({ message: 'Agree to the use of your identification and bank details to submit your registration' }) }),
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
  .merge(identitySchema)
  .merge(consentSchema)
  .extend({
    website: z.string().max(0).optional(), // honeypot: real people leave this empty
    // Result of the voter's card check run in the applicant's browser (information only).
    cardCheck: z.object({
      vin: z.enum(['match', 'close', 'mismatch', 'unreadable', 'skipped']),
      applicantConfirmed: z.boolean().optional(),
    }).optional(),
  })
  .superRefine((data, ctx) => {
    refinePersonal(data, ctx);
    refineRole(data, ctx);
  });

// Per-step schemas for the multi-step form. Step 4 (documents) holds files,
// which the form checks itself. The final step validates everything.
export const STEP_SCHEMAS = [
  personalSchema.superRefine(refinePersonal),
  roleSchema.superRefine(refineRole),
  identitySchema,
  z.object({}).passthrough(),
  registrationSchema,
];

export const STEP_FIELDS = [
  Object.keys(personalSchema.shape),
  Object.keys(roleSchema.shape),
  Object.keys(identitySchema.shape),
  ['passport', 'pvc', 'selfie'],
  Object.keys(consentSchema.shape),
];

export const statusLookupSchema = z.object({
  reference: z.string().trim().toUpperCase().regex(/^(LAG|DEMO)-[A-Z0-9]{4}-[A-Z0-9]{4}$/, 'Enter your reference, for example LAG-7K3M-9QPX'),
  phone: phoneSchema,
  // Cloudflare Turnstile token, checked on the server when CAPTCHA is switched on.
  captcha: z.string().max(2048).optional(),
});
