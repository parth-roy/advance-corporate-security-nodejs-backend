import mongoose, { Schema, Document, Model } from "mongoose";
import {
  CandidateDocumentsSchema,
  FamilyMemberSchema,
  ICandidateDocuments,
  IFamilyMember,
} from "./sharedSchemas";

// ─── Site Master (Client Units / Deployment Sites) ────────────
export const SITE_GST_MODES = [
  "INTRA_CGST_SGST",
  "INTER_IGST",
  "RCM",
  "NON_GST",
] as const;

export type SiteGstMode = (typeof SITE_GST_MODES)[number];

export interface IAdminSite extends Document {
  siteCode: string;
  siteName: string;
  shortName: string;
  clientName: string;
  billToAddress: string;
  shipToAddress: string;
  clientGstin: string;
  stateCode: string;
  vendorCode: string;
  contractRef: string;
  subUnits: string[];
  sacCode: string;
  gstMode: SiteGstMode;
  serviceChargePct: number;
  isActive: boolean;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdminSiteSchema = new Schema<IAdminSite>(
  {
    siteCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 40,
      index: true,
    },
    siteName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      index: true,
    },
    shortName: { type: String, default: "", trim: true, maxlength: 80 },
    clientName: { type: String, default: "", trim: true, maxlength: 200, index: true },
    billToAddress: { type: String, default: "", trim: true, maxlength: 500 },
    shipToAddress: { type: String, default: "", trim: true, maxlength: 500 },
    clientGstin: { type: String, default: "", trim: true, uppercase: true, maxlength: 30 },
    stateCode: { type: String, default: "19", trim: true, maxlength: 5 },
    vendorCode: { type: String, default: "", trim: true, maxlength: 80 },
    contractRef: { type: String, default: "", trim: true, maxlength: 160 },
    subUnits: { type: [String], default: [] },
    sacCode: { type: String, default: "998533", trim: true, maxlength: 20 },
    gstMode: {
      type: String,
      enum: SITE_GST_MODES,
      default: "INTRA_CGST_SGST",
      index: true,
    },
    serviceChargePct: { type: Number, default: 0, min: 0, max: 100 },
    isActive: { type: Boolean, default: true, index: true },
    notes: { type: String, default: "", trim: true, maxlength: 1000 },
  },
  { timestamps: true, collection: "admin_sites" }
);

AdminSiteSchema.index({ isActive: 1, siteName: 1 });

export const AdminSite: Model<IAdminSite> =
  mongoose.models.AdminSite ||
  mongoose.model<IAdminSite>("AdminSite", AdminSiteSchema);

// ─── Employee Master (Deployed Personnel Separated from Candidates) ───
export const EMPLOYEE_STATUSES = [
  "ACTIVE",
  "ON_HOLD",
  "LEFT",
  "TRANSFERRED",
] as const;

export type EmployeeStatus = (typeof EMPLOYEE_STATUSES)[number];

export const EMPLOYEE_RATE_TYPES = ["DAILY", "MONTHLY"] as const;
export type EmployeeRateType = (typeof EMPLOYEE_RATE_TYPES)[number];

export const PAYMENT_MODES = [
  "BANK_TRANSFER",
  "CHEQUE",
  "CASH",
  "UPI",
] as const;

export type PaymentMode = (typeof PAYMENT_MODES)[number];

export interface IEmployeeBankDetails {
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branchName: string;
  upiId: string;
  preferredPaymentMode: PaymentMode;
}

export interface IEmployeeStatutory {
  esiHolder: "Yes" | "No" | "";
  esiNumber: string;
  pfUan: string;
}

export interface IOriginalIdCustody {
  documentType: string;
  referenceNo: string;
  depositedDate: string;
  inCustody: boolean;
  notes: string;
}

export interface IAdminEmployee extends Document {
  empCode: string;
  legacyEmpCode: string;
  candidateId: mongoose.Types.ObjectId | null;
  primarySiteId: mongoose.Types.ObjectId | null;
  siteName: string;
  subUnit: string;
  fullName: string;
  fatherOrHusbandName: string;
  dateOfBirth: string;
  permanentAddress: string;
  presentAddress: string;
  maritalStatus: string;
  highestQualification: string;
  mobile: string;
  email: string;
  designation: string;
  serviceCategory: string;
  dateOfJoining: string;
  rateType: EmployeeRateType;
  baseRate: number;
  bankDetails: IEmployeeBankDetails;
  statutory: IEmployeeStatutory;
  originalIdCustody: IOriginalIdCustody;
  nomineeName: string;
  familyMembers: IFamilyMember[];
  documents: ICandidateDocuments;
  remarks: string;
  status: EmployeeStatus;
  exitDate: string;
  createdAt: Date;
  updatedAt: Date;
}

const EmployeeBankDetailsSchema = new Schema<IEmployeeBankDetails>(
  {
    bankName: { type: String, default: "", trim: true, maxlength: 150 },
    accountNumber: { type: String, default: "", trim: true, maxlength: 60 },
    ifscCode: { type: String, default: "", trim: true, uppercase: true, maxlength: 20 },
    branchName: { type: String, default: "", trim: true, maxlength: 150 },
    upiId: { type: String, default: "", trim: true, maxlength: 120 },
    preferredPaymentMode: {
      type: String,
      enum: PAYMENT_MODES,
      default: "BANK_TRANSFER",
    },
  },
  { _id: false }
);

const EmployeeStatutorySchema = new Schema<IEmployeeStatutory>(
  {
    esiHolder: { type: String, enum: ["Yes", "No", ""], default: "" },
    esiNumber: { type: String, default: "", trim: true, maxlength: 100 },
    pfUan: { type: String, default: "", trim: true, maxlength: 100 },
  },
  { _id: false }
);

const OriginalIdCustodySchema = new Schema<IOriginalIdCustody>(
  {
    documentType: { type: String, default: "", trim: true, maxlength: 100 },
    referenceNo: { type: String, default: "", trim: true, maxlength: 100 },
    depositedDate: { type: String, default: "", trim: true, maxlength: 40 },
    inCustody: { type: Boolean, default: false },
    notes: { type: String, default: "", trim: true, maxlength: 500 },
  },
  { _id: false }
);

const AdminEmployeeSchema = new Schema<IAdminEmployee>(
  {
    empCode: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      uppercase: true,
      maxlength: 60,
      index: true,
    },
    legacyEmpCode: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
      maxlength: 60,
      index: true,
    },
    candidateId: {
      type: Schema.Types.ObjectId,
      ref: "AdminCandidate",
      default: null,
      index: true,
    },
    primarySiteId: {
      type: Schema.Types.ObjectId,
      ref: "AdminSite",
      default: null,
      index: true,
    },
    siteName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 200,
      index: true,
    },
    subUnit: { type: String, default: "", trim: true, maxlength: 120 },
    fullName: { type: String, required: true, trim: true, maxlength: 200, index: true },
    fatherOrHusbandName: { type: String, default: "", trim: true, maxlength: 200 },
    dateOfBirth: { type: String, default: "", trim: true, maxlength: 40 },
    permanentAddress: { type: String, default: "", trim: true, maxlength: 1000 },
    presentAddress: { type: String, default: "", trim: true, maxlength: 1000 },
    maritalStatus: { type: String, default: "", trim: true, maxlength: 50 },
    highestQualification: { type: String, default: "", trim: true, maxlength: 150 },
    mobile: { type: String, default: "", trim: true, maxlength: 30, index: true },
    email: { type: String, default: "", trim: true, lowercase: true, maxlength: 254 },
    designation: {
      type: String,
      required: true,
      default: "Security Guard",
      trim: true,
      maxlength: 150,
      index: true,
    },
    serviceCategory: { type: String, default: "", trim: true, maxlength: 100 },
    dateOfJoining: { type: String, default: "", trim: true, maxlength: 40 },
    rateType: {
      type: String,
      enum: EMPLOYEE_RATE_TYPES,
      default: "MONTHLY",
    },
    baseRate: { type: Number, default: 0, min: 0 },
    bankDetails: {
      type: EmployeeBankDetailsSchema,
      default: () => ({
        bankName: "",
        accountNumber: "",
        ifscCode: "",
        branchName: "",
        upiId: "",
        preferredPaymentMode: "BANK_TRANSFER",
      }),
    },
    statutory: {
      type: EmployeeStatutorySchema,
      default: () => ({
        esiHolder: "",
        esiNumber: "",
        pfUan: "",
      }),
    },
    originalIdCustody: {
      type: OriginalIdCustodySchema,
      default: () => ({
        documentType: "",
        referenceNo: "",
        depositedDate: "",
        inCustody: false,
        notes: "",
      }),
    },
    nomineeName: { type: String, default: "", trim: true, maxlength: 200 },
    familyMembers: { type: [FamilyMemberSchema], default: [] },
    documents: { type: CandidateDocumentsSchema, default: {} },
    remarks: { type: String, default: "", trim: true, maxlength: 2000 },
    status: {
      type: String,
      enum: EMPLOYEE_STATUSES,
      default: "ACTIVE",
      index: true,
    },
    exitDate: { type: String, default: "", trim: true, maxlength: 40 },
  },
  { timestamps: true, collection: "admin_employees" }
);

AdminEmployeeSchema.index({ primarySiteId: 1, status: 1, fullName: 1 });
AdminEmployeeSchema.index({ siteName: 1, status: 1, fullName: 1 });
AdminEmployeeSchema.index({ status: 1, createdAt: -1 });
AdminEmployeeSchema.index({
  fullName: "text",
  empCode: "text",
  legacyEmpCode: "text",
  designation: "text",
  siteName: "text",
  mobile: "text",
});

export const AdminEmployee: Model<IAdminEmployee> =
  mongoose.models.AdminEmployee ||
  mongoose.model<IAdminEmployee>("AdminEmployee", AdminEmployeeSchema);
