// Outgoing email over SMTP with Nodemailer. Every send resolves to a delivery
// record that callers store; an email failure never fails the request that
// triggered it, and the applicant is told when their confirmation did not go.
import crypto from 'node:crypto';
import nodemailer from 'nodemailer';
import { env } from '../config/env.js';
import * as templates from './emailTemplates.js';

// One address, no display name, no line breaks: anything else is refused so
// user input can never add headers or extra recipients.
const ADDRESS_RE = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?(?:\.[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?)+$/;
export const isSafeAddress = (value) => typeof value === 'string' && value.length <= 254 && ADDRESS_RE.test(value);
const oneLine = (value) => String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim();

// Parses EMAIL_FROM ("Name <address>" or "address") and the optional EMAIL_FROM_NAME.
function senderFrom(config) {
  const match = config.from.match(/^\s*"?([^"<]*?)"?\s*<([^>]+)>\s*$/);
  const address = (match ? match[2] : config.from).trim() || config.user;
  const name = oneLine(config.fromName || (match ? match[1] : '') || 'APC Lagos');
  return { address, name };
}

const domain = (address) => String(address).split('@')[1]?.toLowerCase() ?? '';

// Replies always go to an official mailbox: EMAIL_REPLY_TO is used only when
// it is on the sender's own domain; anything else (for example a personal
// Gmail address) is ignored and the sender address is used instead.
export function replyToFor(config = env.smtp) {
  const sender = senderFrom(config);
  const configured = config.replyTo?.trim();
  const usable = configured && isSafeAddress(configured) && domain(configured) === domain(sender.address);
  return { name: sender.name, address: usable ? configured : sender.address };
}

// Returns the problems with the current SMTP settings, without their values.
export function emailConfigProblems(config = env.smtp) {
  const problems = [];
  if (!config.host) problems.push('SMTP_HOST is not set');
  if (!Number.isInteger(config.port) || config.port < 1 || config.port > 65535) problems.push('SMTP_PORT is not a valid port');
  if (!config.user) problems.push('SMTP_USER is not set');
  if (!config.pass) problems.push('SMTP_PASS is not set');
  const { address } = senderFrom(config);
  if (!isSafeAddress(address)) problems.push('EMAIL_FROM is not a valid email address');
  else if (/@resend\.dev$/i.test(address)) problems.push('EMAIL_FROM still uses the old Resend test sender; set it to an address your SMTP account may send from');
  if (config.adminTo && !isSafeAddress(config.adminTo)) problems.push('ADMIN_NOTIFICATION_EMAIL is not a valid email address');
  return problems;
}

export const emailConfigured = () => emailConfigProblems().length === 0;

let transporter;
let warned = false;

// Created once per server instance and reused for every message.
function getTransporter() {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtp.host,
      port: env.smtp.port,
      secure: env.smtp.secure,
      requireTLS: !env.smtp.secure, // never send credentials over an unencrypted connection
      auth: { user: env.smtp.user, pass: env.smtp.pass },
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 20_000,
    });
  }
  return transporter;
}

// Tests replace the transporter with a fake; pass null to restore.
export function setTransporterForTests(fake) {
  transporter = fake ?? undefined;
}

// Maps Nodemailer errors to messages safe to store and show to staff: never
// credentials, server banners or recipient addresses.
function describeFailure(err) {
  switch (err?.code) {
    case 'EAUTH': return 'SMTP authentication failed. Check SMTP_USER and SMTP_PASS.';
    case 'ECONNECTION':
    case 'ETIMEDOUT':
    case 'ESOCKET':
    case 'EDNS': return 'Could not reach the SMTP server. Check SMTP_HOST, SMTP_PORT and SMTP_SECURE.';
    case 'ETLS': return 'Secure connection to the SMTP server failed. Check SMTP_PORT and SMTP_SECURE.';
    case 'EENVELOPE': return 'The SMTP server refused the sender or recipient address.';
    case 'EMESSAGE': return 'The SMTP server rejected the message.';
    default: return 'Email delivery failed.';
  }
}

// One structured line per attempt for the server logs: workflow, outcome,
// SMTP codes and counts. Never addresses, credentials or registration data;
// only the recipient's domain, to spot provider-specific problems.
function logAttempt(entry) {
  console.info(`[email] ${JSON.stringify(entry)}`);
}

const domainOf = (address) => String(address).split('@')[1]?.toLowerCase() ?? '';
// The SMTP server's reply, e.g. "250 2.0.0 OK", trimmed and with addresses removed.
const safeResponse = (text) => (text ? String(text).replace(/\S+@\S+/g, '[address]').slice(0, 120) : undefined);

// Sends one message and waits for the SMTP server's answer. Resolves to a
// delivery record:
//   status 'sent'    the SMTP server ACCEPTED the message for delivery. This is
//                    not proof that it reached the inbox: the receiving
//                    provider can still bounce, quarantine or spam-file it.
//   status 'failed'  the SMTP server refused it, or could not be reached.
//   status 'skipped' email is not configured, or the address is unusable.
// Every record carries a correlation ID that matches the server log line.
export async function sendEmail({ to, subject, html, text, workflow = 'email' }) {
  const correlationId = crypto.randomUUID();
  const base = { correlationId };
  if (!to) return { ...base, status: 'skipped', error: 'No recipient address' };
  if (!isSafeAddress(to)) return { ...base, status: 'skipped', error: 'Recipient address is not valid' };
  const problems = emailConfigProblems();
  if (problems.length) {
    if (!warned) { console.warn(`[email] not sending: ${problems.join('; ')}`); warned = true; }
    if (!env.isProd && env.NODE_ENV !== 'test') console.info(`[email:console] ${oneLine(subject)}\n${text}\n`);
    logAttempt({ correlationId, workflow, outcome: 'skipped', reason: 'not_configured' });
    return { ...base, status: 'skipped', error: 'Email is not configured on the server' };
  }
  const { address, name } = senderFrom(env.smtp);
  const startedAt = Date.now();
  try {
    const info = await getTransporter().sendMail({
      from: { name, address },
      to,
      replyTo: replyToFor(),
      subject: oneLine(subject),
      html,
      text,
      headers: { 'X-Correlation-ID': correlationId },
    });
    const accepted = info.accepted?.length ?? 0;
    const rejected = info.rejected?.length ?? 0;
    const smtpResponse = safeResponse(info.response);
    const ok = accepted > 0 && rejected === 0;
    logAttempt({ correlationId, workflow, outcome: ok ? 'accepted' : 'rejected', recipientDomain: domainOf(to), accepted, rejected, smtpResponse, messageId: info.messageId, ms: Date.now() - startedAt });
    if (!ok) return { ...base, status: 'failed', error: 'The SMTP server refused the recipient address.', accepted, rejected, smtpResponse };
    return { ...base, status: 'sent', providerId: info.messageId, accepted, rejected, smtpResponse };
  } catch (err) {
    logAttempt({ correlationId, workflow, outcome: 'failed', recipientDomain: domainOf(to), code: err?.code ?? 'unknown', responseCode: err?.responseCode, ms: Date.now() - startedAt });
    return { ...base, status: 'failed', error: describeFailure(err), smtpCode: err?.responseCode };
  }
}

// Notes on settings that work but often cause "sent but not received".
export function emailConfigNotices(config = env.smtp) {
  const notices = [];
  const { address } = senderFrom(config);
  if (config.replyTo && replyToFor(config).address !== config.replyTo.trim()) {
    notices.push('EMAIL_REPLY_TO is not on the sender\'s domain, so it is ignored: replies go to the sender address. Remove it or use an address on the official domain.');
  }
  if (/@(gmail|googlemail|yahoo|outlook|hotmail|live|icloud)\./i.test(address)) {
    notices.push('EMAIL_FROM is a personal mailbox. Use the official sender, for example notifications@apclagos.org.');
  }
  if (config.adminTo && config.adminTo.toLowerCase() === address.toLowerCase()) {
    notices.push('ADMIN_NOTIFICATION_EMAIL is the sending address itself. Gmail files messages you send to yourself under Sent, not the Inbox, so admin alerts can look missing. Use a different notification address.');
  }
  if (/@gmail\.com$/i.test(config.user) && address.toLowerCase() !== config.user.toLowerCase()) {
    notices.push('Gmail rewrites the From address to the Gmail account unless EMAIL_FROM is a verified "Send mail as" alias.');
  }
  return notices;
}

// Checks the SMTP login without sending anything (used by `npm run email:check`).
export async function verifyEmailConnection() {
  const problems = emailConfigProblems();
  if (problems.length) return { ok: false, problems };
  try {
    await getTransporter().verify();
    return { ok: true, problems: [] };
  } catch (err) {
    return { ok: false, problems: [describeFailure(err)] };
  }
}

const record = (type, outcome) => ({ type, channel: 'email', at: new Date(), ...outcome });

export async function sendRegistrationEmails(agent) {
  const jobs = [sendEmail({ to: agent.email, workflow: 'registration_confirmation', ...templates.registrationConfirmation(agent) }).then((o) => record('registration_confirmation', o))];
  if (env.smtp.adminTo) {
    jobs.push(sendEmail({ to: env.smtp.adminTo, workflow: 'admin_alert', ...templates.adminAlert(agent) }).then((o) => record('admin_alert', o)));
  }
  return Promise.all(jobs);
}

export async function sendDecisionEmail(agent) {
  return record('decision', await sendEmail({ to: agent.email, workflow: 'decision', ...templates.decision(agent) }));
}
