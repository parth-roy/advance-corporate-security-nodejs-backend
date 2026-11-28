import { Router, Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import {
  AdminPayslip,
  AdminSalary,
  AdminSalaryLineItem,
  AdminStatutory,
  SALARY_PAYOUT_STATUSES,
  SalaryPayoutStatus,
} from "../../models/admin/AdminFinance.model";
import {
  escapeRegex,
  getParamId,
  logAdminActivity,
  serializeDoc,
  stripMetaFields,
  todayIso,
} from "./helpers";

export const statutoryAdminRouter = Router();
export const salariesAdminRouter = Router();
export const payslipsAdminRouter = Router();

// ─── Compliance Export (EPF ECR #~# & ESIC Challan) ──────────
statutoryAdminRouter.get(
  "/compliance-export",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const monthKey = typeof req.query.monthKey === "string" ? req.query.monthKey.trim() : "";
      const siteName = typeof req.query.siteName === "string" ? req.query.siteName.trim() : "";

      const lineFilter: Record<string, any> = {};
      if (monthKey && /^\d{4}-\d{2}$/.test(monthKey)) lineFilter.monthKey = monthKey;
      if (siteName && siteName !== "All") lineFilter.siteName = new RegExp(`^${escapeRegex(siteName)}$`, "i");

      const lineItems = await AdminSalaryLineItem.find(lineFilter).sort({ siteName: 1, employeeName: 1 }).lean();

      const rows =
        lineItems.length > 0
          ? lineItems.map((l) => {
              const epfEmp = Math.round(l.epfEmployee || 0);
              const epsAmt = Math.round(Math.min(15000, l.epfWage || 0) * 0.0833);
              const epfDiff = Math.max(0, epfEmp - epsAmt);
              const esiEmp = Math.ceil(l.esiEmployee || 0);
              const esiEmpr = Math.ceil(l.esiEmployer || 0);
              return {
                employeeId: l.employeeId,
                employeeName: l.employeeName,
                siteName: l.siteName,
                uanNumber: l.uanNumber || "",
                esiNumber: l.esiNumber || "",
                daysPaid: Math.round((l.presentDays || 0) + (l.extraDays || 0)),
                grossWages: Math.round(l.grossSalary || 0),
                epfWages: Math.round(l.epfWage || 0),
                epsWages: Math.round(Math.min(15000, l.epfWage || 0)),
                edliWages: Math.round(Math.min(15000, l.epfWage || 0)),
                epfEmployeeShare: epfEmp,
                epsEmployerShare: epsAmt,
                epfEpsDiffShare: epfDiff,
                epfEmployerShare: Math.round(l.epfEmployer || 0),
                esiWages: Math.round(l.esiWage || 0),
                esiEmployeeShare: esiEmp,
                esiEmployerShare: esiEmpr,
                ncpDays: Math.max(0, (l.daysInMonth || 30) - Math.round(l.presentDays || 0)),
              };
            })
          : (
              await AdminStatutory.find({
                ...(siteName && siteName !== "All"
                  ? { location: new RegExp(`^${escapeRegex(siteName)}$`, "i") }
                  : {}),
              })
                .limit(500)
                .lean()
            ).map((s) => {
              const epfEmp = Math.round(s.pfEmployeeShare || 0);
              const epsAmt = Math.round(epfEmp * (8.33 / 12));
              return {
                employeeId: s.employeeId,
                employeeName: s.employeeName,
                siteName: s.location,
                uanNumber: s.uanNumber || "",
                esiNumber: s.esiNumber || "",
                daysPaid: 26,
                grossWages: Math.round(s.basicSalary || 0),
                epfWages: Math.round(s.basicSalary || 0),
                epsWages: Math.round(Math.min(15000, s.basicSalary || 0)),
                edliWages: Math.round(Math.min(15000, s.basicSalary || 0)),
                epfEmployeeShare: epfEmp,
                epsEmployerShare: epsAmt,
                epfEpsDiffShare: Math.max(0, epfEmp - epsAmt),
                epfEmployerShare: Math.round(s.pfEmployerShare || 0),
                esiWages: Math.round(s.basicSalary || 0),
                esiEmployeeShare: Math.ceil(s.esiEmployeeShare || 0),
                esiEmployerShare: Math.ceil(s.esiEmployerShare || 0),
                ncpDays: 0,
              };
            });

      const ecrLines = rows
        .filter((r) => r.epfEmployeeShare > 0 || r.uanNumber)
        .map((r) =>
          [
            r.uanNumber || "UNREGISTERED",
            r.employeeName,
            r.grossWages,
            r.epfWages,
            r.epsWages,
            r.edliWages,
            r.epfEmployeeShare,
            r.epsEmployerShare,
            r.epfEpsDiffShare,
            r.ncpDays,
            0,
          ].join("#~#")
        );

      const esicRows = rows.filter((r) => r.esiEmployeeShare > 0 || r.esiNumber);

      res.json({
        success: true,
        data: {
          monthKey: monthKey || "ALL",
          siteName: siteName || "All",
          source: lineItems.length > 0 ? "SALARY_LINE_ITEMS" : "STATUTORY_FALLBACK",
          totals: {
            epfMembers: ecrLines.length,
            epfEmployeeTotal: rows.reduce((s, r) => s + r.epfEmployeeShare, 0),
            epfEmployerTotal: rows.reduce((s, r) => s + r.epfEmployerShare, 0),
            esicMembers: esicRows.length,
            esiEmployeeTotal: esicRows.reduce((s, r) => s + r.esiEmployeeShare, 0),
            esiEmployerTotal: esicRows.reduce((s, r) => s + r.esiEmployerShare, 0),
          },
          ecrText: ecrLines.join("\n"),
          rows,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── ESI & PF Statutory (/api/admin/statutory) ────────────────
statutoryAdminRouter.get("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { month, pfStatus, esiStatus, search } = req.query;
    const filter: Record<string, any> = {};

    if (typeof month === "string" && month !== "All") filter.month = month;
    if (typeof pfStatus === "string" && pfStatus !== "All") filter.pfStatus = pfStatus;
    if (typeof esiStatus === "string" && esiStatus !== "All") filter.esiStatus = esiStatus;
    if (typeof search === "string" && search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), "i");
      filter.$or = [
        { employeeId: regex },
        { employeeName: regex },
        { uanNumber: regex },
        { esiNumber: regex },
        { location: regex },
      ];
    }

    const records = await AdminStatutory.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    res.json({ success: true, count: records.length, data: records.map(serializeDoc) });
  } catch (err) {
    next(err);
  }
});

statutoryAdminRouter.get("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Statutory record not found" });
      return;
    }
    const record = await AdminStatutory.findById(id).lean();
    if (!record) {
      res.status(404).json({ success: false, message: "Statutory record not found" });
      return;
    }
    res.json({ success: true, data: serializeDoc(record) });
  } catch (err) {
    next(err);
  }
});

statutoryAdminRouter.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = stripMetaFields(req.body);
    const { employeeId, employeeName, designation, location, month, basicSalary } = body;
    if (!employeeId || !employeeName || !designation || !location || !month || basicSalary === undefined) {
      res.status(400).json({
        success: false,
        message: "Required fields: employeeId, employeeName, designation, location, month, basicSalary",
      });
      return;
    }
    const created = await AdminStatutory.create(body);
    res.status(201).json({ success: true, data: serializeDoc(created) });
  } catch (err) {
    next(err);
  }
});

statutoryAdminRouter.patch("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Statutory record not found" });
      return;
    }
    const updated = await AdminStatutory.findByIdAndUpdate(
      id,
      { $set: stripMetaFields(req.body) },
      { new: true, runValidators: true }
    );
    if (!updated) {
      res.status(404).json({ success: false, message: "Statutory record not found" });
      return;
    }
    res.json({ success: true, data: serializeDoc(updated) });
  } catch (err) {
    next(err);
  }
});

statutoryAdminRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Statutory record not found" });
      return;
    }
    const deleted = await AdminStatutory.findByIdAndDelete(id);
    if (!deleted) {
      res.status(404).json({ success: false, message: "Statutory record not found" });
      return;
    }
    res.json({ success: true, message: "Statutory record deleted", data: serializeDoc(deleted) });
  } catch (err) {
    next(err);
  }
});

// ─── Salary Generation (/api/admin/salaries) ──────────────────
salariesAdminRouter.get("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { month, status, category, search } = req.query;
    const filter: Record<string, any> = {};

    if (typeof month === "string" && month !== "All") filter.month = month;
    if (typeof status === "string" && status !== "All") filter.status = status;
    if (typeof category === "string" && category !== "All") filter.category = category;
    if (typeof search === "string" && search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), "i");
      filter.$or = [
        { employeeId: regex },
        { employeeName: regex },
        { designation: regex },
        { department: regex },
        { location: regex },
      ];
    }

    const records = await AdminSalary.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    res.json({ success: true, count: records.length, data: records.map(serializeDoc) });
  } catch (err) {
    next(err);
  }
});

salariesAdminRouter.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { employeeId, employeeName, designation, department, location, month, year, basicSalary } = req.body;
    if (!employeeId || !employeeName || !designation || !department || !location || !month || !year || basicSalary === undefined) {
      res.status(400).json({
        success: false,
        message: "Required fields: employeeId, employeeName, designation, department, location, month, year, basicSalary",
      });
      return;
    }
    const created = await AdminSalary.create(req.body);
    res.status(201).json({ success: true, data: serializeDoc(created) });
  } catch (err) {
    next(err);
  }
});

salariesAdminRouter.patch("/process-all", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { month = "All" } = req.body as { month?: string };
    const filter: Record<string, any> = { status: "Pending" };
    if (month && month !== "All") filter.month = month;

    const pendingSalaries = await AdminSalary.find(filter);
    if (pendingSalaries.length === 0) {
      res.json({ success: true, message: "No pending salaries to process", data: { processedCount: 0 } });
      return;
    }

    const today = todayIso();
    await AdminSalary.updateMany(filter, { $set: { status: "Processed" } });

    for (const sal of pendingSalaries) {
      await AdminPayslip.findOneAndUpdate(
        { employeeId: sal.employeeId, salaryMonth: sal.month },
        {
          $set: {
            employeeName: sal.employeeName,
            designation: sal.designation,
            department: sal.department,
            location: sal.location,
            basicSalary: sal.basicSalary,
            allowances: sal.allowances,
            overtime: sal.overtime,
            otherEarnings: sal.otherEarnings,
            pfDeduction: sal.pfDeduction,
            esiDeduction: sal.esiDeduction,
            otherDeductions: sal.otherDeductions,
            generatedDate: today,
            status: "Generated",
          },
          $setOnInsert: {
            payslipId: `PS-${sal.year}-${sal.employeeId.replace("ACS-", "")}`,
            employeeId: sal.employeeId,
            salaryMonth: sal.month,
          },
        },
        { upsert: true }
      );
    }

    await logAdminActivity(
      "Batch salary generated",
      `Processed ${pendingSalaries.length} pending payroll records.`,
      "Payroll"
    );

    res.json({
      success: true,
      message: `Processed ${pendingSalaries.length} pending salaries`,
      data: { processedCount: pendingSalaries.length },
    });
  } catch (err) {
    next(err);
  }
});

salariesAdminRouter.patch("/:id/process", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Salary record not found" });
      return;
    }
    const salary = await AdminSalary.findById(id);
    if (!salary) {
      res.status(404).json({ success: false, message: "Salary record not found" });
      return;
    }

    salary.status = "Processed";
    await salary.save();

    const today = todayIso();
    const payslip = await AdminPayslip.findOneAndUpdate(
      { employeeId: salary.employeeId, salaryMonth: salary.month },
      {
        $set: {
          employeeName: salary.employeeName,
          designation: salary.designation,
          department: salary.department,
          location: salary.location,
          basicSalary: salary.basicSalary,
          allowances: salary.allowances,
          overtime: salary.overtime,
          otherEarnings: salary.otherEarnings,
          pfDeduction: salary.pfDeduction,
          esiDeduction: salary.esiDeduction,
          otherDeductions: salary.otherDeductions,
          generatedDate: today,
          status: "Generated",
        },
        $setOnInsert: {
          payslipId: `PS-${salary.year}-${salary.employeeId.replace("ACS-", "")}`,
          employeeId: salary.employeeId,
          salaryMonth: salary.month,
        },
      },
      { upsert: true, new: true }
    );

    await logAdminActivity(
      "Salary processed",
      `Processed ${salary.month} salary for ${salary.employeeName}.`,
      "Payroll"
    );

    res.json({
      success: true,
      message: "Salary processed and payslip generated",
      data: { salary: serializeDoc(salary), payslip: serializeDoc(payslip) },
    });
  } catch (err) {
    next(err);
  }
});

salariesAdminRouter.patch("/:id/hold-status", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const rawStatus = String(req.body?.payoutStatus || "").trim().toUpperCase();
    if (!(SALARY_PAYOUT_STATUSES as readonly string[]).includes(rawStatus)) {
      res.status(400).json({
        success: false,
        message: `payoutStatus must be one of: ${SALARY_PAYOUT_STATUSES.join(", ")}`,
      });
      return;
    }

    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Salary record not found" });
      return;
    }
    const salary = await AdminSalary.findById(id);
    if (!salary) {
      res.status(404).json({ success: false, message: "Salary record not found" });
      return;
    }

    salary.payoutStatus = rawStatus as SalaryPayoutStatus;
    if (req.body?.holdReason !== undefined) {
      salary.holdReason = String(req.body.holdReason || "").trim();
    }
    if (rawStatus === "HOLD" || rawStatus === "CHQ_HOLD") {
      salary.status = "On Hold";
    } else if (rawStatus === "PAID") {
      salary.status = "Processed";
    } else if (salary.status === "On Hold") {
      salary.status = "Pending";
    }

    await salary.save();
    await logAdminActivity(
      "Salary payout status updated",
      `${salary.employeeName} (${salary.month}) set to ${rawStatus}.`,
      "Payroll"
    );

    res.json({
      success: true,
      message: "Salary payout status updated",
      data: serializeDoc(salary),
    });
  } catch (err) {
    next(err);
  }
});

salariesAdminRouter.patch("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Salary record not found" });
      return;
    }
    const updated = await AdminSalary.findByIdAndUpdate(
      id,
      { $set: stripMetaFields(req.body) },
      { new: true, runValidators: true }
    );
    if (!updated) {
      res.status(404).json({ success: false, message: "Salary record not found" });
      return;
    }

    await logAdminActivity(
      "Salary components edited",
      `Updated salary structure for ${updated.employeeName}.`,
      "Payroll"
    );

    res.json({ success: true, data: serializeDoc(updated) });
  } catch (err) {
    next(err);
  }
});

salariesAdminRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Salary record not found" });
      return;
    }
    const deleted = await AdminSalary.findByIdAndDelete(id);
    if (!deleted) {
      res.status(404).json({ success: false, message: "Salary record not found" });
      return;
    }
    res.json({ success: true, message: "Salary record deleted", data: serializeDoc(deleted) });
  } catch (err) {
    next(err);
  }
});

// ─── Payslips (/api/admin/payslips) ───────────────────────────
payslipsAdminRouter.get("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { salaryMonth, status, search } = req.query;
    const filter: Record<string, any> = {};

    if (typeof salaryMonth === "string" && salaryMonth !== "All") filter.salaryMonth = salaryMonth;
    if (typeof status === "string" && status !== "All") filter.status = status;
    if (typeof search === "string" && search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), "i");
      filter.$or = [
        { payslipId: regex },
        { employeeId: regex },
        { employeeName: regex },
        { department: regex },
        { location: regex },
      ];
    }

    const slips = await AdminPayslip.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    res.json({ success: true, count: slips.length, data: slips.map(serializeDoc) });
  } catch (err) {
    next(err);
  }
});

payslipsAdminRouter.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const created = await AdminPayslip.create(req.body);
    res.status(201).json({ success: true, data: serializeDoc(created) });
  } catch (err) {
    next(err);
  }
});

payslipsAdminRouter.patch("/:id/regenerate", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Payslip not found" });
      return;
    }
    const slip = await AdminPayslip.findByIdAndUpdate(
      id,
      { $set: { status: "Generated", generatedDate: todayIso() } },
      { new: true }
    );
    if (!slip) {
      res.status(404).json({ success: false, message: "Payslip not found" });
      return;
    }

    await logAdminActivity(
      "Payslip regenerated",
      `Regenerated ${slip.payslipId} for ${slip.employeeName}.`,
      "Payslips"
    );

    res.json({
      success: true,
      message: "Payslip regenerated",
      data: serializeDoc(slip),
    });
  } catch (err) {
    next(err);
  }
});

payslipsAdminRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Payslip not found" });
      return;
    }
    const deleted = await AdminPayslip.findByIdAndDelete(id);
    if (!deleted) {
      res.status(404).json({ success: false, message: "Payslip not found" });
      return;
    }
    res.json({ success: true, message: "Payslip deleted", data: serializeDoc(deleted) });
  } catch (err) {
    next(err);
  }
});
