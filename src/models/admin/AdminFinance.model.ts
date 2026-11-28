import mongoose, { Schema, Document, Model } from "mongoose";
import { PAYMENT_MODES, PaymentMode, SITE_GST_MODES, SiteGstMode } from "./AdminCore.model";
import {
  ALLOWANCE_METHODS,
  AllowanceMethod,
  BONUS_CAP_TYPES,
  BONUS_MODES,
  BONUS_WAGE_BASES,
  BonusCapType,
  BonusMode,
  BonusWageBase,
  EPF_VARIANTS,
  EPF_WAGE_BASES,
  EpfVariant,
  EpfWageBase,
  ESI_VARIANTS,
  EsiVariant,
  OT_CALC_METHODS,
  OtCalcMethod,
  PAYROLL_ROUND_MODES,
  PayrollRoundMode,
  PT_SLAB_TYPES,
  PtSlabType,
  WAGE_BASIS_TYPES,
  WageBasisType,
} from "../../services/payrollCalculation.service";
import {
  BILLING_ARCHETYPES,
  BILLING_ROUND_MODES,
  BillingArchetype,
  BillingRoundMode,
  POOL_STATUTORY_MODES,
  PoolStatutoryMode,
} from "../../services/billingCalculation.service";

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

export const SALARY_PAYOUT_STATUSES = [
  "UNPAID",
  "HOLD",
  "CHQ_HOLD",
  "PAID",
] as const;
export type SalaryPayoutStatus = (typeof SALARY_PAYOUT_STATUSES)[number];

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
  payoutStatus: SalaryPayoutStatus;
  paidAmount: number;
  paymentMode?: PaymentMode;
  voucherId?: mongoose.Types.ObjectId | null;
  voucherNo?: number | null;
  holdReason?: string;
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
    payoutStatus: {
      type: String,
      enum: SALARY_PAYOUT_STATUSES,
      default: "UNPAID",
      index: true,
    },
    paidAmount: { type: Number, default: 0, min: 0 },
    paymentMode: { type: String, enum: PAYMENT_MODES },
    voucherId: { type: Schema.Types.ObjectId, ref: "AdminVoucher", default: null },
    voucherNo: { type: Number, default: null },
    holdReason: { type: String, default: "", trim: true, maxlength: 300 },
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
  monthKey?: string;
  basicSalary: number;
  allowances: number;
  overtime: number;
  otherEarnings: number;
  pfDeduction: number;
  esiDeduction: number;
  otherDeductions: number;
  generatedDate: string;
  status: PayslipStatus;
  ruleProfileCode?: string;
  ruleProfileName?: string;
  wageRate?: number;
  presentDays?: number;
  extraDays?: number;
  otHours?: number;
  nhDays?: number;
  bonusInGross?: number;
  bonusOutsideGross?: number;
  canteenAllowance?: number;
  ptDeduction?: number;
  advanceDeduction?: number;
  uniformDeduction?: number;
  gemCharge?: number;
  adminCharge?: number;
  arrearAddition?: number;
  deductPtFromEmployee?: boolean;
  factoryComponents?: {
    basic: number;
    hra: number;
    uniformAllowance: number;
    medical: number;
    fuel: number;
    washing: number;
    balancingAllowance: number;
  };
  uniformBalanceAfter?: number;
  advanceBalanceAfter?: number;
  paymentMode?: PaymentMode;
  voucherNo?: number | null;
  payoutStatus?: string;
  uanNumber?: string;
  esiNumber?: string;
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
    monthKey: { type: String, default: "", trim: true, index: true },
    basicSalary: { type: Number, required: true, min: 0 },
    allowances: { type: Number, default: 0, min: 0 },
    overtime: { type: Number, default: 0, min: 0 },
    otherEarnings: { type: Number, default: 0, min: 0 },
    pfDeduction: { type: Number, default: 0, min: 0 },
    esiDeduction: { type: Number, default: 0, min: 0 },
    otherDeductions: { type: Number, default: 0, min: 0 },
    generatedDate: { type: String, required: true, trim: true },
    status: { type: String, enum: ["Generated", "Pending"], default: "Pending", index: true },
    ruleProfileCode: { type: String, default: "", trim: true },
    ruleProfileName: { type: String, default: "", trim: true },
    wageRate: { type: Number, default: 0, min: 0 },
    presentDays: { type: Number, default: 0, min: 0 },
    extraDays: { type: Number, default: 0, min: 0 },
    otHours: { type: Number, default: 0, min: 0 },
    nhDays: { type: Number, default: 0, min: 0 },
    bonusInGross: { type: Number, default: 0, min: 0 },
    bonusOutsideGross: { type: Number, default: 0, min: 0 },
    canteenAllowance: { type: Number, default: 0, min: 0 },
    ptDeduction: { type: Number, default: 0, min: 0 },
    advanceDeduction: { type: Number, default: 0, min: 0 },
    uniformDeduction: { type: Number, default: 0, min: 0 },
    gemCharge: { type: Number, default: 0, min: 0 },
    adminCharge: { type: Number, default: 0, min: 0 },
    arrearAddition: { type: Number, default: 0, min: 0 },
    deductPtFromEmployee: { type: Boolean, default: true },
    factoryComponents: {
      type: new Schema(
        {
          basic: { type: Number, default: 0 },
          hra: { type: Number, default: 0 },
          uniformAllowance: { type: Number, default: 0 },
          medical: { type: Number, default: 0 },
          fuel: { type: Number, default: 0 },
          washing: { type: Number, default: 0 },
          balancingAllowance: { type: Number, default: 0 },
        },
        { _id: false }
      ),
    },
    uniformBalanceAfter: { type: Number, default: 0, min: 0 },
    advanceBalanceAfter: { type: Number, default: 0, min: 0 },
    paymentMode: { type: String, enum: PAYMENT_MODES },
    voucherNo: { type: Number, default: null },
    payoutStatus: { type: String, default: "", trim: true },
    uanNumber: { type: String, default: "", trim: true },
    esiNumber: { type: String, default: "", trim: true },
  },
  { timestamps: true, collection: "admin_payslips" }
);

export const AdminPayslip: Model<IAdminPayslip> =
  mongoose.models.AdminPayslip ||
  mongoose.model<IAdminPayslip>("AdminPayslip", AdminPayslipSchema);

// ─── Billing / Invoices ───────────────────────────────────────
export type PaymentStatus = "Paid" | "Pending" | "Overdue";

export const INVOICE_PAYMENT_STAGES = [
  "DRAFT",
  "PRE_PAYMENT_SUBMITTED",
  "PARTIAL_PAID",
  "DEDUCTION_DISPUTED",
  "SETTLED",
  "OVERDUE",
] as const;
export type InvoicePaymentStage = (typeof INVOICE_PAYMENT_STAGES)[number];

export const INVOICE_DEDUCTION_CATEGORIES = [
  "TDS",
  "GST_TDS",
  "LD_PENALTY",
  "SHORT_DUTY",
  "OTHER",
] as const;
export type InvoiceDeductionCategory = (typeof INVOICE_DEDUCTION_CATEGORIES)[number];

export interface IInvoiceLineItem {
  label: string;
  designation: string;
  normalDays: number;
  extraDays: number;
  otHours: number;
  totalDays: number;
  baseRate: number;
  effectiveBaseRate: number;
  inclusiveRate: number;
  epfAmount: number;
  esiAmount: number;
  bonusAmount: number;
  lineAmount: number;
}

export interface IInvoiceDeductionEntry {
  category: InvoiceDeductionCategory;
  amount: number;
  note: string;
  recordedAt: string;
}

export interface IInvoicePaymentReceipt {
  receiptDate: string;
  amount: number;
  paymentMode: PaymentMode;
  referenceNo: string;
  bankName: string;
  note: string;
}

export interface IAdminInvoice extends Document {
  invoiceNumber: string;
  siteId?: mongoose.Types.ObjectId | null;
  billingRuleProfileId?: mongoose.Types.ObjectId | null;
  ruleProfileCode?: string;
  clientName: string;
  clientAddress: string;
  clientGstin: string;
  stateCode?: string;
  vendorCode?: string;
  contractRef?: string;
  billingMonth: string;
  periodMonths?: string[];
  periodLabel?: string;
  site: string;
  subUnit?: string;
  serviceType: string;
  serviceDescription: string;
  sacCode?: string;
  archetype?: BillingArchetype;
  gstMode?: SiteGstMode;
  attendanceSource?: "VERIFIED_MUSTER" | "ATTENDANCE_LOGS" | "MANUAL";
  quantity: number;
  rate: number;
  taxRate: number;
  lineItems?: IInvoiceLineItem[];
  wagesSubtotal?: number;
  epfTotal?: number;
  esiTotal?: number;
  bonusTotal?: number;
  statutoryTotal?: number;
  govtDeductionPct?: number;
  govtDeductionAmount?: number;
  serviceChargePct?: number;
  serviceChargeAmount?: number;
  taxableSubtotal?: number;
  cgstRate?: number;
  cgstAmount?: number;
  sgstRate?: number;
  sgstAmount?: number;
  igstRate?: number;
  igstAmount?: number;
  cessPct?: number;
  cessAmount?: number;
  roundOff?: number;
  totalInvoiceAmount?: number;
  amountInWords?: string;
  includeFactoryActNote?: boolean;
  invoiceDate: string;
  dueDate: string;
  paymentTerms: string;
  status: PaymentStatus;
  paymentStage?: InvoicePaymentStage;
  deductionsSlip?: IInvoiceDeductionEntry[];
  totalDeductions?: number;
  paymentReceipts?: IInvoicePaymentReceipt[];
  totalReceived?: number;
  balanceReceivable?: number;
  interestRatePct?: number;
  createdAt: Date;
  updatedAt: Date;
}

const InvoiceLineItemSubSchema = new Schema<IInvoiceLineItem>(
  {
    label: { type: String, required: true, trim: true },
    designation: { type: String, default: "", trim: true },
    normalDays: { type: Number, default: 0 },
    extraDays: { type: Number, default: 0 },
    otHours: { type: Number, default: 0 },
    totalDays: { type: Number, default: 0 },
    baseRate: { type: Number, default: 0 },
    effectiveBaseRate: { type: Number, default: 0 },
    inclusiveRate: { type: Number, default: 0 },
    epfAmount: { type: Number, default: 0 },
    esiAmount: { type: Number, default: 0 },
    bonusAmount: { type: Number, default: 0 },
    lineAmount: { type: Number, default: 0 },
  },
  { _id: false }
);

const InvoiceDeductionEntrySchema = new Schema<IInvoiceDeductionEntry>(
  {
    category: { type: String, enum: INVOICE_DEDUCTION_CATEGORIES, default: "TDS" },
    amount: { type: Number, required: true, min: 0 },
    note: { type: String, default: "", trim: true },
    recordedAt: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const InvoicePaymentReceiptSchema = new Schema<IInvoicePaymentReceipt>(
  {
    receiptDate: { type: String, required: true, trim: true },
    amount: { type: Number, required: true, min: 0.01 },
    paymentMode: { type: String, enum: PAYMENT_MODES, default: "BANK_TRANSFER" },
    referenceNo: { type: String, default: "", trim: true },
    bankName: { type: String, default: "", trim: true },
    note: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const AdminInvoiceSchema = new Schema<IAdminInvoice>(
  {
    invoiceNumber: { type: String, required: true, trim: true, index: true },
    siteId: { type: Schema.Types.ObjectId, ref: "AdminSite", default: null, index: true },
    billingRuleProfileId: { type: Schema.Types.ObjectId, ref: "AdminBillingRuleProfile", default: null },
    ruleProfileCode: { type: String, default: "", trim: true },
    clientName: { type: String, required: true, trim: true },
    clientAddress: { type: String, default: "", trim: true },
    clientGstin: { type: String, default: "", trim: true },
    stateCode: { type: String, default: "19", trim: true },
    vendorCode: { type: String, default: "", trim: true },
    contractRef: { type: String, default: "", trim: true },
    billingMonth: { type: String, required: true, trim: true, index: true },
    periodMonths: { type: [String], default: [] },
    periodLabel: { type: String, default: "", trim: true },
    site: { type: String, required: true, trim: true, index: true },
    subUnit: { type: String, default: "", trim: true },
    serviceType: { type: String, required: true, trim: true },
    serviceDescription: { type: String, default: "", trim: true },
    sacCode: { type: String, default: "998533", trim: true },
    archetype: { type: String, enum: BILLING_ARCHETYPES, default: "ALL_INCLUSIVE_RATE" },
    gstMode: { type: String, enum: SITE_GST_MODES, default: "INTRA_CGST_SGST" },
    attendanceSource: {
      type: String,
      enum: ["VERIFIED_MUSTER", "ATTENDANCE_LOGS", "MANUAL"],
      default: "MANUAL",
    },
    quantity: { type: Number, required: true, min: 0 },
    rate: { type: Number, required: true, min: 0 },
    taxRate: { type: Number, default: 18, min: 0 },
    lineItems: { type: [InvoiceLineItemSubSchema], default: [] },
    wagesSubtotal: { type: Number, default: 0 },
    epfTotal: { type: Number, default: 0 },
    esiTotal: { type: Number, default: 0 },
    bonusTotal: { type: Number, default: 0 },
    statutoryTotal: { type: Number, default: 0 },
    govtDeductionPct: { type: Number, default: 0 },
    govtDeductionAmount: { type: Number, default: 0 },
    serviceChargePct: { type: Number, default: 0 },
    serviceChargeAmount: { type: Number, default: 0 },
    taxableSubtotal: { type: Number, default: 0 },
    cgstRate: { type: Number, default: 0 },
    cgstAmount: { type: Number, default: 0 },
    sgstRate: { type: Number, default: 0 },
    sgstAmount: { type: Number, default: 0 },
    igstRate: { type: Number, default: 0 },
    igstAmount: { type: Number, default: 0 },
    cessPct: { type: Number, default: 0 },
    cessAmount: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    totalInvoiceAmount: { type: Number, default: 0 },
    amountInWords: { type: String, default: "", trim: true },
    includeFactoryActNote: { type: Boolean, default: false },
    invoiceDate: { type: String, required: true, trim: true },
    dueDate: { type: String, required: true, trim: true },
    paymentTerms: { type: String, default: "Net 30 Days", trim: true },
    status: { type: String, enum: ["Paid", "Pending", "Overdue"], default: "Pending", index: true },
    paymentStage: {
      type: String,
      enum: INVOICE_PAYMENT_STAGES,
      default: "PRE_PAYMENT_SUBMITTED",
      index: true,
    },
    deductionsSlip: { type: [InvoiceDeductionEntrySchema], default: [] },
    totalDeductions: { type: Number, default: 0 },
    paymentReceipts: { type: [InvoicePaymentReceiptSchema], default: [] },
    totalReceived: { type: Number, default: 0 },
    balanceReceivable: { type: Number, default: 0 },
    interestRatePct: { type: Number, default: 24 },
  },
  { timestamps: true, collection: "admin_invoices" }
);

AdminInvoiceSchema.index({ siteId: 1, billingMonth: 1 });
AdminInvoiceSchema.index({ paymentStage: 1, dueDate: 1 });

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

// ─── Atomic Counters (Sequential Vouchers, Invoices, Advances) ──
export interface IAdminCounter extends Document {
  key: string;
  seq: number;
}

const AdminCounterSchema = new Schema<IAdminCounter>(
  {
    key: { type: String, required: true, unique: true, trim: true },
    seq: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true, collection: "admin_counters" }
);

export const AdminCounter: Model<IAdminCounter> =
  mongoose.models.AdminCounter ||
  mongoose.model<IAdminCounter>("AdminCounter", AdminCounterSchema);

export async function getNextSequenceValue(key: string, minSeed = 0): Promise<number> {
  const existing = await AdminCounter.findOne({ key }).lean();
  if (!existing && minSeed > 0) {
    try {
      await AdminCounter.create({ key, seq: minSeed });
    } catch {
      // Ignore race condition on initial counter seed
    }
  }
  const updated = await AdminCounter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { upsert: true, new: true }
  );
  return updated.seq;
}

// ─── Salary Advances Register ─────────────────────────────────
export const ADVANCE_RECOVERY_MODES = [
  "SAME_MONTH",
  "NEXT_MONTH",
  "EMI",
  "MANUAL",
] as const;
export type AdvanceRecoveryMode = (typeof ADVANCE_RECOVERY_MODES)[number];

export const ADVANCE_STATUSES = [
  "OPEN",
  "PARTIAL",
  "RECOVERED",
  "CANCELLED",
] as const;
export type AdvanceStatus = (typeof ADVANCE_STATUSES)[number];

export interface IAdvanceRecoveryEntry {
  monthKey: string;
  deductedAmount: number;
  balanceAfter: number;
  source: "PAYROLL" | "MANUAL";
  note: string;
  recordedAt: string;
}

export interface IAdvanceSignatures {
  receiver: string;
  staff: string;
  manager: string;
  director: string;
}

export interface IAdminSalaryAdvance extends Document {
  staffNo: number;
  monthKey: string;
  date: string;
  employeeObjectId?: mongoose.Types.ObjectId | null;
  employeeId: string;
  legacyEmpCode: string;
  employeeName: string;
  siteId?: mongoose.Types.ObjectId | null;
  onAccountOf: string;
  amount: number;
  recoveryMode: AdvanceRecoveryMode;
  installmentCount: number;
  monthlyAmount: number;
  targetPayrollMonth: string;
  recoveredAmount: number;
  remainingBalance: number;
  status: AdvanceStatus;
  signatures: IAdvanceSignatures;
  voucherId?: mongoose.Types.ObjectId | null;
  voucherNo?: number | null;
  recoveryHistory: IAdvanceRecoveryEntry[];
  remarks: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdvanceRecoveryEntrySchema = new Schema<IAdvanceRecoveryEntry>(
  {
    monthKey: { type: String, required: true, trim: true },
    deductedAmount: { type: Number, default: 0, min: 0 },
    balanceAfter: { type: Number, default: 0, min: 0 },
    source: { type: String, enum: ["PAYROLL", "MANUAL"], default: "PAYROLL" },
    note: { type: String, default: "", trim: true, maxlength: 300 },
    recordedAt: { type: String, default: "", trim: true },
  },
  { _id: false }
);

const AdvanceSignaturesSchema = new Schema<IAdvanceSignatures>(
  {
    receiver: { type: String, default: "", trim: true, maxlength: 120 },
    staff: { type: String, default: "", trim: true, maxlength: 120 },
    manager: { type: String, default: "", trim: true, maxlength: 120 },
    director: { type: String, default: "", trim: true, maxlength: 120 },
  },
  { _id: false }
);

const AdminSalaryAdvanceSchema = new Schema<IAdminSalaryAdvance>(
  {
    staffNo: { type: Number, required: true, min: 1 },
    monthKey: { type: String, required: true, trim: true, index: true },
    date: { type: String, required: true, trim: true },
    employeeObjectId: { type: Schema.Types.ObjectId, ref: "AdminEmployee", default: null, index: true },
    employeeId: { type: String, default: "", trim: true, uppercase: true, index: true },
    legacyEmpCode: { type: String, default: "", trim: true, maxlength: 60 },
    employeeName: { type: String, required: true, trim: true },
    siteId: { type: Schema.Types.ObjectId, ref: "AdminSite", default: null, index: true },
    onAccountOf: { type: String, required: true, trim: true, index: true },
    amount: { type: Number, required: true, min: 1 },
    recoveryMode: {
      type: String,
      enum: ADVANCE_RECOVERY_MODES,
      default: "NEXT_MONTH",
    },
    installmentCount: { type: Number, default: 1, min: 1, max: 36 },
    monthlyAmount: { type: Number, required: true, min: 0 },
    targetPayrollMonth: { type: String, required: true, trim: true, index: true },
    recoveredAmount: { type: Number, default: 0, min: 0 },
    remainingBalance: { type: Number, required: true, min: 0 },
    status: {
      type: String,
      enum: ADVANCE_STATUSES,
      default: "OPEN",
      index: true,
    },
    signatures: { type: AdvanceSignaturesSchema, default: () => ({ receiver: "", staff: "", manager: "", director: "" }) },
    voucherId: { type: Schema.Types.ObjectId, ref: "AdminVoucher", default: null },
    voucherNo: { type: Number, default: null },
    recoveryHistory: [AdvanceRecoveryEntrySchema],
    remarks: { type: String, default: "", trim: true, maxlength: 500 },
  },
  { timestamps: true, collection: "admin_salary_advances" }
);

AdminSalaryAdvanceSchema.index({ monthKey: 1, staffNo: 1 });
AdminSalaryAdvanceSchema.index({ employeeId: 1, status: 1 });
AdminSalaryAdvanceSchema.index({ targetPayrollMonth: 1, status: 1 });
AdminSalaryAdvanceSchema.index({ onAccountOf: 1, date: -1 });

export const AdminSalaryAdvance: Model<IAdminSalaryAdvance> =
  mongoose.models.AdminSalaryAdvance ||
  mongoose.model<IAdminSalaryAdvance>("AdminSalaryAdvance", AdminSalaryAdvanceSchema);

// ─── Printed Payment Vouchers ─────────────────────────────────
export const VOUCHER_PURPOSE_TYPES = [
  "SALARY_PAYOUT",
  "HOLD_RELEASE",
  "ADVANCE",
  "ADJUSTMENT",
  "EXPENSE",
] as const;
export type VoucherPurposeType = (typeof VOUCHER_PURPOSE_TYPES)[number];

export interface IVoucherChequeDetails {
  chequeNo: string;
  chequeDate: string;
  bankAccount: string;
  ifsc: string;
  bankName: string;
  chequeAmount: number;
}

export interface IVoucherBankTransferDetails {
  utrNumber: string;
  bankName: string;
  bankAccount: string;
  transferDate: string;
}

export interface IVoucherUpiDetails {
  upiTransactionId: string;
  upiId: string;
  transferDate: string;
}

export interface IAdminVoucher extends Document {
  voucherNo: number;
  date: string;
  monthKey: string;
  debitHead: string;
  purposeType: VoucherPurposeType;
  payeeName: string;
  employeeObjectId?: mongoose.Types.ObjectId | null;
  employeeId: string;
  siteId?: mongoose.Types.ObjectId | null;
  onAccountOf: string;
  particulars: string;
  amount: number;
  amountInWords: string;
  paymentMode: PaymentMode;
  chequeDetails?: IVoucherChequeDetails;
  bankTransferDetails?: IVoucherBankTransferDetails;
  upiDetails?: IVoucherUpiDetails;
  salaryAdvanceId?: mongoose.Types.ObjectId | null;
  salaryId?: mongoose.Types.ObjectId | null;
  salaryLineItemId?: mongoose.Types.ObjectId | null;
  preparedBy: string;
  approvedBy: string;
  receivedBy: string;
  status: "POSTED" | "CANCELLED";
  remarks: string;
  createdAt: Date;
  updatedAt: Date;
}

const VoucherChequeDetailsSchema = new Schema<IVoucherChequeDetails>(
  {
    chequeNo: { type: String, default: "", trim: true, maxlength: 40 },
    chequeDate: { type: String, default: "", trim: true, maxlength: 40 },
    bankAccount: { type: String, default: "", trim: true, maxlength: 60 },
    ifsc: { type: String, default: "", trim: true, uppercase: true, maxlength: 20 },
    bankName: { type: String, default: "", trim: true, maxlength: 120 },
    chequeAmount: { type: Number, default: 0, min: 0 },
  },
  { _id: false }
);

const VoucherBankTransferDetailsSchema = new Schema<IVoucherBankTransferDetails>(
  {
    utrNumber: { type: String, default: "", trim: true, maxlength: 80 },
    bankName: { type: String, default: "", trim: true, maxlength: 120 },
    bankAccount: { type: String, default: "", trim: true, maxlength: 60 },
    transferDate: { type: String, default: "", trim: true, maxlength: 40 },
  },
  { _id: false }
);

const VoucherUpiDetailsSchema = new Schema<IVoucherUpiDetails>(
  {
    upiTransactionId: { type: String, default: "", trim: true, maxlength: 80 },
    upiId: { type: String, default: "", trim: true, maxlength: 120 },
    transferDate: { type: String, default: "", trim: true, maxlength: 40 },
  },
  { _id: false }
);

const AdminVoucherSchema = new Schema<IAdminVoucher>(
  {
    voucherNo: { type: Number, required: true, unique: true, min: 1, index: true },
    date: { type: String, required: true, trim: true, index: true },
    monthKey: { type: String, required: true, trim: true, index: true },
    debitHead: { type: String, required: true, default: "Salary to Staff", trim: true, maxlength: 160 },
    purposeType: {
      type: String,
      enum: VOUCHER_PURPOSE_TYPES,
      default: "SALARY_PAYOUT",
      index: true,
    },
    payeeName: { type: String, required: true, trim: true, maxlength: 160 },
    employeeObjectId: { type: Schema.Types.ObjectId, ref: "AdminEmployee", default: null, index: true },
    employeeId: { type: String, default: "", trim: true, uppercase: true, index: true },
    siteId: { type: Schema.Types.ObjectId, ref: "AdminSite", default: null, index: true },
    onAccountOf: { type: String, default: "", trim: true, maxlength: 160 },
    particulars: { type: String, required: true, trim: true, maxlength: 1000 },
    amount: { type: Number, required: true, min: 0.01 },
    amountInWords: { type: String, required: true, trim: true, maxlength: 300 },
    paymentMode: {
      type: String,
      enum: PAYMENT_MODES,
      default: "CASH",
      index: true,
    },
    chequeDetails: { type: VoucherChequeDetailsSchema },
    bankTransferDetails: { type: VoucherBankTransferDetailsSchema },
    upiDetails: { type: VoucherUpiDetailsSchema },
    salaryAdvanceId: { type: Schema.Types.ObjectId, ref: "AdminSalaryAdvance", default: null },
    salaryId: { type: Schema.Types.ObjectId, ref: "AdminSalary", default: null },
    salaryLineItemId: { type: Schema.Types.ObjectId, default: null },
    preparedBy: { type: String, default: "", trim: true, maxlength: 120 },
    approvedBy: { type: String, default: "", trim: true, maxlength: 120 },
    receivedBy: { type: String, default: "", trim: true, maxlength: 120 },
    status: { type: String, enum: ["POSTED", "CANCELLED"], default: "POSTED", index: true },
    remarks: { type: String, default: "", trim: true, maxlength: 500 },
  },
  { timestamps: true, collection: "admin_vouchers" }
);

AdminVoucherSchema.index({ date: -1, paymentMode: 1 });
AdminVoucherSchema.index({ employeeId: 1, purposeType: 1 });
AdminVoucherSchema.index({ monthKey: 1, debitHead: 1 });

export const AdminVoucher: Model<IAdminVoucher> =
  mongoose.models.AdminVoucher ||
  mongoose.model<IAdminVoucher>("AdminVoucher", AdminVoucherSchema);


// ─── Phase 5: Site-Wise Salary Rule Profiles ───────────────────
export interface IAdminSalaryRuleProfile extends Document {
  profileCode: string;
  profileName: string;
  siteId?: mongoose.Types.ObjectId | null;
  siteName: string;
  siteMatchKeywords: string[];
  designationFilter: string;
  effectiveFrom: string;
  isTemplate: boolean;
  isActive: boolean;
  wageBasis: WageBasisType;
  otMethod: OtCalcMethod;
  otFixedRate: number;
  shiftRatioNumerator: number;
  shiftRatioDenominator: number;
  allowanceMethod: AllowanceMethod;
  fixedAllowanceMonthly: number;
  bhelEnhancedMonthly: number;
  grseAllowancePct: number;
  canteenRatePerDay: number;
  bonusMode: BonusMode;
  bonusWageBase: BonusWageBase;
  bonusRatePct: number;
  bonusCapType: BonusCapType;
  epfVariant: EpfVariant;
  epfWageBase: EpfWageBase;
  employerEpfRatePct: number;
  esiVariant: EsiVariant;
  employerEsiRatePct: number;
  ptSlabType: PtSlabType;
  deductPtFromEmployee: boolean;
  gemChargeMonthly: number;
  adminChargeMonthly: number;
  roundMode: PayrollRoundMode;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdminSalaryRuleProfileSchema = new Schema<IAdminSalaryRuleProfile>(
  {
    profileCode: { type: String, required: true, unique: true, trim: true, uppercase: true, index: true },
    profileName: { type: String, required: true, trim: true, maxlength: 200 },
    siteId: { type: Schema.Types.ObjectId, ref: "AdminSite", default: null, index: true },
    siteName: { type: String, default: "", trim: true, index: true },
    siteMatchKeywords: { type: [String], default: [] },
    designationFilter: { type: String, default: "", trim: true },
    effectiveFrom: { type: String, default: "2026-01-01", trim: true },
    isTemplate: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    wageBasis: { type: String, enum: WAGE_BASIS_TYPES, default: "DAILY_RATE" },
    otMethod: { type: String, enum: OT_CALC_METHODS, default: "DAILY_RATE_OT" },
    otFixedRate: { type: Number, default: 0, min: 0 },
    shiftRatioNumerator: { type: Number, default: 3, min: 0 },
    shiftRatioDenominator: { type: Number, default: 8, min: 1 },
    allowanceMethod: { type: String, enum: ALLOWANCE_METHODS, default: "NONE" },
    fixedAllowanceMonthly: { type: Number, default: 0, min: 0 },
    bhelEnhancedMonthly: { type: Number, default: 3908, min: 0 },
    grseAllowancePct: { type: Number, default: 5, min: 0 },
    canteenRatePerDay: { type: Number, default: 16, min: 0 },
    bonusMode: { type: String, enum: BONUS_MODES, default: "NONE" },
    bonusWageBase: { type: String, enum: BONUS_WAGE_BASES, default: "PRESENT_PLUS_EXTRA" },
    bonusRatePct: { type: Number, default: 8.33, min: 0 },
    bonusCapType: { type: String, enum: BONUS_CAP_TYPES, default: "NONE" },
    epfVariant: { type: String, enum: EPF_VARIANTS, default: "CAP_15000" },
    epfWageBase: { type: String, enum: EPF_WAGE_BASES, default: "PRESENT_PLUS_EXTRA" },
    employerEpfRatePct: { type: Number, default: 13, min: 0 },
    esiVariant: { type: String, enum: ESI_VARIANTS, default: "CAP_21000" },
    employerEsiRatePct: { type: Number, default: 3.25, min: 0 },
    ptSlabType: { type: String, enum: PT_SLAB_TYPES, default: "WB_STANDARD" },
    deductPtFromEmployee: { type: Boolean, default: true },
    gemChargeMonthly: { type: Number, default: 0, min: 0 },
    adminChargeMonthly: { type: Number, default: 0, min: 0 },
    roundMode: { type: String, enum: PAYROLL_ROUND_MODES, default: "ROUND" },
    notes: { type: String, default: "", trim: true, maxlength: 1000 },
  },
  { timestamps: true, collection: "admin_salary_rule_profiles" }
);

export const AdminSalaryRuleProfile: Model<IAdminSalaryRuleProfile> =
  mongoose.models.AdminSalaryRuleProfile ||
  mongoose.model<IAdminSalaryRuleProfile>("AdminSalaryRuleProfile", AdminSalaryRuleProfileSchema);

// ─── Phase 5: Monthly Payroll Runs & Line Items ───────────────
export const PAYROLL_RUN_STATUSES = ["DRAFT", "REVIEWED", "LOCKED"] as const;
export type PayrollRunStatus = (typeof PAYROLL_RUN_STATUSES)[number];

export const LINE_ITEM_PAYOUT_STATUSES = [
  "UNPAID",
  "HOLD",
  "CHQ_HOLD",
  "PAID",
  "PARTIAL_PAID",
  "LEFT",
  "TRANSFERRED_ADJUST",
] as const;
export type LineItemPayoutStatus = (typeof LINE_ITEM_PAYOUT_STATUSES)[number];

export interface IAdminPayrollRun extends Document {
  runCode: string;
  monthKey: string;
  monthLabel: string;
  daysInMonth: number;
  siteId?: mongoose.Types.ObjectId | null;
  siteName: string;
  ruleProfileId?: mongoose.Types.ObjectId | null;
  ruleProfileCode: string;
  ruleProfileName: string;
  status: PayrollRunStatus;
  headcount: number;
  totalGross: number;
  totalBonusOutsideGross: number;
  totalEpfEmployee: number;
  totalEpfEmployer: number;
  totalEsiEmployee: number;
  totalEsiEmployer: number;
  totalPt: number;
  totalUniformDeduction: number;
  totalAdvanceDeduction: number;
  totalNetPay: number;
  lockedAt: string;
  remarks: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdminPayrollRunSchema = new Schema<IAdminPayrollRun>(
  {
    runCode: { type: String, required: true, unique: true, trim: true, uppercase: true, index: true },
    monthKey: { type: String, required: true, trim: true, index: true },
    monthLabel: { type: String, required: true, trim: true },
    daysInMonth: { type: Number, default: 30, min: 28, max: 31 },
    siteId: { type: Schema.Types.ObjectId, ref: "AdminSite", default: null, index: true },
    siteName: { type: String, required: true, trim: true, index: true },
    ruleProfileId: { type: Schema.Types.ObjectId, ref: "AdminSalaryRuleProfile", default: null },
    ruleProfileCode: { type: String, default: "STANDARD_DEFAULT", trim: true },
    ruleProfileName: { type: String, default: "Standard Payroll Rule", trim: true },
    status: { type: String, enum: PAYROLL_RUN_STATUSES, default: "DRAFT", index: true },
    headcount: { type: Number, default: 0, min: 0 },
    totalGross: { type: Number, default: 0, min: 0 },
    totalBonusOutsideGross: { type: Number, default: 0, min: 0 },
    totalEpfEmployee: { type: Number, default: 0, min: 0 },
    totalEpfEmployer: { type: Number, default: 0, min: 0 },
    totalEsiEmployee: { type: Number, default: 0, min: 0 },
    totalEsiEmployer: { type: Number, default: 0, min: 0 },
    totalPt: { type: Number, default: 0, min: 0 },
    totalUniformDeduction: { type: Number, default: 0, min: 0 },
    totalAdvanceDeduction: { type: Number, default: 0, min: 0 },
    totalNetPay: { type: Number, default: 0, min: 0 },
    lockedAt: { type: String, default: "", trim: true },
    remarks: { type: String, default: "", trim: true, maxlength: 1000 },
  },
  { timestamps: true, collection: "admin_payroll_runs" }
);

AdminPayrollRunSchema.index({ monthKey: 1, siteName: 1 });

export const AdminPayrollRun: Model<IAdminPayrollRun> =
  mongoose.models.AdminPayrollRun ||
  mongoose.model<IAdminPayrollRun>("AdminPayrollRun", AdminPayrollRunSchema);

export interface IAdminSalaryLineItem extends Document {
  payrollRunId: mongoose.Types.ObjectId;
  monthKey: string;
  monthLabel: string;
  siteId?: mongoose.Types.ObjectId | null;
  siteName: string;
  ruleProfileId?: mongoose.Types.ObjectId | null;
  ruleProfileCode: string;
  ruleProfileName: string;
  employeeObjectId?: mongoose.Types.ObjectId | null;
  employeeId: string;
  legacyEmpCode: string;
  employeeName: string;
  designation: string;
  department: string;
  uanNumber: string;
  esiNumber: string;
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  upiId: string;
  wageRate: number;
  rateType: "DAILY" | "MONTHLY";
  daysInMonth: number;
  presentDays: number;
  extraDays: number;
  otHours: number;
  nhDays: number;
  relieverDays: number;
  relieverNote: string;
  presentWages: number;
  extraDutyAmount: number;
  allowanceAmount: number;
  canteenAllowance: number;
  bonusInGross: number;
  bonusOutsideGross: number;
  arrearAddition: number;
  grossSalary: number;
  epfWage: number;
  epfEmployee: number;
  epfEmployer: number;
  esiWage: number;
  esiEmployee: number;
  esiEmployer: number;
  ptComputed: number;
  ptDeducted: number;
  deductPtFromEmployee: boolean;
  gemCharge: number;
  adminCharge: number;
  advanceDeduction: number;
  uniformDeduction: number;
  otherDeduction: number;
  totalDeductions: number;
  netPay: number;
  actualPaidAmount: number;
  factoryComponents?: {
    basic: number;
    hra: number;
    uniformAllowance: number;
    medical: number;
    fuel: number;
    washing: number;
    balancingAllowance: number;
  };
  linkedAdvanceIds: string[];
  linkedUniformPlanIds: string[];
  uniformBalanceAfter: number;
  advanceBalanceAfter: number;
  payoutStatus: LineItemPayoutStatus;
  paymentMode: PaymentMode;
  voucherId?: mongoose.Types.ObjectId | null;
  voucherNo?: number | null;
  holdReason: string;
  remarks: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdminSalaryLineItemSchema = new Schema<IAdminSalaryLineItem>(
  {
    payrollRunId: { type: Schema.Types.ObjectId, ref: "AdminPayrollRun", required: true, index: true },
    monthKey: { type: String, required: true, trim: true, index: true },
    monthLabel: { type: String, required: true, trim: true },
    siteId: { type: Schema.Types.ObjectId, ref: "AdminSite", default: null, index: true },
    siteName: { type: String, required: true, trim: true, index: true },
    ruleProfileId: { type: Schema.Types.ObjectId, ref: "AdminSalaryRuleProfile", default: null },
    ruleProfileCode: { type: String, default: "", trim: true },
    ruleProfileName: { type: String, default: "", trim: true },
    employeeObjectId: { type: Schema.Types.ObjectId, ref: "AdminEmployee", default: null, index: true },
    employeeId: { type: String, required: true, trim: true, uppercase: true, index: true },
    legacyEmpCode: { type: String, default: "", trim: true },
    employeeName: { type: String, required: true, trim: true },
    designation: { type: String, default: "Security Guard", trim: true },
    department: { type: String, default: "Site Security", trim: true },
    uanNumber: { type: String, default: "", trim: true },
    esiNumber: { type: String, default: "", trim: true },
    bankName: { type: String, default: "", trim: true },
    accountNumber: { type: String, default: "", trim: true },
    ifscCode: { type: String, default: "", trim: true, uppercase: true },
    upiId: { type: String, default: "", trim: true },
    wageRate: { type: Number, default: 0, min: 0 },
    rateType: { type: String, enum: ["DAILY", "MONTHLY"], default: "DAILY" },
    daysInMonth: { type: Number, default: 30 },
    presentDays: { type: Number, default: 0, min: 0 },
    extraDays: { type: Number, default: 0, min: 0 },
    otHours: { type: Number, default: 0, min: 0 },
    nhDays: { type: Number, default: 0, min: 0 },
    relieverDays: { type: Number, default: 0, min: 0 },
    relieverNote: { type: String, default: "", trim: true },
    presentWages: { type: Number, default: 0, min: 0 },
    extraDutyAmount: { type: Number, default: 0, min: 0 },
    allowanceAmount: { type: Number, default: 0, min: 0 },
    canteenAllowance: { type: Number, default: 0, min: 0 },
    bonusInGross: { type: Number, default: 0, min: 0 },
    bonusOutsideGross: { type: Number, default: 0, min: 0 },
    arrearAddition: { type: Number, default: 0, min: 0 },
    grossSalary: { type: Number, default: 0, min: 0 },
    epfWage: { type: Number, default: 0, min: 0 },
    epfEmployee: { type: Number, default: 0, min: 0 },
    epfEmployer: { type: Number, default: 0, min: 0 },
    esiWage: { type: Number, default: 0, min: 0 },
    esiEmployee: { type: Number, default: 0, min: 0 },
    esiEmployer: { type: Number, default: 0, min: 0 },
    ptComputed: { type: Number, default: 0, min: 0 },
    ptDeducted: { type: Number, default: 0, min: 0 },
    deductPtFromEmployee: { type: Boolean, default: true },
    gemCharge: { type: Number, default: 0, min: 0 },
    adminCharge: { type: Number, default: 0, min: 0 },
    advanceDeduction: { type: Number, default: 0, min: 0 },
    uniformDeduction: { type: Number, default: 0, min: 0 },
    otherDeduction: { type: Number, default: 0, min: 0 },
    totalDeductions: { type: Number, default: 0, min: 0 },
    netPay: { type: Number, default: 0, min: 0 },
    actualPaidAmount: { type: Number, default: 0, min: 0 },
    factoryComponents: {
      type: new Schema(
        {
          basic: { type: Number, default: 0 },
          hra: { type: Number, default: 0 },
          uniformAllowance: { type: Number, default: 0 },
          medical: { type: Number, default: 0 },
          fuel: { type: Number, default: 0 },
          washing: { type: Number, default: 0 },
          balancingAllowance: { type: Number, default: 0 },
        },
        { _id: false }
      ),
    },
    linkedAdvanceIds: [{ type: String }],
    linkedUniformPlanIds: [{ type: String }],
    uniformBalanceAfter: { type: Number, default: 0, min: 0 },
    advanceBalanceAfter: { type: Number, default: 0, min: 0 },
    payoutStatus: {
      type: String,
      enum: LINE_ITEM_PAYOUT_STATUSES,
      default: "UNPAID",
      index: true,
    },
    paymentMode: { type: String, enum: PAYMENT_MODES, default: "BANK_TRANSFER" },
    voucherId: { type: Schema.Types.ObjectId, ref: "AdminVoucher", default: null },
    voucherNo: { type: Number, default: null },
    holdReason: { type: String, default: "", trim: true },
    remarks: { type: String, default: "", trim: true, maxlength: 500 },
  },
  { timestamps: true, collection: "admin_salary_line_items" }
);

AdminSalaryLineItemSchema.index({ payrollRunId: 1, employeeId: 1 }, { unique: true });
AdminSalaryLineItemSchema.index({ monthKey: 1, payoutStatus: 1 });
AdminSalaryLineItemSchema.index({ monthKey: 1, siteName: 1, employeeId: 1 });

export const AdminSalaryLineItem: Model<IAdminSalaryLineItem> =
  mongoose.models.AdminSalaryLineItem ||
  mongoose.model<IAdminSalaryLineItem>("AdminSalaryLineItem", AdminSalaryLineItemSchema);


// ─── Phase 6: Site Billing Rule Profiles ──────────────────────
export interface IAdminBillingRuleProfile extends Document {
  profileCode: string;
  profileName: string;
  siteId?: mongoose.Types.ObjectId | null;
  siteName: string;
  subUnit: string;
  siteMatchKeywords: string[];
  isTemplate: boolean;
  isActive: boolean;
  archetype: BillingArchetype;
  gstMode: SiteGstMode;
  sacCode: string;
  epfEmployerPct: number;
  edliPct: number;
  pfAdminPct: number;
  pfFixedPerDay: number;
  poolEpfMode: PoolStatutoryMode;
  esiEmployerPct: number;
  poolEsiMode: PoolStatutoryMode;
  bonusPct: number;
  serviceChargePct: number;
  stripGstFromTenderRate: boolean;
  tenderTaxPct: number;
  govtDeductionPct: number;
  cessPct: number;
  subtotalRoundMode: BillingRoundMode;
  gstRoundMode: BillingRoundMode;
  totalRoundMode: BillingRoundMode;
  includeFactoryActNote: boolean;
  interestRatePct: number;
  notes: string;
  createdAt: Date;
  updatedAt: Date;
}

const AdminBillingRuleProfileSchema = new Schema<IAdminBillingRuleProfile>(
  {
    profileCode: { type: String, required: true, unique: true, trim: true, uppercase: true, index: true },
    profileName: { type: String, required: true, trim: true, maxlength: 200 },
    siteId: { type: Schema.Types.ObjectId, ref: "AdminSite", default: null, index: true },
    siteName: { type: String, default: "", trim: true, index: true },
    subUnit: { type: String, default: "", trim: true },
    siteMatchKeywords: { type: [String], default: [] },
    isTemplate: { type: Boolean, default: false, index: true },
    isActive: { type: Boolean, default: true, index: true },
    archetype: { type: String, enum: BILLING_ARCHETYPES, default: "ALL_INCLUSIVE_RATE" },
    gstMode: { type: String, enum: SITE_GST_MODES, default: "INTRA_CGST_SGST" },
    sacCode: { type: String, default: "998533", trim: true },
    epfEmployerPct: { type: Number, default: 12, min: 0 },
    edliPct: { type: Number, default: 0.5, min: 0 },
    pfAdminPct: { type: Number, default: 0.5, min: 0 },
    pfFixedPerDay: { type: Number, default: 0, min: 0 },
    poolEpfMode: { type: String, enum: POOL_STATUTORY_MODES, default: "UNCAPPED" },
    esiEmployerPct: { type: Number, default: 3.25, min: 0 },
    poolEsiMode: { type: String, enum: POOL_STATUTORY_MODES, default: "UNCAPPED" },
    bonusPct: { type: Number, default: 0, min: 0 },
    serviceChargePct: { type: Number, default: 0, min: 0 },
    stripGstFromTenderRate: { type: Boolean, default: false },
    tenderTaxPct: { type: Number, default: 18, min: 0 },
    govtDeductionPct: { type: Number, default: 0, min: 0 },
    cessPct: { type: Number, default: 0, min: 0 },
    subtotalRoundMode: { type: String, enum: BILLING_ROUND_MODES, default: "EXACT_PAISE" },
    gstRoundMode: { type: String, enum: BILLING_ROUND_MODES, default: "ROUND" },
    totalRoundMode: { type: String, enum: BILLING_ROUND_MODES, default: "ROUND" },
    includeFactoryActNote: { type: Boolean, default: false },
    interestRatePct: { type: Number, default: 24, min: 0 },
    notes: { type: String, default: "", trim: true, maxlength: 1000 },
  },
  { timestamps: true, collection: "admin_billing_rule_profiles" }
);

export const AdminBillingRuleProfile: Model<IAdminBillingRuleProfile> =
  mongoose.models.AdminBillingRuleProfile ||
  mongoose.model<IAdminBillingRuleProfile>(
    "AdminBillingRuleProfile",
    AdminBillingRuleProfileSchema
  );
