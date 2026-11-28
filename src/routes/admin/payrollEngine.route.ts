import { Router, Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { AdminEmployee, AdminSite, PAYMENT_MODES, PaymentMode } from "../../models/admin/AdminCore.model";
import {
  AdminAttendance,
  AdminUniformRecoveryPlan,
} from "../../models/admin/AdminOperations.model";
import {
  AdminPayrollRun,
  AdminPayslip,
  AdminSalary,
  AdminSalaryAdvance,
  AdminSalaryLineItem,
  AdminSalaryRuleProfile,
  AdminStatutory,
  LINE_ITEM_PAYOUT_STATUSES,
  LineItemPayoutStatus,
  PAYROLL_RUN_STATUSES,
} from "../../models/admin/AdminFinance.model";
import {
  ensureSalaryRuleTemplatesSeeded,
  resolveSalaryRuleForSite,
} from "../../data/salaryRuleTemplates";
import {
  calculateEmployeePayrollLine,
  ISalaryRuleConfig,
} from "../../services/payrollCalculation.service";
import {
  buildPaginationMeta,
  escapeRegex,
  getParamId,
  logAdminActivity,
  parsePaginationParams,
  serializeDoc,
  stripMetaFields,
  todayIso,
} from "./helpers";

export const salaryRulesAdminRouter = Router();
export const payrollRunsAdminRouter = Router();

const MONTH_NAMES = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

function parseMonthKeyAndLabel(rawMonthKey: unknown): {
  monthKey: string;
  monthLabel: string;
  year: string;
  daysInMonth: number;
} {
  const clean = typeof rawMonthKey === "string" ? rawMonthKey.trim() : "";
  const key = /^\d{4}-\d{2}$/.test(clean) ? clean : todayIso().slice(0, 7);
  const [yStr, mStr] = key.split("-");
  const y = Number(yStr) || new Date().getFullYear();
  const m = Number(mStr) || 1;
  const daysInMonth = new Date(y, m, 0).getDate();
  const monthName = MONTH_NAMES[Math.max(0, Math.min(11, m - 1))] ?? "January";
  return {
    monthKey: key,
    monthLabel: `${monthName} ${y}`,
    year: String(y),
    daysInMonth,
  };
}

function deriveRunCode(monthKey: string, siteCodeOrName: string): string {
  const cleanSite = siteCodeOrName
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 24);
  return `PAY-${monthKey}-${cleanSite || "ALL"}`;
}

async function recomputeRunSummaryTotals(runId: string | mongoose.Types.ObjectId) {
  const lineItems = await AdminSalaryLineItem.find({ payrollRunId: runId }).lean();
  const totals = lineItems.reduce(
    (acc, item) => {
      acc.headcount += 1;
      acc.totalGross += Number(item.grossSalary) || 0;
      acc.totalBonusOutsideGross += Number(item.bonusOutsideGross) || 0;
      acc.totalEpfEmployee += Number(item.epfEmployee) || 0;
      acc.totalEpfEmployer += Number(item.epfEmployer) || 0;
      acc.totalEsiEmployee += Number(item.esiEmployee) || 0;
      acc.totalEsiEmployer += Number(item.esiEmployer) || 0;
      acc.totalPt += Number(item.ptDeducted) || 0;
      acc.totalUniformDeduction += Number(item.uniformDeduction) || 0;
      acc.totalAdvanceDeduction += Number(item.advanceDeduction) || 0;
      acc.totalNetPay += Number(item.netPay) || 0;
      return acc;
    },
    {
      headcount: 0,
      totalGross: 0,
      totalBonusOutsideGross: 0,
      totalEpfEmployee: 0,
      totalEpfEmployer: 0,
      totalEsiEmployee: 0,
      totalEsiEmployer: 0,
      totalPt: 0,
      totalUniformDeduction: 0,
      totalAdvanceDeduction: 0,
      totalNetPay: 0,
    }
  );

  const rounded = {
    headcount: totals.headcount,
    totalGross: Math.round(totals.totalGross * 100) / 100,
    totalBonusOutsideGross: Math.round(totals.totalBonusOutsideGross * 100) / 100,
    totalEpfEmployee: Math.round(totals.totalEpfEmployee * 100) / 100,
    totalEpfEmployer: Math.round(totals.totalEpfEmployer * 100) / 100,
    totalEsiEmployee: Math.round(totals.totalEsiEmployee * 100) / 100,
    totalEsiEmployer: Math.round(totals.totalEsiEmployer * 100) / 100,
    totalPt: Math.round(totals.totalPt * 100) / 100,
    totalUniformDeduction: Math.round(totals.totalUniformDeduction * 100) / 100,
    totalAdvanceDeduction: Math.round(totals.totalAdvanceDeduction * 100) / 100,
    totalNetPay: Math.round(totals.totalNetPay * 100) / 100,
  };

  return AdminPayrollRun.findByIdAndUpdate(runId, { $set: rounded }, { new: true });
}

// ─── Salary Rule Profiles (/api/admin/salary-rules) ───────────
salaryRulesAdminRouter.get("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await ensureSalaryRuleTemplatesSeeded();
    const { isTemplate, siteId, search } = req.query;
    const filter: Record<string, any> = {};

    if (isTemplate === "true" || isTemplate === "false") {
      filter.isTemplate = isTemplate === "true";
    }
    if (typeof siteId === "string" && mongoose.Types.ObjectId.isValid(siteId)) {
      filter.siteId = siteId;
    }
    if (typeof search === "string" && search.trim()) {
      const rx = new RegExp(escapeRegex(search.trim()), "i");
      filter.$or = [
        { profileCode: rx },
        { profileName: rx },
        { siteName: rx },
        { notes: rx },
      ];
    }

    const profiles = await AdminSalaryRuleProfile.find(filter)
      .sort({ isTemplate: 1, siteName: 1, profileName: 1 })
      .limit(200)
      .lean();

    res.json({
      success: true,
      count: profiles.length,
      data: profiles.map(serializeDoc),
    });
  } catch (err) {
    next(err);
  }
});

salaryRulesAdminRouter.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await ensureSalaryRuleTemplatesSeeded();
    const body = stripMetaFields(req.body);
    const profileName = String(body.profileName || "").trim();
    const siteName = String(body.siteName || "").trim();
    let profileCode = String(body.profileCode || "")
      .trim()
      .toUpperCase()
      .replace(/[^A-Z0-9_]+/g, "_");

    if (!profileName) {
      res.status(400).json({ success: false, message: "profileName is required" });
      return;
    }

    if (!profileCode) {
      profileCode = (siteName || profileName)
        .toUpperCase()
        .replace(/[^A-Z0-9]+/g, "_")
        .replace(/^_|_$/g, "")
        .slice(0, 32);
    }

    const existingCode = await AdminSalaryRuleProfile.exists({ profileCode });
    if (existingCode) {
      profileCode = `${profileCode}_${Date.now().toString(36).slice(-4).toUpperCase()}`;
    }

    let siteDoc: any = null;
    if (typeof body.siteId === "string" && mongoose.Types.ObjectId.isValid(body.siteId)) {
      siteDoc = await AdminSite.findById(body.siteId).lean();
    } else if (siteName) {
      siteDoc = await AdminSite.findOne({ siteName: new RegExp(`^${escapeRegex(siteName)}$`, "i") }).lean();
    }

    const created = await AdminSalaryRuleProfile.create({
      ...body,
      profileCode,
      profileName,
      siteId: siteDoc?._id ?? null,
      siteName: siteDoc?.siteName || siteName,
      isTemplate: body.isTemplate === true,
      isActive: body.isActive !== false,
    });

    await logAdminActivity(
      "Salary rule created",
      `Saved payroll rule ${created.profileName} (${created.profileCode}).`,
      "Payroll"
    );

    res.status(201).json({ success: true, data: serializeDoc(created) });
  } catch (err) {
    next(err);
  }
});

salaryRulesAdminRouter.patch("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Salary rule profile not found" });
      return;
    }

    const updates = stripMetaFields(req.body);
    if (typeof updates.siteName === "string" && updates.siteName.trim()) {
      const siteDoc = await AdminSite.findOne({
        siteName: new RegExp(`^${escapeRegex(updates.siteName.trim())}$`, "i"),
      }).lean();
      if (siteDoc) {
        updates.siteId = siteDoc._id;
        updates.siteName = siteDoc.siteName;
      }
    }

    const updated = await AdminSalaryRuleProfile.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!updated) {
      res.status(404).json({ success: false, message: "Salary rule profile not found" });
      return;
    }

    await logAdminActivity(
      "Salary rule updated",
      `Updated rule configuration ${updated.profileName}.`,
      "Payroll"
    );

    res.json({ success: true, data: serializeDoc(updated) });
  } catch (err) {
    next(err);
  }
});

salaryRulesAdminRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Salary rule profile not found" });
      return;
    }
    const existing = await AdminSalaryRuleProfile.findById(id);
    if (!existing) {
      res.status(404).json({ success: false, message: "Salary rule profile not found" });
      return;
    }
    if (existing.profileCode === "STANDARD_DEFAULT") {
      res.status(400).json({ success: false, message: "Cannot delete STANDARD_DEFAULT fallback profile." });
      return;
    }
    await AdminSalaryRuleProfile.findByIdAndDelete(id);
    res.json({ success: true, message: "Salary rule profile deleted", data: serializeDoc(existing) });
  } catch (err) {
    next(err);
  }
});

// ─── Payroll Runs (/api/admin/payroll-runs) ───────────────────
payrollRunsAdminRouter.get("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { monthKey, siteName, status } = req.query;
    const { page, limit, skip } = parsePaginationParams(req.query, 25, 100);
    const filter: Record<string, any> = {};

    if (typeof monthKey === "string" && /^\d{4}-\d{2}$/.test(monthKey.trim())) {
      filter.monthKey = monthKey.trim();
    }
    if (typeof siteName === "string" && siteName.trim() && siteName !== "All") {
      filter.siteName = new RegExp(`^${escapeRegex(siteName.trim())}$`, "i");
    }
    if (typeof status === "string" && (PAYROLL_RUN_STATUSES as readonly string[]).includes(status)) {
      filter.status = status;
    }

    const [runs, total] = await Promise.all([
      AdminPayrollRun.find(filter).sort({ monthKey: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
      AdminPayrollRun.countDocuments(filter),
    ]);

    res.json({
      success: true,
      count: runs.length,
      pagination: buildPaginationMeta(page, limit, total),
      data: runs.map(serializeDoc),
    });
  } catch (err) {
    next(err);
  }
});

payrollRunsAdminRouter.post(
  "/generate",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await ensureSalaryRuleTemplatesSeeded();
      const body = stripMetaFields(req.body);
      const { monthKey, monthLabel, daysInMonth } = parseMonthKeyAndLabel(body.monthKey);
      const rawSiteName = String(body.siteName || "").trim();
      const rawSiteId = typeof body.siteId === "string" && mongoose.Types.ObjectId.isValid(body.siteId) ? body.siteId : null;

      if (!rawSiteName && !rawSiteId) {
        res.status(400).json({ success: false, message: "siteName or siteId is required to generate a payroll run." });
        return;
      }

      const siteDoc = rawSiteId
        ? await AdminSite.findById(rawSiteId).lean()
        : await AdminSite.findOne({ siteName: new RegExp(`^${escapeRegex(rawSiteName)}$`, "i") }).lean();
      const resolvedSiteName = siteDoc?.siteName || rawSiteName;
      const runCode = deriveRunCode(monthKey, siteDoc?.siteCode || resolvedSiteName);

      const existingRun = await AdminPayrollRun.findOne({ runCode });
      if (existingRun && existingRun.status === "LOCKED") {
        res.status(409).json({
          success: false,
          message: `Payroll run ${runCode} is already LOCKED. Unlock or create a supplementary run instead.`,
        });
        return;
      }

      const ruleProfile = await resolveSalaryRuleForSite({
        siteId: siteDoc ? String(siteDoc._id) : null,
        siteName: resolvedSiteName,
        ruleProfileId: typeof body.ruleProfileId === "string" ? body.ruleProfileId : null,
      });

      const siteRegex = new RegExp(`^${escapeRegex(resolvedSiteName)}$`, "i");
      const [employees, attendanceDocs, activeUniformPlans, openAdvances] = await Promise.all([
        AdminEmployee.find({
          status: { $ne: "LEFT" },
          ...(siteDoc ? { $or: [{ primarySiteId: siteDoc._id }, { siteName: siteRegex }] } : { siteName: siteRegex }),
        })
          .sort({ fullName: 1 })
          .lean(),
        AdminAttendance.find({
          monthKey,
          $or: [
            ...(siteDoc ? [{ workSiteId: siteDoc._id }] : []),
            { location: siteRegex },
          ],
        }).lean(),
        AdminUniformRecoveryPlan.find({
          status: "ACTIVE",
          remainingBalance: { $gt: 0 },
          startMonth: { $lte: monthKey },
        }).lean(),
        AdminSalaryAdvance.find({
          status: { $in: ["OPEN", "PARTIAL"] },
          remainingBalance: { $gt: 0 },
          targetPayrollMonth: { $lte: monthKey },
        }).lean(),
      ]);

      // Build unified employee roster & alias lookup (empCode, legacyEmpCode, ObjectId, unique name)
      const rosterMap = new Map<string, any>();
      const aliasToCanon = new Map<string, string>();
      const nameCounts = new Map<string, number>();
      const nameToCanon = new Map<string, string>();

      const registerEmployeeInRoster = (emp: any): string => {
        const canon = String(emp.empCode || emp._id).trim().toUpperCase();
        rosterMap.set(canon, emp);
        aliasToCanon.set(canon, canon);
        if (emp._id) aliasToCanon.set(String(emp._id), canon);
        const leg = String(emp.legacyEmpCode || "").trim().toUpperCase();
        if (leg && !aliasToCanon.has(leg)) aliasToCanon.set(leg, canon);
        const nm = String(emp.fullName || "").trim().toLowerCase();
        if (nm) {
          const cnt = (nameCounts.get(nm) ?? 0) + 1;
          nameCounts.set(nm, cnt);
          if (cnt === 1) nameToCanon.set(nm, canon);
          else nameToCanon.delete(nm);
        }
        return canon;
      };

      for (const emp of employees) {
        registerEmployeeInRoster(emp);
      }

      // Look up any reliever / legacy-coded employees appearing in site attendance or manual overrides
      const candidateObjIds = new Set<string>();
      const candidateCodes = new Set<string>();
      for (const att of attendanceDocs) {
        if (att.employeeObjectId && !aliasToCanon.has(String(att.employeeObjectId))) {
          candidateObjIds.add(String(att.employeeObjectId));
        }
        const rawCode = String(att.employeeId || "").trim().toUpperCase();
        if (rawCode && !aliasToCanon.has(rawCode)) candidateCodes.add(rawCode);
      }
      if (Array.isArray(body.manualEntries)) {
        for (const m of body.manualEntries) {
          const rawCode = String(m?.employeeId || "").trim().toUpperCase();
          if (rawCode && !aliasToCanon.has(rawCode)) candidateCodes.add(rawCode);
        }
      }
      if (candidateObjIds.size > 0 || candidateCodes.size > 0) {
        const extraEmps = await AdminEmployee.find({
          $or: [
            ...(candidateObjIds.size > 0
              ? [{ _id: { $in: Array.from(candidateObjIds).filter((id) => mongoose.Types.ObjectId.isValid(id)) } }]
              : []),
            ...(candidateCodes.size > 0
              ? [
                  { empCode: { $in: Array.from(candidateCodes) } },
                  { legacyEmpCode: { $in: Array.from(candidateCodes) } },
                ]
              : []),
          ],
        }).lean();
        for (const emp of extraEmps) {
          registerEmployeeInRoster(emp);
        }
      }

      const resolveCanonicalKey = (
        employeeObjectId?: unknown,
        employeeId?: unknown,
        legacyEmpCode?: unknown,
        employeeName?: unknown
      ): string => {
        if (employeeObjectId) {
          const mapped = aliasToCanon.get(String(employeeObjectId));
          if (mapped) return mapped;
        }
        const rawId = String(employeeId || "").trim().toUpperCase();
        if (rawId) {
          const mapped = aliasToCanon.get(rawId);
          if (mapped) return mapped;
        }
        const rawLeg = String(legacyEmpCode || "").trim().toUpperCase();
        if (rawLeg) {
          const mapped = aliasToCanon.get(rawLeg);
          if (mapped) return mapped;
        }
        const rawName = String(employeeName || "").trim().toLowerCase();
        if (rawName) {
          const mapped = nameToCanon.get(rawName);
          if (mapped) return mapped;
        }
        return rawId || rawLeg || rawName.toUpperCase();
      };

      // Group attendance per canonical employee key
      const attByEmp = new Map<
        string,
        {
          employeeId: string;
          employeeName: string;
          designation: string;
          presentDays: number;
          extraDays: number;
          otHours: number;
          nhDays: number;
          relieverDays: number;
          relieverNotes: string[];
        }
      >();

      for (const att of attendanceDocs) {
        const key = resolveCanonicalKey(att.employeeObjectId, att.employeeId, undefined, att.employeeName);
        if (!key) continue;
        const curr = attByEmp.get(key) ?? {
          employeeId: att.employeeId || key,
          employeeName: att.employeeName,
          designation: att.designation || "Security Guard",
          presentDays: 0,
          extraDays: 0,
          otHours: 0,
          nhDays: 0,
          relieverDays: 0,
          relieverNotes: [],
        };
        const nDuty = Number(att.normalDuty) || 0;
        const eDuty = Number(att.extraDuty) || 0;
        const otH = Number(att.otHours) || 0;
        curr.presentDays += nDuty;
        curr.extraDays += eDuty;
        curr.otHours += otH;
        if (att.status === "National Holiday") curr.nhDays += 1;
        if (att.isReliever) {
          curr.relieverDays += nDuty + eDuty;
          if (att.adjustmentNote) curr.relieverNotes.push(att.adjustmentNote);
        }
        attByEmp.set(key, curr);
      }

      const manualMap = new Map<string, any>();
      if (Array.isArray(body.manualEntries)) {
        for (const m of body.manualEntries) {
          const code = resolveCanonicalKey(m.employeeObjectId, m.employeeId, m.legacyEmpCode, m.employeeName);
          if (code) manualMap.set(code, m);
        }
      }

      const defaultPresentDays =
        Number.isFinite(Number(body.defaultPresentDays)) && Number(body.defaultPresentDays) >= 0
          ? Number(body.defaultPresentDays)
          : 26;

      // Index Uniform & Advance recoveries by canonical key (supporting ObjectId, empCode, legacyEmpCode)
      const uniformByEmp = new Map<string, typeof activeUniformPlans>();
      for (const plan of activeUniformPlans) {
        const key = resolveCanonicalKey(
          plan.employeeObjectId,
          plan.employeeId,
          plan.legacyEmpCode,
          plan.employeeName
        );
        if (!key) continue;
        uniformByEmp.set(key, [...(uniformByEmp.get(key) ?? []), plan]);
      }

      const advanceByEmp = new Map<string, typeof openAdvances>();
      for (const adv of openAdvances) {
        const key = resolveCanonicalKey(
          adv.employeeObjectId,
          adv.employeeId,
          adv.legacyEmpCode,
          adv.employeeName
        );
        if (!key) continue;
        advanceByEmp.set(key, [...(advanceByEmp.get(key) ?? []), adv]);
      }

      const collectUniqueForEmp = <T extends { _id: unknown }>(
        indexMap: Map<string, T[]>,
        empKey: string,
        emp: any
      ): T[] => {
        const lookupKeys = new Set<string>([empKey]);
        if (emp?.empCode) lookupKeys.add(String(emp.empCode).trim().toUpperCase());
        if (emp?.legacyEmpCode) lookupKeys.add(String(emp.legacyEmpCode).trim().toUpperCase());
        if (emp?._id) lookupKeys.add(String(emp._id));
        const byId = new Map<string, T>();
        for (const k of lookupKeys) {
          for (const item of indexMap.get(k) ?? []) {
            byId.set(String(item._id), item);
          }
        }
        return Array.from(byId.values());
      };

      const runDoc =
        existingRun ||
        (await AdminPayrollRun.create({
          runCode,
          monthKey,
          monthLabel,
          daysInMonth,
          siteId: siteDoc?._id ?? null,
          siteName: resolvedSiteName,
          ruleProfileId: "_id" in ruleProfile ? ruleProfile._id : null,
          ruleProfileCode: ruleProfile.profileCode,
          ruleProfileName: ruleProfile.profileName,
          status: "DRAFT",
          remarks: String(body.remarks || "").trim(),
        }));

      runDoc.ruleProfileId = "_id" in ruleProfile ? (ruleProfile._id as mongoose.Types.ObjectId) : null;
      runDoc.ruleProfileCode = ruleProfile.profileCode;
      runDoc.ruleProfileName = ruleProfile.profileName;
      runDoc.daysInMonth = daysInMonth;
      await runDoc.save();

      // Clear previous draft line items for regeneration cleanly
      await AdminSalaryLineItem.deleteMany({ payrollRunId: runDoc._id });

      const allKeys = new Set<string>([
        ...rosterMap.keys(),
        ...attByEmp.keys(),
        ...manualMap.keys(),
      ]);

      const lineDocs: any[] = [];
      for (const empKey of allKeys) {
        const emp = rosterMap.get(empKey);
        const att = attByEmp.get(empKey);
        const manual = manualMap.get(empKey) || {};

        const presentDays =
          manual.presentDays !== undefined
            ? Number(manual.presentDays)
            : att
              ? att.presentDays
              : body.useDefaultDaysWhenNoAttendance !== false
                ? defaultPresentDays
                : 0;
        const extraDays = manual.extraDays !== undefined ? Number(manual.extraDays) : att?.extraDays ?? 0;
        const otHours = manual.otHours !== undefined ? Number(manual.otHours) : att?.otHours ?? 0;
        const nhDays = manual.nhDays !== undefined ? Number(manual.nhDays) : att?.nhDays ?? 0;
        const rate =
          manual.wageRate !== undefined
            ? Number(manual.wageRate)
            : Number(emp?.baseRate) || 0;

        if (presentDays === 0 && extraDays === 0 && otHours === 0) continue;

        const uPlans = collectUniqueForEmp(uniformByEmp, empKey, emp);
        const autoUniformDue = uPlans.reduce(
          (sum, p) => sum + Math.min(p.remainingBalance, p.monthlyAmount || p.remainingBalance),
          0
        );
        const uniformDeduction =
          manual.uniformDeduction !== undefined
            ? Number(manual.uniformDeduction)
            : body.autoPullRecoveries !== false
              ? Math.round(autoUniformDue * 100) / 100
              : 0;

        const advList = collectUniqueForEmp(advanceByEmp, empKey, emp);
        const autoAdvanceDue = advList.reduce(
          (sum, a) =>
            sum +
            (a.recoveryMode === "EMI"
              ? Math.min(a.remainingBalance, a.monthlyAmount || a.remainingBalance)
              : a.remainingBalance),
          0
        );
        const advanceDeduction =
          manual.advanceDeduction !== undefined
            ? Number(manual.advanceDeduction)
            : body.autoPullRecoveries !== false
              ? Math.round(autoAdvanceDue * 100) / 100
              : 0;

        const calc = calculateEmployeePayrollLine({
          rate,
          presentDays,
          extraDays,
          otHours,
          nhDays,
          daysInMonth,
          canteenDays: manual.canteenDays,
          fixedAllowanceOverride: manual.fixedAllowanceOverride,
          arrearAddition: Number(manual.arrearAddition) || 0,
          advanceDeduction,
          uniformDeduction,
          otherDeduction: Number(manual.otherDeduction) || 0,
          pfExemptEmployee: emp?.statutory?.pfUan === "EXEMPT",
          esiExemptEmployee: emp?.statutory?.esiHolder === "No",
          rule: ruleProfile as Partial<ISalaryRuleConfig>,
        });

        const totalUniformOutstanding = uPlans.reduce((s, p) => s + p.remainingBalance, 0);
        const totalAdvOutstanding = advList.reduce((s, a) => s + a.remainingBalance, 0);

        lineDocs.push({
          payrollRunId: runDoc._id,
          monthKey,
          monthLabel,
          siteId: siteDoc?._id ?? emp?.primarySiteId ?? null,
          siteName: resolvedSiteName,
          ruleProfileId: runDoc.ruleProfileId,
          ruleProfileCode: runDoc.ruleProfileCode,
          ruleProfileName: runDoc.ruleProfileName,
          employeeObjectId: emp?._id ?? null,
          employeeId: emp?.empCode || att?.employeeId || empKey,
          legacyEmpCode: emp?.legacyEmpCode || "",
          employeeName: emp?.fullName || att?.employeeName || manual.employeeName || empKey,
          designation: emp?.designation || att?.designation || "Security Guard",
          department: emp?.serviceCategory || "Site Security",
          uanNumber: emp?.statutory?.pfUan || "",
          esiNumber: emp?.statutory?.esiNumber || "",
          bankName: emp?.bankDetails?.bankName || "",
          accountNumber: emp?.bankDetails?.accountNumber || "",
          ifscCode: emp?.bankDetails?.ifscCode || "",
          upiId: emp?.bankDetails?.upiId || "",
          wageRate: rate,
          rateType: emp?.rateType || (ruleProfile.wageBasis === "DAILY_RATE" ? "DAILY" : "MONTHLY"),
          daysInMonth: calc.daysInMonth,
          presentDays: calc.presentDays,
          extraDays: calc.extraDays,
          otHours: calc.otHours,
          nhDays: calc.nhDays,
          relieverDays: att?.relieverDays ?? 0,
          relieverNote: att?.relieverNotes?.join("; ") || "",
          presentWages: calc.presentWages,
          extraDutyAmount: calc.extraDutyAmount,
          allowanceAmount: calc.allowanceAmount,
          canteenAllowance: calc.canteenAllowance,
          bonusInGross: calc.bonusInGross,
          bonusOutsideGross: calc.bonusOutsideGross,
          arrearAddition: calc.arrearAddition,
          grossSalary: calc.grossSalary,
          epfWage: calc.epfWage,
          epfEmployee: calc.epfEmployee,
          epfEmployer: calc.epfEmployer,
          esiWage: calc.esiWage,
          esiEmployee: calc.esiEmployee,
          esiEmployer: calc.esiEmployer,
          ptComputed: calc.ptComputed,
          ptDeducted: calc.ptDeducted,
          deductPtFromEmployee: ruleProfile.deductPtFromEmployee,
          gemCharge: calc.gemCharge,
          adminCharge: calc.adminCharge,
          advanceDeduction: calc.advanceDeduction,
          uniformDeduction: calc.uniformDeduction,
          otherDeduction: calc.otherDeduction,
          totalDeductions: calc.totalDeductions,
          netPay: calc.netPay,
          actualPaidAmount: 0,
          ...(calc.factoryComponents ? { factoryComponents: calc.factoryComponents } : {}),
          linkedAdvanceIds: advList.map((a) => String(a._id)),
          linkedUniformPlanIds: uPlans.map((u) => String(u._id)),
          uniformBalanceAfter: Math.max(0, Math.round((totalUniformOutstanding - calc.uniformDeduction) * 100) / 100),
          advanceBalanceAfter: Math.max(0, Math.round((totalAdvOutstanding - calc.advanceDeduction) * 100) / 100),
          payoutStatus: "UNPAID",
          paymentMode: emp?.bankDetails?.preferredPaymentMode || "BANK_TRANSFER",
          holdReason: "",
          remarks: String(manual.remarks || ""),
        });
      }

      const inserted = lineDocs.length > 0 ? await AdminSalaryLineItem.insertMany(lineDocs) : [];
      const updatedRun = await recomputeRunSummaryTotals(runDoc._id);

      await logAdminActivity(
        "Payroll run generated",
        `Generated ${runCode} for ${resolvedSiteName} (${inserted.length} staff, rule ${ruleProfile.profileCode}).`,
        "Payroll"
      );

      res.status(201).json({
        success: true,
        message: `Generated payroll run ${runCode} with ${inserted.length} employee line item(s).`,
        data: {
          run: updatedRun ? serializeDoc(updatedRun) : serializeDoc(runDoc),
          ruleProfile: serializeDoc(ruleProfile),
          lineItems: inserted.map(serializeDoc),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// Update individual line item (must come before /:id routes)
payrollRunsAdminRouter.patch(
  "/line-items/:lineId",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const lineId = String(req.params.lineId || "").trim();
      if (!mongoose.Types.ObjectId.isValid(lineId)) {
        res.status(404).json({ success: false, message: "Salary line item not found" });
        return;
      }

      const line = await AdminSalaryLineItem.findById(lineId);
      if (!line) {
        res.status(404).json({ success: false, message: "Salary line item not found" });
        return;
      }

      const parentRun = await AdminPayrollRun.findById(line.payrollRunId);
      const body = stripMetaFields(req.body);

      const isLocked = parentRun?.status === "LOCKED";
      const hasFormulaEdits =
        body.presentDays !== undefined ||
        body.extraDays !== undefined ||
        body.otHours !== undefined ||
        body.wageRate !== undefined ||
        body.canteenDays !== undefined ||
        body.fixedAllowanceOverride !== undefined ||
        body.arrearAddition !== undefined ||
        body.uniformDeduction !== undefined ||
        body.advanceDeduction !== undefined ||
        body.otherDeduction !== undefined;

      if (isLocked && hasFormulaEdits) {
        res.status(409).json({
          success: false,
          message: "Payroll run is LOCKED. Only payoutStatus, holdReason, actualPaidAmount, or remarks may be updated.",
        });
        return;
      }

      if (hasFormulaEdits) {
        const prevUniformDed = line.uniformDeduction || 0;
        const prevAdvanceDed = line.advanceDeduction || 0;
        const totalUniformOutstanding = (line.uniformBalanceAfter || 0) + prevUniformDed;
        const totalAdvanceOutstanding = (line.advanceBalanceAfter || 0) + prevAdvanceDed;

        if (body.presentDays !== undefined) line.presentDays = Math.max(0, Number(body.presentDays) || 0);
        if (body.extraDays !== undefined) line.extraDays = Math.max(0, Number(body.extraDays) || 0);
        if (body.otHours !== undefined) line.otHours = Math.max(0, Number(body.otHours) || 0);
        if (body.wageRate !== undefined) line.wageRate = Math.max(0, Number(body.wageRate) || 0);
        if (body.arrearAddition !== undefined) line.arrearAddition = Math.max(0, Number(body.arrearAddition) || 0);
        if (body.uniformDeduction !== undefined) line.uniformDeduction = Math.max(0, Number(body.uniformDeduction) || 0);
        if (body.advanceDeduction !== undefined) line.advanceDeduction = Math.max(0, Number(body.advanceDeduction) || 0);
        if (body.otherDeduction !== undefined) line.otherDeduction = Math.max(0, Number(body.otherDeduction) || 0);

        const [ruleProfile, empDoc] = await Promise.all([
          resolveSalaryRuleForSite({
            siteId: line.siteId ? String(line.siteId) : null,
            siteName: line.siteName,
            ruleProfileId: line.ruleProfileId ? String(line.ruleProfileId) : null,
          }),
          line.employeeObjectId
            ? AdminEmployee.findById(line.employeeObjectId).select("statutory").lean()
            : AdminEmployee.findOne({ empCode: line.employeeId }).select("statutory").lean(),
        ]);

        const calc = calculateEmployeePayrollLine({
          rate: line.wageRate,
          presentDays: line.presentDays,
          extraDays: line.extraDays,
          otHours: line.otHours,
          nhDays: line.nhDays,
          daysInMonth: line.daysInMonth,
          canteenDays: body.canteenDays !== undefined ? Number(body.canteenDays) : undefined,
          fixedAllowanceOverride:
            body.fixedAllowanceOverride !== undefined ? Number(body.fixedAllowanceOverride) : undefined,
          arrearAddition: line.arrearAddition,
          advanceDeduction: line.advanceDeduction,
          uniformDeduction: line.uniformDeduction,
          otherDeduction: line.otherDeduction,
          pfExemptEmployee: line.uanNumber === "EXEMPT" || empDoc?.statutory?.pfUan === "EXEMPT",
          esiExemptEmployee: empDoc?.statutory?.esiHolder === "No",
          rule: ruleProfile as Partial<ISalaryRuleConfig>,
        });

        line.presentWages = calc.presentWages;
        line.extraDutyAmount = calc.extraDutyAmount;
        line.allowanceAmount = calc.allowanceAmount;
        line.canteenAllowance = calc.canteenAllowance;
        line.bonusInGross = calc.bonusInGross;
        line.bonusOutsideGross = calc.bonusOutsideGross;
        line.grossSalary = calc.grossSalary;
        line.epfWage = calc.epfWage;
        line.epfEmployee = calc.epfEmployee;
        line.epfEmployer = calc.epfEmployer;
        line.esiWage = calc.esiWage;
        line.esiEmployee = calc.esiEmployee;
        line.esiEmployer = calc.esiEmployer;
        line.ptComputed = calc.ptComputed;
        line.ptDeducted = calc.ptDeducted;
        line.gemCharge = calc.gemCharge;
        line.adminCharge = calc.adminCharge;
        line.totalDeductions = calc.totalDeductions;
        line.netPay = calc.netPay;
        line.uniformBalanceAfter = Math.max(0, Math.round((totalUniformOutstanding - calc.uniformDeduction) * 100) / 100);
        line.advanceBalanceAfter = Math.max(0, Math.round((totalAdvanceOutstanding - calc.advanceDeduction) * 100) / 100);
        if (calc.factoryComponents) line.factoryComponents = calc.factoryComponents;
      }

      if (body.payoutStatus !== undefined) {
        const nextStatus = String(body.payoutStatus).trim().toUpperCase();
        if ((LINE_ITEM_PAYOUT_STATUSES as readonly string[]).includes(nextStatus)) {
          line.payoutStatus = nextStatus as LineItemPayoutStatus;
        }
      }
      if (body.paymentMode !== undefined) {
        const rawMode = String(body.paymentMode).trim().toUpperCase();
        if ((PAYMENT_MODES as readonly string[]).includes(rawMode)) {
          line.paymentMode = rawMode as PaymentMode;
        }
      }
      if (body.actualPaidAmount !== undefined) {
        line.actualPaidAmount = Math.max(0, Number(body.actualPaidAmount) || 0);
      }
      if (body.holdReason !== undefined) line.holdReason = String(body.holdReason || "").trim();
      if (body.remarks !== undefined) line.remarks = String(body.remarks || "").trim();

      await line.save();
      const updatedRun = await recomputeRunSummaryTotals(line.payrollRunId);

      res.json({
        success: true,
        data: {
          lineItem: serializeDoc(line),
          run: updatedRun ? serializeDoc(updatedRun) : null,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

payrollRunsAdminRouter.get("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Payroll run not found" });
      return;
    }

    const [run, lineItems] = await Promise.all([
      AdminPayrollRun.findById(id).lean(),
      AdminSalaryLineItem.find({ payrollRunId: id }).sort({ employeeName: 1 }).lean(),
    ]);

    if (!run) {
      res.status(404).json({ success: false, message: "Payroll run not found" });
      return;
    }

    res.json({
      success: true,
      data: {
        run: serializeDoc(run),
        lineItems: lineItems.map(serializeDoc),
      },
    });
  } catch (err) {
    next(err);
  }
});

payrollRunsAdminRouter.get(
  "/:id/bank-advice",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = getParamId(req);
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(404).json({ success: false, message: "Payroll run not found" });
        return;
      }

      const [run, lineItems] = await Promise.all([
        AdminPayrollRun.findById(id).lean(),
        AdminSalaryLineItem.find({
          payrollRunId: id,
          payoutStatus: { $nin: ["HOLD", "CHQ_HOLD", "LEFT"] },
          netPay: { $gt: 0 },
        })
          .sort({ employeeName: 1 })
          .lean(),
      ]);

      if (!run) {
        res.status(404).json({ success: false, message: "Payroll run not found" });
        return;
      }

      const adviceRows = lineItems.map((line, index) => ({
        slNo: index + 1,
        employeeId: line.employeeId,
        employeeName: line.employeeName,
        siteName: line.siteName,
        bankName: line.bankName || "AXIS / OTHER",
        accountNumber: line.accountNumber,
        ifscCode: line.ifscCode,
        upiId: line.upiId,
        paymentMode: line.paymentMode,
        netPay: line.netPay,
        voucherNo: line.voucherNo ?? null,
        payoutStatus: line.payoutStatus,
      }));

      res.json({
        success: true,
        data: {
          runCode: run.runCode,
          monthKey: run.monthKey,
          monthLabel: run.monthLabel,
          siteName: run.siteName,
          count: adviceRows.length,
          totalPayable: Math.round(adviceRows.reduce((s, r) => s + r.netPay, 0) * 100) / 100,
          rows: adviceRows,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

payrollRunsAdminRouter.patch(
  "/:id/status",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = getParamId(req);
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(404).json({ success: false, message: "Payroll run not found" });
        return;
      }

      const run = await AdminPayrollRun.findById(id);
      if (!run) {
        res.status(404).json({ success: false, message: "Payroll run not found" });
        return;
      }

      const nextStatus = String(req.body?.status || "").trim().toUpperCase();
      if (!(PAYROLL_RUN_STATUSES as readonly string[]).includes(nextStatus)) {
        res.status(400).json({
          success: false,
          message: `status must be one of: ${PAYROLL_RUN_STATUSES.join(", ")}`,
        });
        return;
      }

      if (run.status === "LOCKED" && nextStatus !== "LOCKED") {
        res.status(409).json({
          success: false,
          message: "Locked payroll runs are immutable and cannot be reverted.",
        });
        return;
      }

      const lineItems = await AdminSalaryLineItem.find({ payrollRunId: run._id });
      const today = todayIso();

      if (nextStatus === "LOCKED" && run.status !== "LOCKED") {
        run.status = "LOCKED";
        run.lockedAt = today;

        for (const line of lineItems) {
          // 1. Commit linked Uniform Recovery deductions idempotently for run.monthKey
          if (line.uniformDeduction > 0 && line.linkedUniformPlanIds.length > 0) {
            let remainingToApply = line.uniformDeduction;
            for (const planId of line.linkedUniformPlanIds) {
              if (remainingToApply <= 0 || !mongoose.Types.ObjectId.isValid(planId)) continue;
              const plan = await AdminUniformRecoveryPlan.findById(planId);
              if (!plan || plan.remainingBalance <= 0) continue;
              const alreadyPosted = plan.installmentHistory.some(
                (h) => h.monthKey === run.monthKey && h.source === "PAYROLL"
              );
              if (alreadyPosted) continue;
              const applied = Math.min(plan.remainingBalance, Math.round(remainingToApply * 100) / 100);
              plan.recoveredAmount = Math.round((plan.recoveredAmount + applied) * 100) / 100;
              plan.remainingBalance = Math.max(0, Math.round((plan.totalCharge - plan.creditedAmount - plan.recoveredAmount) * 100) / 100);
              plan.lastDeductedMonth = run.monthKey;
              plan.status = plan.remainingBalance <= 0 ? "SETTLED" : "ACTIVE";
              plan.installmentHistory.push({
                monthKey: run.monthKey,
                scheduledAmount: plan.monthlyAmount,
                deductedAmount: applied,
                balanceAfter: plan.remainingBalance,
                source: "PAYROLL",
                note: `Payroll Run ${run.runCode}`,
                recordedAt: today,
              });
              await plan.save();
              remainingToApply = Math.round((remainingToApply - applied) * 100) / 100;
            }
          }

          // 2. Commit linked Advance deductions idempotently for run.monthKey
          if (line.advanceDeduction > 0 && line.linkedAdvanceIds.length > 0) {
            let remainingToApply = line.advanceDeduction;
            for (const advId of line.linkedAdvanceIds) {
              if (remainingToApply <= 0 || !mongoose.Types.ObjectId.isValid(advId)) continue;
              const adv = await AdminSalaryAdvance.findById(advId);
              if (!adv || adv.remainingBalance <= 0) continue;
              const alreadyPosted = adv.recoveryHistory.some(
                (h) => h.monthKey === run.monthKey && h.source === "PAYROLL"
              );
              if (alreadyPosted) continue;
              const applied = Math.min(adv.remainingBalance, Math.round(remainingToApply * 100) / 100);
              adv.recoveredAmount = Math.round((adv.recoveredAmount + applied) * 100) / 100;
              adv.remainingBalance = Math.max(0, Math.round((adv.amount - adv.recoveredAmount) * 100) / 100);
              adv.status = adv.remainingBalance <= 0 ? "RECOVERED" : "PARTIAL";
              adv.recoveryHistory.push({
                monthKey: run.monthKey,
                deductedAmount: applied,
                balanceAfter: adv.remainingBalance,
                source: "PAYROLL",
                note: `Payroll Run ${run.runCode}`,
                recordedAt: today,
              });
              await adv.save();
              remainingToApply = Math.round((remainingToApply - applied) * 100) / 100;
            }
          }

          // 3. Upsert compatible AdminSalary, AdminStatutory & rich AdminPayslip records
          const salStatus =
            line.payoutStatus === "HOLD" || line.payoutStatus === "CHQ_HOLD"
              ? "On Hold"
              : "Processed";
          const salPayoutStatus =
            line.payoutStatus === "HOLD" || line.payoutStatus === "CHQ_HOLD" || line.payoutStatus === "PAID"
              ? line.payoutStatus
              : "UNPAID";
          const otherEarnings = Math.round((line.bonusInGross + line.arrearAddition) * 100) / 100;
          const otherDeductions =
            Math.round(
              (line.ptDeducted +
                line.gemCharge +
                line.adminCharge +
                line.advanceDeduction +
                line.uniformDeduction +
                line.otherDeduction) *
                100
            ) / 100;

          await Promise.all([
            AdminSalary.findOneAndUpdate(
              { employeeId: line.employeeId, month: run.monthLabel, location: line.siteName },
              {
                $set: {
                  employeeName: line.employeeName,
                  designation: line.designation,
                  department: line.department,
                  location: line.siteName,
                  year: run.monthKey.slice(0, 4),
                  basicSalary: line.presentWages,
                  allowances: line.allowanceAmount,
                  overtime: line.extraDutyAmount,
                  otherEarnings,
                  pfDeduction: line.epfEmployee,
                  esiDeduction: line.esiEmployee,
                  otherDeductions,
                  status: salStatus,
                  payoutStatus: salPayoutStatus,
                  paymentMode: line.paymentMode,
                  holdReason: line.holdReason,
                },
              },
              { upsert: true }
            ),
            AdminStatutory.findOneAndUpdate(
              { employeeId: line.employeeId, month: run.monthLabel },
              {
                $set: {
                  employeeName: line.employeeName,
                  designation: line.designation,
                  location: line.siteName,
                  uanNumber: line.uanNumber,
                  esiNumber: line.esiNumber,
                  basicSalary: line.presentWages,
                  pfStatus: line.epfEmployee > 0 ? "Active" : "Exempt",
                  esiStatus: line.esiEmployee > 0 ? "Active" : "Exempt",
                  pfEmployeeShare: line.epfEmployee,
                  pfEmployerShare: line.epfEmployer,
                  esiEmployeeShare: line.esiEmployee,
                  esiEmployerShare: line.esiEmployer,
                },
              },
              { upsert: true }
            ),
            AdminPayslip.findOneAndUpdate(
              { employeeId: line.employeeId, salaryMonth: run.monthLabel },
              {
                $set: {
                  employeeName: line.employeeName,
                  designation: line.designation,
                  department: line.department,
                  location: line.siteName,
                  monthKey: run.monthKey,
                  basicSalary: line.presentWages,
                  allowances: line.allowanceAmount,
                  overtime: line.extraDutyAmount,
                  otherEarnings,
                  pfDeduction: line.epfEmployee,
                  esiDeduction: line.esiEmployee,
                  otherDeductions,
                  generatedDate: today,
                  status: "Generated",
                  ruleProfileCode: line.ruleProfileCode,
                  ruleProfileName: line.ruleProfileName,
                  wageRate: line.wageRate,
                  presentDays: line.presentDays,
                  extraDays: line.extraDays,
                  otHours: line.otHours,
                  nhDays: line.nhDays,
                  bonusInGross: line.bonusInGross,
                  bonusOutsideGross: line.bonusOutsideGross,
                  canteenAllowance: line.canteenAllowance,
                  ptDeduction: line.ptDeducted,
                  advanceDeduction: line.advanceDeduction,
                  uniformDeduction: line.uniformDeduction,
                  gemCharge: line.gemCharge,
                  adminCharge: line.adminCharge,
                  arrearAddition: line.arrearAddition,
                  deductPtFromEmployee: line.deductPtFromEmployee,
                  ...(line.factoryComponents ? { factoryComponents: line.factoryComponents } : {}),
                  uniformBalanceAfter: line.uniformBalanceAfter,
                  advanceBalanceAfter: line.advanceBalanceAfter,
                  paymentMode: line.paymentMode,
                  voucherNo: line.voucherNo ?? null,
                  payoutStatus: line.payoutStatus,
                  uanNumber: line.uanNumber,
                  esiNumber: line.esiNumber,
                },
                $setOnInsert: {
                  payslipId: `PS-${run.monthKey.replace("-", "")}-${line.employeeId.replace(/[^A-Z0-9]/gi, "")}`,
                  employeeId: line.employeeId,
                  salaryMonth: run.monthLabel,
                },
              },
              { upsert: true }
            ),
          ]);
        }
      } else {
        run.status = nextStatus as typeof run.status;
      }

      await run.save();
      await logAdminActivity(
        "Payroll run status updated",
        `${run.runCode} moved to ${run.status} (${lineItems.length} payslips/records synced).`,
        "Payroll"
      );

      res.json({
        success: true,
        message: `Payroll run ${run.runCode} updated to ${run.status}.`,
        data: serializeDoc(run),
      });
    } catch (err) {
      next(err);
    }
  }
);

payrollRunsAdminRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Payroll run not found" });
      return;
    }
    const existing = await AdminPayrollRun.findById(id);
    if (!existing) {
      res.status(404).json({ success: false, message: "Payroll run not found" });
      return;
    }
    if (existing.status === "LOCKED") {
      res.status(409).json({ success: false, message: "Cannot delete a LOCKED payroll run." });
      return;
    }
    await Promise.all([
      AdminSalaryLineItem.deleteMany({ payrollRunId: existing._id }),
      AdminPayrollRun.findByIdAndDelete(id),
    ]);
    res.json({ success: true, message: "Payroll run deleted", data: serializeDoc(existing) });
  } catch (err) {
    next(err);
  }
});
