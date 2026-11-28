import { Router, Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import {
  AdminEmployee,
  AdminSite,
  SITE_GST_MODES,
  SiteGstMode,
} from "../../models/admin/AdminCore.model";
import { AdminAttendance, AdminCandidate } from "../../models/admin/AdminOperations.model";
import { AdminInvoice } from "../../models/admin/AdminFinance.model";
import { deriveUniqueSiteCode } from "../../services/employeeCode.service";
import {
  buildPaginationMeta,
  escapeRegex,
  getParamId,
  logAdminActivity,
  parsePaginationParams,
  serializeDoc,
  stripMetaFields,
} from "./helpers";

export const sitesAdminRouter = Router();

function sanitizeSubUnits(raw: unknown): string[] {
  if (Array.isArray(raw)) {
    return Array.from(new Set(raw.map((x) => String(x || "").trim()).filter(Boolean)));
  }
  if (typeof raw === "string") {
    return Array.from(
      new Set(
        raw
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
      )
    );
  }
  return [];
}

function inferStateCodeFromGstin(gstin: string, fallbackStateCode: string): string {
  const cleanGstin = gstin.trim().toUpperCase();
  if (/^\d{2}[A-Z0-9]{13}$/.test(cleanGstin)) {
    return cleanGstin.slice(0, 2);
  }
  return fallbackStateCode.trim() || "19";
}

function normalizeGstMode(raw: unknown, stateCode: string): SiteGstMode {
  const value = String(raw || "").trim().toUpperCase();
  if ((SITE_GST_MODES as readonly string[]).includes(value)) {
    return value as SiteGstMode;
  }
  return stateCode && stateCode !== "19" ? "INTER_IGST" : "INTRA_CGST_SGST";
}

// ─── GET /api/admin/sites ─────────────────────────────────────
sitesAdminRouter.get("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { isActive, gstMode, stateCode, search } = req.query;
    const { page, limit, skip } = parsePaginationParams(req.query, 25, 500);
    const filter: Record<string, any> = {};

    if (isActive === "true" || isActive === "false") {
      filter.isActive = isActive === "true";
    }
    if (typeof gstMode === "string" && gstMode.trim() && gstMode !== "All") {
      filter.gstMode = gstMode.trim().toUpperCase();
    }
    if (typeof stateCode === "string" && stateCode.trim() && stateCode !== "All") {
      filter.stateCode = stateCode.trim();
    }
    if (typeof search === "string" && search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), "i");
      filter.$or = [
        { siteName: regex },
        { siteCode: regex },
        { shortName: regex },
        { clientName: regex },
        { clientGstin: regex },
        { contractRef: regex },
      ];
    }

    const [sites, total, activeSites, inactiveSites, workforceCounts] = await Promise.all([
      AdminSite.find(filter).sort({ isActive: -1, siteName: 1 }).skip(skip).limit(limit).lean(),
      AdminSite.countDocuments(filter),
      AdminSite.countDocuments({ isActive: true }),
      AdminSite.countDocuments({ isActive: false }),
      AdminEmployee.aggregate([
        { $match: { status: { $ne: "LEFT" }, primarySiteId: { $ne: null } } },
        { $group: { _id: "$primarySiteId", count: { $sum: 1 } } },
      ]),
    ]);

    const countBySiteId = new Map<string, number>();
    let totalAssignedEmployees = 0;
    for (const row of workforceCounts) {
      if (row?._id) {
        const c = Number(row.count) || 0;
        countBySiteId.set(String(row._id), c);
        totalAssignedEmployees += c;
      }
    }

    const serialized = sites.map((site) => ({
      ...serializeDoc(site),
      employeeCount: countBySiteId.get(String(site._id)) ?? 0,
    }));

    res.json({
      success: true,
      count: serialized.length,
      data: serialized,
      pagination: buildPaginationMeta(page, limit, total),
      summary: {
        totalSites: activeSites + inactiveSites,
        activeSites,
        inactiveSites,
        totalAssignedEmployees,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/sites/:id ─────────────────────────────────
sitesAdminRouter.get("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Site not found" });
      return;
    }

    const [site, employeeCount] = await Promise.all([
      AdminSite.findById(id).lean(),
      AdminEmployee.countDocuments({ primarySiteId: id, status: { $ne: "LEFT" } }),
    ]);

    if (!site) {
      res.status(404).json({ success: false, message: "Site not found" });
      return;
    }

    res.json({
      success: true,
      data: {
        ...serializeDoc(site),
        employeeCount,
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/sites ────────────────────────────────────
sitesAdminRouter.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = stripMetaFields(req.body);
    const siteName = String(body.siteName || "").trim();
    if (!siteName) {
      res.status(400).json({ success: false, message: "Required field: siteName" });
      return;
    }

    const existingByName = await AdminSite.findOne({
      siteName: new RegExp(`^${escapeRegex(siteName)}$`, "i"),
    }).lean();
    if (existingByName) {
      res.status(409).json({
        success: false,
        message: `Site "${siteName}" already exists (Code: ${existingByName.siteCode}).`,
      });
      return;
    }

    const requestedCode = String(body.siteCode || "").trim().toUpperCase();
    if (requestedCode) {
      const codeConflict = await AdminSite.findOne({ siteCode: requestedCode }).lean();
      if (codeConflict) {
        res.status(409).json({
          success: false,
          message: `Site code "${requestedCode}" is already assigned to "${codeConflict.siteName}".`,
        });
        return;
      }
    }

    const siteCode = requestedCode || (await deriveUniqueSiteCode(siteName));
    const clientGstin = String(body.clientGstin || "").trim().toUpperCase();
    const stateCode = inferStateCodeFromGstin(clientGstin, String(body.stateCode || "19"));
    const gstMode = normalizeGstMode(body.gstMode, stateCode);
    const serviceChargePct = Number(body.serviceChargePct);

    const created = await AdminSite.create({
      siteCode,
      siteName,
      shortName: String(body.shortName || "").trim(),
      clientName: String(body.clientName || siteName).trim(),
      billToAddress: String(body.billToAddress || "").trim(),
      shipToAddress: String(body.shipToAddress || "").trim(),
      clientGstin,
      stateCode,
      vendorCode: String(body.vendorCode || "").trim(),
      contractRef: String(body.contractRef || "").trim(),
      subUnits: sanitizeSubUnits(body.subUnits),
      sacCode: String(body.sacCode || "998533").trim() || "998533",
      gstMode,
      serviceChargePct: Number.isFinite(serviceChargePct) && serviceChargePct >= 0 ? serviceChargePct : 0,
      isActive: body.isActive !== false,
      notes: String(body.notes || "").trim(),
    });

    await logAdminActivity(
      "Client site created",
      `${created.siteName} (${created.siteCode}) registered.`,
      "Settings"
    );

    res.status(201).json({
      success: true,
      message: "Site created successfully",
      data: { ...serializeDoc(created), employeeCount: 0 },
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH / PUT /api/admin/sites/:id ─────────────────────────
const updateSiteHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Site not found" });
      return;
    }

    const existing = await AdminSite.findById(id);
    if (!existing) {
      res.status(404).json({ success: false, message: "Site not found" });
      return;
    }

    const updates = stripMetaFields(req.body);

    if (updates.siteCode !== undefined) {
      const nextCode = String(updates.siteCode || "").trim().toUpperCase();
      if (!nextCode) {
        res.status(400).json({ success: false, message: "siteCode cannot be empty" });
        return;
      }
      const conflict = await AdminSite.findOne({ siteCode: nextCode, _id: { $ne: id } }).lean();
      if (conflict) {
        res.status(409).json({
          success: false,
          message: `Site code "${nextCode}" is already used by "${conflict.siteName}".`,
        });
        return;
      }
      updates.siteCode = nextCode;
    }

    if (updates.siteName !== undefined) {
      const nextName = String(updates.siteName || "").trim();
      if (!nextName) {
        res.status(400).json({ success: false, message: "siteName cannot be empty" });
        return;
      }
      const dup = await AdminSite.findOne({
        siteName: new RegExp(`^${escapeRegex(nextName)}$`, "i"),
        _id: { $ne: id },
      }).lean();
      if (dup) {
        res.status(409).json({
          success: false,
          message: `Another site named "${nextName}" already exists.`,
        });
        return;
      }
      updates.siteName = nextName;
    }

    if (updates.clientGstin !== undefined) {
      const cleanGstin = String(updates.clientGstin || "").trim().toUpperCase();
      updates.clientGstin = cleanGstin;
      updates.stateCode = inferStateCodeFromGstin(
        cleanGstin,
        String(updates.stateCode ?? existing.stateCode ?? "19")
      );
    }

    if (updates.gstMode !== undefined) {
      updates.gstMode = normalizeGstMode(
        updates.gstMode,
        String(updates.stateCode ?? existing.stateCode ?? "19")
      );
    }

    if (updates.subUnits !== undefined) {
      updates.subUnits = sanitizeSubUnits(updates.subUnits);
    }

    if (updates.serviceChargePct !== undefined) {
      const sc = Number(updates.serviceChargePct);
      if (!Number.isFinite(sc) || sc < 0 || sc > 100) {
        res.status(400).json({ success: false, message: "serviceChargePct must be between 0 and 100." });
        return;
      }
      updates.serviceChargePct = sc;
    }

    const oldName = existing.siteName;
    const updated = await AdminSite.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (updated && updated.siteName !== oldName) {
      await Promise.all([
        AdminEmployee.updateMany({ primarySiteId: id }, { $set: { siteName: updated.siteName } }),
        AdminCandidate.updateMany({ siteId: id }, { $set: { location: updated.siteName } }),
      ]);
    }

    const employeeCount = await AdminEmployee.countDocuments({
      primarySiteId: id,
      status: { $ne: "LEFT" },
    });

    await logAdminActivity(
      "Client site updated",
      `Updated master profile for ${updated?.siteName ?? oldName}.`,
      "Settings"
    );

    res.json({
      success: true,
      message: "Site updated successfully",
      data: updated ? { ...serializeDoc(updated), employeeCount } : null,
    });
  } catch (err) {
    next(err);
  }
};

sitesAdminRouter.patch("/:id", updateSiteHandler);
sitesAdminRouter.put("/:id", updateSiteHandler);

// ─── DELETE /api/admin/sites/:id ──────────────────────────────
sitesAdminRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Site not found" });
      return;
    }

    const existing = await AdminSite.findById(id);
    if (!existing) {
      res.status(404).json({ success: false, message: "Site not found" });
      return;
    }

    if (req.query.archive === "true") {
      existing.isActive = false;
      await existing.save();
      res.json({
        success: true,
        message: "Site archived successfully",
        data: serializeDoc(existing),
      });
      return;
    }

    const [empCount, attCount, invCount] = await Promise.all([
      AdminEmployee.countDocuments({ primarySiteId: id }),
      AdminAttendance.countDocuments({ location: existing.siteName }),
      AdminInvoice.countDocuments({ site: existing.siteName }),
    ]);

    if (empCount > 0 || attCount > 0 || invCount > 0) {
      res.status(409).json({
        success: false,
        message: `Cannot delete "${existing.siteName}" because it has linked records (${empCount} employees, ${attCount} attendance logs, ${invCount} invoices). Archive it instead.`,
      });
      return;
    }

    await AdminSite.findByIdAndDelete(id);
    await logAdminActivity("Client site deleted", `Removed ${existing.siteName}.`, "Settings");

    res.json({
      success: true,
      message: "Site deleted successfully",
      data: serializeDoc(existing),
    });
  } catch (err) {
    next(err);
  }
});
