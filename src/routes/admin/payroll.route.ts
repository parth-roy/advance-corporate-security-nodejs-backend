import { Router, Request, Response, NextFunction } from "express";
import { AdminPayslip, AdminSalary, AdminStatutory } from "../../models/admin/AdminFinance.model";
import { escapeRegex, getParamId, logAdminActivity, serializeDoc, todayIso } from "./helpers";

export const statutoryAdminRouter = Router();
export const salariesAdminRouter = Router();
export const payslipsAdminRouter = Router();

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
    const record = await AdminStatutory.findById(getParamId(req)).lean();
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
    const { employeeId, employeeName, designation, location, month, basicSalary } = req.body;
    if (!employeeId || !employeeName || !designation || !location || !month || basicSalary === undefined) {
      res.status(400).json({
        success: false,
        message: "Required fields: employeeId, employeeName, designation, location, month, basicSalary",
      });
      return;
    }
    const created = await AdminStatutory.create(req.body);
    res.status(201).json({ success: true, data: serializeDoc(created) });
  } catch (err) {
    next(err);
  }
});

statutoryAdminRouter.patch("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const updated = await AdminStatutory.findByIdAndUpdate(
      getParamId(req),
      { $set: req.body },
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
    const deleted = await AdminStatutory.findByIdAndDelete(getParamId(req));
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
    const salary = await AdminSalary.findById(getParamId(req));
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

salariesAdminRouter.patch("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const updated = await AdminSalary.findByIdAndUpdate(
      getParamId(req),
      { $set: req.body },
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
    const deleted = await AdminSalary.findByIdAndDelete(getParamId(req));
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
    const slip = await AdminPayslip.findByIdAndUpdate(
      getParamId(req),
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
    const deleted = await AdminPayslip.findByIdAndDelete(getParamId(req));
    if (!deleted) {
      res.status(404).json({ success: false, message: "Payslip not found" });
      return;
    }
    res.json({ success: true, message: "Payslip deleted", data: serializeDoc(deleted) });
  } catch (err) {
    next(err);
  }
});
