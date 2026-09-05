import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * upload-original-to-drive
 *
 * Receives the original (uncompressed) image from the frontend, converts it to
 * base64, and relays it to the Google Apps Script Web App.
 *
 * The Apps Script uses DriveApp.createFile() to save the image directly into the
 * "Halo Journal Originals" folder under the user's Google account, sets link-sharing
 * to viewable, and returns the shareable URL.
 *
 * This replaces the direct OAuth refresh token relay, eliminating the 7-day token
 * expiry for Google Cloud apps in "Testing" publishing status.
 *
 * Expected request: multipart/form-data
 *   - file: the original image file
 *   - entry_date: ISO date string (used for file naming)
 *
 * Returns: { drive_url: string } or { error: string }
 */

// Chunked Uint8Array to base64 conversion to prevent stack overflow on large files
function uint8ArrayToBase64(bytes: Uint8Array): string {
  let binary = "";
  const len = bytes.byteLength;
  const chunkSize = 8192;
  for (let i = 0; i < len; i += chunkSize) {
    const chunk = bytes.subarray(i, Math.min(i + chunkSize, len));
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Only authenticated requests (Supabase Auth JWT required)
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const webhookUrl =
      Deno.env.get("APPS_SCRIPT_DRIVE_WEBHOOK_URL") ||
      Deno.env.get("APPS_SCRIPT_WEBHOOK_URL");
    const sharedSecret = Deno.env.get("APPS_SCRIPT_SHARED_SECRET");

    if (!webhookUrl || !sharedSecret) {
      return new Response(
        JSON.stringify({
          error:
            "Missing APPS_SCRIPT_WEBHOOK_URL (or APPS_SCRIPT_DRIVE_WEBHOOK_URL) or APPS_SCRIPT_SHARED_SECRET in secrets",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Optional folder ID if set in secrets, otherwise Apps Script will use "Halo Journal Originals"
    const rawFolderId = Deno.env.get("GOOGLE_DRIVE_FOLDER_ID")?.trim();
    const folderId =
      rawFolderId?.match(/([a-zA-Z0-9_-]{25,})/)?.[1] || rawFolderId;

    // Parse multipart form data
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const entryDate = (formData.get("entry_date") as string) || "unknown-date";

    if (!file) {
      return new Response(JSON.stringify({ error: "No file provided" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const ext = file.name.split(".").pop() || "jpg";
    const filename = `halo-journal-${entryDate}-${Date.now()}.${ext}`;
    const mimeType = file.type || "image/jpeg";
    const arrayBuffer = await file.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    const fileBase64 = uint8ArrayToBase64(bytes);

    // Call Google Apps Script Web App
    const appsScriptRes = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "uploadDrive",
        secret: sharedSecret,
        fileBase64,
        filename,
        mimeType,
        folderName: "Halo Journal Originals",
        folderId: folderId || undefined,
      }),
    });

    if (!appsScriptRes.ok) {
      const text = await appsScriptRes.text();
      throw new Error(
        `Apps Script returned HTTP ${appsScriptRes.status}: ${text}`
      );
    }

    const result = await appsScriptRes.json();
    if (!result.success || !result.drive_url) {
      throw new Error(result.error || "Apps Script Drive upload failed");
    }

    return new Response(JSON.stringify({ drive_url: result.drive_url }), {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("upload-original-to-drive error:", err);
    return new Response(
      JSON.stringify({
        error: err instanceof Error ? err.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
