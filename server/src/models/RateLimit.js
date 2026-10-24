import mongoose from 'mongoose';

const { Schema } = mongoose;

// Fixed-window counters shared by every server instance (rate limits and
// sign-in throttling). _id is "<name>:<key>:<window>"; MongoDB removes
// expired windows automatically.
const rateLimitSchema = new Schema(
  {
    _id: { type: String },
    hits: { type: Number, default: 0 },
    expiresAt: { type: Date, required: true },
  },
  { versionKey: false },
);
rateLimitSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const RateLimit = mongoose.models.RateLimit || mongoose.model('RateLimit', rateLimitSchema, 'ratelimits');
