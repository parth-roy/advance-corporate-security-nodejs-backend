# Google Sheets Lead Webhook Setup Guide (Zero-GCP)

Sync leads from **Advance Corporate Security (ACS)** website forms directly into a Google Sheet in real-time, with **zero Google Cloud Console (GCC) setup, zero service accounts, and zero monthly fees**.

---

## Architecture

```
User Submits Form on Website
         │
         ▼
Express API Backend (/api/contact or /api/inquiry)
         ├─────────────────────────────────────────────┐
         ▼                                             ▼
  MongoDB Atlas DB                             Google Apps Script Webhook
(Persistent Storage)                          (https://script.google.com/...)
         │                                             │
         ▼                                             ▼
  Admin & User Emails                          Google Sheet
  (Nodemailer / SMTP)                   Auto-appends row with formatting
```

---

## 3-Minute Setup Instructions

### Step 1: Create or Open a Google Sheet
1. Open [Google Sheets](https://sheets.new) in your browser.
2. Title the sheet: **`ACS — Leads & Inquiries`** (or any name you prefer).

### Step 2: Open the Apps Script Editor
1. In the top menu of your Google Sheet, click **Extensions** ➔ **Apps Script**.
2. A new tab will open with code editor.

### Step 3: Paste the Code
1. In the code editor, delete any existing code inside `Code.gs`.
2. Open [`backend/google-apps-script/Code.gs`](./Code.gs), copy the entire code, and paste it into the editor.
3. Click the **Save** icon (or press `Ctrl + S`).

### Step 4: Deploy as a Web App
1. At the top right of the Apps Script window, click the blue **Deploy** button ➔ **New deployment**.
2. Click the **Select type** gear icon (⚙️) ➔ choose **Web app**.
3. Fill in the deployment details:
   - **Description:** `ACS Lead Webhook`
   - **Execute as:** `Me (your-gmail@gmail.com)`
   - **Who has access:** **`Anyone`** ⚠️ *(Must be set to "Anyone" so the backend can post data without requiring a Google login)*.
4. Click **Deploy**.

### Step 5: Authorize Permissions (One-Time)
1. A popup will ask you to authorize access.
2. Click **Authorize access** ➔ select your Google account.
3. If you see *"Google hasn't verified this app"*:
   - Click **Advanced** (in small text at bottom left).
   - Click **Go to ACS Lead Webhook (unsafe)**.
   - Click **Allow**.

### Step 6: Copy Web App URL & Add to Backend
1. Copy the generated **Web app URL**. It looks like:
   ```
   https://script.google.com/macros/s/AKfycb.../exec
   ```
2. Open `acs/backend/.env` on your server/local machine and paste it:
   ```env
   GOOGLE_SHEETS_WEBHOOK_URL="https://script.google.com/macros/s/AKfycb.../exec"
   ```
3. Restart the backend server. That's it!

---

## What Happens Automatically
- **Tab Auto-Creation:** The script automatically creates two sheets:
  - **`Contact Leads`** — for General Contact and Free Consultation enquiries.
  - **`Service Inquiries`** — for direct service quote requests (with manpower count & duration).
- **Auto-Formatting:** Header row is styled with ACS Navy Blue (`#0B1B3D`), bold white text, frozen top row, and zebra-striped rows.
- **Phone Protection:** Phone numbers are stored with a text prefix so that leading `0` or `+91` are never lost or corrupted into scientific notation (`9.4E+9`).
- **Non-Blocking:** If Google Sheets is temporarily slow, the backend will NOT delay or block the customer's form submission.
