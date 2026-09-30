/**
 * ============================================================
 * ADVANCE CORPORATE SECURITY (ACS) — UNIFIED GOOGLE SHEETS WEBHOOK
 * Multi-Tab Sync:
 *   1. "Contact Leads"
 *   2. "Service Inquiries"
 *   3. "job applications" (Candidate applications from Careers hub)
 *   4. "Posted Jobs" (Optional job postings from /post-job)
 * ============================================================
 * (Zero GCP / Zero Google Cloud Console / Zero Monthly Cost)
 * ============================================================
 */

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
    var rawContent = e.postData.contents;
    var data = JSON.parse(rawContent);
    var ss = SpreadsheetApp.getActiveSpreadsheet();

    var timestamp =
      data.submittedAt ||
      Utilities.formatDate(new Date(), "Asia/Kolkata", "dd/MM/yyyy, hh:mm:ss a") + " IST";
    var type = (data.type || "contact").toLowerCase().trim();

    // ─────────────────────────────────────────────────────────
    // TAB 1: Job Applications (Candidates applying via Careers)
    // Matches existing "job applications" or "Job Applications" tab
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
        "'" + (data.applicantPhone || data.phone || ""), // prepended apostrophe prevents formula/format issues
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

      sheetApps.appendRow(appRowData);
      formatLastRow(sheetApps);

      return ContentService.createTextOutput(
        JSON.stringify({
          status: "success",
          message: "Job application logged in 'job applications' sheet",
          tab: sheetApps.getName(),
          applicant: data.applicantName || data.name
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

      sheetInquiry.appendRow(rowInquiry);
      formatLastRow(sheetInquiry);

      return ContentService.createTextOutput(
        JSON.stringify({
          status: "success",
          message: "Service inquiry recorded in 'Service Inquiries' sheet",
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

      sheetJobs.appendRow(jobRowData);
      formatLastRow(sheetJobs);

      return ContentService.createTextOutput(
        JSON.stringify({
          status: "success",
          message: "Job post recorded in 'Posted Jobs' sheet",
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

      sheetContact.appendRow(rowContact);
      formatLastRow(sheetContact);

      return ContentService.createTextOutput(
        JSON.stringify({
          status: "success",
          message: "Contact lead recorded in 'Contact Leads' sheet",
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
      supportedTabs: ["Contact Leads", "Service Inquiries", "job applications", "Posted Jobs"],
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
