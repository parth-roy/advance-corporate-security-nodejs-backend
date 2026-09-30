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
