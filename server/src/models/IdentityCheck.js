import mongoose from 'mongoose';

const { Schema } = mongoose;

// Results of the voter's card and face checks, kept apart from the
// registration itself. Never stores the VIN, the card's text or any image:
// only outcomes, distances and who ran the check.
const identityCheckSchema = new Schema(
  {
    agent: { type: Schema.Types.ObjectId, ref: 'Agent', required: true },
    // 'applicant': run in the applicant's browser before submitting (not trusted).
    // 'reviewer': run by a signed-in reviewer; the VIN comparison is made on the server.
    source: { type: String, enum: ['applicant', 'reviewer'], required: true },
    by: { type: Schema.Types.ObjectId, ref: 'User' },
    byName: String,
    vin: {
      result: { type: String, enum: ['match', 'close', 'mismatch', 'unreadable', 'skipped'] },
      distance: Number,
      applicantConfirmed: Boolean, // applicant saw a warning and kept their VIN
    },
    name: { type: String, enum: ['found', 'not_found', 'unknown'] },
    dateOfBirth: { type: String, enum: ['found', 'not_found', 'unknown'] },
    face: {
      result: { type: String, enum: ['match', 'uncertain', 'different', 'no_face', 'skipped'] },
      distance: Number,
    },
    flagged: { type: Boolean, default: false },
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
identityCheckSchema.index({ agent: 1, createdAt: -1 });
identityCheckSchema.index({ flagged: 1, source: 1 });

export const IdentityCheck = mongoose.models.IdentityCheck || mongoose.model('IdentityCheck', identityCheckSchema, 'identitychecks');

// Only confident results raise a flag (and so need a reason to approve): a
// clean VIN reading that is clearly different, or a strongly different face.
// Uncertain readings, typos the applicant confirmed, and "not found" results
// are shown to the reviewer as information only.
export const isFlagged = (c) => Boolean(c && (c.vin?.result === 'mismatch' || c.face?.result === 'different'));
