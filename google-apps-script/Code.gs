/**
 * ============================================================
 * ADVANCE CORPORATE SECURITY (ACS) — UNIFIED GOOGLE SHEETS WEBHOOK
 * Multi-Tab Sync:
 *   1. "job applications" (Candidate applications from Careers hub)
 *   2. "Service Inquiries" (Client service quotes)
 *   3. "Contact Leads" (General contact queries)
 *   4. "Posted Jobs" (Optional job postings from /post-job)
 * ============================================================
 * Target Spreadsheet: "ACS-leads" (ID: 1jDNNjOb7xe1Dvqs08buVIgH6RPLtpSVBUYJup7pH-3w)
 * (Zero GCP / Zero Google Cloud Console / Zero Monthly Cost)
 * ============================================================
 */

// Fallback Spreadsheet ID from ACS-leads sheet URL:
var SPREADSHEET_ID = "1jDNNjOb7xe1Dvqs08buVIgH6RPLtpSVBUYJup7pH-3w";

// ─── POST Webhook Handler ────────────────────────────────────
function doPost(e) {
  var lock = LockService.getScriptLock();
  // Wait up to 30 seconds for concurrent write locks
  try {
    lock.waitLock(30000);
  } catch (err) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: "error", message: "Server busy, lock timeout" })
    ).setMimeType(ContentService.MimeType.JSON);
  }

  try {
    // 1. Resolve Active Spreadsheet (Container-bound or by explicit ID)
    var ss = null;
    try {
      ss = SpreadsheetApp.getActiveSpreadsheet();
    } catch (e) {}

    if (!ss) {
      try {
        ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      } catch (e) {}
    }

    if (!ss) {
      return ContentService.createTextOutput(
        JSON.stringify({
          status: "error",
          message: "Could not open ACS-leads spreadsheet. Please verify Spreadsheet ID."
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }

    // 2. Parse Incoming Payload
    var rawContent = e.postData.contents;
    var data = JSON.parse(rawContent);

    var timestamp =
      data.submittedAt ||
      Utilities.formatDate(new Date(), "Asia/Kolkata", "dd/MM/yyyy, hh:mm:ss a") + " IST";
    var type = (data.type || "contact").toLowerCase().trim();

    // ─────────────────────────────────────────────────────────
    // TAB 1: Job Applications (Candidates applying via Careers)
    // Matches existing "job applications" tab from Image 3
    // ─────────────────────────────────────────────────────────
    if (
      type === "job_application" ||
      type === "application" ||
      type === "career" ||
      type === "job_apply"
    ) {
      var sheetApps = getOrCreateSheet(ss, "job applications", [
        "Date & Time",
        "Job Applied For",
        "Job City / Location",
        "Applicant Full Name",
        "Phone Number",
        "Email Address",
        "Current City / Area",
        "Total Experience",
        "Highest Qualification",
        "Candidate Notes / Message",
        "Application ID",
        "Job ID",
        "Source",
        "Hiring Status"
      ]);

      var appRowData = [
        timestamp,
        data.jobTitle || "General Application",
        data.jobCity || data.city || "Pan-India",
        data.applicantName || data.name || "",
        "'" + (data.applicantPhone || data.phone || ""), // Prepend apostrophe to preserve phone digits
        data.applicantEmail || data.email || "",
        data.applicantCity || data.city || "—",
        data.applicantExperience || data.experience || "Fresher",
        data.applicantQualification || data.qualification || "10th Pass",
        data.message || data.notes || "—",
        data.id || data.applicationId || "",
        data.jobId || "general",
        data.source || "Careers Hub",
        "New / Pending Review"
      ];

      var recordId = data.id || data.applicationId || "";
      if (isDuplicateRecord(sheetApps, recordId, data.applicantEmail || data.email, data.applicantPhone || data.phone)) {
        return ContentService.createTextOutput(
          JSON.stringify({
            status: "success",
            message: "Duplicate job application ignored (already logged)",
            tab: sheetApps.getName(),
            id: recordId
          })
        ).setMimeType(ContentService.MimeType.JSON);
      }

      sheetApps.appendRow(appRowData);
      formatLastRow(sheetApps);

      return ContentService.createTextOutput(
        JSON.stringify({
          status: "success",
          message: "Job application successfully logged in 'job applications' tab",
          tab: sheetApps.getName(),
          applicant: data.applicantName || data.name,
          job: data.jobTitle
        })
      ).setMimeType(ContentService.MimeType.JSON);

    // ─────────────────────────────────────────────────────────
    // TAB 2: Service Inquiries (Get Quote / Service Booking Form)
    // ─────────────────────────────────────────────────────────
    } else if (type === "inquiry" || type === "service_inquiry") {
      var sheetInquiry = getOrCreateSheet(ss, "Service Inquiries", [
        "Date & Time",
        "Full Name",
        "Phone Number",
        "Email Address",
        "Service Required",
        "City / Location",
        "Manpower Count",
        "Duration",
        "Message / Requirements",
        "Inquiry ID",
        "Source"
      ]);

      var rowInquiry = [
        timestamp,
        data.name || (data.firstName ? (data.firstName + " " + (data.lastName || "")).trim() : ""),
        "'" + (data.phone || ""),
        data.email || "",
        data.service || "",
        data.city || "",
        data.manpowerCount || "",
        data.duration || "",
        data.message || "",
        data.id || "",
        data.source || "Website"
      ];

      var inquiryId = data.id || data.inquiryId || "";
      if (isDuplicateRecord(sheetInquiry, inquiryId, data.email, data.phone)) {
        return ContentService.createTextOutput(
          JSON.stringify({
            status: "success",
            message: "Duplicate inquiry ignored (already recorded)",
            tab: sheetInquiry.getName(),
            id: inquiryId
          })
        ).setMimeType(ContentService.MimeType.JSON);
      }

      sheetInquiry.appendRow(rowInquiry);
      formatLastRow(sheetInquiry);

      return ContentService.createTextOutput(
        JSON.stringify({
          status: "success",
          message: "Service inquiry recorded in 'Service Inquiries' tab",
          tab: sheetInquiry.getName()
        })
      ).setMimeType(ContentService.MimeType.JSON);

    // ─────────────────────────────────────────────────────────
    // TAB 3: Job Posts (New jobs posted via /post-job wizard)
    // ─────────────────────────────────────────────────────────
    } else if (type === "job_post" || type === "post_job") {
      var sheetJobs = getOrCreateSheet(ss, "Posted Jobs", [
        "Date & Time",
        "Job Title",
        "Category",
        "City",
        "Locality",
        "Work Location Type",
        "Vacancies",
        "Job Type",
        "Contractual",
        "Salary Range",
        "Incentives",
        "Shift",
        "Working Days",
        "Deposit Required",
        "Deposit Details",
        "Gender",
        "Qualification",
        "Experience",
        "Skills Required",
        "Assets Needed",
        "Documents Required",
        "Job Description",
        "Record ID",
        "Source"
      ]);

      var salaryStr =
        (data.salaryMin ? "₹" + Number(data.salaryMin).toLocaleString() : "") +
        (data.salaryMax ? " - ₹" + Number(data.salaryMax).toLocaleString() + " / month" : "");

      var jobRowData = [
        timestamp,
        data.jobTitle || data.title || "",
        data.jobCategory || data.category || "",
        data.city || "",
        data.locality || "",
        data.workLocationType || "Work from Office",
        data.vacancy || "",
        data.jobType || "Full-time",
        data.isContractual ? "Yes (Contractual)" : "No",
        salaryStr,
        data.incentives || data.incentivesText || "None",
        data.shift || "Day",
        data.workingDays || "6 Days Working",
        data.requiresDeposit ? "Yes" : "No",
        data.depositDetails || "",
        data.gender || "Any",
        data.qualification || "",
        data.experience || "",
        data.skills || "",
        data.assetsNeeded || "",
        data.documentsRequired || "",
        data.description || "",
        data.id || "",
        data.source || "ACS Web Portal"
      ];

      var jobId = data.id || data._id || "";
      if (isDuplicateRecord(sheetJobs, jobId, "", "")) {
        return ContentService.createTextOutput(
          JSON.stringify({
            status: "success",
            message: "Duplicate job post ignored (already recorded)",
            tab: sheetJobs.getName(),
            id: jobId
          })
        ).setMimeType(ContentService.MimeType.JSON);
      }

      sheetJobs.appendRow(jobRowData);
      formatLastRow(sheetJobs);

      return ContentService.createTextOutput(
        JSON.stringify({
          status: "success",
          message: "Job post recorded in 'Posted Jobs' tab",
          tab: sheetJobs.getName()
        })
      ).setMimeType(ContentService.MimeType.JSON);

    // ─────────────────────────────────────────────────────────
    // TAB 4: Contact Leads (General Contact Form - Default)
    // ─────────────────────────────────────────────────────────
    } else {
      var sheetContact = getOrCreateSheet(ss, "Contact Leads", [
        "Date & Time",
        "Full Name",
        "Phone Number",
        "Email Address",
        "Organisation / Company",
        "Service Required",
        "City / Location",
        "Message / Requirements",
        "Lead ID",
        "Source"
      ]);

      var fullName =
        data.name ||
        (data.firstName ? (data.firstName + " " + (data.lastName || "")).trim() : "");

      var rowContact = [
        timestamp,
        fullName,
        "'" + (data.phone || ""),
        data.email || "",
        data.organization || "",
        data.service || "",
        data.city || "",
        data.message || "",
        data.id || "",
        data.source || "Website"
      ];

      var contactId = data.id || data.leadId || "";
      if (isDuplicateRecord(sheetContact, contactId, data.email, data.phone)) {
        return ContentService.createTextOutput(
          JSON.stringify({
            status: "success",
            message: "Duplicate contact lead ignored (already recorded)",
            tab: sheetContact.getName(),
            id: contactId
          })
        ).setMimeType(ContentService.MimeType.JSON);
      }

      sheetContact.appendRow(rowContact);
      formatLastRow(sheetContact);

      return ContentService.createTextOutput(
        JSON.stringify({
          status: "success",
          message: "Contact lead recorded in 'Contact Leads' tab",
          tab: sheetContact.getName()
        })
      ).setMimeType(ContentService.MimeType.JSON);
    }
  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: "error", message: error.toString() })
    ).setMimeType(ContentService.MimeType.JSON);
  } finally {
    lock.releaseLock();
  }
}

// ─── GET Handler (Browser Health Check) ───────────────────────
function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({
      status: "active",
      service: "Advance Corporate Security (ACS) Multi-Tab Webhook",
      timestamp:
        Utilities.formatDate(new Date(), "Asia/Kolkata", "dd/MM/yyyy, hh:mm:ss a") + " IST",
      spreadsheetId: SPREADSHEET_ID,
      supportedTabs: ["job applications", "Service Inquiries", "Contact Leads", "Posted Jobs"],
      message: "Webhook is live and ready to receive submissions."
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

// ─── Case-Insensitive Sheet Matcher & Header Formatter ────────
function getOrCreateSheet(ss, sheetName, headers) {
  var targetNameLower = sheetName.toLowerCase().trim();
  var sheets = ss.getSheets();
  var sheet = null;

  // Search case-insensitively across existing tabs (e.g. "job applications" vs "Job Applications")
  for (var i = 0; i < sheets.length; i++) {
    if (sheets[i].getName().toLowerCase().trim() === targetNameLower) {
      sheet = sheets[i];
      break;
    }
  }

  // If tab doesn't exist, create it
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
  }

  // Delete default blank 'Sheet1' if present
  var defaultSheet = ss.getSheetByName("Sheet1");
  if (defaultSheet && defaultSheet.getLastRow() === 0 && ss.getSheets().length > 1) {
    try {
      ss.deleteSheet(defaultSheet);
    } catch (e) {}
  }

  // If the sheet has no rows/headers yet, initialize with styled corporate headers
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(headers);

    // Style Header Row (Corporate Navy #0B1B3D, White Bold, Centered, Height 38)
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground("#0B1B3D");
    headerRange.setFontColor("#FFFFFF");
    headerRange.setFontWeight("bold");
    headerRange.setFontFamily("Roboto");
    headerRange.setFontSize(10);
    headerRange.setHorizontalAlignment("center");
    headerRange.setVerticalAlignment("middle");
    sheet.setRowHeight(1, 38);

    // Freeze header row so it stays fixed while scrolling
    sheet.setFrozenRows(1);

    // Auto-fit column widths
    for (var j = 1; j <= headers.length; j++) {
      sheet.setColumnWidth(j, 160);
    }

    // Set wider columns for notes, descriptions, and job titles
    var wideHeaders = [
      "Candidate Notes / Message",
      "Message / Requirements",
      "Job Description",
      "Job Applied For"
    ];
    for (var k = 0; k < wideHeaders.length; k++) {
      var colIdx = headers.indexOf(wideHeaders[k]) + 1;
      if (colIdx > 0) {
        sheet.setColumnWidth(colIdx, 280);
      }
    }
  }

  return sheet;
}

// ─── Helper: Format Appended Row with Zebra Styling ──────────
function formatLastRow(sheet) {
  var lastRow = sheet.getLastRow();
  var numCols = sheet.getLastColumn();
  if (lastRow > 1) {
    var range = sheet.getRange(lastRow, 1, 1, numCols);
    range.setFontFamily("Roboto");
    range.setFontSize(9);
    range.setVerticalAlignment("middle");
    sheet.setRowHeight(lastRow, 28);

    // Alternating zebra row colors for high readability
    if (lastRow % 2 === 0) {
      range.setBackground("#F8FAFC"); // Subtle slate-50
    } else {
      range.setBackground("#FFFFFF");
    }
  }
}

// ─── Helper: Prevent Duplicate Rows (ID & Contact check) ──────
function isDuplicateRecord(sheet, uniqueId, email, phone) {
  var lastRow = sheet.getLastRow();
  if (lastRow <= 1) return false;

  var checkCount = Math.min(25, lastRow - 1);
  var startRow = lastRow - checkCount + 1;
  var numCols = sheet.getLastColumn();
  var values = sheet.getRange(startRow, 1, checkCount, numCols).getValues();

  var cleanEmail = (email || "").toLowerCase().trim();
  var cleanPhone = (phone || "").replace(/\D/g, "");

  for (var i = values.length - 1; i >= 0; i--) {
    var row = values[i];
    var rowStr = row.join(" ");

    // Check if unique ID matches (e.g. app-1790..., lead-1790...)
    if (uniqueId && uniqueId.length > 5 && rowStr.indexOf(uniqueId) !== -1) {
      return true;
    }

    // Check if identical email and phone was already submitted in recent rows
    if (cleanEmail && cleanPhone && cleanPhone.length >= 10) {
      var rowLower = rowStr.toLowerCase();
      if (rowLower.indexOf(cleanEmail) !== -1 && rowStr.indexOf(cleanPhone) !== -1) {
        return true;
      }
    }
  }

  return false;
}

