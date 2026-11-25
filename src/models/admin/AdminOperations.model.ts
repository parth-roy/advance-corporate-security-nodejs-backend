import mongoose, { Schema, Document, Model } from "mongoose";

// ─── Recruitment / Candidates ─────────────────────────────────
export type CandidateStatus = "New" | "Shortlisted" | "Selected" | "Rejected";

export interface IAdminCandidate extends Document {
  fullName: string;
  mobile: string;
  email: string;
  position: string;
  location: string;
  experience: string;
  applicationDate: string;
  status: CandidateStatus;
  resumeName: string;
  remarks: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdminCandidateSchema = new Schema<IAdminCandidate>(
  {
    fullName: { type: String, required: true, trim: true, maxlength: 200 },
    mobile: { type: String, required: true, trim: true, maxlength: 30 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    position: { type: String, required: true, trim: true, maxlength: 150 },
    location: { type: String, required: true, trim: true, maxlength: 150 },
    experience: { type: String, default: "Fresher", trim: true },
    applicationDate: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["New", "Shortlisted", "Selected", "Rejected"],
      default: "New",
      index: true,
    },
    resumeName: { type: String, default: "", trim: true },
    remarks: { type: String, default: "", trim: true, maxlength: 2000 },
  },
  { timestamps: true, collection: "admin_candidates" }
);

AdminCandidateSchema.index({ status: 1, createdAt: -1 });

export const AdminCandidate: Model<IAdminCandidate> =
  mongoose.models.AdminCandidate ||
  mongoose.model<IAdminCandidate>("AdminCandidate", AdminCandidateSchema);

// ─── Uniform Inventory ────────────────────────────────────────
export const UNIFORM_CATEGORIES = [
  "Security Uniform",
  "Security Shoes",
  "Shirts",
  "Trousers",
  "Belts",
  "Caps",
  "Winter Uniform",
  "Accessories",
] as const;

export type UniformCategory = (typeof UNIFORM_CATEGORIES)[number];

export interface IAdminUniformItem extends Document {
  name: string;
  category: UniformCategory;
  size: string;
  availableQty: number;
  issuedQty: number;
  lastUpdated: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdminUniformItemSchema = new Schema<IAdminUniformItem>(
  {
    name: { type: String, required: true, trim: true, maxlength: 200 },
    category: { type: String, enum: UNIFORM_CATEGORIES, required: true, index: true },
    size: { type: String, required: true, trim: true, maxlength: 50 },
    availableQty: { type: Number, required: true, min: 0, default: 0 },
    issuedQty: { type: Number, required: true, min: 0, default: 0 },
    lastUpdated: { type: String, required: true, trim: true },
  },
  { timestamps: true, collection: "admin_uniform_items" }
);

export const AdminUniformItem: Model<IAdminUniformItem> =
  mongoose.models.AdminUniformItem ||
  mongoose.model<IAdminUniformItem>("AdminUniformItem", AdminUniformItemSchema);

// ─── Uniform Issue Records ────────────────────────────────────
export interface IAdminUniformIssue extends Document {
  employeeId: string;
  employeeName: string;
  site: string;
  itemId: string;
  itemName: string;
  size: string;
  quantity: number;
  issueDate: string;
  returnDate?: string;
  status: "Issued" | "Returned";
  createdAt: Date;
  updatedAt: Date;
}

const AdminUniformIssueSchema = new Schema<IAdminUniformIssue>(
  {
    employeeId: { type: String, required: true, trim: true, index: true },
    employeeName: { type: String, required: true, trim: true },
    site: { type: String, required: true, trim: true },
    itemId: { type: String, required: true, trim: true, index: true },
    itemName: { type: String, required: true, trim: true },
    size: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    issueDate: { type: String, required: true, trim: true },
    returnDate: { type: String, trim: true },
    status: { type: String, enum: ["Issued", "Returned"], default: "Issued", index: true },
  },
  { timestamps: true, collection: "admin_uniform_issues" }
);

export const AdminUniformIssue: Model<IAdminUniformIssue> =
  mongoose.models.AdminUniformIssue ||
  mongoose.model<IAdminUniformIssue>("AdminUniformIssue", AdminUniformIssueSchema);

// ─── Uniform Stock Logs ───────────────────────────────────────
export interface IAdminUniformStockLog extends Document {
  itemName: string;
  action: "Added" | "Restocked" | "Issued" | "Returned";
  quantity: number;
  date: string;
  note: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdminUniformStockLogSchema = new Schema<IAdminUniformStockLog>(
  {
    itemName: { type: String, required: true, trim: true },
    action: {
      type: String,
      enum: ["Added", "Restocked", "Issued", "Returned"],
      required: true,
    },
    quantity: { type: Number, required: true },
    date: { type: String, required: true, trim: true },
    note: { type: String, default: "", trim: true },
  },
  { timestamps: true, collection: "admin_uniform_stock_logs" }
);

export const AdminUniformStockLog: Model<IAdminUniformStockLog> =
  mongoose.models.AdminUniformStockLog ||
  mongoose.model<IAdminUniformStockLog>("AdminUniformStockLog", AdminUniformStockLogSchema);

// ─── Attendance ───────────────────────────────────────────────
export const ATTENDANCE_STATUSES = [
  "Present",
  "Absent",
  "Half Day",
  "Leave",
  "Weekly Off",
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export interface IAdminAttendance extends Document {
  employeeId: string;
  employeeName: string;
  designation: string;
  location: string;
  date: string;
  checkIn: string;
  checkOut: string;
  workingHours: string;
  status: AttendanceStatus;
  createdAt: Date;
  updatedAt: Date;
}

const AdminAttendanceSchema = new Schema<IAdminAttendance>(
  {
    employeeId: { type: String, required: true, trim: true, index: true },
    employeeName: { type: String, required: true, trim: true },
    designation: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    date: { type: String, required: true, trim: true, index: true },
    checkIn: { type: String, default: "—", trim: true },
    checkOut: { type: String, default: "—", trim: true },
    workingHours: { type: String, default: "0h 00m", trim: true },
    status: {
      type: String,
      enum: ATTENDANCE_STATUSES,
      default: "Present",
      index: true,
    },
  },
  { timestamps: true, collection: "admin_attendance" }
);

AdminAttendanceSchema.index({ date: -1, employeeId: 1 });

export const AdminAttendance: Model<IAdminAttendance> =
  mongoose.models.AdminAttendance ||
  mongoose.model<IAdminAttendance>("AdminAttendance", AdminAttendanceSchema);
