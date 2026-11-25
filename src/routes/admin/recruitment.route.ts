import { Router, Request, Response, NextFunction } from "express";
import { AdminCandidate } from "../../models/admin/AdminOperations.model";
import { escapeRegex, getParamId, logAdminActivity, serializeDoc, todayIso } from "./helpers";

export const recruitmentAdminRouter = Router();

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
    const {
      fullName,
      mobile,
      email,
      position,
      location,
      experience = "Fresher",
      applicationDate,
      status = "New",
      resumeName = "",
      remarks = "",
    } = req.body;

    if (!fullName || !mobile || !email || !position || !location) {
      res.status(400).json({
        success: false,
        message: "Required fields: fullName, mobile, email, position, location",
      });
      return;
    }

    const candidate = await AdminCandidate.create({
      fullName: String(fullName).trim(),
      mobile: String(mobile).trim(),
      email: String(email).trim().toLowerCase(),
      position: String(position).trim(),
      location: String(location).trim(),
      experience: String(experience).trim(),
      applicationDate: applicationDate ? String(applicationDate).trim() : todayIso(),
      status,
      resumeName: String(resumeName).trim(),
      remarks: String(remarks).trim(),
    });

    await logAdminActivity(
      "New candidate added",
      `${candidate.fullName} applied for ${candidate.position}.`,
      "Recruitment"
    );

    res.status(201).json({
      success: true,
      message: "Candidate created successfully",
      data: serializeDoc(candidate),
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH / PUT /api/admin/candidates/:id ────────────────────
const updateCandidateHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const candidate = await AdminCandidate.findByIdAndUpdate(
      getParamId(req),
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!candidate) {
      res.status(404).json({ success: false, message: "Candidate not found" });
      return;
    }

    await logAdminActivity(
      "Candidate updated",
      `${candidate.fullName} status set to ${candidate.status}.`,
      "Recruitment"
    );

    res.json({
      success: true,
      message: "Candidate updated successfully",
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
      "Candidate removed",
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
