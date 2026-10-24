import { z } from 'zod';
import { LGA_NAMES } from '../../../shared/lagos.js';
import { STATE_NAMES } from '../../../shared/nigeria.js';
import { AGENT_CATEGORIES, REGISTRATION_STATUSES, valuesOf } from '../../../shared/options.js';
import { WARD_CODE_RE, POLLING_UNIT_CODE_RE } from '../../../shared/schemas.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(120);
const page = z.coerce.number().int().min(1).max(10000).default(1);

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password').max(200),
});

export const agentQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(valuesOf(REGISTRATION_STATUSES)).optional(),
  agentCategory: z.enum(valuesOf(AGENT_CATEGORIES)).optional(),
  lga: z.enum(LGA_NAMES).optional(),
  wardCode: z.string().regex(WARD_CODE_RE).optional(),
  pollingUnitCode: z.string().regex(POLLING_UNIT_CODE_RE).optional(),
  senatorialDistrict: z.string().trim().max(80).optional(),
  stateOfOrigin: z.enum(STATE_NAMES).optional(),
  lgaOfOrigin: z.string().trim().max(80).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  sample: z.enum(['all', 'real', 'sample']).default('all'),
  sort: z.enum(['newest', 'oldest', 'name']).default('newest'),
  // Export only: full identity and bank values need agents:sensitive:read.
  sensitive: z.enum(['masked', 'full']).default('masked'),
  page,
  limit: z.coerce.number().int().min(5).max(100).default(20),
});

export const wardQuerySchema = z.object({
  state: z.string().trim().min(1).max(40),
  lga: z.string().trim().min(1).max(80),
});

export const pollingUnitQuerySchema = wardQuerySchema.extend({
  ward: z.string().regex(WARD_CODE_RE, 'Choose a ward'),
});

export const statusChangeSchema = z.object({
  status: z.enum(valuesOf(REGISTRATION_STATUSES)),
  reason: z.string().trim().max(500).optional().default(''),
  notify: z.boolean().default(true),
});

export const noteSchema = z.object({ body: z.string().trim().min(1, 'Write a note').max(2000) });

export const deleteAgentSchema = z.object({
  confirmReference: z.string().trim().toUpperCase(),
  reason: z.string().trim().min(3, 'Give a reason, for example “Deletion requested by the applicant”').max(300),
});

export const pageQuerySchema = z.object({ page, limit: z.coerce.number().int().min(10).max(100).default(30) });

export const staffCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email,
  role: z.enum(['admin', 'reviewer']),
  password: z.string().min(12, 'Use at least 12 characters').max(200),
});

export const passwordChangeSchema = z.object({
  currentPassword: z.string().min(1, 'Enter your current password').max(200),
  newPassword: z.string().min(12, 'Use at least 12 characters').max(200),
});

export const staffUpdateSchema = z.object({
  role: z.enum(['admin', 'reviewer']).optional(),
  active: z.boolean().optional(),
});
