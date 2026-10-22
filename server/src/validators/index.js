import { z } from 'zod';
import mongoose from 'mongoose';
import { LGA_NAMES } from '../../../shared/lagos.js';
import {
  INTERESTS, SKILLS, CONTACT_METHODS, VOLUNTEER_STATUSES, OPPORTUNITY_STATUSES, valuesOf,
} from '../../../shared/options.js';
import { skillsSchema } from '../../../shared/schemas.js';

const objectId = z.string().refine((v) => mongoose.isValidObjectId(v), 'Invalid identifier');
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');
const email = z.string().trim().toLowerCase().email('Enter a valid email address').max(120);
const page = z.coerce.number().int().min(1).max(10000).default(1);

export const loginSchema = z.object({
  email,
  password: z.string().min(1, 'Enter your password').max(200),
});

export const volunteerQuerySchema = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(valuesOf(VOLUNTEER_STATUSES)).optional(),
  lga: z.enum(LGA_NAMES).optional(),
  interest: z.enum(valuesOf(INTERESTS)).optional(),
  from: isoDate.optional(),
  to: isoDate.optional(),
  sample: z.enum(['all', 'real', 'sample']).default('all'),
  sort: z.enum(['newest', 'oldest', 'name']).default('newest'),
  page,
  limit: z.coerce.number().int().min(5).max(100).default(20),
});

export const statusChangeSchema = z.object({
  status: z.enum(valuesOf(VOLUNTEER_STATUSES)),
  reason: z.string().trim().max(500).optional().default(''),
  notify: z.boolean().default(true),
});

export const noteSchema = z.object({ body: z.string().trim().min(1, 'Write a note').max(2000) });

export const assignmentSchema = z.object({
  opportunityId: objectId,
  status: z.enum(['interested', 'assigned', 'withdrawn']),
});

const optionalDate = z.union([z.literal(''), z.null(), z.coerce.date()]).optional().transform((v) => (v ? v : null));

const opportunityBase = z.object({
  title: z.string().trim().min(3, 'Add a title').max(120),
  summary: z.string().trim().min(10, 'Add a short summary').max(280),
  description: z.string().trim().max(4000).optional().default(''),
  category: z.enum(valuesOf(INTERESTS), { errorMap: () => ({ message: 'Choose a category' }) }),
  skills: z.array(z.enum(valuesOf(SKILLS))).max(SKILLS.length).default([]),
  eligibility: z.string().trim().max(1000).optional().default(''),
  location: z.object({
    lga: z.union([z.literal(''), z.enum(LGA_NAMES)]).optional().default(''),
    venue: z.string().trim().max(160).optional().default(''),
    isRemote: z.boolean().default(false),
  }).default({}),
  startDate: optionalDate,
  endDate: optionalDate,
  commitment: z.string().trim().max(120).optional().default(''),
  capacity: z.union([z.null(), z.coerce.number().int().min(0).max(100000)]).optional(),
  coverImage: z.object({
    url: z.union([z.literal(''), z.string().url().max(500).refine((u) => u.startsWith('https://'), 'Use an https image link')]).optional().default(''),
    publicId: z.string().max(200).optional(),
    alt: z.string().trim().max(200).optional().default(''),
  }).optional(),
  status: z.enum(OPPORTUNITY_STATUSES).default('draft'),
});

const dateOrder = (d, ctx) => {
  if (d.startDate && d.endDate && d.endDate < d.startDate) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'The end date must be after the start date' });
};

export const opportunityCreateSchema = opportunityBase.superRefine(dateOrder);
export const opportunityUpdateSchema = opportunityBase.partial().superRefine(dateOrder);

export const opportunityQuerySchema = z.object({ status: z.enum(OPPORTUNITY_STATUSES).optional() });

export const publicOpportunityQuerySchema = z.object({
  category: z.enum(valuesOf(INTERESTS)).optional(),
  limit: z.coerce.number().int().min(1).max(50).default(24),
});

export const announcementSchema = z.object({
  title: z.string().trim().min(3, 'Add a title').max(140),
  body: z.string().trim().min(10, 'Write the announcement').max(3000),
  status: z.enum(['draft', 'published', 'archived']).default('draft'),
});

export const pageQuerySchema = z.object({ page, limit: z.coerce.number().int().min(10).max(100).default(30) });

export const resolveRequestSchema = z.object({
  status: z.enum(['completed', 'declined']),
  resolution: z.string().trim().max(1000).optional().default(''),
});

export const staffCreateSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email,
  role: z.enum(['admin', 'reviewer']),
  password: z.string().min(12, 'Use at least 12 characters').max(200),
});

export const staffUpdateSchema = z.object({
  role: z.enum(['admin', 'reviewer']).optional(),
  active: z.boolean().optional(),
});

// ---------- Volunteer portal ----------

export const requestCodeSchema = z.object({ email });
export const verifyCodeSchema = z.object({ email, code: z.string().trim().regex(/^\d{6}$/, 'Enter the 6-digit code') });

export const portalUpdateSchema = skillsSchema.partial().omit({ motivation: true }).extend({
  contactMethod: z.enum(valuesOf(CONTACT_METHODS)).optional(),
  ward: z.string().trim().max(80).optional(),
  community: z.string().trim().max(80).optional(),
  consentCommunications: z.boolean().optional(),
}).refine((d) => !d.interests || d.interests.length > 0, { path: ['interests'], message: 'Choose at least one area of interest' })
  .refine((d) => !d.availability || d.availability.length > 0, { path: ['availability'], message: 'Choose at least one time' });

export const dataRequestSchema = z.object({
  type: z.enum(['correction', 'deletion', 'export']),
  details: z.string().trim().max(1000).optional().default(''),
});

