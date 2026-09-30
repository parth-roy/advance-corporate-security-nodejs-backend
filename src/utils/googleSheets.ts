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
    const jsonStr = JSON.stringify(dataToSend);

    // Primary: non-blocking child_process curl for reliable 302 redirect handling
    const { execFile } = await import("child_process");
    execFile("curl", ["-s", "-L", "-d", jsonStr, webhookUrl], (err, stdout) => {
      if (err) {
        console.warn("[GoogleSheets] Notice: Background curl sync:", err.message);
      } else {
        console.log(`[GoogleSheets] ✅ Successfully synced ${payload.type} to Google Sheet:`, stdout.slice(0, 100));
      }
    });
    return true;
  } catch {
    // Secondary fallback: fetch
    try {
      fetch(webhookUrl, {
        method: "POST",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(dataToSend),
      }).catch(() => null);
      return true;
    } catch {
      return false;
    }
  }
}
