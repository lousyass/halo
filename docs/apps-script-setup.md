# Apps Script Email Relay — Setup Guide

This documents the Google Apps Script setup for Halo's reminder email relay.
This is a **temporary** email sending solution — when the domain + Resend situation
resolves, swap `sendReminderEmail()` internals in `supabase/functions/_shared/email.ts`
and remove these Apps Script secrets.

## Steps

### 1. Create the Apps Script project

Go to [script.google.com](https://script.google.com) and create a new project.

Paste this code:

```javascript
function doPost(e) {
  var params = JSON.parse(e.postData.contents);
  var expected = PropertiesService.getScriptProperties().getProperty('SHARED_SECRET');

  if (params.secret !== expected) {
    return ContentService.createTextOutput(JSON.stringify({ error: 'unauthorized' }))
      .setMimeType(ContentService.MimeType.JSON);
  }

  MailApp.sendEmail({
    to: params.to,
    subject: params.subject,
    body: params.body
  });

  return ContentService.createTextOutput(JSON.stringify({ success: true }))
    .setMimeType(ContentService.MimeType.JSON);
}

// Development-only. Run this once manually from the Apps Script editor
// (not doPost) to trigger Google's permission prompt for MailApp, then
// delete it or leave it — it's harmless either way.
function testMailAuthorization() {
  MailApp.sendEmail(Session.getActiveUser().getEmail(), 'Halo test', 'Authorization working.');
}
```

### 2. Set the shared secret

Go to **Project Settings → Script Properties** and add:
- Key: `SHARED_SECRET`
- Value: (same value as the `APPS_SCRIPT_SHARED_SECRET` Supabase secret)

### 3. Authorize MailApp

1. Select `testMailAuthorization` in the function dropdown (NOT `doPost`)
2. Click **Run**
3. Approve the OAuth consent screen when prompted
4. You should receive a test email

**Why not run `doPost` directly?** It expects a real HTTP POST event object —
pressing "Run" on it passes no `e`, so `e.postData.contents` throws immediately
rather than prompting for permission.

### 4. Deploy as Web App

1. Click **Deploy → New deployment**
2. Type: **Web App**
3. Execute as: **Me**
4. Who has access: **Anyone** (NOT "Anyone with a Google account")
5. Click **Deploy** and copy the URL

> **Critical:** "Anyone with a Google account" will silently return an HTML login
> page instead of JSON when called from the Edge Function, since the request has
> no Google identity attached. It must be **Anyone**.

### 5. Store the deployment URL

Set it as the `APPS_SCRIPT_WEBHOOK_URL` Supabase secret.

### 6. Updating the script later

Use **Manage deployments → edit → new version** on the *existing* deployment.
Do NOT create a "New deployment" — that gets a new URL and breaks the stored URL.

## Known Limits

- 100 recipients/day on a free Gmail account
- Far more than one person's reminders need
- Not a contractual SLA — just Google's current documented limit
