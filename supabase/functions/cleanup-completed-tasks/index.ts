import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { corsHeaders } from "../_shared/cors.ts";

/**
 * cleanup-completed-tasks
 *
 * Called by a separate cron-job.org job (once daily, or even weekly —
 * precision is not important here). Hard-deletes tasks where:
 *   completed = true
 *   AND completed_at < now() - interval '2 months'
 *
 * The ON DELETE CASCADE on task_reminders_sent.task_id means associated
 * dedup rows clean up automatically.
 *
 * NEVER touches journal_entries or journal_photos — those have an explicit
 * no-deletion rule. Do not extend this function to cover them.
 *
 * Secured by the same CRON_SECRET used for check-task-reminders.
 */

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Verify CRON_SECRET
  const cronSecret = Deno.env.get("CRON_SECRET");
  const authHeader = req.headers.get("Authorization") ?? "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";

  if (!cronSecret || token !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Service-role client — bypasses RLS
  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
  );

  const { data, error } = await supabase
    .from("tasks")
    .delete()
    .eq("completed", true)
    .lt("completed_at", new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString()) // 2 months ≈ 60 days
    .select("id"); // return deleted IDs for logging

  if (error) {
    console.error("cleanup-completed-tasks error:", error.message);
    return new Response(JSON.stringify({ error: error.message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const count = data?.length ?? 0;
  console.log(`cleanup-completed-tasks: deleted ${count} old completed tasks`);

  return new Response(
    JSON.stringify({ deleted: count }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});
