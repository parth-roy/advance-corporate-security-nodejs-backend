import mongoose, { Schema, Document, Model } from "mongoose";

// ─── Interface ─────────────────────────────────────────────
export interface IContactSubmission extends Document {
  firstName: string;
  lastName: string;
  email: string;
  phone: string;
  organization?: string;
  service?: string;
  city?: string;
  message: string;
  status: "new" | "read" | "replied" | "closed";
  source: string; // URL or page slug
  ipAddress?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ────────────────────────────────────────────────
const ContactSubmissionSchema = new Schema<IContactSubmission>(
  {
    firstName:    { type: String, required: true, trim: true, maxlength: 100 },
    lastName:     { type: String, required: true, trim: true, maxlength: 100 },
    email:        { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    phone:        { type: String, required: true, trim: true, maxlength: 20 },
    organization: { type: String, trim: true, maxlength: 200 },
    service:      { type: String, trim: true, maxlength: 100 },
    city:         { type: String, trim: true, maxlength: 100 },
    message:      { type: String, required: true, trim: true, maxlength: 5000 },
    status:       { type: String, enum: ["new", "read", "replied", "closed"], default: "new" },
    source:       { type: String, default: "website", trim: true },
    ipAddress:    { type: String },
  },
  {
    timestamps: true,   // adds createdAt + updatedAt automatically
    collection: "contact_submissions",
  }
);

// Indexes for admin queries
ContactSubmissionSchema.index({ status: 1, createdAt: -1 });
ContactSubmissionSchema.index({ email: 1 });

export const ContactSubmission: Model<IContactSubmission> =
  mongoose.models.ContactSubmission ||
  mongoose.model<IContactSubmission>("ContactSubmission", ContactSubmissionSchema);
