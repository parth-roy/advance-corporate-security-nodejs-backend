import { Request, Response, NextFunction } from "express";
import multer from "multer";
import { isObjectStorageConfigured, uploadObjectToStorage } from "../utils/spaces";

const MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const MAX_INLINE_FALLBACK_BYTES = 2 * 1024 * 1024;

const ALLOWED_DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
]);

const documentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_UPLOAD_SIZE_BYTES },
});

export function handleDocumentMultipart(req: Request, res: Response, next: NextFunction): void {
  documentUpload.single("file")(req, res, (err: unknown) => {
    if (!err) {
      next();
      return;
    }

    if (err instanceof multer.MulterError) {
      const message =
        err.code === "LIMIT_FILE_SIZE"
          ? "File size exceeds the 10 MB maximum upload limit."
          : err.message || "Invalid file upload request.";
      res.status(400).json({ success: false, message });
      return;
    }

    next(err);
  });
}

export async function processDocumentUpload(
  req: Request,
  res: Response,
  folder: string
): Promise<void> {
  const file = req.file;
  if (!file) {
    res.status(400).json({
      success: false,
      message: 'No file uploaded. Please provide a document in the "file" field.',
    });
    return;
  }

  if (!ALLOWED_DOCUMENT_MIME_TYPES.has((file.mimetype || "").toLowerCase())) {
    res.status(400).json({
      success: false,
      message: "Invalid file type. Allowed formats: PDF, JPG, JPEG, PNG, WEBP.",
    });
    return;
  }

  const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_") || "document";
  let fileUrl: string;
  let objectKey: string | undefined;

  if (isObjectStorageConfigured()) {
    const stored = await uploadObjectToStorage(file.buffer, safeName, file.mimetype, folder);
    objectKey = stored.key;
    if (stored.isPrivate) {
      const configuredBase = (process.env.API_PUBLIC_URL || "").trim().replace(/\/+$/, "");
      const host = req.get("host");
      const reqBase = configuredBase || (host ? `${req.protocol}://${host}` : "");
      fileUrl = `${reqBase}${stored.fileUrl}`;
    } else {
      fileUrl = stored.fileUrl;
    }
  } else {
    if (file.buffer.length > MAX_INLINE_FALLBACK_BYTES) {
      res.status(500).json({
        success: false,
        message: "Document storage is not configured and file exceeds the 2 MB inline fallback limit.",
      });
      return;
    }
    fileUrl = `data:${file.mimetype};base64,${file.buffer.toString("base64")}`;
  }

  res.status(201).json({
    success: true,
    message: "Document uploaded successfully.",
    data: {
      fileName: file.originalname,
      fileUrl,
      ...(objectKey ? { objectKey } : {}),
      mimeType: file.mimetype,
      size: file.size,
      uploadedAt: new Date().toISOString(),
    },
  });
}
