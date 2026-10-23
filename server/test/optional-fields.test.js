// NIN and selfie are off by default (shared/agentForm.js). This file enables
// them to prove those optional paths work before anyone turns them on.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256-signing';
process.env.SMTP_HOST = ""; // never send real email from tests
process.env.DATA_ENCRYPTION_KEY = 'test-only-encryption-key-with-enough-entropy';

const { OPTIONAL_FIELDS } = await import('../../shared/agentForm.js');
Object.assign(OPTIONAL_FIELDS, { selfie: true });

const { MongoMemoryServer } = await import('mongodb-memory-server-core');
const mongoose = (await import('mongoose')).default;
const request = (await import('supertest')).default;

let mongo;
let app;
let Agent;

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
  firstName: 'Tunde', lastName: 'Bello', email: 'tunde@example.com', phone: '08035550000',
  stateOfOrigin: 'Oyo', lgaOfOrigin: 'Ibadan North', agentCategory: 'agent_2', state: 'Lagos', lga: 'Ikeja',
  wardCode: '11-01', pollingUnitCode: '24-11-01-001', dateOfBirth: '1990-05-17', nin: '12345678901',
  vin: '90F5B0D1234567890AB', apcPartyRegistrationNumber: 'LA-IKJ-778', bankName: 'Access Bank', accountName: 'Tunde Bello', accountNumber: '0987654321',
  declarationAccurate: true, consentProcessing: true, consentSensitive: true, consentFinancialIdentity: true,
};

const submit = (data, { selfie = true, shade = 60 } = {}) => {
  const req = request(app).post('/api/agents/register').field('data', JSON.stringify(data))
    .attach('passport', png(400, 500, 10), 'p.png').attach('pvc', png(1000, 640, shade), 'c.png');
  if (selfie) req.attach('selfie', png(500, 600, 200), 's.png');
  return req;
};

before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: process.env.MONGOMS_VERSION || '7.0.14' } });
  const db = await import('../src/config/db.js');
  db.setMongoUri(mongo.getUri('apc_opt'));
  await db.connectDb();
  app = (await import('../src/app.js')).default;
  ({ Agent } = await import('../src/models/Agent.js'));
  await Agent.syncIndexes();
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

test('registers an Agent 2 with date of birth, encrypted NIN and the optional selfie switched on', async () => {
  const res = await submit(base);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const raw = await mongoose.connection.db.collection('agents').findOne({ reference: res.body.data.reference });
  assert.equal(raw.agentCategory, 'agent_2');
  assert.equal(raw.dateOfBirth.toISOString(), '1990-05-17T00:00:00.000Z');
  assert.equal(raw.nin.last4, '8901');
  assert.ok(!JSON.stringify(raw).includes('12345678901'), 'NIN is never stored in clear');
  assert.ok(raw.documents.selfie.fileId);
  const { decryptField } = await import('../src/utils/secure.js');
  assert.equal(decryptField(raw.nin.encrypted), '12345678901');
});

test('validates date of birth, NIN format, duplicate NIN and the switched-on selfie', async () => {
  const future = await submit({ ...base, phone: '08035550001', email: 'b@example.com', vin: 'OTHERVIN12345', dateOfBirth: '2999-01-01' }, { shade: 61 });
  assert.match(future.body.error.details.fields.dateOfBirth, /future/);
  const badNin = await submit({ ...base, phone: '08035550001', email: 'b@example.com', nin: '12345' }, { shade: 61 });
  assert.ok(badNin.body.error.details.fields.nin);
  const noSelfie = await submit({ ...base, phone: '08035550001', email: 'b@example.com' }, { selfie: false, shade: 61 });
  assert.ok(noSelfie.body.error.details.fields.selfie);
  const dupNin = await submit({ ...base, phone: '08035550001', email: 'b@example.com' }, { shade: 61 });
  assert.equal(dupNin.status, 409);
});
