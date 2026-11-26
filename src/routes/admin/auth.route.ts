import { Router, Request, Response, NextFunction } from "express";
import { ADMIN_ROLES, AdminRole, AdminUser } from "../../models/admin/AdminUser.model";
import {
  ADMIN_AUTH_COOKIE,
  getJwtTtlSeconds,
  hashPassword,
  signAdminJwt,
  verifyAdminJwt,
  verifyPassword,
} from "../../utils/adminAuth";
import {
  extractAdminToken,
  loginRateLimiter,
  requireAdminAuth,
  requireAdminRole,
} from "../../middlewares/adminAuth";
import { getParamId, logAdminActivity, serializeDoc } from "./helpers";

export const authAdminRouter = Router();

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_DURATION_MS = 15 * 60 * 1000;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function serializeAdminUser(user: {
  _id: unknown;
  name: string;
  email: string;
  phone?: string;
  jobTitle?: string;
  role: AdminRole;
  isActive: boolean;
  lastLoginAt?: Date | null;
}) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    phone: user.phone || "",
    jobTitle: user.jobTitle || "",
    role: user.role,
    isActive: user.isActive,
    lastLoginAt: user.lastLoginAt ?? null,
  };
}

function setSessionCookie(res: Response, token: string): void {
  const isProd = process.env.NODE_ENV === "production";
  res.cookie(ADMIN_AUTH_COOKIE, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
    maxAge: getJwtTtlSeconds() * 1000,
  });
}

function clearSessionCookie(res: Response): void {
  const isProd = process.env.NODE_ENV === "production";
  res.clearCookie(ADMIN_AUTH_COOKIE, {
    httpOnly: true,
    secure: isProd,
    sameSite: isProd ? "none" : "lax",
    path: "/",
  });
}

// ─── POST /api/admin/auth/login ───────────────────────────────
authAdminRouter.post(
  "/login",
  loginRateLimiter,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { email, password } = req.body as { email?: unknown; password?: unknown };
      const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
      const rawPassword = typeof password === "string" ? password : "";

      if (!cleanEmail || !EMAIL_RE.test(cleanEmail) || !rawPassword) {
        res.status(400).json({
          success: false,
          message: "Please enter a valid email address and password.",
        });
        return;
      }

      const user = await AdminUser.findOne({ email: cleanEmail }).select("+passwordHash");
      if (!user) {
        res.status(401).json({
          success: false,
          message: "Invalid email or password. Account not found in database.",
        });
        return;
      }

      if (!user.isActive) {
        res.status(403).json({
          success: false,
          message: "This account is disabled. Contact your administrator.",
        });
        return;
      }

      if (user.lockUntil && user.lockUntil.getTime() > Date.now()) {
        const minsLeft = Math.ceil((user.lockUntil.getTime() - Date.now()) / 60000);
        res.status(423).json({
          success: false,
          message: `Account temporarily locked due to failed logins. Try again in ${minsLeft} minute(s).`,
        });
        return;
      }

      const validPassword = await verifyPassword(rawPassword, user.passwordHash);
      if (!validPassword) {
        const nextAttempts = (user.failedLoginAttempts || 0) + 1;
        user.failedLoginAttempts = nextAttempts;
        if (nextAttempts >= MAX_FAILED_ATTEMPTS) {
          user.lockUntil = new Date(Date.now() + LOCK_DURATION_MS);
        }
        await user.save();

        res.status(401).json({
          success: false,
          message:
            nextAttempts >= MAX_FAILED_ATTEMPTS
              ? "Too many failed login attempts. Account locked for 15 minutes."
              : "Invalid email or password.",
        });
        return;
      }

      user.failedLoginAttempts = 0;
      user.lockUntil = null;
      user.lastLoginAt = new Date();
      user.lastLoginIp = req.ip || req.socket?.remoteAddress || null;
      await user.save();

      const { token, expiresIn } = signAdminJwt({
        sub: String(user._id),
        email: user.email,
        role: user.role,
        tokenVersion: user.tokenVersion,
      });

      setSessionCookie(res, token);

      await logAdminActivity("Admin signed in", `${user.email} (${user.role}) logged in.`, "Auth");

      res.json({
        success: true,
        message: "Signed in successfully.",
        data: {
          token,
          expiresIn,
          user: serializeAdminUser(user),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/admin/auth/logout ──────────────────────────────
authAdminRouter.post(
  "/logout",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const token = extractAdminToken(req);
      if (token && req.query.allDevices === "true") {
        const payload = verifyAdminJwt(token);
        if (payload) {
          await AdminUser.findByIdAndUpdate(payload.sub, { $inc: { tokenVersion: 1 } });
        }
      }
      clearSessionCookie(res);
      res.json({ success: true, message: "Signed out successfully." });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/admin/auth/me ───────────────────────────────────
authAdminRouter.get(
  "/me",
  requireAdminAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const user = await AdminUser.findById(req.adminUser!.id).lean();
      if (!user) {
        res.status(401).json({ success: false, message: "Account not found." });
        return;
      }
      res.json({
        success: true,
        data: {
          user: serializeAdminUser(user),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/admin/auth/me ─────────────────────────────────
authAdminRouter.patch(
  "/me",
  requireAdminAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, email, phone, jobTitle } = req.body as {
        name?: unknown;
        email?: unknown;
        phone?: unknown;
        jobTitle?: unknown;
      };

      const user = await AdminUser.findById(req.adminUser!.id);
      if (!user) {
        res.status(401).json({ success: false, message: "Account not found." });
        return;
      }

      if (name !== undefined) {
        const cleanName = typeof name === "string" ? name.trim() : "";
        if (!cleanName) {
          res.status(400).json({ success: false, message: "Full name cannot be empty." });
          return;
        }
        user.name = cleanName;
      }

      let emailChanged = false;
      if (email !== undefined) {
        const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
        if (!cleanEmail || !EMAIL_RE.test(cleanEmail)) {
          res.status(400).json({ success: false, message: "Please enter a valid email address." });
          return;
        }
        if (cleanEmail !== user.email) {
          const duplicate = await AdminUser.findOne({
            email: cleanEmail,
            _id: { $ne: user._id },
          }).lean();
          if (duplicate) {
            res.status(409).json({
              success: false,
              message: "Another admin account already uses this email address.",
            });
            return;
          }
          user.email = cleanEmail;
          emailChanged = true;
        }
      }

      if (phone !== undefined) {
        const cleanPhone = typeof phone === "string" ? phone.trim() : "";
        const phoneDigits = cleanPhone.replace(/\D/g, "");
        if (cleanPhone && (phoneDigits.length < 10 || phoneDigits.length > 15)) {
          res.status(400).json({
            success: false,
            message: "Phone number must contain 10 to 15 digits (or leave it blank).",
          });
          return;
        }
        user.phone = cleanPhone;
      }

      if (jobTitle !== undefined) {
        user.jobTitle = typeof jobTitle === "string" ? jobTitle.trim() : "";
      }

      await user.save();

      let nextToken: string | undefined;
      if (emailChanged) {
        const signed = signAdminJwt({
          sub: String(user._id),
          email: user.email,
          role: user.role,
          tokenVersion: user.tokenVersion,
        });
        nextToken = signed.token;
        setSessionCookie(res, nextToken);
      }

      await logAdminActivity(
        "Admin profile updated",
        `${user.name} (${user.email}) updated their profile details.`,
        "Auth"
      );

      res.json({
        success: true,
        message: "Admin profile updated successfully.",
        data: {
          user: serializeAdminUser(user),
          ...(nextToken ? { token: nextToken } : {}),
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/admin/auth/change-password ─────────────────────
authAdminRouter.post(
  "/change-password",
  requireAdminAuth,
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { currentPassword, newPassword } = req.body as {
        currentPassword?: unknown;
        newPassword?: unknown;
      };
      if (typeof currentPassword !== "string" || typeof newPassword !== "string") {
        res.status(400).json({
          success: false,
          message: "currentPassword and newPassword are required.",
        });
        return;
      }
      if (newPassword.length < 8) {
        res.status(400).json({
          success: false,
          message: "New password must be at least 8 characters long.",
        });
        return;
      }

      const user = await AdminUser.findById(req.adminUser!.id).select("+passwordHash");
      if (!user) {
        res.status(401).json({ success: false, message: "Account not found." });
        return;
      }

      const validCurrent = await verifyPassword(currentPassword, user.passwordHash);
      if (!validCurrent) {
        res.status(401).json({ success: false, message: "Current password is incorrect." });
        return;
      }

      user.passwordHash = await hashPassword(newPassword);
      user.tokenVersion += 1;
      await user.save();

      const { token, expiresIn } = signAdminJwt({
        sub: String(user._id),
        email: user.email,
        role: user.role,
        tokenVersion: user.tokenVersion,
      });
      setSessionCookie(res, token);

      await logAdminActivity("Password updated", `${user.email} changed account password.`, "Auth");

      res.json({
        success: true,
        message: "Password updated successfully.",
        data: { token, expiresIn },
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── GET /api/admin/auth/users ────────────────────────────────
authAdminRouter.get(
  "/users",
  requireAdminAuth,
  requireAdminRole("super_admin", "admin"),
  async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const users = await AdminUser.find().sort({ createdAt: -1 }).lean();
      res.json({
        success: true,
        count: users.length,
        data: users.map(serializeDoc),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── POST /api/admin/auth/users ───────────────────────────────
authAdminRouter.post(
  "/users",
  requireAdminAuth,
  requireAdminRole("super_admin", "admin"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const { name, email, password, phone = "", jobTitle = "", role = "admin", isActive = true } = req.body as {
        name?: unknown;
        email?: unknown;
        password?: unknown;
        phone?: unknown;
        jobTitle?: unknown;
        role?: AdminRole;
        isActive?: boolean;
      };

      const cleanName = typeof name === "string" ? name.trim() : "";
      const cleanEmail = typeof email === "string" ? email.trim().toLowerCase() : "";
      const cleanPhone = typeof phone === "string" ? phone.trim() : "";
      const cleanJobTitle = typeof jobTitle === "string" ? jobTitle.trim() : "";
      const rawPassword = typeof password === "string" ? password : "";

      if (!cleanName || !cleanEmail || !EMAIL_RE.test(cleanEmail) || rawPassword.length < 8) {
        res.status(400).json({
          success: false,
          message: "Required: name, valid email, and password (minimum 8 characters).",
        });
        return;
      }

      if (!ADMIN_ROLES.includes(role)) {
        res.status(400).json({
          success: false,
          message: `Invalid role. Must be one of: ${ADMIN_ROLES.join(", ")}`,
        });
        return;
      }

      const existing = await AdminUser.findOne({ email: cleanEmail }).lean();
      if (existing) {
        res.status(409).json({
          success: false,
          message: "An admin account with this email already exists.",
        });
        return;
      }

      const passwordHash = await hashPassword(rawPassword);
      const created = await AdminUser.create({
        name: cleanName,
        email: cleanEmail,
        phone: cleanPhone,
        jobTitle: cleanJobTitle,
        passwordHash,
        role,
        isActive: Boolean(isActive),
      });

      await logAdminActivity(
        "Admin account created",
        `${created.email} (${created.role}) added by ${req.adminUser!.email}.`,
        "Auth"
      );

      res.status(201).json({
        success: true,
        message: "Admin user created successfully.",
        data: serializeAdminUser(created),
      });
    } catch (err) {
      next(err);
    }
  }
);

// ─── PATCH /api/admin/auth/users/:id ──────────────────────────
authAdminRouter.patch(
  "/users/:id",
  requireAdminAuth,
  requireAdminRole("super_admin", "admin"),
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const targetId = getParamId(req);
      const { name, phone, jobTitle, role, isActive, resetPassword } = req.body as {
        name?: string;
        phone?: string;
        jobTitle?: string;
        role?: AdminRole;
        isActive?: boolean;
        resetPassword?: string;
      };

      const user = await AdminUser.findById(targetId).select("+passwordHash");
      if (!user) {
        res.status(404).json({ success: false, message: "Admin user not found." });
        return;
      }

      if (typeof name === "string" && name.trim()) user.name = name.trim();
      if (typeof phone === "string") user.phone = phone.trim();
      if (typeof jobTitle === "string") user.jobTitle = jobTitle.trim();
      if (role !== undefined) {
        if (!ADMIN_ROLES.includes(role)) {
          res.status(400).json({ success: false, message: "Invalid role." });
          return;
        }
        user.role = role;
      }
      if (isActive !== undefined) {
        if (String(user._id) === req.adminUser!.id && !isActive) {
          res.status(400).json({ success: false, message: "You cannot disable your own account." });
          return;
        }
        user.isActive = Boolean(isActive);
        if (!user.isActive) user.tokenVersion += 1;
      }
      if (typeof resetPassword === "string" && resetPassword.length > 0) {
        if (resetPassword.length < 8) {
          res.status(400).json({
            success: false,
            message: "Reset password must be at least 8 characters long.",
          });
          return;
        }
        user.passwordHash = await hashPassword(resetPassword);
        user.tokenVersion += 1;
        user.failedLoginAttempts = 0;
        user.lockUntil = null;
      }

      await user.save();

      res.json({
        success: true,
        message: "Admin user updated.",
        data: serializeAdminUser(user),
      });
    } catch (err) {
      next(err);
    }
  }
);
