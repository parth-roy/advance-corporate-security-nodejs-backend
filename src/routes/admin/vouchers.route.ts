import { Router, Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { AdminEmployee, AdminSite, PAYMENT_MODES, PaymentMode } from "../../models/admin/AdminCore.model";
import {
  ADVANCE_RECOVERY_MODES,
  ADVANCE_STATUSES,
  AdminCounter,
  AdminPayslip,
  AdminSalary,
  AdminSalaryAdvance,
  AdminSalaryLineItem,
  AdminVoucher,
  AdvanceRecoveryMode,
  AdvanceStatus,
  getNextSequenceValue,
  VOUCHER_PURPOSE_TYPES,
  VoucherPurposeType,
} from "../../models/admin/AdminFinance.model";
import { numberToIndianCurrencyWords } from "../../utils/indianCurrencyWords";
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

export const advancesAdminRouter = Router();
export const vouchersAdminRouter = Router();

function nextYearMonth(yearMonth: string): string {
  const [yStr, mStr] = yearMonth.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) {
    return todayIso().slice(0, 7);
  }
  if (m === 12) return `${y + 1}-01`;
  return `${y}-${String(m + 1).padStart(2, "0")}`;
}

function normalizeDate(raw: unknown): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : todayIso();
}

function normalizeMonthKey(raw: unknown, fallbackDate: string): string {
  const s = typeof raw === "string" ? raw.trim() : "";
  return /^\d{4}-\d{2}$/.test(s) ? s : fallbackDate.slice(0, 7);
}

async function allocateNextVoucherNo(): Promise<number> {
  const topDoc = await AdminVoucher.findOne().sort({ voucherNo: -1 }).select("voucherNo").lean();
  const minSeed = topDoc?.voucherNo ?? 0;
  return getNextSequenceValue("voucher_no", minSeed);
}

// ─── Salary Advances (/api/admin/advances) ────────────────────
advancesAdminRouter.get(
  "/payroll-preview",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const month = normalizeMonthKey(req.query.month, todayIso());
      const site = typeof req.query.site === "string" ? req.query.site.trim() : "";

      const filter: Record<string, any> = {
        status: { $in: ["OPEN", "PARTIAL"] },
        remainingBalance: { $gt: 0 },
        targetPayrollMonth: { $lte: month },
      };
      if (site && site !== "All") {
        filter.onAccountOf = new RegExp(`^${escapeRegex(site)}$`, "i");
      }

      const activeList = await AdminSalaryAdvance.find(filter).sort({ staffNo: 1, employeeName: 1 }).lean();
      const items = activeList.map((adv) => {
        const due =
          adv.recoveryMode === "EMI"
            ? Math.min(adv.remainingBalance, adv.monthlyAmount || adv.remainingBalance)
            : adv.remainingBalance;
        return {
          ...serializeDoc(adv),
          monthKeyDue: month,
          dueThisMonth: Number(due.toFixed(2)),
          carriedForwardAfter: Number(Math.max(0, adv.remainingBalance - due).toFixed(2)),
        };
      });

      res.json({
        success: true,
        data: {
          month,
          count: items.length,
          totalDueThisMonth: Number(items.reduce((s, i) => s + i.dueThisMonth, 0).toFixed(2)),
          items,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

advancesAdminRouter.get("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { month, status, site, recoveryMode, search } = req.query;
    const { page, limit, skip } = parsePaginationParams(req.query, 50, 250);
    const filter: Record<string, any> = {};

    if (typeof month === "string" && /^\d{4}-\d{2}$/.test(month.trim())) {
      filter.$or = [{ monthKey: month.trim() }, { targetPayrollMonth: month.trim() }];
    }
    if (typeof status === "string" && (ADVANCE_STATUSES as readonly string[]).includes(status)) {
      filter.status = status;
    }
    if (typeof recoveryMode === "string" && (ADVANCE_RECOVERY_MODES as readonly string[]).includes(recoveryMode)) {
      filter.recoveryMode = recoveryMode;
    }
    if (typeof site === "string" && site.trim() && site !== "All") {
      filter.onAccountOf = new RegExp(`^${escapeRegex(site.trim())}$`, "i");
    }
    if (typeof search === "string" && search.trim()) {
      const rx = new RegExp(escapeRegex(search.trim()), "i");
      filter.$and = [
        ...(Array.isArray(filter.$and) ? filter.$and : []),
        {
          $or: [
            { employeeName: rx },
            { employeeId: rx },
            { legacyEmpCode: rx },
            { onAccountOf: rx },
            { remarks: rx },
          ],
        },
      ];
    }

    const [items, total, agg] = await Promise.all([
      AdminSalaryAdvance.find(filter).sort({ date: -1, staffNo: -1 }).skip(skip).limit(limit).lean(),
      AdminSalaryAdvance.countDocuments(filter),
      AdminSalaryAdvance.aggregate([
        {
          $group: {
            _id: "$status",
            count: { $sum: 1 },
            amount: { $sum: "$amount" },
            recovered: { $sum: "$recoveredAmount" },
            remaining: { $sum: "$remainingBalance" },
          },
        },
      ]),
    ]);

    let openCount = 0;
    let totalIssued = 0;
    let totalRecovered = 0;
    let totalOutstanding = 0;
    for (const row of agg) {
      if (row._id !== "CANCELLED") {
        totalIssued += Number(row.amount) || 0;
        totalRecovered += Number(row.recovered) || 0;
      }
      if (row._id === "OPEN" || row._id === "PARTIAL") {
        openCount += Number(row.count) || 0;
        totalOutstanding += Number(row.remaining) || 0;
      }
    }

    res.json({
      success: true,
      count: items.length,
      pagination: buildPaginationMeta(page, limit, total),
      summary: {
        openCount,
        totalIssued: Number(totalIssued.toFixed(2)),
        totalRecovered: Number(totalRecovered.toFixed(2)),
        totalOutstanding: Number(totalOutstanding.toFixed(2)),
      },
      data: items.map(serializeDoc),
    });
  } catch (err) {
    next(err);
  }
});

advancesAdminRouter.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = stripMetaFields(req.body);
    const employeeName = String(body.employeeName || "").trim();
    const onAccountOf = String(body.onAccountOf || body.siteName || "").trim();
    const employeeId = String(body.employeeId || "").trim().toUpperCase();
    const legacyEmpCode = String(body.legacyEmpCode || "").trim();
    const date = normalizeDate(body.date);
    const monthKey = normalizeMonthKey(body.monthKey, date);
    const amount = Number(body.amount);

    if (!employeeName || !onAccountOf || !Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({
        success: false,
        message: "Required fields: employeeName, onAccountOf (site/account), and amount (> 0).",
      });
      return;
    }

    const rawRecMode = String(body.recoveryMode || "NEXT_MONTH").toUpperCase();
    const recoveryMode: AdvanceRecoveryMode = (ADVANCE_RECOVERY_MODES as readonly string[]).includes(rawRecMode)
      ? (rawRecMode as AdvanceRecoveryMode)
      : "NEXT_MONTH";

    const installmentCount =
      recoveryMode === "EMI"
        ? Math.max(1, Math.min(36, Math.round(Number(body.installmentCount) || 2)))
        : 1;
    const monthlyAmount =
      recoveryMode === "EMI"
        ? Math.round((amount / installmentCount) * 100) / 100
        : amount;

    const targetPayrollMonth =
      typeof body.targetPayrollMonth === "string" && /^\d{4}-\d{2}$/.test(body.targetPayrollMonth.trim())
        ? body.targetPayrollMonth.trim()
        : recoveryMode === "NEXT_MONTH"
          ? nextYearMonth(monthKey)
          : monthKey;

    const [siteDoc, empDoc, lastStaff] = await Promise.all([
      AdminSite.findOne({ siteName: new RegExp(`^${escapeRegex(onAccountOf)}$`, "i") }).lean(),
      AdminEmployee.findOne({
        $or: [
          ...(employeeId ? [{ empCode: employeeId }] : []),
          ...(legacyEmpCode ? [{ legacyEmpCode }] : []),
          { fullName: new RegExp(`^${escapeRegex(employeeName)}$`, "i") },
        ],
      }).lean(),
      AdminSalaryAdvance.findOne({ monthKey }).sort({ staffNo: -1 }).select("staffNo").lean(),
    ]);

    const reqStaffNo = Number(body.staffNo);
    const staffNo =
      Number.isInteger(reqStaffNo) && reqStaffNo >= 1
        ? reqStaffNo
        : (lastStaff?.staffNo ?? 0) + 1;

    const resolvedEmpId =
      employeeId ||
      empDoc?.empCode ||
      `ACS/ADV/${date.slice(0, 4)}/${String(staffNo).padStart(3, "0")}`;

    const signatures = {
      receiver: String(body.signatures?.receiver || employeeName).trim(),
      staff: String(body.signatures?.staff || "").trim(),
      manager: String(body.signatures?.manager || "").trim(),
      director: String(body.signatures?.director || "").trim(),
    };

    const advance = await AdminSalaryAdvance.create({
      staffNo,
      monthKey,
      date,
      employeeObjectId: empDoc?._id ?? null,
      employeeId: resolvedEmpId,
      legacyEmpCode: legacyEmpCode || empDoc?.legacyEmpCode || "",
      employeeName,
      siteId: siteDoc?._id ?? empDoc?.primarySiteId ?? null,
      onAccountOf: siteDoc?.siteName || onAccountOf,
      amount: Math.round(amount * 100) / 100,
      recoveryMode,
      installmentCount,
      monthlyAmount,
      targetPayrollMonth,
      recoveredAmount: 0,
      remainingBalance: Math.round(amount * 100) / 100,
      status: "OPEN",
      signatures,
      remarks: String(body.remarks || "").trim(),
    });

    let createdVoucher: any = null;
    if (body.issueVoucher === true) {
      const rawMode = String(body.paymentMode || "CASH").trim().toUpperCase();
      const paymentMode: PaymentMode = (PAYMENT_MODES as readonly string[]).includes(rawMode)
        ? (rawMode as PaymentMode)
        : "CASH";
      const voucherNo = await allocateNextVoucherNo();
      const particulars =
        String(body.particulars || "").trim() ||
        `Being the Advance paid to ${employeeName} (${onAccountOf}) for ${monthKey}`;

      createdVoucher = await AdminVoucher.create({
        voucherNo,
        date,
        monthKey,
        debitHead: String(body.debitHead || "Advance to Staff").trim(),
        purposeType: "ADVANCE",
        payeeName: employeeName,
        employeeObjectId: empDoc?._id ?? null,
        employeeId: resolvedEmpId,
        siteId: siteDoc?._id ?? null,
        onAccountOf: siteDoc?.siteName || onAccountOf,
        particulars,
        amount: advance.amount,
        amountInWords: numberToIndianCurrencyWords(advance.amount),
        paymentMode,
        ...(paymentMode === "CHEQUE"
          ? {
              chequeDetails: {
                chequeNo: String(body.chequeDetails?.chequeNo || "").trim(),
                chequeDate: String(body.chequeDetails?.chequeDate || date).trim(),
                bankAccount: String(body.chequeDetails?.bankAccount || "436010200019707").trim(),
                ifsc: String(body.chequeDetails?.ifsc || "UTIB0000436").trim().toUpperCase(),
                bankName: String(body.chequeDetails?.bankName || "AXIS BANK").trim(),
                chequeAmount: advance.amount,
              },
            }
          : {}),
        ...(paymentMode === "BANK_TRANSFER"
          ? {
              bankTransferDetails: {
                utrNumber: String(body.bankTransferDetails?.utrNumber || "").trim(),
                bankName: String(body.bankTransferDetails?.bankName || "AXIS BANK").trim(),
                bankAccount: String(body.bankTransferDetails?.bankAccount || "").trim(),
                transferDate: String(body.bankTransferDetails?.transferDate || date).trim(),
              },
            }
          : {}),
        ...(paymentMode === "UPI"
          ? {
              upiDetails: {
                upiTransactionId: String(body.upiDetails?.upiTransactionId || "").trim(),
                upiId: String(body.upiDetails?.upiId || "").trim(),
                transferDate: String(body.upiDetails?.transferDate || date).trim(),
              },
            }
          : {}),
        salaryAdvanceId: advance._id,
        preparedBy: signatures.staff,
        approvedBy: signatures.manager || signatures.director,
        receivedBy: signatures.receiver,
        status: "POSTED",
        remarks: advance.remarks,
      });

      advance.voucherId = createdVoucher._id;
      advance.voucherNo = createdVoucher.voucherNo;
      await advance.save();
    }

    await logAdminActivity(
      "Salary advance recorded",
      `Advance #${advance.staffNo} of ₹${advance.amount} issued to ${employeeName} (${onAccountOf}).`,
      "Payroll"
    );

    res.status(201).json({
      success: true,
      message: "Salary advance recorded successfully",
      data: {
        advance: serializeDoc(advance),
        ...(createdVoucher ? { voucher: serializeDoc(createdVoucher) } : {}),
      },
    });
  } catch (err) {
    next(err);
  }
});

advancesAdminRouter.patch("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Advance record not found" });
      return;
    }

    const advance = await AdminSalaryAdvance.findById(id);
    if (!advance) {
      res.status(404).json({ success: false, message: "Advance record not found" });
      return;
    }

    const body = stripMetaFields(req.body);
    if (body.signatures && typeof body.signatures === "object") {
      advance.signatures = {
        receiver: String(body.signatures.receiver ?? advance.signatures.receiver).trim(),
        staff: String(body.signatures.staff ?? advance.signatures.staff).trim(),
        manager: String(body.signatures.manager ?? advance.signatures.manager).trim(),
        director: String(body.signatures.director ?? advance.signatures.director).trim(),
      };
    }
    if (body.remarks !== undefined) advance.remarks = String(body.remarks || "").trim();
    if (body.targetPayrollMonth !== undefined && /^\d{4}-\d{2}$/.test(String(body.targetPayrollMonth).trim())) {
      advance.targetPayrollMonth = String(body.targetPayrollMonth).trim();
    }
    if (body.status !== undefined) {
      const nextStatus = String(body.status).toUpperCase();
      if ((ADVANCE_STATUSES as readonly string[]).includes(nextStatus)) {
        advance.status = nextStatus as AdvanceStatus;
      }
    }

    const dedRaw = body.recordDeductionAmount ?? body.deductedAmount;
    if (dedRaw !== undefined && dedRaw !== null && String(dedRaw).trim() !== "") {
      const dedAmt = Number(dedRaw);
      if (!Number.isFinite(dedAmt) || dedAmt <= 0) {
        res.status(400).json({ success: false, message: "recordDeductionAmount must be positive" });
        return;
      }
      const applied = Math.min(advance.remainingBalance, Math.round(dedAmt * 100) / 100);
      const monthKey = normalizeMonthKey(body.deductMonth ?? body.monthKey, todayIso());
      advance.recoveredAmount = Math.round((advance.recoveredAmount + applied) * 100) / 100;
      advance.remainingBalance = Math.max(
        0,
        Math.round((advance.amount - advance.recoveredAmount) * 100) / 100
      );
      advance.status = advance.remainingBalance <= 0 ? "RECOVERED" : "PARTIAL";
      advance.recoveryHistory.push({
        monthKey,
        deductedAmount: applied,
        balanceAfter: advance.remainingBalance,
        source: body.source === "PAYROLL" ? "PAYROLL" : "MANUAL",
        note: String(body.note || `Recovered ₹${applied} in ${monthKey}`).trim(),
        recordedAt: todayIso(),
      });
    }

    await advance.save();
    res.json({ success: true, data: serializeDoc(advance) });
  } catch (err) {
    next(err);
  }
});

// ─── Printed Payment Vouchers (/api/admin/vouchers) ───────────
vouchersAdminRouter.get(
  "/next-number",
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const [counter, topVoucher] = await Promise.all([
        AdminCounter.findOne({ key: "voucher_no" }).lean(),
        AdminVoucher.findOne().sort({ voucherNo: -1 }).select("voucherNo").lean(),
      ]);
      const nextNo = Math.max(counter?.seq ?? 0, topVoucher?.voucherNo ?? 0) + 1;
      res.json({ success: true, data: { nextVoucherNo: nextNo } });
    } catch (err) {
      next(err);
    }
  }
);

vouchersAdminRouter.get("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { month, paymentMode, purposeType, status, search } = req.query;
    const { page, limit, skip } = parsePaginationParams(req.query, 50, 250);
    const filter: Record<string, any> = {};

    if (typeof month === "string" && /^\d{4}-\d{2}$/.test(month.trim())) {
      filter.monthKey = month.trim();
    }
    if (typeof paymentMode === "string" && (PAYMENT_MODES as readonly string[]).includes(paymentMode)) {
      filter.paymentMode = paymentMode;
    }
    if (typeof purposeType === "string" && (VOUCHER_PURPOSE_TYPES as readonly string[]).includes(purposeType)) {
      filter.purposeType = purposeType;
    }
    if (typeof status === "string" && (status === "POSTED" || status === "CANCELLED")) {
      filter.status = status;
    }
    if (typeof search === "string" && search.trim()) {
      const clean = search.trim();
      const numMatch = /^\d+$/.test(clean) ? Number(clean) : null;
      const rx = new RegExp(escapeRegex(clean), "i");
      filter.$or = [
        ...(numMatch ? [{ voucherNo: numMatch }] : []),
        { payeeName: rx },
        { employeeId: rx },
        { onAccountOf: rx },
        { debitHead: rx },
        { particulars: rx },
        { "chequeDetails.chequeNo": rx },
        { "bankTransferDetails.utrNumber": rx },
        { "upiDetails.upiTransactionId": rx },
      ];
    }

    const [items, total, modeAgg] = await Promise.all([
      AdminVoucher.find(filter).sort({ voucherNo: -1 }).skip(skip).limit(limit).lean(),
      AdminVoucher.countDocuments(filter),
      AdminVoucher.aggregate([
        { $match: { status: "POSTED" } },
        {
          $group: {
            _id: "$paymentMode",
            count: { $sum: 1 },
            amount: { $sum: "$amount" },
          },
        },
      ]),
    ]);

    const byMode: Record<string, number> = {
      CASH: 0,
      CHEQUE: 0,
      BANK_TRANSFER: 0,
      UPI: 0,
    };
    let totalAmount = 0;
    for (const row of modeAgg) {
      const amt = Number(row.amount) || 0;
      totalAmount += amt;
      if (row._id && row._id in byMode) byMode[row._id] = amt;
    }

    res.json({
      success: true,
      count: items.length,
      pagination: buildPaginationMeta(page, limit, total),
      summary: {
        totalCount: total,
        totalAmount: Number(totalAmount.toFixed(2)),
        byMode,
      },
      data: items.map(serializeDoc),
    });
  } catch (err) {
    next(err);
  }
});

vouchersAdminRouter.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = stripMetaFields(req.body);
    const payeeName = String(body.payeeName || "").trim();
    const debitHead = String(body.debitHead || "Salary to Staff").trim();
    const particulars = String(body.particulars || "").trim();
    const date = normalizeDate(body.date);
    const monthKey = normalizeMonthKey(body.monthKey, date);
    const amount = Number(body.amount);

    const rawPurpose = String(body.purposeType || "SALARY_PAYOUT").toUpperCase();
    const purposeType: VoucherPurposeType = (VOUCHER_PURPOSE_TYPES as readonly string[]).includes(rawPurpose)
      ? (rawPurpose as VoucherPurposeType)
      : "SALARY_PAYOUT";

    const rawMode = String(body.paymentMode || "CASH").toUpperCase();
    const paymentMode: PaymentMode = (PAYMENT_MODES as readonly string[]).includes(rawMode)
      ? (rawMode as PaymentMode)
      : "CASH";

    if (!payeeName || !particulars || !Number.isFinite(amount) || amount <= 0) {
      res.status(400).json({
        success: false,
        message: "Required fields: payeeName, particulars, and positive amount.",
      });
      return;
    }

    if (paymentMode === "CHEQUE" && !String(body.chequeDetails?.chequeNo || "").trim()) {
      res.status(400).json({ success: false, message: "Cheque payment requires chequeNo." });
      return;
    }
    if (paymentMode === "BANK_TRANSFER" && !String(body.bankTransferDetails?.utrNumber || "").trim()) {
      res.status(400).json({ success: false, message: "Bank Transfer requires utrNumber / reference." });
      return;
    }
    if (paymentMode === "UPI" && !String(body.upiDetails?.upiTransactionId || "").trim()) {
      res.status(400).json({ success: false, message: "UPI payment requires upiTransactionId." });
      return;
    }

    let voucherNo: number;
    const explicitNo = Number(body.voucherNo);
    if (Number.isInteger(explicitNo) && explicitNo >= 1) {
      const conflict = await AdminVoucher.exists({ voucherNo: explicitNo });
      if (conflict) {
        res.status(409).json({
          success: false,
          message: `Voucher #${explicitNo} already exists.`,
        });
        return;
      }
      voucherNo = explicitNo;
      await AdminCounter.findOneAndUpdate(
        { key: "voucher_no" },
        { $max: { seq: voucherNo } },
        { upsert: true }
      );
    } else {
      voucherNo = await allocateNextVoucherNo();
    }

    const employeeId = String(body.employeeId || "").trim().toUpperCase();
    const onAccountOf = String(body.onAccountOf || "").trim();

    const [siteDoc, empDoc] = await Promise.all([
      onAccountOf
        ? AdminSite.findOne({ siteName: new RegExp(`^${escapeRegex(onAccountOf)}$`, "i") }).lean()
        : Promise.resolve(null),
      employeeId || payeeName
        ? AdminEmployee.findOne({
            $or: [
              ...(employeeId ? [{ empCode: employeeId }] : []),
              { fullName: new RegExp(`^${escapeRegex(payeeName)}$`, "i") },
            ],
          }).lean()
        : Promise.resolve(null),
    ]);

    const roundedAmt = Math.round(amount * 100) / 100;
    const amountInWords =
      String(body.amountInWords || "").trim() || numberToIndianCurrencyWords(roundedAmt);

    const salaryId =
      typeof body.salaryId === "string" && mongoose.Types.ObjectId.isValid(body.salaryId)
        ? new mongoose.Types.ObjectId(body.salaryId)
        : null;
    const salaryLineItemId =
      typeof body.salaryLineItemId === "string" && mongoose.Types.ObjectId.isValid(body.salaryLineItemId)
        ? new mongoose.Types.ObjectId(body.salaryLineItemId)
        : null;
    const salaryAdvanceId =
      typeof body.salaryAdvanceId === "string" && mongoose.Types.ObjectId.isValid(body.salaryAdvanceId)
        ? new mongoose.Types.ObjectId(body.salaryAdvanceId)
        : null;

    const voucher = await AdminVoucher.create({
      voucherNo,
      date,
      monthKey,
      debitHead,
      purposeType,
      payeeName,
      employeeObjectId: empDoc?._id ?? null,
      employeeId: empDoc?.empCode || employeeId,
      siteId: siteDoc?._id ?? empDoc?.primarySiteId ?? null,
      onAccountOf: siteDoc?.siteName || onAccountOf,
      particulars,
      amount: roundedAmt,
      amountInWords,
      paymentMode,
      ...(paymentMode === "CHEQUE"
        ? {
            chequeDetails: {
              chequeNo: String(body.chequeDetails?.chequeNo || "").trim(),
              chequeDate: String(body.chequeDetails?.chequeDate || date).trim(),
              bankAccount: String(body.chequeDetails?.bankAccount || "436010200019707").trim(),
              ifsc: String(body.chequeDetails?.ifsc || "UTIB0000436").trim().toUpperCase(),
              bankName: String(body.chequeDetails?.bankName || "AXIS BANK").trim(),
              chequeAmount: Number(body.chequeDetails?.chequeAmount) || roundedAmt,
            },
          }
        : {}),
      ...(paymentMode === "BANK_TRANSFER"
        ? {
            bankTransferDetails: {
              utrNumber: String(body.bankTransferDetails?.utrNumber || "").trim(),
              bankName: String(body.bankTransferDetails?.bankName || "AXIS BANK").trim(),
              bankAccount: String(body.bankTransferDetails?.bankAccount || "").trim(),
              transferDate: String(body.bankTransferDetails?.transferDate || date).trim(),
            },
          }
        : {}),
      ...(paymentMode === "UPI"
        ? {
            upiDetails: {
              upiTransactionId: String(body.upiDetails?.upiTransactionId || "").trim(),
              upiId: String(body.upiDetails?.upiId || "").trim(),
              transferDate: String(body.upiDetails?.transferDate || date).trim(),
            },
          }
        : {}),
      salaryAdvanceId,
      salaryId,
      salaryLineItemId,
      preparedBy: String(body.preparedBy || "").trim(),
      approvedBy: String(body.approvedBy || "").trim(),
      receivedBy: String(body.receivedBy || payeeName).trim(),
      status: "POSTED",
      remarks: String(body.remarks || "").trim(),
    });

    let updatedSalary: any = null;
    if (salaryId) {
      const sal = await AdminSalary.findById(salaryId);
      if (sal) {
        sal.payoutStatus = "PAID";
        sal.status = "Processed";
        sal.paidAmount = Math.round(((sal.paidAmount || 0) + roundedAmt) * 100) / 100;
        sal.paymentMode = paymentMode;
        sal.voucherId = voucher._id;
        sal.voucherNo = voucher.voucherNo;
        await sal.save();
        updatedSalary = serializeDoc(sal);

        await AdminPayslip.findOneAndUpdate(
          { employeeId: sal.employeeId, salaryMonth: sal.month },
          { $set: { status: "Generated", generatedDate: date } }
        );
      }
    }

    if (salaryAdvanceId) {
      await AdminSalaryAdvance.findByIdAndUpdate(salaryAdvanceId, {
        $set: { voucherId: voucher._id, voucherNo: voucher.voucherNo },
      });
    }

    let updatedLineItem: any = null;
    if (salaryLineItemId) {
      const lineItem = await AdminSalaryLineItem.findById(salaryLineItemId);
      if (lineItem) {
        const nextPaid = Math.round(((lineItem.actualPaidAmount || 0) + roundedAmt) * 100) / 100;
        lineItem.actualPaidAmount = nextPaid;
        lineItem.payoutStatus = nextPaid >= lineItem.netPay ? "PAID" : "PARTIAL_PAID";
        lineItem.paymentMode = paymentMode;
        lineItem.voucherId = voucher._id;
        lineItem.voucherNo = voucher.voucherNo;
        await lineItem.save();
        updatedLineItem = serializeDoc(lineItem);

        await AdminPayslip.findOneAndUpdate(
          { employeeId: lineItem.employeeId, monthKey: lineItem.monthKey },
          {
            $set: {
              paymentMode,
              voucherNo: voucher.voucherNo,
              payoutStatus: lineItem.payoutStatus,
            },
          }
        );
      }
    }

    await logAdminActivity(
      "Payment voucher issued",
      `Voucher #${voucher.voucherNo} (${paymentMode}) ₹${voucher.amount} paid to ${payeeName}.`,
      "Payroll"
    );

    res.status(201).json({
      success: true,
      message: `Voucher #${voucher.voucherNo} issued`,
      data: {
        voucher: serializeDoc(voucher),
        ...(updatedSalary ? { salary: updatedSalary } : {}),
        ...(updatedLineItem ? { salaryLineItem: updatedLineItem } : {}),
      },
    });
  } catch (err) {
    next(err);
  }
});

vouchersAdminRouter.patch("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Voucher not found" });
      return;
    }

    const voucher = await AdminVoucher.findById(id);
    if (!voucher) {
      res.status(404).json({ success: false, message: "Voucher not found" });
      return;
    }

    const body = stripMetaFields(req.body);
    if (body.remarks !== undefined) voucher.remarks = String(body.remarks || "").trim();
    if (body.approvedBy !== undefined) voucher.approvedBy = String(body.approvedBy || "").trim();
    if (body.receivedBy !== undefined) voucher.receivedBy = String(body.receivedBy || "").trim();
    if (body.status === "CANCELLED" && voucher.status !== "CANCELLED") {
      voucher.status = "CANCELLED";
      if (voucher.salaryId) {
        const sal = await AdminSalary.findById(voucher.salaryId);
        if (sal) {
          sal.paidAmount = Math.max(0, Math.round(((sal.paidAmount || 0) - voucher.amount) * 100) / 100);
          sal.payoutStatus = "HOLD";
          sal.status = "On Hold";
          sal.voucherId = null;
          sal.voucherNo = null;
          await sal.save();
        }
      }
      if (voucher.salaryLineItemId) {
        const lineItem = await AdminSalaryLineItem.findById(voucher.salaryLineItemId);
        if (lineItem) {
          lineItem.actualPaidAmount = Math.max(
            0,
            Math.round(((lineItem.actualPaidAmount || 0) - voucher.amount) * 100) / 100
          );
          lineItem.payoutStatus = "HOLD";
          lineItem.voucherId = null;
          lineItem.voucherNo = null;
          await lineItem.save();

          await AdminPayslip.findOneAndUpdate(
            { employeeId: lineItem.employeeId, monthKey: lineItem.monthKey },
            {
              $set: {
                payoutStatus: "HOLD",
                voucherNo: null,
              },
            }
          );
        }
      }
    }

    await voucher.save();
    res.json({ success: true, data: serializeDoc(voucher) });
  } catch (err) {
    next(err);
  }
});
