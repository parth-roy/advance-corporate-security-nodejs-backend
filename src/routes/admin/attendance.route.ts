import { Router, Request, Response, NextFunction } from "express";
import { ATTENDANCE_STATUSES, AdminAttendance, AttendanceStatus } from "../../models/admin/AdminOperations.model";
import { escapeRegex, getParamId, logAdminActivity, serializeDoc, todayIso } from "./helpers";

export const attendanceAdminRouter = Router();

// ─── GET /api/admin/attendance ────────────────────────────────
attendanceAdminRouter.get("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { date, status, employeeId, search } = req.query;
    const filter: Record<string, any> = {};

    if (typeof date === "string" && date.trim()) {
      filter.date = date.trim();
    }
    if (typeof status === "string" && status !== "All") {
      filter.status = status;
    }
    if (typeof employeeId === "string" && employeeId.trim()) {
      filter.employeeId = employeeId.trim();
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

    const records = await AdminAttendance.find(filter).sort({ date: -1, createdAt: -1 }).limit(500).lean();
    res.json({
      success: true,
      count: records.length,
      data: records.map(serializeDoc),
    });
  } catch (err) {
    next(err);
  }
});

// ─── POST /api/admin/attendance ───────────────────────────────
attendanceAdminRouter.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      employeeId,
      employeeName,
      designation,
      location,
      date,
      checkIn = "08:00",
      checkOut = "16:00",
      workingHours = "8h 00m",
      status = "Present",
    } = req.body;

    if (!employeeId || !employeeName || !designation || !location) {
      res.status(400).json({
        success: false,
        message: "Required fields: employeeId, employeeName, designation, location",
      });
      return;
    }

    const record = await AdminAttendance.create({
      employeeId: String(employeeId).trim(),
      employeeName: String(employeeName).trim(),
      designation: String(designation).trim(),
      location: String(location).trim(),
      date: date ? String(date).trim() : todayIso(),
      checkIn: String(checkIn).trim(),
      checkOut: String(checkOut).trim(),
      workingHours: String(workingHours).trim(),
      status,
    });

    await logAdminActivity(
      "Attendance marked",
      `${record.employeeName} marked ${record.status} for ${record.date}.`,
      "Attendance"
    );

    res.status(201).json({
      success: true,
      message: "Attendance record created",
      data: serializeDoc(record),
    });
  } catch (err) {
    next(err);
  }
});

// ─── PATCH /api/admin/attendance/bulk ─────────────────────────
attendanceAdminRouter.patch("/bulk", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { ids, status } = req.body as { ids?: string[]; status?: AttendanceStatus };
    if (!Array.isArray(ids) || ids.length === 0 || !status || !ATTENDANCE_STATUSES.includes(status)) {
      res.status(400).json({
        success: false,
        message: `Required: ids (non-empty array) and status (${ATTENDANCE_STATUSES.join(", ")})`,
      });
      return;
    }

    const checkOut = status === "Present" ? "16:00" : status === "Half Day" ? "12:15" : "—";
    const workingHours = status === "Present" ? "8h 00m" : status === "Half Day" ? "4h 15m" : "0h 00m";

    const updatePayload: Record<string, any> = { status, checkOut, workingHours };
    if (status !== "Present" && status !== "Half Day") {
      updatePayload.checkIn = "—";
    }

    const result = await AdminAttendance.updateMany({ _id: { $in: ids } }, { $set: updatePayload });

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
    const updated = await AdminAttendance.findByIdAndUpdate(
      getParamId(req),
      { $set: req.body },
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
    const deleted = await AdminAttendance.findByIdAndDelete(getParamId(req));
    if (!deleted) {
      res.status(404).json({ success: false, message: "Attendance record not found" });
      return;
    }
    res.json({ success: true, message: "Attendance record deleted", data: serializeDoc(deleted) });
  } catch (err) {
    next(err);
  }
});
