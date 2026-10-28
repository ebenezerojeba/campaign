// Every collation officer position (one per LGA, two per ward in the official
// INEC data) with its current state: vacant, pending or approved, who holds
// it, and whether more registrations compete for the location than it has
// positions.
import { Agent } from '../models/Agent.js';
import { Position } from '../models/Position.js';
import { User } from '../models/User.js';
import { LGA_NAMES } from '../../../shared/lagos.js';
import { OFFICER_CATEGORIES, POSITION_HOLDING_STATUSES } from '../../../shared/options.js';
import { wardsFor } from './electoral.js';
import { OFFICER_CAPACITY, slotFor, seatsFor } from './positions.js';

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
  const slotOf = (g) => slotFor({ agentCategory: g._id.c, lga: g._id.lga, wardCode: g._id.w });
  const recordedBy = new Map((await Position.find({ _id: { $in: groups.flatMap((g) => slotOf(g)?.keys ?? []) } }).lean()).map((p) => [p._id, String(p.agent)]));
  // Holders per location, in seat order: recorded seats first, then the
  // rightful waiting registrations (approved first, then earliest).
  const byLocation = new Map();
  for (const g of groups) {
    const slot = slotOf(g);
    if (!slot) continue;
    const holders = [];
    for (const k of slot.keys) {
      const reg = g.regs.find((r) => String(r.id) === recordedBy.get(k));
      if (reg && !holders.includes(reg)) holders.push(reg);
    }
    for (const r of g.regs) { if (holders.length >= slot.seats) break; if (!holders.includes(r)) holders.push(r); }
    byLocation.set(slot.key, { holders, competing: g.n });
  }
  const holderIds = [...byLocation.values()].flatMap((v) => v.holders.map((h) => h.id));
  const accounts = new Map((await User.find({ 'assignment.agent': { $in: holderIds } }).select('assignment.agent active lastLoginAt passwordSetAt').lean())
    .map((u) => [String(u.assignment.agent), { active: u.active, passwordSet: Boolean(u.passwordSetAt), lastLoginAt: u.lastLoginAt ?? null }]));

  // One row per position: a ward with two positions gives two rows.
  const posts = (agentCategory, lga, ward) => {
    const slot = slotFor({ agentCategory, lga, wardCode: ward?.code });
    const found = byLocation.get(slot.key);
    const competing = found?.competing ?? 0;
    return Array.from({ length: slot.seats }, (_, i) => {
      const h = found?.holders[i];
      return {
        agentCategory,
        lga,
        ward: ward?.name,
        wardCode: ward?.code,
        seat: i + 1,
        seats: slot.seats,
        status: h ? h.status : 'vacant',
        holder: h ? { id: h.id, reference: h.reference, name: `${h.firstName} ${h.lastName}` } : null,
        competing,
        contested: competing > slot.seats,
        dashboard: h ? accounts.get(String(h.id)) ?? null : null,
      };
    });
  };
  const lgaPosts = lgas.flatMap((l) => posts('lga_collation_officer', l.lga));
  const wardPosts = lgas.flatMap((l) => l.wards.flatMap((w) => posts('ward_collation_officer', l.lga, w)));
  const summary = (list, capacity, locations, seats) => ({
    capacity,
    locations,
    seatsPerLocation: seats,
    // The configured total matches the official data only when these agree.
    reconciled: capacity === locations * seats,
    filled: list.filter((p) => p.status !== 'vacant').length,
    approved: list.filter((p) => p.status === 'approved').length,
    vacant: list.filter((p) => p.status === 'vacant').length,
    // Locations with more active registrations than positions.
    contested: new Set(list.filter((p) => p.contested).map((p) => `${p.lga}|${p.wardCode ?? ''}`)).size,
  });
  return {
    lga: { ...summary(lgaPosts, OFFICER_CAPACITY.lga_collation_officer, lgaCount, seatsFor('lga_collation_officer')), posts: lgaPosts },
    ward: { ...summary(wardPosts, OFFICER_CAPACITY.ward_collation_officer, wardCount, seatsFor('ward_collation_officer')), posts: wardPosts },
  };
}
