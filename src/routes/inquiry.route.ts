import { Router, Request, Response, NextFunction } from "express";
import { sendMail, buildEmailHtml } from "../utils/mailer";
import { Inquiry } from "../models/Inquiry.model";
import { appendToGoogleSheet } from "../utils/googleSheets";

export const inquiryRouter = Router();

inquiryRouter.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, email, phone, service, city, manpowerCount, duration, message } = req.body;

    // ─── Validation ─────────────────────────────────────────
    if (!name || !email || !phone || !service) {
      res.status(400).json({
        success: false,
        message: "Required fields: name, email, phone, service",
      });
      return;
    }

    const recipientEmail = process.env.CONTACT_EMAIL || "admin@advancecorporatesecurity.com";

    // ─── Save to MongoDB Atlas ───────────────────────────────
    const inquiry = new Inquiry({
      name: name.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      service: service.trim(),
      city: city?.trim(),
      manpowerCount: manpowerCount ? Number(manpowerCount) : undefined,
      duration: duration?.trim(),
      message: message?.trim(),
      ipAddress: req.ip || req.socket?.remoteAddress,
    });
    await inquiry.save();

    // ─── 2. Instant Response to Client (< 200ms) ───────────
    res.status(200).json({
      success: true,
      message: "Inquiry received. Our team will contact you within 24 hours.",
      data: { id: inquiry._id },
    });

    const adminHtml = buildEmailHtml(
      "New Service Inquiry",
      `
      <p><strong>Submitted at:</strong> ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;width:35%;">Name</td><td style="padding:8px;border:1px solid #e5e7eb;">${name}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Email</td><td style="padding:8px;border:1px solid #e5e7eb;"><a href="mailto:${email}">${email}</a></td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Phone</td><td style="padding:8px;border:1px solid #e5e7eb;"><a href="tel:${phone}">${phone}</a></td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Service Required</td><td style="padding:8px;border:1px solid #e5e7eb;">${service}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">City / Location</td><td style="padding:8px;border:1px solid #e5e7eb;">${city || "—"}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Manpower Count</td><td style="padding:8px;border:1px solid #e5e7eb;">${manpowerCount || "—"}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Duration</td><td style="padding:8px;border:1px solid #e5e7eb;">${duration || "—"}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Message</td><td style="padding:8px;border:1px solid #e5e7eb;">${message?.replace(/\n/g, "<br>") || "—"}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">DB Record ID</td><td style="padding:8px;border:1px solid #e5e7eb;font-family:monospace;font-size:12px;">${inquiry._id}</td></tr>
      </table>
      `
    );

    // ─── 3. Background Async Tasks (Google Sheet + Email) ───
    Promise.allSettled([
      appendToGoogleSheet({
        type: "inquiry",
        id: inquiry._id.toString(),
        name: name.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim(),
        service: service.trim(),
        city: city?.trim() || "",
        manpowerCount: manpowerCount ? Number(manpowerCount) : undefined,
        duration: duration?.trim() || "",
        message: message?.trim() || "",
        source: req.headers.referer || "website",
      }),

      sendMail({
        to: recipientEmail,
        subject: `[ACS Inquiry] ${service} — ${name} — ${city || "Location TBD"}`,
        html: adminHtml,
        replyTo: email,
      }),
    ]).catch((bgErr) => {
      console.error("[Inquiry Route] Background tasks error:", bgErr);
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET all inquiries (admin) ────────────────────────────
inquiryRouter.get("/", async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const inquiries = await Inquiry.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .select("-__v");

    res.json({ success: true, count: inquiries.length, data: inquiries });
  } catch (err) {
    next(err);
  }
});
