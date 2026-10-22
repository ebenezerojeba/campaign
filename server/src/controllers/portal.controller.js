import { emailConfigured, env } from '../config/env.js';
import { Volunteer } from '../models/Volunteer.js';
import { Opportunity } from '../models/Opportunity.js';
import { Announcement, LoginCode, DataRequest } from '../models/misc.js';
import { ApiError, send } from '../utils/ApiError.js';
import { generateNumericCode, hashCode } from '../utils/reference.js';
import { sendSignInCode } from '../services/email.js';
import { issueVolunteerSession, clearSession, VOLUNTEER_COOKIE } from '../middleware/index.js';
import { PRIVACY_NOTICE_VERSION } from '../../../shared/options.js';

const CODE_MINUTES = 10;
const MAX_ATTEMPTS = 5;

// Same response whether or not the email is registered, so the endpoint
// cannot be used to discover who has registered.
export async function requestCode(req, res) {
  if (!emailConfigured() && env.isProd) {
    throw ApiError.unavailable('Sign-in by email is not available yet. Contact the programme team for help.', 'EMAIL_NOT_CONFIGURED');
  }
  const { email } = req.body;
  const volunteer = await Volunteer.findOne({ email, isSample: false });
  if (volunteer) {
    const code = generateNumericCode(6);
    await LoginCode.deleteMany({ volunteer: volunteer._id });
    await LoginCode.create({ volunteer: volunteer._id, codeHash: hashCode(code), expiresAt: new Date(Date.now() + CODE_MINUTES * 60000) });
    const outcome = await sendSignInCode(volunteer, code);
    await Volunteer.updateOne({ _id: volunteer._id }, { $push: { notifications: outcome } });
  }
  send(res, { sent: true, expiresInMinutes: CODE_MINUTES });
}

export async function verifyCode(req, res) {
  const { email, code } = req.body;
  const invalid = () => ApiError.unauthorized('That code is incorrect or has expired. Request a new code.');
  const volunteer = await Volunteer.findOne({ email, isSample: false });
  if (!volunteer) throw invalid();
  const entry = await LoginCode.findOne({ volunteer: volunteer._id, expiresAt: { $gt: new Date() } });
  if (!entry) throw invalid();
  if (entry.codeHash !== hashCode(code)) {
    entry.attempts += 1;
    if (entry.attempts >= MAX_ATTEMPTS) await entry.deleteOne();
    else await entry.save();
    throw invalid();
  }
  await entry.deleteOne();
  issueVolunteerSession(res, volunteer);
  send(res, { signedIn: true });
}

export async function logout(_req, res) {
  clearSession(res, VOLUNTEER_COOKIE);
  send(res, { signedOut: true });
}

function profile(v) {
  return {
    reference: v.reference,
    firstName: v.firstName,
    lastName: v.lastName,
    email: v.email,
    phone: v.phone,
    contactMethod: v.contactMethod,
    agentType: v.agentType,
    stateOfOrigin: v.stateOfOrigin,
    lgaOfOrigin: v.lgaOfOrigin,
    lga: v.lga,
    lcda: v.lcda,
    ward: v.ward,
    pollingUnit: v.pollingUnit,
    pollingUnitCode: v.pollingUnitCode,
    community: v.community,
    interests: v.interests,
    skills: v.skills,
    availability: v.availability,
    participationFormat: v.participationFormat,
    consentCommunications: v.consent?.communications ?? false,
    status: v.status,
    statusHistory: v.statusHistory.map((h) => ({ to: h.to, at: h.at })),
    createdAt: v.createdAt,
  };
}

export async function me(req, res) {
  send(res, profile(req.volunteer));
}

// Only these fields are self-service; name, phone and email changes go
// through a correction request so the team can verify them.
export async function updateMe(req, res) {
  const v = req.volunteer;
  const { consentCommunications, ...rest } = req.body;
  if (rest.contactMethod === 'email' && !v.email) throw ApiError.badRequest('Add an email address before choosing email as your contact method');
  v.set(rest);
  if (typeof consentCommunications === 'boolean') {
    v.consent.communications = consentCommunications;
    v.consent.noticeVersion = PRIVACY_NOTICE_VERSION;
    v.consent.at = new Date();
  }
  await v.save();
  send(res, profile(v));
}

export async function announcements(_req, res) {
  send(res, await Announcement.find({ status: 'published', isSample: env.demoMode ? { $in: [true, false] } : false }).sort({ publishedAt: -1 }).limit(20).lean());
}

export async function opportunities(req, res) {
  const items = await Opportunity.find({ status: 'published', ...(env.demoMode ? {} : { isSample: false }) }).sort({ startDate: 1 }).lean();
  const mine = new Map(req.volunteer.assignments.map((a) => [String(a.opportunity), a.status]));
  send(res, items.map((o) => ({ ...o, myStatus: mine.get(String(o._id)) ?? null })));
}

export async function toggleInterest(req, res) {
  const v = req.volunteer;
  if (v.status !== 'approved') throw ApiError.conflict('You can register interest in activities once your application is approved');
  const opp = await Opportunity.findOne({ _id: req.params.id, status: 'published' });
  if (!opp) throw ApiError.notFound('This opportunity is no longer available');
  const existing = v.assignments.find((a) => String(a.opportunity) === String(opp._id));
  if (existing?.status === 'assigned') throw ApiError.conflict('You are already assigned to this activity. Contact the team to withdraw.');
  if (existing) {
    existing.status = existing.status === 'interested' ? 'withdrawn' : 'interested';
    existing.at = new Date();
  } else {
    v.assignments.push({ opportunity: opp._id, status: 'interested' });
  }
  await v.save();
  const status = v.assignments.find((a) => String(a.opportunity) === String(opp._id)).status;
  await Opportunity.updateOne({ _id: opp._id }, { $inc: { interestCount: status === 'interested' ? 1 : -1 } });
  send(res, { myStatus: status });
}

export async function createRequest(req, res) {
  const v = req.volunteer;
  const open = await DataRequest.exists({ volunteer: v._id, type: req.body.type, status: 'open' });
  if (open) throw ApiError.conflict('You already have an open request of this type. The team will respond soon.');
  const request = await DataRequest.create({ volunteer: v._id, reference: v.reference, ...req.body });
  send(res, { id: request._id, type: request.type, status: request.status, createdAt: request.createdAt }, undefined, 201);
}

export async function listRequests(req, res) {
  send(res, await DataRequest.find({ volunteer: req.volunteer._id }).select('type status details resolution createdAt resolvedAt').sort({ createdAt: -1 }).lean());
}

// Data portability: the volunteer's own record as JSON.
export async function exportMine(req, res) {
  const v = req.volunteer.toObject();
  delete v.notes; // internal staff notes are not personal data supplied by the volunteer
  delete v.__v;
  res.setHeader('Content-Disposition', `attachment; filename="my-volunteer-data-${v.reference}.json"`);
  res.setHeader('Cache-Control', 'no-store');
  res.json(v);
}
