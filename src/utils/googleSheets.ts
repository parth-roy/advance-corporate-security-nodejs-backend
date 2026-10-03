// ============================================================
// ACS Backend — Google Sheets Sync Utility (via Apps Script Webhook)
// No GCP/GCC required — lightweight, zero-cost, direct webhook sync
// ============================================================

export interface GoogleSheetLeadPayload {
  type: "contact" | "inquiry";
  id?: string;
  name: string;
  firstName?: string;
  lastName?: string;
  email: string;
  phone: string;
  organization?: string;
  service?: string;
  city?: string;
  manpowerCount?: number | string;
  duration?: string;
  message?: string;
  source?: string;
  submittedAt?: string;
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
 * Sends lead data to Google Sheets via Google Apps Script Webhook.
 * Runs asynchronously and fails gracefully without blocking the client response.
 */
export async function appendToGoogleSheet(payload: GoogleSheetLeadPayload): Promise<boolean> {
  const webhookUrl = process.env.GOOGLE_SHEETS_WEBHOOK_URL?.trim();

  if (!webhookUrl || webhookUrl === "" || webhookUrl.includes("YOUR_GOOGLE_APPS_SCRIPT_URL")) {
    console.log("[GoogleSheets] Notice: GOOGLE_SHEETS_WEBHOOK_URL is not configured in .env. Skipping Google Sheet sync.");
    return false;
  }

  const timestamp =
    payload.submittedAt ||
    new Date().toLocaleString("en-IN", { timeZone: "Asia/Kolkata" }) + " IST";

  const dataToSend = {
    ...payload,
    submittedAt: timestamp,
  };

  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000); // 10-second timeout

    const response = await fetch(webhookUrl, {
      method: "POST",
      redirect: "follow",
      headers: {
        "Content-Type": "text/plain;charset=utf-8", // text/plain prevents CORS preflight issues with Google Apps Script
      },
      body: JSON.stringify(dataToSend),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      console.warn(`[GoogleSheets] Webhook responded with status: ${response.status} ${response.statusText}`);
      return false;
    }

    const textResponse = await response.text();
    let jsonResult: any;
    try {
      jsonResult = JSON.parse(textResponse);
    } catch {
      jsonResult = textResponse;
    }

    console.log(`[GoogleSheets] ✅ Successfully synced ${payload.type} lead (${payload.name}) to Google Sheet:`, jsonResult);
    return true;
  } catch (err: any) {
    if (err.name === "AbortError") {
      console.error("[GoogleSheets] ❌ Webhook request timed out after 10s.");
    } else {
      console.error("[GoogleSheets] ❌ Error syncing to Google Sheet:", err?.message || err);
    }
    return false;
  }
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
