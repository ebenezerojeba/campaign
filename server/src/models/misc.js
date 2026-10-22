import mongoose from 'mongoose';

const { Schema } = mongoose;

const announcementSchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 140 },
    body: { type: String, required: true, trim: true, maxlength: 3000 },
    status: { type: String, enum: ['draft', 'published', 'archived'], default: 'draft' },
    publishedAt: Date,
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    isSample: { type: Boolean, default: false },
  },
  { timestamps: true },
);
announcementSchema.index({ status: 1, publishedAt: -1 });

const auditLogSchema = new Schema(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User' },
    actorName: String,
    actorRole: String,
    action: { type: String, required: true }, // e.g. volunteer.status_changed
    targetType: String,
    targetId: String,
    summary: String,
    meta: Schema.Types.Mixed,
    ip: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } },
);
auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ targetType: 1, targetId: 1 });

// One-time sign-in codes for the volunteer portal. Only a hash is stored and
// MongoDB removes expired documents automatically.
const loginCodeSchema = new Schema({
  volunteer: { type: Schema.Types.ObjectId, ref: 'Volunteer', required: true },
  codeHash: { type: String, required: true },
  attempts: { type: Number, default: 0 },
  expiresAt: { type: Date, required: true },
});
loginCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
loginCodeSchema.index({ volunteer: 1 });

// Data subject requests (NDPA 2023): correction, deletion, export.
const dataRequestSchema = new Schema(
  {
    volunteer: { type: Schema.Types.ObjectId, ref: 'Volunteer' },
    reference: String,
    type: { type: String, enum: ['correction', 'deletion', 'export'], required: true },
    details: { type: String, maxlength: 1000 },
    status: { type: String, enum: ['open', 'completed', 'declined'], default: 'open' },
    resolvedBy: { type: Schema.Types.ObjectId, ref: 'User' },
    resolvedAt: Date,
    resolution: { type: String, maxlength: 1000 },
  },
  { timestamps: true },
);
dataRequestSchema.index({ status: 1, createdAt: -1 });

export const Announcement = mongoose.models.Announcement || mongoose.model('Announcement', announcementSchema);
export const AuditLog = mongoose.models.AuditLog || mongoose.model('AuditLog', auditLogSchema);
export const LoginCode = mongoose.models.LoginCode || mongoose.model('LoginCode', loginCodeSchema);
export const DataRequest = mongoose.models.DataRequest || mongoose.model('DataRequest', dataRequestSchema);
