// One holder per position:
//   - an Agent 1 and an Agent 2 slot at each polling unit (13,325 units),
//   - a Ward Collation Officer post for each ward (245),
//   - an LGA Collation Officer post for each LGA (20).
//
// - A position is held by a Pending or Approved registration; Rejected,
//   Cancelled and Revoked registrations release it.
// - The holder is recorded in the `positions` collection under a unique _id,
//   so two simultaneous claims can never both succeed.
// - Registrations made before a rule existed are never changed: the first
//   time a position is looked at, it goes to the rightful existing holder
//   (an approved registration first, otherwise the earliest). Any others for
//   the same position stay as they are and are listed as conflicts for review.
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Agent } from '../models/Agent.js';
import { Position } from '../models/Position.js';
import { POSITION_CATEGORIES, POSITION_HOLDING_STATUSES, levelOf } from '../../../shared/options.js';

// A claim made for a registration that is still being saved is respected for
// this long even though the registration is not in the database yet.
const PENDING_CLAIM_MS = 2 * 60 * 1000;

// The position a registration is for: its _id in `positions`, and the query
// that finds every registration competing for it. Null when no rule applies.
// Polling-unit keys keep their original "<code>|<role>" form so existing
// records stay valid.
export function slotFor({ agentCategory, pollingUnitCode, wardCode, lga }) {
  if (env.positionRule !== 'on' || !POSITION_CATEGORIES.includes(agentCategory)) return null;
  const level = levelOf(agentCategory);
  if (level === 'lga') return lga ? { key: `LGA:${lga}|${agentCategory}`, match: { agentCategory, lga }, level } : null;
  if (level === 'ward') return wardCode ? { key: `WARD:${wardCode}|${agentCategory}`, match: { agentCategory, wardCode }, level } : null;
  return pollingUnitCode ? { key: `${pollingUnitCode}|${agentCategory}`, match: { agentCategory, pollingUnitCode }, level } : null;
}

// Most officer posts allowed across the system (20 LGAs and 245 wards in the
// official INEC data). With one post per location these can only be reached,
// never passed; they are checked as well so a smaller limit can be set.
export const OFFICER_CAPACITY = {
  lga_collation_officer: Number(process.env.LGA_OFFICER_CAPACITY) || 20,
  ward_collation_officer: Number(process.env.WARD_OFFICER_CAPACITY) || 245,
};
const KEY_PREFIX = { lga_collation_officer: '^LGA:', ward_collation_officer: '^WARD:' };

const holds = (status) => POSITION_HOLDING_STATUSES.includes(status);
const isDuplicate = (err) => err?.code === 11000;

// The registration that should hold a position among those already saved.
function rightfulHolder(slot) {
  return Agent.findOne({ ...slot.match, status: { $in: POSITION_HOLDING_STATUSES } })
    .sort({ status: 1, createdAt: 1 }) // 'approved' sorts before 'pending'
    .select('_id reference status')
    .lean();
}

// Returns the current holder ({ _id, reference }) or null when the position is free.
export async function currentHolder(slot, now = new Date()) {
  for (let i = 0; i < 3; i += 1) {
    const record = await Position.findById(slot.key).lean();
    if (record) {
      const holder = await Agent.findOne({ _id: record.agent, status: { $in: POSITION_HOLDING_STATUSES } }).select('_id reference status').lean();
      if (holder) return holder;
      // Held for a registration that is still being saved.
      if (now - record.since < PENDING_CLAIM_MS && !(await Agent.exists({ _id: record.agent }))) return { _id: record.agent, reference: null };
      // The holder was rejected, cancelled, revoked or deleted: free the position.
      await Position.deleteOne({ _id: slot.key, agent: record.agent });
    }
    const rightful = await rightfulHolder(slot);
    if (!rightful) return null;
    try {
      await Position.create({ _id: slot.key, agent: rightful._id, since: now });
      return rightful;
    } catch (err) {
      if (!isDuplicate(err)) throw err;
      // Someone else recorded it at the same moment: read it again.
    }
  }
  throw new Error('[positions] could not settle the position holder');
}

// Claims the position for `agentId`. Succeeds when the position is free or
// already held by this registration. Returns { ok, created, holder, reason }.
export async function claimPosition(agentId, source, now = new Date()) {
  const slot = slotFor(source);
  if (!slot) return { ok: true, created: false };
  const id = new mongoose.Types.ObjectId(String(agentId));
  const holder = await currentHolder(slot, now);
  if (holder) return holder._id.equals(id) ? { ok: true, created: false } : { ok: false, reason: 'taken', holder };
  const cap = OFFICER_CAPACITY[source.agentCategory];
  if (cap && (await Position.countDocuments({ _id: { $regex: KEY_PREFIX[source.agentCategory] } })) >= cap) {
    return { ok: false, reason: 'capacity' };
  }
  try {
    await Position.create({ _id: slot.key, agent: id, since: now });
    return { ok: true, created: true };
  } catch (err) {
    if (!isDuplicate(err)) throw err;
    const record = await Position.findById(slot.key).lean();
    return record?.agent?.equals(id) ? { ok: true, created: false } : { ok: false, reason: 'taken', holder: { _id: record?.agent, reference: null } };
  }
}

// Gives the position up if this registration holds it.
export async function releasePosition(agentId, source) {
  const slot = slotFor(source);
  if (slot) await Position.deleteOne({ _id: slot.key, agent: agentId });
}

// Whether a status change keeps, needs or gives up a position.
export const positionEffect = (from, to) => {
  if (holds(to) && !holds(from)) return 'claim'; // reinstated
  if (to === 'approved') return 'claim'; // must be the holder to be approved
  if (holds(from) && !holds(to)) return 'release';
  return 'none';
};

// Which polling-unit agent positions in a ward are taken, for the public form:
// codes only, no people.
export async function takenPositions(lga, wardCode) {
  if (env.positionRule !== 'on') return {};
  const rows = await Agent.aggregate([
    { $match: { lga, wardCode, agentCategory: { $in: ['agent_1', 'agent_2'] }, status: { $in: POSITION_HOLDING_STATUSES } } },
    { $group: { _id: { pu: '$pollingUnitCode', c: '$agentCategory' } } },
  ]);
  const taken = {};
  for (const { _id } of rows) (taken[_id.pu] ??= []).push(_id.c);
  return taken;
}

// Which officer posts in an LGA are taken, for the public form: whether the
// LGA post is filled and which wards' posts are, never who holds them.
export async function takenOfficerPosts(lga) {
  if (env.positionRule !== 'on') return { lgaOfficer: false, wardOfficers: [] };
  const rows = await Agent.aggregate([
    { $match: { lga, agentCategory: { $in: ['lga_collation_officer', 'ward_collation_officer'] }, status: { $in: POSITION_HOLDING_STATUSES } } },
    { $group: { _id: { c: '$agentCategory', w: '$wardCode' } } },
  ]);
  return {
    lgaOfficer: rows.some((r) => r._id.c === 'lga_collation_officer'),
    wardOfficers: rows.filter((r) => r._id.c === 'ward_collation_officer' && r._id.w).map((r) => r._id.w),
  };
}

// The grouping key used to find competing registrations in aggregations.
const SLOT_GROUP = {
  c: '$agentCategory',
  loc: { $switch: {
    branches: [
      { case: { $eq: ['$agentCategory', 'lga_collation_officer'] }, then: '$lga' },
      { case: { $eq: ['$agentCategory', 'ward_collation_officer'] }, then: '$wardCode' },
    ],
    default: '$pollingUnitCode',
  } },
};
const keyOfGroup = (id, sample) => slotFor({ agentCategory: id.c, lga: sample.lga, wardCode: sample.wardCode, pollingUnitCode: sample.pollingUnitCode })?.key;

// Positions with more than one Pending or Approved registration, for review.
// `categories` narrows it to some roles.
export async function positionConflicts({ limit = 500, categories = POSITION_CATEGORIES } = {}) {
  const groups = await Agent.aggregate([
    { $match: { agentCategory: { $in: categories }, status: { $in: POSITION_HOLDING_STATUSES } } },
    { $sort: { status: 1, createdAt: 1 } },
    { $group: {
      _id: SLOT_GROUP,
      count: { $sum: 1 },
      lga: { $first: '$lga' },
      ward: { $first: '$ward' },
      wardCode: { $first: '$wardCode' },
      pollingUnit: { $first: '$pollingUnit' },
      pollingUnitCode: { $first: '$pollingUnitCode' },
      registrations: { $push: { id: '$_id', reference: '$reference', firstName: '$firstName', lastName: '$lastName', status: '$status', createdAt: '$createdAt' } },
    } },
    { $match: { count: { $gt: 1 }, '_id.loc': { $nin: [null, ''] } } },
    { $sort: { lga: 1, '_id.loc': 1, '_id.c': 1 } },
  ]);
  const keys = groups.map((g) => keyOfGroup(g._id, g)).filter(Boolean);
  const holders = new Map((await Position.find({ _id: { $in: keys } }).lean()).map((p) => [p._id, String(p.agent)]));
  return {
    total: groups.length,
    surplus: groups.reduce((t, g) => t + g.count - 1, 0),
    items: groups.slice(0, limit).map((g) => {
      const held = holders.get(keyOfGroup(g._id, g));
      // Before a position is first looked at, the rightful holder is the first in sort order.
      const holderId = held ?? String(g.registrations[0].id);
      const level = levelOf(g._id.c);
      return {
        agentCategory: g._id.c,
        level,
        lga: g.lga,
        ward: level === 'lga' ? undefined : g.ward,
        wardCode: level === 'lga' ? undefined : g.wardCode,
        pollingUnit: level === 'pollingUnit' ? g.pollingUnit : undefined,
        pollingUnitCode: level === 'pollingUnit' ? g.pollingUnitCode : undefined,
        registrations: g.registrations.map((r) => ({ ...r, holder: String(r.id) === holderId })),
      };
    }),
  };
}

// The position a registration holds or is waiting for, for the admin detail page.
export async function positionFor(agent) {
  const slot = slotFor(agent);
  if (!slot) return null;
  if (!holds(agent.status)) return { state: 'released' };
  const holder = await currentHolder(slot);
  if (holder && String(holder._id) === String(agent._id)) return { state: 'holder' };
  return { state: 'conflict', holderReference: holder?.reference ?? null, holderId: holder?._id ?? null };
}

// Whether this registration currently holds its position (officer access checks).
export async function holdsPosition(agent) {
  const slot = slotFor(agent);
  if (!slot || !holds(agent.status)) return false;
  const holder = await currentHolder(slot);
  return Boolean(holder && String(holder._id) === String(agent._id));
}
