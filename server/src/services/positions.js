// Positions and who holds them:
//   - an Agent 1 and an Agent 2 position at each polling unit (13,325 units),
//   - two Ward Collation Officer positions for each ward (245 wards, 490 positions),
//   - one LGA Collation Officer position for each LGA (20).
//
// - A position is held by a Pending or Approved registration; Rejected,
//   Cancelled and Revoked registrations release it.
// - Each seat is recorded in the `positions` collection under a unique _id,
//   so two simultaneous claims can never both take the same seat.
// - Registrations made before a rule existed are never changed: the first
//   time a position is looked at, its seats go to the rightful existing
//   holders (approved registrations first, otherwise the earliest). Any
//   others stay as they are and are listed as conflicts for review.
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Agent } from '../models/Agent.js';
import { Position } from '../models/Position.js';
import { POSITION_CATEGORIES, POSITION_HOLDING_STATUSES, levelOf } from '../../../shared/options.js';

// How many people one location holds for each role. Everything else is 1.
export const SEATS_PER_LOCATION = { ward_collation_officer: 2 };
export const seatsFor = (agentCategory) => SEATS_PER_LOCATION[agentCategory] ?? 1;

// A claim made for a registration that is still being saved is respected for
// this long even though the registration is not in the database yet.
const PENDING_CLAIM_MS = 2 * 60 * 1000;

// The position a registration is for: the _id of each seat in `positions`,
// and the query that finds every registration competing for it. Null when no
// rule applies. The first seat keeps the original key form ("<code>|<role>",
// "WARD:<code>|<role>", "LGA:<name>|<role>") so existing records stay valid;
// further seats add "#2", "#3"...
export function slotFor({ agentCategory, pollingUnitCode, wardCode, lga }) {
  if (env.positionRule !== 'on' || !POSITION_CATEGORIES.includes(agentCategory)) return null;
  const level = levelOf(agentCategory);
  let base;
  let match;
  if (level === 'lga') { if (!lga) return null; base = `LGA:${lga}|${agentCategory}`; match = { agentCategory, lga }; }
  else if (level === 'ward') { if (!wardCode) return null; base = `WARD:${wardCode}|${agentCategory}`; match = { agentCategory, wardCode }; }
  else { if (!pollingUnitCode) return null; base = `${pollingUnitCode}|${agentCategory}`; match = { agentCategory, pollingUnitCode }; }
  const seats = seatsFor(agentCategory);
  const keys = Array.from({ length: seats }, (_, i) => (i === 0 ? base : `${base}#${i + 1}`));
  return { key: base, keys, seats, match, level };
}

// Most officer positions allowed across the system (20 LGAs x 1, and 245
// wards x 2 in the official INEC data). With fixed seats per location these
// can only be reached, never passed; they are checked as well so a smaller
// limit can be set.
export const OFFICER_CAPACITY = {
  lga_collation_officer: Number(process.env.LGA_OFFICER_CAPACITY) || 20,
  ward_collation_officer: Number(process.env.WARD_OFFICER_CAPACITY) || 490,
};
const KEY_PREFIX = { lga_collation_officer: '^LGA:', ward_collation_officer: '^WARD:' };

const holds = (status) => POSITION_HOLDING_STATUSES.includes(status);
const isDuplicate = (err) => err?.code === 11000;
const sameId = (a, b) => String(a) === String(b);

// Current holders of a position ([{ _id, reference, status }], at most
// `seats`). Clears seats whose holder no longer holds (rejected, cancelled,
// revoked, deleted) and fills empty seats from registrations already saved.
export async function currentHolders(slot, now = new Date()) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const records = await Position.find({ _id: { $in: slot.keys } }).lean();
    const holders = [];
    const freeKeys = new Set(slot.keys);
    for (const record of records) {
      // One read decides it: two separate reads could straddle the moment a
      // new registration is saved and wrongly free its seat.
      const agent = await Agent.findById(record.agent).select('_id reference status').lean();
      if (agent && holds(agent.status)) { holders.push(agent); freeKeys.delete(record._id); continue; }
      // Held for a registration that is still being saved.
      if (!agent && Date.now() - new Date(record.since).getTime() < PENDING_CLAIM_MS) { holders.push({ _id: record.agent, reference: null }); freeKeys.delete(record._id); continue; }
      // The holder no longer holds (rejected, cancelled, revoked, deleted, or never saved): free the seat.
      await Position.deleteOne({ _id: record._id, agent: record.agent });
    }
    if (holders.length >= slot.seats || !freeKeys.size) return holders;
    // Fill empty seats with the rightful existing registrations, in order.
    const waiting = await Agent.find({ ...slot.match, status: { $in: POSITION_HOLDING_STATUSES }, _id: { $nin: holders.map((h) => h._id) } })
      .sort({ status: 1, createdAt: 1 }) // 'approved' sorts before 'pending'
      .limit(freeKeys.size)
      .select('_id reference status')
      .lean();
    if (!waiting.length) return holders;
    let clash = false;
    const keys = [...freeKeys];
    for (let i = 0; i < waiting.length; i += 1) {
      try {
        await Position.create({ _id: keys[i], agent: waiting[i]._id, since: now });
        holders.push(waiting[i]);
      } catch (err) {
        if (!isDuplicate(err)) throw err;
        clash = true; // someone else took this seat at the same moment
      }
    }
    if (!clash) return holders;
  }
  throw new Error('[positions] could not settle the position holders');
}

// Kept for single-seat callers: the first holder, or null.
export async function currentHolder(slot, now = new Date()) {
  return (await currentHolders(slot, now))[0] ?? null;
}

// Claims a seat for `agentId`. Succeeds when a seat is free or this
// registration already holds one. Returns { ok, created, holder, reason }.
export async function claimPosition(agentId, source, now = new Date()) {
  const slot = slotFor(source);
  if (!slot) return { ok: true, created: false };
  const id = new mongoose.Types.ObjectId(String(agentId));
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const holders = await currentHolders(slot, now);
    if (holders.some((h) => sameId(h._id, id))) return { ok: true, created: false };
    if (holders.length >= slot.seats) return { ok: false, reason: 'taken', holder: holders[0], holders };
    const cap = OFFICER_CAPACITY[source.agentCategory];
    if (cap && (await Position.countDocuments({ _id: { $regex: KEY_PREFIX[source.agentCategory] } })) >= cap) {
      return { ok: false, reason: 'capacity' };
    }
    const held = new Set((await Position.find({ _id: { $in: slot.keys } }).select('_id').lean()).map((r) => r._id));
    const free = slot.keys.find((k) => !held.has(k));
    if (!free) continue;
    try {
      await Position.create({ _id: free, agent: id, since: now });
      return { ok: true, created: true };
    } catch (err) {
      if (!isDuplicate(err)) throw err;
      // Taken at the same moment: look again.
    }
  }
  const holders = await currentHolders(slot, now);
  return holders.some((h) => sameId(h._id, id)) ? { ok: true, created: false } : { ok: false, reason: 'taken', holder: holders[0], holders };
}

// Gives up any seat this registration holds.
export async function releasePosition(agentId, source) {
  const slot = slotFor(source);
  if (slot) await Position.deleteMany({ _id: { $in: slot.keys }, agent: agentId });
}

// Whether a status change keeps, needs or gives up a position.
export const positionEffect = (from, to) => {
  if (holds(to) && !holds(from)) return 'claim'; // reinstated
  if (to === 'approved') return 'claim'; // must be a holder to be approved
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

// Which officer positions in an LGA are filled, for the public form: whether
// the LGA position is filled, and which wards have both Ward Collation Officer
// positions filled. Never who holds them.
export async function takenOfficerPosts(lga) {
  if (env.positionRule !== 'on') return { lgaOfficer: false, wardOfficers: [], wardOfficerCounts: {} };
  const rows = await Agent.aggregate([
    { $match: { lga, agentCategory: { $in: ['lga_collation_officer', 'ward_collation_officer'] }, status: { $in: POSITION_HOLDING_STATUSES } } },
    { $group: { _id: { c: '$agentCategory', w: '$wardCode' }, n: { $sum: 1 } } },
  ]);
  const wardRows = rows.filter((r) => r._id.c === 'ward_collation_officer' && r._id.w);
  return {
    lgaOfficer: rows.some((r) => r._id.c === 'lga_collation_officer'),
    // Wards where every Ward Collation Officer position is filled.
    wardOfficers: wardRows.filter((r) => r.n >= seatsFor('ward_collation_officer')).map((r) => r._id.w),
    wardOfficerCounts: Object.fromEntries(wardRows.map((r) => [r._id.w, Math.min(r.n, seatsFor('ward_collation_officer'))])),
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
const slotOfGroup = (id, sample) => slotFor({ agentCategory: id.c, lga: sample.lga, wardCode: sample.wardCode, pollingUnitCode: sample.pollingUnitCode });

// Positions with more Pending or Approved registrations than seats, for review.
// `categories` narrows it to some roles.
export async function positionConflicts({ limit = 500, categories = POSITION_CATEGORIES } = {}) {
  const all = await Agent.aggregate([
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
  const groups = all.filter((g) => g.count > seatsFor(g._id.c));
  const slots = groups.map((g) => slotOfGroup(g._id, g));
  const records = await Position.find({ _id: { $in: slots.flatMap((s) => s?.keys ?? []) } }).lean();
  const recordedBy = new Map(records.map((p) => [p._id, String(p.agent)]));
  return {
    total: groups.length,
    surplus: groups.reduce((t, g) => t + g.count - seatsFor(g._id.c), 0),
    items: groups.slice(0, limit).map((g, i) => {
      const seats = seatsFor(g._id.c);
      const recorded = new Set((slots[i]?.keys ?? []).map((k) => recordedBy.get(k)).filter(Boolean));
      // Before seats are first looked at, the rightful holders are the first in sort order.
      const holderIds = new Set(recorded.size ? recorded : g.registrations.slice(0, seats).map((r) => String(r.id)));
      if (holderIds.size < seats) for (const r of g.registrations) { if (holderIds.size >= seats) break; holderIds.add(String(r.id)); }
      const level = levelOf(g._id.c);
      return {
        agentCategory: g._id.c,
        level,
        seats,
        lga: g.lga,
        ward: level === 'lga' ? undefined : g.ward,
        wardCode: level === 'lga' ? undefined : g.wardCode,
        pollingUnit: level === 'pollingUnit' ? g.pollingUnit : undefined,
        pollingUnitCode: level === 'pollingUnit' ? g.pollingUnitCode : undefined,
        registrations: g.registrations.map((r) => ({ ...r, holder: holderIds.has(String(r.id)) })),
      };
    }),
  };
}

// The position a registration holds or is waiting for, for the admin detail page.
export async function positionFor(agent) {
  const slot = slotFor(agent);
  if (!slot) return null;
  if (!holds(agent.status)) return { state: 'released' };
  const holders = await currentHolders(slot);
  if (holders.some((h) => sameId(h._id, agent._id))) return { state: 'holder' };
  const first = holders[0];
  return { state: 'conflict', holderReference: holders.map((h) => h.reference).filter(Boolean).join(' and ') || null, holderId: first?._id ?? null };
}

// Whether this registration currently holds a seat (officer access checks).
export async function holdsPosition(agent) {
  const slot = slotFor(agent);
  if (!slot || !holds(agent.status)) return false;
  return (await currentHolders(slot)).some((h) => sameId(h._id, agent._id));
}
