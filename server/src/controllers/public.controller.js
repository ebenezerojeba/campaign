import { env } from '../config/env.js';
import { emailConfigured } from '../services/email.js';
import { dbConfigured, dbState, connectDb } from '../config/db.js';
import { Agent } from '../models/Agent.js';
import { ApiError, send } from '../utils/ApiError.js';
import { generateReference } from '../utils/reference.js';
import { encryptField, keyedHash } from '../utils/secure.js';
import { normalisePhone } from '../../../shared/schemas.js';
import { PRIVACY_NOTICE_VERSION, labelFor, REGISTRATION_STATUSES } from '../../../shared/options.js';
import { requiredDocuments } from '../../../shared/agentForm.js';
import { sendRegistrationEmails } from '../services/email.js';
import { resolveElectoral, wardsFor, pollingUnitsFor, senatorialDistricts } from '../services/electoral.js';
import { checkDocument, storeDocument, deleteDocuments } from '../services/documents.js';

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

// Official ward and polling-unit options. `configured: false` means no data
// has been supplied for that area; the form says so instead of showing options.
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

// The multipart form sends its text fields as JSON in "data", so booleans
// and empty strings survive. Validation runs on the parsed object next.
export function parseRegistrationData(req, _res, next) {
  try {
    req.body = JSON.parse(req.body?.data ?? '{}');
    return next();
  } catch {
    return next(ApiError.badRequest('The registration could not be read. Refresh the page and try again.'));
  }
}

const DUPLICATE_MESSAGE = 'A registration with this phone number or email address already exists. Check your registration status instead, or contact the team if you need to change your details.';

const fieldErrors = (fields) => new ApiError(422, 'VALIDATION_FAILED', 'Some details need attention', { fields });

const DUPLICATE_IDENTITY_MESSAGE = 'A registration with these identification details already exists. Check your registration status, or contact the team if you think this is a mistake.';

export async function register(req, res) {
  const data = req.body;
  const phone = normalisePhone(data.phone);
  const { email } = data;

  // Never trust the browser's ward or polling unit: check both against the official data.
  const electoral = resolveElectoral(data);
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
    throw ApiError.conflict(DUPLICATE_IDENTITY_MESSAGE, 'DUPLICATE_REGISTRATION');
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

  let agent;
  for (let attempt = 0; attempt < 5 && !agent; attempt += 1) {
    const reference = generateReference();
    const stored = {};
    try {
      for (const [kind, file] of Object.entries(checked)) stored[kind] = await storeDocument(kind, file, reference);
      agent = await Agent.create({ ...doc, reference, documents: stored });
    } catch (err) {
      // Never leave orphaned documents behind.
      await deleteDocuments(Object.values(stored).map((d) => d.fileId));
      if (err?.code !== 11000) throw err;
      const key = Object.keys(err.keyPattern ?? {})[0];
      if (key !== 'reference') throw ApiError.conflict(DUPLICATE_MESSAGE, 'DUPLICATE_REGISTRATION');
      // Reference collision: retry with a new one.
    }
  }
  if (!agent) throw new ApiError(500, 'SERVER_ERROR', 'We could not create a reference. Please try again.');

  // The registration is already saved; email outcome is recorded, never fatal.
  const notifications = await sendRegistrationEmails(agent).catch((err) => [
    { type: 'registration_confirmation', status: 'failed', error: String(err?.message).slice(0, 300), at: new Date() },
  ]);
  await Agent.updateOne({ _id: agent._id }, { $push: { notifications: { $each: notifications } } }).catch((err) =>
    console.error('[register] could not record notification status', err.message),
  );
  const confirmation = notifications.find((n) => n.type === 'registration_confirmation');

  send(res, {
    reference: agent.reference,
    firstName: agent.firstName,
    status: agent.status,
    confirmationEmail: confirmation?.status ?? 'skipped',
  }, undefined, 201);
}

// Requires both the reference and the registered phone number, and returns
// status only: no personal details beyond the applicant's first name.
export async function checkStatus(req, res) {
  const { reference, phone } = req.body;
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
