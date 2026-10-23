// Fixture data for the read-only demonstration preview of the admin dashboard,
// used only when no database is connected. Every record is fictional, uses a
// DEMO- reference and an example.com address, has no documents, and is
// labelled as sample data. Wards and polling units are left blank because the
// preview does not load the official dataset.
import { LGA_NAMES } from '../../../shared/lagos.js';
import { STATE_NAMES, lgasOfState } from '../../../shared/nigeria.js';
import { AGENT_CATEGORIES, labelFor, valuesOf } from '../../../shared/options.js';
import { ApiError } from '../lib/api.js';

let seed = 7;
const rand = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
const pick = (l) => l[Math.floor(rand() * l.length)];
const FIRST = ['Adebayo', 'Chiamaka', 'Oluwaseun', 'Ngozi', 'Ibrahim', 'Funmilayo', 'Emeka', 'Aisha', 'Tunde', 'Folake', 'Yusuf', 'Kemi', 'Chinedu', 'Bisola', 'Musa', 'Temitope'];
const LAST = ['Adeyemi', 'Okafor', 'Balogun', 'Eze', 'Bello', 'Ogunleye', 'Nwosu', 'Lawal', 'Adeleke', 'Okonkwo', 'Salami', 'Afolabi'];
const WEIGHTS = { Alimosho: 9, Ikorodu: 6, 'Oshodi-Isolo': 5, Kosofe: 5, Ojo: 4, Mushin: 4, Surulere: 4, 'Eti-Osa': 4, Ikeja: 4 };
const CHARS = '23456789ABCDEFGHJKMNPQRSTVWXYZ';
const ref = () => `DEMO-${Array.from({ length: 4 }, () => pick(CHARS)).join('')}-${Array.from({ length: 4 }, () => pick(CHARS)).join('')}`;

const now = Date.now();

const agents = Array.from({ length: 164 }, (_, i) => {
  const lga = rand() < 0.6 ? pick(Object.keys(WEIGHTS)) : pick(LGA_NAMES);
  const created = new Date(now - Math.floor(Math.pow(rand(), 1.6) * 30) * 86400000 - rand() * 86400000);
  const r = rand();
  const status = (now - created) / 86400000 < 3 ? 'pending' : r < 0.6 ? 'approved' : r < 0.8 ? 'pending' : 'rejected';
  const firstName = pick(FIRST);
  const lastName = pick(LAST);
  const origin = rand() < 0.45 ? 'Lagos' : pick(STATE_NAMES);
  return {
    _id: `demo-agent-${i}`, reference: ref(), firstName, lastName,
    email: `${firstName}.${lastName}.${i}@example.com`.toLowerCase(),
    phone: `+23480${String(10000000 + i * 7919).slice(-8)}`,
    agentCategory: pick(valuesOf(AGENT_CATEGORIES)), stateOfOrigin: origin, lgaOfOrigin: pick(lgasOfState(origin)),
    state: 'Lagos', lga, status, isSample: true, documents: {},
    consent: { processing: true, sensitiveData: true, noticeVersion: '2026-10-agents', at: created.toISOString() },
    createdAt: created.toISOString(), statusHistory: [{ to: 'pending', reason: 'Registration submitted', at: created.toISOString() }],
    notes: [], notifications: [], auditTrail: [],
  };
}).sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));

function dashboard() {
  const count = (s) => agents.filter((v) => v.status === s).length;
  const fmt = new Intl.DateTimeFormat('en-CA', { timeZone: 'Africa/Lagos' });
  const trend = Array.from({ length: 30 }, (_, i) => {
    const date = fmt.format(new Date(now - (29 - i) * 86400000));
    return { date, registrations: agents.filter((v) => fmt.format(new Date(v.createdAt)) === date).length };
  });
  const byLga = LGA_NAMES.map((lga) => ({ lga, total: agents.filter((v) => v.lga === lga).length, approved: agents.filter((v) => v.lga === lga && v.status === 'approved').length }))
    .filter((l) => l.total).sort((a, b) => b.total - a.total);
  const byCategory = valuesOf(AGENT_CATEGORIES).map((c) => ({ category: c, label: labelFor(AGENT_CATEGORIES, c), count: agents.filter((v) => v.agentCategory === c).length })).sort((a, b) => b.count - a.count);
  return {
    totals: { all: agents.length, pending: count('pending'), approved: count('approved'), rejected: count('rejected') },
    trend, byLga, byCategory, recent: agents.slice(0, 6), sampleCount: agents.length,
  };
}

function listAgents(params) {
  let items = agents;
  const q = params.get('q')?.toLowerCase();
  if (q) items = items.filter((v) => `${v.reference} ${v.firstName} ${v.lastName} ${v.email} ${v.phone}`.toLowerCase().includes(q));
  for (const key of ['status', 'lga', 'agentCategory', 'stateOfOrigin', 'lgaOfOrigin']) if (params.get(key)) items = items.filter((v) => v[key] === params.get(key));
  if (params.get('sort') === 'oldest') items = [...items].reverse();
  if (params.get('sort') === 'name') items = [...items].sort((a, b) => a.lastName.localeCompare(b.lastName));
  const page = Number(params.get('page') || 1);
  const limit = Number(params.get('limit') || 20);
  return { data: items.slice((page - 1) * limit, page * limit), meta: { page, limit, total: items.length, pages: Math.max(1, Math.ceil(items.length / limit)) } };
}

export const DEMO_USER = { id: 'demo', name: 'Demonstration viewer', email: 'preview@example.com', role: 'admin', permissions: ['agents:read', 'agents:review', 'agents:export', 'agents:delete', 'documents:read', 'audit:read', 'staff:manage'] };

export function demoGet(path) {
  const [pathname, query = ''] = path.split('?');
  const params = new URLSearchParams(query);
  const parts = pathname.split('/').filter(Boolean);
  if (pathname === '/admin/auth/me') return DEMO_USER;
  if (pathname === '/admin/dashboard') return dashboard();
  if (pathname === '/admin/agents') return listAgents(params);
  if (parts[1] === 'agents' && parts[2]) {
    const a = agents.find((x) => x._id === parts[2]);
    if (!a) throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'This registration does not exist' });
    return a;
  }
  if (pathname === '/admin/audit') return { data: [], meta: { page: 1, limit: 30, total: 0, pages: 1 } };
  if (pathname === '/admin/staff') return [{ ...DEMO_USER, active: true, createdAt: new Date().toISOString() }];
  throw new ApiError({ status: 404, code: 'NOT_FOUND', message: 'Not available in the preview' });
}
