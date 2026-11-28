import { Router } from "express";
import { requireAdminAuth } from "../middlewares/adminAuth";
import { authAdminRouter } from "./admin/auth.route";
import { recruitmentAdminRouter } from "./admin/recruitment.route";
import {
  stockLogsAdminRouter,
  uniformIssuesAdminRouter,
  uniformRecoveryPlansAdminRouter,
  uniformsAdminRouter,
} from "./admin/uniforms.route";
import { attendanceAdminRouter } from "./admin/attendance.route";
import {
  payslipsAdminRouter,
  salariesAdminRouter,
  statutoryAdminRouter,
} from "./admin/payroll.route";
import {
  payrollRunsAdminRouter,
  salaryRulesAdminRouter,
} from "./admin/payrollEngine.route";
import {
  billingAdminRouter,
  billingRulesAdminRouter,
} from "./admin/billing.route";
import { advancesAdminRouter, vouchersAdminRouter } from "./admin/vouchers.route";
import { employeesAdminRouter } from "./admin/employees.route";
import { sitesAdminRouter } from "./admin/sites.route";
import { systemAdminRouter } from "./admin/system.route";

export const adminRouter = Router();

// Authentication routes (/api/admin/auth/login, /logout, /me, /change-password, /users)
adminRouter.use("/auth", authAdminRouter);

// Protect all Admin Table & System routes behind DB-backed JWT authentication
adminRouter.use(requireAdminAuth);

// Core Admin system & overview routes (/api/admin/health, /overview, /activities, /settings)
adminRouter.use("/", systemAdminRouter);

// Admin Table APIs
adminRouter.use("/sites", sitesAdminRouter);
adminRouter.use("/employees", employeesAdminRouter);
adminRouter.use("/candidates", recruitmentAdminRouter);
adminRouter.use("/uniforms", uniformsAdminRouter);
adminRouter.use("/uniform-issues", uniformIssuesAdminRouter);
adminRouter.use("/uniform-recovery-plans", uniformRecoveryPlansAdminRouter);
adminRouter.use("/stock-logs", stockLogsAdminRouter);
adminRouter.use("/attendance", attendanceAdminRouter);
adminRouter.use("/statutory", statutoryAdminRouter);
adminRouter.use("/salaries", salariesAdminRouter);
adminRouter.use("/salary-rules", salaryRulesAdminRouter);
adminRouter.use("/payroll-runs", payrollRunsAdminRouter);
adminRouter.use("/advances", advancesAdminRouter);
adminRouter.use("/vouchers", vouchersAdminRouter);
adminRouter.use("/payslips", payslipsAdminRouter);
adminRouter.use("/billing-rules", billingRulesAdminRouter);
adminRouter.use("/invoices", billingAdminRouter);
