// One Agent 1 and one Agent 2 per polling unit.
//
// - A position is held by a Pending or Approved registration; Rejected and
//   Cancelled registrations release it.
// - The holder is recorded in the `positions` collection under a unique _id,
//   so two simultaneous claims can never both succeed.
// - Registrations made before this rule existed are never changed: the first
//   time a position is looked at, it goes to the rightful existing holder
//   (an approved registration first, otherwise the earliest). Any others for
//   the same position stay as they are and are listed as conflicts for review.
import mongoose from 'mongoose';
import { env } from '../config/env.js';
import { Agent } from '../models/Agent.js';
import { Position } from '../models/Position.js';
import { POSITION_CATEGORIES, POSITION_HOLDING_STATUSES } from '../../../shared/options.js';

// A claim made for a registration that is still being saved is respected for
// this long even though the registration is not in the database yet.
const PENDING_CLAIM_MS = 2 * 60 * 1000;

export const positionKey = (pollingUnitCode, agentCategory) => `${pollingUnitCode}|${agentCategory}`;
export const ruleApplies = (agentCategory, pollingUnitCode) => env.positionRule === 'on' && POSITION_CATEGORIES.includes(agentCategory) && Boolean(pollingUnitCode);
const holds = (status) => POSITION_HOLDING_STATUSES.includes(status);
const isDuplicate = (err) => err?.code === 11000;

// The registration that should hold a position among those already saved.
function rightfulHolder(pollingUnitCode, agentCategory) {
  return Agent.findOne({ pollingUnitCode, agentCategory, status: { $in: POSITION_HOLDING_STATUSES } })
    .sort({ status: 1, createdAt: 1 }) // 'approved' sorts before 'pending'
    .select('_id reference status')
    .lean();
}

// Returns the current holder ({ _id, reference }) or null when the position is free.
export async function currentHolder(pollingUnitCode, agentCategory, now = new Date()) {
  const key = positionKey(pollingUnitCode, agentCategory);
  for (let i = 0; i < 3; i += 1) {
    const record = await Position.findById(key).lean();
    if (record) {
      const holder = await Agent.findOne({ _id: record.agent, status: { $in: POSITION_HOLDING_STATUSES } }).select('_id reference status').lean();
      if (holder) return holder;
      // Held for a registration that is still being saved.
      if (now - record.since < PENDING_CLAIM_MS && !(await Agent.exists({ _id: record.agent }))) return { _id: record.agent, reference: null };
      // The holder was rejected, cancelled or deleted: free the position.
      await Position.deleteOne({ _id: key, agent: record.agent });
    }
    const rightful = await rightfulHolder(pollingUnitCode, agentCategory);
    if (!rightful) return null;
    try {
      await Position.create({ _id: key, agent: rightful._id, since: now });
      return rightful;
    } catch (err) {
      if (!isDuplicate(err)) throw err;
      // Someone else recorded it at the same moment: read it again.
    }
  }
  throw new Error('[positions] could not settle the position holder');
}

// Claims the position for `agentId`. Succeeds when the position is free or
// already held by this registration. Returns { ok, created, holder }.
export async function claimPosition(agentId, pollingUnitCode, agentCategory, now = new Date()) {
  if (!ruleApplies(agentCategory, pollingUnitCode)) return { ok: true, created: false };
  const id = new mongoose.Types.ObjectId(String(agentId));
  const holder = await currentHolder(pollingUnitCode, agentCategory, now);
  if (holder) return holder._id.equals(id) ? { ok: true, created: false } : { ok: false, holder };
  try {
    await Position.create({ _id: positionKey(pollingUnitCode, agentCategory), agent: id, since: now });
    return { ok: true, created: true };
  } catch (err) {
    if (!isDuplicate(err)) throw err;
    const record = await Position.findById(positionKey(pollingUnitCode, agentCategory)).lean();
    return record?.agent?.equals(id) ? { ok: true, created: false } : { ok: false, holder: { _id: record?.agent, reference: null } };
  }
}

// Gives the position up if this registration holds it.
export async function releasePosition(agentId, pollingUnitCode, agentCategory) {
  if (!pollingUnitCode || !agentCategory) return;
  await Position.deleteOne({ _id: positionKey(pollingUnitCode, agentCategory), agent: agentId });
}

// Whether a status change keeps, needs or gives up a position.
export const positionEffect = (from, to) => {
  if (holds(to) && !holds(from)) return 'claim'; // reinstated
  if (to === 'approved') return 'claim'; // must be the holder to be approved
  if (holds(from) && !holds(to)) return 'release';
  return 'none';
};

// Which positions in a ward are taken, for the public form: codes only, no people.
export async function takenPositions(lga, wardCode) {
  if (env.positionRule !== 'on') return {};
  const rows = await Agent.aggregate([
    { $match: { lga, wardCode, agentCategory: { $in: POSITION_CATEGORIES }, status: { $in: POSITION_HOLDING_STATUSES } } },
    { $group: { _id: { pu: '$pollingUnitCode', c: '$agentCategory' } } },
  ]);
  const taken = {};
  for (const { _id } of rows) (taken[_id.pu] ??= []).push(_id.c);
  return taken;
}

// Positions with more than one Pending or Approved registration, for review.
export async function positionConflicts({ limit = 500 } = {}) {
  const groups = await Agent.aggregate([
    { $match: { agentCategory: { $in: POSITION_CATEGORIES }, status: { $in: POSITION_HOLDING_STATUSES } } },
    { $sort: { status: 1, createdAt: 1 } },
    { $group: {
      _id: { pu: '$pollingUnitCode', c: '$agentCategory' },
      count: { $sum: 1 },
      lga: { $first: '$lga' },
      ward: { $first: '$ward' },
      pollingUnit: { $first: '$pollingUnit' },
      registrations: { $push: { id: '$_id', reference: '$reference', firstName: '$firstName', lastName: '$lastName', status: '$status', createdAt: '$createdAt' } },
    } },
    { $match: { count: { $gt: 1 } } },
    { $sort: { lga: 1, '_id.pu': 1, '_id.c': 1 } },
  ]);
  const holders = new Map((await Position.find({ _id: { $in: groups.map((g) => positionKey(g._id.pu, g._id.c)) } }).lean()).map((p) => [p._id, String(p.agent)]));
  return {
    total: groups.length,
    surplus: groups.reduce((t, g) => t + g.count - 1, 0),
    items: groups.slice(0, limit).map((g) => {
      const held = holders.get(positionKey(g._id.pu, g._id.c));
      // Before a position is first looked at, the rightful holder is the first in sort order.
      const holderId = held ?? String(g.registrations[0].id);
      return {
        pollingUnitCode: g._id.pu,
        agentCategory: g._id.c,
        lga: g.lga,
        ward: g.ward,
        pollingUnit: g.pollingUnit,
        registrations: g.registrations.map((r) => ({ ...r, holder: String(r.id) === holderId })),
      };
    }),
  };
}

// The position a registration holds or is waiting for, for the admin detail page.
export async function positionFor(agent) {
  if (!ruleApplies(agent.agentCategory, agent.pollingUnitCode)) return null;
  if (!holds(agent.status)) return { state: 'released' };
  const holder = await currentHolder(agent.pollingUnitCode, agent.agentCategory);
  if (holder && String(holder._id) === String(agent._id)) return { state: 'holder' };
  return { state: 'conflict', holderReference: holder?.reference ?? null, holderId: holder?._id ?? null };
}
