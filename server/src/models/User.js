import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const { Schema } = mongoose;

// Staff run the registration; officers are approved collation officers who
// sign in to a dashboard for their own LGA or ward only.
export const STAFF_ROLES = ['admin', 'reviewer'];
export const OFFICER_ROLES = ['lga_officer', 'ward_officer'];
export const ROLES = [...STAFF_ROLES, ...OFFICER_ROLES];
// Which sign-in role each officer registration gets.
export const OFFICER_ROLE_FOR = { lga_collation_officer: 'lga_officer', ward_collation_officer: 'ward_officer' };

// What each role may do. Checked by requirePermission(); anything not listed
// is denied. documents:read covers passport photos, voter's cards and selfies.
// Officers get no registration, document, export or staff permissions: their
// dashboard is scoped to their assignment on the server (officer.controller.js).
export const PERMISSIONS = {
  admin: ['agents:read', 'agents:review', 'agents:export', 'agents:delete', 'agents:sensitive:read', 'documents:read', 'audit:read', 'staff:manage', 'reports:export', 'officers:manage'],
  reviewer: ['agents:read', 'agents:review', 'documents:read'],
  lga_officer: ['officer:dashboard'],
  ward_officer: ['officer:dashboard'],
};

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ROLES, default: 'reviewer' },
    active: { type: Boolean, default: true },
    lastLoginAt: Date,
    failedLogins: { type: Number, default: 0, select: false },
    lockedUntil: { type: Date, select: false },
    // Incremented to invalidate every existing session for this user.
    tokenVersion: { type: Number, default: 0 },
    // Officers only: the approved registration and the post it holds. Access
    // is re-checked against the registration on every request.
    assignment: {
      type: new Schema({
        agent: { type: Schema.Types.ObjectId, ref: 'Agent', required: true },
        level: { type: String, enum: ['lga', 'ward'], required: true },
        lga: { type: String, required: true },
        wardCode: String,
        ward: String,
      }, { _id: false }),
      default: undefined,
    },
    // When the account holder last chose their own password (officers start without one).
    passwordSetAt: Date,
    // One-time link for setting a password (officer invitations). Only a hash is stored.
    passwordSetup: {
      type: new Schema({ tokenHash: String, expiresAt: Date }, { _id: false }),
      select: false,
      default: undefined,
    },
  },
  { timestamps: true },
);

userSchema.index({ 'assignment.agent': 1 }, { sparse: true });
userSchema.index({ 'passwordSetup.tokenHash': 1 }, { sparse: true });

userSchema.methods.verifyPassword = function verifyPassword(password) {
  return bcrypt.compare(password, this.passwordHash);
};

userSchema.statics.hashPassword = (password) => bcrypt.hash(password, 12);

userSchema.methods.toSafeJSON = function toSafeJSON() {
  return {
    id: this._id,
    name: this.name,
    email: this.email,
    role: this.role,
    permissions: PERMISSIONS[this.role] ?? [],
    assignment: this.assignment ? { level: this.assignment.level, lga: this.assignment.lga, ward: this.assignment.ward, wardCode: this.assignment.wardCode } : undefined,
    lastLoginAt: this.lastLoginAt,
  };
};

export const User = mongoose.models.User || mongoose.model('User', userSchema);
