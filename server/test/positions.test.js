// One Agent 1 and one Agent 2 per polling unit, plus the hardening that came
// with it (generic duplicate message, password change, CAPTCHA switch).
// In-memory MongoDB and a fake SMTP transporter: nothing is ever sent.
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

const { MongoMemoryServer } = await import('mongodb-memory-server-core');
const mongoose = (await import('mongoose')).default;
const request = (await import('supertest')).default;

let mongo;
let app;
let Agent;
let Position;
let User;
let positions;
let captcha;
let env;

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
    firstName: 'Test', lastName: 'Applicant', email: `pos${n}@example.com`, phone: `0805000${n}`, dateOfBirth: '1990-05-17',
    stateOfOrigin: 'Oyo', lgaOfOrigin: 'Ibadan North', agentCategory: 'agent_1', state: 'Lagos', lga: 'Surulere',
    wardCode: '20-01', pollingUnitCode: '24-20-01-002', nin: `7100000${n}`, vin: `POSVIN${n}`, apcPartyRegistrationNumber: `LA/P/${n}`,
    bankName: 'Zenith Bank', accountName: 'Test Applicant', accountNumber: '0123456789',
    declarationAccurate: true, consentProcessing: true, consentSensitive: true, consentFinancialIdentity: true,
    ...overrides,
  };
}
const register = (data) => request(app).post('/api/agents/register').field('data', JSON.stringify(data))
  .attach('passport', png(400, 500, (seq * 7) % 250), 'p.png').attach('pvc', png(1000, 640, (seq * 13) % 250), 'c.png');

// Saved directly, as registrations made before the rule existed.
async function legacy(overrides = {}) {
  seq += 1;
  const n = String(seq).padStart(5, '0');
  return Agent.create({
    reference: `LAG-L${n.slice(0, 3)}-${n.slice(3)}CD`, firstName: 'Legacy', lastName: 'Agent', email: `legacy${n}@example.com`, phone: `+23480420${n}`,
    stateOfOrigin: 'Oyo', lgaOfOrigin: 'Ibadan North', agentCategory: 'agent_1', lga: 'Surulere', ward: 'ORILE', wardCode: '20-01',
    pollingUnit: 'TEST UNIT', pollingUnitCode: '24-20-01-010', consent: { processing: true, sensitiveData: true, declarationAccurate: true }, ...overrides,
  });
}

async function signIn(email, password = 'correct-horse-battery') {
  const agent = request.agent(app);
  const res = await agent.post('/api/admin/auth/login').set(fetchHeader).send({ email, password });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return agent;
}
const setStatus = (admin, id, status) => admin.patch(`/api/admin/agents/${id}/status`).set(fetchHeader).send({ status, notify: false });

before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: process.env.MONGOMS_VERSION || '7.0.14' } });
  const db = await import('../src/config/db.js');
  db.setMongoUri(mongo.getUri('apc_positions'));
  await db.connectDb();
  app = (await import('../src/app.js')).default;
  ({ Agent } = await import('../src/models/Agent.js'));
  ({ Position } = await import('../src/models/Position.js'));
  ({ User } = await import('../src/models/User.js'));
  positions = await import('../src/services/positions.js');
  captcha = await import('../src/services/captcha.js');
  ({ env } = await import('../src/config/env.js'));
  await Promise.all([Agent.syncIndexes(), Position.syncIndexes(), User.syncIndexes()]);
  await User.create({ name: 'Admin', email: 'admin@test.org', role: 'admin', passwordHash: await User.hashPassword('correct-horse-battery') });
  const email = await import('../src/services/email.js');
  email.setTransporterForTests({ async sendMail(m) { return { messageId: '<x@test>', accepted: [m.to], rejected: [], response: '250 OK' }; } });
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  await Promise.all([Agent.deleteMany({}), Position.deleteMany({}), mongoose.connection.db.collection('ratelimits').deleteMany({})]);
});

test('one Agent 1 and one Agent 2 per polling unit; the second applicant for a position is refused', async () => {
  assert.equal((await register(registration())).status, 201);
  const second = await register(registration());
  assert.equal(second.status, 422);
  assert.match(fieldsOf(second).agentCategory, /Agent 1 position at this polling unit has already been filled/);
  assert.equal((await register(registration({ agentCategory: 'agent_2' }))).status, 201, 'Agent 2 is a separate position');
  assert.equal((await register(registration({ pollingUnitCode: '24-20-01-003' }))).status, 201, 'another polling unit is free');
  assert.equal(await Agent.countDocuments(), 3);
});

test('simultaneous submissions for one position: exactly one succeeds', async () => {
  const results = await Promise.all(Array.from({ length: 20 }, () => register(registration({ pollingUnitCode: '24-20-01-004' }))));
  const codes = results.map((r) => r.status);
  assert.equal(codes.filter((c) => c === 201).length, 1, codes.join(','));
  assert.equal(codes.filter((c) => c === 422).length, 19);
  assert.equal(await Agent.countDocuments({ pollingUnitCode: '24-20-01-004' }), 1);
});

test('a failed save gives the position back', async () => {
  await register(registration({ phone: '08059999999', email: 'first@example.com', pollingUnitCode: '24-20-01-005' }));
  // Same phone: refused as a duplicate before any position is taken.
  const dup = await register(registration({ phone: '08059999999', pollingUnitCode: '24-20-01-006' }));
  assert.equal(dup.status, 409);
  assert.equal(await Position.countDocuments({ _id: /24-20-01-006/ }), 0);
  assert.equal((await register(registration({ pollingUnitCode: '24-20-01-006' }))).status, 201);
});

test('declining or cancelling releases the position; reinstating needs it to be free', async () => {
  const admin = await signIn('admin@test.org');
  const first = await register(registration({ pollingUnitCode: '24-20-01-007' }));
  const firstId = (await Agent.findOne({ reference: first.body.data.reference }))._id;

  assert.equal((await setStatus(admin, firstId, 'cancelled')).status, 200);
  const next = await register(registration({ pollingUnitCode: '24-20-01-007' }));
  assert.equal(next.status, 201, 'a cancelled registration frees the position');

  const back = await setStatus(admin, firstId, 'pending');
  assert.equal(back.status, 409);
  assert.equal(back.body.error.code, 'POSITION_TAKEN');
  assert.match(back.body.error.message, new RegExp(next.body.data.reference));
  assert.equal((await Agent.findById(firstId)).status, 'cancelled', 'nothing changed');
});

test('existing conflicts are never changed: the approved (or earliest) registration holds, the others wait for review', async () => {
  const admin = await signIn('admin@test.org');
  const early = await legacy({ createdAt: new Date('2026-10-22T08:00:00Z') });
  const late = await legacy({ createdAt: new Date('2026-10-22T09:00:00Z') });
  const latest = await legacy({ createdAt: new Date('2026-10-22T10:00:00Z') });

  // A new applicant for the contested position is refused.
  assert.equal((await register(registration({ pollingUnitCode: '24-20-01-010' }))).status, 422);

  // Only the holder can be approved.
  const blocked = await setStatus(admin, late._id, 'approved');
  assert.equal(blocked.status, 409);
  assert.match(blocked.body.error.message, new RegExp(early.reference));
  assert.equal((await setStatus(admin, early._id, 'approved')).status, 200);

  const conflicts = (await admin.get('/api/admin/positions/conflicts')).body.data;
  assert.equal(conflicts.total, 1);
  assert.equal(conflicts.surplus, 2);
  const [item] = conflicts.items;
  assert.deepEqual(item.registrations.map((r) => [r.reference, r.holder]), [[early.reference, true], [late.reference, false], [latest.reference, false]]);
  const detail = (await admin.get(`/api/admin/agents/${late._id}`)).body.data;
  assert.deepEqual([detail.position.state, detail.position.holderReference], ['conflict', early.reference]);

  // Declining the holder passes the position to the next registration in line.
  assert.equal((await setStatus(admin, early._id, 'rejected')).status, 200);
  assert.equal((await setStatus(admin, late._id, 'approved')).status, 200);
  assert.equal((await setStatus(admin, latest._id, 'approved')).status, 409);
  // Nothing was deleted or moved.
  assert.equal(await Agent.countDocuments({ pollingUnitCode: '24-20-01-010' }), 3);
});

test('public polling-unit list shows which positions are filled, never who holds them', async () => {
  await register(registration({ pollingUnitCode: '24-20-01-011' }));
  const res = await request(app).get('/api/locations/polling-units?state=Lagos&lga=Surulere&ward=20-01');
  const unit = res.body.data.find((u) => u.code === '24-20-01-011');
  assert.deepEqual(unit.taken, ['agent_1']);
  assert.ok(!JSON.stringify(res.body).includes('pos'), 'no applicant data');
  assert.deepEqual(res.body.data.find((u) => u.code === '24-20-01-012').taken, []);
});

test('the rule can be switched off', async () => {
  env.positionRule = 'off';
  try {
    assert.equal((await register(registration({ pollingUnitCode: '24-20-01-013' }))).status, 201);
    assert.equal((await register(registration({ pollingUnitCode: '24-20-01-013' }))).status, 201);
  } finally {
    env.positionRule = 'on';
  }
});

test('every kind of duplicate gets the same message, revealing nothing about which detail matched', async () => {
  const base = registration({ pollingUnitCode: '24-20-01-020' });
  assert.equal((await register(base)).status, 201);
  const sameNin = await register(registration({ nin: base.nin, pollingUnitCode: '24-20-01-021' }));
  const sameVin = await register(registration({ vin: base.vin, pollingUnitCode: '24-20-01-022' }));
  const samePhone = await register(registration({ phone: base.phone, pollingUnitCode: '24-20-01-023' }));
  const sameEmail = await register(registration({ email: base.email, pollingUnitCode: '24-20-01-024' }));
  const bodies = [sameNin, sameVin, samePhone, sameEmail].map((r) => [r.status, JSON.stringify(r.body)]);
  assert.equal(new Set(bodies.map((b) => b.join())).size, 1, 'identical responses');
  assert.equal(bodies[0][0], 409);
});

test('staff can change their password; other sessions end and the old password stops working', async () => {
  await User.create({ name: 'Reviewer', email: 'pw@test.org', role: 'reviewer', passwordHash: await User.hashPassword('correct-horse-battery') });
  const other = await signIn('pw@test.org');
  const me = await signIn('pw@test.org');
  const wrong = await me.post('/api/admin/auth/password').set(fetchHeader).send({ currentPassword: 'nope', newPassword: 'a-brand-new-passphrase' });
  assert.equal(wrong.status, 422);
  assert.ok(fieldsOf(wrong).currentPassword);
  const short = await me.post('/api/admin/auth/password').set(fetchHeader).send({ currentPassword: 'correct-horse-battery', newPassword: 'short' });
  assert.equal(short.status, 422);
  const ok = await me.post('/api/admin/auth/password').set(fetchHeader).send({ currentPassword: 'correct-horse-battery', newPassword: 'a-brand-new-passphrase' });
  assert.equal(ok.status, 200);
  assert.equal((await me.get('/api/admin/auth/me')).status, 200, 'this session continues');
  assert.equal((await other.get('/api/admin/auth/me')).status, 401, 'other sessions end');
  assert.equal((await request(app).post('/api/admin/auth/login').set(fetchHeader).send({ email: 'pw@test.org', password: 'correct-horse-battery' })).status, 401);
  await signIn('pw@test.org', 'a-brand-new-passphrase');
});

test('CAPTCHA: off without keys; when on, a missing or failed token is refused and an outage is allowed', async () => {
  assert.equal(captcha.captchaEnabled(), false);
  assert.equal((await request(app).get('/api/config')).body.data.captchaSiteKey, '');
  Object.assign(env.captcha, { siteKey: 'site', secretKey: 'secret' });
  try {
    assert.equal((await captcha.verifyCaptcha(undefined, '1.2.3.4')).ok, false);
    const reply = (success) => async () => ({ json: async () => ({ success }) });
    assert.equal((await captcha.verifyCaptcha('tok', '1.2.3.4', reply(true))).ok, true);
    assert.equal((await captcha.verifyCaptcha('tok', '1.2.3.4', reply(false))).ok, false);
    assert.equal((await captcha.verifyCaptcha('tok', '1.2.3.4', async () => { throw new Error('down'); })).ok, true);
    const res = await register(registration({ pollingUnitCode: '24-20-01-030' }));
    assert.equal(res.status, 400);
    assert.equal(res.body.error.code, 'CAPTCHA_FAILED');
    assert.equal(await Agent.countDocuments(), 0, 'nothing saved');
    const lookup = await request(app).post('/api/agents/status').send({ reference: 'LAG-AAAA-BBBB', phone: '08050000001' });
    assert.equal(lookup.status, 400);
  } finally {
    Object.assign(env.captcha, { siteKey: '', secretKey: '' });
  }
});

test('unexpected errors are logged without personal values', async () => {
  const { safeError } = await import('../src/middleware/index.js');
  const err = Object.assign(new Error('E11000 duplicate key error collection: agents index: email_1 dup key: { email: "someone@example.com" } phone 08031234567'), { code: 11000 });
  const logged = JSON.stringify(safeError(err));
  assert.ok(!logged.includes('someone@example.com'));
  assert.ok(!logged.includes('08031234567'));
  assert.match(logged, /E11000/);
});

test('rate limits are counted in the shared database, so they hold across server instances', async () => {
  process.env.RATE_LIMITS_IN_TESTS = '1';
  try {
    const lookup = () => request(app).post('/api/agents/status').set('X-Forwarded-For', '192.0.2.44').send({ reference: 'LAG-AAAA-BBBB', phone: '08050000001' });
    for (let i = 0; i < 40; i += 1) assert.equal((await lookup()).status, 404);
    assert.equal((await lookup()).status, 429);
    const stored = await mongoose.connection.db.collection('ratelimits').find({ _id: /^lookup:/ }).toArray();
    assert.equal(stored.length, 1);
    assert.equal(stored[0].hits, 41);
    assert.ok(!stored[0]._id.includes('192.0.2.44'), 'the address is stored hashed');
    // A second app instance reading the same database sees the same count.
    const { createApp } = await import('../src/app.js');
    assert.equal((await request(createApp()).post('/api/agents/status').set('X-Forwarded-For', '192.0.2.44').send({ reference: 'LAG-AAAA-BBBB', phone: '08050000001' })).status, 429);
  } finally {
    delete process.env.RATE_LIMITS_IN_TESTS;
  }
});
