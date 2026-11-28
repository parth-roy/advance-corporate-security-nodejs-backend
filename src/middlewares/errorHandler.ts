import { Request, Response, NextFunction } from "express";

export interface AppError extends Error {
  statusCode?: number;
  code?: number;
  type?: string;
  keyValue?: Record<string, unknown>;
  errors?: Record<string, { message?: string }>;
}

export function errorHandler(
  err: AppError,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  let statusCode = err.statusCode || 500;
  let message = err.message || "Internal server error";

  if (err.name === "ValidationError") {
    statusCode = 400;
    const details = err.errors
      ? Object.values(err.errors)
          .map((item) => item?.message)
          .filter(Boolean)
          .join("; ")
      : "";
    message = details || err.message || "Validation failed";
  } else if (err.name === "CastError") {
    statusCode = 400;
    message = "Invalid resource identifier format.";
  } else if (err.code === 11000) {
    statusCode = 409;
    const dupFields = err.keyValue ? Object.keys(err.keyValue).join(", ") : "";
    message = dupFields
      ? `Duplicate value for existing record (${dupFields}).`
      : "Duplicate record already exists.";
  } else if (err.type === "entity.parse.failed" || err instanceof SyntaxError) {
    statusCode = 400;
    message = "Malformed JSON request payload.";
  } else if (process.env.NODE_ENV === "production" && statusCode === 500) {
    message = "Internal server error";
  }

  console.error(`[Error] ${statusCode}: ${message}`);
  if (statusCode >= 500 && err.stack && process.env.NODE_ENV !== "production") {
    console.error(err.stack);
  }

  res.status(statusCode).json({
    success: false,
    message,
    ...(statusCode >= 500 && process.env.NODE_ENV !== "production" && { stack: err.stack }),
  });
}
