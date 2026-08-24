/**
 * CORS headers for Edge Functions.
 * Primarily needed if the function is ever called from a browser context.
 * The cron endpoint is called server-to-server, but this is harmless to include.
 */

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};
