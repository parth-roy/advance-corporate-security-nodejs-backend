import mongoose from "mongoose";
import { AdminEmployee, AdminSite, IAdminSite, PAYMENT_MODES, PaymentMode } from "../models/admin/AdminCore.model";
import {
  AdminCandidate,
  IAcademicQualificationDocs,
  ICandidateDocuments,
  IFamilyMember,
  IUploadedDocumentFile,
} from "../models/admin/AdminOperations.model";
import { escapeRegex } from "../routes/admin/helpers";

export const STANDARD_DOCUMENT_KEYS = [
  "aadharCard",
  "panCard",
  "bankDetails",
  "voterId",
  "colorPhoto",
  "pcc",
  "mfc",
  "characterCertificate",
  "previousExperienceProof",
  "otherDocument",
] as const;

export const ACADEMIC_QUALIFICATION_KEYS = ["10th", "12th", "Graduation", "Masters"] as const;

export const SYNTHETIC_EMPLOYEE_ID_RE = /^ACS\/(SITE|ATT|IMP)\//i;

export function isSyntheticEmployeeCode(value: string): boolean {
  return SYNTHETIC_EMPLOYEE_ID_RE.test(value.trim());
}

export function inferDeptCodeFromDesignation(designation: string): string {
  const clean = designation.trim().toLowerCase();
  if (!clean) return "SEC";
  if (/(ward\s*boy|nurse|medical|hospital|attendant)/.test(clean)) return "MED";
  if (/(driver|delivery|courier|fleet)/.test(clean)) return "DRV";
  if (/(garden|mali|horti|landscap)/.test(clean)) return "HRT";
  if (/(clean|housekeep|janitor|sweep|pest|facade|maid|sanit)/.test(clean)) return "CLE";
  if (/(electri|plumb|hvac|chiller|dg|generator|lift|carpenter|paint|weld|fitter|bms|tech|maint|stp|wtp)/.test(clean)) {
    return "TEC";
  }
  if (/(warehouse|loader|picker|packer|forklift|rigg|factory|machine|labour|worker|dispatch)/.test(clean)) {
    return "LOG";
  }
  if (/(office|peon|pantry|front\s*desk|data\s*entry|clerk|admin|chef|cook)/.test(clean)) return "ADM";
  if (/(security|guard|bouncer|patrol|cctv|pso|fire|gate|supervisor)/.test(clean)) return "SEC";

  const letters = clean.replace(/[^a-z]/g, "").toUpperCase();
  return letters.slice(0, 3) || "GEN";
}

export async function generateNextEmployeeCode(params: {
  prefix?: string;
  designation?: string;
  year?: string;
}): Promise<string> {
  const prefix = (
    params.prefix?.trim() || inferDeptCodeFromDesignation(params.designation || "")
  )
    .toUpperCase()
    .replace(/[^A-Z0-9-]/g, "") || "SEC";

  const year =
    (params.year || String(new Date().getFullYear())).replace(/\D/g, "").slice(0, 4) ||
    String(new Date().getFullYear());

  const pattern = new RegExp(`^ACS/${escapeRegex(prefix)}/${escapeRegex(year)}/(\\d+)$`, "i");
  const prefixRegex = new RegExp(`^ACS/${escapeRegex(prefix)}/${escapeRegex(year)}/`, "i");

  const [empDocs, candDocs] = await Promise.all([
    AdminEmployee.find({ empCode: prefixRegex }).select("empCode").lean(),
    AdminCandidate.find({ employeeId: prefixRegex }).select("employeeId").lean(),
  ]);

  let maxSeq = 0;
  for (const doc of empDocs) {
    const match = String(doc.empCode || "").match(pattern);
    if (match?.[1]) maxSeq = Math.max(maxSeq, parseInt(match[1], 10));
  }
  for (const doc of candDocs) {
    const match = String(doc.employeeId || "").match(pattern);
    if (match?.[1]) maxSeq = Math.max(maxSeq, parseInt(match[1], 10));
  }

  const nextSeq = String(maxSeq + 1).padStart(3, "0");
  return `ACS/${prefix}/${year}/${nextSeq}`;
}

export async function deriveUniqueSiteCode(siteName: string, requestedCode?: string): Promise<string> {
  const existingDocs = await AdminSite.find().select("siteCode").lean();
  const existingSet = new Set(existingDocs.map((d) => String(d.siteCode || "").toUpperCase()));

  const baseRaw = (requestedCode?.trim() || siteName)
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");

  const base = (baseRaw.slice(0, 18) || "SITE").replace(/-+$/g, "");
  if (!existingSet.has(base)) return base;

  for (let i = 2; i < 1000; i++) {
    const candidate = `${base.slice(0, 14)}-${i}`;
    if (!existingSet.has(candidate)) return candidate;
  }
  return `${base.slice(0, 12)}-${Date.now().toString(36).toUpperCase()}`;
}

export async function resolveOrCreateSite(params: {
  siteId?: string | null;
  siteName?: string;
  clientName?: string;
}): Promise<IAdminSite | null> {
  if (params.siteId && mongoose.Types.ObjectId.isValid(params.siteId)) {
    const foundById = await AdminSite.findById(params.siteId);
    if (foundById) return foundById;
  }

  const cleanName = String(params.siteName || "").trim();
  if (!cleanName) return null;

  const existing = await AdminSite.findOne({
    siteName: new RegExp(`^${escapeRegex(cleanName)}$`, "i"),
  });
  if (existing) return existing;

  const siteCode = await deriveUniqueSiteCode(cleanName);
  return AdminSite.create({
    siteCode,
    siteName: cleanName,
    clientName: String(params.clientName || cleanName).trim(),
    stateCode: "19",
    gstMode: "INTRA_CGST_SGST",
    sacCode: "998533",
    isActive: true,
  });
}

export function sanitizeFamilyMembers(raw: unknown): IFamilyMember[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => ({
      name: typeof item?.name === "string" ? item.name.trim() : "",
      relation: typeof item?.relation === "string" ? item.relation.trim() : "",
      dateOfBirth: typeof item?.dateOfBirth === "string" ? item.dateOfBirth.trim() : "",
    }))
    .filter((m) => m.name || m.relation || m.dateOfBirth);
}

export function sanitizeUploadedDoc(raw: unknown): IUploadedDocumentFile | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  const fileName = typeof record.fileName === "string" ? record.fileName.trim() : "";
  const fileUrl = typeof record.fileUrl === "string" ? record.fileUrl.trim() : "";
  if (!fileName && !fileUrl) return undefined;

  const doc: IUploadedDocumentFile = { fileName, fileUrl };
  if (typeof record.mimeType === "string" && record.mimeType.trim()) {
    doc.mimeType = record.mimeType.trim();
  }
  if (typeof record.uploadedAt === "string" && record.uploadedAt.trim()) {
    doc.uploadedAt = record.uploadedAt.trim();
  }
  return doc;
}

export function sanitizePreviousEsiPf(
  raw: unknown
): (IUploadedDocumentFile & { esiNumber?: string; pfNumber?: string }) | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  const baseDoc = sanitizeUploadedDoc(record);
  const esiNumber = typeof record.esiNumber === "string" ? record.esiNumber.trim() : "";
  const pfNumber = typeof record.pfNumber === "string" ? record.pfNumber.trim() : "";

  if (!baseDoc && !esiNumber && !pfNumber) return undefined;

  const result: IUploadedDocumentFile & { esiNumber?: string; pfNumber?: string } = baseDoc
    ? { ...baseDoc }
    : { fileName: "", fileUrl: "" };
  if (esiNumber) result.esiNumber = esiNumber;
  if (pfNumber) result.pfNumber = pfNumber;
  return result;
}

export function sanitizeAcademicQualification(raw: unknown): IAcademicQualificationDocs | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const record = raw as Record<string, unknown>;
  const sanitized: IAcademicQualificationDocs = {};
  let hasAny = false;
  for (const key of ACADEMIC_QUALIFICATION_KEYS) {
    const doc = sanitizeUploadedDoc(record[key]);
    if (doc) {
      sanitized[key] = doc;
      hasAny = true;
    }
  }
  return hasAny ? sanitized : undefined;
}

export function sanitizeDocuments(raw: unknown): ICandidateDocuments {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const record = raw as Record<string, unknown>;
  const sanitized: ICandidateDocuments = {};

  for (const key of STANDARD_DOCUMENT_KEYS) {
    const doc = sanitizeUploadedDoc(record[key]);
    if (doc) sanitized[key] = doc;
  }

  const academicQualification = sanitizeAcademicQualification(record.academicQualification);
  if (academicQualification) sanitized.academicQualification = academicQualification;

  const previousEsiPf = sanitizePreviousEsiPf(record.previousEsiPf);
  if (previousEsiPf) sanitized.previousEsiPf = previousEsiPf;

  return sanitized;
}

export function sanitizeBankDetails(raw: unknown) {
  const record = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const modeRaw = String(record.preferredPaymentMode || "BANK_TRANSFER").trim().toUpperCase();
  const preferredPaymentMode: PaymentMode = (PAYMENT_MODES as readonly string[]).includes(modeRaw)
    ? (modeRaw as PaymentMode)
    : "BANK_TRANSFER";
  return {
    bankName: String(record.bankName || "").trim().slice(0, 150),
    accountNumber: String(record.accountNumber || "").trim().slice(0, 60),
    ifscCode: String(record.ifscCode || "").trim().toUpperCase().slice(0, 20),
    branchName: String(record.branchName || "").trim().slice(0, 150),
    upiId: String(record.upiId || "").trim().slice(0, 120),
    preferredPaymentMode,
  };
}

export function parseNumericRate(rawSalary: unknown): number {
  if (typeof rawSalary === "number" && Number.isFinite(rawSalary) && rawSalary >= 0) {
    return rawSalary;
  }
  const text = String(rawSalary || "").replace(/,/g, "");
  const match = text.match(/(\d+(?:\.\d+)?)/);
  if (!match?.[1]) return 0;
  const val = Number(match[1]);
  return Number.isFinite(val) && val >= 0 ? val : 0;
}
