import mongoose from 'mongoose';
import { OPPORTUNITY_STATUSES } from '../../../shared/options.js';

const { Schema } = mongoose;

const opportunitySchema = new Schema(
  {
    title: { type: String, required: true, trim: true, maxlength: 120 },
    summary: { type: String, required: true, trim: true, maxlength: 280 },
    description: { type: String, trim: true, maxlength: 4000 },
    category: { type: String, required: true },
    skills: { type: [String], default: [] },
    eligibility: { type: String, trim: true, maxlength: 1000 },
    location: {
      lga: String,
      venue: { type: String, maxlength: 160 },
      isRemote: { type: Boolean, default: false },
    },
    startDate: Date,
    endDate: Date,
    commitment: { type: String, maxlength: 120 },
    capacity: { type: Number, min: 0 },
    coverImage: {
      url: String,
      publicId: String,
      alt: { type: String, maxlength: 200 },
    },
    status: { type: String, enum: OPPORTUNITY_STATUSES, default: 'draft' },
    publishedAt: Date,
    interestCount: { type: Number, default: 0 },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    isSample: { type: Boolean, default: false },
  },
  { timestamps: true },
);

opportunitySchema.index({ status: 1, startDate: 1 });
opportunitySchema.index({ category: 1 });

export const Opportunity = mongoose.models.Opportunity || mongoose.model('Opportunity', opportunitySchema);
