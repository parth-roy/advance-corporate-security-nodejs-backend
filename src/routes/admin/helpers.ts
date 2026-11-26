import { Request } from "express";
import { AdminActivity } from "../../models/admin/AdminFinance.model";

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function getParamId(req: Request): string {
  const raw = req.params.id;
  return Array.isArray(raw) ? raw[0] || "" : String(raw || "");
}

export function serializeDoc<T extends Record<string, any>>(doc: T): T & { id: string } {
  const plain = typeof doc.toObject === "function" ? doc.toObject() : { ...doc };
  const id = plain._id ? String(plain._id) : String(plain.id || "");
  delete plain.__v;
  return { ...plain, id };
}

export function stripMetaFields(body: Record<string, any>): Record<string, any> {
  const { _id, id, __v, createdAt, updatedAt, ...rest } = body || {};
  return rest;
}

export async function logAdminActivity(
  title: string,
  detail: string,
  module: string
): Promise<void> {
  try {
    await AdminActivity.create({
      title,
      detail,
      module,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    console.warn("[Admin Activity Log] Failed to record activity:", (err as Error).message);
  }
}
