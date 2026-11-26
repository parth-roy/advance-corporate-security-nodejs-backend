import { Router, Request, Response, NextFunction } from "express";
import { AdminCandidate } from "../../models/admin/AdminOperations.model";
import {
  escapeRegex,
  getParamId,
  logAdminActivity,
  serializeDoc,
  stripMetaFields,
  todayIso,
} from "./helpers";

export const recruitmentAdminRouter = Router();

const TEN_DIGIT_MOBILE_RE = /^\d{10}$/;

function sanitizeFamilyMembers(raw: unknown) {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => ({
      name: typeof item?.name === "string" ? item.name.trim() : "",
      relation: typeof item?.relation === "string" ? item.relation.trim() : "",
      dateOfBirth: typeof item?.dateOfBirth === "string" ? item.dateOfBirth.trim() : "",
    }))
    .filter((m) => m.name || m.relation || m.dateOfBirth);
}

// ─── GET /api/admin/candidates ────────────────────────────────
recruitmentAdminRouter.get("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { status, search } = req.query;
    const filter: Record<string, any> = {};

    if (typeof status === "string" && status !== "All") {
      filter.status = status;
    }
    if (typeof search === "string" && search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), "i");
      filter.$or = [
        { fullName: regex },
        { email: regex },
        { mobile: regex },
        { position: regex },
        { location: regex },
      ];
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

// ─── GET /api/admin/candidates/:id ────────────────────────────
recruitmentAdminRouter.get("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const candidate = await AdminCandidate.findById(getParamId(req)).lean();
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

    const candidate = await AdminCandidate.create({
      ...body,
      fullName: String(fullName).trim(),
      mobile: cleanMobile,
      email: String(email).trim().toLowerCase(),
      position: String(position).trim(),
      location: String(location).trim(),
      experience: String(experience).trim(),
      applicationDate: applicationDate ? String(applicationDate).trim() : todayIso(),
      status: status || "New",
      esiHolder,
      esiNumber: esiHolder === "Yes" ? String(esiNumber).trim() : "",
      uanNumber: esiHolder === "Yes" ? String(uanNumber).trim() : "",
      familyMembers: sanitizeFamilyMembers(body.familyMembers),
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
    const updates = stripMetaFields(req.body);

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

// ─── DELETE /api/admin/candidates/:id ─────────────────────────
recruitmentAdminRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const deleted = await AdminCandidate.findByIdAndDelete(getParamId(req));
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
