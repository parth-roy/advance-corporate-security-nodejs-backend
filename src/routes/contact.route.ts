import { Router, Request, Response, NextFunction } from "express";
import { sendMail, buildEmailHtml } from "../utils/mailer";
import { ContactSubmission } from "../models/ContactSubmission.model";
import { appendToGoogleSheet } from "../utils/googleSheets";

export const contactRouter = Router();

contactRouter.post("/", async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  try {
    const {
      name, firstName, lastName, email, phone,
      organization, service, city, message,
    } = req.body;

    // ─── Flexible Name Extraction ────────────────────────────
    let cleanFirst = (firstName || "").trim();
    let cleanLast = (lastName || "").trim();

    if (!cleanFirst && name && typeof name === "string") {
      const parts = name.trim().split(/\s+/);
      cleanFirst = parts[0] || "";
      cleanLast = parts.slice(1).join(" ") || "";
    }

    // Fallback if only one name field provided
    if (!cleanFirst && cleanLast) {
      cleanFirst = cleanLast;
      cleanLast = "";
    }
    if (cleanFirst && !cleanLast) {
      cleanLast = "—";
    }

    const cleanEmail = (email || "").trim().toLowerCase();
    const cleanPhone = (phone || "").trim();
    const cleanMessage = (message || "").trim();

    // ─── Validation ─────────────────────────────────────────
    const errors: Record<string, string> = {};
    if (!cleanFirst) errors.name = "First name or full name is required";
    if (!cleanEmail) errors.email = "Valid email address is required";
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) errors.email = "Please provide a valid email format";
    
    if (!cleanPhone) errors.phone = "Phone number is required";
    else if (cleanPhone.replace(/\D/g, "").length < 10) errors.phone = "Phone number must be at least 10 digits";

    if (!cleanMessage) errors.message = "Message / requirements cannot be empty";

    if (Object.keys(errors).length > 0) {
      res.status(400).json({
        success: false,
        message: "Please fill in all required fields accurately.",
        errors,
      });
      return;
    }

    const recipientEmail = process.env.CONTACT_EMAIL || "advancedcorporatesecurityj@gmail.com";
    const fullName = `${cleanFirst} ${cleanLast !== "—" ? cleanLast : ""}`.trim();

    // ─── 1. Save to MongoDB Atlas (Persistent Storage) ───────
    const submission = new ContactSubmission({
      firstName: cleanFirst,
      lastName: cleanLast,
      email: cleanEmail,
      phone: cleanPhone,
      organization: organization?.trim() || "",
      service: service?.trim() || "General Enquiry",
      city: city?.trim() || "",
      message: cleanMessage,
      source: req.headers.referer || "website",
      ipAddress: req.ip || req.socket?.remoteAddress,
    });
    await submission.save();

    // ─── 2. Instant Response to Client (No Lag!) ─────────────
    res.status(200).json({
      success: true,
      message: "Your message has been sent successfully. We will respond within 24 hours.",
      data: {
        id: submission._id,
        name: fullName,
        email: cleanEmail,
      },
    });

    // ─── 3. Background Async Operations (Emails + Google Sheet)
    // Run concurrently without blocking the client's HTTP response
    Promise.allSettled([
      // A. Sync to Google Sheets
      appendToGoogleSheet({
        type: "contact",
        id: submission._id.toString(),
        name: fullName,
        firstName: cleanFirst,
        lastName: cleanLast,
        email: cleanEmail,
        phone: cleanPhone,
        organization: organization?.trim() || "",
        service: service?.trim() || "General Enquiry",
        city: city?.trim() || "",
        message: cleanMessage,
        source: req.headers.referer || "website",
      }),

      // B. Admin Email Notification
      sendMail({
        to: recipientEmail,
        subject: `[ACS Contact] New Enquiry from ${fullName} — ${service || "General"}`,
        html: buildEmailHtml(
          "New Contact Form Submission",
          `
          <p><strong>Submitted at:</strong> ${new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" })} IST</p>
          <table style="width:100%;border-collapse:collapse;">
            <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;width:30%;">Name</td><td style="padding:8px;border:1px solid #e5e7eb;">${fullName}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Email</td><td style="padding:8px;border:1px solid #e5e7eb;"><a href="mailto:${cleanEmail}">${cleanEmail}</a></td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Phone</td><td style="padding:8px;border:1px solid #e5e7eb;"><a href="tel:${cleanPhone}">${cleanPhone}</a></td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Organisation</td><td style="padding:8px;border:1px solid #e5e7eb;">${organization || "—"}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Service</td><td style="padding:8px;border:1px solid #e5e7eb;">${service || "General Enquiry"}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">City</td><td style="padding:8px;border:1px solid #e5e7eb;">${city || "—"}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">Message</td><td style="padding:8px;border:1px solid #e5e7eb;">${cleanMessage.replace(/\n/g, "<br>")}</td></tr>
            <tr><td style="padding:8px;border:1px solid #e5e7eb;background:#f8f9fa;font-weight:bold;">DB Record ID</td><td style="padding:8px;border:1px solid #e5e7eb;font-family:monospace;font-size:12px;">${submission._id}</td></tr>
          </table>
          `
        ),
        replyTo: cleanEmail,
      }),

      // C. User Auto-Confirmation Email
      sendMail({
        to: cleanEmail,
        subject: "Thank you for contacting Advance Corporate Security",
        html: buildEmailHtml(
          `Thank you, ${cleanFirst}!`,
          `
          <p>Dear ${cleanFirst},</p>
          <p>Thank you for contacting <strong>Advance Corporate Security</strong>. We have received your enquiry and our team will get back to you within <strong>24 hours</strong>.</p>
          <p>Here is a summary of your submission:</p>
          <ul style="color:#374151;line-height:1.8;">
            <li><strong>Service Requested:</strong> ${service || "General Enquiry"}</li>
            <li><strong>Location:</strong> ${city || "Not specified"}</li>
            <li><strong>Your Phone:</strong> ${cleanPhone}</li>
          </ul>
          <p>For urgent matters, you can also reach us at:</p>
          <p style="color:#c8993a;font-weight:bold;">${process.env.CONTACT_PHONE || "+91 93399 88999 / +91 79801 47044 / +91 94770 06681"}</p>
          <p>Warm regards,<br><strong>Team ACS</strong><br><em>Advance Corporate Security</em></p>
          `
        ),
      }),
    ]).catch((bgErr) => {
      console.error("[Contact Route] Background task error:", bgErr);
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
