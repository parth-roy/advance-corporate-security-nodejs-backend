import mongoose, { Schema, Document, Model } from "mongoose";

// ─── ESI & PF Statutory Records ───────────────────────────────
export type StatutoryStatus = "Active" | "Pending" | "Exempt";

export interface IContributionHistoryItem {
  month: string;
  pfEmployee: number;
  pfEmployer: number;
  esiEmployee: number;
  esiEmployer: number;
  status: "Filed" | "Pending";
}

export interface IAdminStatutory extends Document {
  employeeId: string;
  employeeName: string;
  designation: string;
  location: string;
  month: string;
  uanNumber: string;
  esiNumber: string;
  basicSalary: number;
  pfStatus: StatutoryStatus;
  esiStatus: StatutoryStatus;
  pfEmployeeShare: number;
  pfEmployerShare: number;
  esiEmployeeShare: number;
  esiEmployerShare: number;
  history: IContributionHistoryItem[];
  createdAt: Date;
  updatedAt: Date;
}

const ContributionHistorySchema = new Schema<IContributionHistoryItem>(
  {
    month: { type: String, required: true, trim: true },
    pfEmployee: { type: Number, required: true, min: 0 },
    pfEmployer: { type: Number, required: true, min: 0 },
    esiEmployee: { type: Number, required: true, min: 0 },
    esiEmployer: { type: Number, required: true, min: 0 },
    status: { type: String, enum: ["Filed", "Pending"], default: "Pending" },
  },
  { _id: false }
);

const AdminStatutorySchema = new Schema<IAdminStatutory>(
  {
    employeeId: { type: String, required: true, trim: true, index: true },
    employeeName: { type: String, required: true, trim: true },
    designation: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    month: { type: String, required: true, trim: true, index: true },
    uanNumber: { type: String, default: "", trim: true },
    esiNumber: { type: String, default: "", trim: true },
    basicSalary: { type: Number, required: true, min: 0 },
    pfStatus: { type: String, enum: ["Active", "Pending", "Exempt"], default: "Active" },
    esiStatus: { type: String, enum: ["Active", "Pending", "Exempt"], default: "Active" },
    pfEmployeeShare: { type: Number, default: 0, min: 0 },
    pfEmployerShare: { type: Number, default: 0, min: 0 },
    esiEmployeeShare: { type: Number, default: 0, min: 0 },
    esiEmployerShare: { type: Number, default: 0, min: 0 },
    history: [ContributionHistorySchema],
  },
  { timestamps: true, collection: "admin_statutory" }
);

export const AdminStatutory: Model<IAdminStatutory> =
  mongoose.models.AdminStatutory ||
  mongoose.model<IAdminStatutory>("AdminStatutory", AdminStatutorySchema);

// ─── Salary Generation ────────────────────────────────────────
export type SalaryStatus = "Pending" | "Processed" | "On Hold";

export interface IAdminSalary extends Document {
  employeeId: string;
  employeeName: string;
  designation: string;
  department: string;
  category: "Security Personnel" | "Supervisory Staff" | "Operations & Admin";
  location: string;
  month: string;
  year: string;
  basicSalary: number;
  allowances: number;
  overtime: number;
  otherEarnings: number;
  pfDeduction: number;
  esiDeduction: number;
  otherDeductions: number;
  status: SalaryStatus;
  createdAt: Date;
  updatedAt: Date;
}

const AdminSalarySchema = new Schema<IAdminSalary>(
  {
    employeeId: { type: String, required: true, trim: true, index: true },
    employeeName: { type: String, required: true, trim: true },
    designation: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    category: {
      type: String,
      enum: ["Security Personnel", "Supervisory Staff", "Operations & Admin"],
      default: "Security Personnel",
      index: true,
    },
    location: { type: String, required: true, trim: true },
    month: { type: String, required: true, trim: true, index: true },
    year: { type: String, required: true, trim: true },
    basicSalary: { type: Number, required: true, min: 0 },
    allowances: { type: Number, default: 0, min: 0 },
    overtime: { type: Number, default: 0, min: 0 },
    otherEarnings: { type: Number, default: 0, min: 0 },
    pfDeduction: { type: Number, default: 0, min: 0 },
    esiDeduction: { type: Number, default: 0, min: 0 },
    otherDeductions: { type: Number, default: 0, min: 0 },
    status: { type: String, enum: ["Pending", "Processed", "On Hold"], default: "Pending", index: true },
  },
  { timestamps: true, collection: "admin_salaries" }
);

export const AdminSalary: Model<IAdminSalary> =
  mongoose.models.AdminSalary ||
  mongoose.model<IAdminSalary>("AdminSalary", AdminSalarySchema);

// ─── Payslips ─────────────────────────────────────────────────
export type PayslipStatus = "Generated" | "Pending";

export interface IAdminPayslip extends Document {
  payslipId: string;
  employeeId: string;
  employeeName: string;
  designation: string;
  department: string;
  location: string;
  salaryMonth: string;
  basicSalary: number;
  allowances: number;
  overtime: number;
  otherEarnings: number;
  pfDeduction: number;
  esiDeduction: number;
  otherDeductions: number;
  generatedDate: string;
  status: PayslipStatus;
  createdAt: Date;
  updatedAt: Date;
}

const AdminPayslipSchema = new Schema<IAdminPayslip>(
  {
    payslipId: { type: String, required: true, trim: true, index: true },
    employeeId: { type: String, required: true, trim: true, index: true },
    employeeName: { type: String, required: true, trim: true },
    designation: { type: String, required: true, trim: true },
    department: { type: String, required: true, trim: true },
    location: { type: String, required: true, trim: true },
    salaryMonth: { type: String, required: true, trim: true, index: true },
    basicSalary: { type: Number, required: true, min: 0 },
    allowances: { type: Number, default: 0, min: 0 },
    overtime: { type: Number, default: 0, min: 0 },
    otherEarnings: { type: Number, default: 0, min: 0 },
    pfDeduction: { type: Number, default: 0, min: 0 },
    esiDeduction: { type: Number, default: 0, min: 0 },
    otherDeductions: { type: Number, default: 0, min: 0 },
    generatedDate: { type: String, required: true, trim: true },
    status: { type: String, enum: ["Generated", "Pending"], default: "Pending", index: true },
  },
  { timestamps: true, collection: "admin_payslips" }
);

export const AdminPayslip: Model<IAdminPayslip> =
  mongoose.models.AdminPayslip ||
  mongoose.model<IAdminPayslip>("AdminPayslip", AdminPayslipSchema);

// ─── Billing / Invoices ───────────────────────────────────────
export type PaymentStatus = "Paid" | "Pending" | "Overdue";

export interface IAdminInvoice extends Document {
  invoiceNumber: string;
  clientName: string;
  clientAddress: string;
  clientGstin: string;
  billingMonth: string;
  site: string;
  serviceType: string;
  serviceDescription: string;
  quantity: number;
  rate: number;
  taxRate: number;
  invoiceDate: string;
  dueDate: string;
  paymentTerms: string;
  status: PaymentStatus;
  createdAt: Date;
  updatedAt: Date;
}

const AdminInvoiceSchema = new Schema<IAdminInvoice>(
  {
    invoiceNumber: { type: String, required: true, trim: true, index: true },
    clientName: { type: String, required: true, trim: true },
    clientAddress: { type: String, default: "", trim: true },
    clientGstin: { type: String, default: "", trim: true },
    billingMonth: { type: String, required: true, trim: true, index: true },
    site: { type: String, required: true, trim: true },
    serviceType: { type: String, required: true, trim: true },
    serviceDescription: { type: String, default: "", trim: true },
    quantity: { type: Number, required: true, min: 0 },
    rate: { type: Number, required: true, min: 0 },
    taxRate: { type: Number, default: 18, min: 0 },
    invoiceDate: { type: String, required: true, trim: true },
    dueDate: { type: String, required: true, trim: true },
    paymentTerms: { type: String, default: "Net 15 Days", trim: true },
    status: { type: String, enum: ["Paid", "Pending", "Overdue"], default: "Pending", index: true },
  },
  { timestamps: true, collection: "admin_invoices" }
);

export const AdminInvoice: Model<IAdminInvoice> =
  mongoose.models.AdminInvoice ||
  mongoose.model<IAdminInvoice>("AdminInvoice", AdminInvoiceSchema);

// ─── Activity Feed ────────────────────────────────────────────
export interface IAdminActivity extends Document {
  title: string;
  detail: string;
  module: string;
  timestamp: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdminActivitySchema = new Schema<IAdminActivity>(
  {
    title: { type: String, required: true, trim: true },
    detail: { type: String, required: true, trim: true },
    module: { type: String, required: true, trim: true, index: true },
    timestamp: { type: String, required: true, trim: true },
  },
  { timestamps: true, collection: "admin_activities" }
);

export const AdminActivity: Model<IAdminActivity> =
  mongoose.models.AdminActivity ||
  mongoose.model<IAdminActivity>("AdminActivity", AdminActivitySchema);

// ─── Admin Settings ───────────────────────────────────────────
export interface IAdminSettings extends Document {
  key: string;
  adminName: string;
  adminRole: string;
  adminEmail: string;
  adminPhone: string;
  companyName: string;
  companyWebsite: string;
  companyGstin: string;
  companyAddress: string;
  supportEmail: string;
  supportPhone: string;
  logoInitials: string;
  emailAlerts: boolean;
  compactTables: boolean;
  defaultMonth: string;
  uniformRegistrationCharge?: number;
  createdAt: Date;
  updatedAt: Date;
}

const AdminSettingsSchema = new Schema<IAdminSettings>(
  {
    key: { type: String, default: "default", unique: true, index: true },
    adminName: { type: String, default: "", trim: true },
    adminRole: { type: String, default: "", trim: true },
    adminEmail: { type: String, default: "", trim: true },
    adminPhone: { type: String, default: "", trim: true },
    companyName: { type: String, default: "Advance Corporate Security", trim: true },
    companyWebsite: { type: String, default: "https://advancecorporatesecurity.com", trim: true },
    companyGstin: { type: String, default: "19AABCA9021D1Z5", trim: true },
    companyAddress: { type: String, default: "Kolkata, West Bengal, India", trim: true },
    supportEmail: { type: String, default: "ops@advancecorporatesecurity.com", trim: true },
    supportPhone: { type: String, default: "+91 93399 88999", trim: true },
    logoInitials: { type: String, default: "ACS", trim: true },
    emailAlerts: { type: Boolean, default: true },
    compactTables: { type: Boolean, default: false },
    defaultMonth: { type: String, default: "November 2026", trim: true },
    uniformRegistrationCharge: { type: Number, default: 250, min: 0 },
  },
  { timestamps: true, collection: "admin_settings" }
);

export const AdminSettings: Model<IAdminSettings> =
  mongoose.models.AdminSettings ||
  mongoose.model<IAdminSettings>("AdminSettings", AdminSettingsSchema);
