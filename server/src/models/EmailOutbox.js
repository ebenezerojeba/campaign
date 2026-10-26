import mongoose from 'mongoose';

const { Schema } = mongoose;

export const OUTBOX_TYPES = ['registration_confirmation', 'admin_alert', 'decision', 'admin_digest', 'officer_invite'];
export const OUTBOX_STATUSES = ['queued', 'sending', 'sent', 'failed', 'cancelled'];

// One queued email. Holds references and delivery state only: the message is
// rendered from the registration when it is sent, so no personal data is
// copied here. `key` is unique per registration and email, so the same email
// can never be queued (or sent) twice.
const outboxSchema = new Schema(
  {
    key: { type: String, required: true },
    type: { type: String, enum: OUTBOX_TYPES, required: true },
    agent: { type: Schema.Types.ObjectId, ref: 'Agent' },
    reference: String,
    priority: { type: Number, default: 5 }, // lower is sent first
    status: { type: String, enum: OUTBOX_STATUSES, default: 'queued' },
    attempts: { type: Number, default: 0 },
    nextAttemptAt: { type: Date, default: Date.now },
    leaseUntil: Date, // claim expiry while a send is in progress
    lastAttemptAt: Date,
    sentAt: Date,
    // Diagnostics: codes and a cleaned reason only, never addresses or credentials.
    lastErrorCode: String,
    smtpCode: Number,
    smtpReason: String,
    error: String,
    correlationId: String,
    providerId: String,
    digest: { from: Date, to: Date }, // admin_digest only
    user: { type: Schema.Types.ObjectId, ref: 'User' }, // officer_invite only
  },
  { timestamps: true },
);

outboxSchema.index({ key: 1 }, { unique: true });
outboxSchema.index({ status: 1, priority: 1, nextAttemptAt: 1 });
outboxSchema.index({ agent: 1 });
outboxSchema.index({ createdAt: -1 });

// Shared sending state: the provider back-off pause and the per-minute and
// per-hour send counters. Counter documents expire on their own.
const emailStateSchema = new Schema(
  {
    _id: String,
    count: { type: Number, default: 0 },
    pausedUntil: Date,
    reason: String,
    expiresAt: Date,
  },
  { timestamps: true },
);
emailStateSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const EmailOutbox = mongoose.models.EmailOutbox || mongoose.model('EmailOutbox', outboxSchema, 'emailoutbox');
export const EmailState = mongoose.models.EmailState || mongoose.model('EmailState', emailStateSchema, 'emailstate');
