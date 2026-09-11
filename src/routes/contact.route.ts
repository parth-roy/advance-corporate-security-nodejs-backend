import { Router, Request, Response, NextFunction } from "express";
import { sendMail, buildEmailHtml } from "../utils/mailer";
import { ContactSubmission } from "../models/ContactSubmission.model";

export const contactRouter = Router();

contactRouter.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      firstName, lastName, email, phone,
      organization, service, city, message,
    } = req.body;

    // ─── Validation ─────────────────────────────────────────
    if (!firstName || !lastName || !email || !phone || !message) {
      res.status(400).json({
        success: false,
        message: "Required fields: firstName, lastName, email, phone, message",
      });
      return;
    }

    const recipientEmail = process.env.CONTACT_EMAIL || "admin@advancecorporatesecurity.com";
    const fullName = `${firstName.trim()} ${lastName.trim()}`;

    // ─── Save to MongoDB Atlas ───────────────────────────────
    const submission = new ContactSubmission({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      email: email.trim().toLowerCase(),
      phone: phone.trim(),
      organization: organization?.trim(),
      service: service?.trim(),
      city: city?.trim(),
      message: message.trim(),
      source: req.headers.referer || "website",
      ipAddress: req.ip || req.socket?.remoteAddress,
    });
    await submission.save();

    // ─── Email to ACS Admin ──────────────────────────────────
    const adminHtml = buildEmailHtml(
      "New Contact Form Submission",
      `
      <p><strong>Submitted at:</strong> ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>
      <table style="width:100%;border-collapse:collapse;">
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;width:30%;">Name</td><td style="padding:8px;border:1px solid #e5e7eb;">${fullName}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Email</td><td style="padding:8px;border:1px solid #e5e7eb;"><a href="mailto:${email}">${email}</a></td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Phone</td><td style="padding:8px;border:1px solid #e5e7eb;"><a href="tel:${phone}">${phone}</a></td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Organisation</td><td style="padding:8px;border:1px solid #e5e7eb;">${organization || "—"}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Service</td><td style="padding:8px;border:1px solid #e5e7eb;">${service || "—"}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">City</td><td style="padding:8px;border:1px solid #e5e7eb;">${city || "—"}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Message</td><td style="padding:8px;border:1px solid #e5e7eb;">${message.replace(/\n/g, "<br>")}</td></tr>
        <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">DB Record ID</td><td style="padding:8px;border:1px solid #e5e7eb;font-family:monospace;font-size:12px;">${submission._id}</td></tr>
      </table>
      `
    );

    // ─── Auto-reply to User ──────────────────────────────────
    const userHtml = buildEmailHtml(
      `Thank you, ${firstName}!`,
      `
      <p>Dear ${firstName},</p>
      <p>Thank you for contacting <strong>Advance Corporate Security</strong>. We have received your enquiry and our team will get back to you within <strong>24 hours</strong>.</p>
      <p>Here is a summary of your submission:</p>
      <ul style="color:#374151;line-height:1.8;">
        <li><strong>Service Requested:</strong> ${service || "General Enquiry"}</li>
        <li><strong>Location:</strong> ${city || "Not specified"}</li>
        <li><strong>Your Phone:</strong> ${phone}</li>
      </ul>
      <p>For urgent matters, you can also reach us at:</p>
      <p style="color:#c8993a;font-weight:bold;">${process.env.CONTACT_PHONE || "+91 93399 88999 / +91 79801 47044 / +91 94770 06681"}</p>
      <p>Warm regards,<br><strong>Team ACS</strong><br><em>Advance Corporate Security</em></p>
      `
    );

    // ─── Send both emails in parallel ────────────────────────
    await Promise.all([
      sendMail({
        to: recipientEmail,
        subject: `[ACS Contact] New Enquiry from ${fullName} — ${service || "General"}`,
        html: adminHtml,
        replyTo: email,
      }),
      sendMail({
        to: email,
        subject: "Thank you for contacting Advance Corporate Security",
        html: userHtml,
      }),
    ]);

    res.status(200).json({
      success: true,
      message: "Your message has been sent successfully. We will respond within 24 hours.",
    });
  } catch (err) {
    next(err);
  }
});

// ─── GET all submissions (for admin use — add auth middleware later) ──
contactRouter.get("/", async (_req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const submissions = await ContactSubmission.find()
      .sort({ createdAt: -1 })
      .limit(100)
      .select("-__v");

    res.json({ success: true, count: submissions.length, data: submissions });
  } catch (err) {
    next(err);
  }
});
