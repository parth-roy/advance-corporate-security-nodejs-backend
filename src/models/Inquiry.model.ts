import mongoose, { Schema, Document, Model } from "mongoose";

// ─── Interface ─────────────────────────────────────────────
export interface IInquiry extends Document {
  name: string;
  email: string;
  phone: string;
  service: string;
  city?: string;
  manpowerCount?: number;
  duration?: string;
  message?: string;
  status: "new" | "in-progress" | "quoted" | "closed";
  ipAddress?: string;
  createdAt: Date;
  updatedAt: Date;
}

// ─── Schema ────────────────────────────────────────────────
const InquirySchema = new Schema<IInquiry>(
  {
    name:           { type: String, required: true, trim: true, maxlength: 200 },
    email:          { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    phone:          { type: String, required: true, trim: true, maxlength: 20 },
    service:        { type: String, required: true, trim: true, maxlength: 150 },
    city:           { type: String, trim: true, maxlength: 100 },
    manpowerCount:  { type: Number, min: 1 },
    duration:       { type: String, trim: true, maxlength: 100 },
    message:        { type: String, trim: true, maxlength: 5000 },
    status:         { type: String, enum: ["new", "in-progress", "quoted", "closed"], default: "new" },
    ipAddress:      { type: String },
  },
  {
    timestamps: true,
    collection: "inquiries",
  }
);

InquirySchema.index({ status: 1, createdAt: -1 });
InquirySchema.index({ service: 1 });

export const Inquiry: Model<IInquiry> =
  mongoose.models.Inquiry ||
  mongoose.model<IInquiry>("Inquiry", InquirySchema);
