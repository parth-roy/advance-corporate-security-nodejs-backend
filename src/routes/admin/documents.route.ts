import { Router, Request, Response, NextFunction } from "express";
import path from "node:path";
import { AdminUser } from "../../models/admin/AdminUser.model";
import { extractAdminToken } from "../../middlewares/adminAuth";
import {
  signDocumentViewToken,
  verifyAdminJwt,
  verifyDocumentViewToken,
} from "../../utils/adminAuth";
import { getObjectFromStorage, normalizeAllowedObjectKey } from "../../utils/spaces";

export const documentsPublicAccessRouter = Router();
export const documentsProtectedRouter = Router();

const ALLOWED_FRAME_ANCESTORS = [
  "'self'",
  "https://admin.advancecorporatesecurity.com",
  "https://test-admin.advancecorporatesecurity.com",
  "https://advancecorporatesecurity.com",
  "https://www.advancecorporatesecurity.com",
  "http://localhost:7967",
  "http://127.0.0.1:7967",
].join(" ");

function buildBaseUrl(req: Request): string {
  const configured = (process.env.API_PUBLIC_URL || "").trim().replace(/\/+$/, "");
  if (configured) return configured;
  const host = req.get("host");
  return host ? `${req.protocol}://${host}` : "";
}

/**
 * POST /api/admin/documents/sign
 * Protected by requireAdminAuth; returns a 10-minute scoped viewing URL for private R2 files.
 */
documentsProtectedRouter.post(
  "/sign",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const raw = String(req.body?.key || req.body?.fileUrl || "").trim();
      const key = normalizeAllowedObjectKey(raw);
      if (!key) {
        res.status(400).json({ success: false, message: "Invalid or unsupported document key." });
        return;
      }

      const ttl = 600;
      const sig = signDocumentViewToken(key, req.adminUser!.id, ttl);
      const base = buildBaseUrl(req);
      const signedUrl = `${base}/api/admin/documents/file?key=${encodeURIComponent(key)}&sig=${encodeURIComponent(sig)}`;

      res.json({
        success: true,
        data: {
          key,
          signedUrl,
          expiresInSeconds: ttl,
        },
      });
    } catch (err) {
      next(err);
    }
  }
);

/**
 * GET /api/admin/documents/file?key=...(&sig=...)
 * Accepts either a valid admin JWT (Bearer / cookie) OR a valid 10-minute signed view token (?sig=).
 */
documentsPublicAccessRouter.get(
  "/file",
  async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    try {
      const rawKey = typeof req.query.key === "string" ? req.query.key : "";
      const key = normalizeAllowedObjectKey(rawKey);
      if (!key) {
        res.status(400).json({ success: false, message: "Invalid document key." });
        return;
      }

      const rawSig = typeof req.query.sig === "string" ? req.query.sig.trim() : "";
      let authorizedAdminId: string | null = null;

      if (rawSig) {
        const verifiedSig = verifyDocumentViewToken(rawSig, key);
        if (!verifiedSig) {
          res.status(401).json({ success: false, message: "Invalid or expired document access link." });
          return;
        }
        const user = await AdminUser.findById(verifiedSig.sub).select("isActive").lean();
        if (!user || !user.isActive) {
          res.status(401).json({ success: false, message: "Admin account inactive." });
          return;
        }
        authorizedAdminId = verifiedSig.sub;
      } else {
        const jwtToken = extractAdminToken(req);
        if (!jwtToken) {
          res.status(401).json({ success: false, message: "Authentication required to access document." });
          return;
        }
        const jwtPayload = verifyAdminJwt(jwtToken);
        if (!jwtPayload) {
          res.status(401).json({ success: false, message: "Invalid or expired session." });
          return;
        }
        const user = await AdminUser.findById(jwtPayload.sub)
          .select("isActive tokenVersion")
          .lean();
        if (!user || !user.isActive || user.tokenVersion !== jwtPayload.tokenVersion) {
          res.status(401).json({ success: false, message: "Session unauthorized or revoked." });
          return;
        }
        authorizedAdminId = String(user._id);
      }

      if (!authorizedAdminId) {
        res.status(401).json({ success: false, message: "Unauthorized." });
        return;
      }

      const obj = await getObjectFromStorage(key);
      const safeFileName = path.basename(key).replace(/[^a-zA-Z0-9._-]/g, "_") || "document";

      res.removeHeader("X-Frame-Options");
      res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
      res.setHeader("Content-Security-Policy", `frame-ancestors ${ALLOWED_FRAME_ANCESTORS}`);
      res.setHeader("Content-Type", obj.contentType);
      res.setHeader("Content-Disposition", `inline; filename="${safeFileName}"`);
      res.setHeader("Cache-Control", "private, max-age=300");
      if (typeof obj.contentLength === "number") {
        res.setHeader("Content-Length", String(obj.contentLength));
      }

      obj.body.on("error", (streamErr) => {
        if (!res.headersSent) next(streamErr);
        else res.destroy();
      });
      obj.body.pipe(res);
    } catch (err: any) {
      if (err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404) {
        res.status(404).json({ success: false, message: "Document not found in private storage." });
        return;
      }
      next(err);
    }
  }
);
