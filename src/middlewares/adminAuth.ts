import { Request, Response, NextFunction } from "express";
import { AdminRole, AdminUser } from "../models/admin/AdminUser.model";
import { ADMIN_AUTH_COOKIE, parseCookies, verifyAdminJwt } from "../utils/adminAuth";

export interface AuthenticatedAdmin {
  id: string;
  name: string;
  email: string;
  role: AdminRole;
  tokenVersion: number;
}

declare global {
  namespace Express {
    interface Request {
      adminUser?: AuthenticatedAdmin;
    }
  }
}

export function extractAdminToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (typeof authHeader === "string" && authHeader.startsWith("Bearer ")) {
    const bearer = authHeader.slice(7).trim();
    if (bearer) return bearer;
  }
  const cookies = parseCookies(req.headers.cookie);
  return cookies[ADMIN_AUTH_COOKIE] || null;
}

export async function requireAdminAuth(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const token = extractAdminToken(req);
    if (!token) {
      res.status(401).json({
        success: false,
        message: "Authentication required. Please sign in with your ACS admin account.",
      });
      return;
    }

    const payload = verifyAdminJwt(token);
    if (!payload) {
      res.status(401).json({
        success: false,
        message: "Invalid or expired session. Please sign in again.",
      });
      return;
    }

    const user = await AdminUser.findById(payload.sub)
      .select("name email role isActive tokenVersion")
      .lean();

    if (!user) {
      res.status(401).json({
        success: false,
        message: "Account no longer exists in database. Access denied.",
      });
      return;
    }

    if (!user.isActive) {
      res.status(403).json({
        success: false,
        message: "Your admin account is disabled. Contact a super administrator.",
      });
      return;
    }

    if (user.tokenVersion !== payload.tokenVersion) {
      res.status(401).json({
        success: false,
        message: "Session has been revoked. Please sign in again.",
      });
      return;
    }

    req.adminUser = {
      id: String(user._id),
      name: user.name,
      email: user.email,
      role: user.role,
      tokenVersion: user.tokenVersion,
    };

    next();
  } catch (err) {
    next(err);
  }
}

export function requireAdminRole(...allowedRoles: AdminRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.adminUser) {
      res.status(401).json({ success: false, message: "Authentication required." });
      return;
    }
    if (!allowedRoles.includes(req.adminUser.role)) {
      res.status(403).json({
        success: false,
        message: "Insufficient permissions for this action.",
      });
      return;
    }
    next();
  };
}

// ─── Sliding-window IP rate limiter for login ────────────────
const LOGIN_WINDOW_MS = 15 * 60 * 1000;
const MAX_LOGIN_ATTEMPTS_PER_IP = 20;
const loginAttemptBuckets = new Map<string, number[]>();

export function loginRateLimiter(req: Request, res: Response, next: NextFunction): void {
  const ip = req.ip || req.socket?.remoteAddress || "unknown";
  const now = Date.now();
  const recent = (loginAttemptBuckets.get(ip) || []).filter((ts) => now - ts < LOGIN_WINDOW_MS);

  if (recent.length >= MAX_LOGIN_ATTEMPTS_PER_IP) {
    const retryAfterSec = Math.ceil((LOGIN_WINDOW_MS - (now - recent[0]!)) / 1000);
    res.setHeader("Retry-After", String(Math.max(1, retryAfterSec)));
    res.status(429).json({
      success: false,
      message: "Too many login attempts from this network. Please try again later.",
    });
    return;
  }

  recent.push(now);
  loginAttemptBuckets.set(ip, recent);
  next();
}
