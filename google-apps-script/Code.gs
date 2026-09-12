/**
 * ============================================================
 * ADVANCE CORPORATE SECURITY (ACS) — LEAD SYNC WEBHOOK
 * Google Apps Script for Direct Google Sheets Integration
 * (Zero GCP / Zero Google Cloud Console Required)
 * ============================================================
 * 
 * Instructions:
 * 1. In your Google Sheet, click: Extensions -> Apps Script
 * 2. Delete any code in the editor, and paste this entire code.
 * 3. Click Save (Ctrl+S or disk icon).
 * 4. Click Deploy -> New deployment.
 * 5. Select type: Web app.
 *    - Description: ACS Lead Webhook
 *    - Execute as: Me (your Google account)
 *    - Who has access: Anyone  <-- (IMPORTANT!)
 * 6. Click Deploy, Authorize access, and copy the Web App URL.
 * 7. Paste the Web App URL into backend .env as:
 *    GOOGLE_SHEETS_WEBHOOK_URL="https://script.google.com/macros/s/..../exec"
 */

// ─── POST Webhook Handler ────────────────────────────────────
function doPost(e) {
  var lock = LockService.getScriptLock();
  // Wait up to 30 seconds for other concurrent writes
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

    var timestamp = data.submittedAt || Utilities.formatDate(new Date(), "Asia/Kolkata", "dd/MM/yyyy, hh:mm:ss a") + " IST";
    var type = (data.type || "contact").toLowerCase();

    if (type === "inquiry") {
      // ─── Tab: Service Inquiries ───────────────────────────
      var sheetInquiry = getOrCreateSheet(ss, "Service Inquiries", [
        "Date & Time",
        "Full Name",
        "Phone Number",
        "Email Address",
        "Service Required",
        "City / Location",
        "Manpower Count",
        "Duration",
        "Message",
        "DB Record ID",
        "Source"
      ]);

      var rowData = [
        timestamp,
        data.name || (data.firstName ? data.firstName + " " + (data.lastName || "") : ""),
        "'" + (data.phone || ""), // prepended apostrophe prevents scientific notation
        data.email || "",
        data.service || "",
        data.city || "",
        data.manpowerCount || "",
        data.duration || "",
        data.message || "",
        data.id || "",
        data.source || "Website"
      ];

      sheetInquiry.appendRow(rowData);
      formatLastRow(sheetInquiry);

    } else {
      // ─── Tab: Contact Leads ───────────────────────────────
      var sheetContact = getOrCreateSheet(ss, "Contact Leads", [
        "Date & Time",
        "Full Name",
        "Phone Number",
        "Email Address",
        "Organisation / Company",
        "Service Required",
        "City / Location",
        "Message / Requirements",
        "DB Record ID",
        "Source"
      ]);

      var fullName = data.name || (data.firstName ? (data.firstName + " " + (data.lastName || "")).trim() : "");

      var rowData = [
        timestamp,
        fullName,
        "'" + (data.phone || ""), // prepended apostrophe prevents scientific notation
        data.email || "",
        data.organization || "",
        data.service || "",
        data.city || "",
        data.message || "",
        data.id || "",
        data.source || "Website"
      ];

      sheetContact.appendRow(rowData);
      formatLastRow(sheetContact);
    }

    return ContentService.createTextOutput(
      JSON.stringify({ status: "success", message: "Lead recorded in Google Sheet", type: type })
    ).setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(
      JSON.stringify({ status: "error", message: error.toString() })
    ).setMimeType(ContentService.MimeType.JSON);

  } finally {
    lock.releaseLock();
  }
}

// ─── GET Handler (For Testing / Health Check) ─────────────────
function doGet(e) {
  return ContentService.createTextOutput(
    JSON.stringify({
      status: "active",
      service: "Advance Corporate Security (ACS) Google Sheets Webhook",
      timestamp: Utilities.formatDate(new Date(), "Asia/Kolkata", "dd/MM/yyyy, hh:mm:ss a") + " IST",
      message: "Webhook is ready to receive POST submissions."
    })
  ).setMimeType(ContentService.MimeType.JSON);
}

// ─── Helper: Get or Create Sheet with Formatted Headers ───────
function getOrCreateSheet(ss, sheetName, headers) {
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);

    // Delete first default sheet if it's empty 'Sheet1'
    var defaultSheet = ss.getSheetByName("Sheet1");
    if (defaultSheet && defaultSheet.getLastRow() === 0 && ss.getSheets().length > 1) {
      try { ss.deleteSheet(defaultSheet); } catch (e) {}
    }

    // Insert headers
    sheet.appendRow(headers);

    // Style Header Row (Navy Blue #0B1B3D, Gold border #C8993A, White Bold text)
    var headerRange = sheet.getRange(1, 1, 1, headers.length);
    headerRange.setBackground("#0B1B3D");
    headerRange.setFontColor("#FFFFFF");
    headerRange.setFontWeight("bold");
    headerRange.setFontFamily("Roboto");
    headerRange.setFontSize(10);
    headerRange.setHorizontalAlignment("center");
    headerRange.setVerticalAlignment("middle");
    sheet.setRowHeight(1, 36);

    // Freeze header row
    sheet.setFrozenRows(1);

    // Auto resize column widths
    for (var i = 1; i <= headers.length; i++) {
      sheet.setColumnWidth(i, 160);
    }
    // Set wider width for Message column
    var messageColIndex = headers.indexOf("Message") !== -1 ? headers.indexOf("Message") + 1 : headers.indexOf("Message / Requirements") + 1;
    if (messageColIndex > 0) {
      sheet.setColumnWidth(messageColIndex, 300);
    }
  }
  return sheet;
}

// ─── Helper: Format Appended Row ──────────────────────────────
function formatLastRow(sheet) {
  var lastRow = sheet.getLastRow();
  var numCols = sheet.getLastColumn();
  if (lastRow > 1) {
    var range = sheet.getRange(lastRow, 1, 1, numCols);
    range.setFontFamily("Roboto");
    range.setFontSize(9);
    range.setVerticalAlignment("middle");
    sheet.setRowHeight(lastRow, 28);

    // Alternating zebra row colors for readability
    if (lastRow % 2 === 0) {
      range.setBackground("#F9FAFB");
    } else {
      range.setBackground("#FFFFFF");
    }
  }
}
