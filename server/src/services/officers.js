// Collation officer dashboard accounts.
//
// - An admin gives an approved LGA or Ward Collation Officer dashboard access.
//   That creates a sign-in account tied to the registration and the post it
//   holds, and emails a one-time link to set a password.
// - Every officer request re-checks, against the database, that the
//   registration is still approved and still holds the same post. Anything
//   else (declined, cancelled, revoked, moved, deleted) denies access.
// - Officers only ever see figures for their own LGA or ward, never personal
//   details of applicants.
import crypto from 'node:crypto';
import { Agent } from '../models/Agent.js';
import { User, OFFICER_ROLE_FOR } from '../models/User.js';
import { holdsPosition } from './positions.js';
import { levelOf, POSITION_HOLDING_STATUSES } from '../../../shared/options.js';
import { wardsFor, pollingUnitsFor } from './electoral.js';

export const INVITE_HOURS = 72;
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');
const ROLE_FOR_LEVEL = { lga: 'lga_officer', ward: 'ward_officer' };

export const assignmentLabel = (a) => (a?.level === 'ward' ? `${a.ward} ward (${a.wardCode}), ${a.lga} LGA` : `${a?.lga} LGA`);

export class AccessProblem extends Error {
  constructor(message, code = 'OFFICER_ACCESS') {
    super(message);
    this.code = code;
  }
}

// Creates a fresh one-time password link for an active officer account.
// Only the hash of the token is stored.
export async function issuePasswordSetup(userId) {
  const user = await User.findById(userId);
  if (!user || !user.active || !user.assignment) return null;
  const token = crypto.randomBytes(32).toString('base64url');
  user.passwordSetup = { tokenHash: hashToken(token), expiresAt: new Date(Date.now() + INVITE_HOURS * 3600e3) };
  await user.save();
  return { user, token };
}

// Sets the password from a one-time link. The link then stops working and
// every existing session for the account ends.
export async function completePasswordSetup(token, password) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 200) return null;
  const user = await User.findOne({ 'passwordSetup.tokenHash': hashToken(token), active: true }).select('+passwordSetup');
  if (!user || !user.passwordSetup?.expiresAt || user.passwordSetup.expiresAt < new Date()) return null;
  user.passwordHash = await User.hashPassword(password);
  user.passwordSetAt = new Date();
  user.passwordSetup = undefined;
  user.tokenVersion += 1;
  await user.save();
  return user;
}

// Creates (or re-activates) the dashboard account for an approved officer.
export async function grantOfficerAccess(agentId) {
  const agent = await Agent.findById(agentId).select('firstName lastName email agentCategory status lga ward wardCode pollingUnitCode isSample').lean();
  if (!agent) throw new AccessProblem('This registration does not exist', 'NOT_FOUND');
  const role = OFFICER_ROLE_FOR[agent.agentCategory];
  if (!role) throw new AccessProblem('Only LGA and Ward Collation Officers get a dashboard.');
  if (agent.isSample) throw new AccessProblem('Sample records cannot be given access.');
  if (agent.status !== 'approved') throw new AccessProblem('Approve the registration before giving dashboard access.');
  if (!(await holdsPosition(agent))) throw new AccessProblem('This registration does not hold its position. Settle the contested position first.');

  const level = levelOf(agent.agentCategory);
  const assignment = { agent: agent._id, level, lga: agent.lga, ...(level === 'ward' ? { wardCode: agent.wardCode, ward: agent.ward } : {}) };
  const existing = await User.findOne({ email: agent.email });
  if (existing && String(existing.assignment?.agent ?? '') !== String(agent._id)) {
    throw new AccessProblem('Another account already uses this email address. Ask the applicant for a different address, or remove the other account first.', 'EMAIL_IN_USE');
  }
  // Only one active account per post: switch off any account for an earlier holder.
  await User.updateMany(
    { role, 'assignment.level': level, 'assignment.lga': agent.lga, ...(level === 'ward' ? { 'assignment.wardCode': agent.wardCode } : {}), 'assignment.agent': { $ne: agent._id }, active: true },
    { $set: { active: false }, $inc: { tokenVersion: 1 } },
  );
  if (existing) {
    Object.assign(existing, { role, assignment, active: true, name: `${agent.firstName} ${agent.lastName}` });
    existing.tokenVersion += 1;
    await existing.save();
    return { user: existing, created: false };
  }
  const user = await User.create({
    name: `${agent.firstName} ${agent.lastName}`,
    email: agent.email,
    role,
    assignment,
    // Unusable until the officer sets a password from the emailed link.
    passwordHash: await User.hashPassword(crypto.randomBytes(32).toString('base64url')),
  });
  return { user, created: true };
}

// Switches off dashboard access for a registration (declined, cancelled or revoked).
export async function revokeOfficerAccess(agentId) {
  const res = await User.updateMany({ 'assignment.agent': agentId, active: true }, { $set: { active: false }, $inc: { tokenVersion: 1 } });
  return res.modifiedCount ?? 0;
}

// The dashboard account for a registration, if any (for the admin page).
export async function accessFor(agentId) {
  const u = await User.findOne({ 'assignment.agent': agentId }).select('active lastLoginAt createdAt passwordSetAt +passwordSetup').lean();
  if (!u) return null;
  return { active: u.active, lastLoginAt: u.lastLoginAt ?? null, passwordSet: Boolean(u.passwordSetAt), inviteExpiresAt: u.passwordSetup?.expiresAt ?? null, userId: u._id };
}

// Checks, on every request, that an officer's assignment is still valid.
// Returns the assignment to scope queries by; throws AccessProblem otherwise.
export async function activeAssignment(user) {
  const a = user?.assignment;
  if (!a?.agent || user.role !== ROLE_FOR_LEVEL[a.level]) throw new AccessProblem('Your account has no active assignment.');
  const agent = await Agent.findById(a.agent).select('status agentCategory lga ward wardCode pollingUnitCode').lean();
  const same = agent && agent.lga === a.lga && (a.level !== 'ward' || agent.wardCode === a.wardCode) && levelOf(agent.agentCategory) === a.level;
  if (!same || agent.status !== 'approved' || !(await holdsPosition(agent))) {
    throw new AccessProblem('Your assignment is no longer active. Contact the coordination team.');
  }
  return a;
}

// ---------- Dashboard figures (counts only, never personal details) ----------

const HOLDING = { $in: POSITION_HOLDING_STATUSES };

// Agent positions per polling unit: { [puCode]: { agent_1: {status, contested}, ... } },
// where status is 'approved' if an approved registration holds it, else 'pending'.
async function agentSlots(match) {
  const rows = await Agent.aggregate([
    { $match: { ...match, agentCategory: { $in: ['agent_1', 'agent_2'] }, status: HOLDING } },
    { $group: { _id: { pu: '$pollingUnitCode', c: '$agentCategory' }, approved: { $max: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } }, n: { $sum: 1 } } },
  ]);
  const out = {};
  for (const r of rows) (out[r._id.pu] ??= {})[r._id.c] = { status: r.approved ? 'approved' : 'pending', contested: r.n > 1 };
  return out;
}

const summarise = (units, slots) => {
  let filled = 0;
  let approved = 0;
  for (const u of units) {
    for (const c of ['agent_1', 'agent_2']) {
      const s = slots[u.code]?.[c];
      if (s) { filled += 1; if (s.status === 'approved') approved += 1; }
    }
  }
  const total = units.length * 2;
  return { pollingUnits: units.length, agentPositions: total, filled, approved, vacant: total - filled };
};

export async function wardDashboard(a) {
  const units = pollingUnitsFor('Lagos', a.lga, a.wardCode) ?? [];
  const slots = await agentSlots({ lga: a.lga, wardCode: a.wardCode });
  return {
    level: 'ward',
    assignment: { lga: a.lga, ward: a.ward, wardCode: a.wardCode },
    totals: summarise(units, slots),
    pollingUnits: units.map((u) => ({
      code: u.code,
      name: u.name,
      agent_1: slots[u.code]?.agent_1 ?? { status: 'vacant' },
      agent_2: slots[u.code]?.agent_2 ?? { status: 'vacant' },
    })),
  };
}

export async function lgaDashboard(a) {
  const wards = wardsFor('Lagos', a.lga).wards ?? [];
  const slots = await agentSlots({ lga: a.lga });
  const officers = await Agent.aggregate([
    { $match: { lga: a.lga, agentCategory: 'ward_collation_officer', status: HOLDING } },
    { $group: { _id: '$wardCode', approved: { $max: { $cond: [{ $eq: ['$status', 'approved'] }, 1, 0] } } } },
  ]);
  const wardOfficer = Object.fromEntries(officers.filter((o) => o._id).map((o) => [o._id, o.approved ? 'approved' : 'pending']));
  const rows = wards.map((w) => {
    const units = pollingUnitsFor('Lagos', a.lga, w.code) ?? [];
    return { code: w.code, name: w.name, ...summarise(units, slots), wardOfficer: { status: wardOfficer[w.code] ?? 'vacant' } };
  });
  const sum = (k) => rows.reduce((t, r) => t + r[k], 0);
  return {
    level: 'lga',
    assignment: { lga: a.lga },
    totals: {
      wards: rows.length,
      pollingUnits: sum('pollingUnits'),
      agentPositions: sum('agentPositions'),
      filled: sum('filled'),
      approved: sum('approved'),
      vacant: sum('vacant'),
      wardOfficersFilled: rows.filter((r) => r.wardOfficer.status !== 'vacant').length,
    },
    wards: rows,
  };
}
