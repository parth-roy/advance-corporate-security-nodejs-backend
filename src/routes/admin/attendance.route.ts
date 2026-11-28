import { Router, Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { AdminEmployee, AdminSite, IAdminEmployee, IAdminSite } from "../../models/admin/AdminCore.model";
import {
  ATTENDANCE_DUTY_TYPES,
  ATTENDANCE_STATUSES,
  AdminAttendance,
  AdminCandidate,
  AdminSiteMusterApproval,
  AttendanceDutyType,
  AttendanceStatus,
  MUSTER_VERIFICATION_STATUSES,
  MusterVerificationStatus,
} from "../../models/admin/AdminOperations.model";
import { AdminSalary, AdminStatutory } from "../../models/admin/AdminFinance.model";
import { sanitizeUploadedDoc } from "../../services/employeeCode.service";
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

export const attendanceAdminRouter = Router();

const MAX_BATCH_SIZE = 500;
const WORKING_STATUSES = new Set<AttendanceStatus>([
  "Present",
  "Double Duty",
  "Half Day",
  "National Holiday",
]);

function getDaysInYearMonth(yearMonth: string): number {
  const [yStr, mStr] = yearMonth.split("-");
  const y = Number(yStr);
  const m = Number(mStr);
  if (!Number.isInteger(y) || !Number.isInteger(m) || m < 1 || m > 12) return 30;
  return new Date(y, m, 0).getDate();
}

function getDefaultDutyMeta(status: AttendanceStatus): {
  dutyType: AttendanceDutyType;
  normalDuty: number;
  extraDuty: number;
  shiftFraction: number;
  checkIn: string;
  checkOut: string;
  workingHours: string;
} {
  switch (status) {
    case "Present":
      return {
        dutyType: "P",
        normalDuty: 1,
        extraDuty: 0,
        shiftFraction: 1,
        checkIn: "08:00",
        checkOut: "16:00",
        workingHours: "8h 00m",
      };
    case "Double Duty":
      return {
        dutyType: "P/P",
        normalDuty: 1,
        extraDuty: 1,
        shiftFraction: 1,
        checkIn: "08:00",
        checkOut: "24:00",
        workingHours: "16h 00m",
      };
    case "Half Day":
      return {
        dutyType: "H",
        normalDuty: 0.5,
        extraDuty: 0,
        shiftFraction: 0.5,
        checkIn: "08:00",
        checkOut: "12:00",
        workingHours: "4h 00m",
      };
    case "National Holiday":
      return {
        dutyType: "NH",
        normalDuty: 1,
        extraDuty: 0,
        shiftFraction: 1,
        checkIn: "08:00",
        checkOut: "16:00",
        workingHours: "8h 00m",
      };
    case "Absent":
      return {
        dutyType: "A",
        normalDuty: 0,
        extraDuty: 0,
        shiftFraction: 0,
        checkIn: "—",
        checkOut: "—",
        workingHours: "0h 00m",
      };
    case "Leave":
      return {
        dutyType: "L",
        normalDuty: 0,
        extraDuty: 0,
        shiftFraction: 0,
        checkIn: "—",
        checkOut: "—",
        workingHours: "0h 00m",
      };
    case "Weekly Off":
    default:
      return {
        dutyType: "WO",
        normalDuty: 0,
        extraDuty: 0,
        shiftFraction: 0,
        checkIn: "—",
        checkOut: "—",
        workingHours: "0h 00m",
      };
  }
}

function clampDutyValue(raw: unknown, max = 3): number | null {
  if (raw === undefined || raw === null || (typeof raw === "string" && raw.trim() === "")) {
    return null;
  }
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) return null;
  return Math.min(max, parsed);
}

function deriveDutyCounts(
  status: AttendanceStatus,
  normalDuty?: unknown,
  extraDuty?: unknown,
  shiftFraction?: unknown,
  otHours?: unknown,
  otDayEquivalent?: unknown
) {
  const defaults = getDefaultDutyMeta(status);
  const parsedFraction = clampDutyValue(shiftFraction, 3);
  const resolvedFraction = parsedFraction !== null ? parsedFraction : defaults.shiftFraction;
  const parsedNormal = clampDutyValue(normalDuty, 3);
  const resolvedNormal =
    parsedNormal !== null
      ? parsedNormal
      : parsedFraction !== null && status !== "Absent" && status !== "Leave" && status !== "Weekly Off"
        ? parsedFraction
        : defaults.normalDuty;

  const parsedOtHours = clampDutyValue(otHours, 24) ?? 0;
  const parsedExtra = clampDutyValue(extraDuty, 3);
  const parsedOtEq = clampDutyValue(otDayEquivalent, 3);

  const resolvedExtra = parsedExtra !== null ? parsedExtra : defaults.extraDuty;
  const resolvedOtEq =
    parsedOtEq !== null
      ? parsedOtEq
      : parsedOtHours > 0
        ? Number((parsedOtHours / 8).toFixed(3))
        : resolvedExtra;

  return {
    dutyType: parsedFraction !== null && parsedFraction !== defaults.shiftFraction ? "CUSTOM" : defaults.dutyType,
    shiftFraction: resolvedFraction,
    normalDuty: resolvedNormal,
    extraDuty: resolvedExtra,
    otHours: parsedOtHours,
    otDayEquivalent: resolvedOtEq,
  };
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
  workSiteId?: string;
  employeeObjectId?: string;
  employeeId: string;
  employeeName: string;
  designation: string;
  location: string;
  date: string;
  monthKey: string;
  checkIn: string;
  checkOut: string;
  workingHours: string;
  status: AttendanceStatus;
  dutyType: AttendanceDutyType;
  shiftFraction: number;
  normalDuty: number;
  extraDuty: number;
  otHours: number;
  otDayEquivalent: number;
  isReliever?: boolean;
  primarySiteName?: string;
  adjustmentNote?: string;
  remarks?: string;
}

function normalizeAttendanceInput(
  raw: Record<string, any>,
  options: { requireEmployeeName: boolean; requireDate: boolean; requireStatus: boolean }
): { ok: true; value: NormalizedAttendanceInput } | { ok: false; message: string } {
  const employeeId = normalizeEmployeeId(raw.employeeId);
  const employeeName = normalizeStringField(raw.employeeName);
  const location = normalizeStringField(raw.location || raw.siteName);
  const rawDate = normalizeStringField(raw.date);
  const date = rawDate || (options.requireDate ? "" : todayIso());

  if (options.requireEmployeeName && !employeeName) {
    return { ok: false, message: "Required fields: employeeName, location, status" };
  }
  if (!employeeId && !employeeName) {
    return { ok: false, message: "Each record requires employeeId or employeeName" };
  }
  if (!location) {
    return { ok: false, message: "Required field: location (work site)" };
  }
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return { ok: false, message: "Valid date (YYYY-MM-DD) is required" };
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
  const shiftDefaults = getDefaultDutyMeta(status);
  const dutyMeta = deriveDutyCounts(
    status,
    raw.normalDuty,
    raw.extraDuty,
    raw.shiftFraction,
    raw.otHours,
    raw.otDayEquivalent
  );

  const rawDutyType = String(raw.dutyType || "").trim().toUpperCase();
  const dutyType: AttendanceDutyType = (ATTENDANCE_DUTY_TYPES as readonly string[]).includes(rawDutyType)
    ? (rawDutyType as AttendanceDutyType)
    : (dutyMeta.dutyType as AttendanceDutyType);

  const checkIn = normalizeStringField(raw.checkIn) || shiftDefaults.checkIn;
  const checkOut = normalizeStringField(raw.checkOut) || shiftDefaults.checkOut;
  const workingHours = normalizeStringField(raw.workingHours) || shiftDefaults.workingHours;

  return {
    ok: true,
    value: {
      ...(typeof raw.workSiteId === "string" && mongoose.Types.ObjectId.isValid(raw.workSiteId)
        ? { workSiteId: raw.workSiteId }
        : {}),
      ...(typeof raw.employeeObjectId === "string" && mongoose.Types.ObjectId.isValid(raw.employeeObjectId)
        ? { employeeObjectId: raw.employeeObjectId }
        : {}),
      employeeId,
      employeeName,
      designation,
      location,
      date,
      monthKey: date.slice(0, 7),
      checkIn,
      checkOut,
      workingHours,
      status,
      dutyType,
      shiftFraction: dutyMeta.shiftFraction,
      normalDuty: dutyMeta.normalDuty,
      extraDuty: dutyMeta.extraDuty,
      otHours: dutyMeta.otHours,
      otDayEquivalent: dutyMeta.otDayEquivalent,
      ...(typeof raw.isReliever === "boolean" ? { isReliever: raw.isReliever } : {}),
      ...(raw.primarySiteName !== undefined
        ? { primarySiteName: normalizeStringField(raw.primarySiteName) }
        : {}),
      ...(raw.adjustmentNote !== undefined
        ? { adjustmentNote: normalizeStringField(raw.adjustmentNote).slice(0, 500) }
        : {}),
      ...(raw.remarks !== undefined
        ? { remarks: normalizeStringField(raw.remarks).slice(0, 500) }
        : {}),
    },
  };
}

function getAttendanceMatchKey(item: NormalizedAttendanceInput): string {
  const siteKey = item.location.toLowerCase();
  if (item.employeeId) {
    return `id::${item.employeeId}::${siteKey}::${item.date}`;
  }
  return `name::${item.employeeName.toLowerCase()}::${siteKey}::${item.date}`;
}

async function resolveContextLookups(items: NormalizedAttendanceInput[]) {
  const siteMap = new Map<string, IAdminSite>();
  const sites = await AdminSite.find().lean();
  for (const s of sites) {
    siteMap.set(s.siteName.trim().toLowerCase(), s as IAdminSite);
  }

  const empCodes = Array.from(new Set(items.map((i) => i.employeeId).filter(Boolean)));
  const empDocs =
    empCodes.length > 0
      ? await AdminEmployee.find({
          $or: [{ empCode: { $in: empCodes } }, { legacyEmpCode: { $in: empCodes } }],
        }).lean()
      : [];

  const empByCode = new Map<string, IAdminEmployee>();
  for (const e of empDocs) {
    empByCode.set(String(e.empCode || "").toUpperCase(), e as IAdminEmployee);
    if (e.legacyEmpCode) {
      empByCode.set(String(e.legacyEmpCode).toUpperCase(), e as IAdminEmployee);
    }
  }

  return { siteMap, empByCode };
}

async function checkMonthsNotLocked(items: NormalizedAttendanceInput[]): Promise<string | null> {
  const pairs = Array.from(
    new Set(items.map((i) => `${i.location.trim().toLowerCase()}::${i.monthKey}`))
  );
  if (pairs.length === 0) return null;

  const monthKeys = Array.from(new Set(items.map((i) => i.monthKey)));
  const lockedApprovals = await AdminSiteMusterApproval.find({
    monthKey: { $in: monthKeys },
    verificationStatus: "LOCKED_FOR_BILLING",
  })
    .select("siteName monthKey")
    .lean();

  const lockedSet = new Set(
    lockedApprovals.map((a) => `${String(a.siteName || "").trim().toLowerCase()}::${a.monthKey}`)
  );

  for (const pair of pairs) {
    if (lockedSet.has(pair)) {
      const [sitePart, monthPart] = pair.split("::");
      return `Muster roll for "${sitePart}" (${monthPart}) is LOCKED_FOR_BILLING. Unlock it in Muster Sign-Off before editing.`;
    }
  }
  return null;
}

async function upsertAttendanceEntry(
  item: NormalizedAttendanceInput,
  lookups?: { siteMap: Map<string, IAdminSite>; empByCode: Map<string, IAdminEmployee> }
) {
  const siteDoc = lookups?.siteMap.get(item.location.toLowerCase());
  const empDoc = item.employeeId ? lookups?.empByCode.get(item.employeeId) : undefined;

  const resolvedWorkSiteId = item.workSiteId || (siteDoc?._id ? String(siteDoc._id) : null);
  const resolvedEmpObjectId =
    item.employeeObjectId || (empDoc?._id ? String(empDoc._id) : null);
  const resolvedSiteName = siteDoc?.siteName || item.location;

  const empHomeSite = empDoc?.siteName?.trim() || "";
  const autoIsReliever =
    item.isReliever !== undefined
      ? item.isReliever
      : Boolean(
          empDoc &&
            empHomeSite &&
            empHomeSite.toLowerCase() !== resolvedSiteName.toLowerCase()
        );
  const resolvedPrimarySiteName =
    item.primarySiteName || (autoIsReliever ? empHomeSite : resolvedSiteName);

  // Scoped match filter respects cross-site duties on the same day without overwriting other sites
  const siteRegex = new RegExp(`^${escapeRegex(resolvedSiteName)}$`, "i");
  const matchFilter = item.employeeId
    ? { employeeId: item.employeeId, location: siteRegex, date: item.date }
    : {
        employeeName: new RegExp(`^${escapeRegex(item.employeeName)}$`, "i"),
        location: siteRegex,
        date: item.date,
      };

  const setPayload: Record<string, any> = {
    workSiteId: resolvedWorkSiteId,
    employeeObjectId: resolvedEmpObjectId,
    employeeId: empDoc?.empCode || item.employeeId,
    designation: item.designation || empDoc?.designation || "Security Guard",
    location: resolvedSiteName,
    date: item.date,
    monthKey: item.monthKey,
    checkIn: item.checkIn,
    checkOut: item.checkOut,
    workingHours: item.workingHours,
    status: item.status,
    dutyType: item.dutyType,
    shiftFraction: item.shiftFraction,
    normalDuty: item.normalDuty,
    extraDuty: item.extraDuty,
    otHours: item.otHours,
    otDayEquivalent: item.otDayEquivalent,
    isReliever: autoIsReliever,
    primarySiteName: resolvedPrimarySiteName,
  };
  const setOnInsertPayload: Record<string, any> = {};

  if (item.employeeName || empDoc?.fullName) {
    setPayload.employeeName = item.employeeName || empDoc?.fullName;
  } else {
    setOnInsertPayload.employeeName = item.employeeId;
  }

  if (item.adjustmentNote !== undefined) {
    setPayload.adjustmentNote = item.adjustmentNote;
  } else {
    setOnInsertPayload.adjustmentNote = "";
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

// ─── GET /api/admin/attendance/site-summary ───────────────────
// Fast scalable summary across all active sites for a given month + target date
attendanceAdminRouter.get(
  "/site-summary",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const month =
        typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month.trim())
          ? req.query.month.trim()
          : todayIso().slice(0, 7);
      const date =
        typeof req.query.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(req.query.date.trim())
          ? req.query.date.trim()
          : `${month}-01`;

      const [sites, empAgg, monthAttAgg, dateAttAgg, approvals] = await Promise.all([
        AdminSite.find({ isActive: true }).sort({ siteName: 1 }).lean(),
        AdminEmployee.aggregate([
          { $match: { status: { $ne: "LEFT" } } },
          { $group: { _id: "$siteName", count: { $sum: 1 } } },
        ]),
        AdminAttendance.aggregate([
          { $match: { $or: [{ monthKey: month }, { date: new RegExp(`^${escapeRegex(month)}-`) }] } },
          {
            $group: {
              _id: "$location",
              normalDuty: { $sum: { $ifNull: ["$normalDuty", 0] } },
              extraDuty: { $sum: { $ifNull: ["$extraDuty", 0] } },
              otHours: { $sum: { $ifNull: ["$otHours", 0] } },
              otDayEq: { $sum: { $ifNull: ["$otDayEquivalent", 0] } },
              nhDays: {
                $sum: {
                  $cond: [{ $eq: ["$status", "National Holiday"] }, 1, 0],
                },
              },
              relievers: {
                $addToSet: {
                  $cond: [{ $eq: ["$isReliever", true] }, "$employeeId", null],
                },
              },
            },
          },
        ]),
        AdminAttendance.aggregate([
          { $match: { date } },
          {
            $group: {
              _id: "$location",
              present: {
                $sum: {
                  $cond: [
                    { $in: ["$status", ["Present", "Double Duty", "National Holiday"]] },
                    1,
                    0,
                  ],
                },
              },
              doubleDuty: {
                $sum: { $cond: [{ $eq: ["$status", "Double Duty"] }, 1, 0] },
              },
              absent: {
                $sum: { $cond: [{ $eq: ["$status", "Absent"] }, 1, 0] },
              },
              halfOrLeave: {
                $sum: {
                  $cond: [{ $in: ["$status", ["Half Day", "Leave"]] }, 1, 0],
                },
              },
            },
          },
        ]),
        AdminSiteMusterApproval.find({ monthKey: month }).lean(),
      ]);

      const siteNames = new Set<string>(sites.map((s) => s.siteName));
      const siteByName = new Map<string, (typeof sites)[number]>();
      for (const s of sites) siteByName.set(s.siteName.trim().toLowerCase(), s);

      const empCountMap = new Map<string, number>();
      for (const row of empAgg) {
        const name = String(row._id || "").trim();
        if (name) {
          siteNames.add(name);
          empCountMap.set(name.toLowerCase(), Number(row.count) || 0);
        }
      }

      const monthMap = new Map<string, any>();
      for (const row of monthAttAgg) {
        const name = String(row._id || "").trim();
        if (name) {
          siteNames.add(name);
          monthMap.set(name.toLowerCase(), row);
        }
      }

      const dateMap = new Map<string, any>();
      for (const row of dateAttAgg) {
        const name = String(row._id || "").trim();
        if (name) dateMap.set(name.toLowerCase(), row);
      }

      const approvalMap = new Map<string, MusterVerificationStatus>();
      for (const a of approvals) {
        approvalMap.set(String(a.siteName || "").trim().toLowerCase(), a.verificationStatus);
      }

      const rows = Array.from(siteNames)
        .sort((a, b) => a.localeCompare(b))
        .map((siteName) => {
          const key = siteName.toLowerCase();
          const siteDoc = siteByName.get(key);
          const m = monthMap.get(key);
          const d = dateMap.get(key);
          const staffCount = empCountMap.get(key) ?? 0;
          const present = Number(d?.present) || 0;
          const doubleDuty = Number(d?.doubleDuty) || 0;
          const absent = Number(d?.absent) || 0;
          const halfOrLeave = Number(d?.halfOrLeave) || 0;
          const markedToday = present + absent + halfOrLeave;
          const unmarked = Math.max(0, staffCount - markedToday);
          const normalDuty = Number((Number(m?.normalDuty) || 0).toFixed(2));
          const extraDuty = Number((Number(m?.extraDuty) || 0).toFixed(2));
          const otHours = Number((Number(m?.otHours) || 0).toFixed(2));
          const relievers = Array.isArray(m?.relievers)
            ? m.relievers.filter((x: unknown) => Boolean(x)).length
            : 0;

          return {
            siteId: siteDoc ? String(siteDoc._id) : null,
            siteCode: siteDoc?.siteCode || "",
            siteName,
            staffCount,
            present,
            doubleDuty,
            absent,
            unmarked,
            monthNormalDuty: normalDuty,
            monthExtraDuty: extraDuty,
            monthOtHours: otHours,
            monthNhDays: Number(m?.nhDays) || 0,
            monthDuty: Number((normalDuty + extraDuty).toFixed(2)),
            relieverCount: relievers,
            verificationStatus: approvalMap.get(key) ?? "DRAFT",
          };
        });

      res.json({
        success: true,
        data: {
          month,
          date,
          sites: rows,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/admin/attendance/site-matrix ────────────────────
// Server-side 1..31 monthly register aggregation (scales to 1,000+ personnel across sites)
attendanceAdminRouter.get(
  "/site-matrix",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawSite = String(req.query.site || req.query.siteName || "").trim();
      const rawSiteId = String(req.query.siteId || "").trim();
      const month =
        typeof req.query.month === "string" && /^\d{4}-\d{2}$/.test(req.query.month.trim())
          ? req.query.month.trim()
          : todayIso().slice(0, 7);
      const search = typeof req.query.search === "string" ? req.query.search.trim().toLowerCase() : "";
      const relieverOnly = req.query.relieverOnly === "true";
      const { page, limit, skip } = parsePaginationParams(req.query, 50, 250);

      let siteDoc = rawSiteId && mongoose.Types.ObjectId.isValid(rawSiteId)
        ? await AdminSite.findById(rawSiteId).lean()
        : rawSite
          ? await AdminSite.findOne({ siteName: new RegExp(`^${escapeRegex(rawSite)}$`, "i") }).lean()
          : null;

      const resolvedSiteName = siteDoc?.siteName || rawSite;
      if (!resolvedSiteName) {
        res.status(400).json({ success: false, message: "site or siteId is required" });
        return;
      }

      const siteRegex = new RegExp(`^${escapeRegex(resolvedSiteName)}$`, "i");
      const monthPrefixRegex = new RegExp(`^${escapeRegex(month)}-`);

      const [employees, monthRecords, legacyCandidates, legacySalaries, legacyStat, approvalDoc] =
        await Promise.all([
          AdminEmployee.find({
            ...(siteDoc?._id
              ? { $or: [{ primarySiteId: siteDoc._id }, { siteName: siteRegex }] }
              : { siteName: siteRegex }),
            status: { $ne: "LEFT" },
          })
            .sort({ fullName: 1 })
            .lean(),
          AdminAttendance.find({
            ...(siteDoc?._id
              ? { $or: [{ workSiteId: siteDoc._id }, { location: siteRegex }] }
              : { location: siteRegex }),
            $or: [{ monthKey: month }, { date: monthPrefixRegex }],
          })
            .sort({ date: 1 })
            .lean(),
          AdminCandidate.find({ location: siteRegex }).select("employeeId fullName joiningAs position").lean(),
          AdminSalary.find({ location: siteRegex }).select("employeeId employeeName designation").lean(),
          AdminStatutory.find({ location: siteRegex }).select("employeeId employeeName designation").lean(),
          AdminSiteMusterApproval.findOne({ siteName: siteRegex, monthKey: month }).lean(),
        ]);

      interface RosterEntry {
        key: string;
        employeeObjectId: string | null;
        employeeId: string;
        employeeName: string;
        designation: string;
        subUnit: string;
        isReliever: boolean;
        homeSiteName: string;
        days: Record<number, any>;
        normalDuty: number;
        extraDuty: number;
        otHours: number;
        otDayEquivalent: number;
        nhDays: number;
        totalDuty: number;
      }

      const rosterMap = new Map<string, RosterEntry>();

      const makeKey = (empId: string, empName: string) =>
        empId && !/^ACS\/(SITE|ATT|IMP)\//i.test(empId)
          ? `id::${empId.toUpperCase()}`
          : `name::${empName.trim().toLowerCase()}`;

      for (const emp of employees) {
        const key = makeKey(emp.empCode, emp.fullName);
        rosterMap.set(key, {
          key,
          employeeObjectId: String(emp._id),
          employeeId: emp.empCode,
          employeeName: emp.fullName,
          designation: emp.designation || "Security Guard",
          subUnit: emp.subUnit || "",
          isReliever: false,
          homeSiteName: emp.siteName || resolvedSiteName,
          days: {},
          normalDuty: 0,
          extraDuty: 0,
          otHours: 0,
          otDayEquivalent: 0,
          nhDays: 0,
          totalDuty: 0,
        });
      }

      const mergeAuxiliary = (id: string, name: string, desig: string) => {
        const cleanName = String(name || "").trim();
        if (!cleanName) return;
        const cleanId = String(id || "").trim().toUpperCase();
        const key = makeKey(cleanId, cleanName);
        if (!rosterMap.has(key)) {
          rosterMap.set(key, {
            key,
            employeeObjectId: null,
            employeeId: cleanId && !/^ACS\/(SITE|ATT|IMP)\//i.test(cleanId) ? cleanId : "",
            employeeName: cleanName,
            designation: desig || "Security Guard",
            subUnit: "",
            isReliever: false,
            homeSiteName: resolvedSiteName,
            days: {},
            normalDuty: 0,
            extraDuty: 0,
            otHours: 0,
            otDayEquivalent: 0,
            nhDays: 0,
            totalDuty: 0,
          });
        }
      };

      for (const c of legacyCandidates) mergeAuxiliary(c.employeeId || "", c.fullName, c.joiningAs || c.position);
      for (const s of legacySalaries) mergeAuxiliary(s.employeeId, s.employeeName, s.designation);
      for (const st of legacyStat) mergeAuxiliary(st.employeeId, st.employeeName, st.designation);

      for (const rec of monthRecords) {
        const cleanId = String(rec.employeeId || "").trim().toUpperCase();
        const key = makeKey(cleanId, rec.employeeName);
        let entry = rosterMap.get(key);
        if (!entry) {
          entry = {
            key,
            employeeObjectId: rec.employeeObjectId ? String(rec.employeeObjectId) : null,
            employeeId: cleanId && !/^ACS\/(SITE|ATT|IMP)\//i.test(cleanId) ? cleanId : "",
            employeeName: rec.employeeName,
            designation: rec.designation || "Security Guard",
            subUnit: "",
            isReliever: Boolean(rec.isReliever),
            homeSiteName: rec.primarySiteName || resolvedSiteName,
            days: {},
            normalDuty: 0,
            extraDuty: 0,
            otHours: 0,
            otDayEquivalent: 0,
            nhDays: 0,
            totalDuty: 0,
          };
          rosterMap.set(key, entry);
        } else if (rec.isReliever) {
          entry.isReliever = true;
          if (rec.primarySiteName) entry.homeSiteName = rec.primarySiteName;
        }

        const dayNum = Number(String(rec.date || "").slice(8, 10));
        if (dayNum >= 1 && dayNum <= 31) {
          const defaults = getDefaultDutyMeta(rec.status as AttendanceStatus);
          const norm = typeof rec.normalDuty === "number" ? rec.normalDuty : defaults.normalDuty;
          const ext = typeof rec.extraDuty === "number" ? rec.extraDuty : defaults.extraDuty;
          const otH = typeof rec.otHours === "number" ? rec.otHours : 0;
          const otEq = typeof rec.otDayEquivalent === "number" ? rec.otDayEquivalent : ext;
          entry.days[dayNum] = {
            id: String(rec._id),
            status: rec.status,
            code: rec.dutyType || defaults.dutyType,
            normalDuty: norm,
            extraDuty: ext,
            otHours: otH,
            otDayEquivalent: otEq,
            shiftFraction: rec.shiftFraction ?? defaults.shiftFraction,
            isReliever: Boolean(rec.isReliever),
            adjustmentNote: rec.adjustmentNote || "",
            remarks: rec.remarks || "",
          };
          entry.normalDuty = Number((entry.normalDuty + norm).toFixed(2));
          entry.extraDuty = Number((entry.extraDuty + ext).toFixed(2));
          entry.otHours = Number((entry.otHours + otH).toFixed(2));
          entry.otDayEquivalent = Number((entry.otDayEquivalent + otEq).toFixed(2));
          if (rec.status === "National Holiday") entry.nhDays += 1;
          entry.totalDuty = Number((entry.normalDuty + entry.extraDuty).toFixed(2));
        }
      }

      const allRows = Array.from(rosterMap.values()).sort((a, b) => {
        if (a.isReliever !== b.isReliever) return a.isReliever ? 1 : -1;
        return a.employeeName.localeCompare(b.employeeName);
      });

      const totals = allRows.reduce(
        (acc, r) => ({
          totalStaff: acc.totalStaff + 1,
          relieverCount: acc.relieverCount + (r.isReliever ? 1 : 0),
          normalDuty: Number((acc.normalDuty + r.normalDuty).toFixed(2)),
          extraDuty: Number((acc.extraDuty + r.extraDuty).toFixed(2)),
          otHours: Number((acc.otHours + r.otHours).toFixed(2)),
          nhDays: acc.nhDays + r.nhDays,
          totalDuty: Number((acc.totalDuty + r.totalDuty).toFixed(2)),
        }),
        { totalStaff: 0, relieverCount: 0, normalDuty: 0, extraDuty: 0, otHours: 0, nhDays: 0, totalDuty: 0 }
      );

      const filteredRows = allRows.filter((row) => {
        if (relieverOnly && !row.isReliever) return false;
        if (!search) return true;
        return (
          row.employeeName.toLowerCase().includes(search) ||
          row.employeeId.toLowerCase().includes(search) ||
          row.designation.toLowerCase().includes(search) ||
          row.homeSiteName.toLowerCase().includes(search)
        );
      });

      const pagedRows = filteredRows.slice(skip, skip + limit);

      res.json({
        success: true,
        data: {
          site: siteDoc ? serializeDoc(siteDoc) : { siteName: resolvedSiteName },
          month,
          daysInMonth: getDaysInYearMonth(month),
          rows: pagedRows,
          pagination: buildPaginationMeta(page, limit, filteredRows.length),
          totals,
          musterApproval: approvalDoc ? serializeDoc(approvalDoc) : null,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── Muster Approval Sign-Off & Signed Scan Upload ────────────
attendanceAdminRouter.get(
  "/muster-approvals",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const site = String(req.query.site || req.query.siteName || "").trim();
      const month = String(req.query.month || "").trim();
      const filter: Record<string, any> = {};
      if (site && site !== "All") filter.siteName = new RegExp(`^${escapeRegex(site)}$`, "i");
      if (month) filter.monthKey = month;

      const list = await AdminSiteMusterApproval.find(filter).sort({ monthKey: -1, siteName: 1 }).lean();
      res.json({
        success: true,
        count: list.length,
        data: list.map(serializeDoc),
      });
    } catch (err) {
      next(err);
    }
  }
);

attendanceAdminRouter.post(
  "/muster-approvals/upload",
  handleDocumentMultipart,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      await processDocumentUpload(req, res, "muster-approvals");
    } catch (err) {
      next(err);
    }
  }
);

attendanceAdminRouter.put(
  "/muster-approvals",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const body = stripMetaFields(req.body);
      const siteName = String(body.siteName || body.site || "").trim();
      const monthKey = String(body.monthKey || body.month || "").trim();
      const subUnit = String(body.subUnit || "").trim();

      if (!siteName || !/^\d{4}-\d{2}$/.test(monthKey)) {
        res.status(400).json({
          success: false,
          message: "Required fields: siteName and valid monthKey (YYYY-MM).",
        });
        return;
      }

      const rawStatus = String(body.verificationStatus || "DRAFT").trim().toUpperCase();
      const verificationStatus: MusterVerificationStatus = (
        MUSTER_VERIFICATION_STATUSES as readonly string[]
      ).includes(rawStatus)
        ? (rawStatus as MusterVerificationStatus)
        : "DRAFT";

      const siteDoc = await AdminSite.findOne({
        siteName: new RegExp(`^${escapeRegex(siteName)}$`, "i"),
      }).lean();
      const resolvedSiteName = siteDoc?.siteName || siteName;

      const attachment = sanitizeUploadedDoc(body.attachment);

      const saved = await AdminSiteMusterApproval.findOneAndUpdate(
        {
          siteName: resolvedSiteName,
          monthKey,
          subUnit,
        },
        {
          $set: {
            siteId: siteDoc?._id ?? null,
            siteName: resolvedSiteName,
            subUnit,
            monthKey,
            verificationStatus,
            verifiedByName: String(body.verifiedByName || "").trim(),
            verifiedByDesignation: String(body.verifiedByDesignation || "").trim(),
            verifiedDate: String(body.verifiedDate || (verificationStatus !== "DRAFT" ? todayIso() : "")).trim(),
            totalNormalDuty: Math.max(0, Number(body.totalNormalDuty) || 0),
            totalExtraDuty: Math.max(0, Number(body.totalExtraDuty) || 0),
            totalOtHours: Math.max(0, Number(body.totalOtHours) || 0),
            totalNhDays: Math.max(0, Number(body.totalNhDays) || 0),
            totalBillableDuties: Math.max(0, Number(body.totalBillableDuties) || 0),
            ...(attachment ? { attachment } : {}),
            remarks: String(body.remarks || "").trim(),
            lockedAt: verificationStatus === "LOCKED_FOR_BILLING" ? todayIso() : "",
          },
        },
        { upsert: true, new: true, runValidators: true }
      );

      await logAdminActivity(
        "Muster roll status updated",
        `${resolvedSiteName} (${monthKey}) marked ${verificationStatus}.`,
        "Attendance"
      );

      res.json({
        success: true,
        message: `Muster roll status saved as ${verificationStatus}`,
        data: serializeDoc(saved),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/admin/attendance ────────────────────────────────
attendanceAdminRouter.get("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { workSiteId, site, location, month, date, fromDate, toDate, status, employeeId, isReliever, search } =
      req.query;
    const filter: Record<string, any> = {};

    if (typeof workSiteId === "string" && mongoose.Types.ObjectId.isValid(workSiteId.trim())) {
      filter.workSiteId = workSiteId.trim();
    } else {
      const cleanSite =
        typeof site === "string" && site.trim()
          ? site.trim()
          : typeof location === "string" && location.trim()
            ? location.trim()
            : "";
      if (cleanSite && cleanSite !== "All") {
        filter.location = cleanSite;
      }
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
      if (cleanFrom) dateRangeFilter.$gte = cleanFrom;
      if (cleanTo) dateRangeFilter.$lte = cleanTo;
      if (Object.keys(dateRangeFilter).length > 0) {
        filter.date = dateRangeFilter;
      }
    }

    if (typeof status === "string" && status.trim() && status !== "All") {
      filter.status = status.trim();
    }
    if (isReliever === "true" || isReliever === "false") {
      filter.isReliever = isReliever === "true";
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
        { adjustmentNote: regex },
      ];
    }

    const usePagination = req.query.page !== undefined || req.query.limit !== undefined;
    if (usePagination) {
      const { page, limit, skip } = parsePaginationParams(req.query, 50, 500);
      const [records, total] = await Promise.all([
        AdminAttendance.find(filter).sort({ date: -1, createdAt: -1 }).skip(skip).limit(limit).lean(),
        AdminAttendance.countDocuments(filter),
      ]);
      res.json({
        success: true,
        count: records.length,
        data: records.map(serializeDoc),
        pagination: buildPaginationMeta(page, limit, total),
      });
      return;
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
      const lockError = await checkMonthsNotLocked(dedupedItems);
      if (lockError) {
        res.status(409).json({ success: false, message: lockError });
        return;
      }

      const lookups = await resolveContextLookups(dedupedItems);
      const upserted = [];
      const CHUNK_SIZE = 25;
      for (let i = 0; i < dedupedItems.length; i += CHUNK_SIZE) {
        const chunk = dedupedItems.slice(i, i + CHUNK_SIZE);
        const docs = await Promise.all(chunk.map((item) => upsertAttendanceEntry(item, lookups)));
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

    const lockError = await checkMonthsNotLocked([normalized.value]);
    if (lockError) {
      res.status(409).json({ success: false, message: lockError });
      return;
    }

    const lookups = await resolveContextLookups([normalized.value]);
    const record = await upsertAttendanceEntry(normalized.value, lookups);
    if (!record) {
      res.status(500).json({ success: false, message: "Failed to save attendance record" });
      return;
    }

    await logAdminActivity(
      record.isReliever ? "Reliever attendance marked" : "Attendance marked",
      `${record.employeeName} marked ${record.status} at ${record.location} for ${record.date}.`,
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
    const { ids, status, normalDuty, extraDuty, shiftFraction, otHours, adjustmentNote, remarks } = req.body as {
      ids?: unknown;
      status?: AttendanceStatus;
      normalDuty?: unknown;
      extraDuty?: unknown;
      shiftFraction?: unknown;
      otHours?: unknown;
      adjustmentNote?: unknown;
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

    const shiftDefaults = getDefaultDutyMeta(status);
    const dutyCounts = deriveDutyCounts(status, normalDuty, extraDuty, shiftFraction, otHours);
    const updatePayload: Record<string, any> = {
      status,
      dutyType: dutyCounts.dutyType,
      shiftFraction: dutyCounts.shiftFraction,
      checkOut: shiftDefaults.checkOut,
      workingHours: shiftDefaults.workingHours,
      normalDuty: dutyCounts.normalDuty,
      extraDuty: dutyCounts.extraDuty,
      otHours: dutyCounts.otHours,
      otDayEquivalent: dutyCounts.otDayEquivalent,
    };

    if (!WORKING_STATUSES.has(status)) {
      updatePayload.checkIn = "—";
    }
    if (typeof adjustmentNote === "string") {
      updatePayload.adjustmentNote = adjustmentNote.trim().slice(0, 500);
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

    const lockError = await checkMonthsNotLocked([
      {
        location: existing.location,
        monthKey: existing.monthKey || existing.date.slice(0, 7),
      } as NormalizedAttendanceInput,
    ]);
    if (lockError) {
      res.status(409).json({ success: false, message: lockError });
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
      const siteDoc = await AdminSite.findOne({
        siteName: new RegExp(`^${escapeRegex(cleanLoc)}$`, "i"),
      }).lean();
      if (siteDoc) {
        updates.workSiteId = siteDoc._id;
        updates.location = siteDoc.siteName;
      }
    }
    if (updates.date !== undefined) {
      const cleanDate = normalizeStringField(updates.date);
      if (!cleanDate || !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
        res.status(400).json({ success: false, message: "Valid date (YYYY-MM-DD) is required" });
        return;
      }
      updates.date = cleanDate;
      updates.monthKey = cleanDate.slice(0, 7);
    }
    if (updates.adjustmentNote !== undefined) {
      updates.adjustmentNote = normalizeStringField(updates.adjustmentNote).slice(0, 500);
    }
    if (updates.remarks !== undefined) {
      updates.remarks = normalizeStringField(updates.remarks).slice(0, 500);
    }

    const effectiveStatus = (updates.status ?? existing.status) as AttendanceStatus;
    if (
      updates.status !== undefined ||
      updates.normalDuty !== undefined ||
      updates.extraDuty !== undefined ||
      updates.shiftFraction !== undefined ||
      updates.otHours !== undefined ||
      updates.otDayEquivalent !== undefined
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
            : existing.extraDuty,
        updates.shiftFraction !== undefined ? updates.shiftFraction : existing.shiftFraction,
        updates.otHours !== undefined ? updates.otHours : existing.otHours,
        updates.otDayEquivalent !== undefined ? updates.otDayEquivalent : undefined
      );
      updates.dutyType = updates.dutyType || dutyCounts.dutyType;
      updates.shiftFraction = dutyCounts.shiftFraction;
      updates.normalDuty = dutyCounts.normalDuty;
      updates.extraDuty = dutyCounts.extraDuty;
      updates.otHours = dutyCounts.otHours;
      updates.otDayEquivalent = dutyCounts.otDayEquivalent;
    }

    if (updates.status !== undefined) {
      const shiftDefaults = getDefaultDutyMeta(effectiveStatus);
      const isWorking = WORKING_STATUSES.has(effectiveStatus);
      if (updates.checkIn === undefined) {
        if (!isWorking) {
          updates.checkIn = "—";
        } else if (!existing.checkIn || existing.checkIn === "—") {
          updates.checkIn = shiftDefaults.checkIn;
        }
      }
      if (updates.checkOut === undefined) updates.checkOut = shiftDefaults.checkOut;
      if (updates.workingHours === undefined) updates.workingHours = shiftDefaults.workingHours;
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
