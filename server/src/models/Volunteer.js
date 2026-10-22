import mongoose from 'mongoose';
import { VOLUNTEER_STATUSES, valuesOf } from '../../../shared/options.js';

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
    type: { type: String, enum: ['registration_confirmation', 'decision', 'admin_alert', 'sign_in_code'] },
    channel: { type: String, default: 'email' },
    status: { type: String, enum: ['sent', 'failed', 'skipped'] },
    providerId: String,
    error: String,
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const assignmentSchema = new Schema(
  {
    opportunity: { type: Schema.Types.ObjectId, ref: 'Opportunity', required: true },
    status: { type: String, enum: ['interested', 'assigned', 'withdrawn'], default: 'interested' },
    at: { type: Date, default: Date.now },
  },
  { _id: false },
);

const volunteerSchema = new Schema(
  {
    reference: { type: String, required: true, unique: true },
    firstName: { type: String, required: true, trim: true, maxlength: 60 },
    lastName: { type: String, required: true, trim: true, maxlength: 60 },
    email: { type: String, trim: true, lowercase: true, maxlength: 120 },
    phone: { type: String, required: true }, // normalised +234XXXXXXXXXX
    contactMethod: { type: String, required: true },

    state: { type: String, default: 'Lagos' },
    lga: { type: String, required: true },
    lcda: String,
    ward: String,
    community: String,

    interests: { type: [String], default: [] },
    skills: { type: [String], default: [] },
    availability: { type: [String], default: [] },
    participationFormat: String,
    motivation: { type: String, maxlength: 500 },

    consent: {
      processing: { type: Boolean, required: true },
      communications: { type: Boolean, default: false },
      ageConfirmed: { type: Boolean, required: true },
      noticeVersion: String,
      at: { type: Date, default: Date.now },
    },

    status: { type: String, enum: valuesOf(VOLUNTEER_STATUSES), default: 'pending' },
    statusHistory: { type: [statusChangeSchema], default: [] },
    notes: { type: [noteSchema], default: [] },
    notifications: { type: [notificationSchema], default: [] },
    assignments: { type: [assignmentSchema], default: [] },
    reviewedAt: Date,

    // Seeded demonstration records. Never set on real registrations.
    isSample: { type: Boolean, default: false },
  },
  { timestamps: true },
);

volunteerSchema.index({ phone: 1 }, { unique: true });
volunteerSchema.index({ email: 1 }, { unique: true, partialFilterExpression: { email: { $type: 'string', $gt: '' } } });
volunteerSchema.index({ status: 1, createdAt: -1 });
volunteerSchema.index({ lga: 1, status: 1 });
volunteerSchema.index({ interests: 1 });
volunteerSchema.index({ createdAt: -1 });
volunteerSchema.index({ isSample: 1 });

volunteerSchema.virtual('fullName').get(function fullName() {
  return `${this.firstName} ${this.lastName}`;
});

export const Volunteer = mongoose.models.Volunteer || mongoose.model('Volunteer', volunteerSchema);
