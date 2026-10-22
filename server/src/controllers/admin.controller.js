import { Volunteer } from '../models/Volunteer.js';
import { Opportunity } from '../models/Opportunity.js';
import { User } from '../models/User.js';
import { Announcement, AuditLog, DataRequest } from '../models/misc.js';
import { ApiError, send } from '../utils/ApiError.js';
import { toCsv } from '../utils/csv.js';
import { audit } from '../services/audit.js';
import { sendDecisionEmail } from '../services/email.js';
import { issueStaffSession, clearSession, readStaffToken, STAFF_COOKIE } from '../middleware/index.js';
import { normalisePhone } from '../../../shared/schemas.js';
import { labelFor, INTERESTS, SKILLS, AVAILABILITY, CONTACT_METHODS, PARTICIPATION_FORMATS } from '../../../shared/options.js';

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

export async function dashboard(req, res) {
  const since = new Date(Date.now() - 29 * 24 * 60 * 60 * 1000);
  since.setHours(0, 0, 0, 0);

  const [byStatus, trend, byLga, byInterest, recent, publishedOpportunities, openRequests, sampleCount] = await Promise.all([
    Volunteer.aggregate([{ $group: { _id: '$status', n: { $sum: 1 } } }]),
    Volunteer.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt', timezone: 'Africa/Lagos' } }, n: { $sum: 1 } } },
      { $sort: { _id: 1 } },
    ]),
    Volunteer.aggregate([{ $group: { _id: '$lga', total: { $sum: 1 }, approved: { $sum: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } } } }, { $sort: { total: -1 } }]),
    Volunteer.aggregate([{ $unwind: '$interests' }, { $group: { _id: '$interests', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
    Volunteer.find().sort({ createdAt: -1 }).limit(6).select('reference firstName lastName lga status createdAt isSample').lean(),
    Opportunity.countDocuments({ status: 'published' }),
    DataRequest.countDocuments({ status: 'open' }),
    Volunteer.countDocuments({ isSample: true }),
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
    byInterest: byInterest.map((i) => ({ interest: i._id, label: labelFor(INTERESTS, i._id), count: i.n })),
    recent,
    publishedOpportunities,
    openRequests,
    sampleCount,
  });
}

// ---------- Volunteers ----------

function buildVolunteerFilter(q) {
  const filter = {};
  if (q.status) filter.status = q.status;
  if (q.lga) filter.lga = q.lga;
  if (q.interest) filter.interests = q.interest;
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
    else if (phone) filter.phone = phone;
    else if (term.includes('@')) filter.email = term.toLowerCase();
    else {
      const parts = term.split(/\s+/).slice(0, 3).map((p) => new RegExp(`^${escapeRegex(p)}`, 'i'));
      filter.$and = parts.map((rx) => ({ $or: [{ firstName: rx }, { lastName: rx }] }));
    }
  }
  return filter;
}

const LIST_FIELDS = 'reference firstName lastName phone email lga lcda interests status createdAt isSample';

export async function listVolunteers(req, res) {
  const q = req.validatedQuery;
  const filter = buildVolunteerFilter(q);
  const sort = { newest: { createdAt: -1 }, oldest: { createdAt: 1 }, name: { lastName: 1, firstName: 1 } }[q.sort];
  const [items, total] = await Promise.all([
    Volunteer.find(filter).select(LIST_FIELDS).sort(sort).skip((q.page - 1) * q.limit).limit(q.limit).lean(),
    Volunteer.countDocuments(filter),
  ]);
  send(res, items, { page: q.page, limit: q.limit, total, pages: Math.max(1, Math.ceil(total / q.limit)) });
}

export async function getVolunteer(req, res) {
  const v = await Volunteer.findById(req.params.id).populate('assignments.opportunity', 'title status startDate').lean();
  if (!v) throw ApiError.notFound('This volunteer record does not exist');
  const auditTrail = await AuditLog.find({ targetType: 'Volunteer', targetId: String(v._id) }).sort({ createdAt: -1 }).limit(50).lean();
  await audit(req, { action: 'volunteer.viewed', targetType: 'Volunteer', targetId: v._id, summary: `Viewed ${v.reference}` });
  send(res, { ...v, auditTrail });
}

export async function updateVolunteerStatus(req, res) {
  const { status, reason, notify } = req.body;
  const v = await Volunteer.findById(req.params.id);
  if (!v) throw ApiError.notFound('This volunteer record does not exist');
  if (v.status === status) throw ApiError.conflict(`This application is already ${status}`);

  const from = v.status;
  v.status = status;
  v.reviewedAt = new Date();
  v.statusHistory.push({ from, to: status, reason, by: req.user._id, byName: req.user.name, at: new Date() });
  await v.save();
  await audit(req, { action: 'volunteer.status_changed', targetType: 'Volunteer', targetId: v._id, summary: `${v.reference}: ${from} → ${status}`, meta: { from, to: status, reason } });

  let notification = null;
  if (notify && status !== 'pending' && !v.isSample) {
    notification = await sendDecisionEmail(v);
    await Volunteer.updateOne({ _id: v._id }, { $push: { notifications: notification } });
  }
  send(res, { status: v.status, statusHistory: v.statusHistory, reviewedAt: v.reviewedAt, notification });
}

export async function addVolunteerNote(req, res) {
  const v = await Volunteer.findByIdAndUpdate(
    req.params.id,
    { $push: { notes: { body: req.body.body, author: req.user._id, authorName: req.user.name } } },
    { new: true, projection: { notes: 1, reference: 1 } },
  );
  if (!v) throw ApiError.notFound('This volunteer record does not exist');
  await audit(req, { action: 'volunteer.note_added', targetType: 'Volunteer', targetId: v._id, summary: `Note added to ${v.reference}` });
  send(res, v.notes, undefined, 201);
}

export async function setAssignment(req, res) {
  const { opportunityId, status } = req.body;
  const [v, opp] = await Promise.all([Volunteer.findById(req.params.id), Opportunity.findById(opportunityId)]);
  if (!v) throw ApiError.notFound('This volunteer record does not exist');
  if (!opp) throw ApiError.notFound('This opportunity does not exist');
  if (v.status !== 'approved' && status === 'assigned') throw ApiError.conflict('Approve the application before assigning activities');
  const existing = v.assignments.find((a) => String(a.opportunity) === String(opp._id));
  if (existing) { existing.status = status; existing.at = new Date(); } else v.assignments.push({ opportunity: opp._id, status });
  await v.save();
  await audit(req, { action: 'volunteer.assignment', targetType: 'Volunteer', targetId: v._id, summary: `${v.reference} ${status} for "${opp.title}"` });
  send(res, v.assignments);
}

const EXPORT_COLUMNS = [
  { label: 'Reference', get: (v) => v.reference },
  { label: 'Sample record', get: (v) => (v.isSample ? 'yes' : 'no') },
  { label: 'Status', get: (v) => v.status },
  { label: 'First name', get: (v) => v.firstName },
  { label: 'Last name', get: (v) => v.lastName },
  { label: 'Phone', get: (v) => (v.phone?.startsWith('+234') ? `0${v.phone.slice(4)}` : v.phone) },
  { label: 'Email', get: (v) => v.email },
  { label: 'Preferred contact', get: (v) => labelFor(CONTACT_METHODS, v.contactMethod) },
  { label: 'LGA', get: (v) => v.lga },
  { label: 'LCDA', get: (v) => v.lcda },
  { label: 'Ward', get: (v) => v.ward },
  { label: 'Community', get: (v) => v.community },
  { label: 'Interests', get: (v) => v.interests.map((i) => labelFor(INTERESTS, i)) },
  { label: 'Skills', get: (v) => v.skills.map((i) => labelFor(SKILLS, i)) },
  { label: 'Availability', get: (v) => v.availability.map((i) => labelFor(AVAILABILITY, i)) },
  { label: 'Participation', get: (v) => labelFor(PARTICIPATION_FORMATS, v.participationFormat) },
  { label: 'Consents to communications', get: (v) => (v.consent?.communications ? 'yes' : 'no') },
  { label: 'Registered at', get: (v) => v.createdAt },
];

export async function exportVolunteers(req, res) {
  const q = req.validatedQuery;
  const filter = buildVolunteerFilter(q);
  const rows = await Volunteer.find(filter).sort({ createdAt: -1 }).limit(20000).lean();
  await audit(req, { action: 'volunteer.exported', targetType: 'Volunteer', summary: `Exported ${rows.length} records`, meta: { filter: q } });
  const stamp = new Date().toISOString().slice(0, 10);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="apc-lagos-volunteers-${stamp}.csv"`);
  res.setHeader('Cache-Control', 'no-store');
  res.send(`﻿${toCsv(EXPORT_COLUMNS, rows)}`);
}

// ---------- Opportunities ----------

export async function listAdminOpportunities(req, res) {
  const { status } = req.validatedQuery;
  const filter = status ? { status } : { status: { $ne: 'archived' } };
  const items = await Opportunity.find(filter).sort({ updatedAt: -1 }).lean();
  const counts = await Volunteer.aggregate([
    { $unwind: '$assignments' },
    { $match: { 'assignments.opportunity': { $in: items.map((i) => i._id) } } },
    { $group: { _id: { opp: '$assignments.opportunity', status: '$assignments.status' }, n: { $sum: 1 } } },
  ]);
  const tally = (id, s) => counts.find((c) => String(c._id.opp) === String(id) && c._id.status === s)?.n ?? 0;
  send(res, items.map((i) => ({ ...i, interested: tally(i._id, 'interested'), assigned: tally(i._id, 'assigned') })));
}

export async function getAdminOpportunity(req, res) {
  const item = await Opportunity.findById(req.params.id).lean();
  if (!item) throw ApiError.notFound('This opportunity does not exist');
  const volunteers = await Volunteer.find({ 'assignments.opportunity': item._id })
    .select('reference firstName lastName lga status assignments isSample').lean();
  send(res, {
    ...item,
    volunteers: volunteers.map((v) => ({ ...v, assignment: v.assignments.find((a) => String(a.opportunity) === String(item._id)), assignments: undefined })),
  });
}

function applyPublishState(doc, status) {
  if (status === 'published' && !doc.publishedAt) doc.publishedAt = new Date();
}

export async function createOpportunity(req, res) {
  const doc = new Opportunity({ ...req.body, createdBy: req.user._id });
  applyPublishState(doc, doc.status);
  await doc.save();
  await audit(req, { action: 'opportunity.created', targetType: 'Opportunity', targetId: doc._id, summary: `Created "${doc.title}" (${doc.status})` });
  send(res, doc, undefined, 201);
}

export async function updateOpportunity(req, res) {
  const doc = await Opportunity.findById(req.params.id);
  if (!doc) throw ApiError.notFound('This opportunity does not exist');
  const before = doc.status;
  doc.set(req.body);
  applyPublishState(doc, doc.status);
  await doc.save();
  const action = before !== doc.status ? `opportunity.${doc.status}` : 'opportunity.updated';
  await audit(req, { action, targetType: 'Opportunity', targetId: doc._id, summary: `${before !== doc.status ? `${before} → ${doc.status}` : 'Edited'}: "${doc.title}"` });
  send(res, doc);
}

// Opportunities are archived rather than deleted so assignment history survives.
export async function archiveOpportunity(req, res) {
  const doc = await Opportunity.findByIdAndUpdate(req.params.id, { status: 'archived' }, { new: true });
  if (!doc) throw ApiError.notFound('This opportunity does not exist');
  await audit(req, { action: 'opportunity.archived', targetType: 'Opportunity', targetId: doc._id, summary: `Archived "${doc.title}"` });
  send(res, doc);
}

// ---------- Announcements ----------

export async function listAnnouncements(_req, res) {
  send(res, await Announcement.find({ status: { $ne: 'archived' } }).sort({ createdAt: -1 }).lean());
}

export async function createAnnouncement(req, res) {
  const doc = await Announcement.create({ ...req.body, createdBy: req.user._id, publishedAt: req.body.status === 'published' ? new Date() : undefined });
  await audit(req, { action: 'announcement.created', targetType: 'Announcement', targetId: doc._id, summary: `Created "${doc.title}" (${doc.status})` });
  send(res, doc, undefined, 201);
}

export async function updateAnnouncement(req, res) {
  const doc = await Announcement.findById(req.params.id);
  if (!doc) throw ApiError.notFound('This announcement does not exist');
  doc.set(req.body);
  if (doc.status === 'published' && !doc.publishedAt) doc.publishedAt = new Date();
  await doc.save();
  await audit(req, { action: 'announcement.updated', targetType: 'Announcement', targetId: doc._id, summary: `Updated "${doc.title}" (${doc.status})` });
  send(res, doc);
}

// ---------- Audit, data requests, staff ----------

export async function listAudit(req, res) {
  const { page, limit } = req.validatedQuery;
  const [items, total] = await Promise.all([
    AuditLog.find({ action: { $ne: 'volunteer.viewed' } }).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
    AuditLog.countDocuments({ action: { $ne: 'volunteer.viewed' } }),
  ]);
  send(res, items, { page, limit, total, pages: Math.max(1, Math.ceil(total / limit)) });
}

export async function listDataRequests(_req, res) {
  send(res, await DataRequest.find().sort({ status: 1, createdAt: -1 }).limit(200).populate('volunteer', 'firstName lastName reference').lean());
}

export async function resolveDataRequest(req, res) {
  const request = await DataRequest.findById(req.params.id);
  if (!request) throw ApiError.notFound('This request does not exist');
  if (request.status !== 'open') throw ApiError.conflict('This request has already been resolved');
  const { status, resolution } = req.body;

  // Completing a deletion request erases the personal record.
  if (status === 'completed' && request.type === 'deletion' && request.volunteer) {
    await Volunteer.deleteOne({ _id: request.volunteer });
    request.volunteer = undefined;
  }
  Object.assign(request, { status, resolution, resolvedBy: req.user._id, resolvedAt: new Date() });
  await request.save();
  await audit(req, { action: `data_request.${status}`, targetType: 'DataRequest', targetId: request._id, summary: `${request.type} request for ${request.reference} ${status}` });
  send(res, request);
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

