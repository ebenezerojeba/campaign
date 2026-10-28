// Collation officers, their dashboards, and the reports centre. In-memory
// MongoDB, synthetic records and a fake SMTP transporter only.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

process.env.NODE_ENV = 'test';
process.env.POSITION_RULE = 'on';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256-signing';
process.env.DATA_ENCRYPTION_KEY = 'test-only-encryption-key-with-enough-entropy';
process.env.SMTP_HOST = 'smtp.example.org';
process.env.SMTP_PORT = '465';
process.env.SMTP_USER = 'notifications@apclagos.org';
process.env.SMTP_PASS = 'not-a-real-password';
process.env.EMAIL_FROM = 'notifications@apclagos.org';
process.env.FRONTEND_URL = 'https://www.apclagos.org';
process.env.EMAIL_MAX_PER_MINUTE = '1000';
process.env.EMAIL_MAX_PER_HOUR = '100000';

const { MongoMemoryServer } = await import('mongodb-memory-server-core');
const mongoose = (await import('mongoose')).default;
const request = (await import('supertest')).default;
const ExcelJS = (await import('exceljs')).default;

let mongo;
let app;
let Agent;
let User;
let Position;
let EmailOutbox;
let outbox;
let positions;
let reports;
let officerPostsSvc;
const sent = [];
const fetchHeader = { 'X-Requested-With': 'fetch' };
const fieldsOf = (res) => res.body.error?.details?.fields ?? {};

function png(width, height, shade) {
  const chunk = (type, data) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(body));
    return Buffer.concat([len, body, crc]);
  };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(width, 0); ihdr.writeUInt32BE(height, 4); ihdr[8] = 8;
  const raw = Buffer.alloc((width + 1) * height, shade);
  for (let y = 0; y < height; y += 1) raw[y * (width + 1)] = 0;
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]);
}

let seq = 0;
function registration(overrides = {}) {
  seq += 1;
  const n = String(seq).padStart(4, '0');
  return {
    firstName: 'Officer', lastName: `Test${n.replace(/\d/g, (d) => 'abcdefghij'[d])}`, email: `off${n}@example.com`, phone: `0809000${n}`, dateOfBirth: '1985-03-02',
    stateOfOrigin: 'Oyo', lgaOfOrigin: 'Ibadan North', agentCategory: 'lga_collation_officer', state: 'Lagos', lga: 'Surulere',
    wardCode: '', pollingUnitCode: '', nin: `7400000${n}`, vin: `OFFVIN${n}AB`, apcPartyRegistrationNumber: `LA/O/${n}`,
    bankName: 'Zenith Bank', accountName: 'Officer Test', accountNumber: '0123456789',
    declarationAccurate: true, consentProcessing: true, consentSensitive: true, consentFinancialIdentity: true,
    ...overrides,
  };
}
const register = (data) => request(app).post('/api/agents/register').field('data', JSON.stringify(data))
  .attach('passport', png(400, 500, (seq * 11) % 250), 'p.png').attach('pvc', png(1000, 640, (seq * 17) % 250), 'c.png');
const agentFor = async (res) => Agent.findOne({ reference: res.body.data.reference }).lean();

async function signIn(email, password = 'correct-horse-battery') {
  const agent = request.agent(app);
  const res = await agent.post('/api/admin/auth/login').set(fetchHeader).send({ email, password });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return agent;
}
async function approve(admin, id) {
  await admin.post(`/api/admin/agents/${id}/checks`).set(fetchHeader).send({ cardReadable: false, face: { distance: 0.3 } });
  const res = await admin.patch(`/api/admin/agents/${id}/status`).set(fetchHeader).send({ status: 'approved', notify: false });
  assert.equal(res.status, 200, JSON.stringify(res.body));
}
// Gives an approved officer access, sends the invite, and sets their password. Returns a signed-in session.
// Approval gives access automatically (see approve()); this sends the queued invitation.
async function officerSession(_admin, _agentId, email) {
  sent.length = 0;
  await outbox.drainOutbox({ max: 50, now: () => new Date(Date.now() + 60e3) });
  const invite = sent.find((m) => m.to === email && /collation officer dashboard/.test(m.subject));
  assert.ok(invite, 'invite sent');
  const token = invite.text.match(/#token=([A-Za-z0-9_-]+)/)[1];
  const set = await request(app).post('/api/admin/auth/set-password').set(fetchHeader).send({ token, password: 'officer-strong-pass-1' });
  assert.equal(set.status, 200, JSON.stringify(set.body));
  return { session: await signIn(email, 'officer-strong-pass-1'), token };
}

// Reads a downloaded xlsx into { sheetName: rows[] }.
async function readXlsx(buffer) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buffer);
  const out = {};
  wb.eachSheet((ws) => {
    out[ws.name] = [];
    ws.eachRow((row) => out[ws.name].push(row.values.slice(1)));
  });
  return out;
}
const binary = (r, cb) => { const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c))); };

let admin;
before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: process.env.MONGOMS_VERSION || '7.0.14' } });
  const db = await import('../src/config/db.js');
  db.setMongoUri(mongo.getUri('apc_officers'));
  await db.connectDb();
  app = (await import('../src/app.js')).default;
  ({ Agent } = await import('../src/models/Agent.js'));
  ({ User } = await import('../src/models/User.js'));
  ({ Position } = await import('../src/models/Position.js'));
  ({ EmailOutbox } = await import('../src/models/EmailOutbox.js'));
  outbox = await import('../src/services/outbox.js');
  positions = await import('../src/services/positions.js');
  reports = await import('../src/services/reports.js');
  officerPostsSvc = await import('../src/services/officerPosts.js');
  const email = await import('../src/services/email.js');
  email.setTransporterForTests({ async sendMail(m) { sent.push(m); return { messageId: '<x@test>', accepted: [m.to], rejected: [], response: '250 OK' }; } });
  await Promise.all([Agent.syncIndexes(), User.syncIndexes(), Position.syncIndexes(), EmailOutbox.syncIndexes()]);
  await User.create({ name: 'Admin', email: 'admin@test.org', role: 'admin', passwordHash: await User.hashPassword('correct-horse-battery') });
  await User.create({ name: 'Reviewer', email: 'rev@test.org', role: 'reviewer', passwordHash: await User.hashPassword('correct-horse-battery') });
  admin = await signIn('admin@test.org');
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([Agent.deleteMany({}), Position.deleteMany({}), EmailOutbox.deleteMany({}), User.deleteMany({ role: { $in: ['lga_officer', 'ward_officer'] } }), mongoose.connection.db.collection('ratelimits').deleteMany({})]);
});

test('the official data has exactly 20 LGAs and 245 wards: 20 LGA and 490 Ward Collation Officer positions', () => {
  const loc = officerPostsSvc.officerLocations();
  assert.equal(loc.lgaCount, 20);
  assert.equal(loc.wardCount, 245);
  assert.equal(positions.OFFICER_CAPACITY.lga_collation_officer, 20);
  assert.equal(positions.OFFICER_CAPACITY.ward_collation_officer, 490);
  assert.equal(positions.seatsFor('ward_collation_officer'), 2);
  assert.equal(positions.seatsFor('lga_collation_officer'), 1);
  assert.equal(positions.seatsFor('agent_1'), 1);
});

test('all four roles register; officers give only the location their role needs', async () => {
  const a1 = await register(registration({ agentCategory: 'agent_1', wardCode: '20-01', pollingUnitCode: '24-20-01-001' }));
  const a2 = await register(registration({ agentCategory: 'agent_2', wardCode: '20-01', pollingUnitCode: '24-20-01-001' }));
  const ward = await register(registration({ agentCategory: 'ward_collation_officer', wardCode: '20-02', pollingUnitCode: '24-20-01-001' }));
  const lga = await register(registration({ agentCategory: 'lga_collation_officer', wardCode: '20-03' }));
  for (const r of [a1, a2, ward, lga]) assert.equal(r.status, 201, JSON.stringify(r.body));
  const w = await agentFor(ward);
  assert.deepEqual([w.wardCode, w.pollingUnitCode], ['20-02', undefined], 'ward officers store no polling unit');
  const l = await agentFor(lga);
  assert.deepEqual([l.lga, l.wardCode, l.pollingUnitCode], ['Surulere', undefined, undefined], 'LGA officers store no ward or polling unit');
});

test('a ward officer must choose a ward, and it must belong to the chosen LGA', async () => {
  const missing = await register(registration({ agentCategory: 'ward_collation_officer', wardCode: '', electoralRequired: true }));
  assert.equal(missing.status, 422);
  assert.ok(fieldsOf(missing).wardCode);
  const wrongLga = await register(registration({ agentCategory: 'ward_collation_officer', wardCode: '11-01' })); // an Ikeja ward with Surulere chosen
  assert.equal(wrongLga.status, 422);
  assert.match(fieldsOf(wrongLga).wardCode, /Surulere/);
});

test('one officer per LGA and two per ward; a position is free again after a decline', async () => {
  assert.equal((await register(registration())).status, 201);
  const second = await register(registration());
  assert.equal(second.status, 422);
  assert.match(fieldsOf(second).agentCategory, /LGA Collation Officer position for this LGA has already been filled/);
  assert.equal((await register(registration({ lga: 'Ikeja' }))).status, 201, 'another LGA is free');

  const w1 = await register(registration({ agentCategory: 'ward_collation_officer', wardCode: '20-05' }));
  assert.equal(w1.status, 201);
  assert.equal((await register(registration({ agentCategory: 'ward_collation_officer', wardCode: '20-05' }))).status, 201, 'a ward has a second position');
  const w3 = await register(registration({ agentCategory: 'ward_collation_officer', wardCode: '20-05' }));
  assert.equal(w3.status, 422);
  assert.match(fieldsOf(w3).agentCategory, /Both Ward Collation Officer positions for this ward have already been filled/);
  const id = (await agentFor(w1))._id;
  assert.equal((await admin.patch(`/api/admin/agents/${id}/status`).set(fetchHeader).send({ status: 'rejected', notify: false })).status, 200);
  assert.equal((await register(registration({ agentCategory: 'ward_collation_officer', wardCode: '20-05' }))).status, 201);
});

test('simultaneous claims: exactly two succeed for a ward, exactly one for an LGA', async () => {
  const ward = await Promise.all(Array.from({ length: 12 }, () => register(registration({ agentCategory: 'ward_collation_officer', wardCode: '20-06' }))));
  assert.equal(ward.filter((r) => r.status === 201).length, 2, ward.map((r) => r.status).join(','));
  assert.equal(await Agent.countDocuments({ agentCategory: 'ward_collation_officer', wardCode: '20-06' }), 2);
  const lga = await Promise.all(Array.from({ length: 8 }, () => register(registration({ lga: 'Eti-Osa' }))));
  assert.equal(lga.filter((r) => r.status === 201).length, 1, lga.map((r) => r.status).join(','));
});

test('the total number of officer posts is capped', async () => {
  const original = positions.OFFICER_CAPACITY.lga_collation_officer;
  positions.OFFICER_CAPACITY.lga_collation_officer = 2;
  try {
    assert.equal((await register(registration({ lga: 'Agege' }))).status, 201);
    assert.equal((await register(registration({ lga: 'Apapa' }))).status, 201);
    const third = await register(registration({ lga: 'Epe' }));
    assert.equal(third.status, 422);
    assert.match(fieldsOf(third).agentCategory, /All LGA Collation Officer positions have been filled/);
  } finally {
    positions.OFFICER_CAPACITY.lga_collation_officer = original;
  }
});

test('officer dashboard: invitation, one-time password link, and figures for their own LGA only', async () => {
  const res = await register(registration({ lga: 'Surulere' }));
  const a = await agentFor(res);
  // Not before approval.
  assert.equal((await admin.post(`/api/admin/agents/${a._id}/officer-access`).set(fetchHeader)).status, 409);
  await approve(admin, a._id);
  // Some agents in Surulere and another LGA, to check scoping.
  await register(registration({ agentCategory: 'agent_1', wardCode: '20-01', pollingUnitCode: '24-20-01-002', firstName: 'Secretname' }));
  await register(registration({ agentCategory: 'agent_1', lga: 'Ikeja', wardCode: '11-01', pollingUnitCode: '24-11-01-001' }));

  const { session, token } = await officerSession(admin, a._id, a.email);
  // The link works once.
  assert.equal((await request(app).post('/api/admin/auth/set-password').set(fetchHeader).send({ token, password: 'another-strong-pass' })).status, 400);
  // No raw token is stored.
  const stored = await User.findOne({ email: a.email }).select('+passwordSetup').lean();
  assert.equal(stored.passwordSetup, undefined);
  assert.ok(!JSON.stringify(await EmailOutbox.find().lean()).includes(token), 'token never stored in the outbox');

  const me = (await session.get('/api/admin/auth/me')).body.data;
  assert.deepEqual([me.role, me.assignment.lga, me.permissions], ['lga_officer', 'Surulere', ['officer:dashboard']]);
  const dash = await session.get('/api/admin/officer/dashboard?lga=Ikeja&wardCode=11-01');
  assert.equal(dash.status, 200);
  assert.equal(dash.body.data.assignment.lga, 'Surulere', 'query parameters cannot change the LGA');
  assert.equal(dash.body.data.wards.length, 12);
  assert.equal(dash.body.data.totals.filled, 1, 'only Surulere agents counted');
  const text = JSON.stringify(dash.body);
  for (const secret of ['Secretname', '@example.com', '0809000']) assert.ok(!text.includes(secret), `no personal details (${secret})`);
});

test('officers cannot use any admin function, and agents never get a login', async () => {
  const res = await register(registration({ agentCategory: 'ward_collation_officer', wardCode: '20-07' }));
  const a = await agentFor(res);
  await approve(admin, a._id);
  const { session } = await officerSession(admin, a._id, a.email);
  for (const path of ['/api/admin/dashboard', '/api/admin/agents', `/api/admin/agents/${a._id}`, `/api/admin/agents/${a._id}/documents/pvc`, '/api/admin/exports/agents', '/api/admin/reports', '/api/admin/reports/registrations', '/api/admin/staff', '/api/admin/audit', '/api/admin/officers/posts', '/api/admin/positions/conflicts']) {
    assert.equal((await session.get(path)).status, 403, path);
  }
  assert.equal((await session.post(`/api/admin/agents/${a._id}/sensitive-details`).set(fetchHeader)).status, 403);
  assert.equal((await session.patch(`/api/admin/agents/${a._id}/status`).set(fetchHeader).send({ status: 'approved' })).status, 403);
  // A ward officer sees their ward's polling units only.
  const dash = (await session.get('/api/admin/officer/dashboard')).body.data;
  assert.equal(dash.level, 'ward');
  assert.equal(dash.assignment.wardCode, '20-07');
  assert.ok(dash.pollingUnits.every((u) => u.code.startsWith('24-20-07-')));
  // Agents have no accounts at all.
  const agent = await register(registration({ agentCategory: 'agent_1', wardCode: '20-01', pollingUnitCode: '24-20-01-003' }));
  assert.equal((await request(app).post('/api/admin/auth/login').set(fetchHeader).send({ email: (await agentFor(agent)).email, password: 'anything-at-all' })).status, 401);
  // Staff cannot turn an officer into an admin.
  const officerUser = await User.findOne({ email: a.email });
  assert.equal((await admin.patch(`/api/admin/staff/${officerUser._id}`).set(fetchHeader).send({ role: 'admin' })).status, 409);
});

test('revoking an officer releases the post and ends dashboard access at once', async () => {
  const res = await register(registration({ lga: 'Mushin' }));
  const a = await agentFor(res);
  await approve(admin, a._id);
  const { session } = await officerSession(admin, a._id, a.email);
  assert.equal((await session.get('/api/admin/officer/dashboard')).status, 200);
  assert.equal((await admin.patch(`/api/admin/agents/${a._id}/status`).set(fetchHeader).send({ status: 'revoked', reason: 'Replaced', notify: false })).status, 200);
  assert.equal((await session.get('/api/admin/officer/dashboard')).status, 401, 'session ended');
  assert.equal((await register(registration({ lga: 'Mushin' }))).status, 201, 'post free again');
});

test('an officer whose registration stops holding its post is denied even with a valid session', async () => {
  const res = await register(registration({ lga: 'Ojo' }));
  const a = await agentFor(res);
  await approve(admin, a._id);
  const { session } = await officerSession(admin, a._id, a.email);
  // Someone changes the record directly (not through the app): access must still be refused.
  await Agent.updateOne({ _id: a._id }, { $set: { status: 'pending' } });
  assert.equal((await session.get('/api/admin/officer/dashboard')).status, 403);
});

test('officers download their own summary as Excel; counts only', async () => {
  const res = await register(registration({ lga: 'Kosofe' }));
  const a = await agentFor(res);
  await approve(admin, a._id);
  const { session } = await officerSession(admin, a._id, a.email);
  const file = await session.get('/api/admin/officer/report?format=xlsx').buffer(true).parse(binary);
  assert.equal(file.status, 200);
  assert.match(file.headers['content-disposition'], /attachment; filename="apc-lagos-kosofe-lga-[0-9-]+\.xlsx"/);
  assert.equal(file.headers['cache-control'], 'no-store, private');
  const book = await readXlsx(file.body);
  assert.equal(book.Wards.length, 1 + 10, 'header plus Kosofe’s 10 wards');
});

test('reports: every type downloads as a valid Excel file and CSV, with filters and record counts', async () => {
  await register(registration({ agentCategory: 'agent_1', wardCode: '20-01', pollingUnitCode: '24-20-01-004' }));
  await register(registration({ agentCategory: 'ward_collation_officer', wardCode: '20-08' }));
  await register(registration({ lga: 'Surulere' }));
  const list = (await admin.get('/api/admin/reports')).body.data;
  assert.equal(list.length, 8);
  for (const r of list) {
    const xlsx = await admin.get(`/api/admin/reports/${r.id}?format=xlsx&lga=Surulere`).buffer(true).parse(binary);
    assert.equal(xlsx.status, 200, r.id);
    assert.match(xlsx.headers['content-type'], /spreadsheetml/);
    const book = await readXlsx(xlsx.body);
    const about = Object.fromEntries(book['About this report'].slice(1));
    assert.equal(about.Report, r.title);
    assert.match(about.Generated, /WAT$/);
    assert.ok(about.Records, `${r.id} has a record count`);
    if (r.filters.includes('lga')) assert.match(about.Filters, /LGA: Surulere/);
    const csv = await admin.get(`/api/admin/reports/${r.id}?format=csv&lga=Surulere`);
    assert.equal(csv.status, 200, r.id);
    assert.match(csv.text, /^﻿Report,/);
  }
  const regs = await readXlsx((await admin.get('/api/admin/reports/registrations?lga=Surulere&role=agent_1').buffer(true).parse(binary)).body);
  assert.equal(regs.Registrations.length, 2, 'header plus the one Surulere Agent 1');
  const header = regs.Registrations[0].join(' ');
  for (const banned of ['NIN', 'VIN', 'Account', 'Bank', 'party']) assert.ok(!header.includes(banned), `no ${banned} column`);
  const officers = await readXlsx((await admin.get('/api/admin/reports/ward-officers').buffer(true).parse(binary)).body);
  assert.equal(officers['Ward positions'].length, 1 + 490, 'two rows per ward');
});

test('spreadsheet formula injection is neutralised in Excel and CSV', async () => {
  await Agent.create({ reference: 'LAG-FORM-ULA1', firstName: '=HYPERLINK("http://evil.example","x")', lastName: '+SUM(1,2)', middleName: '@cmd', email: 'formula@example.com', phone: '+2348050009999', stateOfOrigin: 'Oyo', lgaOfOrigin: 'Ibadan North', agentCategory: 'agent_2', lga: 'Surulere', ward: 'W', wardCode: '20-09', pollingUnit: '-1+1', pollingUnitCode: '24-20-09-001', consent: { processing: true, sensitiveData: true, declarationAccurate: true } });
  const xlsx = await readXlsx((await admin.get('/api/admin/reports/registrations?lga=Surulere').buffer(true).parse(binary)).body);
  const row = xlsx.Registrations.find((r) => r.includes('LAG-FORM-ULA1'));
  assert.ok(row.includes(`'=HYPERLINK("http://evil.example","x")`));
  assert.ok(row.includes("'+SUM(1,2)") && row.includes("'@cmd") && row.includes("'-1+1"));
  assert.ok(row.every((v) => typeof v !== 'object' || v instanceof Date || v === null), 'no formula cells');
  const csv = (await admin.get('/api/admin/reports/registrations?format=csv&lga=Surulere')).text;
  assert.ok(csv.includes(`"'=HYPERLINK(""http://evil.example"",""x"")"`));
  assert.equal(reports.safeCell('=1+1'), "'=1+1");
  assert.equal(reports.safeCell(-5), -5, 'real numbers are untouched');
});

test('reports are for admins only, and each download is audited without its contents', async () => {
  const reviewer = await signIn('rev@test.org');
  assert.equal((await reviewer.get('/api/admin/reports')).status, 403);
  assert.equal((await reviewer.get('/api/admin/reports/registrations')).status, 403);
  assert.equal((await request(app).get('/api/admin/reports/registrations')).status, 401);
  assert.equal((await admin.get('/api/admin/reports/nope')).status, 404);
  assert.equal((await admin.get('/api/admin/reports/registrations?format=pdf')).status, 422);
  await admin.get('/api/admin/reports/summary?format=csv');
  const entry = await mongoose.connection.db.collection('auditlogs').findOne({ action: 'report.exported' }, { sort: { createdAt: -1 } });
  assert.match(entry.summary, /Overall registration summary \(csv\): downloaded/);
  assert.equal(entry.meta.outcome, 'downloaded');
});

test('existing duplicate officer registrations are reported for review, never changed', async () => {
  // Saved directly, as if made before the rule.
  const base = { stateOfOrigin: 'Oyo', lgaOfOrigin: 'Ibadan North', agentCategory: 'ward_collation_officer', lga: 'Surulere', ward: 'W', wardCode: '20-10', consent: { processing: true, sensitiveData: true, declarationAccurate: true } };
  await Agent.create({ ...base, reference: 'LAG-DUPL-ONE1', firstName: 'First', lastName: 'Holder', email: 'd1@example.com', phone: '+2348050000001', createdAt: new Date('2026-10-01') });
  await Agent.create({ ...base, reference: 'LAG-DUPL-TWO2', firstName: 'Second', lastName: 'Holder', email: 'd2@example.com', phone: '+2348050000002', createdAt: new Date('2026-10-02') });
  // Two registrations fit a ward's two positions: not a conflict.
  let posts = (await admin.get('/api/admin/officers/posts')).body.data;
  assert.equal(posts.ward.contested, 0);
  await Agent.create({ ...base, reference: 'LAG-DUPL-THR3', firstName: 'Third', lastName: 'Waiting', email: 'd3@example.com', phone: '+2348050000003', createdAt: new Date('2026-10-03') });
  posts = (await admin.get('/api/admin/officers/posts')).body.data;
  const seats = posts.ward.posts.filter((p) => p.wardCode === '20-10');
  assert.deepEqual(seats.map((p) => [p.seat, p.holder.reference, p.contested, p.competing]), [[1, 'LAG-DUPL-ONE1', true, 3], [2, 'LAG-DUPL-TWO2', true, 3]]);
  assert.equal(posts.ward.contested, 1);
  const conflicts = (await admin.get('/api/admin/positions/conflicts')).body.data;
  const item = conflicts.items.find((i) => i.wardCode === '20-10');
  assert.deepEqual(item.registrations.map((r) => [r.reference, r.holder]), [['LAG-DUPL-ONE1', true], ['LAG-DUPL-TWO2', true], ['LAG-DUPL-THR3', false]]);
  assert.equal(conflicts.surplus, 1);
  const book = await readXlsx((await admin.get('/api/admin/reports/conflicts').buffer(true).parse(binary)).body);
  assert.equal(book.Conflicts.length, 4);
  // A new applicant for the full ward is refused; the third waits for review.
  assert.equal((await register(registration({ agentCategory: 'ward_collation_officer', wardCode: '20-10' }))).status, 422);
  assert.equal(await Agent.countDocuments({ wardCode: '20-10', status: 'pending' }), 3, 'nothing changed');
});

test('admin dashboard shows filled and vacant officer posts', async () => {
  await register(registration({ lga: 'Badagry' }));
  await register(registration({ agentCategory: 'ward_collation_officer', lga: 'Badagry', wardCode: '06-01' }));
  const d = (await admin.get('/api/admin/dashboard')).body.data;
  assert.deepEqual([d.officerPosts.lga.capacity, d.officerPosts.lga.filled, d.officerPosts.lga.vacant, d.officerPosts.lga.reconciled], [20, 1, 19, true]);
  assert.deepEqual([d.officerPosts.ward.capacity, d.officerPosts.ward.filled, d.officerPosts.ward.vacant, d.officerPosts.ward.reconciled], [490, 1, 489, true]);
});

test('approving an officer gives dashboard access and sends one invitation; a problem never undoes the approval', async () => {
  const res = await register(registration({ agentCategory: 'ward_collation_officer', wardCode: '20-11' }));
  const a = await agentFor(res);
  await admin.post(`/api/admin/agents/${a._id}/checks`).set(fetchHeader).send({ cardReadable: false, face: { distance: 0.3 } });
  const approved = await admin.patch(`/api/admin/agents/${a._id}/status`).set(fetchHeader).send({ status: 'approved', notify: false });
  assert.equal(approved.status, 200);
  assert.equal(approved.body.data.officerAccess.status, 'granted');
  const user = await User.findOne({ 'assignment.agent': a._id }).lean();
  assert.deepEqual([user.role, user.assignment.wardCode, user.active], ['ward_officer', '20-11', true]);
  assert.equal(await EmailOutbox.countDocuments({ type: 'officer_invite', user: user._id }), 1);

  // An email address already used by a staff account: approval still succeeds, with a clear message.
  const clash = await register(registration({ agentCategory: 'ward_collation_officer', wardCode: '20-12', email: 'rev@test.org' }));
  const c = await agentFor(clash);
  await admin.post(`/api/admin/agents/${c._id}/checks`).set(fetchHeader).send({ cardReadable: false, face: { distance: 0.3 } });
  const second = await admin.patch(`/api/admin/agents/${c._id}/status`).set(fetchHeader).send({ status: 'approved', notify: false });
  assert.equal(second.status, 200);
  assert.equal((await Agent.findById(c._id)).status, 'approved');
  assert.equal(second.body.data.officerAccess.status, 'failed');
  assert.match(second.body.data.officerAccess.error, /Another account already uses this email address/);
  assert.equal((await User.findOne({ email: 'rev@test.org' })).role, 'reviewer', 'the staff account is untouched');
});

test('revoking an assignment emails the person; cancelling does not', async () => {
  const res = await register(registration({ agentCategory: 'agent_1', wardCode: '20-03', pollingUnitCode: '24-20-03-001' }));
  const a = await agentFor(res);
  await approve(admin, a._id);
  sent.length = 0;
  assert.equal((await admin.patch(`/api/admin/agents/${a._id}/status`).set(fetchHeader).send({ status: 'revoked', notify: true })).status, 200);
  await outbox.drainOutbox({ max: 20, now: () => new Date(Date.now() + 60e3) });
  const mail = sent.find((m) => m.to === a.email && /Assignment/.test(m.subject));
  assert.ok(mail, 'revocation email sent');
  assert.match(mail.subject, /Assignment Update/);
  assert.match(mail.text, /Your assignment as Agent 1 has been revoked/);

  const other = await agentFor(await register(registration({ agentCategory: 'agent_2', wardCode: '20-03', pollingUnitCode: '24-20-03-002' })));
  sent.length = 0;
  assert.equal((await admin.patch(`/api/admin/agents/${other._id}/status`).set(fetchHeader).send({ status: 'cancelled', notify: true })).status, 200);
  await outbox.drainOutbox({ max: 20, now: () => new Date(Date.now() + 60e3) });
  assert.equal(sent.filter((m) => m.to === other.email && /Update/.test(m.subject)).length, 0, 'no email for a cancellation');
});

test('both Ward Collation Officers of a ward get their own dashboard; revoking one frees a position', async () => {
  const a = await agentFor(await register(registration({ agentCategory: 'ward_collation_officer', lga: 'Apapa', wardCode: '05-01' })));
  const b = await agentFor(await register(registration({ agentCategory: 'ward_collation_officer', lga: 'Apapa', wardCode: '05-01' })));
  await approve(admin, a._id);
  const first = await officerSession(admin, a._id, a.email);
  await approve(admin, b._id);
  const second = await officerSession(admin, b._id, b.email);
  for (const { session } of [first, second]) {
    const d = (await session.get('/api/admin/officer/dashboard')).body.data;
    assert.equal(d.assignment.wardCode, '05-01');
  }
  // The LGA officer sees "2 of 2 filled" for that ward.
  const lgaOff = await agentFor(await register(registration({ lga: 'Apapa' })));
  await approve(admin, lgaOff._id);
  const lgaSession = (await officerSession(admin, lgaOff._id, lgaOff.email)).session;
  const ward = (await lgaSession.get('/api/admin/officer/dashboard')).body.data.wards.find((w) => w.code === '05-01');
  assert.deepEqual([ward.wardOfficer.filled, ward.wardOfficer.approved, ward.wardOfficer.seats], [2, 2, 2]);
  // Revoking one frees a position for someone new; the other keeps access.
  assert.equal((await admin.patch(`/api/admin/agents/${a._id}/status`).set(fetchHeader).send({ status: 'revoked', notify: false })).status, 200);
  assert.equal((await second.session.get('/api/admin/officer/dashboard')).status, 200);
  assert.equal((await register(registration({ agentCategory: 'ward_collation_officer', lga: 'Apapa', wardCode: '05-01' }))).status, 201);
});
