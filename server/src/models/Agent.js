import mongoose from 'mongoose';
import { AGENT_CATEGORIES, REGISTRATION_STATUSES, valuesOf } from '../../../shared/options.js';

const { Schema } = mongoose;

const noteSchema = new Schema(
  {
    body: { type: String, required: true, maxlength: 2000 },
    author: { type: Schema.Types.ObjectId, ref: 'User' },
    authorName: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);

const statusChangeSchema = new Schema(
  {
    from: String,
    to: String,
    reason: { type: String, maxlength: 500 },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    byName: String,
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

// Delivery record for every transactional message, for troubleshooting.
const notificationSchema = new Schema(
  {
    type: { type: String, enum: ['registration_confirmation', 'decision', 'admin_alert'] },
    channel: { type: String, default: 'email' },
    status: { type: String, enum: ['sent', 'failed', 'skipped'] },
    providerId: String,
    error: String,
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

// An uploaded file kept in the GridFS bucket "agentDocuments". Only staff
// with documents:read can fetch the bytes (see admin.controller.js).
const documentSchema = new Schema(
  {
    fileId: { type: Schema.Types.ObjectId, required: true },
    contentType: { type: String, required: true },
    bytes: Number,
    width: Number,
    height: Number,
    sha256: { type: String, required: true },
    uploadedAt: { type: Date, default: Date.now },
  },
  { _id: false },
);

const agentSchema = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    firstName: { type: String, required: true, trim: true, maxlength: 60 },
    middleName: { type: String, trim: true, maxlength: 60 },
    lastName: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 120 },
    phone: { type: String, required: true }, // normalised +234XXXXXXXXXX
    dateOfBirth: String, // YYYY-MM-DD, only when the field is switched on
    // NIN is encrypted at rest (AES-256-GCM). The last 4 digits are kept for
    // search, and a keyed hash finds duplicates without revealing the number.
    nin: {
      encrypted: { type: String, select: false },
      last4: String,
      hash: { type: String, select: false },
    },
    bankDetails: {
      bankName: String,
      accountNameEncrypted: { type: String, select: false },
      accountNumberEncrypted: { type: String, select: false },
      accountNumberLast4: String,
    },
    identityDetails: {
      voterRegistrationNumberEncrypted: { type: String, select: false },
      voterRegistrationNumberLast4: String,
      apcPartyCardNumberEncrypted: { type: String, select: false },
      apcPartyCardNumberLast4: String,
    },
    stateOfOrigin: { type: String, required: true },
    lgaOfOrigin: { type: String, required: true },

    agentCategory: { type: String, enum: valuesOf(AGENT_CATEGORIES), required: true },

    // Polling unit served. Names are copied from the official INEC data in
    // pollingunit/, never from the browser.
    state: { type: String, default: 'Lagos' },
    lga: { type: String, required: true },
    senatorialDistrict: String,
    ward: String,
    wardCode: String,
    pollingUnit: String,
    pollingUnitCode: String, // INEC delimitation code, e.g. 24-01-01-001

    documents: {
      passport: documentSchema,
      pvc: documentSchema,
      selfie: documentSchema,
    },

    consent: {
      processing: { type: Boolean, required: true },
      sensitiveData: { type: Boolean, required: true },
      financialIdentity: { type: Boolean, default: false },
      declarationAccurate: { type: Boolean, required: true },
      ageConfirmed: { type: Boolean, required: true },
      noticeVersion: String,
      at: { type: Date, default: Date.now },
    },

    status: { type: String, enum: valuesOf(REGISTRATION_STATUSES), default: 'pending' },
    statusHistory: { type: [statusChangeSchema], default: [] },
    notes: { type: [noteSchema], default: [] },
    notifications: { type: [notificationSchema], default: [] },
    reviewedAt: Date,

    // Seeded demonstration records. Never set on real registrations.
    isSample: { type: Boolean, default: false },
  },
  { timestamps: true },
);

agentSchema.index({ phone: 1 }, { unique: true });
agentSchema.index({ email: 1 }, { unique: true });
agentSchema.index({ status: 1, createdAt: -1 });
agentSchema.index({ agentCategory: 1, status: 1 });
agentSchema.index({ lga: 1, wardCode: 1, pollingUnitCode: 1 });
agentSchema.index({ stateOfOrigin: 1, lgaOfOrigin: 1 });
agentSchema.index({ 'documents.pvc.sha256': 1 });
agentSchema.index({ 'nin.last4': 1 });
agentSchema.index({ 'nin.hash': 1 }, { unique: true, partialFilterExpression: { 'nin.hash': { $type: 'string' } } });
agentSchema.index({ createdAt: -1 });
agentSchema.index({ isSample: 1 });

export const Agent = mongoose.models.Agent || mongoose.model('Agent', agentSchema);
