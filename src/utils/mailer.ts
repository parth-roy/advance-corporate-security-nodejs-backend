import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS, // Gmail App Password
  },
});

export interface MailOptions {
  to: string;
  subject: string;
  html: string;
  replyTo?: string;
}

export async function sendMail(options: MailOptions): Promise<void> {
  await transporter.sendMail({
    from: `"Advance Corporate Services" <${process.env.SMTP_USER}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
    replyTo: options.replyTo,
  });
}

/** Branded email template */
export function buildEmailHtml(title: string, body: string): string {
  return `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f4;font-family:Arial,sans-serif;">
  <div style="max-width:600px;margin:30px auto;background:#fff;border-radius:8px;overflow:hidden;box-shadow:0 2px 10px rgba(0,0,0,0.1);">
    <!-- Header -->
    <div style="background:#0b1f3f;padding:24px 32px;text-align:center;">
      <h1 style="color:#c8993a;margin:0;font-size:20px;letter-spacing:1px;">ADVANCE CORPORATE SERVICES</h1>
      <p style="color:#9ca3af;margin:4px 0 0;font-size:12px;letter-spacing:2px;text-transform:uppercase;">ISO 9001:2015 Certified</p>
    </div>
    <!-- Body -->
    <div style="padding:32px;">
      <h2 style="color:#0b1f3f;margin-top:0;">${title}</h2>
      ${body}
    </div>
    <!-- Footer -->
    <div style="background:#f8f9fa;padding:20px 32px;border-top:1px solid #e5e7eb;text-align:center;">
      <p style="color:#6b7280;font-size:12px;margin:0;">Advance Corporate Services | Barrackpore, Kolkata, West Bengal</p>
      <p style="color:#6b7280;font-size:12px;margin:4px 0 0;">
        <a href="https://advancecorporatesecurity.com" style="color:#c8993a;">advancecorporatesecurity.com</a>
      </p>
    </div>
  </div>
</body>
</html>`;
}
