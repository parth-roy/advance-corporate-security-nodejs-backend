import { Router, Request, Response, NextFunction } from "express";
import {
  AdminUniformIssue,
  AdminUniformItem,
  AdminUniformStockLog,
} from "../../models/admin/AdminOperations.model";
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

// ─── Uniform Inventory (/api/admin/uniforms) ──────────────────
uniformsAdminRouter.get("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { category, search } = req.query;
    const filter: Record<string, any> = {};

    if (typeof category === "string" && category !== "All") {
      filter.category = category;
    }
    if (typeof search === "string" && search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), "i");
      filter.$or = [{ name: regex }, { category: regex }, { size: regex }];
    }

    const items = await AdminUniformItem.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    res.json({ success: true, count: items.length, data: items.map(serializeDoc) });
  } catch (err) {
    next(err);
  }
});

uniformsAdminRouter.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, category, size, availableQty = 0 } = req.body;
    if (!name || !category || !size) {
      res.status(400).json({
        success: false,
        message: "Required fields: name, category, size",
      });
      return;
    }

    const qty = Math.max(0, Number(availableQty) || 0);
    const today = todayIso();

    const item = await AdminUniformItem.create({
      name: String(name).trim(),
      category,
      size: String(size).trim(),
      availableQty: qty,
      issuedQty: 0,
      lastUpdated: today,
    });

    await AdminUniformStockLog.create({
      itemName: item.name,
      action: "Added",
      quantity: qty,
      date: today,
      note: `Initial stock (${item.size})`,
    });

    await logAdminActivity(
      "Uniform item added",
      `${item.name} (${qty} units) added to stock.`,
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
    const { delta, note = "Manual stock update" } = req.body;
    const numericDelta = Number(delta);
    if (Number.isNaN(numericDelta)) {
      res.status(400).json({ success: false, message: "delta must be a valid number" });
      return;
    }

    const item = await AdminUniformItem.findById(getParamId(req));
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
    const updated = await AdminUniformItem.findByIdAndUpdate(
      getParamId(req),
      { $set: { ...stripMetaFields(req.body), lastUpdated: todayIso() } },
      { new: true, runValidators: true }
    );
    if (!updated) {
      res.status(404).json({ success: false, message: "Uniform item not found" });
      return;
    }
    res.json({ success: true, data: serializeDoc(updated) });
  } catch (err) {
    next(err);
  }
});

uniformsAdminRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const deleted = await AdminUniformItem.findByIdAndDelete(getParamId(req));
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

uniformIssuesAdminRouter.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { employeeId, employeeName, site, itemId, quantity, issueDate } = req.body;
    const qty = Number(quantity);

    if (!employeeId || !employeeName || !site || !itemId || !qty || qty < 1) {
      res.status(400).json({
        success: false,
        message: "Required fields: employeeId, employeeName, site, itemId, quantity (>= 1)",
      });
      return;
    }

    const item = await AdminUniformItem.findById(itemId);
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

    const effectiveDate = issueDate ? String(issueDate).trim() : todayIso();
    item.availableQty -= qty;
    item.issuedQty += qty;
    item.lastUpdated = todayIso();
    await item.save();

    const issue = await AdminUniformIssue.create({
      employeeId: String(employeeId).trim(),
      employeeName: String(employeeName).trim(),
      site: String(site).trim(),
      itemId: String(item._id),
      itemName: item.name,
      size: item.size,
      quantity: qty,
      issueDate: effectiveDate,
      status: "Issued",
    });

    await AdminUniformStockLog.create({
      itemName: item.name,
      action: "Issued",
      quantity: qty,
      date: effectiveDate,
      note: `Issued to ${issue.employeeName} (${issue.employeeId})`,
    });

    await logAdminActivity(
      "Uniform issued",
      `${qty}× ${item.name} issued to ${issue.employeeName}.`,
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
    const issue = await AdminUniformIssue.findById(getParamId(req));
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

    const item = await AdminUniformItem.findById(issue.itemId);
    if (item) {
      item.availableQty += issue.quantity;
      item.issuedQty = Math.max(0, item.issuedQty - issue.quantity);
      item.lastUpdated = today;
      await item.save();
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
