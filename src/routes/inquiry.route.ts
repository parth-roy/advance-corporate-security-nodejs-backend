import { Router, Request, Response, NextFunction } from "express";
import { sendMail, buildEmailHtml } from "../utils/mailer";

export const inquiryRouter = Router();

inquiryRouter.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, email, phone, service, city, manpowerCount, duration, message } = req.body;

    if (!name || !email || !phone || !service) {
      res.status(400).json({
        success: false,
        message: "Required fields: name, email, phone, service",
      });
      return;
    }

    const recipientEmail = process.env.CONTACT_EMAIL || "advancedcorporatesecurityj@gmail.com";

    const adminHtml = buildEmailHtml(
      "New Service Inquiry",
      `
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;width:35%;">Name</td><td style="padding:8px;border:1px solid #e5e7eb;">${name}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Email</td><td style="padding:8px;border:1px solid #e5e7eb;"><a href="mailto:${email}">${email}</a></td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Phone</td><td style="padding:8px;border:1px solid #e5e7eb;"><a href="tel:${phone}">${phone}</a></td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Service Required</td><td style="padding:8px;border:1px solid #e5e7eb;">${service}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">City / Location</td><td style="padding:8px;border:1px solid #e5e7eb;">${city || "—"}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Manpower Count</td><td style="padding:8px;border:1px solid #e5e7eb;">${manpowerCount || "—"}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Duration</td><td style="padding:8px;border:1px solid #e5e7eb;">${duration || "—"}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Message</td><td style="padding:8px;border:1px solid #e5e7eb;">${message?.replace(/\n/g, "<br>") || "—"}</td></tr>
      </table>
      `
    );

    await sendMail({
      to: recipientEmail,
      subject: `[ACS Inquiry] ${service} — ${name} — ${city || "Location TBD"}`,
      html: adminHtml,
      replyTo: email,
    });

    res.status(200).json({
      success: true,
      message: "Inquiry received. Our team will contact you within 24 hours.",
    });
  } catch (err) {
    next(err);
  }
});
