import { Router, Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { AdminEmployee, AdminSite } from "../../models/admin/AdminCore.model";
import {
  AdminUniformIssue,
  AdminUniformItem,
  AdminUniformRecoveryPlan,
  AdminUniformStockLog,
  IAdminUniformItem,
  IAdminUniformRecoveryPlan,
  UNIFORM_CATEGORIES,
  UNIFORM_ISSUE_MODES,
  UNIFORM_RECOVERY_MODES,
  UNIFORM_RECOVERY_STATUSES,
  UniformCategory,
  UniformIssueMode,
  UniformRecoveryMode,
  UniformRecoveryStatus,
} from "../../models/admin/AdminOperations.model";
import {
  ensureUniformCatalogSeeded,
  UNIFORM_CATALOG_SEED,
  UNIFORM_MASTER_RATE_CARD,
} from "../../data/uniformCatalogSeed";
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

export const uniformsAdminRouter = Router();
export const uniformIssuesAdminRouter = Router();
export const stockLogsAdminRouter = Router();
export const uniformRecoveryPlansAdminRouter = Router();

function isValidUniformCategory(value: unknown): value is UniformCategory {
  return (
    typeof value === "string" &&
    (UNIFORM_CATEGORIES as readonly string[]).includes(value)
  );
}

function deriveUniformItemName(category: string, subCategory?: string): string {
  const cleanSub = typeof subCategory === "string" ? subCategory.trim() : "";
  return cleanSub || category.trim();
}

function formatOriginalIdCustody(
  custody?: {
    inCustody?: boolean;
    documentType?: string;
    referenceNo?: string;
    depositedDate?: string;
    notes?: string;
  } | null
): string {
  if (!custody || !custody.inCustody) return "";
  const doc = (custody.documentType || "Original ID").trim();
  const ref = custody.referenceNo ? ` (${custody.referenceNo.trim()})` : "";
  const dt = custody.depositedDate ? ` · ${custody.depositedDate.trim()}` : "";
  return `${doc}${ref}${dt}`;
}

function parseNonNegativeNumber(raw: unknown, defaultValue?: number): number | null {
  if (raw === undefined) {
    return defaultValue !== undefined ? defaultValue : null;
  }
  if (raw === null || (typeof raw === "string" && raw.trim() === "")) {
    return null;
  }
  const num = Number(raw);
  return Number.isFinite(num) && num >= 0 ? num : null;
}

function normalizeMonthKey(raw: unknown, fallbackDate: string): string {
  const clean = typeof raw === "string" ? raw.trim() : "";
  if (/^\d{4}-\d{2}$/.test(clean)) return clean;
  return /^\d{4}-\d{2}/.test(fallbackDate) ? fallbackDate.slice(0, 7) : todayIso().slice(0, 7);
}

function computeMonthlyEmi(
  totalCharge: number,
  recoveryMode: UniformRecoveryMode,
  installmentCount: number,
  customMonthlyAmount?: number | null
): { installmentCount: number; monthlyAmount: number } {
  const cleanTotal = Math.max(0, Math.round(totalCharge * 100) / 100);
  if (recoveryMode === "NO_RECOVERY" || cleanTotal === 0) {
    return { installmentCount: 1, monthlyAmount: 0 };
  }
  if (recoveryMode === "ONE_TIME") {
    return { installmentCount: 1, monthlyAmount: cleanTotal };
  }
  if (recoveryMode === "FIXED_MONTHLY") {
    const fixed =
      customMonthlyAmount && customMonthlyAmount > 0
        ? Math.min(cleanTotal, Math.round(customMonthlyAmount * 100) / 100)
        : cleanTotal;
    const count = fixed > 0 ? Math.max(1, Math.ceil(cleanTotal / fixed)) : 1;
    return { installmentCount: count, monthlyAmount: fixed };
  }
  const count = Math.max(1, Math.min(36, Math.round(installmentCount) || 1));
  const monthly = Math.round((cleanTotal / count) * 100) / 100;
  return { installmentCount: count, monthlyAmount: monthly };
}

interface IssueLineInput {
  itemId: string;
  quantity: number;
  unitPrice: number | null;
}

function buildIssueRecordPayload(params: {
  batchId?: string;
  issueMode: UniformIssueMode;
  serialNo: string;
  siteId?: mongoose.Types.ObjectId | null;
  employeeObjectId?: mongoose.Types.ObjectId | null;
  employeeId: string;
  legacyEmpCode: string;
  employeeName: string;
  mobile: string;
  site: string;
  item: IAdminUniformItem;
  quantity: number;
  unitPrice: number;
  registrationCharge: number;
  issueDate: string;
  issuedBy: string;
  receivedBy: string;
  verifiedBy: string;
  originalDocHeld: string;
  billToSite: boolean;
  recoveryPlanId?: mongoose.Types.ObjectId | null;
  remarks: string;
}) {
  const itemName = deriveUniformItemName(params.item.category, params.item.subCategory) || params.item.name;
  const totalAmount = params.quantity * params.unitPrice + params.registrationCharge;
  return {
    issue: {
      batchId: params.batchId || "",
      issueMode: params.issueMode,
      serialNo: params.serialNo,
      siteId: params.siteId ?? null,
      employeeObjectId: params.employeeObjectId ?? null,
      employeeId: params.employeeId,
      legacyEmpCode: params.legacyEmpCode,
      employeeName: params.employeeName,
      mobile: params.mobile,
      site: params.site,
      itemId: String(params.item._id),
      itemName,
      category: params.item.category,
      subCategory: params.item.subCategory || "",
      size: params.item.size,
      quantity: params.quantity,
      returnedQty: 0,
      returnedAmount: 0,
      unitPrice: params.unitPrice,
      registrationCharge: params.registrationCharge,
      totalAmount,
      issueDate: params.issueDate,
      issuedBy: params.issuedBy,
      receivedBy: params.receivedBy,
      verifiedBy: params.verifiedBy,
      originalDocHeld: params.originalDocHeld,
      billToSite: params.billToSite,
      recoveryPlanId: params.recoveryPlanId ?? null,
      remarks: params.remarks,
      status: "Issued" as const,
    },
    stockLog: {
      itemName,
      action: "Issued" as const,
      quantity: params.quantity,
      date: params.issueDate,
      note:
        params.issueMode === "BULK_SITE"
          ? `Bulk site issue to ${params.site}${params.receivedBy ? ` (Received by ${params.receivedBy})` : ""}`
          : `Issued to ${params.employeeName} (${params.employeeId})`,
    },
  };
}

// ─── Uniform Inventory (/api/admin/uniforms) ──────────────────
uniformsAdminRouter.get("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    await ensureUniformCatalogSeeded();

    const { category, search } = req.query;
    const filter: Record<string, any> = {};

    if (typeof category === "string" && category !== "All") {
      filter.category = category;
    }
    if (typeof search === "string" && search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), "i");
      filter.$or = [
        { name: regex },
        { category: regex },
        { subCategory: regex },
        { size: regex },
      ];
    }

    const items = await AdminUniformItem.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    res.json({ success: true, count: items.length, data: items.map(serializeDoc) });
  } catch (err) {
    next(err);
  }
});

uniformsAdminRouter.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { category, subCategory = "", size, unitPrice = 0, availableQty = 0 } = req.body;
    const cleanCategory = typeof category === "string" ? category.trim() : "";
    const cleanSubCategory = typeof subCategory === "string" ? subCategory.trim() : String(subCategory ?? "").trim();
    const cleanSize = typeof size === "string" ? size.trim() : String(size ?? "").trim();

    if (!isValidUniformCategory(cleanCategory) || !cleanSize) {
      res.status(400).json({
        success: false,
        message: "Required fields: valid category and non-empty size",
      });
      return;
    }

    const parsedUnitPrice = parseNonNegativeNumber(unitPrice, 0);
    if (parsedUnitPrice === null) {
      res.status(400).json({
        success: false,
        message: "unitPrice must be a non-negative number",
      });
      return;
    }

    const parsedQty = parseNonNegativeNumber(availableQty, 0);
    if (parsedQty === null) {
      res.status(400).json({
        success: false,
        message: "availableQty must be a non-negative number",
      });
      return;
    }

    const derivedName = deriveUniformItemName(cleanCategory, cleanSubCategory);
    const today = todayIso();

    const item = await AdminUniformItem.create({
      name: derivedName,
      category: cleanCategory,
      subCategory: cleanSubCategory,
      size: cleanSize,
      unitPrice: parsedUnitPrice,
      availableQty: parsedQty,
      issuedQty: 0,
      lastUpdated: today,
    });

    await AdminUniformStockLog.create({
      itemName: item.name,
      action: "Added",
      quantity: parsedQty,
      date: today,
      note: `Initial stock (${item.size})`,
    });

    await logAdminActivity(
      "Uniform item added",
      `${item.name} (${parsedQty} units) added to stock.`,
      "Uniforms"
    );

    res.status(201).json({
      success: true,
      message: "Uniform item added successfully",
      data: serializeDoc(item),
    });
  } catch (err) {
    next(err);
  }
});

uniformsAdminRouter.patch("/:id/stock", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Uniform item not found" });
      return;
    }

    const { delta, note = "Manual stock update" } = req.body;
    const numericDelta = Number(delta);
    if (
      delta === undefined ||
      delta === null ||
      (typeof delta === "string" && delta.trim() === "") ||
      !Number.isFinite(numericDelta)
    ) {
      res.status(400).json({ success: false, message: "delta must be a valid number" });
      return;
    }

    const item = await AdminUniformItem.findById(id);
    if (!item) {
      res.status(404).json({ success: false, message: "Uniform item not found" });
      return;
    }

    item.availableQty = Math.max(0, item.availableQty + numericDelta);
    item.lastUpdated = todayIso();
    await item.save();

    const cleanNote =
      (typeof note === "string" ? note.trim() : String(note ?? "").trim()) || "Manual stock update";

    const stockLog = await AdminUniformStockLog.create({
      itemName: item.name,
      action: "Restocked",
      quantity: numericDelta,
      date: item.lastUpdated,
      note: cleanNote,
    });

    await logAdminActivity(
      "Uniform stock updated",
      `${item.name} adjusted by ${numericDelta >= 0 ? `+${numericDelta}` : numericDelta} units.`,
      "Uniforms"
    );

    res.json({
      success: true,
      message: "Uniform stock updated successfully",
      data: serializeDoc(item),
      stockLog: serializeDoc(stockLog),
    });
  } catch (err) {
    next(err);
  }
});

uniformsAdminRouter.patch("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Uniform item not found" });
      return;
    }

    const item = await AdminUniformItem.findById(id);
    if (!item) {
      res.status(404).json({ success: false, message: "Uniform item not found" });
      return;
    }

    const body = stripMetaFields(req.body);
    const prevCategory = item.category;
    const prevSubCategory = item.subCategory || "";
    const prevUnitPrice = item.unitPrice ?? 0;

    if (body.category !== undefined) {
      const nextCategory = typeof body.category === "string" ? body.category.trim() : "";
      if (!isValidUniformCategory(nextCategory)) {
        res.status(400).json({
          success: false,
          message: "Invalid uniform category",
        });
        return;
      }
      item.category = nextCategory;
    }

    if (body.subCategory !== undefined) {
      item.subCategory =
        typeof body.subCategory === "string"
          ? body.subCategory.trim()
          : String(body.subCategory ?? "").trim();
    }

    if (body.size !== undefined) {
      const nextSize = typeof body.size === "string" ? body.size.trim() : String(body.size ?? "").trim();
      if (!nextSize) {
        res.status(400).json({ success: false, message: "size cannot be empty" });
        return;
      }
      item.size = nextSize;
    }

    if (body.unitPrice !== undefined) {
      const nextPrice = parseNonNegativeNumber(body.unitPrice);
      if (nextPrice === null) {
        res.status(400).json({ success: false, message: "unitPrice must be a non-negative number" });
        return;
      }
      item.unitPrice = nextPrice;
    }

    if (body.availableQty !== undefined) {
      const nextQty = parseNonNegativeNumber(body.availableQty);
      if (nextQty === null) {
        res.status(400).json({ success: false, message: "availableQty must be a non-negative number" });
        return;
      }
      item.availableQty = nextQty;
    }

    if (body.category !== undefined || body.subCategory !== undefined || !item.name) {
      item.name = deriveUniformItemName(item.category, item.subCategory);
    }

    item.lastUpdated = todayIso();
    await item.save();

    if (
      item.unitPrice !== prevUnitPrice ||
      item.category !== prevCategory ||
      (item.subCategory || "") !== prevSubCategory
    ) {
      await logAdminActivity(
        "Uniform item updated",
        `Updated ${item.name} (${item.category}, ₹${item.unitPrice}).`,
        "Uniforms"
      );
    }

    res.json({ success: true, data: serializeDoc(item) });
  } catch (err) {
    next(err);
  }
});

uniformsAdminRouter.post(
  "/sync-rate-card",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await ensureUniformCatalogSeeded();
      const overwriteAll = req.body?.overwriteAll === true;
      const items = await AdminUniformItem.find();
      const existingCats = new Set(items.map((i) => i.category));
      const today = todayIso();
      let updatedCount = 0;

      for (const item of items) {
        const masterPrice = UNIFORM_MASTER_RATE_CARD[item.category];
        if (masterPrice === undefined) continue;
        if (overwriteAll || item.unitPrice === 0) {
          if (item.unitPrice !== masterPrice) {
            item.unitPrice = masterPrice;
            item.lastUpdated = today;
            await item.save();
            updatedCount++;
          }
        }
      }

      const missingDocs = UNIFORM_CATALOG_SEED.filter((entry) => !existingCats.has(entry.category)).map(
        (entry) => ({
          name: entry.subCategory || entry.category,
          category: entry.category,
          subCategory: entry.subCategory,
          size: entry.size,
          unitPrice: UNIFORM_MASTER_RATE_CARD[entry.category] ?? entry.unitPrice,
          availableQty: entry.availableQty,
          issuedQty: 0,
          lastUpdated: today,
        })
      );

      let createdCount = 0;
      if (missingDocs.length > 0) {
        await AdminUniformItem.insertMany(missingDocs);
        createdCount = missingDocs.length;
      }

      const refreshed = await AdminUniformItem.find().sort({ createdAt: -1 }).limit(500).lean();
      await logAdminActivity(
        "Dress rate card synced",
        `Updated ${updatedCount} SKU price(s), added ${createdCount} missing standard category SKU(s).`,
        "Uniforms"
      );

      res.json({
        success: true,
        message: "Master dress charge rate card synced successfully",
        data: {
          updatedCount,
          createdCount,
          uniforms: refreshed.map(serializeDoc),
          rateCard: UNIFORM_MASTER_RATE_CARD,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

uniformsAdminRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Uniform item not found" });
      return;
    }

    const deleted = await AdminUniformItem.findByIdAndDelete(id);
    if (!deleted) {
      res.status(404).json({ success: false, message: "Uniform item not found" });
      return;
    }
    res.json({ success: true, message: "Uniform item deleted", data: serializeDoc(deleted) });
  } catch (err) {
    next(err);
  }
});

// ─── Uniform Issues (/api/admin/uniform-issues) ───────────────
uniformIssuesAdminRouter.get("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, issueMode, site, search } = req.query;
    const filter: Record<string, any> = {};
    if (typeof status === "string" && status !== "All") {
      filter.status = status;
    }
    if (typeof issueMode === "string" && (UNIFORM_ISSUE_MODES as readonly string[]).includes(issueMode)) {
      filter.issueMode = issueMode;
    }
    if (typeof site === "string" && site.trim() && site !== "All") {
      filter.site = new RegExp(`^${escapeRegex(site.trim())}$`, "i");
    }
    if (typeof search === "string" && search.trim()) {
      const rx = new RegExp(escapeRegex(search.trim()), "i");
      filter.$or = [
        { employeeName: rx },
        { employeeId: rx },
        { legacyEmpCode: rx },
        { site: rx },
        { itemName: rx },
        { serialNo: rx },
      ];
    }

    const usePagination = req.query.page !== undefined || req.query.limit !== undefined;
    if (usePagination) {
      const { page, limit, skip } = parsePaginationParams(req.query, 50, 250);
      const [issues, total] = await Promise.all([
        AdminUniformIssue.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        AdminUniformIssue.countDocuments(filter),
      ]);
      res.json({
        success: true,
        count: issues.length,
        pagination: buildPaginationMeta(page, limit, total),
        data: issues.map(serializeDoc),
      });
      return;
    }

    const issues = await AdminUniformIssue.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    res.json({ success: true, count: issues.length, data: issues.map(serializeDoc) });
  } catch (err) {
    next(err);
  }
});

uniformIssuesAdminRouter.post(
  "/batch",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const {
        issueMode: rawIssueMode = "INDIVIDUAL",
        serialNo = "",
        employeeId = "",
        legacyEmpCode = "",
        employeeName = "",
        mobile = "",
        site = "",
        issueDate,
        registrationCharge = 0,
        issuedBy = "",
        receivedBy = "",
        verifiedBy = "",
        originalDocHeld = "",
        billToSite,
        remarks = "",
        items,
        recoveryPlan: rawRecoveryPlan,
      } = req.body;

      const issueMode: UniformIssueMode =
        rawIssueMode === "BULK_SITE" ? "BULK_SITE" : "INDIVIDUAL";

      const cleanSite = typeof site === "string" ? site.trim() : String(site ?? "").trim();
      const cleanReceivedBy = typeof receivedBy === "string" ? receivedBy.trim() : "";
      const cleanIssuedBy = typeof issuedBy === "string" ? issuedBy.trim() : "";
      const cleanVerifiedBy = typeof verifiedBy === "string" ? verifiedBy.trim() : "";
      const cleanSerialNo = typeof serialNo === "string" ? serialNo.trim() : String(serialNo ?? "").trim();
      const cleanLegacyCode = typeof legacyEmpCode === "string" ? legacyEmpCode.trim() : "";
      const cleanMobile = typeof mobile === "string" ? mobile.trim() : "";
      const cleanOrigDoc = typeof originalDocHeld === "string" ? originalDocHeld.trim() : "";
      const cleanRemarks = typeof remarks === "string" ? remarks.trim() : String(remarks ?? "").trim();

      const rawEmpId = typeof employeeId === "string" ? employeeId.trim().toUpperCase() : String(employeeId ?? "").trim().toUpperCase();
      const rawEmpName = typeof employeeName === "string" ? employeeName.trim() : String(employeeName ?? "").trim();

      const cleanEmployeeId =
        rawEmpId || (issueMode === "BULK_SITE" ? "BULK-SITE" : "");
      const cleanEmployeeName =
        rawEmpName ||
        (issueMode === "BULK_SITE"
          ? cleanReceivedBy || `${cleanSite} Unit Stock`
          : "");

      if (!cleanEmployeeId || !cleanEmployeeName || !cleanSite || !Array.isArray(items) || items.length === 0) {
        res.status(400).json({
          success: false,
          message:
            issueMode === "BULK_SITE"
              ? "Required fields: site, receiver/unit name, and a non-empty items array"
              : "Required fields: employeeId, employeeName, site, and a non-empty items array",
        });
        return;
      }

      const [siteDoc, empDoc] = await Promise.all([
        AdminSite.findOne({ siteName: new RegExp(`^${escapeRegex(cleanSite)}$`, "i") }).lean(),
        issueMode === "INDIVIDUAL"
          ? AdminEmployee.findOne({
              $or: [
                ...(cleanEmployeeId ? [{ empCode: cleanEmployeeId }] : []),
                ...(cleanLegacyCode ? [{ legacyEmpCode: cleanLegacyCode }] : []),
                ...(cleanEmployeeName
                  ? [{ fullName: new RegExp(`^${escapeRegex(cleanEmployeeName)}$`, "i") }]
                  : []),
              ],
            }).lean()
          : Promise.resolve(null),
      ]);

      const regCharge = parseNonNegativeNumber(registrationCharge, 0);
      if (regCharge === null) {
        res.status(400).json({
          success: false,
          message: "registrationCharge must be a non-negative number",
        });
        return;
      }

      const normalizedLines: IssueLineInput[] = [];
      for (const rawLine of items) {
        const lineItemId = typeof rawLine?.itemId === "string" ? rawLine.itemId.trim() : String(rawLine?.itemId ?? "").trim();
        if (!lineItemId || !mongoose.Types.ObjectId.isValid(lineItemId)) {
          res.status(400).json({
            success: false,
            message: "Each item must include a valid itemId",
          });
          return;
        }

        const qty = Number(rawLine?.quantity);
        if (!Number.isInteger(qty) || qty < 1) {
          res.status(400).json({
            success: false,
            message: "Each item must have an integer quantity >= 1",
          });
          return;
        }

        let parsedLinePrice: number | null = null;
        if (rawLine?.unitPrice !== undefined) {
          parsedLinePrice = parseNonNegativeNumber(rawLine.unitPrice);
          if (parsedLinePrice === null) {
            res.status(400).json({
              success: false,
              message: "Each item unitPrice must be a non-negative number",
            });
            return;
          }
        }

        normalizedLines.push({
          itemId: lineItemId,
          quantity: qty,
          unitPrice: parsedLinePrice,
        });
      }

      // Aggregate quantities per itemId and validate all items & stock before mutating any stock
      const requestedByItem = new Map<string, number>();
      for (const line of normalizedLines) {
        requestedByItem.set(line.itemId, (requestedByItem.get(line.itemId) ?? 0) + line.quantity);
      }

      const itemDocs = await AdminUniformItem.find({
        _id: { $in: Array.from(requestedByItem.keys()) },
      });
      const itemMap = new Map<string, IAdminUniformItem>(
        itemDocs.map((doc) => [String(doc._id), doc])
      );

      for (const [itemId, totalRequested] of requestedByItem.entries()) {
        const item = itemMap.get(itemId);
        if (!item) {
          res.status(404).json({
            success: false,
            message: `Uniform item not found (${itemId})`,
          });
          return;
        }
        if (item.availableQty < totalRequested) {
          const label = deriveUniformItemName(item.category, item.subCategory) || item.name;
          res.status(400).json({
            success: false,
            message: `Insufficient stock for ${label} (${item.size}): available ${item.availableQty}, requested ${totalRequested}`,
          });
          return;
        }
      }

      const today = todayIso();
      const effectiveDate = issueDate && String(issueDate).trim() ? String(issueDate).trim() : today;
      const updatedUniforms: IAdminUniformItem[] = [];
      const appliedDeductions: Array<{ itemId: string; qty: number }> = [];

      for (const [itemId, totalRequested] of requestedByItem.entries()) {
        const updated = await AdminUniformItem.findOneAndUpdate(
          { _id: itemId, availableQty: { $gte: totalRequested } },
          {
            $inc: { availableQty: -totalRequested, issuedQty: totalRequested },
            $set: { lastUpdated: today },
          },
          { new: true }
        );

        if (!updated) {
          await Promise.all(
            appliedDeductions.map((d) =>
              AdminUniformItem.findByIdAndUpdate(d.itemId, {
                $inc: { availableQty: d.qty, issuedQty: -d.qty },
              })
            )
          );
          const item = itemMap.get(itemId)!;
          const label = deriveUniformItemName(item.category, item.subCategory) || item.name;
          res.status(409).json({
            success: false,
            message: `Insufficient stock for ${label} (${item.size})`,
          });
          return;
        }

        appliedDeductions.push({ itemId, qty: totalRequested });
        updatedUniforms.push(updated);
      }

      const batchId = `BATCH-${Date.now().toString(36).toUpperCase()}-${Math.random()
        .toString(36)
        .slice(2, 6)
        .toUpperCase()}`;

      const resolvedEmpId = empDoc?.empCode || cleanEmployeeId;
      const resolvedLegacy = cleanLegacyCode || empDoc?.legacyEmpCode || "";
      const resolvedMobile = cleanMobile || empDoc?.mobile || "";
      const resolvedOrigDoc = cleanOrigDoc || formatOriginalIdCustody(empDoc?.originalIdCustody);
      const resolvedBillToSite = typeof billToSite === "boolean" ? billToSite : issueMode === "BULK_SITE";

      const prebuiltLines = normalizedLines.map((line, index) => {
        const item = itemMap.get(line.itemId)!;
        const unitPrice = line.unitPrice !== null ? line.unitPrice : item.unitPrice ?? 0;
        const lineRegCharge = index === 0 ? regCharge : 0;
        return {
          item,
          quantity: line.quantity,
          unitPrice,
          lineRegCharge,
          totalAmount: line.quantity * unitPrice + lineRegCharge,
        };
      });

      const batchTotalCharge = Number(
        prebuiltLines.reduce((sum, l) => sum + l.totalAmount, 0).toFixed(2)
      );

      // Build installment recovery plan when issuing to an individual employee unless NO_RECOVERY / disabled
      const reqPlan = rawRecoveryPlan && typeof rawRecoveryPlan === "object" ? rawRecoveryPlan : null;
      const requestedMode = String(reqPlan?.recoveryMode || "ONE_TIME").toUpperCase();
      const validMode: UniformRecoveryMode = (UNIFORM_RECOVERY_MODES as readonly string[]).includes(requestedMode)
        ? (requestedMode as UniformRecoveryMode)
        : "ONE_TIME";

      const shouldCreatePlan =
        issueMode === "INDIVIDUAL" &&
        !resolvedBillToSite &&
        batchTotalCharge > 0 &&
        validMode !== "NO_RECOVERY" &&
        reqPlan?.createPlan !== false;

      let recoveryPlanDoc: IAdminUniformRecoveryPlan | null = null;
      if (shouldCreatePlan) {
        const schedule = computeMonthlyEmi(
          batchTotalCharge,
          validMode,
          Number(reqPlan?.installmentCount) || 1,
          reqPlan?.monthlyAmount !== undefined ? Number(reqPlan.monthlyAmount) : null
        );
        const startMonth = normalizeMonthKey(reqPlan?.startMonth, effectiveDate);
        recoveryPlanDoc = await AdminUniformRecoveryPlan.create({
          batchId,
          issueIds: [],
          employeeObjectId: empDoc?._id ?? null,
          employeeId: resolvedEmpId,
          legacyEmpCode: resolvedLegacy,
          employeeName: cleanEmployeeName,
          siteId: siteDoc?._id ?? empDoc?.primarySiteId ?? null,
          siteName: siteDoc?.siteName || cleanSite,
          totalCharge: batchTotalCharge,
          recoveryMode: validMode,
          installmentCount: schedule.installmentCount,
          monthlyAmount: schedule.monthlyAmount,
          startMonth,
          recoveredAmount: 0,
          creditedAmount: 0,
          remainingBalance: batchTotalCharge,
          status: "ACTIVE",
          lastDeductedMonth: "",
          installmentHistory: [],
          remarks:
            typeof reqPlan?.remarks === "string" && reqPlan.remarks.trim()
              ? reqPlan.remarks.trim()
              : cleanRemarks,
        });
      }

      const builtPayloads = prebuiltLines.map((line) =>
        buildIssueRecordPayload({
          batchId,
          issueMode,
          serialNo: cleanSerialNo,
          siteId: siteDoc?._id ?? empDoc?.primarySiteId ?? null,
          employeeObjectId: empDoc?._id ?? null,
          employeeId: resolvedEmpId,
          legacyEmpCode: resolvedLegacy,
          employeeName: cleanEmployeeName,
          mobile: resolvedMobile,
          site: siteDoc?.siteName || cleanSite,
          item: line.item,
          quantity: line.quantity,
          unitPrice: line.unitPrice,
          registrationCharge: line.lineRegCharge,
          issueDate: effectiveDate,
          issuedBy: cleanIssuedBy,
          receivedBy: cleanReceivedBy || (issueMode === "INDIVIDUAL" ? cleanEmployeeName : ""),
          verifiedBy: cleanVerifiedBy,
          originalDocHeld: resolvedOrigDoc,
          billToSite: resolvedBillToSite,
          recoveryPlanId: recoveryPlanDoc?._id ?? null,
          remarks: cleanRemarks,
        })
      );

      const createdIssues = await AdminUniformIssue.insertMany(
        builtPayloads.map((p) => p.issue)
      );
      const createdStockLogs = await AdminUniformStockLog.insertMany(
        builtPayloads.map((p) => p.stockLog)
      );

      if (recoveryPlanDoc) {
        recoveryPlanDoc.issueIds = createdIssues.map((iss) => String(iss._id));
        await recoveryPlanDoc.save();
      }

      await logAdminActivity(
        issueMode === "BULK_SITE" ? "Bulk site uniform issued" : "Uniform kit issued",
        issueMode === "BULK_SITE"
          ? `Bulk issued ${normalizedLines.length} item line(s) to site ${cleanSite}.`
          : `Issued ${normalizedLines.length} item line(s) to ${cleanEmployeeName} (${resolvedEmpId}).`,
        "Uniforms"
      );

      res.status(201).json({
        success: true,
        message: "Uniform kit issued successfully",
        data: {
          issues: createdIssues.map(serializeDoc),
          uniforms: updatedUniforms.map(serializeDoc),
          stockLogs: createdStockLogs.map(serializeDoc),
          ...(recoveryPlanDoc ? { recoveryPlan: serializeDoc(recoveryPlanDoc) } : {}),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

uniformIssuesAdminRouter.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      issueMode: rawIssueMode = "INDIVIDUAL",
      serialNo = "",
      employeeId,
      legacyEmpCode = "",
      employeeName,
      mobile = "",
      site,
      itemId,
      quantity,
      issueDate,
      unitPrice,
      registrationCharge = 0,
      issuedBy = "",
      receivedBy = "",
      verifiedBy = "",
      originalDocHeld = "",
      billToSite,
      remarks = "",
      batchId = "",
    } = req.body;

    const issueMode: UniformIssueMode =
      rawIssueMode === "BULK_SITE" ? "BULK_SITE" : "INDIVIDUAL";

    const cleanEmployeeId = typeof employeeId === "string" ? employeeId.trim().toUpperCase() : String(employeeId ?? "").trim().toUpperCase();
    const cleanEmployeeName = typeof employeeName === "string" ? employeeName.trim() : String(employeeName ?? "").trim();
    const cleanSite = typeof site === "string" ? site.trim() : String(site ?? "").trim();
    const cleanItemId = typeof itemId === "string" ? itemId.trim() : String(itemId ?? "").trim();
    const cleanRemarks = typeof remarks === "string" ? remarks.trim() : String(remarks ?? "").trim();
    const cleanBatchId = typeof batchId === "string" ? batchId.trim() : "";
    const qty = Number(quantity);

    if (!cleanEmployeeId || !cleanEmployeeName || !cleanSite || !cleanItemId || !Number.isInteger(qty) || qty < 1) {
      res.status(400).json({
        success: false,
        message: "Required fields: employeeId, employeeName, site, itemId, quantity (>= 1)",
      });
      return;
    }

    if (!mongoose.Types.ObjectId.isValid(cleanItemId)) {
      res.status(404).json({ success: false, message: "Uniform item not found" });
      return;
    }

    const parsedRegCharge = parseNonNegativeNumber(registrationCharge, 0);
    if (parsedRegCharge === null) {
      res.status(400).json({
        success: false,
        message: "registrationCharge must be a non-negative number",
      });
      return;
    }

    let parsedUnitPrice: number | null = null;
    if (unitPrice !== undefined) {
      parsedUnitPrice = parseNonNegativeNumber(unitPrice);
      if (parsedUnitPrice === null) {
        res.status(400).json({
          success: false,
          message: "unitPrice must be a non-negative number",
        });
        return;
      }
    }

    const item = await AdminUniformItem.findById(cleanItemId);
    if (!item) {
      res.status(404).json({ success: false, message: "Uniform item not found" });
      return;
    }
    if (item.availableQty < qty) {
      res.status(400).json({
        success: false,
        message: `Insufficient stock for ${item.name} (available: ${item.availableQty})`,
      });
      return;
    }

    const [siteDoc, empDoc] = await Promise.all([
      AdminSite.findOne({ siteName: new RegExp(`^${escapeRegex(cleanSite)}$`, "i") }).lean(),
      issueMode === "INDIVIDUAL"
        ? AdminEmployee.findOne({
            $or: [
              { empCode: cleanEmployeeId },
              ...(legacyEmpCode ? [{ legacyEmpCode: String(legacyEmpCode).trim() }] : []),
            ],
          }).lean()
        : Promise.resolve(null),
    ]);

    const today = todayIso();
    const effectiveDate = issueDate && String(issueDate).trim() ? String(issueDate).trim() : today;

    const updatedItem = await AdminUniformItem.findOneAndUpdate(
      { _id: cleanItemId, availableQty: { $gte: qty } },
      {
        $inc: { availableQty: -qty, issuedQty: qty },
        $set: { lastUpdated: today },
      },
      { new: true }
    );

    if (!updatedItem) {
      res.status(400).json({
        success: false,
        message: `Insufficient stock for ${item.name}`,
      });
      return;
    }

    const effectiveUnitPrice = parsedUnitPrice !== null ? parsedUnitPrice : updatedItem.unitPrice ?? 0;
    const built = buildIssueRecordPayload({
      batchId: cleanBatchId,
      issueMode,
      serialNo: typeof serialNo === "string" ? serialNo.trim() : "",
      siteId: siteDoc?._id ?? empDoc?.primarySiteId ?? null,
      employeeObjectId: empDoc?._id ?? null,
      employeeId: empDoc?.empCode || cleanEmployeeId,
      legacyEmpCode: (typeof legacyEmpCode === "string" ? legacyEmpCode.trim() : "") || empDoc?.legacyEmpCode || "",
      employeeName: cleanEmployeeName,
      mobile: (typeof mobile === "string" ? mobile.trim() : "") || empDoc?.mobile || "",
      site: siteDoc?.siteName || cleanSite,
      item: updatedItem,
      quantity: qty,
      unitPrice: effectiveUnitPrice,
      registrationCharge: parsedRegCharge,
      issueDate: effectiveDate,
      issuedBy: typeof issuedBy === "string" ? issuedBy.trim() : "",
      receivedBy: typeof receivedBy === "string" ? receivedBy.trim() : "",
      verifiedBy: typeof verifiedBy === "string" ? verifiedBy.trim() : "",
      originalDocHeld:
        (typeof originalDocHeld === "string" ? originalDocHeld.trim() : "") ||
        formatOriginalIdCustody(empDoc?.originalIdCustody),
      billToSite: typeof billToSite === "boolean" ? billToSite : issueMode === "BULK_SITE",
      remarks: cleanRemarks,
    });

    const issue = await AdminUniformIssue.create(built.issue);
    await AdminUniformStockLog.create(built.stockLog);

    await logAdminActivity(
      "Uniform issued",
      `${qty}× ${issue.itemName} issued to ${issue.employeeName}.`,
      "Uniforms"
    );

    res.status(201).json({
      success: true,
      message: "Uniform issued successfully",
      data: serializeDoc(issue),
    });
  } catch (err) {
    next(err);
  }
});

uniformIssuesAdminRouter.patch("/:id/return", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Uniform issue record not found" });
      return;
    }

    const issue = await AdminUniformIssue.findById(id);
    if (!issue) {
      res.status(404).json({ success: false, message: "Uniform issue record not found" });
      return;
    }
    const alreadyReturned = issue.returnedQty ?? 0;
    const outstandingQty = Math.max(0, issue.quantity - alreadyReturned);
    if (issue.status === "Returned" || outstandingQty <= 0) {
      res.status(400).json({ success: false, message: "Uniform has already been returned" });
      return;
    }

    const reqQty = req.body?.returnQty;
    const qtyToReturn =
      reqQty !== undefined && reqQty !== null && String(reqQty).trim() !== ""
        ? Number(reqQty)
        : outstandingQty;

    if (!Number.isInteger(qtyToReturn) || qtyToReturn < 1 || qtyToReturn > outstandingQty) {
      res.status(400).json({
        success: false,
        message: `returnQty must be an integer between 1 and ${outstandingQty}`,
      });
      return;
    }

    const today =
      typeof req.body?.returnDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.body.returnDate.trim())
        ? req.body.returnDate.trim()
        : todayIso();

    const creditAmount = Number((qtyToReturn * (issue.unitPrice ?? 0)).toFixed(2));
    issue.returnedQty = alreadyReturned + qtyToReturn;
    issue.returnedAmount = Number(((issue.returnedAmount ?? 0) + creditAmount).toFixed(2));
    issue.returnDate = today;
    if (issue.returnedQty >= issue.quantity) {
      issue.status = "Returned";
    }
    if (typeof req.body?.remarks === "string" && req.body.remarks.trim()) {
      issue.remarks = [issue.remarks, req.body.remarks.trim()].filter(Boolean).join(" | ");
    }
    await issue.save();

    let updatedItem: IAdminUniformItem | null = null;
    if (mongoose.Types.ObjectId.isValid(issue.itemId)) {
      const item = await AdminUniformItem.findById(issue.itemId);
      if (item) {
        item.availableQty += qtyToReturn;
        item.issuedQty = Math.max(0, item.issuedQty - qtyToReturn);
        item.lastUpdated = today;
        updatedItem = await item.save();
      }
    }

    let updatedPlan: IAdminUniformRecoveryPlan | null = null;
    if (creditAmount > 0 && (issue.recoveryPlanId || issue.batchId)) {
      const plan = issue.recoveryPlanId
        ? await AdminUniformRecoveryPlan.findById(issue.recoveryPlanId)
        : await AdminUniformRecoveryPlan.findOne({ batchId: issue.batchId, status: { $in: ["ACTIVE", "PAUSED"] } });

      if (plan && plan.remainingBalance > 0) {
        const appliedCredit = Math.min(plan.remainingBalance, creditAmount);
        plan.creditedAmount = Number((plan.creditedAmount + appliedCredit).toFixed(2));
        plan.remainingBalance = Math.max(
          0,
          Number((plan.totalCharge - plan.recoveredAmount - plan.creditedAmount).toFixed(2))
        );
        plan.installmentHistory.push({
          monthKey: today.slice(0, 7),
          scheduledAmount: 0,
          deductedAmount: appliedCredit,
          balanceAfter: plan.remainingBalance,
          source: "RETURN_CREDIT",
          note: `Returned ${qtyToReturn}× ${issue.itemName}`,
          recordedAt: today,
        });
        if (plan.remainingBalance <= 0) {
          plan.status = "SETTLED";
        }
        updatedPlan = await plan.save();
      }
    }

    const stockLog = await AdminUniformStockLog.create({
      itemName: issue.itemName,
      action: "Returned",
      quantity: qtyToReturn,
      date: today,
      note: `Returned ${qtyToReturn}/${issue.quantity} by ${issue.employeeName} (${issue.employeeId})`,
    });

    await logAdminActivity(
      "Uniform returned",
      `${qtyToReturn}× ${issue.itemName} returned by ${issue.employeeName}.`,
      "Uniforms"
    );

    res.json({
      success: true,
      message: issue.status === "Returned" ? "Uniform marked as returned" : "Partial return recorded",
      data: {
        issue: serializeDoc(issue),
        uniform: updatedItem ? serializeDoc(updatedItem) : null,
        stockLog: serializeDoc(stockLog),
        ...(updatedPlan ? { recoveryPlan: serializeDoc(updatedPlan) } : {}),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── Stock Logs (/api/admin/stock-logs) ───────────────────────
stockLogsAdminRouter.get("/", async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const logs = await AdminUniformStockLog.find().sort({ createdAt: -1 }).limit(500).lean();
    res.json({ success: true, count: logs.length, data: logs.map(serializeDoc) });
  } catch (err) {
    next(err);
  }
});

// ─── Uniform Recovery / EMI Plans (/api/admin/uniform-recovery-plans) ────────
uniformRecoveryPlansAdminRouter.get(
  "/payroll-preview",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const month = normalizeMonthKey(req.query.month, todayIso());
      const site = typeof req.query.site === "string" ? req.query.site.trim() : "";

      const filter: Record<string, any> = {
        status: "ACTIVE",
        remainingBalance: { $gt: 0 },
        startMonth: { $lte: month },
      };
      if (site && site !== "All") {
        filter.siteName = new RegExp(`^${escapeRegex(site)}$`, "i");
      }

      const activePlans = await AdminUniformRecoveryPlan.find(filter).sort({ employeeName: 1 }).lean();
      const preview = activePlans.map((plan) => {
        const scheduledDue =
          plan.recoveryMode === "ONE_TIME"
            ? plan.remainingBalance
            : Math.min(plan.remainingBalance, plan.monthlyAmount || plan.remainingBalance);
        return {
          ...serializeDoc(plan),
          monthKey: month,
          dueThisMonth: Number(scheduledDue.toFixed(2)),
          carriedForwardAfter: Number(Math.max(0, plan.remainingBalance - scheduledDue).toFixed(2)),
        };
      });

      const totalDueThisMonth = Number(
        preview.reduce((sum, item) => sum + item.dueThisMonth, 0).toFixed(2)
      );

      res.json({
        success: true,
        data: {
          month,
          count: preview.length,
          totalDueThisMonth,
          items: preview,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

uniformRecoveryPlansAdminRouter.get(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { search, site, status, employeeId, month } = req.query;
      const { page, limit, skip } = parsePaginationParams(req.query, 50, 250);
      const filter: Record<string, any> = {};

      if (typeof status === "string" && (UNIFORM_RECOVERY_STATUSES as readonly string[]).includes(status)) {
        filter.status = status;
      }
      if (typeof site === "string" && site.trim() && site !== "All") {
        filter.siteName = new RegExp(`^${escapeRegex(site.trim())}$`, "i");
      }
      if (typeof employeeId === "string" && employeeId.trim()) {
        filter.employeeId = employeeId.trim().toUpperCase();
      }
      if (typeof month === "string" && /^\d{4}-\d{2}$/.test(month.trim())) {
        filter.startMonth = { $lte: month.trim() };
      }
      if (typeof search === "string" && search.trim()) {
        const rx = new RegExp(escapeRegex(search.trim()), "i");
        filter.$or = [
          { employeeName: rx },
          { employeeId: rx },
          { legacyEmpCode: rx },
          { siteName: rx },
          { remarks: rx },
        ];
      }

      const [items, total, summaryAgg] = await Promise.all([
        AdminUniformRecoveryPlan.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        AdminUniformRecoveryPlan.countDocuments(filter),
        AdminUniformRecoveryPlan.aggregate([
          {
            $group: {
              _id: "$status",
              count: { $sum: 1 },
              totalCharge: { $sum: "$totalCharge" },
              recovered: { $sum: "$recoveredAmount" },
              remaining: { $sum: "$remainingBalance" },
            },
          },
        ]),
      ]);

      let activePlans = 0;
      let totalOutstanding = 0;
      let totalRecovered = 0;
      for (const row of summaryAgg) {
        totalRecovered += Number(row.recovered) || 0;
        if (row._id === "ACTIVE" || row._id === "PAUSED") {
          activePlans += Number(row.count) || 0;
          totalOutstanding += Number(row.remaining) || 0;
        }
      }

      res.json({
        success: true,
        count: items.length,
        pagination: buildPaginationMeta(page, limit, total),
        summary: {
          activePlans,
          totalOutstanding: Number(totalOutstanding.toFixed(2)),
          totalRecovered: Number(totalRecovered.toFixed(2)),
        },
        data: items.map(serializeDoc),
      });
    } catch (err) {
      next(err);
    }
  }
);

uniformRecoveryPlansAdminRouter.post(
  "/",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = stripMetaFields(req.body);
      const employeeId = String(body.employeeId || "").trim().toUpperCase();
      const legacyEmpCode = String(body.legacyEmpCode || "").trim();
      const employeeName = String(body.employeeName || "").trim();
      const siteName = String(body.siteName || body.site || "").trim();
      const totalCharge = parseNonNegativeNumber(body.totalCharge);

      if (!employeeName || !siteName || totalCharge === null || totalCharge <= 0) {
        res.status(400).json({
          success: false,
          message: "Required fields: employeeName, siteName, and totalCharge (> 0).",
        });
        return;
      }

      const rawMode = String(body.recoveryMode || "EMI_COUNT").toUpperCase();
      const recoveryMode: UniformRecoveryMode = (UNIFORM_RECOVERY_MODES as readonly string[]).includes(rawMode)
        ? (rawMode as UniformRecoveryMode)
        : "EMI_COUNT";

      const schedule = computeMonthlyEmi(
        totalCharge,
        recoveryMode,
        Number(body.installmentCount) || 1,
        body.monthlyAmount !== undefined ? Number(body.monthlyAmount) : null
      );
      const startMonth = normalizeMonthKey(body.startMonth, todayIso());
      const alreadyRecovered = Math.min(
        totalCharge,
        Math.max(0, Number(body.recoveredAmount) || 0)
      );
      const remainingBalance = Number((totalCharge - alreadyRecovered).toFixed(2));

      const [siteDoc, empDoc] = await Promise.all([
        AdminSite.findOne({ siteName: new RegExp(`^${escapeRegex(siteName)}$`, "i") }).lean(),
        AdminEmployee.findOne({
          $or: [
            ...(employeeId ? [{ empCode: employeeId }] : []),
            ...(legacyEmpCode ? [{ legacyEmpCode }] : []),
            { fullName: new RegExp(`^${escapeRegex(employeeName)}$`, "i") },
          ],
        }).lean(),
      ]);

      const resolvedEmpId =
        employeeId ||
        empDoc?.empCode ||
        `ACS/DRS/${startMonth.slice(0, 4)}/${Math.random().toString(36).slice(2, 6).toUpperCase()}`;

      const plan = await AdminUniformRecoveryPlan.create({
        batchId: String(body.batchId || "").trim(),
        issueIds: Array.isArray(body.issueIds) ? body.issueIds.map(String) : [],
        employeeObjectId: empDoc?._id ?? null,
        employeeId: resolvedEmpId,
        legacyEmpCode: legacyEmpCode || empDoc?.legacyEmpCode || "",
        employeeName,
        siteId: siteDoc?._id ?? empDoc?.primarySiteId ?? null,
        siteName: siteDoc?.siteName || siteName,
        totalCharge,
        recoveryMode,
        installmentCount: schedule.installmentCount,
        monthlyAmount: schedule.monthlyAmount,
        startMonth,
        recoveredAmount: alreadyRecovered,
        creditedAmount: 0,
        remainingBalance,
        status: remainingBalance <= 0 ? "SETTLED" : "ACTIVE",
        lastDeductedMonth: "",
        installmentHistory:
          alreadyRecovered > 0
            ? [
                {
                  monthKey: startMonth,
                  scheduledAmount: alreadyRecovered,
                  deductedAmount: alreadyRecovered,
                  balanceAfter: remainingBalance,
                  source: "MANUAL",
                  note: "Opening recovered amount",
                  recordedAt: todayIso(),
                },
              ]
            : [],
        remarks: String(body.remarks || "").trim(),
      });

      await logAdminActivity(
        "Uniform recovery plan created",
        `Created ${recoveryMode} dress recovery plan of ₹${totalCharge} (${schedule.monthlyAmount}/mo from ${startMonth}) for ${employeeName}.`,
        "Uniforms"
      );

      res.status(201).json({
        success: true,
        message: "Uniform recovery plan created successfully",
        data: serializeDoc(plan),
      });
    } catch (err) {
      next(err);
    }
  }
);

uniformRecoveryPlansAdminRouter.patch(
  "/:id",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const id = getParamId(req);
      if (!mongoose.Types.ObjectId.isValid(id)) {
        res.status(404).json({ success: false, message: "Recovery plan not found" });
        return;
      }

      const plan = await AdminUniformRecoveryPlan.findById(id);
      if (!plan) {
        res.status(404).json({ success: false, message: "Recovery plan not found" });
        return;
      }

      const body = stripMetaFields(req.body);

      if (body.recoveryMode !== undefined) {
        const nextMode = String(body.recoveryMode).toUpperCase();
        if ((UNIFORM_RECOVERY_MODES as readonly string[]).includes(nextMode)) {
          plan.recoveryMode = nextMode as UniformRecoveryMode;
        }
      }
      if (body.installmentCount !== undefined || body.monthlyAmount !== undefined || body.recoveryMode !== undefined) {
        const schedule = computeMonthlyEmi(
          plan.totalCharge,
          plan.recoveryMode,
          body.installmentCount !== undefined ? Number(body.installmentCount) : plan.installmentCount,
          body.monthlyAmount !== undefined ? Number(body.monthlyAmount) : plan.monthlyAmount
        );
        plan.installmentCount = schedule.installmentCount;
        plan.monthlyAmount = schedule.monthlyAmount;
      }
      if (body.startMonth !== undefined && /^\d{4}-\d{2}$/.test(String(body.startMonth).trim())) {
        plan.startMonth = String(body.startMonth).trim();
      }
      if (body.remarks !== undefined) {
        plan.remarks = String(body.remarks || "").trim();
      }
      if (body.status !== undefined) {
        const nextStatus = String(body.status).toUpperCase();
        if ((UNIFORM_RECOVERY_STATUSES as readonly string[]).includes(nextStatus)) {
          plan.status = nextStatus as UniformRecoveryStatus;
        }
      }

      // Record an installment payment / payroll recovery deduction
      const dedRaw = body.recordDeductionAmount ?? body.deductedAmount;
      if (dedRaw !== undefined && dedRaw !== null && String(dedRaw).trim() !== "") {
        const dedAmt = Number(dedRaw);
        if (!Number.isFinite(dedAmt) || dedAmt <= 0) {
          res.status(400).json({
            success: false,
            message: "recordDeductionAmount must be a positive number",
          });
          return;
        }
        const applied = Math.min(plan.remainingBalance, Number(dedAmt.toFixed(2)));
        const monthKey = normalizeMonthKey(body.deductMonth ?? body.monthKey, todayIso());
        plan.recoveredAmount = Number((plan.recoveredAmount + applied).toFixed(2));
        plan.remainingBalance = Math.max(
          0,
          Number((plan.totalCharge - plan.recoveredAmount - plan.creditedAmount).toFixed(2))
        );
        plan.lastDeductedMonth = monthKey;
        plan.installmentHistory.push({
          monthKey,
          scheduledAmount: plan.monthlyAmount,
          deductedAmount: applied,
          balanceAfter: plan.remainingBalance,
          source: body.source === "PAYROLL" ? "PAYROLL" : "MANUAL",
          note: String(body.note || `Recovered ₹${applied} in ${monthKey}`).trim(),
          recordedAt: todayIso(),
        });
        if (plan.remainingBalance <= 0) {
          plan.status = "SETTLED";
        }
      }

      await plan.save();
      res.json({
        success: true,
        message: "Uniform recovery plan updated",
        data: serializeDoc(plan),
      });
    } catch (err) {
      next(err);
    }
  }
);
