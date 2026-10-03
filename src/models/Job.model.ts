import { Schema, model, Document } from "mongoose";

export interface IJob extends Document {
  title: string;
  category: string;
  vacancy: string | number;
  jobType: "Full-time" | "Part-time" | "Both";
  isContractual: boolean;
  workLocationType: "Work from Office" | "Work from Home" | "Field Job";
  city: string;
  locality?: string;
  salaryMin: number;
  salaryMax: number;
  hasIncentives?: boolean;
  incentivesText?: string;
  salaryBreakdown?: {
    basePay?: number;
    pfDeduction?: number;
    esicDeduction?: number;
    incentivesAmount?: number;
    estimatedGross?: number;
  };
  benefits?: string[];
  shift: "Day" | "Night" | "Rotational" | "Flexible";
  workingDays: string;
  requiresDeposit: boolean;
  depositDetails?: string;
  gender: "Male" | "Female" | "Any";
  qualification: string;
  expMin: number;
  expMax: number;
  skills?: string[];
  assetsNeeded?: string[];
  documentsRequired?: string[];
  description: string;
  status: "active" | "closed";
  postedByIp?: string;
  createdAt: Date;
  updatedAt: Date;
}

const JobSchema = new Schema<IJob>(
  {
    title: { type: String, required: true, trim: true, index: true },
    category: { type: String, required: true, trim: true, index: true },
    vacancy: { type: Schema.Types.Mixed, required: true },
    jobType: {
      type: String,
      enum: ["Full-time", "Part-time", "Both"],
      default: "Full-time",
    },
    isContractual: { type: Boolean, default: false },
    workLocationType: {
      type: String,
      enum: ["Work from Office", "Work from Home", "Field Job"],
      default: "Work from Office",
    },
    city: { type: String, required: true, trim: true, index: true },
    locality: { type: String, trim: true },
    salaryMin: { type: Number, required: true },
    salaryMax: { type: Number, required: true },
    hasIncentives: { type: Boolean, default: false },
    incentivesText: { type: String, trim: true },
    salaryBreakdown: {
      basePay: Number,
      pfDeduction: Number,
      esicDeduction: Number,
      incentivesAmount: Number,
      estimatedGross: Number,
    },
    benefits: [{ type: String, trim: true }],
    shift: {
      type: String,
      enum: ["Day", "Night", "Rotational", "Flexible"],
      default: "Day",
    },
    workingDays: { type: String, default: "6 Days Working", trim: true },
    requiresDeposit: { type: Boolean, default: false },
    depositDetails: { type: String, trim: true },
    gender: {
      type: String,
      enum: ["Male", "Female", "Any"],
      default: "Any",
    },
    qualification: { type: String, required: true, trim: true },
    expMin: { type: Number, default: 0 },
    expMax: { type: Number, default: 2 },
    skills: [{ type: String, trim: true }],
    assetsNeeded: [{ type: String, trim: true }],
    documentsRequired: [{ type: String, trim: true }],
    description: { type: String, required: true },
    status: { type: String, enum: ["active", "closed"], default: "active", index: true },
    postedByIp: { type: String },
  },
  { timestamps: true }
);

export const Job = model<IJob>("Job", JobSchema);
