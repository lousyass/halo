import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * upload-original-to-drive
 *
 * Receives the original (uncompressed) image bytes from the frontend,
 * uploads them to Aurittro's Google Drive folder, sets the file to
 * "anyone with the link can view", and returns the shareable link.
 *
 * This is best-effort — the frontend still saves the compressed copy
 * in Supabase Storage regardless of whether this succeeds.
 *
 * Expected request: multipart/form-data
 *   - file: the original image file
 *   - filename: suggested filename (e.g. "photo.jpg")
 *   - entry_date: ISO date string (used to name the file in Drive)
 *
 * Returns: { drive_url: string } or { error: string }
 */

const DRIVE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const DRIVE_UPLOAD_URL =
  "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart";
const DRIVE_FILES_URL = "https://www.googleapis.com/drive/v3/files";

async function getAccessToken(): Promise<string> {
  const clientId = Deno.env.get("GOOGLE_DRIVE_CLIENT_ID")!;
  const clientSecret = Deno.env.get("GOOGLE_DRIVE_CLIENT_SECRET")!;
  const refreshToken = Deno.env.get("GOOGLE_DRIVE_REFRESH_TOKEN")!;

  const res = await fetch(DRIVE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    throw new Error(`Token refresh failed: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.access_token as string;
}

async function uploadToDrive(
  accessToken: string,
  fileBytes: Uint8Array,
  filename: string,
  mimeType: string,
  folderId: string
): Promise<string> {
  // Build multipart body (metadata + file bytes)
  const metadata = JSON.stringify({
    name: filename,
    parents: [folderId],
  });

  const boundary = "boundary_" + crypto.randomUUID().replace(/-/g, "");
  const metaPart =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${metadata}\r\n`;
  const filePart = `--${boundary}\r\nContent-Type: ${mimeType}\r\n\r\n`;
  const closePart = `\r\n--${boundary}--`;

  const encoder = new TextEncoder();
  const body = new Uint8Array([
    ...encoder.encode(metaPart),
    ...encoder.encode(filePart),
    ...fileBytes,
    ...encoder.encode(closePart),
  ]);

  const uploadRes = await fetch(DRIVE_UPLOAD_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
      "Content-Length": String(body.length),
    },
    body,
  });

  if (!uploadRes.ok) {
    throw new Error(
      `Drive upload failed: ${uploadRes.status} ${await uploadRes.text()}`
    );
  }

  const uploaded = await uploadRes.json();
  const fileId = uploaded.id as string;

  // Set permission: anyone with the link can view
  const permRes = await fetch(`${DRIVE_FILES_URL}/${fileId}/permissions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ role: "reader", type: "anyone" }),
  });

  if (!permRes.ok) {
    throw new Error(
      `Permission set failed: ${permRes.status} ${await permRes.text()}`
    );
  }

  // Return the shareable webViewLink
  const metaRes = await fetch(
    `${DRIVE_FILES_URL}/${fileId}?fields=webViewLink`,
    { headers: { Authorization: `Bearer ${accessToken}` } }
  );
  const meta = await metaRes.json();
  return meta.webViewLink as string;
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

    const rawFolderId = Deno.env.get("GOOGLE_DRIVE_FOLDER_ID")?.trim();
    if (!rawFolderId) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_DRIVE_FOLDER_ID not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }
    // Extract pure folder ID if a full Google Drive URL was entered in secrets
    const folderId = rawFolderId.match(/([a-zA-Z0-9_-]{25,})/)?.[1] || rawFolderId;

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

    const filename = `halo-journal-${entryDate}-${Date.now()}.${
      file.name.split(".").pop() || "jpg"
    }`;
    const mimeType = file.type || "image/jpeg";
    const bytes = new Uint8Array(await file.arrayBuffer());

    // Get a short-lived access token via refresh token
    const accessToken = await getAccessToken();

    // Upload and share
    const driveUrl = await uploadToDrive(
      accessToken,
      bytes,
      filename,
      mimeType,
      folderId
    );

    return new Response(JSON.stringify({ drive_url: driveUrl }), {
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
