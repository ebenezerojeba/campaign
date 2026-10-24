// Email service tests with a fake SMTP transporter: nothing is ever sent.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.SMTP_HOST = 'smtp.example.org';
process.env.SMTP_PORT = '465';
process.env.SMTP_USER = 'notifications@apclagos.org';
process.env.SMTP_PASS = 'not-a-real-password';
process.env.EMAIL_FROM = 'notifications@apclagos.org';
process.env.EMAIL_FROM_NAME = 'APC Lagos';
// A personal reply address must never reach a message.
process.env.EMAIL_REPLY_TO = 'ayindegeorge20@gmail.com';
process.env.FRONTEND_URL = 'https://www.apclagos.org';
process.env.ADMIN_NOTIFICATION_EMAIL = 'alerts@example.org';
const OFFICIAL = { name: 'APC Lagos', address: 'notifications@apclagos.org' };

const email = await import('../src/services/email.js');
const { env } = await import('../src/config/env.js');

let sent;
let failWith;
let rejectRecipient;
const fake = {
  async sendMail(message) {
    if (failWith) throw Object.assign(new Error(`smtp said no for ${message.to} with pass ${env.smtp.pass}`), { code: failWith, responseCode: 535 });
    sent.push(message);
    if (rejectRecipient) return { messageId: `<${sent.length}@test>`, accepted: [], rejected: [message.to], response: `550 5.1.1 <${message.to}> unknown` };
    return { messageId: `<${sent.length}@test>`, accepted: [message.to], rejected: [], response: `250 2.0.0 OK queued for ${message.to}` };
  },
  async verify() {
    if (failWith) throw Object.assign(new Error('nope'), { code: failWith });
    return true;
  },
};

let logs;
const realInfo = console.info;

beforeEach(() => {
  sent = [];
  failWith = null;
  rejectRecipient = false;
  logs = [];
  console.info = (line) => logs.push(String(line));
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

test('Brevo settings: port 587 uses STARTTLS, and the SMTP login is never used as the sender', () => {
  const brevo = { host: 'smtp-relay.brevo.com', port: 587, secure: false, user: '818be0000@smtp-brevo.com', pass: 'not-a-real-key', from: 'notifications@apclagos.org', fromName: 'APC Lagos', replyTo: '', adminTo: '' };
  assert.deepEqual(email.emailConfigProblems(brevo), []);
  const missingFrom = email.emailConfigProblems({ ...brevo, from: '' });
  assert.equal(missingFrom.length, 1);
  assert.match(missingFrom[0], /EMAIL_FROM is not set/);
  assert.ok(!missingFrom[0].includes('818be0000'), 'the login is not echoed');
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
  assert.deepEqual(sent[0].from, OFFICIAL);
  assert.equal(sent[0].subject, 'APC Lagos: Registration Confirmation (LAG-TEST-0001)');
  assert.match(sent[0].text, /LAG-TEST-0001/);
  assert.equal(sent[1].subject, 'APC Lagos: New Agent Registration (LAG-TEST-0001)');
  assert.ok(!sent[1].text.includes('ngozi@example.com'), 'admin alert carries no contact details');
});

test('decision emails go to the applicant', async () => {
  const r = await email.sendDecisionEmail(agent);
  assert.equal(r.status, 'sent');
  assert.equal(sent[0].subject, 'APC Lagos: Registration Approved (LAG-TEST-0001)');
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

test('records SMTP acceptance precisely: correlation ID, counts and reply, and logs no addresses or secrets', async () => {
  const r = await email.sendEmail({ to: 'ngozi@example.com', subject: 's', text: 't', html: 'h', workflow: 'registration_confirmation' });
  console.info = realInfo;
  assert.equal(r.status, 'sent');
  assert.match(r.correlationId, /^[0-9a-f-]{36}$/);
  assert.equal(r.accepted, 1);
  assert.equal(r.rejected, 0);
  assert.equal(r.smtpResponse, '250 2.0.0 OK queued for [address]', 'addresses removed from the stored reply');
  assert.equal(sent[0].headers['X-Correlation-ID'], r.correlationId);
  const line = logs.find((l) => l.startsWith('[email] '));
  const entry = JSON.parse(line.slice(8));
  assert.deepEqual([entry.correlationId, entry.workflow, entry.outcome, entry.recipientDomain, entry.accepted, entry.rejected], [r.correlationId, 'registration_confirmation', 'accepted', 'example.com', 1, 0]);
  assert.ok(!line.includes('ngozi@') && !line.includes('not-a-real-password'));
});

test('a recipient refused by the SMTP server is a failure, never a success', async () => {
  rejectRecipient = true;
  const r = await email.sendEmail({ to: 'nobody@example.com', subject: 's', text: 't', html: 'h' });
  console.info = realInfo;
  assert.equal(r.status, 'failed');
  assert.equal(r.accepted, 0);
  assert.equal(r.rejected, 1);
  assert.match(r.error, /refused the recipient/);
  assert.ok(logs.some((l) => l.includes('"outcome":"rejected"')));
});

test('authentication and connection failures are recorded with their SMTP code and logged without secrets', async () => {
  failWith = 'EAUTH';
  const r = await email.sendEmail({ to: 'ngozi@example.com', subject: 's', text: 't', html: 'h', workflow: 'admin_alert' });
  console.info = realInfo;
  assert.equal(r.status, 'failed');
  assert.equal(r.smtpCode, 535);
  const line = logs.find((l) => l.includes('"outcome":"failed"'));
  assert.ok(line.includes('"code":"EAUTH"') && line.includes('"workflow":"admin_alert"'));
  assert.ok(!line.includes('not-a-real-password') && !line.includes('ngozi@'));
});

test('warns when admin alerts would be sent to the sending mailbox itself', () => {
  console.info = realInfo;
  const notices = email.emailConfigNotices({ ...env.smtp, replyTo: '', from: 'APC <sender@example.org>', adminTo: 'Sender@example.org' });
  assert.match(notices[0], /sending address itself/);
  assert.deepEqual(email.emailConfigNotices().length, 1, 'only the ignored personal reply address is reported');
  assert.match(email.emailConfigNotices()[0], /EMAIL_REPLY_TO is not on the sender's domain/);
});

// ---------- Official sender, Reply-To and template design ----------

const PERSONAL = /ayindegeorge20|gmail\.com/i;

async function sendAllWorkflows() {
  sent = [];
  await email.sendRegistrationEmails(agent);
  await email.sendDecisionEmail(agent);
  await email.sendDecisionEmail({ ...agent, status: 'rejected' });
  console.info = realInfo;
  return sent;
}

test('every workflow sends From and Reply-To APC Lagos <notifications@apclagos.org>', async () => {
  const messages = await sendAllWorkflows();
  assert.equal(messages.length, 4);
  for (const m of messages) {
    assert.deepEqual(m.from, OFFICIAL, m.subject);
    assert.deepEqual(m.replyTo, OFFICIAL, m.subject);
    assert.equal(m.sender, undefined);
    assert.equal(m.envelope, undefined, 'SMTP envelope left to the transport');
  }
  assert.equal(messages[1].to, 'alerts@example.org', 'admin recipient kept separate from the sender');
});

test('no personal address appears anywhere in generated headers or content', async () => {
  for (const m of await sendAllWorkflows()) {
    assert.ok(!PERSONAL.test(JSON.stringify({ from: m.from, replyTo: m.replyTo, headers: m.headers })), `${m.subject}: headers`);
    assert.ok(!PERSONAL.test(m.html) && !PERSONAL.test(m.text) && !PERSONAL.test(m.subject), `${m.subject}: content`);
  }
});

test('callers cannot override the official sender or Reply-To', async () => {
  await email.sendEmail({ to: 'ngozi@example.com', subject: 's', text: 't', html: 'h', from: 'Someone <ayindegeorge20@gmail.com>', replyTo: 'ayindegeorge20@gmail.com', sender: 'x@example.com' });
  console.info = realInfo;
  assert.deepEqual(sent[0].from, OFFICIAL);
  assert.deepEqual(sent[0].replyTo, OFFICIAL);
  assert.equal(sent[0].sender, undefined);
});

test('a Reply-To on the official domain is honoured; any other domain is ignored', () => {
  console.info = realInfo;
  assert.deepEqual(email.replyToFor({ ...env.smtp, replyTo: 'info@apclagos.org' }), { name: 'APC Lagos', address: 'info@apclagos.org' });
  assert.deepEqual(email.replyToFor({ ...env.smtp, replyTo: 'ayindegeorge20@gmail.com' }), OFFICIAL);
  assert.deepEqual(email.replyToFor({ ...env.smtp, replyTo: 'bad\r\nBcc: x@apclagos.org' }), OFFICIAL);
});

test('templates share one design with HTML and plain text, the official footer and verified assets', async () => {
  for (const m of await sendAllWorkflows()) {
    assert.match(m.subject, /^APC Lagos: /);
    assert.match(m.html, /<meta name="viewport" content="width=device-width,initial-scale=1">/);
    assert.match(m.html, /max-width:600px/, 'fluid layout capped at 600px');
    assert.match(m.html, /@media only screen and \(max-width:620px\)/, 'mobile adjustments');
    assert.match(m.html, /src="https:\/\/www\.apclagos\.org\/brand\/apc-logo\.jpg"/, 'logo from the official site');
    assert.match(m.html, /notifications@apclagos\.org/);
    assert.match(m.html, /www\.apclagos\.org/);
    assert.ok(!/<[a-z][^>]*>/i.test(m.text), 'plain text has no markup');
    assert.match(m.text, /notifications@apclagos\.org \| www\.apclagos\.org/);
    for (const banned of [/\bNIN\b.*\d{11}/, /account number:/i, /\bVIN:/]) assert.ok(!banned.test(m.text), `no sensitive values: ${m.subject}`);
  }
});

test('user-supplied values are escaped in HTML', async () => {
  sent = [];
  await email.sendRegistrationEmails({ ...agent, firstName: '<script>alert(1)</script>', pollingUnit: 'A & B "school"' });
  console.info = realInfo;
  const html = sent[0].html;
  assert.ok(!html.includes('<script>alert(1)</script>'));
  assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
  assert.ok(html.includes('A &amp; B &quot;school&quot;'));
});
