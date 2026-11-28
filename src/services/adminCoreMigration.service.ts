import { AdminEmployee, AdminSite, IAdminSite } from "../models/admin/AdminCore.model";
import {
  AdminAttendance,
  AdminCandidate,
  AdminUniformIssue,
} from "../models/admin/AdminOperations.model";
import {
  AdminInvoice,
  AdminSalary,
  AdminStatutory,
} from "../models/admin/AdminFinance.model";
import {
  deriveUniqueSiteCode,
  generateNextEmployeeCode,
  isSyntheticEmployeeCode,
  parseNumericRate,
} from "./employeeCode.service";
import { todayIso } from "../routes/admin/helpers";

export interface CoreMigrationSummary {
  sitesCreated: number;
  sitesExisting: number;
  candidatesLinked: number;
  employeesCreated: number;
  employeesExisting: number;
}

/**
 * Idempotently migrates legacy locations and deployed personnel out of
 * mixed recruitment/attendance/payroll tables into normalized AdminSite and AdminEmployee collections.
 */
export async function migrateCoreSitesAndEmployees(): Promise<CoreMigrationSummary> {
  const summary: CoreMigrationSummary = {
    sitesCreated: 0,
    sitesExisting: 0,
    candidatesLinked: 0,
    employeesCreated: 0,
    employeesExisting: 0,
  };

  // 1. Gather all existing site documents + legacy location strings
  const existingSites = await AdminSite.find();
  const siteMap = new Map<string, IAdminSite>();
  for (const s of existingSites) {
    siteMap.set(s.siteName.trim().toLowerCase(), s);
    summary.sitesExisting += 1;
  }

  const [candLocs, attLocs, salLocs, statLocs, invSites, uniSites] = await Promise.all([
    AdminCandidate.distinct("location"),
    AdminAttendance.distinct("location"),
    AdminSalary.distinct("location"),
    AdminStatutory.distinct("location"),
    AdminInvoice.distinct("site"),
    AdminUniformIssue.distinct("site"),
  ]);

  const allRawSiteNames = [...candLocs, ...attLocs, ...salLocs, ...statLocs, ...invSites, ...uniSites];
  for (const rawName of allRawSiteNames) {
    const clean = String(rawName || "").trim();
    if (!clean) continue;
    const key = clean.toLowerCase();
    if (siteMap.has(key)) continue;

    const siteCode = await deriveUniqueSiteCode(clean);
    const created = await AdminSite.create({
      siteCode,
      siteName: clean,
      clientName: clean,
      stateCode: "19",
      gstMode: "INTRA_CGST_SGST",
      sacCode: "998533",
      isActive: true,
    });
    siteMap.set(key, created);
    summary.sitesCreated += 1;
  }

  const resolveSite = async (name: string): Promise<IAdminSite | null> => {
    const clean = String(name || "").trim();
    if (!clean) return null;
    const key = clean.toLowerCase();
    const hit = siteMap.get(key);
    if (hit) return hit;

    const siteCode = await deriveUniqueSiteCode(clean);
    const created = await AdminSite.create({
      siteCode,
      siteName: clean,
      clientName: clean,
      stateCode: "19",
      gstMode: "INTRA_CGST_SGST",
      sacCode: "998533",
      isActive: true,
    });
    siteMap.set(key, created);
    summary.sitesCreated += 1;
    return created;
  };

  // Build quick lookup sets of existing employees by empCode & candidateId
  const existingEmployees = await AdminEmployee.find().lean();
  const empByCode = new Map<string, string>();
  const empByCandidateId = new Set<string>();
  for (const emp of existingEmployees) {
    empByCode.set(String(emp.empCode || "").trim().toUpperCase(), String(emp._id));
    if (emp.candidateId) {
      empByCandidateId.add(String(emp.candidateId));
    }
    summary.employeesExisting += 1;
  }

  // 2. Link Candidates to AdminSite & migrate Selected/ID-assigned Candidates into AdminEmployee
  const candidates = await AdminCandidate.find();
  for (const cand of candidates) {
    const siteDoc = await resolveSite(cand.location);
    let candModified = false;

    if (siteDoc && (!cand.siteId || String(cand.siteId) !== String(siteDoc._id))) {
      cand.siteId = siteDoc._id;
      candModified = true;
      summary.candidatesLinked += 1;
    }

    const candIdStr = String(cand._id);
    const rawEmpCode = String(cand.employeeId || "").trim().toUpperCase();
    const hasRealCode = Boolean(rawEmpCode) && !isSyntheticEmployeeCode(rawEmpCode);
    const shouldDeploy = cand.status === "Selected" || hasRealCode;

    if (
      shouldDeploy &&
      !cand.convertedEmployeeObjectId &&
      !empByCandidateId.has(candIdStr)
    ) {
      const existingByCode = hasRealCode ? empByCode.get(rawEmpCode) : undefined;
      if (existingByCode) {
        cand.convertedEmployeeObjectId = existingByCode as any;
        cand.convertedAt = cand.convertedAt || todayIso();
        candModified = true;
      } else {
        const finalCode = hasRealCode
          ? rawEmpCode
          : await generateNextEmployeeCode({
              designation: cand.joiningAs || cand.position,
              year: (cand.dateOfJoining || cand.applicationDate || "").slice(0, 4),
            });

        const parsedRate = parseNumericRate(cand.salary);
        const createdEmp = await AdminEmployee.create({
          empCode: finalCode,
          candidateId: cand._id,
          primarySiteId: siteDoc?._id ?? null,
          siteName: siteDoc?.siteName || cand.location,
          fullName: cand.fullName,
          fatherOrHusbandName: cand.fatherOrHusbandName || "",
          dateOfBirth: cand.dateOfBirth || "",
          permanentAddress: cand.permanentAddress || "",
          presentAddress: cand.presentAddress || "",
          maritalStatus: cand.maritalStatus || "",
          highestQualification: cand.highestQualification || "",
          mobile: cand.mobile || "",
          email: cand.email || "",
          designation: (cand.joiningAs || cand.position || "Security Guard").trim(),
          serviceCategory: cand.serviceCategory || "",
          dateOfJoining: cand.dateOfJoining || cand.applicationDate || todayIso(),
          rateType: parsedRate > 0 && parsedRate < 2500 ? "DAILY" : "MONTHLY",
          baseRate: parsedRate,
          statutory: {
            esiHolder: cand.esiHolder || "",
            esiNumber: cand.esiNumber || cand.documents?.previousEsiPf?.esiNumber || "",
            pfUan: cand.uanNumber || cand.documents?.previousEsiPf?.pfNumber || "",
          },
          nomineeName: cand.nomineeName || "",
          familyMembers: cand.familyMembers || [],
          documents: cand.documents || {},
          remarks: cand.remarks || "",
          status: "ACTIVE",
        });

        empByCode.set(finalCode, String(createdEmp._id));
        empByCandidateId.add(candIdStr);
        cand.employeeId = finalCode;
        cand.convertedEmployeeObjectId = createdEmp._id;
        cand.convertedAt = todayIso();
        candModified = true;
        summary.employeesCreated += 1;
      }
    }

    if (candModified) {
      await cand.save();
    }
  }

  // 3. Backfill standalone employees seen only in Salary / Statutory / Attendance with real IDs
  const [salaries, statutoryRows, attendanceRows] = await Promise.all([
    AdminSalary.find().lean(),
    AdminStatutory.find().lean(),
    AdminAttendance.find().lean(),
  ]);

  for (const sal of salaries) {
    const code = String(sal.employeeId || "").trim().toUpperCase();
    if (!code || isSyntheticEmployeeCode(code) || empByCode.has(code)) continue;
    const siteDoc = await resolveSite(sal.location);
    const created = await AdminEmployee.create({
      empCode: code,
      primarySiteId: siteDoc?._id ?? null,
      siteName: siteDoc?.siteName || sal.location,
      fullName: sal.employeeName,
      designation: sal.designation || "Security Guard",
      rateType: "MONTHLY",
      baseRate: Number(sal.basicSalary) || 0,
      status: sal.status === "On Hold" ? "ON_HOLD" : "ACTIVE",
    });
    empByCode.set(code, String(created._id));
    summary.employeesCreated += 1;
  }

  for (const stat of statutoryRows) {
    const code = String(stat.employeeId || "").trim().toUpperCase();
    if (!code || isSyntheticEmployeeCode(code) || empByCode.has(code)) continue;
    const siteDoc = await resolveSite(stat.location);
    const created = await AdminEmployee.create({
      empCode: code,
      primarySiteId: siteDoc?._id ?? null,
      siteName: siteDoc?.siteName || stat.location,
      fullName: stat.employeeName,
      designation: stat.designation || "Security Guard",
      rateType: "MONTHLY",
      baseRate: Number(stat.basicSalary) || 0,
      statutory: {
        esiHolder: stat.esiNumber || stat.uanNumber ? "Yes" : "",
        esiNumber: stat.esiNumber || "",
        pfUan: stat.uanNumber || "",
      },
      status: "ACTIVE",
    });
    empByCode.set(code, String(created._id));
    summary.employeesCreated += 1;
  }

  for (const att of attendanceRows) {
    const code = String(att.employeeId || "").trim().toUpperCase();
    if (!code || isSyntheticEmployeeCode(code) || empByCode.has(code)) continue;
    const siteDoc = await resolveSite(att.location);
    const created = await AdminEmployee.create({
      empCode: code,
      primarySiteId: siteDoc?._id ?? null,
      siteName: siteDoc?.siteName || att.location,
      fullName: att.employeeName,
      designation: att.designation || "Security Guard",
      rateType: "MONTHLY",
      baseRate: 0,
      status: "ACTIVE",
    });
    empByCode.set(code, String(created._id));
    summary.employeesCreated += 1;
  }

  return summary;
}
