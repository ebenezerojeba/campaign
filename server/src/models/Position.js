import mongoose from 'mongoose';

const { Schema } = mongoose;

// Who holds each polling-unit position. _id is "<pollingUnitCode>|<agentCategory>",
// so MongoDB's unique _id makes it impossible for two registrations to hold
// one position, even when they are submitted at the same moment.
const positionSchema = new Schema(
  {
    _id: { type: String },
    agent: { type: Schema.Types.ObjectId, ref: 'Agent', required: true },
    since: { type: Date, default: Date.now },
  },
  { versionKey: false },
);
positionSchema.index({ agent: 1 });

export const Position = mongoose.models.Position || mongoose.model('Position', positionSchema, 'positions');
