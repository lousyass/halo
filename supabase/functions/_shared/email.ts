/**
 * Email sending helper — provider-swappable by design.
 *
 * Current implementation: Google Apps Script relay.
 * When the domain + Resend situation resolves, only this file's
 * internals change — nothing upstream needs to be touched.
 */

interface SendEmailParams {
  to: string;
  subject: string;
  body: string;
}

interface SendEmailResult {
  success: boolean;
  error?: string;
}

export async function sendReminderEmail(
  params: SendEmailParams
): Promise<SendEmailResult> {
  const webhookUrl = Deno.env.get("APPS_SCRIPT_WEBHOOK_URL");
  const sharedSecret = Deno.env.get("APPS_SCRIPT_SHARED_SECRET");

  if (!webhookUrl || !sharedSecret) {
    console.error("Missing APPS_SCRIPT_WEBHOOK_URL or APPS_SCRIPT_SHARED_SECRET");
    return { success: false, error: "Missing email configuration" };
  }

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        to: params.to,
        subject: params.subject,
        body: params.body,
        secret: sharedSecret,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`Apps Script returned ${response.status}: ${text}`);
      return { success: false, error: `HTTP ${response.status}` };
    }

    const result = await response.json();

    if (result.success) {
      return { success: true };
    }

    console.error("Apps Script error:", result.error);
    return { success: false, error: result.error || "Unknown error" };
  } catch (err) {
    console.error("Failed to send email:", err);
    return { success: false, error: String(err) };
  }
}
