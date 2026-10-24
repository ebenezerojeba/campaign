// Document storage in Cloudinary, against a fake Cloudinary and an in-memory
// MongoDB. Nothing is uploaded anywhere.
import { test, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import { Writable } from 'node:stream';
import zlib from 'node:zlib';

process.env.NODE_ENV = 'test';
process.env.POSITION_RULE = 'off';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256-signing';
process.env.DATA_ENCRYPTION_KEY = 'test-only-encryption-key-with-enough-entropy';

const { MongoMemoryServer } = await import('mongodb-memory-server-core');
const mongoose = (await import('mongoose')).default;
const request = (await import('supertest')).default;

let mongo;
let app;
let Agent;
let User;
let cloud;
let docs;

// ---------- Fake Cloudinary ----------
const store = new Map();
let uploads = [];
let failUpload = false;
const fake = {
  uploadStream(opts, cb) {
    const chunks = [];
    return new Writable({
      write(chunk, _enc, done) { chunks.push(chunk); done(); },
      final(done) {
        if (failUpload) { cb(new Error('upload refused')); return done(); }
        const buf = Buffer.concat(chunks);
        const publicId = `${opts.folder}/${opts.public_id}`;
        store.set(publicId, { buf, opts });
        uploads.push(opts);
        cb(null, { public_id: publicId, version: 1, format: opts.resource_type === 'raw' ? undefined : 'jpg', etag: crypto.createHash('md5').update(buf).digest('hex') });
        return done();
      },
    });
  },
  url: (publicId, opts) => `https://res.cloudinary.example/${opts.type}/${opts.sign_url ? 's--sig--/' : ''}${publicId}`,
  async fetch(url) {
    const id = url.replace(/^.*s--sig--\//, '');
    const item = url.includes('s--sig--') ? store.get(id) : null;
    return item ? new Response(item.buf) : new Response('not found', { status: 404 });
  },
  async destroy(publicId) { store.delete(publicId); return { result: 'ok' }; },
};

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
const registration = () => {
  seq += 1;
  const n = String(seq).padStart(4, '0');
  return {
    firstName: 'Cloud', lastName: 'Test', email: `cloud${n}@example.com`, phone: `0806000${n}`, dateOfBirth: '1990-05-17',
    stateOfOrigin: 'Oyo', lgaOfOrigin: 'Ibadan North', agentCategory: 'agent_1', state: 'Lagos', lga: 'Surulere',
    wardCode: '20-01', pollingUnitCode: '24-20-01-001', nin: `7200000${n}`, vin: `CLOUDVIN${n}`, apcPartyRegistrationNumber: `LA/C/${n}`,
    bankName: 'Zenith Bank', accountName: 'Cloud Test', accountNumber: '0123456789',
    declarationAccurate: true, consentProcessing: true, consentSensitive: true, consentFinancialIdentity: true,
  };
};
const register = (data = registration()) => request(app).post('/api/agents/register').field('data', JSON.stringify(data))
  .attach('passport', png(400, 500, 30 + seq), 'p.png').attach('pvc', png(1000, 640, 90 + seq), 'c.png');

before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: process.env.MONGOMS_VERSION || '7.0.14' } });
  const db = await import('../src/config/db.js');
  db.setMongoUri(mongo.getUri('apc_cloud'));
  await db.connectDb();
  app = (await import('../src/app.js')).default;
  ({ Agent } = await import('../src/models/Agent.js'));
  ({ User } = await import('../src/models/User.js'));
  cloud = await import('../src/services/cloudinary.js');
  docs = await import('../src/services/documents.js');
  await Promise.all([Agent.syncIndexes(), User.syncIndexes()]);
  await User.create({ name: 'Admin', email: 'admin@test.org', role: 'admin', passwordHash: await User.hashPassword('correct-horse-battery') });
  const email = await import('../src/services/email.js');
  email.setTransporterForTests({ async sendMail(m) { return { messageId: '<x@test>', accepted: [m.to], rejected: [], response: '250 OK' }; } });
});

after(async () => {
  cloud.resetForTests();
  await mongoose.disconnect();
  await mongo.stop();
});

beforeEach(() => {
  cloud.setSdkForTests(fake);
  uploads = [];
  failUpload = false;
});

test('without CLOUDINARY_URL, documents stay in the database as before', async () => {
  cloud.resetForTests();
  delete process.env.CLOUDINARY_URL;
  assert.equal(cloud.enabled(), false);
  const res = await register();
  assert.equal(res.status, 201);
  const a = await Agent.findOne({ reference: res.body.data.reference }).lean();
  assert.ok(a.documents.pvc.fileId);
  assert.equal(a.documents.pvc.cloudinary, undefined);
});

test('new uploads go to Cloudinary as private assets with random names and no personal details', async () => {
  const data = registration();
  const res = await register(data);
  assert.equal(res.status, 201);
  const a = await Agent.findOne({ reference: res.body.data.reference }).lean();
  for (const kind of ['passport', 'pvc']) {
    assert.equal(a.documents[kind].fileId, undefined, 'not in GridFS');
    assert.ok(a.documents[kind].cloudinary.publicId);
  }
  assert.equal(uploads.length, 2);
  for (const opts of uploads) {
    assert.equal(opts.type, 'authenticated', 'private delivery only');
    assert.equal(opts.overwrite, false);
    const text = JSON.stringify(opts);
    for (const value of [data.firstName, data.email, data.phone, a.reference]) assert.ok(!text.includes(value), `no ${value} sent to Cloudinary`);
  }
  assert.equal(await mongoose.connection.db.collection('agentDocuments.files').countDocuments({ 'metadata.reference': a.reference }), 0);
});

test('staff open Cloudinary documents through the server; the response never contains a Cloudinary URL', async () => {
  const res = await register();
  const a = await Agent.findOne({ reference: res.body.data.reference }).lean();
  const admin = request.agent(app);
  await admin.post('/api/admin/auth/login').set('X-Requested-With', 'fetch').send({ email: 'admin@test.org', password: 'correct-horse-battery' });
  const doc = await admin.get(`/api/admin/agents/${a._id}/documents/pvc`).buffer(true).parse((r, cb) => { const c = []; r.on('data', (d) => c.push(d)); r.on('end', () => cb(null, Buffer.concat(c))); });
  assert.equal(doc.status, 200);
  assert.equal(doc.headers['content-type'], 'image/png');
  assert.equal(crypto.createHash('sha256').update(doc.body).digest('hex'), a.documents.pvc.sha256, 'identical bytes');
  const detail = await admin.get(`/api/admin/agents/${a._id}`);
  assert.ok(!JSON.stringify(detail.body).includes('cloudinary'), 'no storage details in the API');
});

test('a failed Cloudinary upload saves nothing and reports a server error', async () => {
  const before = await Agent.countDocuments();
  failUpload = true;
  const res = await register();
  assert.equal(res.status, 500);
  assert.equal(await Agent.countDocuments(), before);
});

test('deleting a registration deletes its Cloudinary files', async () => {
  const res = await register();
  const a = await Agent.findOne({ reference: res.body.data.reference }).lean();
  const ids = [a.documents.passport.cloudinary.publicId, a.documents.pvc.cloudinary.publicId];
  assert.ok(ids.every((id) => store.has(id)));
  const admin = request.agent(app);
  await admin.post('/api/admin/auth/login').set('X-Requested-With', 'fetch').send({ email: 'admin@test.org', password: 'correct-horse-battery' });
  const del = await admin.delete(`/api/admin/agents/${a._id}`).set('X-Requested-With', 'fetch').send({ confirmReference: a.reference, reason: 'Test deletion' });
  assert.equal(del.status, 200);
  assert.ok(ids.every((id) => !store.has(id)));
});

test('readDocument returns identical bytes from either store', async () => {
  const res = await register();
  const a = await Agent.findOne({ reference: res.body.data.reference }).lean();
  const bytes = await docs.readDocument(a.documents.passport);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), a.documents.passport.sha256);
});
