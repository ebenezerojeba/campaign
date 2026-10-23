// Email service tests with a fake SMTP transporter: nothing is ever sent.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.SMTP_HOST = 'smtp.example.org';
process.env.SMTP_PORT = '465';
process.env.SMTP_USER = 'sender@example.org';
process.env.SMTP_PASS = 'not-a-real-password';
process.env.EMAIL_FROM = 'APC Lagos Agent Registration <sender@example.org>';
process.env.ADMIN_NOTIFICATION_EMAIL = 'alerts@example.org';

const email = await import('../src/services/email.js');
const { env } = await import('../src/config/env.js');

let sent;
let failWith;
const fake = {
  async sendMail(message) {
    if (failWith) throw Object.assign(new Error(`smtp said no for ${message.to} with pass ${env.smtp.pass}`), { code: failWith, responseCode: 535 });
    sent.push(message);
    return { messageId: `<${sent.length}@test>`, rejected: [] };
  },
  async verify() {
    if (failWith) throw Object.assign(new Error('nope'), { code: failWith });
    return true;
  },
};

beforeEach(() => {
  sent = [];
  failWith = null;
  email.setTransporterForTests(fake);
});

const agent = {
  _id: '650000000000000000000001', reference: 'LAG-TEST-0001', firstName: 'Ngozi', email: 'ngozi@example.com',
  agentCategory: 'agent_1', lga: 'Surulere', ward: 'ORILE', wardCode: '20-01',
  pollingUnit: 'JUNCTION OF ABBI AVENUE', pollingUnitCode: '24-20-01-001', senatorialDistrict: 'LAGOS CENTRAL', status: 'approved',
};

test('reads SMTP settings from the environment and reports no problems', () => {
  assert.equal(env.smtp.host, 'smtp.example.org');
  assert.equal(env.smtp.secure, true, 'port 465 defaults to implicit TLS');
  assert.deepEqual(email.emailConfigProblems(), []);
  assert.equal(email.emailConfigured(), true);
});

test('reports missing or invalid settings without revealing values', () => {
  const problems = email.emailConfigProblems({ host: '', port: 0, user: '', pass: '', from: 'not an address', fromName: '', adminTo: 'bad' });
  assert.deepEqual(problems, [
    'SMTP_HOST is not set', 'SMTP_PORT is not a valid port', 'SMTP_USER is not set', 'SMTP_PASS is not set',
    'EMAIL_FROM is not a valid email address', 'ADMIN_NOTIFICATION_EMAIL is not a valid email address',
  ]);
  assert.match(email.emailConfigProblems({ ...env.smtp, from: 'X <onboarding@resend.dev>' })[0], /old Resend test sender/);
});

test('registration sends a confirmation to the applicant and an alert to the admin address', async () => {
  const records = await email.sendRegistrationEmails(agent);
  assert.deepEqual(records.map((r) => [r.type, r.status]), [['registration_confirmation', 'sent'], ['admin_alert', 'sent']]);
  assert.deepEqual(sent.map((m) => m.to), ['ngozi@example.com', 'alerts@example.org']);
  assert.deepEqual(sent[0].from, { name: 'APC Lagos Agent Registration', address: 'sender@example.org' });
  assert.equal(sent[0].subject, 'Registration received: LAG-TEST-0001');
  assert.match(sent[0].text, /LAG-TEST-0001/);
  assert.match(sent[1].subject, /^New agent registration: LAG-TEST-0001/);
  assert.ok(!sent[1].text.includes('ngozi@example.com'), 'admin alert carries no contact details');
});

test('decision emails go to the applicant', async () => {
  const r = await email.sendDecisionEmail(agent);
  assert.equal(r.status, 'sent');
  assert.equal(sent[0].subject, 'Registration approved: LAG-TEST-0001');
});

test('refuses recipients and subjects that could inject headers', async () => {
  for (const to of ['victim@example.com\r\nBcc: all@example.com', 'a@example.com, b@example.com', 'Name <a@example.com>', 'no-at-sign']) {
    const r = await email.sendEmail({ to, subject: 'x', text: 'x', html: 'x' });
    assert.equal(r.status, 'skipped', to);
  }
  await email.sendEmail({ to: 'ok@example.com', subject: 'Hello\r\nBcc: evil@example.com', text: 'x', html: 'x' });
  assert.equal(sent[0].subject, 'Hello Bcc: evil@example.com');
  assert.equal(sent.length, 1);
});

test('maps SMTP failures to safe messages that never include credentials or addresses', async () => {
  for (const [code, pattern] of [['EAUTH', /authentication failed/], ['ETIMEDOUT', /Could not reach/], ['ESOCKET', /Could not reach/], ['EENVELOPE', /refused the sender or recipient/], ['EOTHER', /^Email delivery failed\.$/]]) {
    failWith = code;
    const r = await email.sendEmail({ to: 'ngozi@example.com', subject: 's', text: 't', html: 'h' });
    assert.equal(r.status, 'failed', code);
    assert.match(r.error, pattern);
    assert.ok(!r.error.includes('not-a-real-password') && !r.error.includes('ngozi@example.com'));
  }
});

test('verifies the SMTP login without sending', async () => {
  assert.deepEqual(await email.verifyEmailConnection(), { ok: true, problems: [] });
  failWith = 'EAUTH';
  const r = await email.verifyEmailConnection();
  assert.equal(r.ok, false);
  assert.match(r.problems[0], /authentication failed/);
  assert.equal(sent.length, 0);
});
