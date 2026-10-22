// Integration tests: real Express app against an in-memory MongoDB.
//   npm test
import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'test-secret-that-is-long-enough-for-hs256-signing';
process.env.RESEND_API_KEY = ''; // never send real email from tests
process.env.ADMIN_NOTIFICATION_EMAIL = '';
process.env.DEMO_MODE = '';

const { MongoMemoryServer } = await import('mongodb-memory-server-core');
const mongoose = (await import('mongoose')).default;
const request = (await import('supertest')).default;

let mongo;
let app;
let User;
let Volunteer;

const valid = {
  firstName: 'Ngozi', lastName: 'Okafor', email: 'ngozi@example.com', phone: '0803 123 4567', contactMethod: 'email', agentType: 'agent_1',
  stateOfOrigin: 'Anambra', lgaOfOrigin: 'Onitsha North',
  state: 'Lagos', lga: 'Surulere', lcda: 'Itire-Ikate', wardCode: '20-01', pollingUnitCode: '24-20-01-001', ward: 'Typed by the browser', community: 'Aguda',
  interests: ['community_outreach', 'civic_education'], skills: ['writing'], availability: ['saturdays'], participationFormat: 'either',
  motivation: 'I want to help my neighbours.', ageConfirmed: true, consentProcessing: true, consentCommunications: true,
};

const fetchHeader = { 'X-Requested-With': 'fetch' };

before(async () => {
  mongo = await MongoMemoryServer.create({ binary: { version: process.env.MONGOMS_VERSION || '7.0.14' } });
  process.env.MONGODB_URI = mongo.getUri('apc_test');
  const db = await import('../src/config/db.js');
  db.setMongoUri(process.env.MONGODB_URI);
  await db.connectDb();
  app = (await import('../src/app.js')).default;
  ({ User } = await import('../src/models/User.js'));
  ({ Volunteer } = await import('../src/models/Volunteer.js'));
  await Volunteer.syncIndexes();
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

describe('public registration', () => {
  let reference;

  test('registers a valid application and returns a reference', async () => {
    const res = await request(app).post('/api/volunteers/register').send(valid);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.match(res.body.data.reference, /^LAG-[A-Z0-9]{4}-[A-Z0-9]{4}$/);
    assert.equal(res.body.data.status, 'pending');
    assert.equal(res.body.data.confirmationEmail, 'skipped');
    reference = res.body.data.reference;
    const saved = await Volunteer.findOne({ reference }).lean();
    assert.equal(saved.phone, '+2348031234567');
    assert.equal(saved.consent.processing, true);
    assert.equal(saved.isSample, false);
    assert.equal(saved.notifications[0].status, 'skipped');
    assert.equal(saved.agentType, 'agent_1');
    assert.equal(saved.stateOfOrigin, 'Anambra');
    assert.equal(saved.lgaOfOrigin, 'Onitsha North');
    // Names come from the official data, never from the browser.
    assert.equal(saved.ward, 'ORILE');
    assert.equal(saved.wardCode, '20-01');
    assert.equal(saved.pollingUnit, 'JUNCTION OF ABBI AVENUE/TAPA BELLO ST. I');
    assert.equal(saved.pollingUnitCode, '24-20-01-001');
    assert.equal(saved.senatorialDistrict, 'LAGOS CENTRAL');
  });

  test('requires an agent type and never assigns one', async () => {
    const res = await request(app).post('/api/volunteers/register').send({ ...valid, phone: '08091116666', email: '', contactMethod: 'sms', agentType: '' });
    assert.equal(res.status, 422);
    assert.ok(res.body.error.details.fields.agentType);
    const { agentType, ...withoutAgent } = valid;
    const missing = await request(app).post('/api/volunteers/register').send({ ...withoutAgent, phone: '08091116666', email: '', contactMethod: 'sms' });
    assert.equal(missing.status, 422);
    const bogus = await request(app).post('/api/volunteers/register').send({ ...valid, phone: '08091116666', email: '', contactMethod: 'sms', agentType: 'agent_3' });
    assert.equal(bogus.status, 422);
  });

  test('rejects an LGA of origin from a different state', async () => {
    const res = await request(app).post('/api/volunteers/register').send({ ...valid, phone: '08091117777', email: '', contactMethod: 'sms', stateOfOrigin: 'Kano', lgaOfOrigin: 'Onitsha North' });
    assert.equal(res.status, 422);
    assert.ok(res.body.error.details.fields.lgaOfOrigin);
  });

  test('rejects a ward from another LGA and a polling unit from another ward', async () => {
    const wrongWard = await request(app).post('/api/volunteers/register').send({ ...valid, phone: '08091118888', email: '', contactMethod: 'sms', wardCode: '11-01', pollingUnitCode: '24-11-01-001' });
    assert.equal(wrongWard.status, 422);
    assert.ok(wrongWard.body.error.details.fields.wardCode);
    const wrongUnit = await request(app).post('/api/volunteers/register').send({ ...valid, phone: '08091118888', email: '', contactMethod: 'sms', pollingUnitCode: '24-20-02-001' });
    assert.equal(wrongUnit.status, 422);
    assert.ok(wrongUnit.body.error.details.fields.pollingUnitCode);
  });

  test('requires ward and polling unit where official data exists, whatever the browser sends', async () => {
    const res = await request(app).post('/api/volunteers/register').send({ ...valid, phone: '08091119999', email: '', contactMethod: 'sms', wardCode: '', pollingUnitCode: '', electoralRequired: false });
    assert.equal(res.status, 422);
    const { fields } = res.body.error.details;
    assert.ok(fields.wardCode && fields.pollingUnitCode);
  });

  test('serves official wards and polling units, and reports unconfigured areas', async () => {
    const wards = await request(app).get('/api/locations/wards?state=Lagos&lga=Surulere');
    assert.equal(wards.status, 200);
    assert.equal(wards.body.data.configured, true);
    assert.equal(wards.body.data.wards.length, 12);
    const units = await request(app).get('/api/locations/polling-units?state=Lagos&lga=Surulere&ward=20-01');
    assert.equal(units.status, 200);
    assert.equal(units.body.data.length, 84);
    const none = await request(app).get('/api/locations/wards?state=Ogun&lga=Abeokuta%20North');
    assert.deepEqual(none.body.data, { configured: false, required: false, wards: [] });
    assert.equal((await request(app).get('/api/locations/polling-units?state=Lagos&lga=Surulere&ward=11-01')).status, 404);
  });

  test('rejects a duplicate phone number with a clear code', async () => {
    const res = await request(app).post('/api/volunteers/register').send({ ...valid, email: 'other@example.com', phone: '+234 803 123 4567' });
    assert.equal(res.status, 409);
    assert.equal(res.body.error.code, 'DUPLICATE_REGISTRATION');
  });

  test('rejects a duplicate email address', async () => {
    const res = await request(app).post('/api/volunteers/register').send({ ...valid, phone: '08091112222', email: 'NGOZI@example.com' });
    assert.equal(res.status, 409);
  });

  test('rejects an LCDA that is not in the chosen LGA', async () => {
    const res = await request(app).post('/api/volunteers/register').send({ ...valid, phone: '08091113333', email: '', contactMethod: 'sms', lcda: 'Lekki' });
    assert.equal(res.status, 422);
    assert.ok(res.body.error.details.fields.lcda);
  });

  test('requires consent and an adult confirmation', async () => {
    const res = await request(app).post('/api/volunteers/register').send({ ...valid, phone: '08091114444', email: 'a@example.com', consentProcessing: false, ageConfirmed: false });
    assert.equal(res.status, 422);
    const { fields } = res.body.error.details;
    assert.ok(fields.consentProcessing && fields.ageConfirmed);
  });

  test('requires an email address when email is the contact method', async () => {
    const res = await request(app).post('/api/volunteers/register').send({ ...valid, phone: '08091115555', email: '' });
    assert.equal(res.status, 422);
    assert.ok(res.body.error.details.fields.email);
  });

  test('strips MongoDB operators from input', async () => {
    const res = await request(app).post('/api/volunteers/status').send({ reference: { $ne: null }, phone: { $gt: '' } });
    assert.equal(res.status, 422);
  });

  test('status lookup needs the matching phone number and reveals no contact details', async () => {
    const ok = await request(app).post('/api/volunteers/status').send({ reference, phone: '08031234567' });
    assert.equal(ok.status, 200);
    assert.deepEqual(Object.keys(ok.body.data).sort(), ['firstName', 'reviewedAt', 'status', 'statusLabel', 'submittedAt']);
    const wrong = await request(app).post('/api/volunteers/status').send({ reference, phone: '08031234568' });
    assert.equal(wrong.status, 404);
  });

  test('public stats are aggregate counts only', async () => {
    const res = await request(app).get('/api/stats');
    assert.equal(res.status, 200);
    assert.equal(res.body.data.volunteers, 1);
    assert.equal(res.body.data.includesSampleData, false);
  });
});

describe('admin access control', () => {
  test('admin endpoints require a session', async () => {
    for (const path of ['/api/admin/dashboard', '/api/admin/volunteers', '/api/admin/exports/volunteers']) {
      const res = await request(app).get(path);
      assert.equal(res.status, 401, path);
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

  test('session cookie is HttpOnly and SameSite=Strict', async () => {
    const res = await request(app).post('/api/admin/auth/login').set(fetchHeader).send({ email: 'admin@test.org', password: 'correct-horse-battery' });
    const cookie = res.headers['set-cookie'][0];
    assert.match(cookie, /HttpOnly/);
    assert.match(cookie, /SameSite=Strict/);
  });

  test('admin reviews an application and the change is persisted with an audit trail', async () => {
    const admin = await signIn('admin@test.org');
    const list = await admin.get('/api/admin/volunteers?q=Ngozi');
    assert.equal(list.body.meta.total, 1);
    const id = list.body.data[0]._id;

    const approved = await admin.patch(`/api/admin/volunteers/${id}/status`).set(fetchHeader).send({ status: 'approved', reason: 'Strong application', notify: false });
    assert.equal(approved.status, 200);
    const saved = await Volunteer.findById(id).lean();
    assert.equal(saved.status, 'approved');
    assert.equal(saved.statusHistory.at(-1).reason, 'Strong application');

    const audit = await admin.get('/api/admin/audit');
    assert.ok(audit.body.data.some((a) => a.action === 'volunteer.status_changed'));
  });

  test('filters validate their input', async () => {
    const admin = await signIn('admin@test.org');
    const res = await admin.get('/api/admin/volunteers?status=bogus');
    assert.equal(res.status, 422);
    assert.equal((await admin.get('/api/admin/volunteers?agentType=agent_9')).status, 422);
  });

  test('admin can filter and search by agent type, origin, ward and polling unit', async () => {
    const admin = await signIn('admin@test.org');
    const count = async (qs) => (await admin.get(`/api/admin/volunteers?${qs}`)).body.meta.total;
    assert.equal(await count('agentType=agent_1'), 1);
    assert.equal(await count('agentType=agent_2'), 0);
    assert.equal(await count('stateOfOrigin=Anambra&lgaOfOrigin=Onitsha%20North'), 1);
    assert.equal(await count('lga=Surulere&wardCode=20-01&pollingUnitCode=24-20-01-001'), 1);
    assert.equal(await count('senatorialDistrict=LAGOS%20CENTRAL'), 1);
    assert.equal(await count('q=24-20-01-001'), 1);
    const list = await admin.get('/api/admin/volunteers?agentType=agent_1');
    assert.equal(list.body.data[0].agentType, 'agent_1');
    assert.equal(list.body.data[0].ward, 'ORILE');
  });

  test('reviewers cannot export, manage opportunities or staff', async () => {
    const reviewer = await signIn('rev@test.org');
    assert.equal((await reviewer.get('/api/admin/exports/volunteers')).status, 403);
    assert.equal((await reviewer.get('/api/admin/staff')).status, 403);
    assert.equal((await reviewer.post('/api/admin/opportunities').set(fetchHeader).send({ title: 'x' })).status, 403);
    assert.equal((await reviewer.get('/api/admin/volunteers')).status, 200);
  });

  test('CSV export protects against spreadsheet formula injection', async () => {
    await Volunteer.updateOne({}, { community: '=HYPERLINK("http://evil")' });
    const admin = await signIn('admin@test.org');
    const res = await admin.get('/api/admin/exports/volunteers');
    assert.equal(res.status, 200);
    assert.match(res.text, /"'=HYPERLINK\(""http:\/\/evil""\)"/);
    const [header, row] = res.text.replace(/^\uFEFF/, '').split('\r\n');
    for (const col of ['Agent type', 'State of origin', 'LGA of origin', 'Ward', 'Polling unit', 'Polling unit code']) assert.ok(header.split(',').includes(col), col);
    assert.match(row, /Agent 1/);
    assert.match(row, /24-20-01-001/);
  });

  test('signing out revokes the session token', async () => {
    const admin = await signIn('admin@test.org');
    await admin.post('/api/admin/auth/logout').set(fetchHeader);
    assert.equal((await admin.get('/api/admin/dashboard')).status, 401);
  });
});

describe('opportunities', () => {
  test('only published opportunities are public, and archiving hides them', async () => {
    const admin = await signIn('admin@test.org');
    const draft = await admin.post('/api/admin/opportunities').set(fetchHeader).send({ title: 'Ward outreach', summary: 'Meet residents in your ward.', category: 'community_outreach' });
    assert.equal(draft.status, 201, JSON.stringify(draft.body));
    assert.equal((await request(app).get('/api/opportunities')).body.data.length, 0);

    const id = draft.body.data._id;
    await admin.patch(`/api/admin/opportunities/${id}`).set(fetchHeader).send({ status: 'published' });
    const pub = await request(app).get('/api/opportunities');
    assert.equal(pub.body.data.length, 1);
    assert.equal(pub.body.data[0].createdBy, undefined);

    await admin.delete(`/api/admin/opportunities/${id}`).set(fetchHeader);
    assert.equal((await request(app).get(`/api/opportunities/${id}`)).status, 404);
  });

  test('rejects an end date before the start date', async () => {
    const admin = await signIn('admin@test.org');
    const res = await admin.post('/api/admin/opportunities').set(fetchHeader).send({ title: 'Event', summary: 'An event to support.', category: 'event_support', startDate: '2026-12-10', endDate: '2026-12-01' });
    assert.equal(res.status, 422);
  });
});

describe('agent type 2 registration', () => {
  test('saves Agent 2 and shows it to staff', async () => {
    const res = await request(app).post('/api/volunteers/register').send({
      ...valid, firstName: 'Tunde', phone: '08097770000', email: 'tunde@example.com', agentType: 'agent_2',
      stateOfOrigin: 'FCT', lgaOfOrigin: 'Gwagwalada', lga: 'Ikeja', lcda: '', wardCode: '11-01', pollingUnitCode: '24-11-01-001',
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    const admin = await signIn('admin@test.org');
    const list = await admin.get('/api/admin/volunteers?agentType=agent_2');
    assert.equal(list.body.meta.total, 1);
    const detail = await admin.get(`/api/admin/volunteers/${list.body.data[0]._id}`);
    assert.equal(detail.body.data.agentType, 'agent_2');
    assert.equal(detail.body.data.pollingUnit, 'ANIFOWOSHE PRY. SCH.');
    assert.equal(detail.body.data.senatorialDistrict, 'LAGOS WEST I');
  });
});
