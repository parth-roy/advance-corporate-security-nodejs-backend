import crypto from "node:crypto";
import type { AdminRole } from "../models/admin/AdminUser.model";

export const ADMIN_AUTH_COOKIE = "acs_admin_token";
const JWT_ISSUER = "acs-backend";
const JWT_AUDIENCE = "acs-admin";
const DEFAULT_EXPIRES_IN_SECONDS = 60 * 60 * 12; // 12 hours

const SCRYPT_KEYLEN = 64;
const SCRYPT_COST = 16384;
const SCRYPT_BLOCK_SIZE = 8;
const SCRYPT_PARALLELIZATION = 1;

export interface AdminJwtPayload {
  sub: string;
  email: string;
  role: AdminRole;
  tokenVersion: number;
  iss: string;
  aud: string;
  iat: number;
  exp: number;
}

let warnedMissingSecret = false;

function getJwtSecret(): Buffer {
  const configured = process.env.ADMIN_JWT_SECRET || process.env.JWT_SECRET;
  if (configured && configured.length >= 16) {
    return Buffer.from(configured, "utf8");
  }
  if (!warnedMissingSecret) {
    warnedMissingSecret = true;
    console.warn(
      "[Admin Auth] ADMIN_JWT_SECRET is not configured (>= 16 chars). Set ADMIN_JWT_SECRET in .env for production security."
    );
  }
  const fallbackSource = process.env.MONGO_URI || "acs-local-dev-admin-jwt-secret";
  return crypto.createHash("sha256").update(`acs-admin-jwt:${fallbackSource}`).digest();
}

export function getJwtTtlSeconds(): number {
  const parsed = Number.parseInt(process.env.ADMIN_JWT_EXPIRES_IN_SECONDS || "", 10);
  return Number.isFinite(parsed) && parsed >= 300 ? parsed : DEFAULT_EXPIRES_IN_SECONDS;
}

function base64UrlEncode(input: Buffer | string): string {
  return Buffer.from(input).toString("base64url");
}

function base64UrlDecode(input: string): Buffer {
  return Buffer.from(input, "base64url");
}

export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.randomBytes(16).toString("hex");
  const derived = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      SCRYPT_KEYLEN,
      { N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELIZATION },
      (err, key) => {
        if (err) reject(err);
        else resolve(key);
      }
    );
  });
  return `scrypt$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string): Promise<boolean> {
  const parts = storedHash.split("$");
  if (parts.length !== 3 || parts[0] !== "scrypt") {
    return false;
  }
  const [, salt, hashHex] = parts;
  if (!salt || !hashHex) return false;

  const expected = Buffer.from(hashHex, "hex");
  const actual = await new Promise<Buffer>((resolve, reject) => {
    crypto.scrypt(
      password,
      salt,
      expected.length,
      { N: SCRYPT_COST, r: SCRYPT_BLOCK_SIZE, p: SCRYPT_PARALLELIZATION },
      (err, key) => {
        if (err) reject(err);
        else resolve(key);
      }
    );
  });

  if (actual.length !== expected.length) return false;
  return crypto.timingSafeEqual(actual, expected);
}

export function signAdminJwt(claims: {
  sub: string;
  email: string;
  role: AdminRole;
  tokenVersion: number;
}): { token: string; expiresIn: number } {
  const now = Math.floor(Date.now() / 1000);
  const expiresIn = getJwtTtlSeconds();

  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payloadObj: AdminJwtPayload = {
    sub: claims.sub,
    email: claims.email,
    role: claims.role,
    tokenVersion: claims.tokenVersion,
    iss: JWT_ISSUER,
    aud: JWT_AUDIENCE,
    iat: now,
    exp: now + expiresIn,
  };
  const payload = base64UrlEncode(JSON.stringify(payloadObj));
  const signingInput = `${header}.${payload}`;
  const signature = crypto
    .createHmac("sha256", getJwtSecret())
    .update(signingInput)
    .digest("base64url");

  return { token: `${signingInput}.${signature}`, expiresIn };
}

export function verifyAdminJwt(token: string): AdminJwtPayload | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 3) return null;
    const [headerB64, payloadB64, signatureB64] = parts;
    if (!headerB64 || !payloadB64 || !signatureB64) return null;

    const header = JSON.parse(base64UrlDecode(headerB64).toString("utf8")) as {
      alg?: string;
      typ?: string;
    };
    if (header.alg !== "HS256" || header.typ !== "JWT") return null;

    const signingInput = `${headerB64}.${payloadB64}`;
    const expectedSig = crypto
      .createHmac("sha256", getJwtSecret())
      .update(signingInput)
      .digest();
    const actualSig = base64UrlDecode(signatureB64);
    if (actualSig.length !== expectedSig.length) return null;
    if (!crypto.timingSafeEqual(actualSig, expectedSig)) return null;

    const payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8")) as AdminJwtPayload;
    const now = Math.floor(Date.now() / 1000);
    if (
      !payload.sub ||
      !payload.email ||
      payload.iss !== JWT_ISSUER ||
      payload.aud !== JWT_AUDIENCE ||
      typeof payload.exp !== "number" ||
      payload.exp <= now
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

export function parseCookies(cookieHeader?: string): Record<string, string> {
  if (!cookieHeader) return {};
  const result: Record<string, string> = {};
  for (const part of cookieHeader.split(";")) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx).trim();
    const val = part.slice(idx + 1).trim();
    if (key) {
      try {
        result[key] = decodeURIComponent(val);
      } catch {
        result[key] = val;
      }
    }
  }
  return result;
}

const DOC_VIEW_AUDIENCE = "acs-doc-view";

export function signDocumentViewToken(
  objectKey: string,
  adminId: string,
  ttlSeconds: number = 600
): string {
  const now = Math.floor(Date.now() / 1000);
  const exp = now + Math.max(60, Math.min(3600, ttlSeconds));
  const payload = base64UrlEncode(
    JSON.stringify({
      purpose: DOC_VIEW_AUDIENCE,
      key: objectKey,
      sub: adminId,
      iss: JWT_ISSUER,
      aud: DOC_VIEW_AUDIENCE,
      iat: now,
      exp,
    })
  );
  const signature = crypto
    .createHmac("sha256", getJwtSecret())
    .update(`doc:${payload}`)
    .digest("base64url");
  return `${payload}.${signature}`;
}

export function verifyDocumentViewToken(
  token: string,
  expectedKey: string
): { sub: string; key: string } | null {
  try {
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payloadB64, signatureB64] = parts;
    if (!payloadB64 || !signatureB64) return null;

    const expectedSig = crypto
      .createHmac("sha256", getJwtSecret())
      .update(`doc:${payloadB64}`)
      .digest();
    const actualSig = base64UrlDecode(signatureB64);
    if (actualSig.length !== expectedSig.length) return null;
    if (!crypto.timingSafeEqual(actualSig, expectedSig)) return null;

    const payload = JSON.parse(base64UrlDecode(payloadB64).toString("utf8")) as {
      purpose?: string;
      key?: string;
      sub?: string;
      iss?: string;
      aud?: string;
      exp?: number;
    };
    const now = Math.floor(Date.now() / 1000);
    if (
      payload.purpose !== DOC_VIEW_AUDIENCE ||
      payload.iss !== JWT_ISSUER ||
      payload.aud !== DOC_VIEW_AUDIENCE ||
      !payload.sub ||
      payload.key !== expectedKey ||
      typeof payload.exp !== "number" ||
      payload.exp <= now
    ) {
      return null;
    }
    return { sub: payload.sub, key: payload.key };
  } catch {
    return null;
  }
}
