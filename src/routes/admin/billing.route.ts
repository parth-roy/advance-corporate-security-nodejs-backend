import { Router, Request, Response, NextFunction } from "express";
import { AdminInvoice } from "../../models/admin/AdminFinance.model";
import {
  escapeRegex,
  getParamId,
  logAdminActivity,
  serializeDoc,
  stripMetaFields,
  todayIso,
} from "./helpers";

export const billingAdminRouter = Router();

// ─── GET /api/admin/invoices ──────────────────────────────────
billingAdminRouter.get("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, billingMonth, search } = req.query;
    const filter: Record<string, any> = {};

    if (typeof status === "string" && status !== "All") filter.status = status;
    if (typeof billingMonth === "string" && billingMonth !== "All") filter.billingMonth = billingMonth;
    if (typeof search === "string" && search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), "i");
      filter.$or = [
        { invoiceNumber: regex },
        { clientName: regex },
        { site: regex },
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

    const invoice = await AdminInvoice.create({
      ...req.body,
      invoiceDate: invoiceDate || todayIso(),
      dueDate: dueDate || todayIso(),
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

// ─── PATCH /api/admin/invoices/:id/mark-paid ──────────────────
billingAdminRouter.patch("/:id/mark-paid", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const invoice = await AdminInvoice.findByIdAndUpdate(
      getParamId(req),
      { $set: { status: "Paid" } },
      { new: true }
    );
    if (!invoice) {
      res.status(404).json({ success: false, message: "Invoice not found" });
      return;
    }

    await logAdminActivity(
      "Invoice marked paid",
      `${invoice.invoiceNumber} marked as Paid.`,
      "Billing"
    );

    res.json({
      success: true,
      message: "Invoice marked as Paid",
      data: serializeDoc(invoice),
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
