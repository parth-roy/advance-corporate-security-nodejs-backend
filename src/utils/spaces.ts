import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { Readable } from "stream";

// DigitalOcean Spaces — compatible with AWS S3 SDK
const spacesClient = new S3Client({
  endpoint: process.env.DO_SPACES_ENDPOINT || "https://sgp1.digitaloceanspaces.com",
  region: "sgp1",
  credentials: {
    accessKeyId: process.env.DO_SPACES_ACCESS_KEY || "",
    secretAccessKey: process.env.DO_SPACES_SECRET_KEY || "",
  },
});

const BUCKET_NAME = process.env.DO_SPACES_BUCKET || "acs-bkp-do";

/**
 * Upload a file buffer to DigitalOcean Spaces
 * @returns Public URL of the uploaded file
 */
export async function uploadToSpaces(
  fileBuffer: Buffer,
  fileName: string,
  mimeType: string,
  folder: string = "uploads"
): Promise<string> {
  const key = `${folder}/${Date.now()}-${fileName}`;

  const upload = new Upload({
    client: spacesClient,
    params: {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: fileBuffer,
      ContentType: mimeType,
      ACL: "public-read",
    },
  });

  await upload.done();

  // Return public CDN URL
  const endpoint = process.env.DO_SPACES_ENDPOINT || "https://sgp1.digitaloceanspaces.com";
  return `${endpoint}/${BUCKET_NAME}/${key}`;
}

/**
 * Upload a readable stream to DigitalOcean Spaces
 */
export async function uploadStreamToSpaces(
  stream: Readable,
  fileName: string,
  mimeType: string,
  folder: string = "uploads"
): Promise<string> {
  const key = `${folder}/${Date.now()}-${fileName}`;

  const upload = new Upload({
    client: spacesClient,
    params: {
      Bucket: BUCKET_NAME,
      Key: key,
      Body: stream,
      ContentType: mimeType,
      ACL: "public-read",
    },
    queueSize: 4,
    partSize: 1024 * 1024 * 5, // 5MB parts
  });

  await upload.done();

  const endpoint = process.env.DO_SPACES_ENDPOINT || "https://sgp1.digitaloceanspaces.com";
  return `${endpoint}/${BUCKET_NAME}/${key}`;
}

export { spacesClient, BUCKET_NAME };
