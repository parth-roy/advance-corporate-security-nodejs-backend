import { Router, Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import {
  AdminUniformIssue,
  AdminUniformItem,
  AdminUniformStockLog,
  IAdminUniformItem,
  UNIFORM_CATEGORIES,
  UniformCategory,
} from "../../models/admin/AdminOperations.model";
import { ensureUniformCatalogSeeded } from "../../data/uniformCatalogSeed";
import {
  escapeRegex,
  getParamId,
  logAdminActivity,
  serializeDoc,
  stripMetaFields,
  todayIso,
} from "./helpers";

export const uniformsAdminRouter = Router();
export const uniformIssuesAdminRouter = Router();
export const stockLogsAdminRouter = Router();

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

interface IssueLineInput {
  itemId: string;
  quantity: number;
  unitPrice: number | null;
}

function buildIssueRecordPayload(params: {
  batchId?: string;
  employeeId: string;
  employeeName: string;
  site: string;
  item: IAdminUniformItem;
  quantity: number;
  unitPrice: number;
  registrationCharge: number;
  issueDate: string;
  remarks: string;
}) {
  const itemName = deriveUniformItemName(params.item.category, params.item.subCategory) || params.item.name;
  const totalAmount = params.quantity * params.unitPrice + params.registrationCharge;
  return {
    issue: {
      batchId: params.batchId || "",
      employeeId: params.employeeId,
      employeeName: params.employeeName,
      site: params.site,
      itemId: String(params.item._id),
      itemName,
      category: params.item.category,
      subCategory: params.item.subCategory || "",
      size: params.item.size,
      quantity: params.quantity,
      unitPrice: params.unitPrice,
      registrationCharge: params.registrationCharge,
      totalAmount,
      issueDate: params.issueDate,
      remarks: params.remarks,
      status: "Issued" as const,
    },
    stockLog: {
      itemName,
      action: "Issued" as const,
      quantity: params.quantity,
      date: params.issueDate,
      note: `Issued to ${params.employeeName} (${params.employeeId})`,
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
    if (Number.isNaN(numericDelta)) {
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

    await AdminUniformStockLog.create({
      itemName: item.name,
      action: "Restocked",
      quantity: numericDelta,
      date: item.lastUpdated,
      note: String(note).trim() || "Manual stock update",
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
    const { status } = req.query;
    const filter: Record<string, any> = {};
    if (typeof status === "string" && status !== "All") {
      filter.status = status;
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
        employeeId,
        employeeName,
        site,
        issueDate,
        registrationCharge = 0,
        remarks = "",
        items,
      } = req.body;

      const cleanEmployeeId = typeof employeeId === "string" ? employeeId.trim() : String(employeeId ?? "").trim();
      const cleanEmployeeName = typeof employeeName === "string" ? employeeName.trim() : String(employeeName ?? "").trim();
      const cleanSite = typeof site === "string" ? site.trim() : String(site ?? "").trim();
      const cleanRemarks = typeof remarks === "string" ? remarks.trim() : String(remarks ?? "").trim();

      if (!cleanEmployeeId || !cleanEmployeeName || !cleanSite || !Array.isArray(items) || items.length === 0) {
        res.status(400).json({
          success: false,
          message: "Required fields: employeeId, employeeName, site, and a non-empty items array",
        });
        return;
      }

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

      const builtPayloads = normalizedLines.map((line, index) => {
        const item = itemMap.get(line.itemId)!;
        const unitPrice = line.unitPrice !== null ? line.unitPrice : item.unitPrice ?? 0;
        const lineRegCharge = index === 0 ? regCharge : 0;
        return buildIssueRecordPayload({
          batchId,
          employeeId: cleanEmployeeId,
          employeeName: cleanEmployeeName,
          site: cleanSite,
          item,
          quantity: line.quantity,
          unitPrice,
          registrationCharge: lineRegCharge,
          issueDate: effectiveDate,
          remarks: cleanRemarks,
        });
      });

      const createdIssues = await AdminUniformIssue.insertMany(
        builtPayloads.map((p) => p.issue)
      );
      await AdminUniformStockLog.insertMany(builtPayloads.map((p) => p.stockLog));

      await logAdminActivity(
        "Uniform kit issued",
        `Issued ${normalizedLines.length} item line(s) to ${cleanEmployeeName} (${cleanEmployeeId}).`,
        "Uniforms"
      );

      res.status(201).json({
        success: true,
        message: "Uniform kit issued successfully",
        data: {
          issues: createdIssues.map(serializeDoc),
          uniforms: updatedUniforms.map(serializeDoc),
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
      employeeId,
      employeeName,
      site,
      itemId,
      quantity,
      issueDate,
      unitPrice,
      registrationCharge = 0,
      remarks = "",
      batchId = "",
    } = req.body;

    const cleanEmployeeId = typeof employeeId === "string" ? employeeId.trim() : String(employeeId ?? "").trim();
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
      employeeId: cleanEmployeeId,
      employeeName: cleanEmployeeName,
      site: cleanSite,
      item: updatedItem,
      quantity: qty,
      unitPrice: effectiveUnitPrice,
      registrationCharge: parsedRegCharge,
      issueDate: effectiveDate,
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
    if (issue.status === "Returned") {
      res.status(400).json({ success: false, message: "Uniform has already been returned" });
      return;
    }

    const today = todayIso();
    issue.status = "Returned";
    issue.returnDate = today;
    await issue.save();

    if (mongoose.Types.ObjectId.isValid(issue.itemId)) {
      const item = await AdminUniformItem.findById(issue.itemId);
      if (item) {
        item.availableQty += issue.quantity;
        item.issuedQty = Math.max(0, item.issuedQty - issue.quantity);
        item.lastUpdated = today;
        await item.save();
      }
    }

    await AdminUniformStockLog.create({
      itemName: issue.itemName,
      action: "Returned",
      quantity: issue.quantity,
      date: today,
      note: `Returned by ${issue.employeeName} (${issue.employeeId})`,
    });

    await logAdminActivity(
      "Uniform returned",
      `${issue.quantity}× ${issue.itemName} returned by ${issue.employeeName}.`,
      "Uniforms"
    );

    res.json({
      success: true,
      message: "Uniform marked as returned",
      data: serializeDoc(issue),
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
