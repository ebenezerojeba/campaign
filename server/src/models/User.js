import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';

const { Schema } = mongoose;

export const ROLES = ['admin', 'reviewer'];

// What each staff role may do. Checked by requirePermission().
// documents:read covers passport photos, voter's cards and selfies; remove it
// from a role to stop that role opening them.
export const PERMISSIONS = {
  admin: ['agents:read', 'agents:review', 'agents:export', 'agents:delete', 'documents:read', 'audit:read', 'staff:manage'],
  reviewer: ['agents:read', 'agents:review', 'documents:read'],
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
  },
  { timestamps: true },
);

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
    lastLoginAt: this.lastLoginAt,
  };
};

export const User = mongoose.models.User || mongoose.model('User', userSchema);
