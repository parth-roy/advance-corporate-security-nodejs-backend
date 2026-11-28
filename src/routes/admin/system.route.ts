import { Router, Request, Response, NextFunction } from "express";
import { AdminEmployee, AdminSite } from "../../models/admin/AdminCore.model";
import {
  AdminAttendance,
  AdminCandidate,
  AdminUniformIssue,
  AdminUniformItem,
  AdminUniformRecoveryPlan,
  AdminUniformStockLog,
} from "../../models/admin/AdminOperations.model";
import {
  AdminActivity,
  AdminBillingRuleProfile,
  AdminInvoice,
  AdminPayrollRun,
  AdminPayslip,
  AdminSalary,
  AdminSalaryAdvance,
  AdminSalaryRuleProfile,
  AdminSettings,
  AdminStatutory,
  AdminVoucher,
} from "../../models/admin/AdminFinance.model";
import { ensureUniformCatalogSeeded } from "../../data/uniformCatalogSeed";
import { ensureSalaryRuleTemplatesSeeded } from "../../data/salaryRuleTemplates";
import { ensureBillingRuleTemplatesSeeded } from "../../data/billingRuleTemplates";
import { migrateCoreSitesAndEmployees } from "../../services/adminCoreMigration.service";
import { importOnboardingWorkbookData } from "../../services/onboardingImport.service";
import { resolveOrCreateSite } from "../../services/employeeCode.service";
import { logAdminActivity, serializeDoc, todayIso } from "./helpers";

export const systemAdminRouter = Router();

// ─── GET /api/admin/health ────────────────────────────────────
systemAdminRouter.get("/health", async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [sites, employees, candidates, uniforms, attendance, statutory, salaries, payslips, invoices] =
      await Promise.all([
        AdminSite.countDocuments(),
        AdminEmployee.countDocuments(),
        AdminCandidate.countDocuments(),
        AdminUniformItem.countDocuments(),
        AdminAttendance.countDocuments(),
        AdminStatutory.countDocuments(),
        AdminSalary.countDocuments(),
        AdminPayslip.countDocuments(),
        AdminInvoice.countDocuments(),
      ]);

    res.json({
      success: true,
      service: "ACS Admin API",
      timestamp: new Date().toISOString(),
      tables: {
        sites,
        employees,
        candidates,
        uniforms,
        attendance,
        statutory,
        salaries,
        payslips,
        invoices,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/overview ──────────────────────────────────
// Returns workspace overview slice + collection totals (use paginated endpoints for full lists)
systemAdminRouter.get("/overview", async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await Promise.all([
      ensureUniformCatalogSeeded(),
      ensureSalaryRuleTemplatesSeeded(),
      ensureBillingRuleTemplatesSeeded(),
    ]);

    const [
      sites,
      employees,
      candidates,
      uniforms,
      uniformIssues,
      stockLogs,
      attendance,
      statutory,
      salaries,
      payslips,
      invoices,
      activities,
      settingsDoc,
      sitesTotal,
      employeesTotal,
      candidatesTotal,
      uniformRecoveryPlans,
      salaryAdvances,
      vouchers,
      salaryRuleProfiles,
      payrollRuns,
      billingRuleProfiles,
    ] = await Promise.all([
      AdminSite.find().sort({ isActive: -1, siteName: 1 }).limit(500).lean(),
      AdminEmployee.find().sort({ createdAt: -1 }).limit(200).lean(),
      AdminCandidate.find().sort({ createdAt: -1 }).limit(200).lean(),
      AdminUniformItem.find().sort({ createdAt: -1 }).limit(200).lean(),
      AdminUniformIssue.find().sort({ createdAt: -1 }).limit(200).lean(),
      AdminUniformStockLog.find().sort({ createdAt: -1 }).limit(250).lean(),
      AdminAttendance.find().sort({ date: -1, createdAt: -1 }).limit(2500).lean(),
      AdminStatutory.find().sort({ createdAt: -1 }).limit(200).lean(),
      AdminSalary.find().sort({ createdAt: -1 }).limit(200).lean(),
      AdminPayslip.find().sort({ createdAt: -1 }).limit(200).lean(),
      AdminInvoice.find().sort({ createdAt: -1 }).limit(200).lean(),
      AdminActivity.find().sort({ createdAt: -1 }).limit(20).lean(),
      AdminSettings.findOneAndUpdate(
        { key: "default" },
        { $setOnInsert: { key: "default" } },
        { upsert: true, new: true }
      ).lean(),
      AdminSite.countDocuments(),
      AdminEmployee.countDocuments(),
      AdminCandidate.countDocuments(),
      AdminUniformRecoveryPlan.find().sort({ createdAt: -1 }).limit(200).lean(),
      AdminSalaryAdvance.find().sort({ date: -1, staffNo: -1 }).limit(200).lean(),
      AdminVoucher.find().sort({ voucherNo: -1 }).limit(200).lean(),
      AdminSalaryRuleProfile.find({ isActive: true }).sort({ isTemplate: 1, siteName: 1 }).limit(200).lean(),
      AdminPayrollRun.find().sort({ monthKey: -1, createdAt: -1 }).limit(100).lean(),
      AdminBillingRuleProfile.find({ isActive: true }).sort({ isTemplate: 1, siteName: 1 }).limit(200).lean(),
    ]);

    res.json({
      success: true,
      data: {
        sites: sites.map(serializeDoc),
        employees: employees.map(serializeDoc),
        candidates: candidates.map(serializeDoc),
        uniforms: uniforms.map(serializeDoc),
        uniformIssues: uniformIssues.map(serializeDoc),
        uniformRecoveryPlans: uniformRecoveryPlans.map(serializeDoc),
        stockLogs: stockLogs.map(serializeDoc),
        attendance: attendance.map(serializeDoc),
        statutory: statutory.map(serializeDoc),
        salaries: salaries.map(serializeDoc),
        salaryAdvances: salaryAdvances.map(serializeDoc),
        vouchers: vouchers.map(serializeDoc),
        salaryRuleProfiles: salaryRuleProfiles.map(serializeDoc),
        payrollRuns: payrollRuns.map(serializeDoc),
        billingRuleProfiles: billingRuleProfiles.map(serializeDoc),
        payslips: payslips.map(serializeDoc),
        invoices: invoices.map(serializeDoc),
        activities: activities.map(serializeDoc),
        settings: settingsDoc ? serializeDoc(settingsDoc) : null,
      },
      meta: {
        counts: {
          sites: sitesTotal,
          employees: employeesTotal,
          candidates: candidatesTotal,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/migrate-core ─────────────────────────────
systemAdminRouter.post(
  "/migrate-core",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const summary = await migrateCoreSitesAndEmployees();
      await logAdminActivity(
        "Core sites & employees synced",
        `Created ${summary.sitesCreated} site(s) and ${summary.employeesCreated} employee record(s).`,
        "Settings"
      );
      res.json({
        success: true,
        message: "Legacy sites and deployed employees migrated safely.",
        data: summary,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/admin/onboarding-import ────────────────────────
systemAdminRouter.post(
  "/onboarding-import",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const payload = (req.body || {}) as Record<string, any>;
      const hasAnySection =
        (Array.isArray(payload.sites) && payload.sites.length > 0) ||
        (Array.isArray(payload.employees) && payload.employees.length > 0) ||
        (Array.isArray(payload.openingAdvances) && payload.openingAdvances.length > 0) ||
        (Array.isArray(payload.openingUniformPlans) && payload.openingUniformPlans.length > 0);

      if (!hasAnySection) {
        res.status(400).json({
          success: false,
          message:
            "Provide at least one non-empty section: sites, employees, openingAdvances, or openingUniformPlans",
        });
        return;
      }

      const summary = await importOnboardingWorkbookData(payload);
      res.json({
        success: true,
        message: summary.dryRun
          ? "Dry-run validation completed."
          : "Legacy onboarding batch imported successfully.",
        data: summary,
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/admin/activities ────────────────────────────────
systemAdminRouter.get("/activities", async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const items = await AdminActivity.find().sort({ createdAt: -1 }).limit(50).lean();
    res.json({ success: true, count: items.length, data: items.map(serializeDoc) });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/settings ──────────────────────────────────
systemAdminRouter.get("/settings", async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const settings = await AdminSettings.findOneAndUpdate(
      { key: "default" },
      { $setOnInsert: { key: "default" } },
      { upsert: true, new: true }
    ).lean();

    res.json({ success: true, data: settings ? serializeDoc(settings) : null });
  } catch (err) {
    next(err);
  }
});

// ─── PUT / PATCH /api/admin/settings ──────────────────────────
const updateSettingsHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { key: _ignoredKey, _id: _ignoredId, id: _ignoredStrId, ...updates } = req.body;
    if (updates.uniformRegistrationCharge !== undefined) {
      const fee = Number(updates.uniformRegistrationCharge);
      if (
        updates.uniformRegistrationCharge === null ||
        updates.uniformRegistrationCharge === "" ||
        !Number.isFinite(fee) ||
        fee < 0
      ) {
        res.status(400).json({
          success: false,
          message: "uniformRegistrationCharge must be a non-negative number",
        });
        return;
      }
      updates.uniformRegistrationCharge = fee;
    }

    const settings = await AdminSettings.findOneAndUpdate(
      { key: "default" },
      { $set: updates, $setOnInsert: { key: "default" } },
      { upsert: true, new: true, runValidators: true }
    );

    await logAdminActivity(
      "Settings saved",
      "Updated company and administrator preferences.",
      "Settings"
    );

    res.json({
      success: true,
      message: "Settings updated successfully",
      data: serializeDoc(settings),
    });
  } catch (err) {
    next(err);
  }
};

systemAdminRouter.put("/settings", updateSettingsHandler);
systemAdminRouter.patch("/settings", updateSettingsHandler);

// ─── POST /api/admin/employees/quick ──────────────────────────
systemAdminRouter.post(
  "/employees/quick",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { employeeId, name, designation, location, basicSalary } = req.body as {
        employeeId?: string;
        name?: string;
        designation?: string;
        location?: string;
        basicSalary?: number;
      };

      const salaryNum = Number(basicSalary);
      if (!employeeId || !name || !designation || !location || !Number.isFinite(salaryNum) || salaryNum <= 0) {
        res.status(400).json({
          success: false,
          message: "Required fields: employeeId, name, designation, location, positive basicSalary",
        });
        return;
      }

      const settings = await AdminSettings.findOne({ key: "default" }).lean();
      const month = settings?.defaultMonth || "November 2026";
      const year = String(new Date().getFullYear());
      const cleanEmpCode = employeeId.trim().toUpperCase();
      const siteDoc = await resolveOrCreateSite({ siteName: location.trim() });

      const existingEmployee = await AdminEmployee.findOne({ empCode: cleanEmpCode });
      const employeeDoc =
        existingEmployee ||
        (await AdminEmployee.create({
          empCode: cleanEmpCode,
          primarySiteId: siteDoc?._id ?? null,
          siteName: siteDoc?.siteName || location.trim(),
          fullName: name.trim(),
          designation: designation.trim(),
          dateOfJoining: todayIso(),
          rateType: "MONTHLY",
          baseRate: salaryNum,
          status: "ACTIVE",
        }));

      const [attendanceDoc, salaryDoc] = await Promise.all([
        AdminAttendance.create({
          employeeId: cleanEmpCode,
          employeeName: name.trim(),
          designation: designation.trim(),
          location: siteDoc?.siteName || location.trim(),
          date: todayIso(),
          checkIn: "08:00",
          checkOut: "16:00",
          workingHours: "8h 00m",
          status: "Present",
          normalDuty: 1,
          extraDuty: 0,
        }),
        AdminSalary.create({
          employeeId: cleanEmpCode,
          employeeName: name.trim(),
          designation: designation.trim(),
          department: "Field Operations",
          category: "Security Personnel",
          location: siteDoc?.siteName || location.trim(),
          month,
          year,
          basicSalary: salaryNum,
          allowances: Math.round(salaryNum * 0.2),
          overtime: 0,
          otherEarnings: 0,
          pfDeduction: 1800,
          esiDeduction: 140,
          otherDeductions: 0,
          status: "Pending",
        }),
      ]);

      await logAdminActivity(
        "Employee added",
        `${name.trim()} (${cleanEmpCode}) assigned to ${siteDoc?.siteName || location.trim()}.`,
        "Operations"
      );

      res.status(201).json({
        success: true,
        message: "Employee added to directory, attendance, and payroll.",
        data: {
          employee: serializeDoc(employeeDoc),
          site: siteDoc ? serializeDoc(siteDoc) : null,
          attendance: serializeDoc(attendanceDoc),
          salary: serializeDoc(salaryDoc),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);
