import { Router, Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { ATTENDANCE_STATUSES, AdminAttendance, AttendanceStatus } from "../../models/admin/AdminOperations.model";
import {
  escapeRegex,
  getParamId,
  logAdminActivity,
  serializeDoc,
  stripMetaFields,
  todayIso,
} from "./helpers";

export const attendanceAdminRouter = Router();

const MAX_BATCH_SIZE = 500;
const WORKING_STATUSES = new Set<AttendanceStatus>(["Present", "Double Duty", "Half Day"]);

function getDefaultDutyCounts(status: AttendanceStatus): { normalDuty: number; extraDuty: number } {
  switch (status) {
    case "Present":
      return { normalDuty: 1, extraDuty: 0 };
    case "Double Duty":
      return { normalDuty: 1, extraDuty: 1 };
    case "Half Day":
      return { normalDuty: 0.5, extraDuty: 0 };
    case "Absent":
    case "Leave":
    case "Weekly Off":
    default:
      return { normalDuty: 0, extraDuty: 0 };
  }
}

function clampDutyValue(raw: unknown): number | null {
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return null;
  }
  return Math.min(2, parsed);
}

function deriveDutyCounts(
  status: AttendanceStatus,
  normalDuty?: unknown,
  extraDuty?: unknown
): { normalDuty: number; extraDuty: number } {
  const defaults = getDefaultDutyCounts(status);
  const parsedNormal = clampDutyValue(normalDuty);
  const parsedExtra = clampDutyValue(extraDuty);
  return {
    normalDuty: parsedNormal !== null ? parsedNormal : defaults.normalDuty,
    extraDuty: parsedExtra !== null ? parsedExtra : defaults.extraDuty,
  };
}

function getDefaultShiftTimes(status: AttendanceStatus): {
  checkIn: string;
  checkOut: string;
  workingHours: string;
} {
  switch (status) {
    case "Present":
      return { checkIn: "08:00", checkOut: "16:00", workingHours: "8h 00m" };
    case "Double Duty":
      return { checkIn: "08:00", checkOut: "24:00", workingHours: "16h 00m" };
    case "Half Day":
      return { checkIn: "08:00", checkOut: "12:00", workingHours: "4h 00m" };
    default:
      return { checkIn: "—", checkOut: "—", workingHours: "0h 00m" };
  }
}

function normalizeEmployeeId(raw: unknown): string {
  if (raw === undefined || raw === null) return "";
  return String(raw).trim().toUpperCase();
}

function normalizeStringField(raw: unknown): string {
  if (raw === undefined || raw === null) return "";
  return String(raw).trim();
}

interface NormalizedAttendanceInput {
  employeeId: string;
  employeeName: string;
  designation: string;
  location: string;
  date: string;
  checkIn: string;
  checkOut: string;
  workingHours: string;
  status: AttendanceStatus;
  normalDuty: number;
  extraDuty: number;
  remarks?: string;
}

function normalizeAttendanceInput(
  raw: Record<string, any>,
  options: { requireEmployeeName: boolean; requireDate: boolean; requireStatus: boolean }
): { ok: true; value: NormalizedAttendanceInput } | { ok: false; message: string } {
  const employeeId = normalizeEmployeeId(raw.employeeId);
  const employeeName = normalizeStringField(raw.employeeName);
  const location = normalizeStringField(raw.location);
  const rawDate = normalizeStringField(raw.date);
  const date = rawDate || (options.requireDate ? "" : todayIso());

  if (options.requireEmployeeName && !employeeName) {
    return { ok: false, message: "Required fields: employeeName, location, status" };
  }
  if (!employeeId && !employeeName) {
    return { ok: false, message: "Each record requires employeeId or employeeName" };
  }
  if (!location) {
    return { ok: false, message: "Required field: location" };
  }
  if (!date) {
    return { ok: false, message: "Required field: date" };
  }

  const rawStatus =
    raw.status === undefined || raw.status === null || String(raw.status).trim() === ""
      ? options.requireStatus
        ? ""
        : "Present"
      : String(raw.status).trim();

  if (!ATTENDANCE_STATUSES.includes(rawStatus as AttendanceStatus)) {
    return {
      ok: false,
      message: `Invalid status "${rawStatus}". Allowed: ${ATTENDANCE_STATUSES.join(", ")}`,
    };
  }

  const status = rawStatus as AttendanceStatus;
  const designation = normalizeStringField(raw.designation) || "Security Guard";
  const dutyCounts = deriveDutyCounts(status, raw.normalDuty, raw.extraDuty);
  const shiftDefaults = getDefaultShiftTimes(status);

  const checkIn = normalizeStringField(raw.checkIn) || shiftDefaults.checkIn;
  const checkOut = normalizeStringField(raw.checkOut) || shiftDefaults.checkOut;
  const workingHours = normalizeStringField(raw.workingHours) || shiftDefaults.workingHours;
  const hasRemarks = raw.remarks !== undefined;
  const remarks = hasRemarks ? normalizeStringField(raw.remarks).slice(0, 500) : undefined;

  return {
    ok: true,
    value: {
      employeeId,
      employeeName,
      designation,
      location,
      date,
      checkIn,
      checkOut,
      workingHours,
      status,
      normalDuty: dutyCounts.normalDuty,
      extraDuty: dutyCounts.extraDuty,
      ...(hasRemarks ? { remarks } : {}),
    },
  };
}

function getAttendanceMatchKey(item: NormalizedAttendanceInput): string {
  if (item.employeeId) {
    return `id::${item.employeeId}::${item.date}`;
  }
  return `name::${item.employeeName.toLowerCase()}::${item.location.toLowerCase()}::${item.date}`;
}

async function upsertAttendanceEntry(item: NormalizedAttendanceInput) {
  const matchFilter = item.employeeId
    ? { employeeId: item.employeeId, date: item.date }
    : { employeeName: item.employeeName, location: item.location, date: item.date };

  const setPayload: Record<string, any> = {
    employeeId: item.employeeId,
    designation: item.designation,
    location: item.location,
    date: item.date,
    checkIn: item.checkIn,
    checkOut: item.checkOut,
    workingHours: item.workingHours,
    status: item.status,
    normalDuty: item.normalDuty,
    extraDuty: item.extraDuty,
  };
  const setOnInsertPayload: Record<string, any> = {};

  if (item.employeeName) {
    setPayload.employeeName = item.employeeName;
  } else {
    setOnInsertPayload.employeeName = item.employeeId;
  }

  if (item.remarks !== undefined) {
    setPayload.remarks = item.remarks;
  } else {
    setOnInsertPayload.remarks = "";
  }

  const updateOp: Record<string, any> = { $set: setPayload };
  if (Object.keys(setOnInsertPayload).length > 0) {
    updateOp.$setOnInsert = setOnInsertPayload;
  }

  return AdminAttendance.findOneAndUpdate(matchFilter, updateOp, {
    upsert: true,
    new: true,
    runValidators: true,
    setDefaultsOnInsert: true,
  });
}

// ─── GET /api/admin/attendance ────────────────────────────────
attendanceAdminRouter.get("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { site, location, month, date, fromDate, toDate, status, employeeId, search } = req.query;
    const filter: Record<string, any> = {};

    const cleanSite =
      typeof site === "string" && site.trim()
        ? site.trim()
        : typeof location === "string" && location.trim()
          ? location.trim()
          : "";
    if (cleanSite && cleanSite !== "All") {
      filter.location = cleanSite;
    }

    const cleanDate = typeof date === "string" ? date.trim() : "";
    const cleanMonth = typeof month === "string" ? month.trim() : "";
    const cleanFrom = typeof fromDate === "string" ? fromDate.trim() : "";
    const cleanTo = typeof toDate === "string" ? toDate.trim() : "";

    if (cleanDate) {
      filter.date = cleanDate;
    } else {
      const dateRangeFilter: Record<string, unknown> = {};
      if (cleanMonth && /^\d{4}-\d{2}$/.test(cleanMonth)) {
        dateRangeFilter.$regex = `^${escapeRegex(cleanMonth)}-`;
      }
      if (cleanFrom) {
        dateRangeFilter.$gte = cleanFrom;
      }
      if (cleanTo) {
        dateRangeFilter.$lte = cleanTo;
      }
      if (Object.keys(dateRangeFilter).length > 0) {
        filter.date = dateRangeFilter;
      }
    }

    if (typeof status === "string" && status.trim() && status !== "All") {
      filter.status = status.trim();
    }
    if (typeof employeeId === "string" && employeeId.trim()) {
      filter.employeeId = new RegExp(`^${escapeRegex(employeeId.trim())}$`, "i");
    }
    if (typeof search === "string" && search.trim()) {
      const regex = new RegExp(escapeRegex(search.trim()), "i");
      filter.$or = [
        { employeeId: regex },
        { employeeName: regex },
        { designation: regex },
        { location: regex },
      ];
    }

    const records = await AdminAttendance.find(filter).sort({ date: -1, createdAt: -1 }).limit(2500).lean();
    res.json({
      success: true,
      count: records.length,
      data: records.map(serializeDoc),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/attendance/batch ─────────────────────────
attendanceAdminRouter.post(
  "/batch",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { records } = req.body as { records?: unknown };
      if (!Array.isArray(records) || records.length === 0) {
        res.status(400).json({
          success: false,
          message: "Required: records (non-empty array)",
        });
        return;
      }

      if (records.length > MAX_BATCH_SIZE) {
        res.status(400).json({
          success: false,
          message: `Batch limit exceeded: maximum ${MAX_BATCH_SIZE} records allowed per request`,
        });
        return;
      }

      const normalizedByKey = new Map<string, NormalizedAttendanceInput>();
      for (let idx = 0; idx < records.length; idx++) {
        const raw = records[idx];
        if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
          res.status(400).json({
            success: false,
            message: `Record at index ${idx} must be an object`,
          });
          return;
        }
        const normalized = normalizeAttendanceInput(raw as Record<string, any>, {
          requireEmployeeName: false,
          requireDate: true,
          requireStatus: true,
        });
        if (!normalized.ok) {
          res.status(400).json({
            success: false,
            message: `Record at index ${idx}: ${normalized.message}`,
          });
          return;
        }
        normalizedByKey.set(getAttendanceMatchKey(normalized.value), normalized.value);
      }

      const dedupedItems = Array.from(normalizedByKey.values());
      const upserted = [];
      const CHUNK_SIZE = 25;
      for (let i = 0; i < dedupedItems.length; i += CHUNK_SIZE) {
        const chunk = dedupedItems.slice(i, i + CHUNK_SIZE);
        const docs = await Promise.all(chunk.map((item) => upsertAttendanceEntry(item)));
        for (const doc of docs) {
          if (doc) upserted.push(doc);
        }
      }

      await logAdminActivity(
        "Attendance batch saved",
        `Recorded/updated ${upserted.length} attendance entries.`,
        "Attendance"
      );

      res.status(200).json({
        success: true,
        message: `Saved ${upserted.length} attendance records`,
        data: {
          records: upserted.map(serializeDoc),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/admin/attendance ───────────────────────────────
attendanceAdminRouter.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const normalized = normalizeAttendanceInput((req.body || {}) as Record<string, any>, {
      requireEmployeeName: true,
      requireDate: false,
      requireStatus: false,
    });

    if (!normalized.ok) {
      res.status(400).json({
        success: false,
        message: normalized.message,
      });
      return;
    }

    const record = await upsertAttendanceEntry(normalized.value);
    if (!record) {
      res.status(500).json({ success: false, message: "Failed to save attendance record" });
      return;
    }

    await logAdminActivity(
      "Attendance marked",
      `${record.employeeName} marked ${record.status} for ${record.date}.`,
      "Attendance"
    );

    res.status(201).json({
      success: true,
      message: "Attendance record saved",
      data: serializeDoc(record),
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/admin/attendance/bulk ─────────────────────────
attendanceAdminRouter.patch("/bulk", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { ids, status, normalDuty, extraDuty, remarks } = req.body as {
      ids?: unknown;
      status?: AttendanceStatus;
      normalDuty?: unknown;
      extraDuty?: unknown;
      remarks?: unknown;
    };
    if (!Array.isArray(ids) || ids.length === 0 || !status || !ATTENDANCE_STATUSES.includes(status)) {
      res.status(400).json({
        success: false,
        message: `Required: ids (non-empty array) and status (${ATTENDANCE_STATUSES.join(", ")})`,
      });
      return;
    }

    const validIds = ids.filter((id): id is string => typeof id === "string" && mongoose.Types.ObjectId.isValid(id));
    if (validIds.length === 0) {
      res.status(400).json({ success: false, message: "No valid attendance record IDs provided" });
      return;
    }

    const shiftDefaults = getDefaultShiftTimes(status);
    const dutyCounts = deriveDutyCounts(status, normalDuty, extraDuty);
    const updatePayload: Record<string, any> = {
      status,
      checkOut: shiftDefaults.checkOut,
      workingHours: shiftDefaults.workingHours,
      normalDuty: dutyCounts.normalDuty,
      extraDuty: dutyCounts.extraDuty,
    };

    if (!WORKING_STATUSES.has(status)) {
      updatePayload.checkIn = "—";
    }
    if (typeof remarks === "string") {
      updatePayload.remarks = remarks.trim().slice(0, 500);
    }

    const result = await AdminAttendance.updateMany({ _id: { $in: validIds } }, { $set: updatePayload });
    if (WORKING_STATUSES.has(status)) {
      await AdminAttendance.updateMany(
        { _id: { $in: validIds }, checkIn: { $in: ["—", "", "-"] } },
        { $set: { checkIn: shiftDefaults.checkIn } }
      );
    }

    await logAdminActivity(
      "Bulk attendance updated",
      `${result.modifiedCount} employees marked as ${status}.`,
      "Attendance"
    );

    res.json({
      success: true,
      message: `Updated ${result.modifiedCount} attendance records`,
      data: { modifiedCount: result.modifiedCount },
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH / PUT /api/admin/attendance/:id ────────────────────
const updateAttendanceHandler = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Attendance record not found" });
      return;
    }

    const existing = await AdminAttendance.findById(id);
    if (!existing) {
      res.status(404).json({ success: false, message: "Attendance record not found" });
      return;
    }

    const updates = stripMetaFields(req.body);

    if (updates.status !== undefined) {
      const cleanStatus = typeof updates.status === "string" ? updates.status.trim() : "";
      if (!ATTENDANCE_STATUSES.includes(cleanStatus as AttendanceStatus)) {
        res.status(400).json({
          success: false,
          message: `Invalid status. Allowed values: ${ATTENDANCE_STATUSES.join(", ")}`,
        });
        return;
      }
      updates.status = cleanStatus;
    }

    if (updates.employeeId !== undefined) {
      updates.employeeId = normalizeEmployeeId(updates.employeeId);
    }
    if (updates.employeeName !== undefined) {
      const cleanName = normalizeStringField(updates.employeeName);
      if (!cleanName) {
        res.status(400).json({ success: false, message: "employeeName cannot be empty" });
        return;
      }
      updates.employeeName = cleanName;
    }
    if (updates.designation !== undefined) {
      updates.designation = normalizeStringField(updates.designation) || "Security Guard";
    }
    if (updates.location !== undefined) {
      const cleanLoc = normalizeStringField(updates.location);
      if (!cleanLoc) {
        res.status(400).json({ success: false, message: "location cannot be empty" });
        return;
      }
      updates.location = cleanLoc;
    }
    if (updates.date !== undefined) {
      const cleanDate = normalizeStringField(updates.date);
      if (!cleanDate) {
        res.status(400).json({ success: false, message: "date cannot be empty" });
        return;
      }
      updates.date = cleanDate;
    }
    if (updates.remarks !== undefined) {
      updates.remarks = normalizeStringField(updates.remarks).slice(0, 500);
    }

    const effectiveStatus = (updates.status ?? existing.status) as AttendanceStatus;
    if (
      updates.status !== undefined ||
      updates.normalDuty !== undefined ||
      updates.extraDuty !== undefined
    ) {
      const dutyCounts = deriveDutyCounts(
        effectiveStatus,
        updates.normalDuty !== undefined
          ? updates.normalDuty
          : updates.status !== undefined
            ? undefined
            : existing.normalDuty,
        updates.extraDuty !== undefined
          ? updates.extraDuty
          : updates.status !== undefined
            ? undefined
            : existing.extraDuty
      );
      updates.normalDuty = dutyCounts.normalDuty;
      updates.extraDuty = dutyCounts.extraDuty;
    }

    if (updates.status !== undefined) {
      const shiftDefaults = getDefaultShiftTimes(effectiveStatus);
      const isWorking = WORKING_STATUSES.has(effectiveStatus);
      if (updates.checkIn === undefined) {
        if (!isWorking) {
          updates.checkIn = "—";
        } else if (!existing.checkIn || existing.checkIn === "—") {
          updates.checkIn = shiftDefaults.checkIn;
        }
      }
      if (updates.checkOut === undefined) {
        updates.checkOut = shiftDefaults.checkOut;
      }
      if (updates.workingHours === undefined) {
        updates.workingHours = shiftDefaults.workingHours;
      }
    }

    const updated = await AdminAttendance.findByIdAndUpdate(
      id,
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!updated) {
      res.status(404).json({ success: false, message: "Attendance record not found" });
      return;
    }

    await logAdminActivity(
      "Attendance updated",
      `${updated.employeeName} marked ${updated.status} for ${updated.date}.`,
      "Attendance"
    );

    res.json({
      success: true,
      message: "Attendance record updated",
      data: serializeDoc(updated),
    });
  } catch (err) {
    next(err);
  }
};

attendanceAdminRouter.patch("/:id", updateAttendanceHandler);
attendanceAdminRouter.put("/:id", updateAttendanceHandler);

// ─── DELETE /api/admin/attendance/:id ─────────────────────────
attendanceAdminRouter.delete("/:id", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const id = getParamId(req);
    if (!mongoose.Types.ObjectId.isValid(id)) {
      res.status(404).json({ success: false, message: "Attendance record not found" });
      return;
    }

    const deleted = await AdminAttendance.findByIdAndDelete(id);
    if (!deleted) {
      res.status(404).json({ success: false, message: "Attendance record not found" });
      return;
    }
    res.json({ success: true, message: "Attendance record deleted", data: serializeDoc(deleted) });
  } catch (err) {
    next(err);
  }
});
