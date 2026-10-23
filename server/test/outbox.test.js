// Email outbox: queuing, pacing, retries and duplicate prevention, against an
// in-memory MongoDB and a fake SMTP transporter. Nothing is ever sent.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256-signing';
process.env.DATA_ENCRYPTION_KEY = 'test-only-encryption-key-with-enough-entropy';
process.env.SMTP_HOST = 'smtp.example.org';
process.env.SMTP_PORT = '465';
process.env.SMTP_USER = 'notifications@apclagos.org';
process.env.SMTP_PASS = 'not-a-real-password';
process.env.EMAIL_FROM = 'notifications@apclagos.org';
process.env.EMAIL_FROM_NAME = 'APC Lagos';
process.env.ADMIN_NOTIFICATION_EMAIL = 'alerts@example.org';
process.env.EMAIL_MAX_PER_MINUTE = '3';
process.env.EMAIL_MAX_PER_HOUR = '150';

const { MongoMemoryServer } = await import('mongodb-memory-server-core');
const mongoose = (await import('mongoose')).default;
const request = (await import('supertest')).default;

let mongo;
let app;
let Agent;
let EmailOutbox;
let EmailState;
let outbox;
let email;
let env;

// ---------- Fake SMTP ----------
let sent;
let behaviour; // (message) => throws or returns info
const fake = {
  async sendMail(message) {
    const result = behaviour ? behaviour(message) : null;
    if (result instanceof Error) throw result;
    sent.push(message);
    return { messageId: `<${sent.length}@test>`, accepted: [message.to], rejected: [], response: '250 2.0.0 Ok: queued as TEST' };
  },
};
const smtpError = (code, responseCode, response) => Object.assign(new Error(response), { code, responseCode, response });
const RATE_LIMIT = () => smtpError('EMESSAGE', 451, '451 4.7.1 Ratelimit "hostinger_domain_out_ratelimit" exceeded for key "RLsecretkey123"');

// ---------- Fixtures ----------
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
function registration() {
  seq += 1;
  const n = String(seq).padStart(4, '0');
  return {
    firstName: 'Test', lastName: 'Applicant', email: `applicant${n}@example.com`, phone: `0803000${n}`, dateOfBirth: '1990-05-17',
    stateOfOrigin: 'Oyo', lgaOfOrigin: 'Ibadan North', agentCategory: 'agent_1', state: 'Lagos', lga: 'Surulere',
    wardCode: '20-01', pollingUnitCode: '24-20-01-001', nin: `9000000${n}`, vin: `TESTVIN${n}`, apcPartyRegistrationNumber: `LA/T/${n}`,
    bankName: 'Zenith Bank', accountName: 'Test Applicant', accountNumber: '0123456789',
    declarationAccurate: true, consentProcessing: true, consentSensitive: true, consentFinancialIdentity: true,
  };
}
const register = (data = registration()) => request(app).post('/api/agents/register').field('data', JSON.stringify(data))
  .attach('passport', png(400, 500, 10 + (seq % 200)), 'p.png').attach('pvc', png(1000, 640, 20 + (seq % 200)), 'c.png');

// Minimal saved registration, for tests that do not need the API.
async function savedAgent(overrides = {}) {
  seq += 1;
  const n = String(seq).padStart(5, '0');
  return Agent.create({
    reference: `LAG-T${n.slice(0, 3)}-${n.slice(3)}AB`, firstName: 'Test', lastName: 'Applicant', email: `saved${n}@example.com`, phone: `+23480310${n}`,
    stateOfOrigin: 'Oyo', lgaOfOrigin: 'Ibadan North', agentCategory: 'agent_2', lga: 'Surulere', ward: 'ORILE', wardCode: '20-01',
    pollingUnit: 'TEST UNIT', pollingUnitCode: '24-20-01-001', consent: { processing: true, sensitiveData: true, declarationAccurate: true }, ...overrides,
  });
}

const at = (iso) => () => new Date(iso);

before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: process.env.MONGOMS_VERSION || '7.0.14' } });
  const db = await import('../src/config/db.js');
  db.setMongoUri(mongo.getUri('apc_outbox'));
  await db.connectDb();
  app = (await import('../src/app.js')).default;
  ({ Agent } = await import('../src/models/Agent.js'));
  ({ EmailOutbox, EmailState } = await import('../src/models/EmailOutbox.js'));
  outbox = await import('../src/services/outbox.js');
  email = await import('../src/services/email.js');
  ({ env } = await import('../src/config/env.js'));
  await Promise.all([Agent.syncIndexes(), EmailOutbox.syncIndexes(), EmailState.syncIndexes()]);
});

after(async () => {
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(async () => {
  sent = [];
  behaviour = null;
  env.outbox.adminAlertMode = 'instant';
  email.setTransporterForTests(fake);
  await Promise.all([EmailOutbox.deleteMany({}), EmailState.deleteMany({})]);
});

test('a registration is saved and its emails are queued, not sent inline', async () => {
  const res = await register();
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.data.confirmationEmail, 'queued');
  assert.equal(sent.length, 0, 'nothing sent during the request');
  const entries = await EmailOutbox.find().lean();
  assert.deepEqual(entries.map((e) => e.type).sort(), ['admin_alert', 'registration_confirmation']);
  assert.ok(entries.every((e) => e.status === 'queued' && e.attempts === 0));
  assert.ok(!JSON.stringify(entries).includes('@example.com'), 'no addresses stored in the outbox');
});

test('draining delivers queued emails and records the outcome on the registration', async () => {
  const res = await register();
  const summary = await outbox.drainOutbox({ max: 5, now: at('2026-11-01T15:00:10Z') });
  assert.equal(summary.sent, 2);
  assert.deepEqual(sent.map((m) => m.to).sort(), ['alerts@example.org', sent.find((m) => m.to !== 'alerts@example.org').to].sort());
  assert.ok(sent.every((m) => m.from.address === 'notifications@apclagos.org'));
  const agent = await Agent.findOne({ reference: res.body.data.reference }).lean();
  assert.deepEqual(agent.notifications.map((n) => [n.type, n.status]).sort(), [['admin_alert', 'sent'], ['registration_confirmation', 'sent']]);
  assert.ok((await EmailOutbox.find().lean()).every((e) => e.status === 'sent' && e.sentAt));
});

test('the registration still succeeds when emails cannot even be queued', async () => {
  const original = EmailOutbox.insertMany;
  EmailOutbox.insertMany = async () => { throw Object.assign(new Error('db write failed'), { code: 99 }); };
  try {
    const data = registration();
    const res = await register(data);
    assert.equal(res.status, 201);
    assert.equal(res.body.data.confirmationEmail, 'failed');
    assert.ok(await Agent.exists({ email: data.email }), 'registration saved');
  } finally {
    EmailOutbox.insertMany = original;
  }
});

test('SMTP 451 rate limiting: retried later with backoff, sending paused, reason kept without the provider key', async () => {
  const agent = await savedAgent();
  await outbox.queueRegistrationEmails(agent);
  behaviour = RATE_LIMIT;
  const first = await outbox.drainOutbox({ max: 5, now: at('2026-11-01T15:00:00Z') });
  assert.equal(first.retry, 1);
  assert.equal(first.stoppedBy, 'paused', 'stops at the first rate-limit refusal');
  const entry = await EmailOutbox.findOne({ type: 'registration_confirmation' }).lean();
  assert.equal(entry.status, 'queued');
  assert.equal(entry.attempts, 1);
  assert.equal(entry.nextAttemptAt.toISOString(), '2026-11-01T15:05:00.000Z');
  assert.equal(entry.smtpCode, 451);
  assert.equal(entry.smtpReason, '451 4.7.1 Ratelimit "hostinger_domain_out_ratelimit" exceeded');
  assert.ok(!JSON.stringify(entry).includes('RLsecretkey123'));

  behaviour = null;
  const paused = await outbox.drainOutbox({ max: 5, now: at('2026-11-01T15:02:00Z') });
  assert.equal(paused.stoppedBy, 'paused');
  assert.equal(sent.length, 0, 'nothing sent during the pause');

  const later = await outbox.drainOutbox({ max: 5, now: at('2026-11-01T15:06:00Z') });
  assert.equal(later.sent, 2);
  assert.equal((await EmailOutbox.findOne({ type: 'registration_confirmation' }).lean()).status, 'sent');
});

test('permanent rejection (5xx) is not retried and is recorded for recovery', async () => {
  const agent = await savedAgent();
  await outbox.queueRegistrationEmails(agent);
  behaviour = (m) => (m.to === agent.email ? smtpError('EENVELOPE', 550, '550 5.1.1 mailbox unavailable') : null);
  await outbox.drainOutbox({ max: 5, now: at('2026-11-01T16:00:00Z') });
  const entry = await EmailOutbox.findOne({ type: 'registration_confirmation' }).lean();
  assert.equal(entry.status, 'failed');
  assert.equal(entry.attempts, 1);
  const again = await outbox.drainOutbox({ max: 5, now: at('2026-11-01T23:00:00Z') });
  assert.equal(again.stoppedBy, 'empty');
  const saved = await Agent.findById(agent._id).lean();
  assert.ok(saved.notifications.some((n) => n.type === 'registration_confirmation' && n.status === 'failed'));
});

test('temporary failures stop after the maximum number of attempts', async () => {
  const agent = await savedAgent();
  await outbox.queueRegistrationEmails(agent);
  await EmailOutbox.deleteOne({ type: 'admin_alert' });
  behaviour = () => smtpError('ETIMEDOUT', undefined, 'timeout');
  let clock = new Date('2026-10-24T00:00:00Z').getTime();
  for (let i = 0; i < 10; i += 1) {
    await outbox.drainOutbox({ max: 1, now: () => new Date(clock) });
    clock += 7 * 3600e3; // past every backoff delay and pause
  }
  const entry = await EmailOutbox.findOne({ type: 'registration_confirmation' }).lean();
  assert.equal(entry.status, 'failed');
  assert.equal(entry.attempts, outbox.MAX_ATTEMPTS);
});

test('no duplicates: re-queuing is ignored and concurrent senders send each email once', async () => {
  const agent = await savedAgent();
  await outbox.queueRegistrationEmails(agent);
  await outbox.queueRegistrationEmails(agent);
  assert.equal(await EmailOutbox.countDocuments(), 2);
  const now = at('2026-10-25T10:00:00Z');
  await Promise.all([1, 2, 3, 4].map(() => outbox.drainOutbox({ max: 5, now })));
  assert.equal(sent.length, 2, 'each email sent exactly once');
  assert.equal(await EmailOutbox.countDocuments({ status: 'sent' }), 2);
  const saved = await Agent.findById(agent._id).lean();
  assert.equal(saved.notifications.length, 2, 'one recorded outcome per email');
});

test('pacing: never more than the per-minute budget, and unsent emails keep their attempts', async () => {
  for (let i = 0; i < 3; i += 1) await outbox.queueRegistrationEmails(await savedAgent());
  const summary = await outbox.drainOutbox({ max: 10, now: at('2026-10-25T11:00:05Z') });
  assert.equal(summary.sent, 3);
  assert.equal(summary.stoppedBy, 'budget');
  const waiting = await EmailOutbox.find({ status: 'queued' }).lean();
  assert.equal(waiting.length, 3);
  assert.ok(waiting.every((e) => e.attempts === 0), 'budget refusal does not use an attempt');
  const next = await outbox.drainOutbox({ max: 10, now: at('2026-10-25T11:01:05Z') });
  assert.equal(next.sent, 3);
});

test('confirmations are sent before admin alerts', async () => {
  for (let i = 0; i < 2; i += 1) await outbox.queueRegistrationEmails(await savedAgent());
  await outbox.drainOutbox({ max: 2, now: at('2026-10-25T12:00:00Z') });
  assert.ok(sent.every((m) => m.to !== 'alerts@example.org'));
});

test('a deleted registration cancels its queued emails', async () => {
  const agent = await savedAgent();
  await outbox.queueRegistrationEmails(agent);
  await Agent.deleteOne({ _id: agent._id });
  await outbox.drainOutbox({ max: 5, now: at('2026-10-25T13:00:00Z') });
  assert.equal(sent.length, 0);
  assert.equal(await EmailOutbox.countDocuments({ status: 'cancelled' }), 2);
});

test('digest mode (off by default) replaces per-registration alerts with one hourly summary', async () => {
  assert.equal(env.outbox.adminAlertMode, 'instant');
  env.outbox.adminAlertMode = 'digest';
  await savedAgent({ createdAt: new Date('2026-10-26T09:10:00Z') });
  const second = await savedAgent({ createdAt: new Date('2026-10-26T09:40:00Z') });
  await outbox.queueRegistrationEmails(second);
  assert.equal(await EmailOutbox.countDocuments({ type: 'admin_alert' }), 0);
  await outbox.drainOutbox({ max: 5, now: at('2026-10-26T10:00:30Z') });
  await outbox.drainOutbox({ max: 5, now: at('2026-10-26T10:05:30Z') });
  const digests = sent.filter((m) => m.to === 'alerts@example.org');
  assert.equal(digests.length, 1);
  assert.match(digests[0].subject, /^APC Lagos: Registration Summary \(2 new\)$/);
  assert.ok(!/Test Applicant|saved\d+@/.test(digests[0].text), 'no personal details in the summary');
});

test('diagnostics report counts, pause state and the latest refusal without personal data', async () => {
  const agent = await savedAgent();
  await outbox.queueRegistrationEmails(agent);
  behaviour = RATE_LIMIT;
  await outbox.drainOutbox({ max: 5, now: () => new Date() });
  const status = await outbox.outboxStatus();
  assert.equal(status.counts.registration_confirmation.queued, 1);
  assert.equal(status.pauseReason, 'rateLimited');
  assert.equal(status.recentRefusals[0].code, 451);
  assert.ok(!JSON.stringify(status).includes('@example.com'));
});
