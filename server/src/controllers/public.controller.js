import { env, emailConfigured } from '../config/env.js';
import { dbConfigured, dbState, connectDb } from '../config/db.js';
import { Volunteer } from '../models/Volunteer.js';
import { Opportunity } from '../models/Opportunity.js';
import { ApiError, send } from '../utils/ApiError.js';
import { generateReference } from '../utils/reference.js';
import { normalisePhone } from '../../../shared/schemas.js';
import { PRIVACY_NOTICE_VERSION, labelFor, VOLUNTEER_STATUSES } from '../../../shared/options.js';
import { sendRegistrationEmails } from '../services/email.js';
import { resolveElectoral, wardsFor, pollingUnitsFor, senatorialDistricts } from '../services/electoral.js';

export async function health(_req, res) {
  let db = dbState();
  if (dbConfigured() && db !== 'connected') {
    try { await connectDb(); db = dbState(); } catch { db = 'unreachable'; }
  }
  res.json({ ok: true, data: { status: 'up', db, time: new Date().toISOString() } });
}

// Public, non-secret configuration used by the frontend.
export async function publicConfig(_req, res) {
  send(res, {
    registrationOpen: dbConfigured(),
    emailEnabled: emailConfigured(),
    demoMode: env.demoMode,
    contact: env.contact,
    privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    senatorialDistricts: senatorialDistricts(),
  });
}

// Aggregate, non-identifying figures only. Sample records are counted only
// when DEMO_MODE is on, and the response says so for labelling.
export async function publicStats(_req, res) {
  const match = env.demoMode ? {} : { isSample: false };
  const [byStatus, lgas, opportunities, sampleCount] = await Promise.all([
    Volunteer.aggregate([{ $match: match }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
    Volunteer.distinct('lga', match),
    Opportunity.countDocuments({ status: 'published', ...(env.demoMode ? {} : { isSample: false }) }),
    env.demoMode ? Volunteer.countDocuments({ isSample: true }) : 0,
  ]);
  const count = (s) => byStatus.find((b) => b._id === s)?.n ?? 0;
  send(res, {
    volunteers: byStatus.reduce((t, b) => t + b.n, 0),
    approved: count('approved'),
    opportunities,
    lgasRepresented: lgas.length,
    includesSampleData: sampleCount > 0,
  });
}

const publicOpportunityFields = 'title summary description category skills eligibility location startDate endDate commitment capacity coverImage publishedAt isSample';

export async function listOpportunities(req, res) {
  const { category, limit } = req.validatedQuery;
  const filter = { status: 'published' };
  if (!env.demoMode) filter.isSample = false;
  if (category) filter.category = category;
  const items = await Opportunity.find(filter).select(publicOpportunityFields).sort({ startDate: 1, publishedAt: -1 }).limit(limit).lean();
  send(res, items);
}

export async function getOpportunity(req, res) {
  const filter = { _id: req.params.id, status: 'published' };
  if (!env.demoMode) filter.isSample = false;
  const item = await Opportunity.findOne(filter).select(publicOpportunityFields).lean();
  if (!item) throw ApiError.notFound('This opportunity is no longer available');
  send(res, item);
}

const DUPLICATE_MESSAGE = 'An application with this phone number or email address already exists. Check your application status instead, or contact the programme team if you need to change your details.';

export async function register(req, res) {
  const data = req.body;
  const phone = normalisePhone(data.phone);
  const email = data.email || undefined;

  // Never trust the browser's ward or polling unit: check both against the official data.
  const electoral = resolveElectoral(data);
  if (electoral.errors) throw new ApiError(422, 'VALIDATION_FAILED', 'Some details need attention', { fields: electoral.errors });

  const existing = await Volunteer.exists({ $or: [{ phone }, ...(email ? [{ email }] : [])] });
  if (existing) throw ApiError.conflict(DUPLICATE_MESSAGE, 'DUPLICATE_REGISTRATION');

  const doc = {
    firstName: data.firstName,
    lastName: data.lastName,
    email,
    phone,
    contactMethod: data.contactMethod,
    agentType: data.agentType,
    stateOfOrigin: data.stateOfOrigin,
    lgaOfOrigin: data.lgaOfOrigin,
    state: data.state,
    lga: data.lga,
    lcda: data.lcda || undefined,
    ...electoral.fields,
    community: data.community || undefined,
    interests: [...new Set(data.interests)],
    skills: [...new Set(data.skills)],
    availability: [...new Set(data.availability)],
    participationFormat: data.participationFormat,
    motivation: data.motivation || undefined,
    consent: {
      processing: true,
      communications: data.consentCommunications,
      ageConfirmed: true,
      noticeVersion: PRIVACY_NOTICE_VERSION,
      at: new Date(),
    },
    statusHistory: [{ from: null, to: 'pending', reason: 'Application submitted', at: new Date() }],
  };

  let volunteer;
  for (let attempt = 0; attempt < 5 && !volunteer; attempt += 1) {
    try {
      volunteer = await Volunteer.create({ ...doc, reference: generateReference() });
    } catch (err) {
      if (err?.code !== 11000) throw err;
      const key = Object.keys(err.keyPattern ?? {})[0];
      if (key !== 'reference') throw ApiError.conflict(DUPLICATE_MESSAGE, 'DUPLICATE_REGISTRATION');
      // Reference collision: retry with a new one.
    }
  }
  if (!volunteer) throw new ApiError(500, 'SERVER_ERROR', 'We could not create a reference. Please try again.');

  // The registration is already saved; email outcome is recorded, never fatal.
  const notifications = await sendRegistrationEmails(volunteer).catch((err) => [
    { type: 'registration_confirmation', status: 'failed', error: String(err?.message).slice(0, 300), at: new Date() },
  ]);
  await Volunteer.updateOne({ _id: volunteer._id }, { $push: { notifications: { $each: notifications } } }).catch((err) =>
    console.error('[register] could not record notification status', err.message),
  );
  const confirmation = notifications.find((n) => n.type === 'registration_confirmation');

  send(res, {
    reference: volunteer.reference,
    firstName: volunteer.firstName,
    status: volunteer.status,
    contactMethod: volunteer.contactMethod,
    confirmationEmail: confirmation?.status ?? 'skipped',
  }, undefined, 201);
}

// Official ward and polling-unit options. `configured: false` means no data
// has been supplied for that area; the form shows that instead of options.
const LOCATION_CACHE = 'public, max-age=3600';

export async function listWards(req, res) {
  const { state, lga } = req.validatedQuery;
  res.setHeader('Cache-Control', LOCATION_CACHE);
  send(res, wardsFor(state, lga));
}

export async function listPollingUnits(req, res) {
  const { state, lga, ward } = req.validatedQuery;
  const items = pollingUnitsFor(state, lga, ward);
  if (!items) throw ApiError.notFound('No polling units are configured for this ward');
  res.setHeader('Cache-Control', LOCATION_CACHE);
  send(res, items);
}

// Requires both the reference and the registered phone number, and returns
// status only: no personal details beyond the applicant's first name.
export async function checkStatus(req, res) {
  const { reference, phone } = req.body;
  const volunteer = await Volunteer.findOne({ reference, phone: normalisePhone(phone) }).select('firstName status createdAt reviewedAt').lean();
  if (!volunteer) throw ApiError.notFound('We could not find an application with that reference and phone number. Check both and try again.');
  send(res, {
    firstName: volunteer.firstName,
    status: volunteer.status,
    statusLabel: labelFor(VOLUNTEER_STATUSES, volunteer.status),
    submittedAt: volunteer.createdAt,
    reviewedAt: volunteer.reviewedAt ?? null,
  });
}

