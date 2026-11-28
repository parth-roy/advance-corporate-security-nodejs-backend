import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import dns from "node:dns";
import net from "node:net";
import { Readable } from "stream";

// Prefer IPv4 when connecting to Cloudflare R2 / S3 endpoints so IPv4-only API token allowlists match cleanly
dns.setDefaultResultOrder("ipv4first");
if (typeof net.setDefaultAutoSelectFamily === "function") {
  net.setDefaultAutoSelectFamily(false);
}

interface ObjectStorageConfig {
  provider: "r2" | "spaces" | "none";
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  isPrivate: boolean;
  usePublicAcl: boolean;
}

const ALLOWED_KEY_PREFIXES = ["recruitment-docs/", "muster-approvals/"] as const;

function isPrivateR2ApiUrl(url: string): boolean {
  return /\.r2\.cloudflarestorage\.com/i.test(url);
}

function getStorageConfig(): ObjectStorageConfig {
  const r2AccessKey = (process.env.R2_ACCESS_KEY_ID || "").trim();
  const r2SecretKey = (process.env.R2_SECRET_ACCESS_KEY || "").trim();
  const r2AccountId = (process.env.R2_ACCOUNT_ID || "").trim();
  const r2Endpoint =
    (process.env.R2_ENDPOINT || "").trim() ||
    (r2AccountId ? `https://${r2AccountId}.r2.cloudflarestorage.com` : "");

  if (r2AccessKey && r2SecretKey && r2Endpoint) {
    const bucket = (process.env.R2_BUCKET || "acs-prod-docs").trim();
    const rawPublic = (process.env.R2_PUBLIC_URL || "").trim().replace(/\/+$/, "");
    const hasPublicCdn = Boolean(rawPublic && !isPrivateR2ApiUrl(rawPublic));
    return {
      provider: "r2",
      endpoint: r2Endpoint.replace(/\/+$/, ""),
      region: (process.env.R2_REGION || "auto").trim(),
      bucket,
      accessKeyId: r2AccessKey,
      secretAccessKey: r2SecretKey,
      publicBaseUrl: hasPublicCdn ? rawPublic : "",
      isPrivate: !hasPublicCdn,
      usePublicAcl: false,
    };
  }

  const spacesAccessKey = (process.env.DO_SPACES_ACCESS_KEY || "").trim();
  const spacesSecretKey = (process.env.DO_SPACES_SECRET_KEY || "").trim();
  if (spacesAccessKey && spacesSecretKey) {
    const endpoint = (process.env.DO_SPACES_ENDPOINT || "https://sgp1.digitaloceanspaces.com")
      .trim()
      .replace(/\/+$/, "");
    const bucket = (process.env.DO_SPACES_BUCKET || "acs-bkp-do").trim();
    return {
      provider: "spaces",
      endpoint,
      region: (process.env.DO_SPACES_REGION || "sgp1").trim(),
      bucket,
      accessKeyId: spacesAccessKey,
      secretAccessKey: spacesSecretKey,
      publicBaseUrl: `${endpoint}/${bucket}`,
      isPrivate: false,
      usePublicAcl: true,
    };
  }

  const fallbackEndpoint = (process.env.DO_SPACES_ENDPOINT || "https://sgp1.digitaloceanspaces.com")
    .trim()
    .replace(/\/+$/, "");
  const fallbackBucket = (process.env.DO_SPACES_BUCKET || "acs-bkp-do").trim();
  return {
    provider: "none",
    endpoint: fallbackEndpoint,
    region: "sgp1",
    bucket: fallbackBucket,
    accessKeyId: "",
    secretAccessKey: "",
    publicBaseUrl: `${fallbackEndpoint}/${fallbackBucket}`,
    isPrivate: false,
    usePublicAcl: true,
  };
}

function createStorageClient(cfg: ObjectStorageConfig): S3Client {
  return new S3Client({
    endpoint: cfg.endpoint,
    region: cfg.region,
    credentials: {
      accessKeyId: cfg.accessKeyId,
      secretAccessKey: cfg.secretAccessKey,
    },
    ...(cfg.provider === "r2" ? { forcePathStyle: true } : {}),
  });
}

const initialConfig = getStorageConfig();
const spacesClient = createStorageClient(initialConfig);
const BUCKET_NAME = initialConfig.bucket;

export function isObjectStorageConfigured(): boolean {
  return getStorageConfig().provider !== "none";
}

export function isPrivateObjectStorage(): boolean {
  return getStorageConfig().isPrivate;
}

export function normalizeAllowedObjectKey(rawInput: string): string | null {
  const trimmed = String(rawInput || "").trim();
  if (!trimmed) return null;

  let candidate = trimmed;
  try {
    if (candidate.startsWith("http://") || candidate.startsWith("https://") || candidate.startsWith("/")) {
      const parsed = new URL(candidate, "https://api.advancecorporatesecurity.com");
      const qKey = parsed.searchParams.get("key");
      if (qKey) {
        candidate = qKey;
      } else {
        let p = parsed.pathname.replace(/^\/+/, "");
        const bucketPrefix = `${getStorageConfig().bucket}/`;
        if (p.startsWith(bucketPrefix)) {
          p = p.slice(bucketPrefix.length);
        }
        candidate = p;
      }
    }
  } catch {
    // Use trimmed as-is
  }

  try {
    candidate = decodeURIComponent(candidate);
  } catch {
    // Ignore double-decode issues
  }

  candidate = candidate.replace(/^\/+/, "").trim();
  if (
    !candidate ||
    candidate.includes("..") ||
    candidate.includes("\\") ||
    /[\x00-\x1f]/.test(candidate)
  ) {
    return null;
  }

  if (!ALLOWED_KEY_PREFIXES.some((prefix) => candidate.startsWith(prefix))) {
    return null;
  }

  return candidate;
}

export async function uploadObjectToStorage(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  folder: string = "uploads"
): Promise<{ key: string; fileUrl: string; isPrivate: boolean }> {
  const cfg = getStorageConfig();
  if (cfg.provider === "none") {
    throw new Error("Object storage credentials are not configured (set R2_* or DO_SPACES_*).");
  }

  const key = `${folder}/${Date.now()}-${fileName}`;
  const client = createStorageClient(cfg);

  const upload = new Upload({
    client,
    params: {
      Bucket: cfg.bucket,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
      ...(cfg.usePublicAcl ? { ACL: "public-read" } : {}),
    },
  });

  await upload.done();
  const fileUrl = cfg.isPrivate
    ? `/api/admin/documents/file?key=${encodeURIComponent(key)}`
    : `${cfg.publicBaseUrl}/${key}`;
  return { key, fileUrl, isPrivate: cfg.isPrivate };
}

export async function getObjectFromStorage(rawKey: string): Promise<{
  key: string;
  body: Readable;
  contentType: string;
  contentLength?: number;
}> {
  const cfg = getStorageConfig();
  if (cfg.provider === "none") {
    throw new Error("Object storage credentials are not configured.");
  }
  const key = normalizeAllowedObjectKey(rawKey);
  if (!key) {
    const err = new Error("Invalid document key.") as Error & { statusCode?: number };
    err.statusCode = 400;
    throw err;
  }

  const client = createStorageClient(cfg);
  const out = await client.send(
    new GetObjectCommand({
      Bucket: cfg.bucket,
      Key: key,
    })
  );

  if (!out.Body) {
    const err = new Error("Document not found in storage.") as Error & { statusCode?: number };
    err.statusCode = 404;
    throw err;
  }

  const bodyStream =
    out.Body instanceof Readable
      ? out.Body
      : Readable.fromWeb(out.Body.transformToWebStream() as any);

  return {
    key,
    body: bodyStream,
    contentType: out.ContentType || "application/octet-stream",
    ...(typeof out.ContentLength === "number" ? { contentLength: out.ContentLength } : {}),
  };
}

/**
 * Upload a file buffer to Cloudflare R2 (preferred) or DigitalOcean Spaces (legacy fallback).
 * @returns Public or authenticated API URL of the uploaded file
 */
export async function uploadToSpaces(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  folder: string = "uploads"
): Promise<string> {
  const res = await uploadObjectToStorage(fileBuffer, fileName, mimeType, folder);
  return res.fileUrl;
}

/**
 * Upload a readable stream to Cloudflare R2 or DigitalOcean Spaces
 */
export async function uploadStreamToSpaces(
  stream: Readable,
  fileName: string,
  mimeType: string,
  folder: string = "uploads"
): Promise<string> {
  const cfg = getStorageConfig();
  if (cfg.provider === "none") {
    throw new Error("Object storage credentials are not configured (set R2_* or DO_SPACES_*).");
  }

  const key = `${folder}/${Date.now()}-${fileName}`;
  const client = createStorageClient(cfg);

  const upload = new Upload({
    client,
    params: {
      Bucket: cfg.bucket,
      Key: key,
      Body: stream,
      ContentType: mimeType,
      ...(cfg.usePublicAcl ? { ACL: "public-read" } : {}),
    },
    queueSize: 4,
    partSize: 1024 * 1024 * 5, // 5MB parts
  });

  await upload.done();
  return cfg.isPrivate
    ? `/api/admin/documents/file?key=${encodeURIComponent(key)}`
    : `${cfg.publicBaseUrl}/${key}`;
}

export { spacesClient, BUCKET_NAME, uploadToSpaces as uploadToObjectStorage };
