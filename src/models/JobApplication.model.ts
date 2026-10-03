import { Schema, model, Document, Types } from "mongoose";

export interface IJobApplication extends Document {
  jobId?: Types.ObjectId | string;
  jobTitle: string;
  jobCity: string;
  applicantName: string;
  applicantPhone: string;
  applicantEmail: string;
  applicantExperience?: string;
  applicantQualification?: string;
  applicantCity?: string;
  message?: string;
  ipAddress?: string;
  status: "applied" | "reviewed" | "shortlisted" | "rejected";
  appliedAt: Date;
}

const JobApplicationSchema = new Schema<IJobApplication>(
  {
    jobId: { type: Schema.Types.Mixed, ref: "Job", index: true },
    jobTitle: { type: String, required: true, trim: true },
    jobCity: { type: String, required: true, trim: true },
    applicantName: { type: String, required: true, trim: true },
    applicantPhone: { type: String, required: true, trim: true },
    applicantEmail: { type: String, required: true, trim: true, lowercase: true },
    applicantExperience: { type: String, trim: true },
    applicantQualification: { type: String, trim: true },
    applicantCity: { type: String, trim: true },
    message: { type: String, trim: true },
    ipAddress: { type: String },
    status: {
      type: String,
      enum: ["applied", "reviewed", "shortlisted", "rejected"],
      default: "applied",
    },
    appliedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export const JobApplication = model<IJobApplication>(
  "JobApplication",
  JobApplicationSchema
);
