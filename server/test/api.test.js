// Integration tests: real Express app against an in-memory MongoDB.
//   npm test
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import zlib from 'node:zlib';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256-signing';
process.env.RESEND_API_KEY = ''; // never send real email from tests
process.env.ADMIN_NOTIFICATION_EMAIL = 'alerts@example.org';
process.env.DEMO_MODE = '';

const { MongoMemoryServer } = await import('mongodb-memory-server-core');
const mongoose = (await import('mongoose')).default;
const request = (await import('supertest')).default;
const { roleSchema } = await import('../../shared/schemas.js');

let mongo;
let app;
let User;
let Agent;

// ---------- Test files built in memory ----------

function pngChunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, 'latin1'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(zlib.crc32(body));
  return Buffer.concat([len, body, crc]);
}

// A real, decodable greyscale PNG of the given size (shade varies the bytes).
function png(width, height, { shade = 128, text } = {}) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 0; // greyscale
  const raw = Buffer.alloc((width + 1) * height, shade);
  for (let y = 0; y < height; y += 1) raw[y * (width + 1)] = 0; // filter byte per row
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    pngChunk('IHDR', ihdr),
    ...(text ? [pngChunk('tEXt', Buffer.from(`Comment\0${text}`, 'latin1'))] : []),
    pngChunk('IDAT', zlib.deflateSync(raw)),
    pngChunk('IEND', Buffer.alloc(0)),
  ]);
}

const pdf = (extra = '') => Buffer.from(`%PDF-1.4\n1 0 obj << /Type /Catalog ${extra} >> endobj\ntrailer << /Root 1 0 R >>\n%%EOF\n`, 'latin1');

const passport = png(400, 500, { text: 'GPS 6.5244,3.3792' });
const pvcImage = (shade = 90) => png(1000, 640, { shade });

const valid = {
  firstName: 'Ngozi', middleName: '', lastName: 'Okafor', email: 'ngozi@example.com', phone: '0803 123 4567',
  stateOfOrigin: 'Anambra', lgaOfOrigin: 'Onitsha North',
  dateOfBirth: '1990-05-17', agentCategory: 'pu_agent', state: 'Lagos', lga: 'Surulere', wardCode: '20-01', pollingUnitCode: '24-20-01-001',
  ageConfirmed: true, declarationAccurate: true, consentProcessing: true, consentSensitive: true,
};

// Sends a registration as the browser does: JSON fields in "data" plus files.
function submit(data, files = {}) {
  const req = request(app).post('/api/agents/register').field('data', JSON.stringify(data));
  const all = { passport: [passport, 'passport.png'], pvc: [pvcImage(), 'pvc.png'], ...files };
  for (const [name, file] of Object.entries(all)) if (file) req.attach(name, file[0], file[1]);
  return req;
}

const fetchHeader = { 'X-Requested-With': 'fetch' };

before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: process.env.MONGOMS_VERSION || '7.0.14' } });
  process.env.MONGODB_URI = mongo.getUri('apc_test');
  const db = await import('../src/config/db.js');
  db.setMongoUri(process.env.MONGODB_URI);
  await db.connectDb();
  app = (await import('../src/app.js')).default;
  ({ User } = await import('../src/models/User.js'));
  ({ Agent } = await import('../src/models/Agent.js'));
  await Agent.syncIndexes();
  await User.create({ name: 'Admin', email: 'admin@test.org', role: 'admin', passwordHash: await User.hashPassword('correct-horse-battery') });
  await User.create({ name: 'Reviewer', email: 'rev@test.org', role: 'reviewer', passwordHash: await User.hashPassword('correct-horse-battery') });
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

const fieldsOf = (res) => res.body.error?.details?.fields ?? {};

describe('agent registration', () => {
  let reference;

  test('registers a valid application with documents and returns a reference', async () => {
    const res = await submit(valid);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.match(res.body.data.reference, /^LAG-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    assert.equal(res.body.data.status, 'pending');
    reference = res.body.data.reference;
    const saved = await Agent.findOne({ reference }).lean();
    assert.equal(saved.phone, '+2348031234567');
    assert.equal(saved.dateOfBirth, '1990-05-17');
    assert.equal(saved.agentCategory, 'pu_agent');
    assert.equal(saved.stateOfOrigin, 'Anambra');
    // Names come from the official data, never from the browser.
    assert.equal(saved.ward, 'ORILE');
    assert.equal(saved.pollingUnit, 'JUNCTION OF ABBI AVENUE/TAPA BELLO ST. I');
    assert.equal(saved.pollingUnitCode, '24-20-01-001');
    assert.equal(saved.senatorialDistrict, 'LAGOS CENTRAL');
    assert.equal(saved.documents.passport.contentType, 'image/png');
    assert.equal(saved.documents.passport.width, 400);
    assert.equal(saved.documents.pvc.height, 640);
    assert.equal(saved.consent.sensitiveData, true);
    // Confirmation goes to the applicant; the alert goes to the notification address.
    const types = saved.notifications.map((n) => n.type).sort();
    assert.deepEqual(types, ['admin_alert', 'registration_confirmation']);
    // Stored files exist in GridFS, and metadata text chunks were removed.
    const files = await mongoose.connection.db.collection('agentDocuments.files').find({ 'metadata.reference': reference }).toArray();
    assert.equal(files.length, 2);
    assert.ok(files.find((f) => f.metadata.kind === 'passport').length < passport.length, 'text chunk stripped');
  });

  test('email is mandatory and validated', async () => {
    const missing = await submit({ ...valid, phone: '08091110001', email: '' });
    assert.equal(missing.status, 422);
    assert.match(fieldsOf(missing).email, /Enter your email/);
    const bad = await submit({ ...valid, phone: '08091110001', email: 'not-an-email' });
    assert.equal(bad.status, 422);
    assert.ok(fieldsOf(bad).email);
  });

  test('requires an agent category from the approved list', async () => {
    const res = await submit({ ...valid, phone: '08091110002', email: 'a2@example.com', agentCategory: 'volunteer' });
    assert.equal(res.status, 422);
    assert.ok(fieldsOf(res).agentCategory);
  });

  test('requires date of birth and offers Agent 1 and Agent 2 instead of Agent', async () => {
    const missingDob = await submit({ ...valid, phone: '08091110008', email: 'a8@example.com', dateOfBirth: undefined });
    assert.equal(missingDob.status, 422);
    assert.match(fieldsOf(missingDob).dateOfBirth, /date of birth/i);

    const legacyAgent = await submit({ ...valid, phone: '08091110009', email: 'a9@example.com', agentCategory: 'agent' });
    assert.equal(legacyAgent.status, 422);
    assert.ok(fieldsOf(legacyAgent).agentCategory);

    for (const category of ['agent_1', 'agent_2']) {
      assert.equal(roleSchema.safeParse({ agentCategory: category, state: 'Lagos', lga: 'Surulere' }).success, true);
    }
    assert.equal(roleSchema.safeParse({ agentCategory: 'agent', state: 'Lagos', lga: 'Surulere' }).success, false);
  });

  test('rejects an LGA of origin from a different state', async () => {
    const res = await submit({ ...valid, phone: '08091110003', email: 'a3@example.com', stateOfOrigin: 'Kano' });
    assert.equal(res.status, 422);
    assert.ok(fieldsOf(res).lgaOfOrigin);
  });

  test('rejects a ward from another LGA and requires ward and polling unit', async () => {
    const wrong = await submit({ ...valid, phone: '08091110004', email: 'a4@example.com', wardCode: '11-01', pollingUnitCode: '24-11-01-001' });
    assert.equal(wrong.status, 422);
    assert.ok(fieldsOf(wrong).wardCode);
    const missing = await submit({ ...valid, phone: '08091110004', email: 'a4@example.com', wardCode: '', pollingUnitCode: '', electoralRequired: false });
    assert.equal(missing.status, 422);
    assert.ok(fieldsOf(missing).wardCode && fieldsOf(missing).pollingUnitCode);
  });

  test('requires both the passport photograph and the voter’s card', async () => {
    const res = await submit({ ...valid, phone: '08091110005', email: 'a5@example.com' }, { passport: null, pvc: null });
    assert.equal(res.status, 422);
    assert.ok(fieldsOf(res).passport && fieldsOf(res).pvc);
  });

  test('judges files by content, not by name or claimed type', async () => {
    const fake = Buffer.from('this is a text file pretending to be a photo, padded out to look real enough');
    const res = await submit({ ...valid, phone: '08091110006', email: 'a6@example.com' }, { passport: [fake, 'photo.jpg'] });
    assert.equal(res.status, 422);
    assert.match(fieldsOf(res).passport, /content is not one of those formats/);
  });

  test('rejects truncated images, wrong shapes and tiny photos', async () => {
    const truncated = await submit({ ...valid, phone: '08091110007', email: 'a7@example.com' }, { passport: [passport.subarray(0, passport.length - 20), 'p.png'] });
    assert.match(fieldsOf(truncated).passport, /damaged or incomplete/);
    const wide = await submit({ ...valid, phone: '08091110007', email: 'a7@example.com' }, { passport: [png(900, 400), 'p.png'] });
    assert.match(fieldsOf(wide).passport, /portrait or square/);
    const tiny = await submit({ ...valid, phone: '08091110007', email: 'a7@example.com' }, { pvc: [png(200, 120), 'c.png'] });
    assert.match(fieldsOf(tiny).pvc, /too small/);
  });

  test('accepts a plain PDF voter’s card but rejects PDFs with scripts or that are not PDFs at all', async () => {
    const ok = await submit({ ...valid, phone: '08091110008', email: 'a8@example.com' }, { pvc: [pdf(), 'card.pdf'] });
    assert.equal(ok.status, 201, JSON.stringify(ok.body));
    const scripted = await submit({ ...valid, phone: '08091110009', email: 'a9@example.com' }, { pvc: [pdf('/OpenAction << /S /JavaScript /JS (app.alert(1)) >>'), 'card.pdf'] });
    assert.match(fieldsOf(scripted).pvc, /scripts or attachments/);
    const hidden = Buffer.concat([Buffer.from('%PDF-1.5\n1 0 obj << /Length 40 /Filter /FlateDecode >>\nstream\n', 'latin1'), zlib.deflateSync(Buffer.from('<< /S /JavaScript /JS (x) >>')), Buffer.from('\nendstream\nendobj\n%%EOF\n', 'latin1')]);
    const compressed = await submit({ ...valid, phone: '08091110009', email: 'a9@example.com' }, { pvc: [hidden, 'card.pdf'] });
    assert.match(fieldsOf(compressed).pvc, /scripts or attachments/);
    const passportPdf = await submit({ ...valid, phone: '08091110009', email: 'a9@example.com' }, { passport: [pdf(), 'p.pdf'] });
    assert.match(fieldsOf(passportPdf).passport, /must be a JPG, PNG or WebP/);
  });

  test('rejects files over the size limit', async () => {
    const big = Buffer.concat([pdf(), Buffer.alloc(3 * 1024 * 1024, 32)]);
    const res = await submit({ ...valid, phone: '08091110010', email: 'a10@example.com' }, { pvc: [big, 'big.pdf'] });
    assert.equal(res.status, 413);
  });

  test('rejects a voter’s card file already used by someone else', async () => {
    const res = await submit({ ...valid, phone: '08091110011', email: 'a11@example.com' });
    assert.equal(res.status, 422);
    assert.match(fieldsOf(res).pvc, /already been used/);
  });

  test('rejects a duplicate phone number or email with a clear code', async () => {
    const phone = await submit({ ...valid, email: 'other@example.com' }, { pvc: [pvcImage(91), 'c.png'] });
    assert.equal(phone.status, 409);
    assert.equal(phone.body.error.code, 'DUPLICATE_REGISTRATION');
    const email = await submit({ ...valid, phone: '08091110012', email: 'NGOZI@example.com' }, { pvc: [pvcImage(92), 'c.png'] });
    assert.equal(email.status, 409);
  });

  test('requires every consent', async () => {
    const res = await submit({ ...valid, phone: '08091110013', email: 'a13@example.com', consentSensitive: false, declarationAccurate: false });
    assert.equal(res.status, 422);
    assert.ok(fieldsOf(res).consentSensitive && fieldsOf(res).declarationAccurate);
  });

  test('a failed registration leaves no orphaned documents', async () => {
    const count = await mongoose.connection.db.collection('agentDocuments.files').countDocuments();
    assert.equal(count, 4); // two successful registrations, two files each
  });

  test('status lookup needs the matching phone number and reveals no contact details', async () => {
    const ok = await request(app).post('/api/agents/status').send({ reference, phone: '08031234567' });
    assert.equal(ok.status, 200);
    assert.deepEqual(Object.keys(ok.body.data).sort(), ['firstName', 'reviewedAt', 'status', 'statusLabel', 'submittedAt']);
    const wrong = await request(app).post('/api/agents/status').send({ reference, phone: '08031234568' });
    assert.equal(wrong.status, 404);
  });

  test('strips MongoDB operators from input', async () => {
    const res = await request(app).post('/api/agents/status').send({ reference: { $ne: null }, phone: { $gt: '' } });
    assert.equal(res.status, 422);
  });

  test('serves official wards and polling units', async () => {
    const wards = await request(app).get('/api/locations/wards?state=Lagos&lga=Surulere');
    assert.equal(wards.body.data.wards.length, 12);
    const units = await request(app).get('/api/locations/polling-units?state=Lagos&lga=Surulere&ward=20-01');
    assert.equal(units.body.data.length, 84);
  });

  test('removed volunteer endpoints no longer exist', async () => {
    for (const path of ['/api/volunteers/register', '/api/opportunities', '/api/stats', '/api/portal/me']) {
      const res = await request(app).get(path);
      assert.equal(res.status, 404, path);
    }
  });
});

describe('administration', () => {
  test('admin endpoints and documents require a session', async () => {
    const a = await Agent.findOne({ isSample: false });
    for (const path of ['/api/admin/dashboard', '/api/admin/agents', '/api/admin/exports/agents', `/api/admin/agents/${a._id}/documents/passport`]) {
      assert.equal((await request(app).get(path)).status, 401, path);
    }
  });

  test('state-changing requests without the CSRF header are blocked', async () => {
    const res = await request(app).post('/api/admin/auth/login').send({ email: 'admin@test.org', password: 'correct-horse-battery' });
    assert.equal(res.status, 403);
  });

  test('wrong passwords are rejected and accounts lock after repeated failures', async () => {
    for (let i = 0; i < 5; i += 1) {
      const res = await request(app).post('/api/admin/auth/login').set(fetchHeader).send({ email: 'rev@test.org', password: 'nope' });
      assert.equal(res.status, 401);
    }
    const locked = await request(app).post('/api/admin/auth/login').set(fetchHeader).send({ email: 'rev@test.org', password: 'correct-horse-battery' });
    assert.equal(locked.status, 423);
    await User.updateOne({ email: 'rev@test.org' }, { $unset: { lockedUntil: 1 }, failedLogins: 0 });
  });

  test('staff can search, filter and see the saved values', async () => {
    const admin = await signIn('admin@test.org');
    const count = async (qs) => (await admin.get(`/api/admin/agents?${qs}`)).body.meta.total;
    assert.equal(await count('q=Ngozi'), 2);
    assert.equal(await count('q=a8@example.com'), 1);
    assert.equal(await count('agentCategory=pu_agent'), 2);
    assert.equal(await count('agentCategory=canvasser'), 0);
    assert.equal(await count('lga=Surulere&wardCode=20-01&pollingUnitCode=24-20-01-001'), 2);
    assert.equal(await count('senatorialDistrict=LAGOS%20CENTRAL'), 2);
    assert.equal(await count('stateOfOrigin=Anambra&lgaOfOrigin=Onitsha%20North'), 2);
    assert.equal(await count('q=24-20-01-001'), 2);
    assert.equal((await admin.get('/api/admin/agents?agentCategory=volunteer')).status, 422);
  });

  test('authorised staff can open documents; every view is audited', async () => {
    const reviewer = await signIn('rev@test.org');
    const a = await Agent.findOne({ firstName: 'Ngozi', email: 'ngozi@example.com' });
    const detail = await reviewer.get(`/api/admin/agents/${a._id}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.body.data.documents.passport.contentType, 'image/png');
    assert.equal(detail.body.data.documents.passport.fileId, undefined, 'file ids stay on the server');
    const img = await reviewer.get(`/api/admin/agents/${a._id}/documents/passport`).buffer(true);
    assert.equal(img.status, 200);
    assert.equal(img.headers['content-type'], 'image/png');
    assert.equal(img.headers['cache-control'], 'private, no-store');
    assert.match(img.headers['content-security-policy'], /sandbox/);
    assert.equal(img.body.subarray(1, 4).toString(), 'PNG');
    const pdfDoc = await Agent.findOne({ email: 'a8@example.com' });
    const dl = await reviewer.get(`/api/admin/agents/${pdfDoc._id}/documents/pvc`);
    assert.match(dl.headers['content-disposition'], /^attachment/);
    assert.equal((await reviewer.get(`/api/admin/agents/${a._id}/documents/selfie`)).status, 404);
    const { AuditLog } = await import('../src/models/misc.js');
    assert.ok(await AuditLog.exists({ action: 'agent.document_viewed', targetId: String(a._id) }));
  });

  test('reviewers cannot export, delete or manage staff', async () => {
    const reviewer = await signIn('rev@test.org');
    const a = await Agent.findOne({ email: 'a8@example.com' });
    assert.equal((await reviewer.get('/api/admin/exports/agents')).status, 403);
    assert.equal((await reviewer.get('/api/admin/staff')).status, 403);
    assert.equal((await reviewer.delete(`/api/admin/agents/${a._id}`).set(fetchHeader).send({ confirmReference: a.reference, reason: 'test' })).status, 403);
  });

  test('admin reviews a registration and the change is persisted', async () => {
    const admin = await signIn('admin@test.org');
    const a = await Agent.findOne({ email: 'ngozi@example.com' });
    const res = await admin.patch(`/api/admin/agents/${a._id}/status`).set(fetchHeader).send({ status: 'approved', reason: 'Documents verified', notify: true });
    assert.equal(res.status, 200);
    const saved = await Agent.findById(a._id).lean();
    assert.equal(saved.status, 'approved');
    assert.ok(saved.notifications.some((n) => n.type === 'decision'));
  });

  test('CSV export has the agent fields, never the documents, and resists formula injection', async () => {
    await Agent.updateOne({ email: 'ngozi@example.com' }, { middleName: '=HYPERLINK("http://evil")' });
    const admin = await signIn('admin@test.org');
    const res = await admin.get('/api/admin/exports/agents');
    assert.equal(res.status, 200);
    assert.match(res.text, /"'=HYPERLINK\(""http:\/\/evil""\)"/);
    const header = res.text.replace(/^﻿/, '').split('\r\n')[0].split(',');
    for (const col of ['Agent category', 'Email', 'State of origin', 'Ward', 'Polling unit code', 'Passport photograph', "Voter's card"]) assert.ok(header.includes(col), col);
    assert.ok(!/sha256|fileId|GPS/i.test(res.text));
    assert.match(res.text, /PU Agent/);
  });

  test('admin can permanently delete a registration and its documents', async () => {
    const admin = await signIn('admin@test.org');
    const a = await Agent.findOne({ email: 'a8@example.com' });
    const wrong = await admin.delete(`/api/admin/agents/${a._id}`).set(fetchHeader).send({ confirmReference: 'LAG-XXXX-XXXX', reason: 'Requested by applicant' });
    assert.equal(wrong.status, 400);
    const ok = await admin.delete(`/api/admin/agents/${a._id}`).set(fetchHeader).send({ confirmReference: a.reference, reason: 'Requested by applicant' });
    assert.equal(ok.status, 200);
    assert.equal(await Agent.exists({ _id: a._id }), null);
    assert.equal(await mongoose.connection.db.collection('agentDocuments.files').countDocuments({ 'metadata.reference': a.reference }), 0);
  });

  test('signing out revokes the session token', async () => {
    const admin = await signIn('admin@test.org');
    await admin.post('/api/admin/auth/logout').set(fetchHeader);
    assert.equal((await admin.get('/api/admin/dashboard')).status, 401);
  });
});
