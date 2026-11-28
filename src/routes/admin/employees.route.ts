import { Router, Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import {
  AdminEmployee,
  AdminSite,
  EMPLOYEE_RATE_TYPES,
  EMPLOYEE_STATUSES,
  EmployeeRateType,
  EmployeeStatus,
} from "../../models/admin/AdminCore.model";
import {
  generateNextEmployeeCode,
  resolveOrCreateSite,
  sanitizeBankDetails,
  sanitizeDocuments,
  sanitizeFamilyMembers,
} from "../../services/employeeCode.service";
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

export const employeesAdminRouter = Router();

const TEN_DIGIT_MOBILE_RE = /^\d{10}$/;
const EMP_CODE_RE = /^[A-Z0-9][A-Z0-9/-]{0,59}$/;

function sanitizeOriginalIdCustody(raw: unknown) {
  const rec = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  return {
    documentType: String(rec.documentType || "").trim().slice(0, 100),
    referenceNo: String(rec.referenceNo || "").trim().slice(0, 100),
    depositedDate: String(rec.depositedDate || "").trim().slice(0, 40),
    inCustody: Boolean(rec.inCustody),
    notes: String(rec.notes || "").trim().slice(0, 500),
  };
}

function sanitizeStatutory(raw: unknown) {
  const rec = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const holderRaw = String(rec.esiHolder || "").trim();
  const esiHolder: "Yes" | "No" | "" =
    holderRaw === "Yes" || holderRaw === "No" ? holderRaw : "";
  return {
    esiHolder,
    esiNumber: String(rec.esiNumber || "").trim().slice(0, 100),
    pfUan: String(rec.pfUan || "").trim().slice(0, 100),
  };
}

// ─── GET /api/admin/employees/generate-code ───────────────────
employeesAdminRouter.get(
  "/generate-code",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const prefix = typeof req.query.prefix === "string" ? req.query.prefix : undefined;
      const designation = typeof req.query.designation === "string" ? req.query.designation : undefined;
      const year = typeof req.query.year === "string" ? req.query.year : undefined;
      const empCode = await generateNextEmployeeCode({ prefix, designation, year });
      res.json({ success: true, data: { empCode } });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/admin/employees ─────────────────────────────────
employeesAdminRouter.get("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { siteId, siteName, site, status, designation, rateType, search } = req.query;
    const { page, limit, skip } = parsePaginationParams(req.query, 25, 250);
    const filter: Record<string, any> = {};

    if (typeof siteId === "string" && mongoose.Types.ObjectId.isValid(siteId.trim())) {
      filter.primarySiteId = siteId.trim();
    } else {
      const rawSite =
        typeof siteName === "string" && siteName.trim()
          ? siteName.trim()
          : typeof site === "string" && site.trim()
            ? site.trim()
            : "";
      if (rawSite && rawSite !== "All") {
        filter.siteName = rawSite;
      }
    }

    if (typeof status === "string" && status.trim() && status !== "All") {
      filter.status = status.trim().toUpperCase();
    }
    if (typeof designation === "string" && designation.trim() && designation !== "All") {
      filter.designation = designation.trim();
    }
    if (typeof rateType === "string" && rateType.trim() && rateType !== "All") {
      filter.rateType = rateType.trim().toUpperCase();
    }
    if (typeof search === "string" && search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), "i");
      filter.$or = [
        { empCode: regex },
        { legacyEmpCode: regex },
        { fullName: regex },
        { mobile: regex },
        { designation: regex },
        { siteName: regex },
      ];
    }

    const [
      employees,
      total,
      activeCount,
      onHoldCount,
      leftCount,
      transferredCount,
      designations,
    ] = await Promise.all([
      AdminEmployee.find(filter).sort({ createdAt: -1, fullName: 1 }).skip(skip).limit(limit).lean(),
      AdminEmployee.countDocuments(filter),
      AdminEmployee.countDocuments({ status: "ACTIVE" }),
      AdminEmployee.countDocuments({ status: "ON_HOLD" }),
      AdminEmployee.countDocuments({ status: "LEFT" }),
      AdminEmployee.countDocuments({ status: "TRANSFERRED" }),
      AdminEmployee.distinct("designation"),
    ]);

    res.json({
      success: true,
      count: employees.length,
      data: employees.map(serializeDoc),
      pagination: buildPaginationMeta(page, limit, total),
      summary: {
        total: activeCount + onHoldCount + leftCount + transferredCount,
        active: activeCount,
        onHold: onHoldCount,
        left: leftCount,
        transferred: transferredCount,
      },
      filterOptions: {
        designations: designations
          .map((d) => String(d || "").trim())
          .filter(Boolean)
          .sort((a, b) => a.localeCompare(b)),
      },
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET /api/admin/employees/:id ─────────────────────────────
employeesAdminRouter.get("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    const employee = mongoose.Types.ObjectId.isValid(id)
      ? await AdminEmployee.findById(id).lean()
      : await AdminEmployee.findOne({ empCode: id.trim().toUpperCase() }).lean();

    if (!employee) {
      res.status(404).json({ success: false, message: "Employee not found" });
      return;
    }

    res.json({ success: true, data: serializeDoc(employee) });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/employees ────────────────────────────────
employeesAdminRouter.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = stripMetaFields(req.body);
    const fullName = String(body.fullName || "").trim();
    const designation = String(body.designation || "Security Guard").trim();
    const rawSiteName = String(body.siteName || body.location || "").trim();
    const rawSiteId = typeof body.primarySiteId === "string" ? body.primarySiteId.trim() : "";

    if (!fullName || (!rawSiteId && !rawSiteName)) {
      res.status(400).json({
        success: false,
        message: "Required fields: fullName and primarySiteId or siteName",
      });
      return;
    }

    const cleanMobile = String(body.mobile || "").trim();
    if (cleanMobile && !TEN_DIGIT_MOBILE_RE.test(cleanMobile)) {
      res.status(400).json({
        success: false,
        message: "Mobile Number must be exactly 10 digits when provided.",
      });
      return;
    }

    const siteDoc = await resolveOrCreateSite({
      siteId: rawSiteId || null,
      siteName: rawSiteName,
    });
    if (!siteDoc) {
      res.status(400).json({ success: false, message: "Could not resolve deployment site." });
      return;
    }

    let empCode = String(body.empCode || "").trim().toUpperCase();
    if (empCode) {
      if (!EMP_CODE_RE.test(empCode)) {
        res.status(400).json({
          success: false,
          message: "Employee code may use letters, numbers, slashes (/), and hyphens (-) up to 60 chars.",
        });
        return;
      }
      const conflict = await AdminEmployee.findOne({ empCode }).select("_id").lean();
      if (conflict) {
        res.status(409).json({
          success: false,
          message: `Employee code "${empCode}" already exists.`,
        });
        return;
      }
    } else {
      empCode = await generateNextEmployeeCode({
        designation,
        year: String(body.dateOfJoining || "").slice(0, 4),
      });
    }

    const rateTypeRaw = String(body.rateType || "MONTHLY").trim().toUpperCase();
    const rateType: EmployeeRateType = (EMPLOYEE_RATE_TYPES as readonly string[]).includes(rateTypeRaw)
      ? (rateTypeRaw as EmployeeRateType)
      : "MONTHLY";
    const parsedRate = Number(body.baseRate ?? 0);
    const statusRaw = String(body.status || "ACTIVE").trim().toUpperCase();
    const status: EmployeeStatus = (EMPLOYEE_STATUSES as readonly string[]).includes(statusRaw)
      ? (statusRaw as EmployeeStatus)
      : "ACTIVE";

    const employee = await AdminEmployee.create({
      empCode,
      legacyEmpCode: String(body.legacyEmpCode || "").trim().toUpperCase(),
      candidateId:
        typeof body.candidateId === "string" && mongoose.Types.ObjectId.isValid(body.candidateId)
          ? body.candidateId
          : null,
      primarySiteId: siteDoc._id,
      siteName: siteDoc.siteName,
      subUnit: String(body.subUnit || "").trim(),
      fullName,
      fatherOrHusbandName: String(body.fatherOrHusbandName || "").trim(),
      dateOfBirth: String(body.dateOfBirth || "").trim(),
      permanentAddress: String(body.permanentAddress || "").trim(),
      presentAddress: String(body.presentAddress || "").trim(),
      maritalStatus: String(body.maritalStatus || "").trim(),
      highestQualification: String(body.highestQualification || "").trim(),
      mobile: cleanMobile,
      email: String(body.email || "").trim().toLowerCase(),
      designation,
      serviceCategory: String(body.serviceCategory || "").trim(),
      dateOfJoining: String(body.dateOfJoining || todayIso()).trim(),
      rateType,
      baseRate: Number.isFinite(parsedRate) && parsedRate >= 0 ? parsedRate : 0,
      bankDetails: sanitizeBankDetails(body.bankDetails),
      statutory: sanitizeStatutory(body.statutory),
      originalIdCustody: sanitizeOriginalIdCustody(body.originalIdCustody),
      nomineeName: String(body.nomineeName || "").trim(),
      familyMembers: sanitizeFamilyMembers(body.familyMembers),
      documents: sanitizeDocuments(body.documents),
      remarks: String(body.remarks || "").trim(),
      status,
    });

    await logAdminActivity(
      "Deployed employee added",
      `${employee.fullName} (${employee.empCode}) assigned to ${siteDoc.siteName}.`,
      "Operations"
    );

    res.status(201).json({
      success: true,
      message: "Employee created successfully",
      data: serializeDoc(employee),
      site: serializeDoc(siteDoc),
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH / PUT /api/admin/employees/:id ─────────────────────
const updateEmployeeHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Employee not found" });
      return;
    }

    const updates = stripMetaFields(req.body);

    if (updates.empCode !== undefined) {
      const cleanCode = String(updates.empCode || "").trim().toUpperCase();
      if (!EMP_CODE_RE.test(cleanCode)) {
        res.status(400).json({ success: false, message: "Invalid empCode format." });
        return;
      }
      const conflict = await AdminEmployee.findOne({ empCode: cleanCode, _id: { $ne: id } })
        .select("_id")
        .lean();
      if (conflict) {
        res.status(409).json({
          success: false,
          message: `Employee code "${cleanCode}" is already used by another employee.`,
        });
        return;
      }
      updates.empCode = cleanCode;
    }

    if (updates.mobile !== undefined) {
      const cleanMobile = String(updates.mobile || "").trim();
      if (cleanMobile && !TEN_DIGIT_MOBILE_RE.test(cleanMobile)) {
        res.status(400).json({
          success: false,
          message: "Mobile Number must be exactly 10 digits.",
        });
        return;
      }
      updates.mobile = cleanMobile;
    }

    if (updates.primarySiteId !== undefined || updates.siteName !== undefined) {
      const siteDoc = await resolveOrCreateSite({
        siteId: typeof updates.primarySiteId === "string" ? updates.primarySiteId : null,
        siteName: typeof updates.siteName === "string" ? updates.siteName : undefined,
      });
      if (!siteDoc) {
        res.status(400).json({ success: false, message: "Invalid target deployment site." });
        return;
      }
      updates.primarySiteId = siteDoc._id;
      updates.siteName = siteDoc.siteName;
    }

    if (updates.baseRate !== undefined) {
      const parsedRate = Number(updates.baseRate);
      if (!Number.isFinite(parsedRate) || parsedRate < 0) {
        res.status(400).json({ success: false, message: "baseRate must be non-negative." });
        return;
      }
      updates.baseRate = parsedRate;
    }

    if (updates.bankDetails !== undefined) {
      updates.bankDetails = sanitizeBankDetails(updates.bankDetails);
    }
    if (updates.statutory !== undefined) {
      updates.statutory = sanitizeStatutory(updates.statutory);
    }
    if (updates.originalIdCustody !== undefined) {
      updates.originalIdCustody = sanitizeOriginalIdCustody(updates.originalIdCustody);
    }
    if (updates.familyMembers !== undefined) {
      updates.familyMembers = sanitizeFamilyMembers(updates.familyMembers);
    }
    if (updates.documents !== undefined) {
      updates.documents = sanitizeDocuments(updates.documents);
    }

    const updated = await AdminEmployee.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!updated) {
      res.status(404).json({ success: false, message: "Employee not found" });
      return;
    }

    await logAdminActivity(
      "Employee profile updated",
      `${updated.fullName} (${updated.empCode}) updated at ${updated.siteName}.`,
      "Operations"
    );

    res.json({
      success: true,
      message: "Employee updated successfully",
      data: serializeDoc(updated),
    });
  } catch (err) {
    next(err);
  }
};

employeesAdminRouter.patch("/:id", updateEmployeeHandler);
employeesAdminRouter.put("/:id", updateEmployeeHandler);

// ─── DELETE /api/admin/employees/:id ──────────────────────────
employeesAdminRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Employee not found" });
      return;
    }

    if (req.query.mode === "left") {
      const markedLeft = await AdminEmployee.findByIdAndUpdate(
        id,
        { $set: { status: "LEFT", exitDate: todayIso() } },
        { new: true }
      );
      if (!markedLeft) {
        res.status(404).json({ success: false, message: "Employee not found" });
        return;
      }
      await logAdminActivity(
        "Employee marked LEFT",
        `${markedLeft.fullName} (${markedLeft.empCode}) marked as Left.`,
        "Operations"
      );
      res.json({
        success: true,
        message: "Employee marked as LEFT",
        data: serializeDoc(markedLeft),
      });
      return;
    }

    const deleted = await AdminEmployee.findByIdAndDelete(id);
    if (!deleted) {
      res.status(404).json({ success: false, message: "Employee not found" });
      return;
    }

    await logAdminActivity(
      "Employee record removed",
      `${deleted.fullName} (${deleted.empCode}) deleted from directory.`,
      "Operations"
    );

    res.json({
      success: true,
      message: "Employee deleted successfully",
      data: serializeDoc(deleted),
    });
  } catch (err) {
    next(err);
  }
});
