import { S3Client } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { Readable } from "stream";

interface ObjectStorageConfig {
  provider: "r2" | "spaces" | "none";
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  publicBaseUrl: string;
  usePublicAcl: boolean;
}

function getStorageConfig(): ObjectStorageConfig {
  const r2AccessKey = (process.env.R2_ACCESS_KEY_ID || "").trim();
  const r2SecretKey = (process.env.R2_SECRET_ACCESS_KEY || "").trim();
  const r2AccountId = (process.env.R2_ACCOUNT_ID || "").trim();
  const r2Endpoint =
    (process.env.R2_ENDPOINT || "").trim() ||
    (r2AccountId ? `https://${r2AccountId}.r2.cloudflarestorage.com` : "");

  if (r2AccessKey && r2SecretKey && r2Endpoint) {
    const bucket = (process.env.R2_BUCKET || "acs-uploads").trim();
    const publicBaseUrl = (process.env.R2_PUBLIC_URL || "").trim().replace(/\/+$/, "");
    return {
      provider: "r2",
      endpoint: r2Endpoint.replace(/\/+$/, ""),
      region: (process.env.R2_REGION || "auto").trim(),
      bucket,
      accessKeyId: r2AccessKey,
      secretAccessKey: r2SecretKey,
      publicBaseUrl: publicBaseUrl || `${r2Endpoint.replace(/\/+$/, "")}/${bucket}`,
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

/**
 * Upload a file buffer to Cloudflare R2 (preferred) or DigitalOcean Spaces (legacy fallback).
 * @returns Public URL of the uploaded file
 */
export async function uploadToSpaces(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  folder: string = "uploads"
): Promise<string> {
  const cfg = getStorageConfig();
  if (cfg.provider === "none") {
    throw new Error("Object storage credentials are not configured (set R2_* or DO_SPACES_*).");
  }
  if (cfg.provider === "r2" && !process.env.R2_PUBLIC_URL) {
    console.warn("[Storage] R2_PUBLIC_URL is not set; returned URL will use the private R2 API endpoint.");
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
  return `${cfg.publicBaseUrl}/${key}`;
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
  return `${cfg.publicBaseUrl}/${key}`;
}

export { spacesClient, BUCKET_NAME, uploadToSpaces as uploadToObjectStorage };
