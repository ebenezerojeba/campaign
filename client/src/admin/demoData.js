// Fixture data for the read-only demonstration preview of the admin dashboard,
// used only when no database is connected. Every record is fictional, uses a
// DEMO- reference and an example.com address, and is labelled as sample data.
import { LAGOS_AREAS, LGA_NAMES } from '../../../shared/lagos.js';
import { INTERESTS, SKILLS, AVAILABILITY, labelFor, valuesOf } from '../../../shared/options.js';
import { ApiError } from '../lib/api.js';

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (l) => l[Math.floor(rand() * l.length)];
const some = (l, a, b) => [...l].sort(() => rand() - 0.5).slice(0, a + Math.floor(rand() * (b - a + 1)));
const FIRST = ['Adebayo', 'Chiamaka', 'Oluwaseun', 'Ngozi', 'Ibrahim', 'Funmilayo', 'Emeka', 'Aisha', 'Tunde', 'Folake', 'Yusuf', 'Kemi', 'Chinedu', 'Bisola', 'Musa', 'Temitope'];
const LAST = ['Adeyemi', 'Okafor', 'Balogun', 'Eze', 'Bello', 'Ogunleye', 'Nwosu', 'Lawal', 'Adeleke', 'Okonkwo', 'Salami', 'Afolabi'];
const WEIGHTS = { Alimosho: 9, Ikorodu: 6, 'Oshodi-Isolo': 5, Kosofe: 5, Ojo: 4, Mushin: 4, Surulere: 4, 'Eti-Osa': 4, Ikeja: 4 };
const CHARS = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const ref = () => `DEMO-${Array.from({ length: 4 }, () => pick(CHARS)).join('')}-${Array.from({ length: 4 }, () => pick(CHARS)).join('')}`;

const now = Date.now();
const opportunities = [
  ['Community listening sessions', 'community_outreach', 'Alimosho'],
  ['Event welcome and accessibility team', 'event_support', 'Ikeja'],
  ['Civic education explainers', 'civic_education', ''],
  ['Digital communications desk', 'digital_communications', ''],
].map(([title, category, lga], i) => ({
  _id: `demo-opp-${i}`, title, category, status: 'published', isSample: true,
  summary: 'Sample activity shown in the demonstration preview.',
  location: { lga, isRemote: !lga }, startDate: new Date(now + (i + 3) * 86400000).toISOString(),
  interested: 4 + i * 3, assigned: 2 + i, updatedAt: new Date(now - i * 86400000).toISOString(), skills: [],
}));

const volunteers = Array.from({ length: 164 }, (_, i) => {
  const lga = rand() < 0.6 ? pick(Object.keys(WEIGHTS)) : pick(LGA_NAMES);
  const created = new Date(now - Math.floor(Math.pow(rand(), 1.6) * 30) * 86400000 - rand() * 86400000);
  const r = rand();
  const status = (now - created) / 86400000 < 3 ? 'pending' : r < 0.6 ? 'approved' : r < 0.8 ? 'pending' : 'rejected';
  const firstName = pick(FIRST);
  const lastName = pick(LAST);
  return {
    _id: `demo-vol-${i}`, reference: ref(), firstName, lastName,
    email: rand() < 0.7 ? `${firstName}.${lastName}.${i}@example.com`.toLowerCase() : undefined,
    phone: `+23480${String(10000000 + i * 7919).slice(-8)}`, contactMethod: pick(['whatsapp', 'sms', 'call']),
    state: 'Lagos', lga, lcda: rand() < 0.5 ? pick(LAGOS_AREAS.find((a) => a.lga === lga).lcdas) : undefined,
    interests: some(valuesOf(INTERESTS), 1, 3), skills: some(valuesOf(SKILLS), 0, 3), availability: some(valuesOf(AVAILABILITY), 1, 2),
    participationFormat: pick(['in_person', 'remote', 'either']), status, isSample: true,
    consent: { processing: true, communications: rand() < 0.6, ageConfirmed: true, noticeVersion: '2026-10', at: created.toISOString() },
    createdAt: created.toISOString(), statusHistory: [{ to: 'pending', reason: 'Application submitted', at: created.toISOString() }],
    notes: [], notifications: [], assignments: [], auditTrail: [],
  };
}).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

function dashboard() {
  const count = (s) => volunteers.filter((v) => v.status === s).length;
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' });
  const trend = Array.from({ length: 30 }, (_, i) => {
    const date = fmt.format(new Date(now - (29 - i) * 86400000));
    return { date, registrations: volunteers.filter((v) => fmt.format(new Date(v.createdAt)) === date).length };
  });
  const byLga = LGA_NAMES.map((lga) => ({ lga, total: volunteers.filter((v) => v.lga === lga).length, approved: volunteers.filter((v) => v.lga === lga && v.status === 'approved').length }))
    .filter((l) => l.total).sort((a, b) => b.total - a.total);
  const byInterest = valuesOf(INTERESTS).map((i) => ({ interest: i, label: labelFor(INTERESTS, i), count: volunteers.filter((v) => v.interests.includes(i)).length })).sort((a, b) => b.count - a.count);
  return {
    totals: { all: volunteers.length, pending: count('pending'), approved: count('approved'), rejected: count('rejected') },
    trend, byLga, byInterest, recent: volunteers.slice(0, 6), publishedOpportunities: opportunities.length, openRequests: 0, sampleCount: volunteers.length,
  };
}

function listVolunteers(params) {
  let items = volunteers;
  const q = params.get('q')?.toLowerCase();
  if (q) items = items.filter((v) => `${v.reference} ${v.firstName} ${v.lastName} ${v.email ?? ''} ${v.phone}`.toLowerCase().includes(q));
  for (const key of ['status', 'lga']) if (params.get(key)) items = items.filter((v) => v[key] === params.get(key));
  if (params.get('interest')) items = items.filter((v) => v.interests.includes(params.get('interest')));
  if (params.get('sort') === 'oldest') items = [...items].reverse();
  if (params.get('sort') === 'name') items = [...items].sort((a, b) => a.lastName.localeCompare(b.lastName));
  const page = Number(params.get('page') || 1);
  const limit = Number(params.get('limit') || 20);
  return { data: items.slice((page - 1) * limit, page * limit), meta: { page, limit, total: items.length, pages: Math.max(1, Math.ceil(items.length / limit)) } };
}

export const DEMO_USER = { id: 'demo', name: 'Demonstration viewer', email: 'preview@example.com', role: 'admin', permissions: ['volunteers:read', 'volunteers:review', 'volunteers:export', 'opportunities:manage', 'announcements:manage', 'audit:read', 'staff:manage', 'requests:manage'] };

export function demoGet(path) {
  const [pathname, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  const parts = pathname.split('/').filter(Boolean);
  if (pathname === '/admin/auth/me') return DEMO_USER;
  if (pathname === '/admin/dashboard') return dashboard();
  if (pathname === '/admin/volunteers') return listVolunteers(params);
  if (parts[1] === 'volunteers' && parts[2]) {
    const v = volunteers.find((x) => x._id === parts[2]);
    if (!v) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'This volunteer record does not exist' });
    return v;
  }
  if (pathname === '/admin/opportunities') return opportunities;
  if (parts[1] === 'opportunities' && parts[2]) return { ...opportunities.find((o) => o._id === parts[2]), volunteers: [] };
  if (pathname === '/admin/announcements') return [];
  if (pathname === '/admin/requests') return [];
  if (pathname === '/admin/audit') return { data: [], meta: { page: 1, limit: 30, total: 0, pages: 1 } };
  if (pathname === '/admin/staff') return [{ ...DEMO_USER, active: true, createdAt: new Date().toISOString() }];
  throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Not available in the preview' });
}
