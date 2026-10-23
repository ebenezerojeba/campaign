// Email outbox: registrations queue their emails here and a paced sender
// delivers them within the SMTP provider's limits.
//
// - Queuing never touches the registration's own success: the record is
//   already saved when emails are queued, and queuing errors are logged only.
// - Each email has a unique key (registration + type), so retries and
//   concurrent senders can never queue or send the same email twice.
// - Sends are claimed atomically with a short lease, counted against
//   per-minute and per-hour budgets, and stop at once when the provider asks
//   us to slow down (SMTP 4xx such as Hostinger's 451 domain rate limit).
// - Temporary failures retry with bounded exponential backoff; permanent
//   ones (5xx, bad address) do not. Nothing retries forever.
// - Historical failures are never resent automatically.
import { waitUntil } from '@vercel/functions';
import { env } from '../config/env.js';
import { connectDb } from '../config/db.js';
import { Agent } from '../models/Agent.js';
import { EmailOutbox, EmailState } from '../models/EmailOutbox.js';
import { sendEmail } from './email.js';
import * as templates from './emailTemplates.js';

// Retry delays after the 1st, 2nd... failed attempt. After the last one the
// email is marked failed and kept for manual recovery.
export const RETRY_DELAYS_MIN = [5, 15, 45, 120, 360];
export const MAX_ATTEMPTS = RETRY_DELAYS_MIN.length + 1;
const LEASE_MS = 2 * 60 * 1000;
// How long all sending pauses after the provider refuses for rate or capacity reasons.
// A rate-limit pause is short because Hostinger's allowance refills
// continuously (about 3 a minute); it is set by EMAIL_RATE_LIMIT_PAUSE_SECONDS.
const PROVIDER_PAUSE_MS = { rateLimited: env.outbox.rateLimitPauseSeconds * 1000, auth: 30 * 60 * 1000, unreachable: 2 * 60 * 1000, notConfigured: 15 * 60 * 1000 };

const PRIORITY = { registration_confirmation: 1, decision: 2, admin_alert: 3, admin_digest: 3 };
const STATE_ID = 'smtp';

// ---------- Queueing ----------

async function insertIgnoringDuplicates(entries) {
  if (!entries.length) return 0;
  try {
    const res = await EmailOutbox.insertMany(entries, { ordered: false });
    return res.length;
  } catch (err) {
    // Duplicate keys mean the email is already queued: exactly what we want.
    if (err?.code === 11000 || err?.writeErrors?.every?.((e) => e.code === 11000 || e.err?.code === 11000)) return err.insertedDocs?.length ?? 0;
    throw err;
  }
}

export async function queueRegistrationEmails(agent) {
  const entries = [{ key: `${agent._id}:registration_confirmation`, type: 'registration_confirmation', agent: agent._id, reference: agent.reference, priority: PRIORITY.registration_confirmation }];
  if (env.smtp.adminTo && env.outbox.adminAlertMode === 'instant') {
    entries.push({ key: `${agent._id}:admin_alert`, type: 'admin_alert', agent: agent._id, reference: agent.reference, priority: PRIORITY.admin_alert });
  }
  return insertIgnoringDuplicates(entries);
}

// One decision email per status change (the history length identifies it).
export async function queueDecisionEmail(agent) {
  return insertIgnoringDuplicates([{ key: `${agent._id}:decision:${agent.statusHistory.length}`, type: 'decision', agent: agent._id, reference: agent.reference, priority: PRIORITY.decision }]);
}

const hourStart = (d) => new Date(Math.floor(d.getTime() / 3600e3) * 3600e3);

// Digest mode: one summary per completed hour that had registrations.
async function queueDigestIfDue(now) {
  if (env.outbox.adminAlertMode !== 'digest' || !env.smtp.adminTo) return;
  const to = hourStart(now);
  const from = new Date(to.getTime() - 3600e3);
  if (!(await Agent.exists({ createdAt: { $gte: from, $lt: to }, isSample: { $ne: true } }))) return;
  await insertIgnoringDuplicates([{ key: `admin_digest:${from.toISOString()}`, type: 'admin_digest', priority: PRIORITY.admin_digest, digest: { from, to } }]);
}

// ---------- Budget and provider pause ----------

async function pausedUntil(now) {
  const s = await EmailState.findById(STATE_ID).lean();
  return s?.pausedUntil && s.pausedUntil > now ? s.pausedUntil : null;
}

async function pause(now, ms, reason) {
  await EmailState.updateOne({ _id: STATE_ID }, { $max: { pausedUntil: new Date(now.getTime() + ms) }, $set: { reason } }, { upsert: true });
}

// Takes one slot from a fixed window if any are left. A conditional upsert
// that fails with a duplicate key means the window is full.
async function takeSlot(id, max, expiresAt) {
  try {
    await EmailState.updateOne({ _id: id, count: { $lt: max } }, { $inc: { count: 1 }, $setOnInsert: { expiresAt } }, { upsert: true });
    return true;
  } catch (err) {
    if (err?.code === 11000) return false;
    throw err;
  }
}

async function takeBudget(now) {
  const minute = now.toISOString().slice(0, 16);
  const hour = now.toISOString().slice(0, 13);
  if (!(await takeSlot(`m:${minute}`, env.outbox.maxPerMinute, new Date(now.getTime() + 2 * 60e3)))) return false;
  return takeSlot(`h:${hour}`, env.outbox.maxPerHour, new Date(now.getTime() + 2 * 3600e3));
}

// ---------- Classifying failures ----------

const TRANSIENT_CODES = new Set(['ETIMEDOUT', 'ECONNECTION', 'ESOCKET', 'EDNS', 'ETLS', 'ECONNRESET']);

export function classify(result) {
  if (result.status === 'sent') return { kind: 'sent' };
  if (result.status === 'skipped') {
    return /not configured/i.test(result.error ?? '') ? { kind: 'retry', pause: 'notConfigured' } : { kind: 'permanent' };
  }
  const code = Number(result.smtpCode) || 0;
  if (result.errorCode === 'EAUTH') return { kind: 'retry', pause: 'auth' };
  if (code >= 400 && code < 500) return { kind: 'retry', pause: /rate ?limit|too many|try again later/i.test(result.smtpReason ?? '') || code === 421 || code === 451 ? 'rateLimited' : undefined };
  if (code >= 500) return { kind: 'permanent' };
  if (TRANSIENT_CODES.has(result.errorCode)) return { kind: 'retry', pause: 'unreachable' };
  if (result.rejected > 0) return { kind: 'permanent' };
  return { kind: 'retry' };
}

// ---------- Rendering ----------

const AGENT_FIELDS = 'reference firstName email agentCategory lga ward wardCode pollingUnit pollingUnitCode senatorialDistrict status';

async function render(entry) {
  if (entry.type === 'admin_digest') {
    const match = { createdAt: { $gte: entry.digest.from, $lt: entry.digest.to }, isSample: { $ne: true } };
    const [count, byType, topLgas] = await Promise.all([
      Agent.countDocuments(match),
      Agent.aggregate([{ $match: match }, { $group: { _id: '$agentCategory', count: { $sum: 1 } } }, { $sort: { count: -1 } }]),
      Agent.aggregate([{ $match: match }, { $group: { _id: '$lga', count: { $sum: 1 } } }, { $sort: { count: -1 } }, { $limit: 5 }]),
    ]);
    return { to: env.smtp.adminTo, ...templates.adminDigest({ ...entry.digest, count, byType: byType.map((t) => ({ type: t._id, count: t.count })), topLgas: topLgas.map((l) => ({ lga: l._id, count: l.count })) }) };
  }
  const agent = await Agent.findById(entry.agent).select(AGENT_FIELDS).lean();
  if (!agent) return null; // registration deleted: nothing to send
  if (entry.type === 'registration_confirmation') return { to: agent.email, ...templates.registrationConfirmation(agent) };
  if (entry.type === 'admin_alert') return { to: env.smtp.adminTo, ...templates.adminAlert(agent) };
  if (entry.type === 'decision') return { to: agent.email, ...templates.decision(agent) };
  return null;
}

// Mirrors the final outcome onto the registration so the admin page keeps
// showing delivery history.
async function recordOnAgent(entry, outcome) {
  if (!entry.agent || entry.type === 'admin_digest') return;
  const status = outcome.status === 'sent' ? 'sent' : outcome.status === 'cancelled' ? 'skipped' : 'failed';
  await Agent.updateOne({ _id: entry.agent }, { $push: { notifications: {
    type: entry.type, channel: 'email', status, at: new Date(),
    providerId: outcome.providerId, correlationId: outcome.correlationId, smtpResponse: outcome.smtpResponse,
    smtpCode: outcome.smtpCode, accepted: outcome.accepted, rejected: outcome.rejected, error: outcome.error,
  } } }).catch((err) => console.error('[outbox] could not record outcome on registration', err.message));
}

// ---------- Sending ----------

// When per-registration admin alerts are switched off (digest or off mode),
// alerts still waiting are cancelled, not sent: registrations stay visible in
// the dashboard, and the sending allowance goes to applicants.
async function cancelAdminAlertsIfOff() {
  if (env.outbox.adminAlertMode === 'instant') return;
  await EmailOutbox.updateMany(
    { type: 'admin_alert', status: 'queued' },
    { $set: { status: 'cancelled', error: `Admin alerts switched off (ADMIN_ALERT_MODE=${env.outbox.adminAlertMode})` } },
  );
}

async function claim(now) {
  const typeFilter = env.outbox.adminAlertMode === 'instant' ? {} : { type: { $ne: 'admin_alert' } };
  return EmailOutbox.findOneAndUpdate(
    { ...typeFilter, $or: [{ status: 'queued', nextAttemptAt: { $lte: now } }, { status: 'sending', leaseUntil: { $lt: now } }] },
    { $set: { status: 'sending', leaseUntil: new Date(now.getTime() + LEASE_MS), lastAttemptAt: now }, $inc: { attempts: 1 } },
    { sort: { priority: 1, nextAttemptAt: 1 }, new: true },
  ).lean();
}

async function release(entry) {
  // Budget ran out after the claim: hand the email back without using an attempt.
  await EmailOutbox.updateOne({ _id: entry._id, status: 'sending' }, { $set: { status: 'queued' }, $unset: { leaseUntil: 1 }, $inc: { attempts: -1 } });
}

async function deliverOne(entry, now) {
  const message = await render(entry);
  if (!message) {
    await EmailOutbox.updateOne({ _id: entry._id }, { $set: { status: 'cancelled', error: 'Registration no longer exists' }, $unset: { leaseUntil: 1 } });
    return { outcome: 'cancelled' };
  }
  const result = await sendEmail({ ...message, workflow: entry.type });
  const verdict = classify(result);
  const diagnostics = { correlationId: result.correlationId, lastErrorCode: result.errorCode, smtpCode: result.smtpCode, smtpReason: result.smtpReason ?? result.smtpResponse, error: result.error };

  if (verdict.kind === 'sent') {
    await EmailOutbox.updateOne({ _id: entry._id }, { $set: { status: 'sent', sentAt: new Date(), providerId: result.providerId, ...diagnostics }, $unset: { leaseUntil: 1 } });
    await recordOnAgent(entry, result);
    return { outcome: 'sent' };
  }
  if (verdict.pause) await pause(now, PROVIDER_PAUSE_MS[verdict.pause], verdict.pause);
  if (verdict.kind === 'permanent' || entry.attempts >= MAX_ATTEMPTS) {
    await EmailOutbox.updateOne({ _id: entry._id }, { $set: { status: 'failed', ...diagnostics }, $unset: { leaseUntil: 1 } });
    await recordOnAgent(entry, { ...result, status: 'failed' });
    return { outcome: 'failed', pause: verdict.pause };
  }
  const delay = RETRY_DELAYS_MIN[Math.min(entry.attempts - 1, RETRY_DELAYS_MIN.length - 1)] * 60e3;
  await EmailOutbox.updateOne({ _id: entry._id }, { $set: { status: 'queued', nextAttemptAt: new Date(now.getTime() + delay), ...diagnostics }, $unset: { leaseUntil: 1 } });
  return { outcome: 'retry', pause: verdict.pause };
}

// Sends up to `max` due emails within the budget and time limit. Safe to call
// from many requests at once.
export async function drainOutbox({ max = 3, now = () => new Date(), timeLimitMs = 15000 } = {}) {
  const started = Date.now();
  const summary = { sent: 0, retry: 0, failed: 0, cancelled: 0, stoppedBy: null };
  await queueDigestIfDue(now()).catch((err) => console.error('[outbox] digest queue failed', err.message));
  await cancelAdminAlertsIfOff().catch((err) => console.error('[outbox] admin alert cancel failed', err.message));
  for (let i = 0; i < max; i += 1) {
    if (Date.now() - started > timeLimitMs) { summary.stoppedBy = 'time'; break; }
    const t = now();
    if (await pausedUntil(t)) { summary.stoppedBy = 'paused'; break; }
    const entry = await claim(t);
    if (!entry) { summary.stoppedBy = 'empty'; break; }
    if (!(await takeBudget(t))) { await release(entry); summary.stoppedBy = 'budget'; break; }
    const { outcome, pause: paused } = await deliverOne(entry, t);
    summary[outcome] += 1;
    if (paused) { summary.stoppedBy = 'paused'; break; }
  }
  return summary;
}

// ---------- Background trigger ----------

let lastKick = 0;

// Starts a small drain without delaying the response. On Vercel the work is
// kept alive with waitUntil; elsewhere it runs as a detached promise. At most
// one kick per instance every few seconds.
export function kickOutbox({ max = 2, minIntervalMs = 5000 } = {}) {
  if (env.NODE_ENV === 'test') return;
  const nowMs = Date.now();
  if (nowMs - lastKick < minIntervalMs) return;
  lastKick = nowMs;
  const work = connectDb().then(() => drainOutbox({ max })).catch((err) => console.error('[outbox] drain failed', err?.code ?? err?.name));
  if (env.onVercel) {
    try { waitUntil(work); } catch { /* outside a request: the promise still runs */ }
  }
}

// ---------- Diagnostics ----------

export async function outboxStatus(now = new Date()) {
  const since = new Date(now.getTime() - 24 * 3600e3);
  const [byStatus, recentReasons, state, hourUsed, oldestQueued] = await Promise.all([
    EmailOutbox.aggregate([{ $group: { _id: { type: '$type', status: '$status' }, n: { $sum: 1 } } }]),
    EmailOutbox.aggregate([{ $match: { updatedAt: { $gte: since }, smtpCode: { $exists: true }, status: { $ne: 'sent' } } }, { $group: { _id: { code: '$smtpCode', reason: '$smtpReason' }, n: { $sum: 1 }, last: { $max: '$updatedAt' } } }, { $sort: { last: -1 } }, { $limit: 5 }]),
    EmailState.findById(STATE_ID).lean(),
    EmailState.findById(`h:${now.toISOString().slice(0, 13)}`).lean(),
    EmailOutbox.findOne({ status: { $in: ['queued', 'sending'] } }).sort({ createdAt: 1 }).select('createdAt').lean(),
  ]);
  const counts = {};
  for (const { _id, n } of byStatus) counts[_id.type] = { ...(counts[_id.type] ?? {}), [_id.status]: n };
  return {
    counts,
    pausedUntil: state?.pausedUntil && state.pausedUntil > now ? state.pausedUntil : null,
    pauseReason: state?.pausedUntil && state.pausedUntil > now ? state.reason : null,
    sentThisHour: hourUsed?.count ?? 0,
    limits: { perMinute: env.outbox.maxPerMinute, perHour: env.outbox.maxPerHour },
    adminAlertMode: env.outbox.adminAlertMode,
    oldestQueuedAt: oldestQueued?.createdAt ?? null,
    recentRefusals: recentReasons.map((r) => ({ code: r._id.code, reason: r._id.reason, count: r.n, last: r.last })),
  };
}
