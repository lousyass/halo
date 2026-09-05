# Apps Script Relay (Email & Google Drive) — Setup Guide

This documents the Google Apps Script setup for Halo's:
1. **Reminder email relay** (`MailApp.sendEmail`)
2. **Journal photo Google Drive relay** (`DriveApp.createFile` to "Halo Journal Originals")

Both use Google Apps Script's built-in permanent authorization under your Google account, avoiding Google Cloud's 7-day refresh token expiration on testing apps.

---

## The Unified Apps Script Code

In your Apps Script project at [script.google.com](https://script.google.com), paste this code:

```javascript
/**
 * Halo Web App Relay (Email + Google Drive)
 */

function doPost(e) {
  try {
    var params = JSON.parse(e.postData.contents);
    var expected = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');

    if (params.secret !== expected) {
      return ContentService.createTextOutput(JSON.stringify({ error: 'unauthorized' }))
        .setMimeType(ContentService.MimeType.JSON);
    }

    // 1. Google Drive Photo Upload Action
    if (params.action === 'uploadDrive' || params.fileBase64) {
      return handleDriveUpload(params);
    }

    // 2. Email Send Action (MailApp)
    MailApp.sendEmail({
      to: params.to,
      subject: params.subject,
      body: params.body
    });

    return ContentService.createTextOutput(JSON.stringify({ success: true }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ error: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Saves uploaded photo to "Halo Journal Originals" folder in Google Drive
 * and sets public view permission so the shareable URL works.
 */
function handleDriveUpload(params) {
  var folder = getTargetFolder(params.folderName || 'Halo Journal Originals', params.folderId);
  var decodedBytes = Utilities.base64Decode(params.fileBase64);
  var blob = Utilities.newBlob(
    decodedBytes,
    params.mimeType || 'image/jpeg',
    params.filename || ('halo-journal-' + new Date().getTime() + '.jpg')
  );

  var file = folder.createFile(blob);

  // Set file sharing: Anyone with the link can view
  file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);

  return ContentService.createTextOutput(JSON.stringify({
    success: true,
    drive_url: file.getUrl(),
    file_id: file.getId()
  })).setMimeType(ContentService.MimeType.JSON);
}

/**
 * Finds or creates the target folder in Google Drive
 */
function getTargetFolder(folderName, folderId) {
  if (folderId) {
    try {
      return DriveApp.getFolderById(folderId);
    } catch (e) {
      Logger.log('Could not find folder by ID, falling back to name: ' + e);
    }
  }

  var name = folderName || 'Halo Journal Originals';
  var folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(name);
}

/**
 * One-time manual authorization runner.
 * Run this from the Apps Script editor dropdown to grant both
 * MailApp (Gmail) and DriveApp (Google Drive) permissions.
 */
function testAuthorization() {
  // Test MailApp permission
  MailApp.sendEmail(Session.getActiveUser().getEmail(), 'Halo Test', 'MailApp authorization verified.');

  // Test DriveApp permission
  var folder = getTargetFolder('Halo Journal Originals');
  Logger.log('Google Drive folder ready: ' + folder.getName() + ' (' + folder.getId() + ')');
}
```

---

## Steps to Deploy or Update

### 1. Update Existing Deployment (Recommended — No New URL Needed)

If you already deployed the email relay:
1. Open your existing project at [script.google.com](https://script.google.com).
2. Replace the code in the editor with the unified code above.
3. Select `testAuthorization` in the function dropdown and click **Run**.
4. Grant the requested Google Drive permission when the Google popup appears.
5. Click **Deploy → Manage deployments**.
6. Click the **Pencil (Edit)** icon next to your Active deployment.
7. Under **Version**, choose **New version**.
8. Click **Deploy**.

> **Note:** Updating via "Manage deployments → New version" preserves the exact same `APPS_SCRIPT_WEBHOOK_URL` you already stored in Supabase secrets, so no secret updates are necessary!

---

### 2. Or Create a New Web App (Optional)

If creating a new separate project for Google Drive:
1. Create a project at [script.google.com](https://script.google.com) and paste the code above.
2. Go to **Project Settings → Script Properties** and add:
   - Key: `SHARED_SECRET`
   - Value: (your `APPS_SCRIPT_SHARED_SECRET`)
3. Select `testAuthorization` in the dropdown and click **Run** to authorize.
4. Click **Deploy → New deployment**:
   - Type: **Web App**
   - Execute as: **Me**
   - Who has access: **Anyone**
5. Copy the URL and set it as Supabase secret `APPS_SCRIPT_DRIVE_WEBHOOK_URL` (or `APPS_SCRIPT_WEBHOOK_URL`).

---

## How It Works

- When a photo is added in the Journal, the frontend saves the web-optimized photo to Supabase Storage and asynchronously calls the Supabase Edge Function `upload-original-to-drive`.
- The Edge Function relays the uncompressed bytes to this Apps Script Web App.
- Apps Script uses `DriveApp.createFile()` inside the **Halo Journal Originals** folder.
- Sets access to `ANYONE_WITH_LINK, VIEW`.
- Returns `file.getUrl()` (`https://drive.google.com/file/d/{id}/view...`).
- The frontend saves this URL into `journal_photos.original_drive_url`.
- Clicking "Drive Original" in the diary opens the high-res original directly in Google Drive!
