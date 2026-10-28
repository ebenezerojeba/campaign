import { env } from '../config/env.js';
import { emailConfigured } from '../services/email.js';
import { dbConfigured, dbState, connectDb } from '../config/db.js';
import { Agent } from '../models/Agent.js';
import { ApiError, send } from '../utils/ApiError.js';
import { generateReference } from '../utils/reference.js';
import { encryptField, keyedHash } from '../utils/secure.js';
import { normalisePhone } from '../../../shared/schemas.js';
import { PRIVACY_NOTICE_VERSION, labelFor, levelOf, REGISTRATION_STATUSES, AGENT_CATEGORIES } from '../../../shared/options.js';
import { requiredDocuments } from '../../../shared/agentForm.js';
import { queueRegistrationEmails, kickOutbox } from '../services/outbox.js';
import { resolveElectoral, wardsFor, pollingUnitsFor, senatorialDistricts } from '../services/electoral.js';
import { checkDocument, storeDocument, deleteDocuments } from '../services/documents.js';
import { claimPosition, releasePosition, takenPositions, takenOfficerPosts } from '../services/positions.js';
import { captchaEnabled, verifyCaptcha } from '../services/captcha.js';
import { recordApplicantCheck } from '../services/identityChecks.js';
import mongoose from 'mongoose';

export async function health(_req, res) {
  let db = dbState();
  if (dbConfigured() && db !== 'connected') {
    try { await connectDb(); db = dbState(); } catch { db = 'unreachable'; }
  }
  // Readiness flags only: never the settings themselves.
  res.json({ ok: true, data: { status: 'up', db, email: emailConfigured() ? 'configured' : 'not_configured', encryption: env.dataEncryptionKey.length >= 32 ? 'configured' : 'not_configured', time: new Date().toISOString() } });
}

// Public, non-secret configuration used by the frontend.
export async function publicConfig(_req, res) {
  if (dbConfigured()) kickOutbox();
  send(res, {
    registrationOpen: dbConfigured(),
    emailEnabled: emailConfigured(),
    demoMode: env.demoMode,
    contact: env.contact,
    privacyNoticeVersion: PRIVACY_NOTICE_VERSION,
    senatorialDistricts: senatorialDistricts(),
    captchaSiteKey: captchaEnabled() ? env.captcha.siteKey : '',
  });
}

// Official ward and polling-unit options. `configured: false` means no data
// has been supplied for that area; the form says so instead of showing options.
const LOCATION_CACHE = 'public, max-age=3600';

export async function listWards(req, res) {
  const { state, lga } = req.validatedQuery;
  const data = wardsFor(state, lga);
  // Which officer posts in this LGA are filled (never who holds them).
  let officerPosts = { lgaOfficer: false, wardOfficers: [] };
  if (data.configured && dbConfigured()) {
    try { await connectDb(); officerPosts = await takenOfficerPosts(lga); } catch (err) { console.error('[positions] officer availability unavailable', err?.name); }
  }
  res.setHeader('Cache-Control', 'public, max-age=60');
  send(res, { ...data, officerPosts });
}

export async function listPollingUnits(req, res) {
  const { state, lga, ward } = req.validatedQuery;
  const items = pollingUnitsFor(state, lga, ward);
  if (!items) throw ApiError.notFound('No polling units are configured for this ward');
  // Which agent positions are already filled: codes only, never who holds them.
  let taken = {};
  if (dbConfigured()) {
    try { await connectDb(); taken = await takenPositions(lga, ward); } catch (err) { console.error('[positions] availability unavailable', err?.name); }
  }
  res.setHeader('Cache-Control', 'public, max-age=60');
  send(res, items.map((u) => ({ ...u, taken: taken[u.code] ?? [] })));
}

// The multipart form sends its text fields as JSON in "data", so booleans
// and empty strings survive. Validation runs on the parsed object next.
export function parseRegistrationData(req, _res, next) {
  try {
    const data = JSON.parse(req.body?.data ?? '{}');
    req.captchaToken = req.body?.captcha;
    req.body = data;
    return next();
  } catch {
    return next(ApiError.badRequest('The registration could not be read. Refresh the page and try again.'));
  }
}

// One message for every kind of duplicate (phone, email, NIN, VIN), so the
// response never reveals which identifier belongs to an existing registration.
const DUPLICATE_MESSAGE = 'Some of these details are already used by an existing registration. If you have registered before, check your registration status. Otherwise, contact the coordination team.';
const CAPTCHA_MESSAGE = 'Complete the security check and try again.';
const POSITION_PLACE = { pollingUnit: 'at this polling unit', ward: 'for this ward', lga: 'for this LGA' };
const positionTakenMessage = (category, reason) => (reason === 'capacity'
  ? `All ${labelFor(AGENT_CATEGORIES, category)} positions have been filled. Contact the coordination team if you were asked to serve.`
  : category === 'ward_collation_officer'
    ? 'Both Ward Collation Officer positions for this ward have already been filled. Check your role and location, or contact one of the admins for further assistance.'
    : `The ${labelFor(AGENT_CATEGORIES, category)} position ${POSITION_PLACE[levelOf(category)]} has already been filled. Check your role and location, or contact one of the admins for further assistance.`);

const fieldErrors = (fields) => new ApiError(422, 'VALIDATION_FAILED', 'Some details need attention', { fields });

export async function register(req, res) {
  const data = req.body;
  const phone = normalisePhone(data.phone);
  const { email } = data;

  // Never trust the browser's ward or polling unit: check both against the official data.
  const electoral = resolveElectoral({ ...data, level: levelOf(data.agentCategory) });
  const errors = { ...(electoral.errors ?? {}) };

  // Check every required document by its content, collecting all problems at once.
  const checked = {};
  for (const kind of requiredDocuments()) {
    try {
      checked[kind] = checkDocument(kind, req.files?.[kind]?.[0]);
    } catch (err) {
      if (err.code !== 'VALIDATION_FAILED') throw err;
      Object.assign(errors, err.details.fields);
    }
  }
  if (Object.keys(errors).length) throw fieldErrors(errors);
  if (!(await verifyCaptcha(req.captchaToken, req.ip)).ok) throw new ApiError(400, 'CAPTCHA_FAILED', CAPTCHA_MESSAGE);

  const existing = await Agent.exists({ $or: [{ phone }, { email }] });
  if (existing) throw ApiError.conflict(DUPLICATE_MESSAGE, 'DUPLICATE_REGISTRATION');
  if (await Agent.exists({ 'documents.pvc.sha256': checked.pvc.sha256 })) {
    throw fieldErrors({ pvc: 'This voter’s card file has already been used in another registration. Upload a photo of your own card.' });
  }

  // Identity and bank values are encrypted; keyed hashes catch a NIN or VIN
  // that is already registered without storing either in clear.
  const ninHash = keyedHash('nin', data.nin);
  const vinHash = keyedHash('vin', data.vin);
  if (await Agent.exists({ $or: [{ 'nin.hash': ninHash }, { 'identityDetails.vinHash': vinHash }] })) {
    throw ApiError.conflict(DUPLICATE_MESSAGE, 'DUPLICATE_REGISTRATION');
  }
  const nin = { encrypted: encryptField(data.nin), last4: data.nin.slice(-4), hash: ninHash };
  const bankDetails = {
    bankName: data.bankName,
    accountNameEncrypted: encryptField(data.accountName),
    accountNumberEncrypted: encryptField(data.accountNumber),
    accountNumberLast4: data.accountNumber.slice(-4),
  };
  const identityDetails = {
    vinEncrypted: encryptField(data.vin),
    vinLast4: data.vin.slice(-4),
    vinHash,
    apcPartyRegistrationNumberEncrypted: encryptField(data.apcPartyRegistrationNumber),
    apcPartyRegistrationNumberLast4: data.apcPartyRegistrationNumber.slice(-4),
  };

  const doc = {
    firstName: data.firstName,
    middleName: data.middleName || undefined,
    lastName: data.lastName,
    email,
    phone,
    dateOfBirth: new Date(`${data.dateOfBirth}T00:00:00Z`),
    nin,
    bankDetails,
    identityDetails,
    stateOfOrigin: data.stateOfOrigin,
    lgaOfOrigin: data.lgaOfOrigin,
    agentCategory: data.agentCategory,
    state: data.state,
    lga: data.lga,
    ...electoral.fields,
    consent: {
      processing: true,
      sensitiveData: true,
      financialIdentity: true,
      declarationAccurate: true,
      noticeVersion: PRIVACY_NOTICE_VERSION,
      at: new Date(),
    },
    statusHistory: [{ from: null, to: 'pending', reason: 'Registration submitted', at: new Date() }],
  };

  // Claim the Agent 1 / Agent 2 position before saving anything. The claim is
  // atomic, so two people submitting for one position at once cannot both win.
  const agentId = new mongoose.Types.ObjectId();
  const position = await claimPosition(agentId, doc);
  if (!position.ok) throw fieldErrors({ agentCategory: positionTakenMessage(doc.agentCategory, position.reason) });

  let agent;
  try {
    for (let attempt = 0; attempt < 5 && !agent; attempt += 1) {
      const reference = generateReference();
      const stored = {};
      try {
        for (const [kind, file] of Object.entries(checked)) stored[kind] = await storeDocument(kind, file, reference);
        agent = await Agent.create({ ...doc, _id: agentId, reference, documents: stored });
      } catch (err) {
        // Never leave orphaned documents behind.
        await deleteDocuments(Object.values(stored));
        if (err?.code !== 11000) throw err;
        const key = Object.keys(err.keyPattern ?? {})[0];
        if (key !== 'reference') throw ApiError.conflict(DUPLICATE_MESSAGE, 'DUPLICATE_REGISTRATION');
        // Reference collision: retry with a new one.
      }
    }
    if (!agent) throw new ApiError(500, 'SERVER_ERROR', 'We could not create a reference. Please try again.');
  } catch (err) {
    // Nothing was saved: give the position back.
    if (position.created) await releasePosition(agentId, doc).catch(() => {});
    throw err;
  }

  // Information only; a failure here never affects the saved registration.
  await recordApplicantCheck(agent._id, data.cardCheck).catch((err) => console.error('[checks] applicant check not recorded', err?.name));

  // The registration is saved. Emails go to the outbox and are sent after the
  // response, within the provider's limits; a queuing problem is logged and
  // never turns a saved registration into a failure.
  let confirmationEmail = 'queued';
  try {
    await queueRegistrationEmails(agent);
    kickOutbox();
  } catch (err) {
    confirmationEmail = 'failed';
    console.error('[register] could not queue emails', err?.code ?? err?.name);
  }

  send(res, {
    reference: agent.reference,
    firstName: agent.firstName,
    status: agent.status,
    confirmationEmail,
  }, undefined, 201);
}

// Requires both the reference and the registered phone number, and returns
// status only: no personal details beyond the applicant's first name.
export async function checkStatus(req, res) {
  const { reference, phone, captcha } = req.body;
  if (!(await verifyCaptcha(captcha, req.ip)).ok) throw new ApiError(400, 'CAPTCHA_FAILED', CAPTCHA_MESSAGE);
  const agent = await Agent.findOne({ reference, phone: normalisePhone(phone) }).select('firstName status createdAt reviewedAt').lean();
  if (!agent) throw ApiError.notFound('We could not find a registration with that reference and phone number. Check both and try again.');
  send(res, {
    firstName: agent.firstName,
    status: agent.status,
    statusLabel: labelFor(REGISTRATION_STATUSES, agent.status),
    submittedAt: agent.createdAt,
    reviewedAt: agent.reviewedAt ?? null,
  });
}
