// ============================================================
// ACS Backend — Google Sheets Sync Utility (via Apps Script Webhook)
// No GCP/GCC required — lightweight, zero-cost, direct webhook sync
// ============================================================

export interface GoogleSheetLeadPayload {
  type: "contact" | "inquiry" | "job_post" | "job_application";
  id?: string;
  name?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  organization?: string;
  service?: string;
  city?: string;
  manpowerCount?: number | string;
  duration?: string;
  message?: string;
  source?: string;
  submittedAt?: string;

  // Additional fields for Job Postings
  jobTitle?: string;
  jobCategory?: string;
  vacancy?: string | number;
  jobType?: string;
  isContractual?: boolean;
  workLocationType?: string;
  locality?: string;
  salaryMin?: number;
  salaryMax?: number;
  incentives?: string;
  benefits?: string;
  shift?: string;
  workingDays?: string;
  requiresDeposit?: boolean;
  depositDetails?: string;
  gender?: string;
  qualification?: string;
  experience?: string;
  skills?: string;
  assetsNeeded?: string;
  documentsRequired?: string;
  description?: string;

  // Additional fields for Job Applications
  applicantName?: string;
  applicantPhone?: string;
  applicantEmail?: string;
  applicantCity?: string;
  applicantExperience?: string;
  applicantQualification?: string;
  jobId?: string;
}

export interface WhatsAppMessagePayload {
  intent: "SECURITY" | "FACILITY" | "MANPOWER" | "SUPPORT" | string;
  name?: string;
  fullName?: string;
  phone?: string;
  service: string;
  deploymentLocation: string;
  headcount?: string;
  organization?: string;
  contactNumber?: string;
  city: string;
  source?: string;
}

/**
 * Google Sheets sync is handled exclusively by the Next.js API layer (src/lib/sheetsSync.ts).
 * This backend function is intentionally disabled to prevent duplicate rows
 * when both Next.js (port 3000) and Node.js backend (port 4000) are running simultaneously.
 *
 * DO NOT re-enable this function — the Next.js layer dispatches once per request.
 */
export async function appendToGoogleSheet(_payload: GoogleSheetLeadPayload): Promise<boolean> {
  // Disabled: Next.js API routes handle all Google Sheets syncing.
  return false;
}

/**
 * Fire-and-forget: logs a WhatsApp modal interaction to the
 * "WhatsApp Messages" tab in the ACS-leads Google Sheet.
 * Never blocks — call without await and swallow errors.
 */
export async function appendWhatsAppMessage(payload: WhatsAppMessagePayload): Promise<boolean> {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim();

  if (!webhookUrl || webhookUrl.includes("YOUR_APPS_SCRIPT_DEPLOYMENT_ID")) {
    console.log("[GoogleSheets] Notice: GOOGLE_SHEETS_WEBHOOK_URL not set. Skipping WhatsApp log.");
    return false;
  }

  const dataToSend = {
    type: "whatsapp_message",
    name: payload.name || payload.fullName || "",
    phone: payload.phone || payload.contactNumber || "",
    intent: payload.intent,
    service: payload.service,
    deploymentLocation: payload.deploymentLocation,
    headcount: payload.headcount || "",
    organization: payload.organization || "",
    contactNumber: payload.phone || payload.contactNumber || "",
    city: payload.city,
    source: payload.source || "whatsapp_intent_modal",
    submittedAt: new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST",
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);

    const response = await fetch(webhookUrl, {
      method: "POST",
      redirect: "follow",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(dataToSend),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[GoogleSheets] WhatsApp log webhook status: ${response.status}`);
      return false;
    }

    const text = await response.text();
    console.log(`[GoogleSheets] ✅ WhatsApp message logged (${payload.intent}):`, text.slice(0, 80));
    return true;
  } catch (err: any) {
    if (err.name === "AbortError") {
      console.error("[GoogleSheets] ❌ WhatsApp log webhook timed out after 10s.");
    } else {
      console.error("[GoogleSheets] ❌ WhatsApp log error:", err?.message || err);
    }
    return false;
  }
}
