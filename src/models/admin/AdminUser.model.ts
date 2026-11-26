import mongoose, { Schema, Document, Model } from "mongoose";

export const ADMIN_ROLES = ["super_admin", "admin", "operations", "payroll"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export interface IAdminUser extends Document {
  name: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  passwordHash: string;
  role: AdminRole;
  isActive: boolean;
  failedLoginAttempts: number;
  lockUntil: Date | null;
  lastLoginAt: Date | null;
  lastLoginIp: string | null;
  tokenVersion: number;
  createdAt: Date;
  updatedAt: Date;
}

const AdminUserSchema = new Schema<IAdminUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 150 },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 254,
      index: true,
    },
    phone: { type: String, default: "", trim: true, maxlength: 30 },
    jobTitle: { type: String, default: "", trim: true, maxlength: 120 },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: ADMIN_ROLES, default: "admin" },
    isActive: { type: Boolean, default: true, index: true },
    failedLoginAttempts: { type: Number, default: 0 },
    lockUntil: { type: Date, default: null },
    lastLoginAt: { type: Date, default: null },
    lastLoginIp: { type: String, default: null },
    tokenVersion: { type: Number, default: 0 },
  },
  {
    timestamps: true,
    collection: "admin_users",
  }
);

export const AdminUser: Model<IAdminUser> =
  mongoose.models.AdminUser || mongoose.model<IAdminUser>("AdminUser", AdminUserSchema);
