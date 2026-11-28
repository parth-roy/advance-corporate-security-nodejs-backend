import { Router, Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { AdminEmployee, AdminSite, PAYMENT_MODES, PaymentMode } from "../../models/admin/AdminCore.model";
import { AdminAttendance, AdminSiteMusterApproval } from "../../models/admin/AdminOperations.model";
import {
  AdminBillingRuleProfile,
  AdminCounter,
  AdminInvoice,
  getNextSequenceValue,
  INVOICE_DEDUCTION_CATEGORIES,
  INVOICE_PAYMENT_STAGES,
  InvoiceDeductionCategory,
  InvoicePaymentStage,
} from "../../models/admin/AdminFinance.model";
import {
  ensureBillingRuleTemplatesSeeded,
  resolveBillingRuleForSite,
} from "../../data/billingRuleTemplates";
import {
  calculateSiteBill,
  IBillingLineInput,
  IBillingRuleConfig,
} from "../../services/billingCalculation.service";
import { numberToIndianCurrencyWords } from "../../utils/indianCurrencyWords";
import {
  escapeRegex,
  getParamId,
  logAdminActivity,
  serializeDoc,
  stripMetaFields,
  todayIso,
} from "./helpers";

export const billingRulesAdminRouter = Router();
export const billingAdminRouter = Router();

const SHORT_MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;
const FULL_MONTHS = [
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

function deriveIssueMonthTag(invoiceDate: string): string {
  const [yStr, mStr] = invoiceDate.split("-");
  const y = Number(yStr) || new Date().getFullYear();
  const m = Number(mStr) || new Date().getMonth() + 1;
  const mon = SHORT_MONTHS[Math.max(0, Math.min(11, m - 1))] ?? "NOV";
  return `${mon}${String(y).slice(-2)}`;
}

async function allocateNextAcsInvoiceNumber(invoiceDate: string): Promise<string> {
  const tag = deriveIssueMonthTag(invoiceDate);
  const prefix = `ADV/${tag}/`;
  const existing = await AdminInvoice.find({ invoiceNumber: new RegExp(`^${escapeRegex(prefix)}`, "i") })
    .select("invoiceNumber")
    .lean();
  let maxSeq = 0;
  for (const row of existing) {
    const tail = String(row.invoiceNumber || "").slice(prefix.length);
    const num = parseInt(tail.split("/")[0] || "0", 10);
    if (Number.isInteger(num) && num > maxSeq) maxSeq = num;
  }
  const seq = await getNextSequenceValue(`inv_${tag}`, maxSeq);
  return `${prefix}${String(seq).padStart(2, "0")}`;
}

function addDaysIso(isoDate: string, days: number): string {
  const dt = new Date(`${isoDate}T00:00:00Z`);
  if (Number.isNaN(dt.getTime())) return todayIso();
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function formatMonthRangeLabel(monthKeys: string[]): { billingMonth: string; periodLabel: string } {
  const clean = Array.from(new Set(monthKeys.filter((m) => /^\d{4}-\d{2}$/.test(m)))).sort();
  if (clean.length === 0) {
    const fallback = todayIso().slice(0, 7);
    clean.push(fallback);
  }
  const toLabel = (ym: string) => {
    const [y, m] = ym.split("-");
    return `${FULL_MONTHS[Math.max(0, Math.min(11, (Number(m) || 1) - 1))]} ${y}`;
  };
  const first = clean[0]!;
  const last = clean[clean.length - 1]!;
  const [fy, fm] = first.split("-");
  const [ly, lm] = last.split("-");
  const endDay = new Date(Number(ly), Number(lm), 0).getDate();
  const billingMonth = clean.length === 1 ? toLabel(first) : `${toLabel(first)} – ${toLabel(last)}`;
  const periodLabel = `01-${fm}-${fy} to ${String(endDay).padStart(2, "0")}-${lm}-${ly}`;
  return { billingMonth, periodLabel };
}

function computeInvoiceNetTotal(inv: any): number {
  if (typeof inv.totalInvoiceAmount === "number" && inv.totalInvoiceAmount > 0) {
    return inv.totalInvoiceAmount;
  }
  const sub = (Number(inv.quantity) || 0) * (Number(inv.rate) || 0);
  const tax = Math.round((sub * (Number(inv.taxRate) || 0)) / 100);
  return sub + tax;
}

// ─── Site Billing Rules (/api/admin/billing-rules) ─────────────
billingRulesAdminRouter.get("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await ensureBillingRuleTemplatesSeeded();
    const { search, siteId } = req.query;
    const filter: Record<string, any> = {};
    if (typeof siteId === "string" && mongoose.Types.ObjectId.isValid(siteId)) {
      filter.siteId = siteId;
    }
    if (typeof search === "string" && search.trim()) {
      const rx = new RegExp(escapeRegex(search.trim()), "i");
      filter.$or = [{ profileCode: rx }, { profileName: rx }, { siteName: rx }, { subUnit: rx }];
    }
    const rules = await AdminBillingRuleProfile.find(filter)
      .sort({ isTemplate: 1, siteName: 1, profileName: 1 })
      .limit(200)
      .lean();
    res.json({ success: true, count: rules.length, data: rules.map(serializeDoc) });
  } catch (err) {
    next(err);
  }
});

billingRulesAdminRouter.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await ensureBillingRuleTemplatesSeeded();
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
    if (await AdminBillingRuleProfile.exists({ profileCode })) {
      profileCode = `${profileCode}_${Date.now().toString(36).slice(-4).toUpperCase()}`;
    }

    const siteDoc =
      typeof body.siteId === "string" && mongoose.Types.ObjectId.isValid(body.siteId)
        ? await AdminSite.findById(body.siteId).lean()
        : siteName
          ? await AdminSite.findOne({ siteName: new RegExp(`^${escapeRegex(siteName)}$`, "i") }).lean()
          : null;

    const created = await AdminBillingRuleProfile.create({
      ...body,
      profileCode,
      profileName,
      siteId: siteDoc?._id ?? null,
      siteName: siteDoc?.siteName || siteName,
      isTemplate: body.isTemplate === true,
      isActive: body.isActive !== false,
    });

    await logAdminActivity("Billing rule created", `Saved ${created.profileName} (${created.profileCode}).`, "Billing");
    res.status(201).json({ success: true, data: serializeDoc(created) });
  } catch (err) {
    next(err);
  }
});

billingRulesAdminRouter.patch("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Billing rule not found" });
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
    const updated = await AdminBillingRuleProfile.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!updated) {
      res.status(404).json({ success: false, message: "Billing rule not found" });
      return;
    }
    res.json({ success: true, data: serializeDoc(updated) });
  } catch (err) {
    next(err);
  }
});

billingRulesAdminRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Billing rule not found" });
      return;
    }
    const existing = await AdminBillingRuleProfile.findById(id);
    if (!existing) {
      res.status(404).json({ success: false, message: "Billing rule not found" });
      return;
    }
    if (existing.profileCode === "STANDARD_INTRA") {
      res.status(400).json({ success: false, message: "Cannot delete STANDARD_INTRA default template." });
      return;
    }
    await AdminBillingRuleProfile.findByIdAndDelete(id);
    res.json({ success: true, message: "Billing rule deleted", data: serializeDoc(existing) });
  } catch (err) {
    next(err);
  }
});

// ─── Next Sequential ADV/<MMMYY>/<SEQ> Invoice Preview ────────
billingAdminRouter.get(
  "/next-number",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const invoiceDate =
        typeof req.query.invoiceDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.invoiceDate.trim())
          ? req.query.invoiceDate.trim()
          : todayIso();
      const tag = deriveIssueMonthTag(invoiceDate);
      const prefix = `ADV/${tag}/`;
      const [counter, existing] = await Promise.all([
        AdminCounter.findOne({ key: `inv_${tag}` }).lean(),
        AdminInvoice.find({ invoiceNumber: new RegExp(`^${escapeRegex(prefix)}`, "i") })
          .select("invoiceNumber")
          .lean(),
      ]);
      let maxSeq = counter?.seq ?? 0;
      for (const row of existing) {
        const tail = String(row.invoiceNumber || "").slice(prefix.length);
        const num = parseInt(tail.split("/")[0] || "0", 10);
        if (Number.isInteger(num) && num > maxSeq) maxSeq = num;
      }
      res.json({
        success: true,
        data: { nextInvoiceNumber: `${prefix}${String(maxSeq + 1).padStart(2, "0")}` },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Generate Site Invoice from Verified Attendance (Multi-Month & Split) ───
billingAdminRouter.post(
  "/generate",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await ensureBillingRuleTemplatesSeeded();
      const body = stripMetaFields(req.body);
      const rawSiteName = String(body.siteName || body.site || "").trim();
      const rawSiteId =
        typeof body.siteId === "string" && mongoose.Types.ObjectId.isValid(body.siteId) ? body.siteId : null;
      const subUnit = String(body.subUnit || "").trim();

      if (!rawSiteName && !rawSiteId) {
        res.status(400).json({ success: false, message: "siteName or siteId is required." });
        return;
      }

      const periodMonths: string[] = Array.isArray(body.periodMonths) && body.periodMonths.length > 0
        ? body.periodMonths.map((m: unknown) => String(m || "").trim()).filter((m: string) => /^\d{4}-\d{2}$/.test(m))
        : typeof body.monthKey === "string" && /^\d{4}-\d{2}$/.test(body.monthKey.trim())
          ? [body.monthKey.trim()]
          : [todayIso().slice(0, 7)];

      const siteDoc = rawSiteId
        ? await AdminSite.findById(rawSiteId).lean()
        : await AdminSite.findOne({ siteName: new RegExp(`^${escapeRegex(rawSiteName)}$`, "i") }).lean();
      const resolvedSiteName = siteDoc?.siteName || rawSiteName;
      const siteRegex = new RegExp(`^${escapeRegex(resolvedSiteName)}$`, "i");

      const ruleProfile = await resolveBillingRuleForSite({
        siteId: siteDoc ? String(siteDoc._id) : null,
        siteName: resolvedSiteName,
        subUnit,
        ruleProfileId: typeof body.ruleProfileId === "string" ? body.ruleProfileId : null,
      });

      const [attendanceDocs, employees, approvals] = await Promise.all([
        AdminAttendance.find({
          monthKey: { $in: periodMonths },
          $or: [...(siteDoc ? [{ workSiteId: siteDoc._id }] : []), { location: siteRegex }],
        }).lean(),
        AdminEmployee.find({
          status: { $ne: "LEFT" },
          ...(siteDoc ? { $or: [{ primarySiteId: siteDoc._id }, { siteName: siteRegex }] } : { siteName: siteRegex }),
        }).lean(),
        AdminSiteMusterApproval.find({
          monthKey: { $in: periodMonths },
          siteName: siteRegex,
        }).lean(),
      ]);

      // Build billing line items either from explicit override or aggregated attendance
      let lineInputs: IBillingLineInput[] = [];
      if (Array.isArray(body.lineItemsOverride) && body.lineItemsOverride.length > 0) {
        lineInputs = body.lineItemsOverride.map((l: any) => ({
          label: String(l.label || l.designation || "Security Guard"),
          designation: String(l.designation || l.label || "Security Guard"),
          normalDays: Number(l.normalDays) || 0,
          extraDays: Number(l.extraDays) || 0,
          otHours: Number(l.otHours) || 0,
          baseRate: Number(l.baseRate) || Number(body.customRate) || 600,
          headcount: Number(l.headcount) || 1,
        }));
      } else {
        const rateByEmp = new Map<string, number>();
        const rateByDesignation = new Map<string, number>();
        for (const emp of employees) {
          const daily =
            emp.rateType === "MONTHLY" ? Math.round((emp.baseRate / 26) * 100) / 100 : emp.baseRate;
          if (emp.empCode) rateByEmp.set(emp.empCode.toUpperCase(), daily);
          if (emp.designation && !rateByDesignation.has(emp.designation.toLowerCase())) {
            rateByDesignation.set(emp.designation.toLowerCase(), daily);
          }
        }

        const groups = new Map<
          string,
          { normalDays: number; extraDays: number; otHours: number; workerIds: Set<string> }
        >();
        for (const att of attendanceDocs) {
          const desig = String(att.designation || "Security Guard").trim();
          if (subUnit && !desig.toLowerCase().includes(subUnit.toLowerCase())) continue;
          const g = groups.get(desig) ?? {
            normalDays: 0,
            extraDays: 0,
            otHours: 0,
            workerIds: new Set<string>(),
          };
          g.normalDays += Number(att.normalDuty) || 0;
          g.extraDays += Number(att.extraDuty) || 0;
          g.otHours += Number(att.otHours) || 0;
          g.workerIds.add((att.employeeId || att.employeeName || "W").toUpperCase());
          groups.set(desig, g);
        }

        for (const [desig, stats] of groups.entries()) {
          const fallbackRate =
            Number(body.customRate) || rateByDesignation.get(desig.toLowerCase()) || 600;
          lineInputs.push({
            label: subUnit ? `${desig} (${subUnit})` : desig,
            designation: desig,
            normalDays: Math.round(stats.normalDays * 100) / 100,
            extraDays: Math.round(stats.extraDays * 100) / 100,
            otHours: Math.round(stats.otHours * 100) / 100,
            baseRate: fallbackRate,
            headcount: Math.max(1, stats.workerIds.size),
          });
        }

        if (lineInputs.length === 0) {
          const fallbackDays = Number(body.fallbackDays) || 26;
          const fallbackRate = Number(body.customRate) || employees[0]?.baseRate || 600;
          lineInputs.push({
            label: subUnit ? `Security & Allied Services (${subUnit})` : "Security & Allied Services",
            designation: subUnit || "Security Personnel",
            normalDays: fallbackDays,
            extraDays: 0,
            otHours: 0,
            baseRate: fallbackRate,
            headcount: Math.max(1, employees.length),
          });
        }
      }

      const calc = calculateSiteBill({
        lines: lineInputs,
        rule: ruleProfile as Partial<IBillingRuleConfig>,
      });

      const invoiceDate =
        typeof body.invoiceDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.invoiceDate.trim())
          ? body.invoiceDate.trim()
          : todayIso();
      const dueDate =
        typeof body.dueDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.dueDate.trim())
          ? body.dueDate.trim()
          : addDaysIso(invoiceDate, 30);

      const invoiceNumber =
        typeof body.invoiceNumber === "string" && body.invoiceNumber.trim()
          ? body.invoiceNumber.trim().toUpperCase()
          : await allocateNextAcsInvoiceNumber(invoiceDate);

      const { billingMonth, periodLabel } = formatMonthRangeLabel(periodMonths);
      const isVerifiedMuster = approvals.some(
        (a) => a.verificationStatus === "CLIENT_VERIFIED" || a.verificationStatus === "LOCKED_FOR_BILLING"
      );

      const avgQty = Math.max(1, Math.round(calc.totalBillableDays));
      const effectiveUnitRate = Math.round((calc.taxableSubtotal / avgQty) * 100) / 100;
      const effectiveTaxRate =
        calc.taxableSubtotal > 0 ? Math.round(((calc.totalGst / calc.taxableSubtotal) * 100) * 100) / 100 : 0;

      const created = await AdminInvoice.create({
        invoiceNumber,
        siteId: siteDoc?._id ?? null,
        billingRuleProfileId: "_id" in ruleProfile ? ruleProfile._id : null,
        ruleProfileCode: ruleProfile.profileCode,
        clientName: String(body.clientName || siteDoc?.clientName || resolvedSiteName).trim(),
        clientAddress: String(body.clientAddress || siteDoc?.billToAddress || "").trim(),
        clientGstin: String(body.clientGstin || siteDoc?.clientGstin || "").trim(),
        stateCode: siteDoc?.stateCode || "19",
        vendorCode: siteDoc?.vendorCode || "",
        contractRef: siteDoc?.contractRef || "",
        billingMonth,
        periodMonths,
        periodLabel,
        site: resolvedSiteName,
        subUnit,
        serviceType:
          calc.sacCode === "998525"
            ? "Housekeeping & Sanitation Services"
            : calc.sacCode === "998519"
              ? "Manpower Supply & Support Services"
              : "Manned Security & Guarding Services",
        serviceDescription: `${ruleProfile.profileName} (${periodLabel})`,
        sacCode: calc.sacCode,
        archetype: calc.archetype,
        gstMode: calc.gstMode,
        attendanceSource: isVerifiedMuster
          ? "VERIFIED_MUSTER"
          : attendanceDocs.length > 0
            ? "ATTENDANCE_LOGS"
            : "MANUAL",
        quantity: avgQty,
        rate: effectiveUnitRate,
        taxRate: effectiveTaxRate,
        lineItems: calc.lineItems,
        wagesSubtotal: calc.wagesSubtotal,
        epfTotal: calc.epfTotal,
        esiTotal: calc.esiTotal,
        bonusTotal: calc.bonusTotal,
        statutoryTotal: calc.statutoryTotal,
        govtDeductionPct: ruleProfile.govtDeductionPct ?? 0,
        govtDeductionAmount: calc.govtDeductionAmount,
        serviceChargePct: ruleProfile.serviceChargePct ?? 0,
        serviceChargeAmount: calc.serviceChargeAmount,
        taxableSubtotal: calc.taxableSubtotal,
        cgstRate: calc.cgstRate,
        cgstAmount: calc.cgstAmount,
        sgstRate: calc.sgstRate,
        sgstAmount: calc.sgstAmount,
        igstRate: calc.igstRate,
        igstAmount: calc.igstAmount,
        cessPct: ruleProfile.cessPct ?? 0,
        cessAmount: calc.cessAmount,
        roundOff: calc.roundOff,
        totalInvoiceAmount: calc.totalInvoiceAmount,
        amountInWords: calc.amountInWords,
        includeFactoryActNote: ruleProfile.includeFactoryActNote ?? false,
        invoiceDate,
        dueDate,
        paymentTerms: "Payment within 30 days (24% p.a. interest thereafter)",
        status: "Pending",
        paymentStage: body.saveAsDraft === true ? "DRAFT" : "PRE_PAYMENT_SUBMITTED",
        deductionsSlip: [],
        totalDeductions: 0,
        paymentReceipts: [],
        totalReceived: 0,
        balanceReceivable: calc.totalInvoiceAmount,
        interestRatePct: ruleProfile.interestRatePct ?? 24,
      });

      await logAdminActivity(
        "Site invoice generated",
        `Generated ${created.invoiceNumber} (${created.gstMode}) ₹${calc.totalInvoiceAmount} for ${resolvedSiteName}.`,
        "Billing"
      );

      res.status(201).json({
        success: true,
        message: `Generated invoice ${created.invoiceNumber}`,
        data: {
          invoice: serializeDoc(created),
          ruleProfile: serializeDoc(ruleProfile),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/admin/invoices ──────────────────────────────────
billingAdminRouter.get("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, paymentStage, billingMonth, site, search } = req.query;
    const filter: Record<string, any> = {};

    if (typeof status === "string" && status !== "All") filter.status = status;
    if (typeof paymentStage === "string" && (INVOICE_PAYMENT_STAGES as readonly string[]).includes(paymentStage)) {
      filter.paymentStage = paymentStage;
    }
    if (typeof billingMonth === "string" && billingMonth !== "All") filter.billingMonth = billingMonth;
    if (typeof site === "string" && site.trim() && site !== "All") {
      filter.site = new RegExp(`^${escapeRegex(site.trim())}$`, "i");
    }
    if (typeof search === "string" && search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), "i");
      filter.$or = [
        { invoiceNumber: regex },
        { clientName: regex },
        { site: regex },
        { subUnit: regex },
        { serviceType: regex },
      ];
    }

    const invoices = await AdminInvoice.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    res.json({ success: true, count: invoices.length, data: invoices.map(serializeDoc) });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/invoices/:id ──────────────────────────────
billingAdminRouter.get("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const invoice = await AdminInvoice.findById(getParamId(req)).lean();
    if (!invoice) {
      res.status(404).json({ success: false, message: "Invoice not found" });
      return;
    }
    res.json({ success: true, data: serializeDoc(invoice) });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/invoices ─────────────────────────────────
billingAdminRouter.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { invoiceNumber, clientName, billingMonth, site, serviceType, quantity, rate, invoiceDate, dueDate } = req.body;
    if (!invoiceNumber || !clientName || !billingMonth || !site || !serviceType || quantity === undefined || rate === undefined) {
      res.status(400).json({
        success: false,
        message: "Required fields: invoiceNumber, clientName, billingMonth, site, serviceType, quantity, rate",
      });
      return;
    }

    const total = computeInvoiceNetTotal(req.body);
    const invoice = await AdminInvoice.create({
      ...req.body,
      invoiceDate: invoiceDate || todayIso(),
      dueDate: dueDate || addDaysIso(invoiceDate || todayIso(), 30),
      totalInvoiceAmount: req.body.totalInvoiceAmount ?? total,
      amountInWords: req.body.amountInWords || numberToIndianCurrencyWords(total),
      balanceReceivable:
        req.body.status === "Paid" ? 0 : (req.body.balanceReceivable ?? total),
      paymentStage:
        req.body.status === "Paid"
          ? "SETTLED"
          : (req.body.paymentStage ?? "PRE_PAYMENT_SUBMITTED"),
    });

    await logAdminActivity(
      "New invoice created",
      `${invoice.invoiceNumber} generated for ${invoice.clientName}.`,
      "Billing"
    );

    res.status(201).json({
      success: true,
      message: "Invoice created successfully",
      data: serializeDoc(invoice),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/invoices/:id/deductions (Client Deduction Slip) ──
billingAdminRouter.post(
  "/:id/deductions",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = getParamId(req);
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(404).json({ success: false, message: "Invoice not found" });
        return;
      }
      const invoice = await AdminInvoice.findById(id);
      if (!invoice) {
        res.status(404).json({ success: false, message: "Invoice not found" });
        return;
      }

      const rawCat = String(req.body?.category || "TDS").trim().toUpperCase();
      const category: InvoiceDeductionCategory = (INVOICE_DEDUCTION_CATEGORIES as readonly string[]).includes(rawCat)
        ? (rawCat as InvoiceDeductionCategory)
        : "OTHER";
      const amount = Number(req.body?.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        res.status(400).json({ success: false, message: "Deduction amount must be positive." });
        return;
      }

      invoice.deductionsSlip = [
        ...(invoice.deductionsSlip ?? []),
        {
          category,
          amount: Math.round(amount * 100) / 100,
          note: String(req.body?.note || "").trim(),
          recordedAt: String(req.body?.recordedAt || todayIso()).trim(),
        },
      ];

      const total = computeInvoiceNetTotal(invoice);
      const totDed = Math.round(invoice.deductionsSlip.reduce((s, d) => s + d.amount, 0) * 100) / 100;
      const totRec = invoice.totalReceived ?? 0;
      const bal = Math.max(0, Math.round((total - totDed - totRec) * 100) / 100);

      invoice.totalInvoiceAmount = total;
      invoice.totalDeductions = totDed;
      invoice.balanceReceivable = bal;
      if (bal <= 0.01) {
        invoice.paymentStage = "SETTLED";
        invoice.status = "Paid";
      } else {
        invoice.paymentStage = "DEDUCTION_DISPUTED";
      }

      await invoice.save();
      res.json({ success: true, message: "Client deduction slip recorded.", data: serializeDoc(invoice) });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/admin/invoices/:id/receipts (Post-Payment Receipt) ──
billingAdminRouter.post(
  "/:id/receipts",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = getParamId(req);
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(404).json({ success: false, message: "Invoice not found" });
        return;
      }
      const invoice = await AdminInvoice.findById(id);
      if (!invoice) {
        res.status(404).json({ success: false, message: "Invoice not found" });
        return;
      }

      const amount = Number(req.body?.amount);
      if (!Number.isFinite(amount) || amount <= 0) {
        res.status(400).json({ success: false, message: "Receipt amount must be positive." });
        return;
      }

      const rawMode = String(req.body?.paymentMode || "BANK_TRANSFER").trim().toUpperCase();
      const paymentMode: PaymentMode = (PAYMENT_MODES as readonly string[]).includes(rawMode)
        ? (rawMode as PaymentMode)
        : "BANK_TRANSFER";

      invoice.paymentReceipts = [
        ...(invoice.paymentReceipts ?? []),
        {
          receiptDate: String(req.body?.receiptDate || todayIso()).trim(),
          amount: Math.round(amount * 100) / 100,
          paymentMode,
          referenceNo: String(req.body?.referenceNo || "").trim(),
          bankName: String(req.body?.bankName || "").trim(),
          note: String(req.body?.note || "").trim(),
        },
      ];

      const total = computeInvoiceNetTotal(invoice);
      const totDed = invoice.totalDeductions ?? 0;
      const totRec = Math.round(invoice.paymentReceipts.reduce((s, r) => s + r.amount, 0) * 100) / 100;
      const bal = Math.max(0, Math.round((total - totDed - totRec) * 100) / 100);

      invoice.totalInvoiceAmount = total;
      invoice.totalReceived = totRec;
      invoice.balanceReceivable = bal;
      if (bal <= 0.01) {
        invoice.paymentStage = "SETTLED";
        invoice.status = "Paid";
      } else {
        invoice.paymentStage = "PARTIAL_PAID";
      }

      await invoice.save();
      await logAdminActivity(
        "Invoice payment receipt recorded",
        `Received ₹${amount} (${paymentMode}) against ${invoice.invoiceNumber}.`,
        "Billing"
      );

      res.json({ success: true, message: "Payment receipt recorded.", data: serializeDoc(invoice) });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/admin/invoices/:id/stage ──────────────────────
billingAdminRouter.patch(
  "/:id/stage",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawStage = String(req.body?.paymentStage || "").trim().toUpperCase();
      if (!(INVOICE_PAYMENT_STAGES as readonly string[]).includes(rawStage)) {
        res.status(400).json({
          success: false,
          message: `paymentStage must be one of: ${INVOICE_PAYMENT_STAGES.join(", ")}`,
        });
        return;
      }
      const invoice = await AdminInvoice.findById(getParamId(req));
      if (!invoice) {
        res.status(404).json({ success: false, message: "Invoice not found" });
        return;
      }
      invoice.paymentStage = rawStage as InvoicePaymentStage;
      if (rawStage === "SETTLED") {
        invoice.status = "Paid";
        invoice.balanceReceivable = 0;
      } else if (rawStage === "OVERDUE") {
        invoice.status = "Overdue";
      }
      await invoice.save();
      res.json({ success: true, data: serializeDoc(invoice) });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/admin/invoices/:id/mark-paid ──────────────────
billingAdminRouter.patch("/:id/mark-paid", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const existing = await AdminInvoice.findById(getParamId(req));
    if (!existing) {
      res.status(404).json({ success: false, message: "Invoice not found" });
      return;
    }

    const netTotal = computeInvoiceNetTotal(existing);
    existing.status = "Paid";
    existing.paymentStage = "SETTLED";
    existing.totalReceived = Math.max(existing.totalReceived ?? 0, netTotal - (existing.totalDeductions ?? 0));
    existing.balanceReceivable = 0;
    await existing.save();

    await logAdminActivity(
      "Invoice marked paid",
      `${existing.invoiceNumber} marked as Paid.`,
      "Billing"
    );

    res.json({
      success: true,
      message: "Invoice marked as Paid",
      data: serializeDoc(existing),
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH / PUT /api/admin/invoices/:id ──────────────────────
const updateInvoiceHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const updated = await AdminInvoice.findByIdAndUpdate(
      getParamId(req),
      { $set: stripMetaFields(req.body) },
      { new: true, runValidators: true }
    );
    if (!updated) {
      res.status(404).json({ success: false, message: "Invoice not found" });
      return;
    }

    await logAdminActivity(
      "Invoice updated",
      `Updated billing details for ${updated.invoiceNumber}.`,
      "Billing"
    );

    res.json({
      success: true,
      message: "Invoice updated successfully",
      data: serializeDoc(updated),
    });
  } catch (err) {
    next(err);
  }
};

billingAdminRouter.patch("/:id", updateInvoiceHandler);
billingAdminRouter.put("/:id", updateInvoiceHandler);

// ─── DELETE /api/admin/invoices/:id ───────────────────────────
billingAdminRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const deleted = await AdminInvoice.findByIdAndDelete(getParamId(req));
    if (!deleted) {
      res.status(404).json({ success: false, message: "Invoice not found" });
      return;
    }
    res.json({ success: true, message: "Invoice deleted", data: serializeDoc(deleted) });
  } catch (err) {
    next(err);
  }
});
