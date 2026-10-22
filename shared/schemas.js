// Validation schemas shared by the browser form and the API.
// The server re-validates every request with these exact rules.
import { z } from 'zod';
import { STATE, LGA_NAMES, isValidLcda } from './lagos.js';
import { STATE_NAMES, isValidStateLga } from './nigeria.js';
import {
  CONTACT_METHODS, AGENT_TYPES, INTERESTS, SKILLS, AVAILABILITY, PARTICIPATION_FORMATS, valuesOf,
} from './options.js';

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

const trimmed = (max) => z.string().trim().max(max);

const name = (label) =>
  z.string({ required_error: `Enter your ${label}` }).trim()
    .min(2, `Enter your ${label}`)
    .max(60, `${label[0].toUpperCase() + label.slice(1)} must be 60 characters or fewer`)
    .regex(NAME_RE, `Use letters only in your ${label}`);

const oneOf = (list, message) => z.enum(valuesOf(list), { errorMap: () => ({ message }) });

export const phoneSchema = z.string({ required_error: 'Enter your phone number' }).trim()
  .min(1, 'Enter your phone number')
  .refine((v) => normalisePhone(v) !== null, 'Enter a valid Nigerian mobile number, for example 0803 123 4567');

export const personalSchema = z.object({
  firstName: name('first name'),
  lastName: name('last name'),
  email: z.union([z.literal(''), z.string().trim().toLowerCase().email('Enter a valid email address').max(120)]).optional().default(''),
  phone: phoneSchema,
  contactMethod: oneOf(CONTACT_METHODS, 'Choose how we should contact you'),
  agentType: oneOf(AGENT_TYPES, 'Choose your agent type'),
});

export const WARD_CODE_RE = /^\d{2}-\d{2}$/;
export const POLLING_UNIT_CODE_RE = /^\d{2}-\d{2}-\d{2}-\d{3}$/;

export const locationSchema = z.object({
  stateOfOrigin: z.enum(STATE_NAMES, { errorMap: () => ({ message: 'Choose your state of origin' }) }),
  lgaOfOrigin: z.string({ required_error: 'Choose your LGA of origin' }).trim().min(1, 'Choose your LGA of origin').max(80),
  state: z.literal(STATE, { errorMap: () => ({ message: 'This programme registers volunteers in Lagos State' }) }),
  lga: z.enum(LGA_NAMES, { errorMap: () => ({ message: 'Choose your Local Government Area' }) }),
  lcda: trimmed(60).optional().default(''),
  // Ward and polling unit are chosen by INEC code. The server checks both
  // against the official dataset and stores the names from that data.
  wardCode: z.union([z.literal(''), z.string().regex(WARD_CODE_RE, 'Choose your ward')]).optional().default(''),
  pollingUnitCode: z.union([z.literal(''), z.string().regex(POLLING_UNIT_CODE_RE, 'Choose your polling unit')]).optional().default(''),
  // Free-text ward, accepted only where no official ward data is configured.
  ward: trimmed(80).optional().default(''),
  community: trimmed(80).optional().default(''),
  // Set by the form when official ward data is loaded for the chosen LGA, so
  // the browser can require the fields. The server decides independently.
  electoralRequired: z.boolean().optional().default(false),
});

export const skillsSchema = z.object({
  interests: z.array(oneOf(INTERESTS, 'Choose from the listed interests'), { required_error: 'Choose at least one area of interest' }).min(1, 'Choose at least one area of interest').max(INTERESTS.length),
  skills: z.array(oneOf(SKILLS, 'Choose from the listed skills')).max(SKILLS.length).default([]),
  availability: z.array(oneOf(AVAILABILITY, 'Choose from the listed times'), { required_error: 'Choose at least one time you are usually free' }).min(1, 'Choose at least one time you are usually free').max(AVAILABILITY.length),
  participationFormat: oneOf(PARTICIPATION_FORMATS, 'Choose how you would like to take part'),
  motivation: trimmed(500).optional().default(''),
});

export const consentSchema = z.object({
  ageConfirmed: z.literal(true, { errorMap: () => ({ message: 'You must be 18 or older to register' }) }),
  consentProcessing: z.literal(true, { errorMap: () => ({ message: 'Agree to the privacy notice to submit your application' }) }),
  consentCommunications: z.boolean().default(false),
});

// Cross-field rules.
function refinePersonal(data, ctx) {
  if (data.contactMethod === 'email' && !data.email) {
    ctx.addIssue({ code: 'custom', path: ['email'], message: 'Add an email address, or choose another contact method' });
  }
}

function refineLocation(data, ctx) {
  if (data.stateOfOrigin && data.lgaOfOrigin && !isValidStateLga(data.stateOfOrigin, data.lgaOfOrigin)) {
    ctx.addIssue({ code: 'custom', path: ['lgaOfOrigin'], message: `Choose an LGA in ${data.stateOfOrigin}` });
  }
  if (data.electoralRequired && !data.wardCode) {
    ctx.addIssue({ code: 'custom', path: ['wardCode'], message: 'Choose your ward' });
  }
  if (data.electoralRequired && !data.pollingUnitCode) {
    ctx.addIssue({ code: 'custom', path: ['pollingUnitCode'], message: 'Choose your polling unit' });
  }
  if (data.lga && !isValidLcda(data.lga, data.lcda)) {
    ctx.addIssue({ code: 'custom', path: ['lcda'], message: `This development area is not part of ${data.lga} LGA` });
  }
}

export const registrationSchema = personalSchema
  .merge(locationSchema)
  .merge(skillsSchema)
  .merge(consentSchema)
  .extend({ website: z.string().max(0).optional() }) // honeypot: real people leave this empty
  .superRefine((data, ctx) => {
    refinePersonal(data, ctx);
    refineLocation(data, ctx);
  });

const BASE_STEPS = [personalSchema, locationSchema, skillsSchema, consentSchema];

// Per-step schemas for the multi-step form, each with its own cross-field rules.
// The final step validates the whole application.
export const STEP_SCHEMAS = [
  personalSchema.superRefine(refinePersonal),
  locationSchema.superRefine(refineLocation),
  skillsSchema,
  registrationSchema,
];

export const STEP_FIELDS = BASE_STEPS.map((s) => Object.keys(s.shape));

export const statusLookupSchema = z.object({
  reference: z.string().trim().toUpperCase().regex(/^(LAG|DEMO)-[A-Z0-9]{4}-[A-Z0-9]{4}$/, 'Enter your reference, for example LAG-7K3M-9QPX'),
  phone: phoneSchema,
});
