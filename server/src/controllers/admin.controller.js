import mongoose from 'mongoose';
import { Agent } from '../models/Agent.js';
import { PERMISSIONS, User } from '../models/User.js';
import { AuditLog } from '../models/misc.js';
import { ApiError, send } from '../utils/ApiError.js';
import { toCsv } from '../utils/csv.js';
import { decryptField } from '../utils/secure.js';
import { audit } from '../services/audit.js';
import { sendDecisionEmail } from '../services/email.js';
import { openDocument, deleteDocuments } from '../services/documents.js';
import { issueStaffSession, clearSession, readStaffToken, STAFF_COOKIE } from '../middleware/index.js';
import { normalisePhone, POLLING_UNIT_CODE_RE } from '../../../shared/schemas.js';
import { labelFor, AGENT_CATEGORIES, DOCUMENT_KINDS } from '../../../shared/options.js';

const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// ---------- Auth ----------

const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export async function login(req, res) {
  const { email, password } = req.body;
  const user = await User.findOne({ email }).select('+passwordHash +failedLogins +lockedUntil');
  const invalid = () => ApiError.unauthorized('The email or password is incorrect');

  if (!user || !user.active) {
    await User.hashPassword(password); // equalise timing for unknown accounts
    throw invalid();
  }
  if (user.lockedUntil && user.lockedUntil > new Date()) {
    throw new ApiError(423, 'ACCOUNT_LOCKED', `Too many failed attempts. Try again after ${LOCK_MINUTES} minutes.`);
  }
  if (!(await user.verifyPassword(password))) {
    user.failedLogins = (user.failedLogins ?? 0) + 1;
    if (user.failedLogins >= MAX_FAILED) {
      user.lockedUntil = new Date(Date.now() + LOCK_MINUTES * 60 * 1000);
      user.failedLogins = 0;
    }
    await user.save();
    throw invalid();
  }
  user.failedLogins = 0;
  user.lockedUntil = undefined;
  user.lastLoginAt = new Date();
  await user.save();
  issueStaffSession(res, user);
  req.user = user;
  await audit(req, { action: 'staff.login', targetType: 'User', targetId: user._id, summary: `${user.name} signed in` });
  send(res, user.toSafeJSON());
}

// Rotating tokenVersion invalidates this user's issued session tokens, so a
// copied cookie stops working after sign-out (this also ends other sessions).
export async function logout(req, res) {
  const payload = readStaffToken(req);
  if (payload) await User.updateOne({ _id: payload.sub, tokenVersion: payload.v }, { $inc: { tokenVersion: 1 } }).catch(() => {});
  clearSession(res, STAFF_COOKIE);
  send(res, { signedOut: true });
}

export async function me(req, res) {
  send(res, req.user.toSafeJSON());
}

// ---------- Dashboard ----------

export async function dashboard(_req, res) {
  const since = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
  since.setHours(0, 0, 0, 0);

  const [byStatus, trend, byLga, byCategory, recent, sampleCount] = await Promise.all([
    Agent.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Agent.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Africa/Lagos' } }, n: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Agent.aggregate([{ $group: { _id: '$lga', total: { $sum: 1 }, approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } } } }, { $sort: { total: -1 } }]),
    Agent.aggregate([{ $group: { _id: '$agentCategory', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
    Agent.find().sort({ createdAt: -1 }).limit(6).select('reference firstName lastName agentCategory lga status createdAt isSample').lean(),
    Agent.countDocuments({ isSample: true }),
  ]);

  // Fill missing days so the chart has a continuous 30-day axis.
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos', year: 'numeric', month: '2-digit', day: '2-digit' });
  const days = [];
  for (let i = 0; i < 30; i += 1) {
    const key = fmt.format(new Date(since.getTime() + i * 86400000));
    days.push({ date: key, registrations: trend.find((t) => t._id === key)?.n ?? 0 });
  }
  const count = (s) => byStatus.find((b) => b._id === s)?.n ?? 0;

  send(res, {
    totals: {
      all: byStatus.reduce((t, b) => t + b.n, 0),
      pending: count('pending'),
      approved: count('approved'),
      rejected: count('rejected'),
    },
    trend: days,
    byLga: byLga.map((l) => ({ lga: l._id, total: l.total, approved: l.approved })),
    byCategory: byCategory.map((c) => ({ category: c._id, label: labelFor(AGENT_CATEGORIES, c._id), count: c.n })),
    recent,
    sampleCount,
  });
}

// ---------- Registrations ----------

function buildAgentFilter(q) {
  const filter = {};
  if (q.status) filter.status = q.status;
  if (q.agentCategory) filter.agentCategory = q.agentCategory;
  if (q.lga) filter.lga = q.lga;
  if (q.wardCode) filter.wardCode = q.wardCode;
  if (q.pollingUnitCode) filter.pollingUnitCode = q.pollingUnitCode;
  if (q.senatorialDistrict) filter.senatorialDistrict = q.senatorialDistrict;
  if (q.stateOfOrigin) filter.stateOfOrigin = q.stateOfOrigin;
  if (q.lgaOfOrigin) filter.lgaOfOrigin = q.lgaOfOrigin;
  if (q.sample === 'real') filter.isSample = false;
  if (q.sample === 'sample') filter.isSample = true;
  if (q.from || q.to) {
    filter.createdAt = {};
    if (q.from) filter.createdAt.$gte = new Date(`${q.from}T00:00:00+01:00`);
    if (q.to) filter.createdAt.$lte = new Date(`${q.to}T23:59:59.999+01:00`);
  }
  if (q.q) {
    const term = q.q.trim();
    const phone = normalisePhone(term);
    if (/^(LAG|DEMO)-/i.test(term)) filter.reference = { $regex: `^${escapeRegex(term.toUpperCase())}` };
    else if (POLLING_UNIT_CODE_RE.test(term)) filter.pollingUnitCode = term;
    else if (phone) filter.phone = phone;
    else if (term.includes('@')) filter.email = term.toLowerCase();
    else {
      const parts = term.split(/\s+/).slice(0, 3).map((p) => new RegExp(`^${escapeRegex(p)}`, 'i'));
      filter.$and = parts.map((rx) => ({ $or: [{ firstName: rx }, { middleName: rx }, { lastName: rx }] }));
    }
  }
  return filter;
}

const LIST_FIELDS = 'reference firstName middleName lastName phone email agentCategory lga ward wardCode pollingUnit pollingUnitCode status createdAt isSample';
// Masked bank and NIN columns, only for roles allowed to see sensitive details.
const SENSITIVE_LIST_FIELDS = 'bankDetails.bankName bankDetails.accountNumberLast4 nin.last4';

const canSeeSensitive = (user) => Boolean(PERMISSIONS[user?.role]?.includes('agents:sensitive:read'));

// Accepts a Date or a legacy YYYY-MM-DD string.
const isoDate = (value) => {
  if (!value) return '';
  if (typeof value === 'string') return value.slice(0, 10);
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
};
const ddmmyyyy = (value) => {
  const iso = isoDate(value);
  return iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '';
};

export async function listAgents(req, res) {
  const q = req.validatedQuery;
  const filter = buildAgentFilter(q);
  const sort = { newest: { createdAt: -1 }, oldest: { createdAt: 1 }, name: { lastName: 1, firstName: 1 } }[q.sort];
  const [items, total] = await Promise.all([
    Agent.find(filter).select(canSeeSensitive(req.user) ? `${LIST_FIELDS} ${SENSITIVE_LIST_FIELDS}` : LIST_FIELDS).sort(sort).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    Agent.countDocuments(filter),
  ]);
  send(res, items, { page: q.page, limit: q.limit, total, pages: Math.max(1, Math.ceil(total / q.limit)) });
}

// File ids and hashes stay on the server; the dashboard asks for documents by kind.
const publicDocuments = (documents = {}) => Object.fromEntries(
  Object.entries(documents).filter(([, d]) => d?.fileId).map(([kind, d]) => [kind, { contentType: d.contentType, bytes: d.bytes, width: d.width, height: d.height, uploadedAt: d.uploadedAt }]),
);

export async function getAgent(req, res) {
  const a = await Agent.findById(req.params.id).lean();
  if (!a) throw ApiError.notFound('This registration does not exist');
  const auditTrail = await AuditLog.find({ targetType: 'Agent', targetId: String(a._id) }).sort({ createdAt: -1 }).limit(50).lean();
  await audit(req, { action: 'agent.viewed', targetType: 'Agent', targetId: a._id, summary: `Viewed ${a.reference}` });
  // Date of birth and masked identity/bank values only for roles allowed to see them.
  const sensitive = canSeeSensitive(req.user);
  send(res, {
    ...a,
    dateOfBirth: sensitive ? isoDate(a.dateOfBirth) || undefined : undefined,
    nin: sensitive && a.nin?.last4 ? { last4: a.nin.last4 } : undefined,
    bankDetails: sensitive && a.bankDetails?.bankName
      ? { bankName: a.bankDetails.bankName, accountNumberLast4: a.bankDetails.accountNumberLast4 }
      : undefined,
    identityDetails: sensitive && a.identityDetails?.vinLast4
      ? { vinLast4: a.identityDetails.vinLast4, apcPartyRegistrationNumberLast4: a.identityDetails.apcPartyRegistrationNumberLast4 }
      : undefined,
    documents: publicDocuments(a.documents),
    auditTrail,
  });
}

// Sensitive registration values are returned only to admins on an explicit,
// audit-logged reveal; ordinary detail and list responses remain masked.
export async function revealSensitiveDetails(req, res) {
  const a = await Agent.findById(req.params.id)
    .select('+nin.encrypted +bankDetails.accountNameEncrypted +bankDetails.accountNumberEncrypted +identityDetails.vinEncrypted +identityDetails.apcPartyRegistrationNumberEncrypted reference bankDetails.bankName')
    .lean();
  if (!a) throw ApiError.notFound('This registration does not exist');
  await audit(req, { action: 'agent.sensitive_details_revealed', targetType: 'Agent', targetId: a._id, summary: `Revealed identity and bank details for ${a.reference}` });
  const open = (value) => (value ? decryptField(value) : undefined);
  send(res, {
    bankName: a.bankDetails?.bankName,
    accountName: open(a.bankDetails?.accountNameEncrypted),
    accountNumber: open(a.bankDetails?.accountNumberEncrypted),
    nin: open(a.nin?.encrypted),
    vin: open(a.identityDetails?.vinEncrypted),
    apcPartyRegistrationNumber: open(a.identityDetails?.apcPartyRegistrationNumberEncrypted),
    // Format checks only: no verification service is connected.
    bankAccountVerification: { status: 'not_verified', message: 'Not verified. Only the 10-digit format was checked; no bank verification service is connected.' },
    identityVerification: { status: 'not_verified', message: 'Not verified with NIMC, INEC or APC. Only the formats were checked.' },
  });
}

const DOC_EXT = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };

// Streams one uploaded document to an authorised staff member. Images open
// inline; PDFs download, so no PDF is rendered inside the dashboard origin.
export async function getAgentDocument(req, res) {
  const { kind } = req.params;
  if (!DOCUMENT_KINDS.some((k) => k.value === kind)) throw ApiError.notFound();
  const a = await Agent.findById(req.params.id).select(`reference documents.${kind}`).lean();
  const d = a?.documents?.[kind];
  if (!d?.fileId) throw ApiError.notFound('This document is not on file');
  await audit(req, { action: 'agent.document_viewed', targetType: 'Agent', targetId: a._id, summary: `Opened ${labelFor(DOCUMENT_KINDS, kind).toLowerCase()} for ${a.reference}` });

  const disposition = d.contentType === 'application/pdf' ? 'attachment' : 'inline';
  res.setHeader('Content-Type', d.contentType);
  res.setHeader('Content-Disposition', `${disposition}; filename="${a.reference}-${kind}.${DOC_EXT[d.contentType] ?? 'bin'}"`);
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  openDocument(new mongoose.Types.ObjectId(d.fileId))
    .on('error', (err) => {
      console.error('[documents] read failed', err.message);
      if (!res.headersSent) res.status(404).end(); else res.destroy();
    })
    .pipe(res);
}

export async function updateAgentStatus(req, res) {
  const { status, reason, notify } = req.body;
  const a = await Agent.findById(req.params.id);
  if (!a) throw ApiError.notFound('This registration does not exist');
  if (a.status === status) throw ApiError.conflict(`This registration is already ${status}`);

  const from = a.status;
  a.status = status;
  a.reviewedAt = new Date();
  a.statusHistory.push({ from, to: status, reason, by: req.user._id, byName: req.user.name, at: new Date() });
  await a.save();
  await audit(req, { action: 'agent.status_changed', targetType: 'Agent', targetId: a._id, summary: `${a.reference}: ${from} → ${status}`, meta: { from, to: status, reason } });

  let notification = null;
  if (notify && status !== 'pending' && !a.isSample) {
    notification = await sendDecisionEmail(a);
    await Agent.updateOne({ _id: a._id }, { $push: { notifications: notification } });
  }
  send(res, { status: a.status, statusHistory: a.statusHistory, reviewedAt: a.reviewedAt, notification });
}

export async function addAgentNote(req, res) {
  const a = await Agent.findByIdAndUpdate(
    req.params.id,
    { $push: { notes: { body: req.body.body, author: req.user._id, authorName: req.user.name } } },
    { new: true, projection: { notes: 1, reference: 1 } },
  );
  if (!a) throw ApiError.notFound('This registration does not exist');
  await audit(req, { action: 'agent.note_added', targetType: 'Agent', targetId: a._id, summary: `Note added to ${a.reference}` });
  send(res, a.notes, undefined, 201);
}

// Erasure (for example, an applicant's deletion request received by email):
// removes the record and every uploaded document. The audit entry keeps only the reference.
export async function deleteAgent(req, res) {
  const a = await Agent.findById(req.params.id).select('reference documents').lean();
  if (!a) throw ApiError.notFound('This registration does not exist');
  // Typing the reference confirms a permanent deletion.
  if (a.reference !== req.body.confirmReference) throw ApiError.badRequest('Type the registration reference exactly to confirm deletion');
  await deleteDocuments(Object.values(a.documents ?? {}).map((d) => d?.fileId));
  await Agent.deleteOne({ _id: a._id });
  await audit(req, { action: 'agent.deleted', targetType: 'Agent', targetId: a._id, summary: `Deleted ${a.reference} and its documents`, meta: { reason: req.body.reason } });
  send(res, { deleted: true });
}

const onFile = (a, kind) => (a.documents?.[kind]?.fileId ? 'on file' : '');

// Documents are never exported. Identity and bank values are masked unless an
// administrator with agents:sensitive:read asks for them (sensitive=full).
const masked = (last4) => (last4 ? `****${last4}` : '');
const EXPORT_COLUMNS = [
  { label: 'Reference', get: (a) => a.reference },
  { label: 'Sample record', get: (a) => (a.isSample ? 'yes' : 'no') },
  { label: 'Status', get: (a) => a.status },
  { label: 'Agent type', get: (a) => labelFor(AGENT_CATEGORIES, a.agentCategory) },
  { label: 'First name', get: (a) => a.firstName },
  { label: 'Middle name', get: (a) => a.middleName },
  { label: 'Last name', get: (a) => a.lastName },
  { label: 'Phone', get: (a) => (a.phone?.startsWith('+234') ? `0${a.phone.slice(4)}` : a.phone) },
  { label: 'Email', get: (a) => a.email },
  { label: 'Date of birth', get: (a) => ddmmyyyy(a.dateOfBirth) },
  { label: 'State of origin', get: (a) => a.stateOfOrigin },
  { label: 'LGA of origin', get: (a) => a.lgaOfOrigin },
  { label: 'LGA', get: (a) => a.lga },
  { label: 'Senatorial district', get: (a) => a.senatorialDistrict },
  { label: 'Ward', get: (a) => a.ward },
  { label: 'Ward code', get: (a) => a.wardCode },
  { label: 'Polling unit', get: (a) => a.pollingUnit },
  { label: 'Polling unit code', get: (a) => a.pollingUnitCode },
  { label: 'Bank', get: (a) => a.bankDetails?.bankName },
  { label: 'Account name', get: (a) => a.full?.accountName ?? (a.bankDetails?.accountNumberLast4 ? 'masked' : '') },
  { label: 'Account number', get: (a) => a.full?.accountNumber ?? masked(a.bankDetails?.accountNumberLast4) },
  { label: 'NIN', get: (a) => a.full?.nin ?? masked(a.nin?.last4) },
  { label: 'VIN', get: (a) => a.full?.vin ?? masked(a.identityDetails?.vinLast4) },
  { label: 'APC party registration number', get: (a) => a.full?.apcPartyRegistrationNumber ?? masked(a.identityDetails?.apcPartyRegistrationNumberLast4) },
  { label: 'Passport photograph', get: (a) => onFile(a, 'passport') },
  { label: "Voter's card", get: (a) => onFile(a, 'pvc') },
  { label: 'Registered at', get: (a) => a.createdAt },
];

export async function exportAgents(req, res) {
  const q = req.validatedQuery;
  const full = q.sensitive === 'full';
  const allowed = canSeeSensitive(req.user);
  if (full && !allowed) throw ApiError.forbidden('Your role cannot export identity and bank details');
  const filter = buildAgentFilter(q);
  let query = Agent.find(filter).sort({ createdAt: -1 }).limit(20000);
  if (full) query = query.select('+nin.encrypted +bankDetails.accountNameEncrypted +bankDetails.accountNumberEncrypted +identityDetails.vinEncrypted +identityDetails.apcPartyRegistrationNumberEncrypted');
  const docs = await query.lean();
  const open = (value) => (value ? decryptField(value) : '');
  const rows = docs.map((a) => ({
    ...a,
    // Date of birth and the masked columns stay blank for roles without access.
    dateOfBirth: allowed ? a.dateOfBirth : undefined,
    nin: allowed ? a.nin : undefined,
    bankDetails: allowed ? a.bankDetails : undefined,
    identityDetails: allowed ? a.identityDetails : undefined,
    full: full ? {
      accountName: open(a.bankDetails?.accountNameEncrypted),
      accountNumber: open(a.bankDetails?.accountNumberEncrypted),
      nin: open(a.nin?.encrypted),
      vin: open(a.identityDetails?.vinEncrypted),
      apcPartyRegistrationNumber: open(a.identityDetails?.apcPartyRegistrationNumberEncrypted),
    } : undefined,
  }));
  await audit(req, { action: full ? 'agent.exported_sensitive' : 'agent.exported', targetType: 'Agent', summary: `Exported ${rows.length} records${full ? ' including identity and bank details' : ''}`, meta: { filter: q } });
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="apc-lagos-pu-agents-${stamp}${full ? '-sensitive' : ''}.csv"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(`\uFEFF${toCsv(EXPORT_COLUMNS, rows)}`);
}

// ---------- Audit and staff ----------

export async function listAudit(req, res) {
  const { page, limit } = req.validatedQuery;
  const filter = { action: { $nin: ['agent.viewed', 'agent.document_viewed'] } };
  const [items, total] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments(filter),
  ]);
  send(res, items, { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
}

export async function listStaff(_req, res) {
  const users = await User.find().sort({ createdAt: 1 });
  send(res, users.map((u) => ({ ...u.toSafeJSON(), active: u.active, createdAt: u.createdAt })));
}

export async function createStaff(req, res) {
  const { name, email, role, password } = req.body;
  if (await User.exists({ email })) throw ApiError.conflict('A staff account with this email already exists');
  const user = await User.create({ name, email, role, passwordHash: await User.hashPassword(password) });
  await audit(req, { action: 'staff.created', targetType: 'User', targetId: user._id, summary: `Created ${role} account for ${email}` });
  send(res, user.toSafeJSON(), undefined, 201);
}

export async function updateStaff(req, res) {
  const user = await User.findById(req.params.id);
  if (!user) throw ApiError.notFound('This staff account does not exist');
  if (String(user._id) === String(req.user._id) && (req.body.active === false || (req.body.role && req.body.role !== 'admin'))) {
    throw ApiError.conflict('You cannot deactivate or demote your own account');
  }
  if (req.body.role) user.role = req.body.role;
  if (typeof req.body.active === 'boolean') user.active = req.body.active;
  user.tokenVersion += 1; // end existing sessions after a permission change
  await user.save();
  await audit(req, { action: 'staff.updated', targetType: 'User', targetId: user._id, summary: `${user.email}: role ${user.role}, ${user.active ? 'active' : 'deactivated'}` });
  send(res, { ...user.toSafeJSON(), active: user.active });
}
