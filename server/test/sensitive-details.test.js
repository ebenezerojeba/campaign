// Sensitive financial and identity details remain feature-gated in production.
// This suite explicitly enables the path to test validation, encryption and access control.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256-signing';
process.env.RESEND_API_KEY = '';
process.env.DATA_ENCRYPTION_KEY = 'test-only-encryption-key-with-enough-entropy';

const { OPTIONAL_FIELDS } = await import('../../shared/agentForm.js');
OPTIONAL_FIELDS.financialIdentityDetails = true;

const { MongoMemoryServer } = await import('mongodb-memory-server-core');
const mongoose = (await import('mongoose')).default;
const request = (await import('supertest')).default;
const { registrationSchema } = await import('../../shared/schemas.js');
const { decryptField } = await import('../src/utils/secure.js');

let mongo;
let app;
let Agent;
let User;

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

const base = {
  firstName: 'Ngozi', lastName: 'Okafor', email: 'ngozi@example.com', phone: '08031234567',
  stateOfOrigin: 'Anambra', lgaOfOrigin: 'Onitsha North', dateOfBirth: '1990-05-17',
  agentCategory: 'agent_1', state: 'Lagos', lga: 'Surulere',
  wardCode: '20-01', pollingUnitCode: '24-20-01-001',
  bankName: 'Access Bank', accountName: 'Ngozi Okafor', accountNumber: '0123456789',
  nin: '12345678901', voterRegistrationNumber: 'AB-123-456', apcPartyCardNumber: 'APC/123456',
  ageConfirmed: true, declarationAccurate: true, consentProcessing: true, consentSensitive: true,
  consentFinancialIdentity: true,
};

function submit(data = base) {
  return request(app).post('/api/agents/register')
    .field('data', JSON.stringify(data))
    .attach('passport', png(400, 500, 10), 'passport.png')
    .attach('pvc', png(1000, 640, 90), 'pvc.png');
}

const fetchHeader = { 'X-Requested-With': 'fetch' };

before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: process.env.MONGOMS_VERSION || '7.0.14' } });
  const db = await import('../src/config/db.js');
  db.setMongoUri(mongo.getUri('apc_sensitive_test'));
  await db.connectDb();
  app = (await import('../src/app.js')).default;
  ({ Agent } = await import('../src/models/Agent.js'));
  ({ User } = await import('../src/models/User.js'));
  await Agent.syncIndexes();
  await User.create({ name: 'Admin', email: 'admin@sensitive.test', role: 'admin', passwordHash: await User.hashPassword('correct-horse-battery') });
  await User.create({ name: 'Reviewer', email: 'reviewer@sensitive.test', role: 'reviewer', passwordHash: await User.hashPassword('correct-horse-battery') });
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

async function signIn(email) {
  const agent = request.agent(app);
  const res = await agent.post('/api/admin/auth/login').set(fetchHeader).send({ email, password: 'correct-horse-battery' });
  assert.equal(res.status, 200, JSON.stringify(res.body));
  return agent;
}

test('validates exact account and NIN lengths and conservative pending ID formats', () => {
  assert.equal(registrationSchema.safeParse(base).success, true);
  for (const [key, value] of [
    ['accountNumber', '123456789'],
    ['accountNumber', '123456789a'],
    ['nin', '1234567890'],
    ['nin', '1234567890x'],
    ['voterRegistrationNumber', ''],
    ['voterRegistrationNumber', 'AB@123'],
    ['apcPartyCardNumber', ''],
    ['apcPartyCardNumber', 'APC#123'],
    ['bankName', 'Unknown Bank'],
  ]) {
    assert.equal(registrationSchema.safeParse({ ...base, [key]: value }).success, false, `${key} should reject ${value}`);
  }
  for (const key of ['bankName', 'accountName', 'accountNumber', 'nin', 'voterRegistrationNumber', 'apcPartyCardNumber', 'consentFinancialIdentity']) {
    const { [key]: _removed, ...missing } = base;
    assert.equal(registrationSchema.safeParse(missing).success, false, `${key} is required`);
  }
});

test('API rejects malformed or missing sensitive fields without echoing their values', async () => {
  const invalidCases = [
    ['accountNumber', '123456789'],
    ['accountNumber', '123456789x'],
    ['nin', '1234567890'],
    ['nin', '1234567890x'],
    ['voterRegistrationNumber', 'AB@123'],
    ['apcPartyCardNumber', 'APC#123'],
    ['bankName', 'Unlisted Bank'],
    ['accountName', ''],
  ];
  for (const [index, [field, value]] of invalidCases.entries()) {
    const email = `invalid-${index}@example.com`;
    const response = await submit({ ...base, [field]: value, email, phone: `080312340${String(index).padStart(2, '0')}` });
    assert.equal(response.status, 422, `${field}: ${JSON.stringify(response.body)}`);
    assert.ok(response.body.error.details.fields[field], `${field} should have a field-specific error`);
    if (value) assert.ok(!JSON.stringify(response.body).includes(String(value)), `${field} value must not be echoed`);
    assert.equal(Boolean(await Agent.exists({ email })), false, `${field} must not be saved`);
  }

  const { bankName: _bank, accountName: _accountName, accountNumber: _account, nin: _nin, voterRegistrationNumber: _voter, apcPartyCardNumber: _party, ...missing } = base;
  const response = await submit({ ...missing, email: 'missing@example.com', phone: '08031234100' });
  assert.equal(response.status, 422);
  for (const field of ['bankName', 'accountName', 'accountNumber', 'nin', 'voterRegistrationNumber', 'apcPartyCardNumber']) {
    assert.ok(response.body.error.details.fields[field], `${field} is required`);
  }
});

test('stores sensitive details encrypted and reveals them only to an admin with an audit entry', async () => {
  const created = await submit();
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const saved = await Agent.findOne({ reference: created.body.data.reference }).select('_id').lean();
  const record = await mongoose.connection.db.collection('agents').findOne({ _id: saved._id });
  assert.equal(record.nin.last4, '8901');
  assert.equal(decryptField(record.nin.encrypted), base.nin);
  assert.equal(decryptField(record.bankDetails.accountNameEncrypted), base.accountName);
  assert.equal(decryptField(record.bankDetails.accountNumberEncrypted), base.accountNumber);
  assert.equal(decryptField(record.identityDetails.voterRegistrationNumberEncrypted), base.voterRegistrationNumber);
  assert.equal(decryptField(record.identityDetails.apcPartyCardNumberEncrypted), base.apcPartyCardNumber);
  assert.ok(!JSON.stringify(record).includes(base.accountNumber));
  assert.ok(!JSON.stringify(record).includes(base.nin));

  const admin = await signIn('admin@sensitive.test');
  const detail = await admin.get(`/api/admin/agents/${record._id}`);
  assert.equal(detail.status, 200);
  assert.equal(detail.body.data.bankDetails.accountNumberLast4, '6789');
  assert.ok(!JSON.stringify(detail.body).includes(base.accountNumber));
  assert.ok(!JSON.stringify(detail.body).includes(base.nin));

  const reveal = await admin.post(`/api/admin/agents/${record._id}/sensitive-details`).set(fetchHeader).send({});
  assert.equal(reveal.status, 200, JSON.stringify(reveal.body));
  assert.equal(reveal.body.data.accountNumber, base.accountNumber);
  assert.equal(reveal.body.data.nin, base.nin);
  assert.equal(reveal.body.data.voterRegistrationNumber, base.voterRegistrationNumber);
  assert.equal(reveal.body.data.apcPartyCardNumber, base.apcPartyCardNumber);
  assert.equal(reveal.body.data.bankAccountVerification.status, 'not_verified');
  const audit = await mongoose.connection.db.collection('auditlogs').findOne({ action: 'agent.sensitive_details_revealed' });
  assert.ok(audit);
  assert.ok(!JSON.stringify(audit).includes(base.accountNumber));
  assert.ok(!JSON.stringify(audit).includes(base.nin));

  const reviewer = await signIn('reviewer@sensitive.test');
  const reviewerDetail = await reviewer.get(`/api/admin/agents/${record._id}`);
  assert.equal(reviewerDetail.status, 200);
  assert.equal(reviewerDetail.body.data.bankDetails, undefined);
  assert.equal(reviewerDetail.body.data.nin, undefined);
  assert.equal(reviewerDetail.body.data.dateOfBirth, undefined);
  const blocked = await reviewer.post(`/api/admin/agents/${record._id}/sensitive-details`).set(fetchHeader).send({});
  assert.equal(blocked.status, 403);
});
