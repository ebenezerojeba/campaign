import { Resend } from 'resend';
import { env, emailConfigured } from '../config/env.js';
import * as templates from './emailTemplates.js';

let client;
const resend = () => (client ??= new Resend(env.resend.apiKey));

const TIMEOUT_MS = 7000;

// Sends one message and always resolves to a delivery record:
// { status: 'sent' | 'failed' | 'skipped', providerId?, error? }.
// Callers persist the record; a failed email never fails the request that triggered it.
export async function sendEmail({ to, subject, html, text }) {
  if (!to) return { status: 'skipped', error: 'No recipient address' };
  if (!emailConfigured()) {
    if (!env.isProd) console.info(`[email:console] To: ${to} | ${subject}\n${text}\n`);
    return { status: 'skipped', error: 'Email provider not configured' };
  }
  try {
    const payload = { from: env.resend.from, to: [to], subject, html, text };
    if (env.resend.replyTo) payload.replyTo = env.resend.replyTo;
    const result = await Promise.race([
      resend().emails.send(payload),
      new Promise((_, reject) => setTimeout(() => reject(new Error('Email provider timed out')), TIMEOUT_MS)),
    ]);
    // The Resend SDK reports failures in `error` rather than throwing.
    if (result?.error) {
      console.warn('[email] Resend rejected message:', result.error.name, result.error.message);
      return { status: 'failed', error: `${result.error.name ?? 'error'}: ${result.error.message ?? 'unknown'}`.slice(0, 300) };
    }
    return { status: 'sent', providerId: result?.data?.id };
  } catch (err) {
    console.warn('[email] send failed:', err.message);
    return { status: 'failed', error: String(err.message).slice(0, 300) };
  }
}

const record = (type, outcome) => ({ type, channel: 'email', at: new Date(), ...outcome });

export async function sendRegistrationEmails(volunteer) {
  const jobs = [];
  if (volunteer.email) {
    jobs.push(sendEmail({ to: volunteer.email, ...templates.registrationConfirmation(volunteer) }).then((o) => record('registration_confirmation', o)));
  } else {
    jobs.push(Promise.resolve(record('registration_confirmation', { status: 'skipped', error: 'Applicant gave no email address' })));
  }
  if (env.resend.adminTo) {
    jobs.push(sendEmail({ to: env.resend.adminTo, ...templates.adminAlert(volunteer) }).then((o) => record('admin_alert', o)));
  }
  return Promise.all(jobs);
}

export async function sendDecisionEmail(volunteer) {
  if (!volunteer.email) return record('decision', { status: 'skipped', error: 'Applicant gave no email address' });
  return record('decision', await sendEmail({ to: volunteer.email, ...templates.decision(volunteer) }));
}

export async function sendSignInCode(volunteer, code) {
  return record('sign_in_code', await sendEmail({ to: volunteer.email, ...templates.signInCode(volunteer, code) }));
}
