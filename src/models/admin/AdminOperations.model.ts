import mongoose, { Schema, Document, Model } from "mongoose";
import {
  CandidateDocumentsSchema,
  FamilyMemberSchema,
  IAcademicQualificationDocs,
  ICandidateDocuments,
  IFamilyMember,
  IUploadedDocumentFile,
  UploadedDocumentFileSchema,
} from "./sharedSchemas";

export type {
  IAcademicQualificationDocs,
  ICandidateDocuments,
  IFamilyMember,
  IUploadedDocumentFile,
};

// ─── Recruitment / Candidates ─────────────────────────────────
export type CandidateStatus = "New" | "Shortlisted" | "Selected" | "Rejected";

export interface IAdminCandidate extends Document {
  employeeId?: string;
  siteId?: mongoose.Types.ObjectId | null;
  convertedEmployeeObjectId?: mongoose.Types.ObjectId | null;
  convertedAt?: string;
  fullName: string;
  fatherOrHusbandName?: string;
  dateOfBirth?: string;
  permanentAddress?: string;
  presentAddress?: string;
  maritalStatus?: string;
  highestQualification?: string;
  mobile: string;
  email: string;
  height?: string;
  weight?: string;
  chest?: string;
  position: string;
  identificationMark?: string;
  identificationMarks?: string[];
  location: string;
  experience: string;
  serviceCategory?: string;
  reference?: string;
  applicationDate: string;
  status: CandidateStatus;
  dateOfJoining?: string;
  joiningAs?: string;
  salary?: string;
  nomineeName?: string;
  esiHolder?: "Yes" | "No" | "";
  esiNumber?: string;
  uanNumber?: string;
  familyMembers?: IFamilyMember[];
  documents?: ICandidateDocuments;
  declarationAccepted?: boolean;
  declarationDate?: string;
  declarationPlace?: string;
  applicantSignature?: string;
  resumeName: string;
  remarks: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdminCandidateSchema = new Schema<IAdminCandidate>(
  {
    employeeId: { type: String, default: "", trim: true, uppercase: true, maxlength: 60, index: true },
    siteId: { type: Schema.Types.ObjectId, ref: "AdminSite", default: null, index: true },
    convertedEmployeeObjectId: {
      type: Schema.Types.ObjectId,
      ref: "AdminEmployee",
      default: null,
      index: true,
    },
    convertedAt: { type: String, default: "", trim: true },
    fullName: { type: String, required: true, trim: true, maxlength: 200 },
    fatherOrHusbandName: { type: String, trim: true, maxlength: 200 },
    dateOfBirth: { type: String, trim: true },
    permanentAddress: { type: String, trim: true, maxlength: 1000 },
    presentAddress: { type: String, trim: true, maxlength: 1000 },
    maritalStatus: { type: String, trim: true, maxlength: 50 },
    highestQualification: { type: String, trim: true, maxlength: 150 },
    mobile: { type: String, required: true, trim: true, maxlength: 30 },
    email: { type: String, default: "", trim: true, lowercase: true, maxlength: 254 },
    height: { type: String, trim: true, maxlength: 50 },
    weight: { type: String, trim: true, maxlength: 50 },
    chest: { type: String, trim: true, maxlength: 50 },
    position: { type: String, required: true, trim: true, maxlength: 150 },
    identificationMark: { type: String, trim: true, maxlength: 1000 },
    identificationMarks: { type: [String], default: [] },
    location: { type: String, required: true, trim: true, maxlength: 150 },
    experience: { type: String, default: "", trim: true },
    serviceCategory: { type: String, default: "", trim: true, maxlength: 100 },
    reference: { type: String, trim: true, maxlength: 250 },
    applicationDate: { type: String, required: true, trim: true },
    status: {
      type: String,
      enum: ["New", "Shortlisted", "Selected", "Rejected"],
      default: "New",
      index: true,
    },
    dateOfJoining: { type: String, trim: true },
    joiningAs: { type: String, trim: true, maxlength: 150 },
    salary: { type: String, trim: true, maxlength: 100 },
    nomineeName: { type: String, trim: true, maxlength: 200 },
    esiHolder: { type: String, enum: ["Yes", "No", ""], default: "" },
    esiNumber: { type: String, trim: true, maxlength: 100 },
    uanNumber: { type: String, trim: true, maxlength: 100 },
    familyMembers: [FamilyMemberSchema],
    documents: { type: CandidateDocumentsSchema, default: {} },
    declarationAccepted: { type: Boolean, default: false },
    declarationDate: { type: String, trim: true },
    declarationPlace: { type: String, trim: true, maxlength: 150 },
    applicantSignature: { type: String, trim: true, maxlength: 200 },
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
  "Shirt",
  "T-Shirt",
  "Pant",
  "Belt",
  "Shoe",
  "Badge",
  "Cap",
  "Lanyard + Whistle",
  "Safety Shoe",
  "Safety Gloves",
  "Jacket",
  "Safety Helmet",
  "ID Card",
] as const;

export type UniformCategory = (typeof UNIFORM_CATEGORIES)[number];

export interface IAdminUniformItem extends Document {
  name: string;
  category: UniformCategory;
  subCategory?: string;
  size: string;
  unitPrice: number;
  availableQty: number;
  issuedQty: number;
  lastUpdated: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdminUniformItemSchema = new Schema<IAdminUniformItem>(
  {
    name: { type: String, default: "", trim: true, maxlength: 200 },
    category: { type: String, enum: UNIFORM_CATEGORIES, required: true, index: true },
    subCategory: { type: String, default: "", trim: true, maxlength: 120 },
    size: { type: String, required: true, trim: true, maxlength: 50 },
    unitPrice: { type: Number, default: 0, min: 0 },
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
export const UNIFORM_ISSUE_MODES = ["INDIVIDUAL", "BULK_SITE"] as const;
export type UniformIssueMode = (typeof UNIFORM_ISSUE_MODES)[number];

export interface IAdminUniformIssue extends Document {
  batchId?: string;
  issueMode: UniformIssueMode;
  serialNo: string;
  siteId?: mongoose.Types.ObjectId | null;
  employeeObjectId?: mongoose.Types.ObjectId | null;
  employeeId: string;
  legacyEmpCode: string;
  employeeName: string;
  mobile: string;
  site: string;
  itemId: string;
  itemName: string;
  category?: string;
  subCategory?: string;
  size: string;
  quantity: number;
  returnedQty: number;
  returnedAmount: number;
  unitPrice: number;
  registrationCharge: number;
  totalAmount: number;
  issueDate: string;
  returnDate?: string;
  issuedBy: string;
  receivedBy: string;
  verifiedBy: string;
  originalDocHeld: string;
  billToSite: boolean;
  recoveryPlanId?: mongoose.Types.ObjectId | null;
  remarks?: string;
  status: "Issued" | "Returned";
  createdAt: Date;
  updatedAt: Date;
}

const AdminUniformIssueSchema = new Schema<IAdminUniformIssue>(
  {
    batchId: { type: String, default: "", trim: true, index: true },
    issueMode: { type: String, enum: UNIFORM_ISSUE_MODES, default: "INDIVIDUAL", index: true },
    serialNo: { type: String, default: "", trim: true, maxlength: 60 },
    siteId: { type: Schema.Types.ObjectId, ref: "AdminSite", default: null, index: true },
    employeeObjectId: {
      type: Schema.Types.ObjectId,
      ref: "AdminEmployee",
      default: null,
      index: true,
    },
    employeeId: { type: String, required: true, trim: true, index: true },
    legacyEmpCode: { type: String, default: "", trim: true, maxlength: 60 },
    employeeName: { type: String, required: true, trim: true },
    mobile: { type: String, default: "", trim: true, maxlength: 30 },
    site: { type: String, required: true, trim: true, index: true },
    itemId: { type: String, required: true, trim: true, index: true },
    itemName: { type: String, required: true, trim: true },
    category: { type: String, default: "", trim: true },
    subCategory: { type: String, default: "", trim: true },
    size: { type: String, required: true, trim: true },
    quantity: { type: Number, required: true, min: 1 },
    returnedQty: { type: Number, default: 0, min: 0 },
    returnedAmount: { type: Number, default: 0, min: 0 },
    unitPrice: { type: Number, default: 0, min: 0 },
    registrationCharge: { type: Number, default: 0, min: 0 },
    totalAmount: { type: Number, default: 0, min: 0 },
    issueDate: { type: String, required: true, trim: true },
    returnDate: { type: String, trim: true },
    issuedBy: { type: String, default: "", trim: true, maxlength: 120 },
    receivedBy: { type: String, default: "", trim: true, maxlength: 120 },
    verifiedBy: { type: String, default: "", trim: true, maxlength: 120 },
    originalDocHeld: { type: String, default: "", trim: true, maxlength: 200 },
    billToSite: { type: Boolean, default: false },
    recoveryPlanId: {
      type: Schema.Types.ObjectId,
      ref: "AdminUniformRecoveryPlan",
      default: null,
      index: true,
    },
    remarks: { type: String, default: "", trim: true, maxlength: 500 },
    status: { type: String, enum: ["Issued", "Returned"], default: "Issued", index: true },
  },
  { timestamps: true, collection: "admin_uniform_issues" }
);

AdminUniformIssueSchema.index({ site: 1, issueDate: -1 });
AdminUniformIssueSchema.index({ employeeId: 1, status: 1 });

export const AdminUniformIssue: Model<IAdminUniformIssue> =
  mongoose.models.AdminUniformIssue ||
  mongoose.model<IAdminUniformIssue>("AdminUniformIssue", AdminUniformIssueSchema);

// ─── Uniform Installment Recovery Plans (Dress Charge EMIs) ───
export const UNIFORM_RECOVERY_MODES = [
  "ONE_TIME",
  "EMI_COUNT",
  "FIXED_MONTHLY",
  "NO_RECOVERY",
] as const;
export type UniformRecoveryMode = (typeof UNIFORM_RECOVERY_MODES)[number];

export const UNIFORM_RECOVERY_STATUSES = [
  "ACTIVE",
  "PAUSED",
  "SETTLED",
  "CANCELLED",
] as const;
export type UniformRecoveryStatus = (typeof UNIFORM_RECOVERY_STATUSES)[number];

export interface IUniformInstallmentEntry {
  monthKey: string;
  scheduledAmount: number;
  deductedAmount: number;
  balanceAfter: number;
  source: "PAYROLL" | "MANUAL" | "RETURN_CREDIT";
  note: string;
  recordedAt: string;
}

export interface IAdminUniformRecoveryPlan extends Document {
  batchId: string;
  issueIds: string[];
  employeeObjectId?: mongoose.Types.ObjectId | null;
  employeeId: string;
  legacyEmpCode: string;
  employeeName: string;
  siteId?: mongoose.Types.ObjectId | null;
  siteName: string;
  totalCharge: number;
  recoveryMode: UniformRecoveryMode;
  installmentCount: number;
  monthlyAmount: number;
  startMonth: string;
  recoveredAmount: number;
  creditedAmount: number;
  remainingBalance: number;
  status: UniformRecoveryStatus;
  lastDeductedMonth: string;
  installmentHistory: IUniformInstallmentEntry[];
  remarks: string;
  createdAt: Date;
  updatedAt: Date;
}

const UniformInstallmentEntrySchema = new Schema<IUniformInstallmentEntry>(
  {
    monthKey: { type: String, required: true, trim: true },
    scheduledAmount: { type: Number, default: 0, min: 0 },
    deductedAmount: { type: Number, default: 0, min: 0 },
    balanceAfter: { type: Number, default: 0, min: 0 },
    source: {
      type: String,
      enum: ["PAYROLL", "MANUAL", "RETURN_CREDIT"],
      default: "PAYROLL",
    },
    note: { type: String, default: "", trim: true, maxlength: 300 },
    recordedAt: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const AdminUniformRecoveryPlanSchema = new Schema<IAdminUniformRecoveryPlan>(
  {
    batchId: { type: String, default: "", trim: true, index: true },
    issueIds: [{ type: String, trim: true }],
    employeeObjectId: {
      type: Schema.Types.ObjectId,
      ref: "AdminEmployee",
      default: null,
      index: true,
    },
    employeeId: { type: String, required: true, trim: true, uppercase: true, index: true },
    legacyEmpCode: { type: String, default: "", trim: true, maxlength: 60 },
    employeeName: { type: String, required: true, trim: true },
    siteId: { type: Schema.Types.ObjectId, ref: "AdminSite", default: null, index: true },
    siteName: { type: String, required: true, trim: true, index: true },
    totalCharge: { type: Number, required: true, min: 0 },
    recoveryMode: {
      type: String,
      enum: UNIFORM_RECOVERY_MODES,
      default: "EMI_COUNT",
    },
    installmentCount: { type: Number, default: 1, min: 1, max: 36 },
    monthlyAmount: { type: Number, required: true, min: 0 },
    startMonth: { type: String, required: true, trim: true, index: true },
    recoveredAmount: { type: Number, default: 0, min: 0 },
    creditedAmount: { type: Number, default: 0, min: 0 },
    remainingBalance: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: UNIFORM_RECOVERY_STATUSES,
      default: "ACTIVE",
      index: true,
    },
    lastDeductedMonth: { type: String, default: "", trim: true },
    installmentHistory: [UniformInstallmentEntrySchema],
    remarks: { type: String, default: "", trim: true, maxlength: 500 },
  },
  { timestamps: true, collection: "admin_uniform_recovery_plans" }
);

AdminUniformRecoveryPlanSchema.index({ employeeId: 1, status: 1 });
AdminUniformRecoveryPlanSchema.index({ employeeObjectId: 1, status: 1 });
AdminUniformRecoveryPlanSchema.index({ startMonth: 1, status: 1 });

export const AdminUniformRecoveryPlan: Model<IAdminUniformRecoveryPlan> =
  mongoose.models.AdminUniformRecoveryPlan ||
  mongoose.model<IAdminUniformRecoveryPlan>(
    "AdminUniformRecoveryPlan",
    AdminUniformRecoveryPlanSchema
  );

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
  "Double Duty",
  "Absent",
  "Half Day",
  "Leave",
  "Weekly Off",
  "National Holiday",
] as const;

export type AttendanceStatus = (typeof ATTENDANCE_STATUSES)[number];

export const ATTENDANCE_DUTY_TYPES = [
  "P",
  "P/P",
  "H",
  "A",
  "L",
  "WO",
  "NH",
  "CUSTOM",
] as const;

export type AttendanceDutyType = (typeof ATTENDANCE_DUTY_TYPES)[number];

export interface IAdminAttendance extends Document {
  workSiteId?: mongoose.Types.ObjectId | null;
  employeeObjectId?: mongoose.Types.ObjectId | null;
  employeeId: string;
  employeeName: string;
  designation: string;
  location: string;
  date: string;
  monthKey: string;
  checkIn: string;
  checkOut: string;
  workingHours: string;
  status: AttendanceStatus;
  dutyType: AttendanceDutyType;
  shiftFraction: number;
  normalDuty?: number;
  extraDuty?: number;
  otHours: number;
  otDayEquivalent: number;
  isReliever: boolean;
  primarySiteName: string;
  adjustmentNote: string;
  remarks?: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdminAttendanceSchema = new Schema<IAdminAttendance>(
  {
    workSiteId: {
      type: Schema.Types.ObjectId,
      ref: "AdminSite",
      default: null,
      index: true,
    },
    employeeObjectId: {
      type: Schema.Types.ObjectId,
      ref: "AdminEmployee",
      default: null,
      index: true,
    },
    employeeId: { type: String, default: "", trim: true, uppercase: true, index: true },
    employeeName: { type: String, required: true, trim: true },
    designation: { type: String, required: true, default: "Security Guard", trim: true },
    location: { type: String, required: true, trim: true, index: true },
    date: { type: String, required: true, trim: true, index: true },
    monthKey: { type: String, default: "", trim: true, index: true },
    checkIn: { type: String, default: "—", trim: true },
    checkOut: { type: String, default: "—", trim: true },
    workingHours: { type: String, default: "0h 00m", trim: true },
    status: {
      type: String,
      enum: ATTENDANCE_STATUSES,
      default: "Present",
      index: true,
    },
    dutyType: {
      type: String,
      enum: ATTENDANCE_DUTY_TYPES,
      default: "P",
    },
    shiftFraction: { type: Number, default: 1, min: 0, max: 3 },
    normalDuty: { type: Number, default: 0, min: 0, max: 3 },
    extraDuty: { type: Number, default: 0, min: 0, max: 3 },
    otHours: { type: Number, default: 0, min: 0, max: 24 },
    otDayEquivalent: { type: Number, default: 0, min: 0, max: 3 },
    isReliever: { type: Boolean, default: false, index: true },
    primarySiteName: { type: String, default: "", trim: true },
    adjustmentNote: { type: String, default: "", trim: true, maxlength: 500 },
    remarks: { type: String, default: "", trim: true, maxlength: 500 },
  },
  { timestamps: true, collection: "admin_attendance" }
);

AdminAttendanceSchema.index({ date: -1, employeeId: 1 });
AdminAttendanceSchema.index({ location: 1, monthKey: 1, date: 1 });
AdminAttendanceSchema.index({ workSiteId: 1, monthKey: 1, employeeObjectId: 1 });
AdminAttendanceSchema.index({ employeeObjectId: 1, monthKey: 1, date: 1 });
AdminAttendanceSchema.index({ monthKey: 1, isReliever: 1 });

export const AdminAttendance: Model<IAdminAttendance> =
  mongoose.models.AdminAttendance ||
  mongoose.model<IAdminAttendance>("AdminAttendance", AdminAttendanceSchema);

// ─── Site Monthly Muster Roll Verification & Sign-Off ─────────
export const MUSTER_VERIFICATION_STATUSES = [
  "DRAFT",
  "SUPERVISOR_SUBMITTED",
  "CLIENT_VERIFIED",
  "LOCKED_FOR_BILLING",
] as const;

export type MusterVerificationStatus = (typeof MUSTER_VERIFICATION_STATUSES)[number];

export interface IAdminSiteMusterApproval extends Document {
  siteId?: mongoose.Types.ObjectId | null;
  siteName: string;
  subUnit: string;
  monthKey: string;
  verificationStatus: MusterVerificationStatus;
  verifiedByName: string;
  verifiedByDesignation: string;
  verifiedDate: string;
  totalNormalDuty: number;
  totalExtraDuty: number;
  totalOtHours: number;
  totalNhDays: number;
  totalBillableDuties: number;
  attachment?: IUploadedDocumentFile;
  remarks: string;
  lockedAt: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdminSiteMusterApprovalSchema = new Schema<IAdminSiteMusterApproval>(
  {
    siteId: { type: Schema.Types.ObjectId, ref: "AdminSite", default: null, index: true },
    siteName: { type: String, required: true, trim: true, index: true },
    subUnit: { type: String, default: "", trim: true },
    monthKey: { type: String, required: true, trim: true, index: true },
    verificationStatus: {
      type: String,
      enum: MUSTER_VERIFICATION_STATUSES,
      default: "DRAFT",
      index: true,
    },
    verifiedByName: { type: String, default: "", trim: true, maxlength: 160 },
    verifiedByDesignation: { type: String, default: "", trim: true, maxlength: 160 },
    verifiedDate: { type: String, default: "", trim: true, maxlength: 40 },
    totalNormalDuty: { type: Number, default: 0, min: 0 },
    totalExtraDuty: { type: Number, default: 0, min: 0 },
    totalOtHours: { type: Number, default: 0, min: 0 },
    totalNhDays: { type: Number, default: 0, min: 0 },
    totalBillableDuties: { type: Number, default: 0, min: 0 },
    attachment: { type: UploadedDocumentFileSchema },
    remarks: { type: String, default: "", trim: true, maxlength: 1000 },
    lockedAt: { type: String, default: "", trim: true, maxlength: 40 },
  },
  { timestamps: true, collection: "admin_site_muster_approvals" }
);

AdminSiteMusterApprovalSchema.index({ siteName: 1, monthKey: 1, subUnit: 1 }, { unique: true });

export const AdminSiteMusterApproval: Model<IAdminSiteMusterApproval> =
  mongoose.models.AdminSiteMusterApproval ||
  mongoose.model<IAdminSiteMusterApproval>(
    "AdminSiteMusterApproval",
    AdminSiteMusterApprovalSchema
  );
