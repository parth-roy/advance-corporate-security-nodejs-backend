import { Router, Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import {
  AdminEmployee,
  EMPLOYEE_RATE_TYPES,
  EmployeeRateType,
} from "../../models/admin/AdminCore.model";
import { AdminCandidate } from "../../models/admin/AdminOperations.model";
import {
  generateNextEmployeeCode,
  isSyntheticEmployeeCode,
  parseNumericRate,
  resolveOrCreateSite,
  sanitizeBankDetails,
  sanitizeDocuments,
  sanitizeFamilyMembers,
} from "../../services/employeeCode.service";
import {
  handleDocumentMultipart,
  processDocumentUpload,
} from "../../services/upload.service";
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

export const recruitmentAdminRouter = Router();

const TEN_DIGIT_MOBILE_RE = /^\d{10}$/;
const EMPLOYEE_ID_RE = /^[A-Z0-9][A-Z0-9/-]{0,59}$/;

async function resolveValidatedEmployeeId(
  rawValue: unknown,
  excludeId?: string
): Promise<{ employeeId: string; status?: number; message?: string }> {
  const employeeId =
    rawValue === undefined || rawValue === null ? "" : String(rawValue).trim().toUpperCase();

  if (!employeeId) {
    return { employeeId: "" };
  }

  if (!EMPLOYEE_ID_RE.test(employeeId)) {
    return {
      employeeId,
      status: 400,
      message:
        "Employee ID must be up to 60 characters using only letters, numbers, slashes (/), or hyphens (-).",
    };
  }

  const conflictFilter: Record<string, unknown> = { employeeId };
  if (excludeId) {
    conflictFilter._id = { $ne: excludeId };
  }

  const existing = await AdminCandidate.findOne(conflictFilter).select("_id").lean();
  if (existing) {
    return {
      employeeId,
      status: 409,
      message: `Employee ID "${employeeId}" is already assigned to another candidate.`,
    };
  }

  return { employeeId };
}

function normalizeIdentificationMarks(rawMark: unknown, rawMarks: unknown) {
  const fromArray = Array.isArray(rawMarks)
    ? rawMarks.map((item) => (typeof item === "string" ? item.trim() : "")).filter(Boolean)
    : [];
  const fromString =
    typeof rawMark === "string"
      ? rawMark
          .split(/[;,]+/)
          .map((item) => item.trim())
          .filter(Boolean)
      : [];

  const source = fromArray.length > 0 ? fromArray : fromString;
  const identificationMarks = Array.from(
    new Set(source.filter((item) => item !== "__OTHER__")),
  );
  const identificationMark =
    identificationMarks.length > 0
      ? identificationMarks.join(", ")
      : typeof rawMark === "string" && rawMark.trim() !== "__OTHER__"
        ? rawMark.trim()
        : "";

  return { identificationMark, identificationMarks };
}

// ─── GET /api/admin/candidates ────────────────────────────────
recruitmentAdminRouter.get("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, search, site, siteId, designation, fromDate, toDate } = req.query;
    const filter: Record<string, any> = {};

    if (typeof status === "string" && status.trim() && status !== "All") {
      filter.status = status.trim();
    }
    if (typeof siteId === "string" && mongoose.Types.ObjectId.isValid(siteId.trim())) {
      filter.siteId = siteId.trim();
    } else if (typeof site === "string" && site.trim() && site !== "All") {
      filter.location = site.trim();
    }
    if (typeof designation === "string" && designation.trim() && designation !== "All") {
      filter.position = designation.trim();
    }
    const cleanFrom = typeof fromDate === "string" ? fromDate.trim() : "";
    const cleanTo = typeof toDate === "string" ? toDate.trim() : "";
    if (cleanFrom || cleanTo) {
      const dateRange: Record<string, string> = {};
      if (cleanFrom) dateRange.$gte = cleanFrom;
      if (cleanTo) dateRange.$lte = cleanTo;
      filter.applicationDate = dateRange;
    }
    if (typeof search === "string" && search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), "i");
      filter.$or = [
        { employeeId: regex },
        { fullName: regex },
        { email: regex },
        { mobile: regex },
        { position: regex },
        { location: regex },
      ];
    }

    const usePagination = req.query.page !== undefined || req.query.limit !== undefined;
    if (usePagination) {
      const { page, limit, skip } = parsePaginationParams(req.query, 25, 250);
      const [candidates, total] = await Promise.all([
        AdminCandidate.find(filter).sort({ createdAt: -1 }).skip(skip).limit(limit).lean(),
        AdminCandidate.countDocuments(filter),
      ]);
      res.json({
        success: true,
        count: candidates.length,
        data: candidates.map(serializeDoc),
        pagination: buildPaginationMeta(page, limit, total),
      });
      return;
    }

    const candidates = await AdminCandidate.find(filter).sort({ createdAt: -1 }).limit(500).lean();
    res.json({
      success: true,
      count: candidates.length,
      data: candidates.map(serializeDoc),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/candidates/upload-document ────────────────
recruitmentAdminRouter.post(
  "/upload-document",
  handleDocumentMultipart,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await processDocumentUpload(req, res, "recruitment-docs");
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/admin/candidates/:id ────────────────────────────
recruitmentAdminRouter.get("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const candidateId = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(candidateId)) {
      res.status(404).json({ success: false, message: "Candidate not found" });
      return;
    }
    const candidate = await AdminCandidate.findById(candidateId).lean();
    if (!candidate) {
      res.status(404).json({ success: false, message: "Candidate not found" });
      return;
    }
    res.json({ success: true, data: serializeDoc(candidate) });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/candidates ───────────────────────────────
recruitmentAdminRouter.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const body = stripMetaFields(req.body);
    const {
      fullName,
      mobile,
      email = "",
      position,
      location,
      experience = "",
      applicationDate,
      status = "New",
      esiHolder = "",
      esiNumber = "",
      uanNumber = "",
      resumeName = "",
      remarks = "",
    } = body;

    if (!fullName || !mobile || !position || !location) {
      res.status(400).json({
        success: false,
        message: "Required fields: fullName, mobile, position, location",
      });
      return;
    }

    const cleanMobile = String(mobile).trim();
    if (!TEN_DIGIT_MOBILE_RE.test(cleanMobile)) {
      res.status(400).json({
        success: false,
        message: "Mobile Number must be exactly 10 digits.",
      });
      return;
    }

    if (esiHolder === "Yes" && (!String(esiNumber).trim() || !String(uanNumber).trim())) {
      res.status(400).json({
        success: false,
        message: "Both ESI No and UAN No are required when ESI Holder is Yes.",
      });
      return;
    }

    if (String(body.serviceCategory || "").trim() === "Other") {
      res.status(400).json({
        success: false,
        message: "Please specify the Civil / Defense value when Other is selected.",
      });
      return;
    }

    const idCheck = await resolveValidatedEmployeeId(body.employeeId);
    if (idCheck.status) {
      res.status(idCheck.status).json({
        success: false,
        message: idCheck.message,
      });
      return;
    }

    const { identificationMark, identificationMarks } = normalizeIdentificationMarks(
      body.identificationMark,
      body.identificationMarks,
    );

    const resolvedSite = await resolveOrCreateSite({
      siteId: typeof body.siteId === "string" ? body.siteId : null,
      siteName: String(location).trim(),
    });

    const candidate = await AdminCandidate.create({
      ...body,
      employeeId: idCheck.employeeId,
      siteId: resolvedSite?._id ?? null,
      fullName: String(fullName).trim(),
      mobile: cleanMobile,
      email: String(email).trim().toLowerCase(),
      position: String(position).trim(),
      identificationMark,
      identificationMarks,
      location: resolvedSite?.siteName || String(location).trim(),
      experience: String(experience).trim(),
      applicationDate: applicationDate ? String(applicationDate).trim() : todayIso(),
      status: status || "New",
      esiHolder,
      esiNumber: esiHolder === "Yes" ? String(esiNumber).trim() : "",
      uanNumber: esiHolder === "Yes" ? String(uanNumber).trim() : "",
      familyMembers: sanitizeFamilyMembers(body.familyMembers),
      documents: sanitizeDocuments(body.documents),
      resumeName: String(resumeName).trim(),
      remarks: String(remarks).trim(),
    });

    await logAdminActivity(
      "New employee application added",
      `${candidate.fullName} registered for ${candidate.position}.`,
      "Recruitment"
    );

    res.status(201).json({
      success: true,
      message: "Employee application saved successfully",
      data: serializeDoc(candidate),
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH / PUT /api/admin/candidates/:id ────────────────────
const updateCandidateHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const candidateId = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(candidateId)) {
      res.status(404).json({ success: false, message: "Candidate not found" });
      return;
    }

    const updates = stripMetaFields(req.body);

    if (updates.employeeId !== undefined) {
      const idCheck = await resolveValidatedEmployeeId(updates.employeeId, candidateId);
      if (idCheck.status) {
        res.status(idCheck.status).json({
          success: false,
          message: idCheck.message,
        });
        return;
      }
      updates.employeeId = idCheck.employeeId;
    }

    if (updates.mobile !== undefined) {
      const cleanMobile = String(updates.mobile).trim();
      if (!TEN_DIGIT_MOBILE_RE.test(cleanMobile)) {
        res.status(400).json({
          success: false,
          message: "Mobile Number must be exactly 10 digits.",
        });
        return;
      }
      updates.mobile = cleanMobile;
    }

    if (updates.esiHolder === "Yes") {
      if (!String(updates.esiNumber || "").trim() || !String(updates.uanNumber || "").trim()) {
        res.status(400).json({
          success: false,
          message: "Both ESI No and UAN No are required when ESI Holder is Yes.",
        });
        return;
      }
    } else if (updates.esiHolder === "No") {
      updates.esiNumber = "";
      updates.uanNumber = "";
    }

    if (updates.serviceCategory !== undefined && String(updates.serviceCategory || "").trim() === "Other") {
      res.status(400).json({
        success: false,
        message: "Please specify the Civil / Defense value when Other is selected.",
      });
      return;
    }

    if (updates.familyMembers !== undefined) {
      updates.familyMembers = sanitizeFamilyMembers(updates.familyMembers);
    }

    if (updates.documents !== undefined) {
      updates.documents = sanitizeDocuments(updates.documents);
    }

    if (updates.identificationMark !== undefined || updates.identificationMarks !== undefined) {
      const normalized = normalizeIdentificationMarks(
        updates.identificationMark,
        updates.identificationMarks,
      );
      updates.identificationMark = normalized.identificationMark;
      updates.identificationMarks = normalized.identificationMarks;
    }

    if (updates.location !== undefined || updates.siteId !== undefined) {
      const resolvedSite = await resolveOrCreateSite({
        siteId: typeof updates.siteId === "string" ? updates.siteId : null,
        siteName: typeof updates.location === "string" ? updates.location.trim() : undefined,
      });
      if (resolvedSite) {
        updates.siteId = resolvedSite._id;
        updates.location = resolvedSite.siteName;
      }
    }

    const candidate = await AdminCandidate.findByIdAndUpdate(
      getParamId(req),
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!candidate) {
      res.status(404).json({ success: false, message: "Candidate not found" });
      return;
    }

    await logAdminActivity(
      "Employee application updated",
      `${candidate.fullName} status set to ${candidate.status}.`,
      "Recruitment"
    );

    res.json({
      success: true,
      message: "Employee application updated successfully",
      data: serializeDoc(candidate),
    });
  } catch (err) {
    next(err);
  }
};

recruitmentAdminRouter.patch("/:id", updateCandidateHandler);
recruitmentAdminRouter.put("/:id", updateCandidateHandler);

// ─── POST /api/admin/candidates/:id/deploy ────────────────────
// Promotes an applicant candidate into a standalone deployed AdminEmployee linked to an AdminSite
recruitmentAdminRouter.post(
  "/:id/deploy",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const candidateId = getParamId(req);
      if (!mongoose.Types.ObjectId.isValid(candidateId)) {
        res.status(404).json({ success: false, message: "Candidate not found" });
        return;
      }

      const candidate = await AdminCandidate.findById(candidateId);
      if (!candidate) {
        res.status(404).json({ success: false, message: "Candidate not found" });
        return;
      }

      const body = stripMetaFields(req.body);
      const targetSiteName = String(body.siteName || body.location || candidate.location || "").trim();
      const targetSiteId = typeof body.siteId === "string" ? body.siteId.trim() : "";

      const siteDoc = await resolveOrCreateSite({
        siteId: targetSiteId || (candidate.siteId ? String(candidate.siteId) : null),
        siteName: targetSiteName,
      });
      if (!siteDoc) {
        res.status(400).json({
          success: false,
          message: "Deployment site is required to promote a candidate to employee.",
        });
        return;
      }

      const designation = String(
        body.designation || candidate.joiningAs || candidate.position || "Security Guard"
      ).trim();

      const rateTypeRaw = String(body.rateType || "").trim().toUpperCase();
      const inferredRate =
        body.baseRate !== undefined ? Number(body.baseRate) : parseNumericRate(candidate.salary);
      const baseRate = Number.isFinite(inferredRate) && inferredRate >= 0 ? inferredRate : 0;
      const rateType: EmployeeRateType = (EMPLOYEE_RATE_TYPES as readonly string[]).includes(rateTypeRaw)
        ? (rateTypeRaw as EmployeeRateType)
        : baseRate > 0 && baseRate < 2500
          ? "DAILY"
          : "MONTHLY";

      // Resolve existing employee if candidate was already deployed, otherwise create new
      let employee = candidate.convertedEmployeeObjectId
        ? await AdminEmployee.findById(candidate.convertedEmployeeObjectId)
        : null;

      let requestedCode = String(body.empCode || candidate.employeeId || "").trim().toUpperCase();
      if (requestedCode && isSyntheticEmployeeCode(requestedCode)) {
        requestedCode = "";
      }

      if (!employee) {
        const finalCode =
          requestedCode ||
          (await generateNextEmployeeCode({
            designation,
            year: String(body.dateOfJoining || candidate.dateOfJoining || candidate.applicationDate || "").slice(0, 4),
          }));

        const conflict = await AdminEmployee.findOne({ empCode: finalCode });
        if (conflict && String(conflict.candidateId || "") !== String(candidate._id)) {
          res.status(409).json({
            success: false,
            message: `Employee ID "${finalCode}" is already assigned to ${conflict.fullName}.`,
          });
          return;
        }

        employee =
          conflict ||
          (await AdminEmployee.create({
            empCode: finalCode,
            legacyEmpCode: String(body.legacyEmpCode || "").trim().toUpperCase(),
            candidateId: candidate._id,
            primarySiteId: siteDoc._id,
            siteName: siteDoc.siteName,
            subUnit: String(body.subUnit || "").trim(),
            fullName: candidate.fullName,
            fatherOrHusbandName: candidate.fatherOrHusbandName || "",
            dateOfBirth: candidate.dateOfBirth || "",
            permanentAddress: candidate.permanentAddress || "",
            presentAddress: candidate.presentAddress || "",
            maritalStatus: candidate.maritalStatus || "",
            highestQualification: candidate.highestQualification || "",
            mobile: candidate.mobile,
            email: candidate.email || "",
            designation,
            serviceCategory: candidate.serviceCategory || "",
            dateOfJoining: String(body.dateOfJoining || candidate.dateOfJoining || todayIso()).trim(),
            rateType,
            baseRate,
            bankDetails: sanitizeBankDetails(body.bankDetails),
            statutory: {
              esiHolder: candidate.esiHolder || "",
              esiNumber: candidate.esiNumber || candidate.documents?.previousEsiPf?.esiNumber || "",
              pfUan: candidate.uanNumber || candidate.documents?.previousEsiPf?.pfNumber || "",
            },
            originalIdCustody: body.originalIdCustody
              ? {
                  documentType: String(body.originalIdCustody.documentType || "").trim(),
                  referenceNo: String(body.originalIdCustody.referenceNo || "").trim(),
                  depositedDate: String(body.originalIdCustody.depositedDate || "").trim(),
                  inCustody: Boolean(body.originalIdCustody.inCustody),
                  notes: String(body.originalIdCustody.notes || "").trim(),
                }
              : undefined,
            nomineeName: candidate.nomineeName || "",
            familyMembers: candidate.familyMembers || [],
            documents: candidate.documents || {},
            remarks: String(body.remarks ?? candidate.remarks ?? "").trim(),
            status: "ACTIVE",
          }));
      } else {
        employee.primarySiteId = siteDoc._id;
        employee.siteName = siteDoc.siteName;
        employee.designation = designation;
        employee.baseRate = baseRate;
        employee.rateType = rateType;
        if (body.subUnit !== undefined) employee.subUnit = String(body.subUnit).trim();
        if (body.legacyEmpCode !== undefined) {
          employee.legacyEmpCode = String(body.legacyEmpCode).trim().toUpperCase();
        }
        if (body.dateOfJoining) employee.dateOfJoining = String(body.dateOfJoining).trim();
        if (body.bankDetails) employee.bankDetails = sanitizeBankDetails(body.bankDetails);
        await employee.save();
      }

      candidate.status = "Selected";
      candidate.employeeId = employee.empCode;
      candidate.siteId = siteDoc._id;
      candidate.location = siteDoc.siteName;
      candidate.joiningAs = designation;
      candidate.dateOfJoining = employee.dateOfJoining;
      candidate.convertedEmployeeObjectId = employee._id;
      candidate.convertedAt = candidate.convertedAt || todayIso();
      await candidate.save();

      await logAdminActivity(
        "Candidate deployed to site",
        `${candidate.fullName} (${employee.empCode}) deployed to ${siteDoc.siteName}.`,
        "Recruitment"
      );

      res.json({
        success: true,
        message: `${candidate.fullName} deployed as employee ${employee.empCode}`,
        data: {
          candidate: serializeDoc(candidate),
          employee: serializeDoc(employee),
          site: serializeDoc(siteDoc),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── DELETE /api/admin/candidates/:id ─────────────────────────
recruitmentAdminRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const candidateId = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(candidateId)) {
      res.status(404).json({ success: false, message: "Candidate not found" });
      return;
    }
    const deleted = await AdminCandidate.findByIdAndDelete(candidateId);
    if (!deleted) {
      res.status(404).json({ success: false, message: "Candidate not found" });
      return;
    }

    await logAdminActivity(
      "Employee application removed",
      `${deleted.fullName} removed from recruitment pipeline.`,
      "Recruitment"
    );

    res.json({
      success: true,
      message: "Candidate deleted successfully",
      data: serializeDoc(deleted),
    });
  } catch (err) {
    next(err);
  }
});
