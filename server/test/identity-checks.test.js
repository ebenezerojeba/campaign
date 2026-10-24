// Voter's card and face checks: the matching rules, and how results are
// recorded and used. In-memory MongoDB; nothing is sent anywhere.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

process.env.NODE_ENV = 'test';
process.env.POSITION_RULE = 'off';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256-signing';
process.env.DATA_ENCRYPTION_KEY = 'test-only-encryption-key-with-enough-entropy';

const { MongoMemoryServer } = await import('mongodb-memory-server-core');
const mongoose = (await import('mongoose')).default;
const request = (await import('supertest')).default;
const card = await import('../../shared/cardCheck.js');

let mongo;
let app;
let Agent;
let User;
let IdentityCheck;
const fetchHeader = { 'X-Requested-With': 'fetch' };
const VIN = '90F5B0D5D829538698 7'.replace(/ /g, '').slice(0, 19); // 19 characters

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
const registration = (overrides = {}) => {
  seq += 1;
  const n = String(seq).padStart(4, '0');
  return {
    firstName: 'Adaeze', lastName: 'Okonkwo', email: `idc${n}@example.com`, phone: `0807000${n}`, dateOfBirth: '1990-05-17',
    stateOfOrigin: 'Oyo', lgaOfOrigin: 'Ibadan North', agentCategory: 'agent_1', state: 'Lagos', lga: 'Surulere',
    wardCode: '20-01', pollingUnitCode: '24-20-01-001', nin: `7300000${n}`, vin: `${VIN.slice(0, 15)}${n}`, apcPartyRegistrationNumber: `LA/I/${n}`,
    bankName: 'Zenith Bank', accountName: 'Adaeze Okonkwo', accountNumber: '0123456789',
    declarationAccurate: true, consentProcessing: true, consentSensitive: true, consentFinancialIdentity: true,
    ...overrides,
  };
};
const register = (data) => request(app).post('/api/agents/register').field('data', JSON.stringify(data))
  .attach('passport', png(400, 500, 40 + seq), 'p.png').attach('pvc', png(1000, 640, 120 + seq), 'c.png');

let admin;
before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: process.env.MONGOMS_VERSION || '7.0.14' } });
  const db = await import('../src/config/db.js');
  db.setMongoUri(mongo.getUri('apc_checks'));
  await db.connectDb();
  app = (await import('../src/app.js')).default;
  ({ Agent } = await import('../src/models/Agent.js'));
  ({ User } = await import('../src/models/User.js'));
  ({ IdentityCheck } = await import('../src/models/IdentityCheck.js'));
  await Promise.all([Agent.syncIndexes(), User.syncIndexes(), IdentityCheck.syncIndexes()]);
  await User.create({ name: 'Admin', email: 'admin@test.org', role: 'admin', passwordHash: await User.hashPassword('correct-horse-battery') });
  const email = await import('../src/services/email.js');
  email.setTransporterForTests({ async sendMail(m) { return { messageId: '<x@test>', accepted: [m.to], rejected: [], response: '250 OK' }; } });
  admin = request.agent(app);
  await admin.post('/api/admin/auth/login').set(fetchHeader).send({ email: 'admin@test.org', password: 'correct-horse-battery' });
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

test('reads a VIN from card text, with spaces, a label and look-alike characters', () => {
  const text = `INDEPENDENT NATIONAL ELECTORAL COMMISSION\nVIN: 90F5 B0D5 D829 5386 987\nNAME OKONKWO ADAEZE\nDOB 17-05-1990`;
  const candidates = card.vinCandidates(text);
  assert.ok(candidates.includes('90F5B0D5D8295386987'));
  assert.equal(card.compareVin('90F5B0D5D8295386987', candidates).result, 'match');
  assert.equal(card.compareVin('9OF5BOD5D8295386987', candidates).result, 'match', 'O typed for 0 still matches');
  assert.equal(card.compareVin('90F5B0D5D8295386981', candidates).result, 'close', 'one character differs');
  assert.equal(card.compareVin('11A1111111111111111', candidates).result, 'mismatch');
  assert.equal(card.compareVin('90F5B0D5D8295386987', []).result, 'unreadable');
  // Noise from a poor photo is never reported as a mismatch.
  assert.equal(card.compareVin('90F5B0D5D8295386987', ['OKONKWOADAEZEVOTER1', 'COMMISSIONVOTERSCAR', 'AB12CD34EF']).result, 'unreadable');
  // A VIN-shaped reading only a few characters off is too uncertain to call either way.
  assert.equal(card.compareVin('90F5B0D5D8295386987', ['90F5B0D5D8295300000']).result, 'unreadable');
  assert.equal(card.nameFound(text, 'Okonkwo'), true);
  assert.equal(card.nameFound(text, 'Okonkwa'), true, 'one misread letter allowed for longer names');
  assert.equal(card.nameFound(text, 'Bello'), false);
  assert.equal(card.dateFound(text, '1990-05-17'), true);
  assert.equal(card.dateFound(text, '1991-05-17'), false);
  assert.equal(card.faceResult(0.4), 'match');
  assert.equal(card.faceResult(0.55), 'uncertain');
  assert.equal(card.faceResult(0.7), 'uncertain', 'printed card photos push distances up');
  assert.equal(card.faceResult(0.8), 'different');
  assert.equal(card.faceResult(null), 'no_face');
});

test('the applicant check is stored apart from the registration, as information only', async () => {
  const data = registration({ cardCheck: { vin: 'close', applicantConfirmed: true } });
  const res = await register(data);
  assert.equal(res.status, 201);
  const a = await Agent.findOne({ reference: res.body.data.reference }).lean();
  assert.equal(a.cardCheck, undefined, 'not part of the registration');
  const stored = await IdentityCheck.findOne({ agent: a._id }).lean();
  assert.deepEqual([stored.source, stored.vin.result, stored.vin.applicantConfirmed, stored.flagged], ['applicant', 'close', true, false], 'a confirmed near-miss is information, not a flag');
});

test('reviewer check: the server compares the VIN; no VIN or card text is stored or returned', async () => {
  const data = registration();
  const res = await register(data);
  const a = await Agent.findOne({ reference: res.body.data.reference }).lean();
  const ok = await admin.post(`/api/admin/agents/${a._id}/checks`).set(fetchHeader).send({ cardReadable: true, vinCandidates: ['GARBAGE123', data.vin], nameFound: true, dateOfBirthFound: true, face: { distance: 0.42 } });
  assert.equal(ok.status, 200);
  assert.equal(ok.body.data.reviewer.vin.result, 'match');
  assert.equal(ok.body.data.reviewer.face.result, 'match');
  assert.equal(ok.body.data.reviewer.flagged, false);
  const stored = JSON.stringify(await IdentityCheck.find({ agent: a._id }).lean());
  assert.ok(!stored.includes(data.vin) && !stored.includes('GARBAGE123'), 'VIN and card text never stored');
  assert.ok(!JSON.stringify(ok.body).includes(data.vin), 'VIN never returned');
  const detail = (await admin.get(`/api/admin/agents/${a._id}`)).body.data;
  assert.equal(detail.checks.reviewer.vin.result, 'match');
});

test('approval needs a check, and a reason when the check raised a flag', async () => {
  const data = registration();
  const res = await register(data);
  const a = await Agent.findOne({ reference: res.body.data.reference }).lean();
  const approve = (reason) => admin.patch(`/api/admin/agents/${a._id}/status`).set(fetchHeader).send({ status: 'approved', reason, notify: false });

  assert.equal((await approve('')).body.error.code, 'CHECK_REQUIRED');
  await admin.post(`/api/admin/agents/${a._id}/checks`).set(fetchHeader).send({ cardReadable: true, vinCandidates: ['11A1111111111111111'], face: { distance: 0.9 } });
  const flagged = await approve('');
  assert.equal(flagged.status, 422);
  assert.match(flagged.body.error.details.fields.reason, /raised a flag/);
  assert.equal((await approve('Card checked by eye; photo is old')).status, 200);
});

test('reviewers without the review permission cannot record checks; malformed input is refused', async () => {
  const res = await register(registration());
  const a = await Agent.findOne({ reference: res.body.data.reference }).lean();
  assert.equal((await request(app).post(`/api/admin/agents/${a._id}/checks`).set(fetchHeader).send({ cardReadable: true, face: {} })).status, 401);
  const bad = await admin.post(`/api/admin/agents/${a._id}/checks`).set(fetchHeader).send({ cardReadable: true, vinCandidates: Array(20).fill('X'), face: {} });
  assert.equal(bad.status, 422);
});
