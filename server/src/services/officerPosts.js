// Every collation officer post (one per LGA, one per ward in the official
// INEC data) with its current state: vacant, pending or approved, who holds
// it, and whether more than one registration competes for it.
import { Agent } from '../models/Agent.js';
import { Position } from '../models/Position.js';
import { User } from '../models/User.js';
import { LGA_NAMES } from '../../../shared/lagos.js';
import { OFFICER_CATEGORIES, POSITION_HOLDING_STATUSES } from '../../../shared/options.js';
import { wardsFor } from './electoral.js';
import { OFFICER_CAPACITY, slotFor } from './positions.js';

// The official locations: 20 LGAs and their wards (245 in the INEC data).
export function officerLocations() {
  const lgas = LGA_NAMES.map((lga) => {
    const data = wardsFor('Lagos', lga);
    return { lga, senatorialDistrict: data.senatorialDistrict, wards: data.configured ? data.wards.map((w) => ({ code: w.code, name: w.name })) : [] };
  });
  return { lgas, lgaCount: lgas.length, wardCount: lgas.reduce((t, l) => t + l.wards.length, 0) };
}

export async function officerPosts() {
  const { lgas, lgaCount, wardCount } = officerLocations();
  const groups = await Agent.aggregate([
    { $match: { agentCategory: { $in: OFFICER_CATEGORIES }, status: { $in: POSITION_HOLDING_STATUSES } } },
    { $sort: { status: 1, createdAt: 1 } },
    { $group: {
      _id: { c: '$agentCategory', lga: '$lga', w: { $cond: [{ $eq: ['$agentCategory', 'ward_collation_officer'] }, '$wardCode', null] } },
      n: { $sum: 1 },
      regs: { $push: { id: '$_id', reference: '$reference', firstName: '$firstName', lastName: '$lastName', status: '$status' } },
    } },
  ]);
  const keyOf = (g) => slotFor({ agentCategory: g._id.c, lga: g._id.lga, wardCode: g._id.w })?.key;
  const recorded = new Map((await Position.find({ _id: { $in: groups.map(keyOf).filter(Boolean) } }).lean()).map((p) => [p._id, String(p.agent)]));
  const byKey = new Map();
  for (const g of groups) {
    const key = keyOf(g);
    if (!key) continue;
    const heldId = recorded.get(key);
    const holder = g.regs.find((r) => String(r.id) === heldId) ?? g.regs[0];
    byKey.set(key, { holder, competing: g.n });
  }
  const holderIds = [...byKey.values()].map((v) => v.holder.id);
  const accounts = new Map((await User.find({ 'assignment.agent': { $in: holderIds } }).select('assignment.agent active lastLoginAt passwordSetAt').lean())
    .map((u) => [String(u.assignment.agent), { active: u.active, passwordSet: Boolean(u.passwordSetAt), lastLoginAt: u.lastLoginAt ?? null }]));

  const post = (agentCategory, lga, ward) => {
    const key = slotFor({ agentCategory, lga, wardCode: ward?.code }).key;
    const found = byKey.get(key);
    const h = found?.holder;
    return {
      agentCategory,
      lga,
      ward: ward?.name,
      wardCode: ward?.code,
      status: h ? h.status : 'vacant',
      holder: h ? { id: h.id, reference: h.reference, name: `${h.firstName} ${h.lastName}` } : null,
      competing: found?.competing ?? 0,
      contested: (found?.competing ?? 0) > 1,
      dashboard: h ? accounts.get(String(h.id)) ?? null : null,
    };
  };
  const lgaPosts = lgas.map((l) => post('lga_collation_officer', l.lga));
  const wardPosts = lgas.flatMap((l) => l.wards.map((w) => post('ward_collation_officer', l.lga, w)));
  const summary = (posts, capacity, locations) => ({
    capacity,
    locations,
    // The requested totals match the official data only when these agree.
    reconciled: capacity === locations,
    filled: posts.filter((p) => p.status !== 'vacant').length,
    approved: posts.filter((p) => p.status === 'approved').length,
    vacant: posts.filter((p) => p.status === 'vacant').length,
    contested: posts.filter((p) => p.contested).length,
  });
  return {
    lga: { ...summary(lgaPosts, OFFICER_CAPACITY.lga_collation_officer, lgaCount), posts: lgaPosts },
    ward: { ...summary(wardPosts, OFFICER_CAPACITY.ward_collation_officer, wardCount), posts: wardPosts },
  };
}
