// Outgoing email over SMTP with Nodemailer. Every send resolves to a delivery
// record that callers store; an email failure never fails the request that
// triggered it, and the applicant is told when their confirmation did not go.
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
  const name = oneLine(config.fromName || (match ? match[1] : '') || 'APC Lagos Agent Registration');
  return { address, name };
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

// Sends one message. Resolves to { status: 'sent' | 'failed' | 'skipped', providerId?, error? }.
export async function sendEmail({ to, subject, html, text }) {
  if (!to) return { status: 'skipped', error: 'No recipient address' };
  if (!isSafeAddress(to)) return { status: 'skipped', error: 'Recipient address is not valid' };
  const problems = emailConfigProblems();
  if (problems.length) {
    if (!warned) { console.warn(`[email] not sending: ${problems.join('; ')}`); warned = true; }
    if (!env.isProd && env.NODE_ENV !== 'test') console.info(`[email:console] ${oneLine(subject)}\n${text}\n`);
    return { status: 'skipped', error: 'Email is not configured on the server' };
  }
  const { address, name } = senderFrom(env.smtp);
  try {
    const info = await getTransporter().sendMail({
      from: { name, address },
      to,
      replyTo: isSafeAddress(env.smtp.replyTo) ? env.smtp.replyTo : undefined,
      subject: oneLine(subject),
      html,
      text,
    });
    if (info.rejected?.length) return { status: 'failed', error: 'The SMTP server refused the recipient address.' };
    return { status: 'sent', providerId: info.messageId };
  } catch (err) {
    console.warn('[email] send failed:', err?.code ?? 'unknown', err?.responseCode ?? '');
    return { status: 'failed', error: describeFailure(err) };
  }
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
  const jobs = [sendEmail({ to: agent.email, ...templates.registrationConfirmation(agent) }).then((o) => record('registration_confirmation', o))];
  if (env.smtp.adminTo) {
    jobs.push(sendEmail({ to: env.smtp.adminTo, ...templates.adminAlert(agent) }).then((o) => record('admin_alert', o)));
  }
  return Promise.all(jobs);
}

export async function sendDecisionEmail(agent) {
  return record('decision', await sendEmail({ to: agent.email, ...templates.decision(agent) }));
}
