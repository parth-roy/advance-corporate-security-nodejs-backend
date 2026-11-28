import mongoose from "mongoose";
import {
  AdminEmployee,
  AdminSite,
  EMPLOYEE_RATE_TYPES,
  EMPLOYEE_STATUSES,
  EmployeeRateType,
  EmployeeStatus,
  PAYMENT_MODES,
  PaymentMode,
  SITE_GST_MODES,
  SiteGstMode,
} from "../models/admin/AdminCore.model";
import {
  AdminUniformRecoveryPlan,
  UNIFORM_RECOVERY_MODES,
  UniformRecoveryMode,
} from "../models/admin/AdminOperations.model";
import {
  ADVANCE_RECOVERY_MODES,
  AdvanceRecoveryMode,
  AdminSalaryAdvance,
  getNextSequenceValue,
} from "../models/admin/AdminFinance.model";
import { escapeRegex, logAdminActivity, todayIso } from "../routes/admin/helpers";
import {
  inferDeptCodeFromDesignation,
  parseNumericRate,
} from "./employeeCode.service";

export interface OnboardingSiteInput {
  siteCode?: string;
  siteName: string;
  shortName?: string;
  clientName?: string;
  billToAddress?: string;
  shipToAddress?: string;
  clientGstin?: string;
  stateCode?: string;
  vendorCode?: string;
  contractRef?: string;
  subUnits?: string[] | string;
  sacCode?: string;
  gstMode?: string;
  serviceChargePct?: number | string;
  notes?: string;
}

export interface OnboardingEmployeeInput {
  empCode?: string;
  legacyEmpCode?: string;
  fullName: string;
  siteName: string;
  subUnit?: string;
  designation?: string;
  serviceCategory?: string;
  mobile?: string;
  email?: string;
  rateType?: string;
  baseRate?: number | string;
  uanNumber?: string;
  pfUan?: string;
  esiNumber?: string;
  esiHolder?: string;
  bankName?: string;
  accountNumber?: string;
  ifscCode?: string;
  branchName?: string;
  upiId?: string;
  preferredPaymentMode?: string;
  dateOfJoining?: string;
  fatherOrHusbandName?: string;
  nomineeName?: string;
  status?: string;
  remarks?: string;
}

export interface OnboardingAdvanceInput {
  employeeId?: string;
  legacyEmpCode?: string;
  employeeName?: string;
  siteName?: string;
  onAccountOf?: string;
  date?: string;
  monthKey?: string;
  amount: number | string;
  recoveredAmount?: number | string;
  remainingBalance?: number | string;
  recoveryMode?: string;
  installmentCount?: number | string;
  monthlyAmount?: number | string;
  targetPayrollMonth?: string;
  remarks?: string;
}

export interface OnboardingUniformPlanInput {
  employeeId?: string;
  legacyEmpCode?: string;
  employeeName?: string;
  siteName?: string;
  totalCharge: number | string;
  recoveredAmount?: number | string;
  remainingBalance?: number | string;
  recoveryMode?: string;
  installmentCount?: number | string;
  monthlyAmount?: number | string;
  startMonth?: string;
  remarks?: string;
}

export interface OnboardingImportPayload {
  dryRun?: boolean;
  defaultMonthKey?: string;
  sites?: OnboardingSiteInput[];
  employees?: OnboardingEmployeeInput[];
  openingAdvances?: OnboardingAdvanceInput[];
  openingUniformPlans?: OnboardingUniformPlanInput[];
}

export interface OnboardingValidationError {
  section: "sites" | "employees" | "openingAdvances" | "openingUniformPlans";
  rowIndex: number;
  identifier: string;
  reason: string;
}

export interface NormalizedSiteRow {
  rowIndex: number;
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
  notes: string;
}

export interface NormalizedEmployeeRow {
  rowIndex: number;
  empCode: string;
  deptPrefix: string;
  legacyEmpCode: string;
  fullName: string;
  siteName: string;
  subUnit: string;
  designation: string;
  serviceCategory: string;
  mobile: string;
  email: string;
  rateType: EmployeeRateType;
  baseRate: number;
  uanNumber: string;
  esiNumber: string;
  esiHolder: "Yes" | "No" | "";
  bankName: string;
  accountNumber: string;
  ifscCode: string;
  branchName: string;
  upiId: string;
  preferredPaymentMode: PaymentMode;
  dateOfJoining: string;
  fatherOrHusbandName: string;
  nomineeName: string;
  status: EmployeeStatus;
  remarks: string;
}

export interface NormalizedAdvanceRow {
  rowIndex: number;
  employeeId: string;
  legacyEmpCode: string;
  employeeName: string;
  onAccountOf: string;
  date: string;
  monthKey: string;
  amount: number;
  recoveredAmount: number;
  remainingBalance: number;
  status: "OPEN" | "PARTIAL" | "RECOVERED";
  recoveryMode: AdvanceRecoveryMode;
  installmentCount: number;
  monthlyAmount: number;
  targetPayrollMonth: string;
  remarks: string;
}

export interface NormalizedUniformPlanRow {
  rowIndex: number;
  employeeId: string;
  legacyEmpCode: string;
  employeeName: string;
  siteName: string;
  totalCharge: number;
  recoveredAmount: number;
  remainingBalance: number;
  status: "ACTIVE" | "SETTLED";
  recoveryMode: UniformRecoveryMode;
  installmentCount: number;
  monthlyAmount: number;
  startMonth: string;
  remarks: string;
}

export interface NormalizedOnboardingBatch {
  defaultMonthKey: string;
  sites: NormalizedSiteRow[];
  employees: NormalizedEmployeeRow[];
  openingAdvances: NormalizedAdvanceRow[];
  openingUniformPlans: NormalizedUniformPlanRow[];
  errors: OnboardingValidationError[];
}

export interface OnboardingImportSummary {
  dryRun: boolean;
  defaultMonthKey: string;
  received: {
    sites: number;
    employees: number;
    openingAdvances: number;
    openingUniformPlans: number;
  };
  valid: {
    sites: number;
    employees: number;
    openingAdvances: number;
    openingUniformPlans: number;
  };
  applied: {
    sitesCreated: number;
    sitesUpdated: number;
    employeesCreated: number;
    employeesUpdated: number;
    advancesCreated: number;
    advancesSkippedDuplicate: number;
    uniformPlansCreated: number;
    uniformPlansSkippedDuplicate: number;
  };
  errors: OnboardingValidationError[];
}

const MAX_BATCH_PER_SECTION = 2500;

function round2(value: number): number {
  return Math.round((Number.isFinite(value) ? value : 0) * 100) / 100;
}

function normalizeMonthKey(raw: unknown, fallback = "2026-11"): string {
  const s = String(raw || "").trim();
  if (/^\d{4}-\d{2}$/.test(s)) return s;
  const dmyMatch = s.match(/^(\d{2})[-/](\d{2})[-/](\d{4})$/);
  if (dmyMatch?.[2] && dmyMatch[3]) {
    return `${dmyMatch[3]}-${dmyMatch[2]}`;
  }
  const isoPrefix = s.match(/^(\d{4})-(\d{2})-\d{2}/);
  if (isoPrefix?.[1] && isoPrefix[2]) {
    return `${isoPrefix[1]}-${isoPrefix[2]}`;
  }
  return fallback;
}

function normalizeIsoDate(raw: unknown, fallback = todayIso()): string {
  const s = String(raw || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const dmyMatch = s.match(/^(\d{2})[-/.](\d{2})[-/.](\d{4})$/);
  if (dmyMatch?.[1] && dmyMatch[2] && dmyMatch[3]) {
    return `${dmyMatch[3]}-${dmyMatch[2]}-${dmyMatch[1]}`;
  }
  return fallback;
}

function normalizeGstMode(raw: unknown, stateCode: string): SiteGstMode {
  const s = String(raw || "").trim().toUpperCase();
  if ((SITE_GST_MODES as readonly string[]).includes(s)) return s as SiteGstMode;
  if (s.includes("RCM") || s.includes("REVERSE")) return "RCM";
  if (s.includes("NON") || s.includes("EXEMPT") || s === "NIL") return "NON_GST";
  if (s.includes("IGST") || s.includes("INTER")) return "INTER_IGST";
  if (s.includes("CGST") || s.includes("SGST") || s.includes("INTRA")) return "INTRA_CGST_SGST";
  return stateCode && stateCode !== "19" ? "INTER_IGST" : "INTRA_CGST_SGST";
}

function normalizeRateType(raw: unknown): EmployeeRateType {
  const s = String(raw || "").trim().toUpperCase();
  if ((EMPLOYEE_RATE_TYPES as readonly string[]).includes(s)) return s as EmployeeRateType;
  if (s.includes("DAY") || s === "DAILY" || s === "D") return "DAILY";
  return "MONTHLY";
}

function normalizeEmployeeStatus(raw: unknown): EmployeeStatus {
  const s = String(raw || "").trim().toUpperCase().replace(/\s+/g, "_");
  if ((EMPLOYEE_STATUSES as readonly string[]).includes(s)) return s as EmployeeStatus;
  if (s.includes("HOLD")) return "ON_HOLD";
  if (s.includes("LEFT") || s.includes("INACTIVE") || s.includes("RESIGN")) return "LEFT";
  if (s.includes("TRANSFER")) return "TRANSFERRED";
  return "ACTIVE";
}

function normalizePaymentMode(raw: unknown, upiId: string, accountNumber: string): PaymentMode {
  const s = String(raw || "").trim().toUpperCase().replace(/\s+/g, "_");
  if ((PAYMENT_MODES as readonly string[]).includes(s)) return s as PaymentMode;
  if (s.includes("CHQ") || s.includes("CHEQUE")) return "CHEQUE";
  if (s.includes("CASH")) return "CASH";
  if (s.includes("UPI") || (!accountNumber && upiId)) return "UPI";
  return "BANK_TRANSFER";
}

function normalizeAdvanceRecoveryMode(raw: unknown, installmentCount: number): AdvanceRecoveryMode {
  const s = String(raw || "").trim().toUpperCase().replace(/\s+/g, "_");
  if ((ADVANCE_RECOVERY_MODES as readonly string[]).includes(s)) return s as AdvanceRecoveryMode;
  if (s.includes("SAME")) return "SAME_MONTH";
  if (s.includes("MANUAL")) return "MANUAL";
  if (s.includes("EMI") || installmentCount > 1) return "EMI";
  return "NEXT_MONTH";
}

function normalizeUniformRecoveryMode(raw: unknown, installmentCount: number): UniformRecoveryMode {
  const s = String(raw || "").trim().toUpperCase().replace(/\s+/g, "_");
  if ((UNIFORM_RECOVERY_MODES as readonly string[]).includes(s)) return s as UniformRecoveryMode;
  if (s.includes("NO")) return "NO_RECOVERY";
  if (s.includes("FIXED")) return "FIXED_MONTHLY";
  if (s.includes("ONE")) return "ONE_TIME";
  return installmentCount > 1 ? "EMI_COUNT" : "EMI_COUNT";
}

function parseSubUnits(raw: string[] | string | undefined): string[] {
  if (Array.isArray(raw)) {
    return Array.from(new Set(raw.map((item) => String(item || "").trim()).filter(Boolean)));
  }
  return Array.from(
    new Set(
      String(raw || "")
        .split(/[|;,]/)
        .map((item) => item.trim())
        .filter(Boolean)
    )
  );
}

function sanitizeSiteCodeBase(raw: string): string {
  return (
    raw
      .toUpperCase()
      .replace(/[^A-Z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 18) || "SITE"
  ).replace(/-+$/g, "");
}

/**
 * Pure normalization & validation helper for onboarding CSV/Excel batches.
 * Safe to invoke without a MongoDB connection during unit tests and dry-run previews.
 */
export function normalizeOnboardingBatch(
  payload: OnboardingImportPayload
): NormalizedOnboardingBatch {
  const currentMonth = new Date().toISOString().slice(0, 7);
  const defaultMonthKey = normalizeMonthKey(payload.defaultMonthKey, currentMonth);
  const errors: OnboardingValidationError[] = [];

  const sites: NormalizedSiteRow[] = [];
  const rawSites = Array.isArray(payload.sites) ? payload.sites.slice(0, MAX_BATCH_PER_SECTION) : [];
  rawSites.forEach((raw, idx) => {
    const siteName = String(raw?.siteName || "").trim();
    if (!siteName) {
      errors.push({
        section: "sites",
        rowIndex: idx,
        identifier: String(raw?.siteCode || `Row ${idx + 1}`),
        reason: "siteName is required",
      });
      return;
    }

    const clientGstin = String(raw.clientGstin || "").trim().toUpperCase();
    const gstStatePrefix = /^[0-9]{2}/.test(clientGstin) ? clientGstin.slice(0, 2) : "";
    const stateCode = String(raw.stateCode || gstStatePrefix || "19").trim().slice(0, 5) || "19";
    const rawSiteCode = String(raw.siteCode || "").trim().toUpperCase();
    const serviceChargePct = parseNumericRate(raw.serviceChargePct ?? 0);

    sites.push({
      rowIndex: idx,
      siteCode: rawSiteCode ? sanitizeSiteCodeBase(rawSiteCode) : "",
      siteName,
      shortName: String(raw.shortName || "").trim(),
      clientName: String(raw.clientName || siteName).trim(),
      billToAddress: String(raw.billToAddress || "").trim(),
      shipToAddress: String(raw.shipToAddress || "").trim(),
      clientGstin,
      stateCode,
      vendorCode: String(raw.vendorCode || "").trim(),
      contractRef: String(raw.contractRef || "").trim(),
      subUnits: parseSubUnits(raw.subUnits),
      sacCode: String(raw.sacCode || "998533").trim() || "998533",
      gstMode: normalizeGstMode(raw.gstMode, stateCode),
      serviceChargePct: Math.min(100, Math.max(0, round2(serviceChargePct))),
      notes: String(raw.notes || "").trim(),
    });
  });

  const employees: NormalizedEmployeeRow[] = [];
  const rawEmployees = Array.isArray(payload.employees)
    ? payload.employees.slice(0, MAX_BATCH_PER_SECTION)
    : [];
  const seenEmpCodes = new Set<string>();

  rawEmployees.forEach((raw, idx) => {
    const fullName = String(raw?.fullName || "").trim();
    const siteName = String(raw?.siteName || "").trim();
    const empCode = String(raw?.empCode || "").trim().toUpperCase();
    const legacyEmpCode = String(raw?.legacyEmpCode || "").trim().toUpperCase();

    if (!fullName || !siteName) {
      errors.push({
        section: "employees",
        rowIndex: idx,
        identifier: empCode || legacyEmpCode || fullName || `Row ${idx + 1}`,
        reason: !fullName ? "fullName is required" : "siteName is required",
      });
      return;
    }

    if (empCode && seenEmpCodes.has(empCode)) {
      errors.push({
        section: "employees",
        rowIndex: idx,
        identifier: empCode,
        reason: `Duplicate empCode "${empCode}" in uploaded batch`,
      });
      return;
    }
    if (empCode) seenEmpCodes.add(empCode);

    const designation = String(raw.designation || "Security Guard").trim() || "Security Guard";
    const esiNumber = String(raw.esiNumber || "").trim();
    const uanNumber = String(raw.uanNumber || raw.pfUan || "").trim();
    const upiId = String(raw.upiId || "").trim();
    const accountNumber = String(raw.accountNumber || "").trim();
    const esiHolderRaw = String(raw.esiHolder || "").trim();
    const esiHolder: "Yes" | "No" | "" =
      esiHolderRaw === "Yes" || esiHolderRaw === "No"
        ? esiHolderRaw
        : esiNumber
          ? "Yes"
          : "";

    employees.push({
      rowIndex: idx,
      empCode,
      deptPrefix: inferDeptCodeFromDesignation(designation),
      legacyEmpCode,
      fullName,
      siteName,
      subUnit: String(raw.subUnit || "").trim(),
      designation,
      serviceCategory: String(raw.serviceCategory || "").trim(),
      mobile: String(raw.mobile || "").trim(),
      email: String(raw.email || "").trim().toLowerCase(),
      rateType: normalizeRateType(raw.rateType),
      baseRate: round2(parseNumericRate(raw.baseRate ?? 0)),
      uanNumber,
      esiNumber,
      esiHolder,
      bankName: String(raw.bankName || "").trim(),
      accountNumber,
      ifscCode: String(raw.ifscCode || "").trim().toUpperCase(),
      branchName: String(raw.branchName || "").trim(),
      upiId,
      preferredPaymentMode: normalizePaymentMode(raw.preferredPaymentMode, upiId, accountNumber),
      dateOfJoining: normalizeIsoDate(raw.dateOfJoining, todayIso()),
      fatherOrHusbandName: String(raw.fatherOrHusbandName || "").trim(),
      nomineeName: String(raw.nomineeName || "").trim(),
      status: normalizeEmployeeStatus(raw.status),
      remarks: String(raw.remarks || "").trim(),
    });
  });

  const openingAdvances: NormalizedAdvanceRow[] = [];
  const rawAdvances = Array.isArray(payload.openingAdvances)
    ? payload.openingAdvances.slice(0, MAX_BATCH_PER_SECTION)
    : [];

  rawAdvances.forEach((raw, idx) => {
    const employeeId = String(raw?.employeeId || "").trim().toUpperCase();
    const legacyEmpCode = String(raw?.legacyEmpCode || "").trim().toUpperCase();
    const employeeName = String(raw?.employeeName || "").trim();
    const onAccountOf = String(raw?.onAccountOf || raw?.siteName || "").trim();
    const amount = round2(parseNumericRate(raw?.amount ?? 0));

    if ((!employeeId && !legacyEmpCode && !employeeName) || !onAccountOf || amount <= 0) {
      errors.push({
        section: "openingAdvances",
        rowIndex: idx,
        identifier: employeeId || legacyEmpCode || employeeName || `Row ${idx + 1}`,
        reason:
          amount <= 0
            ? "Advance amount must be greater than 0"
            : !onAccountOf
              ? "onAccountOf or siteName is required"
              : "employeeId, legacyEmpCode, or employeeName is required",
      });
      return;
    }

    const rawRecovered =
      raw.recoveredAmount !== undefined && raw.recoveredAmount !== ""
        ? round2(parseNumericRate(raw.recoveredAmount))
        : 0;
    const recoveredAmount = Math.min(amount, Math.max(0, rawRecovered));
    const remainingBalance =
      raw.remainingBalance !== undefined && raw.remainingBalance !== ""
        ? Math.min(amount, Math.max(0, round2(parseNumericRate(raw.remainingBalance))))
        : round2(Math.max(0, amount - recoveredAmount));
    const effectiveRecovered = round2(Math.max(0, amount - remainingBalance));

    const installmentCount = Math.max(
      1,
      Math.min(36, Math.round(parseNumericRate(raw.installmentCount ?? 1)) || 1)
    );
    const recoveryMode = normalizeAdvanceRecoveryMode(raw.recoveryMode, installmentCount);
    const monthlyAmountRaw = parseNumericRate(raw.monthlyAmount ?? 0);
    const monthlyAmount =
      monthlyAmountRaw > 0
        ? round2(monthlyAmountRaw)
        : recoveryMode === "EMI" && installmentCount > 1
          ? Math.ceil(remainingBalance / installmentCount)
          : remainingBalance;

    const isoDate = normalizeIsoDate(raw.date, `${defaultMonthKey}-01`);
    const monthKey = normalizeMonthKey(raw.monthKey || isoDate, defaultMonthKey);
    const targetPayrollMonth = normalizeMonthKey(raw.targetPayrollMonth || monthKey, defaultMonthKey);

    openingAdvances.push({
      rowIndex: idx,
      employeeId,
      legacyEmpCode,
      employeeName,
      onAccountOf,
      date: isoDate,
      monthKey,
      amount,
      recoveredAmount: effectiveRecovered,
      remainingBalance,
      status: remainingBalance <= 0 ? "RECOVERED" : effectiveRecovered > 0 ? "PARTIAL" : "OPEN",
      recoveryMode,
      installmentCount,
      monthlyAmount,
      targetPayrollMonth,
      remarks: String(raw.remarks || "Imported opening advance balance").trim(),
    });
  });

  const openingUniformPlans: NormalizedUniformPlanRow[] = [];
  const rawUniforms = Array.isArray(payload.openingUniformPlans)
    ? payload.openingUniformPlans.slice(0, MAX_BATCH_PER_SECTION)
    : [];

  rawUniforms.forEach((raw, idx) => {
    const employeeId = String(raw?.employeeId || "").trim().toUpperCase();
    const legacyEmpCode = String(raw?.legacyEmpCode || "").trim().toUpperCase();
    const employeeName = String(raw?.employeeName || "").trim();
    const siteName = String(raw?.siteName || "").trim();
    const totalCharge = round2(parseNumericRate(raw?.totalCharge ?? 0));

    if ((!employeeId && !legacyEmpCode && !employeeName) || !siteName || totalCharge <= 0) {
      errors.push({
        section: "openingUniformPlans",
        rowIndex: idx,
        identifier: employeeId || legacyEmpCode || employeeName || `Row ${idx + 1}`,
        reason:
          totalCharge <= 0
            ? "totalCharge must be greater than 0"
            : !siteName
              ? "siteName is required"
              : "employeeId, legacyEmpCode, or employeeName is required",
      });
      return;
    }

    const rawRecovered =
      raw.recoveredAmount !== undefined && raw.recoveredAmount !== ""
        ? round2(parseNumericRate(raw.recoveredAmount))
        : 0;
    const remainingBalance =
      raw.remainingBalance !== undefined && raw.remainingBalance !== ""
        ? Math.min(totalCharge, Math.max(0, round2(parseNumericRate(raw.remainingBalance))))
        : round2(Math.max(0, totalCharge - Math.min(totalCharge, Math.max(0, rawRecovered))));
    const recoveredAmount = round2(Math.max(0, totalCharge - remainingBalance));

    const installmentCount = Math.max(
      1,
      Math.min(36, Math.round(parseNumericRate(raw.installmentCount ?? 1)) || 1)
    );
    const recoveryMode = normalizeUniformRecoveryMode(raw.recoveryMode, installmentCount);
    const monthlyRaw = parseNumericRate(raw.monthlyAmount ?? 0);
    const monthlyAmount =
      monthlyRaw > 0
        ? round2(monthlyRaw)
        : recoveryMode === "NO_RECOVERY"
          ? 0
          : recoveryMode === "ONE_TIME"
            ? remainingBalance
            : Math.ceil(remainingBalance / installmentCount);

    openingUniformPlans.push({
      rowIndex: idx,
      employeeId,
      legacyEmpCode,
      employeeName,
      siteName,
      totalCharge,
      recoveredAmount,
      remainingBalance,
      status: remainingBalance <= 0 ? "SETTLED" : "ACTIVE",
      recoveryMode,
      installmentCount,
      monthlyAmount,
      startMonth: normalizeMonthKey(raw.startMonth, defaultMonthKey),
      remarks: String(raw.remarks || "Imported opening uniform EMI balance").trim(),
    });
  });

  return {
    defaultMonthKey,
    sites,
    employees,
    openingAdvances,
    openingUniformPlans,
    errors,
  };
}

function allocateUniqueSiteCodeInMemory(
  siteName: string,
  requestedCode: string,
  usedCodes: Set<string>
): string {
  const base = sanitizeSiteCodeBase(requestedCode || siteName);
  if (!usedCodes.has(base)) {
    usedCodes.add(base);
    return base;
  }
  for (let i = 2; i < 10000; i++) {
    const candidate = `${base.slice(0, 13)}-${i}`;
    if (!usedCodes.has(candidate)) {
      usedCodes.add(candidate);
      return candidate;
    }
  }
  const fallback = `${base.slice(0, 10)}-${Date.now().toString(36).toUpperCase()}`;
  usedCodes.add(fallback);
  return fallback;
}

/**
 * Bulk-imports legacy sites, deployed employees (400-1,000+ rows cleanly), opening advances,
 * and unpaid uniform EMI recovery plans into normalized MongoDB collections.
 * Supports dryRun preview and idempotent upserts on re-import.
 */
export async function importOnboardingWorkbookData(
  payload: OnboardingImportPayload
): Promise<OnboardingImportSummary> {
  const dryRun = Boolean(payload?.dryRun);
  const normalized = normalizeOnboardingBatch(payload || {});
  const year = normalized.defaultMonthKey.slice(0, 4) || String(new Date().getFullYear());

  const summary: OnboardingImportSummary = {
    dryRun,
    defaultMonthKey: normalized.defaultMonthKey,
    received: {
      sites: Array.isArray(payload?.sites) ? payload.sites.length : 0,
      employees: Array.isArray(payload?.employees) ? payload.employees.length : 0,
      openingAdvances: Array.isArray(payload?.openingAdvances)
        ? payload.openingAdvances.length
        : 0,
      openingUniformPlans: Array.isArray(payload?.openingUniformPlans)
        ? payload.openingUniformPlans.length
        : 0,
    },
    valid: {
      sites: normalized.sites.length,
      employees: normalized.employees.length,
      openingAdvances: normalized.openingAdvances.length,
      openingUniformPlans: normalized.openingUniformPlans.length,
    },
    applied: {
      sitesCreated: 0,
      sitesUpdated: 0,
      employeesCreated: 0,
      employeesUpdated: 0,
      advancesCreated: 0,
      advancesSkippedDuplicate: 0,
      uniformPlansCreated: 0,
      uniformPlansSkippedDuplicate: 0,
    },
    errors: [...normalized.errors],
  };

  // Load existing sites once for O(1) resolution
  const existingSites = await AdminSite.find()
    .select("_id siteCode siteName clientName gstMode sacCode stateCode subUnits serviceChargePct")
    .lean();

  const siteByName = new Map<string, { _id: mongoose.Types.ObjectId; siteCode: string; siteName: string }>();
  const siteByCode = new Map<string, { _id: mongoose.Types.ObjectId; siteCode: string; siteName: string }>();
  const usedSiteCodes = new Set<string>();

  for (const s of existingSites) {
    const entry = {
      _id: s._id as mongoose.Types.ObjectId,
      siteCode: String(s.siteCode || "").toUpperCase(),
      siteName: String(s.siteName || "").trim(),
    };
    usedSiteCodes.add(entry.siteCode);
    siteByName.set(entry.siteName.toLowerCase(), entry);
    siteByCode.set(entry.siteCode, entry);
  }

  // Load existing employees once
  const existingEmployees = await AdminEmployee.find()
    .select("_id empCode legacyEmpCode fullName siteName")
    .lean();

  const empByCode = new Map<string, { _id: mongoose.Types.ObjectId; empCode: string; legacyEmpCode: string; fullName: string; siteName: string }>();
  const empByLegacy = new Map<string, { _id: mongoose.Types.ObjectId; empCode: string; legacyEmpCode: string; fullName: string; siteName: string }>();
  const empByNameAndSite = new Map<string, { _id: mongoose.Types.ObjectId; empCode: string; legacyEmpCode: string; fullName: string; siteName: string }>();
  const prefixMaxSeq = new Map<string, number>();

  for (const emp of existingEmployees) {
    const rec = {
      _id: emp._id as mongoose.Types.ObjectId,
      empCode: String(emp.empCode || "").trim().toUpperCase(),
      legacyEmpCode: String(emp.legacyEmpCode || "").trim().toUpperCase(),
      fullName: String(emp.fullName || "").trim(),
      siteName: String(emp.siteName || "").trim(),
    };
    if (rec.empCode) empByCode.set(rec.empCode, rec);
    if (rec.legacyEmpCode) empByLegacy.set(rec.legacyEmpCode, rec);
    if (rec.fullName && rec.siteName) {
      empByNameAndSite.set(`${rec.fullName.toLowerCase()}::${rec.siteName.toLowerCase()}`, rec);
    }
    const seqMatch = rec.empCode.match(/^ACS\/([A-Z0-9-]+)\/(\d{4})\/(\d+)$/i);
    if (seqMatch?.[1] && seqMatch[2] && seqMatch[3]) {
      const pKey = `${seqMatch[1].toUpperCase()}:${seqMatch[2]}`;
      prefixMaxSeq.set(pKey, Math.max(prefixMaxSeq.get(pKey) || 0, parseInt(seqMatch[3], 10)));
    }
  }

  const nextInMemoryEmpCode = (prefix: string): string => {
    const key = `${prefix}:${year}`;
    const next = (prefixMaxSeq.get(key) || 0) + 1;
    prefixMaxSeq.set(key, next);
    return `ACS/${prefix}/${year}/${String(next).padStart(3, "0")}`;
  };

  if (dryRun) {
    const plannedSites = new Set(Array.from(siteByName.keys()));
    for (const s of normalized.sites) {
      const exists =
        (s.siteCode && siteByCode.has(s.siteCode)) || siteByName.has(s.siteName.toLowerCase());
      if (exists) {
        summary.applied.sitesUpdated += 1;
      } else {
        summary.applied.sitesCreated += 1;
        plannedSites.add(s.siteName.toLowerCase());
      }
    }
    for (const e of normalized.employees) {
      if (!plannedSites.has(e.siteName.toLowerCase())) {
        plannedSites.add(e.siteName.toLowerCase());
        summary.applied.sitesCreated += 1;
      }
      const exists =
        (e.empCode && empByCode.has(e.empCode)) ||
        (e.legacyEmpCode && empByLegacy.has(e.legacyEmpCode)) ||
        empByNameAndSite.has(`${e.fullName.toLowerCase()}::${e.siteName.toLowerCase()}`);
      if (exists) summary.applied.employeesUpdated += 1;
      else summary.applied.employeesCreated += 1;
    }
    summary.applied.advancesCreated = normalized.openingAdvances.length;
    summary.applied.uniformPlansCreated = normalized.openingUniformPlans.length;
    return summary;
  }

  // 1. Upsert Sites
  const siteBulkOps: any[] = [];
  for (const s of normalized.sites) {
    const existing =
      (s.siteCode ? siteByCode.get(s.siteCode) : undefined) ||
      siteByName.get(s.siteName.toLowerCase());

    if (existing) {
      siteBulkOps.push({
        updateOne: {
          filter: { _id: existing._id },
          update: {
            $set: {
              siteName: s.siteName,
              shortName: s.shortName,
              clientName: s.clientName,
              billToAddress: s.billToAddress,
              shipToAddress: s.shipToAddress,
              clientGstin: s.clientGstin,
              stateCode: s.stateCode,
              vendorCode: s.vendorCode,
              contractRef: s.contractRef,
              sacCode: s.sacCode,
              gstMode: s.gstMode,
              serviceChargePct: s.serviceChargePct,
              notes: s.notes,
              isActive: true,
              ...(s.subUnits.length > 0 ? { subUnits: s.subUnits } : {}),
            },
          },
        },
      });
      summary.applied.sitesUpdated += 1;
    } else {
      const allocatedCode = allocateUniqueSiteCodeInMemory(s.siteName, s.siteCode, usedSiteCodes);
      siteBulkOps.push({
        insertOne: {
          document: {
            siteCode: allocatedCode,
            siteName: s.siteName,
            shortName: s.shortName,
            clientName: s.clientName,
            billToAddress: s.billToAddress,
            shipToAddress: s.shipToAddress,
            clientGstin: s.clientGstin,
            stateCode: s.stateCode,
            vendorCode: s.vendorCode,
            contractRef: s.contractRef,
            subUnits: s.subUnits,
            sacCode: s.sacCode,
            gstMode: s.gstMode,
            serviceChargePct: s.serviceChargePct,
            notes: s.notes,
            isActive: true,
          },
        },
      });
      summary.applied.sitesCreated += 1;
    }
  }

  // Also auto-create any missing sites referenced only in employees / advances / uniform plans
  const referencedSiteNames = new Set<string>([
    ...normalized.employees.map((e) => e.siteName),
    ...normalized.openingAdvances.map((a) => a.onAccountOf),
    ...normalized.openingUniformPlans.map((u) => u.siteName),
  ]);
  for (const s of normalized.sites) {
    siteByName.set(s.siteName.toLowerCase(), {
      _id: new mongoose.Types.ObjectId(),
      siteCode: s.siteCode || sanitizeSiteCodeBase(s.siteName),
      siteName: s.siteName,
    });
  }
  for (const refName of referencedSiteNames) {
    const clean = refName.trim();
    if (!clean || siteByName.has(clean.toLowerCase())) continue;
    const allocatedCode = allocateUniqueSiteCodeInMemory(clean, "", usedSiteCodes);
    siteBulkOps.push({
      insertOne: {
        document: {
          siteCode: allocatedCode,
          siteName: clean,
          clientName: clean,
          stateCode: "19",
          gstMode: "INTRA_CGST_SGST",
          sacCode: "998533",
          isActive: true,
        },
      },
    });
    siteByName.set(clean.toLowerCase(), {
      _id: new mongoose.Types.ObjectId(),
      siteCode: allocatedCode,
      siteName: clean,
    });
    summary.applied.sitesCreated += 1;
  }

  if (siteBulkOps.length > 0) {
    await AdminSite.bulkWrite(siteBulkOps, { ordered: false });
  }

  // Reload canonical Site IDs after bulkWrite
  const canonicalSites = await AdminSite.find().select("_id siteCode siteName").lean();
  siteByName.clear();
  siteByCode.clear();
  for (const s of canonicalSites) {
    const entry = {
      _id: s._id as mongoose.Types.ObjectId,
      siteCode: String(s.siteCode || "").toUpperCase(),
      siteName: String(s.siteName || "").trim(),
    };
    siteByName.set(entry.siteName.toLowerCase(), entry);
    siteByCode.set(entry.siteCode, entry);
  }

  // 2. Chunked Upsert Employees (optimized for 400 - 1,000+ personnel)
  const CHUNK_SIZE = 250;
  for (let start = 0; start < normalized.employees.length; start += CHUNK_SIZE) {
    const slice = normalized.employees.slice(start, start + CHUNK_SIZE);
    const empOps: any[] = [];

    for (const e of slice) {
      const siteEntry = siteByName.get(e.siteName.toLowerCase()) || null;
      const existing =
        (e.empCode ? empByCode.get(e.empCode) : undefined) ||
        (e.legacyEmpCode ? empByLegacy.get(e.legacyEmpCode) : undefined) ||
        empByNameAndSite.get(`${e.fullName.toLowerCase()}::${e.siteName.toLowerCase()}`);

      const resolvedEmpCode =
        existing?.empCode || e.empCode || nextInMemoryEmpCode(e.deptPrefix);

      if (existing) {
        const $set: Record<string, any> = {
          fullName: e.fullName,
          primarySiteId: siteEntry?._id ?? null,
          siteName: siteEntry?.siteName || e.siteName,
          designation: e.designation,
          rateType: e.rateType,
          status: e.status,
        };
        if (e.legacyEmpCode) $set.legacyEmpCode = e.legacyEmpCode;
        if (e.subUnit) $set.subUnit = e.subUnit;
        if (e.serviceCategory) $set.serviceCategory = e.serviceCategory;
        if (e.mobile) $set.mobile = e.mobile;
        if (e.email) $set.email = e.email;
        if (e.baseRate > 0) $set.baseRate = e.baseRate;
        if (e.dateOfJoining) $set.dateOfJoining = e.dateOfJoining;
        if (e.fatherOrHusbandName) $set.fatherOrHusbandName = e.fatherOrHusbandName;
        if (e.nomineeName) $set.nomineeName = e.nomineeName;
        if (e.remarks) $set.remarks = e.remarks;
        if (e.uanNumber) $set["statutory.pfUan"] = e.uanNumber;
        if (e.esiNumber) $set["statutory.esiNumber"] = e.esiNumber;
        if (e.esiHolder) $set["statutory.esiHolder"] = e.esiHolder;
        if (e.bankName) $set["bankDetails.bankName"] = e.bankName;
        if (e.accountNumber) $set["bankDetails.accountNumber"] = e.accountNumber;
        if (e.ifscCode) $set["bankDetails.ifscCode"] = e.ifscCode;
        if (e.branchName) $set["bankDetails.branchName"] = e.branchName;
        if (e.upiId) $set["bankDetails.upiId"] = e.upiId;
        if (e.preferredPaymentMode) {
          $set["bankDetails.preferredPaymentMode"] = e.preferredPaymentMode;
        }

        empOps.push({
          updateOne: {
            filter: { _id: existing._id },
            update: { $set },
          },
        });
        summary.applied.employeesUpdated += 1;
      } else {
        empOps.push({
          insertOne: {
            document: {
              empCode: resolvedEmpCode,
              legacyEmpCode: e.legacyEmpCode,
              primarySiteId: siteEntry?._id ?? null,
              siteName: siteEntry?.siteName || e.siteName,
              subUnit: e.subUnit,
              fullName: e.fullName,
              fatherOrHusbandName: e.fatherOrHusbandName,
              nomineeName: e.nomineeName,
              mobile: e.mobile,
              email: e.email,
              designation: e.designation,
              serviceCategory: e.serviceCategory,
              dateOfJoining: e.dateOfJoining,
              rateType: e.rateType,
              baseRate: e.baseRate,
              bankDetails: {
                bankName: e.bankName,
                accountNumber: e.accountNumber,
                ifscCode: e.ifscCode,
                branchName: e.branchName,
                upiId: e.upiId,
                preferredPaymentMode: e.preferredPaymentMode,
              },
              statutory: {
                esiHolder: e.esiHolder,
                esiNumber: e.esiNumber,
                pfUan: e.uanNumber,
              },
              remarks: e.remarks,
              status: e.status,
            },
          },
        });
        summary.applied.employeesCreated += 1;
      }
    }

    if (empOps.length > 0) {
      await AdminEmployee.bulkWrite(empOps, { ordered: false });
    }
  }

  // Reload canonical Employee map so Opening Advances & Uniform Plans link cleanly
  const canonicalEmployees = await AdminEmployee.find()
    .select("_id empCode legacyEmpCode fullName siteName")
    .lean();
  empByCode.clear();
  empByLegacy.clear();
  empByNameAndSite.clear();
  const empByNameOnly = new Map<string, (typeof canonicalEmployees)[number]>();
  for (const emp of canonicalEmployees) {
    const rec = {
      _id: emp._id as mongoose.Types.ObjectId,
      empCode: String(emp.empCode || "").trim().toUpperCase(),
      legacyEmpCode: String(emp.legacyEmpCode || "").trim().toUpperCase(),
      fullName: String(emp.fullName || "").trim(),
      siteName: String(emp.siteName || "").trim(),
    };
    if (rec.empCode) empByCode.set(rec.empCode, rec);
    if (rec.legacyEmpCode) empByLegacy.set(rec.legacyEmpCode, rec);
    if (rec.fullName && rec.siteName) {
      empByNameAndSite.set(`${rec.fullName.toLowerCase()}::${rec.siteName.toLowerCase()}`, rec);
    }
    if (rec.fullName && !empByNameOnly.has(rec.fullName.toLowerCase())) {
      empByNameOnly.set(rec.fullName.toLowerCase(), emp);
    }
  }

  // 3. Idempotently Insert Opening Salary Advances
  if (normalized.openingAdvances.length > 0) {
    const existingAdvances = await AdminSalaryAdvance.find({
      monthKey: { $in: Array.from(new Set(normalized.openingAdvances.map((a) => a.monthKey))) },
    })
      .select("employeeId legacyEmpCode employeeName onAccountOf date amount monthKey")
      .lean();

    const advanceKeys = new Set(
      existingAdvances.map(
        (a) =>
          `${String(a.employeeId || a.legacyEmpCode || a.employeeName || "").toUpperCase()}::${String(a.onAccountOf || "").toLowerCase()}::${String(a.date || "")}::${round2(Number(a.amount || 0))}`
      )
    );

    for (const adv of normalized.openingAdvances) {
      const matchedEmp =
        (adv.employeeId ? empByCode.get(adv.employeeId) || empByLegacy.get(adv.employeeId) : undefined) ||
        (adv.legacyEmpCode ? empByLegacy.get(adv.legacyEmpCode) || empByCode.get(adv.legacyEmpCode) : undefined) ||
        (adv.employeeName
          ? empByNameAndSite.get(`${adv.employeeName.toLowerCase()}::${adv.onAccountOf.toLowerCase()}`) ||
            empByNameOnly.get(adv.employeeName.toLowerCase())
          : undefined);

      const resolvedEmpId = matchedEmp?.empCode || adv.employeeId || adv.legacyEmpCode;
      const resolvedLegacy = matchedEmp?.legacyEmpCode || adv.legacyEmpCode;
      const resolvedEmpName = matchedEmp?.fullName || adv.employeeName || resolvedEmpId;
      const siteEntry = siteByName.get(adv.onAccountOf.toLowerCase()) || null;
      const resolvedSiteName = siteEntry?.siteName || adv.onAccountOf;

      const dedupeKey = `${String(resolvedEmpId || resolvedLegacy || resolvedEmpName).toUpperCase()}::${resolvedSiteName.toLowerCase()}::${adv.date}::${adv.amount}`;
      if (advanceKeys.has(dedupeKey)) {
        summary.applied.advancesSkippedDuplicate += 1;
        continue;
      }
      advanceKeys.add(dedupeKey);

      const staffNo = await getNextSequenceValue(`advance_staff_no:${adv.monthKey}`);
      await AdminSalaryAdvance.create({
        staffNo,
        monthKey: adv.monthKey,
        date: adv.date,
        employeeObjectId: matchedEmp?._id ?? null,
        employeeId: resolvedEmpId,
        legacyEmpCode: resolvedLegacy,
        employeeName: resolvedEmpName,
        siteId: siteEntry?._id ?? null,
        onAccountOf: resolvedSiteName,
        amount: adv.amount,
        recoveryMode: adv.recoveryMode,
        installmentCount: adv.installmentCount,
        monthlyAmount: adv.monthlyAmount,
        targetPayrollMonth: adv.targetPayrollMonth,
        recoveredAmount: adv.recoveredAmount,
        remainingBalance: adv.remainingBalance,
        status: adv.status,
        remarks: adv.remarks,
        recoveryHistory:
          adv.recoveredAmount > 0
            ? [
                {
                  monthKey: adv.monthKey,
                  deductedAmount: adv.recoveredAmount,
                  balanceAfter: adv.remainingBalance,
                  source: "MANUAL",
                  note: "Opening recovered amount imported from legacy sheet",
                  recordedAt: new Date().toISOString(),
                },
              ]
            : [],
      });
      summary.applied.advancesCreated += 1;
    }
  }

  // 4. Idempotently Insert Unpaid Uniform EMI Plans
  if (normalized.openingUniformPlans.length > 0) {
    const existingPlans = await AdminUniformRecoveryPlan.find({ batchId: "LEGACY_IMPORT" })
      .select("employeeId legacyEmpCode employeeName siteName totalCharge startMonth")
      .lean();

    const planKeys = new Set(
      existingPlans.map(
        (p) =>
          `${String(p.employeeId || p.legacyEmpCode || p.employeeName || "").toUpperCase()}::${String(p.siteName || "").toLowerCase()}::${p.startMonth}::${round2(Number(p.totalCharge || 0))}`
      )
    );

    const planDocs: any[] = [];
    for (const plan of normalized.openingUniformPlans) {
      const matchedEmp =
        (plan.employeeId ? empByCode.get(plan.employeeId) || empByLegacy.get(plan.employeeId) : undefined) ||
        (plan.legacyEmpCode ? empByLegacy.get(plan.legacyEmpCode) || empByCode.get(plan.legacyEmpCode) : undefined) ||
        (plan.employeeName
          ? empByNameAndSite.get(`${plan.employeeName.toLowerCase()}::${plan.siteName.toLowerCase()}`) ||
            empByNameOnly.get(plan.employeeName.toLowerCase())
          : undefined);

      const resolvedEmpId = (matchedEmp?.empCode || plan.employeeId || plan.legacyEmpCode || plan.employeeName).toUpperCase();
      const resolvedLegacy = matchedEmp?.legacyEmpCode || plan.legacyEmpCode;
      const resolvedEmpName = matchedEmp?.fullName || plan.employeeName || resolvedEmpId;
      const siteEntry = siteByName.get(plan.siteName.toLowerCase()) || null;
      const resolvedSiteName = siteEntry?.siteName || plan.siteName;

      const dedupeKey = `${resolvedEmpId}::${resolvedSiteName.toLowerCase()}::${plan.startMonth}::${plan.totalCharge}`;
      if (planKeys.has(dedupeKey)) {
        summary.applied.uniformPlansSkippedDuplicate += 1;
        continue;
      }
      planKeys.add(dedupeKey);

      planDocs.push({
        batchId: "LEGACY_IMPORT",
        issueIds: [],
        employeeObjectId: matchedEmp?._id ?? null,
        employeeId: resolvedEmpId,
        legacyEmpCode: resolvedLegacy,
        employeeName: resolvedEmpName,
        siteId: siteEntry?._id ?? null,
        siteName: resolvedSiteName,
        totalCharge: plan.totalCharge,
        recoveryMode: plan.recoveryMode,
        installmentCount: plan.installmentCount,
        monthlyAmount: plan.monthlyAmount,
        startMonth: plan.startMonth,
        recoveredAmount: plan.recoveredAmount,
        creditedAmount: 0,
        remainingBalance: plan.remainingBalance,
        status: plan.status,
        lastDeductedMonth: "",
        remarks: plan.remarks,
        installmentHistory:
          plan.recoveredAmount > 0
            ? [
                {
                  monthKey: plan.startMonth,
                  scheduledAmount: plan.totalCharge,
                  deductedAmount: plan.recoveredAmount,
                  balanceAfter: plan.remainingBalance,
                  source: "MANUAL",
                  note: "Opening recovered uniform charge imported from legacy register",
                  recordedAt: new Date().toISOString(),
                },
              ]
            : [],
      });
    }

    if (planDocs.length > 0) {
      await AdminUniformRecoveryPlan.insertMany(planDocs, { ordered: false });
      summary.applied.uniformPlansCreated += planDocs.length;
    }
  }

  await logAdminActivity(
    "Legacy onboarding workbook imported",
    `Sites +${summary.applied.sitesCreated}/~${summary.applied.sitesUpdated}, Employees +${summary.applied.employeesCreated}/~${summary.applied.employeesUpdated}, Advances +${summary.applied.advancesCreated}, Uniform EMIs +${summary.applied.uniformPlansCreated}.`,
    "Settings"
  );

  return summary;
}
