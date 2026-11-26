import { Router, Request, Response, NextFunction } from "express";
import {
  AdminAttendance,
  AdminCandidate,
  AdminUniformIssue,
  AdminUniformItem,
  AdminUniformStockLog,
} from "../../models/admin/AdminOperations.model";
import {
  AdminActivity,
  AdminInvoice,
  AdminPayslip,
  AdminSalary,
  AdminSettings,
  AdminStatutory,
} from "../../models/admin/AdminFinance.model";
import { logAdminActivity, serializeDoc, todayIso } from "./helpers";

export const systemAdminRouter = Router();

// ─── GET /api/admin/health ────────────────────────────────────
systemAdminRouter.get("/health", async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [candidates, uniforms, attendance, statutory, salaries, payslips, invoices] =
      await Promise.all([
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
// Returns full admin tables snapshot + KPI summary
systemAdminRouter.get("/overview", async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const [
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
    ] = await Promise.all([
      AdminCandidate.find().sort({ createdAt: -1 }).limit(200).lean(),
      AdminUniformItem.find().sort({ createdAt: -1 }).limit(200).lean(),
      AdminUniformIssue.find().sort({ createdAt: -1 }).limit(200).lean(),
      AdminUniformStockLog.find().sort({ createdAt: -1 }).limit(100).lean(),
      AdminAttendance.find().sort({ date: -1, createdAt: -1 }).limit(500).lean(),
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
    ]);

    res.json({
      success: true,
      data: {
        candidates: candidates.map(serializeDoc),
        uniforms: uniforms.map(serializeDoc),
        uniformIssues: uniformIssues.map(serializeDoc),
        stockLogs: stockLogs.map(serializeDoc),
        attendance: attendance.map(serializeDoc),
        statutory: statutory.map(serializeDoc),
        salaries: salaries.map(serializeDoc),
        payslips: payslips.map(serializeDoc),
        invoices: invoices.map(serializeDoc),
        activities: activities.map(serializeDoc),
        settings: settingsDoc ? serializeDoc(settingsDoc) : null,
      },
    });
  } catch (err) {
    next(err);
  }
});

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

      const [attendanceDoc, salaryDoc] = await Promise.all([
        AdminAttendance.create({
          employeeId: employeeId.trim(),
          employeeName: name.trim(),
          designation: designation.trim(),
          location: location.trim(),
          date: todayIso(),
          checkIn: "08:00",
          checkOut: "16:00",
          workingHours: "8h 00m",
          status: "Present",
        }),
        AdminSalary.create({
          employeeId: employeeId.trim(),
          employeeName: name.trim(),
          designation: designation.trim(),
          department: "Field Operations",
          category: "Security Personnel",
          location: location.trim(),
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
        `${name.trim()} (${employeeId.trim()}) assigned to ${location.trim()}.`,
        "Operations"
      );

      res.status(201).json({
        success: true,
        message: "Employee added to attendance and payroll.",
        data: {
          attendance: serializeDoc(attendanceDoc),
          salary: serializeDoc(salaryDoc),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);
