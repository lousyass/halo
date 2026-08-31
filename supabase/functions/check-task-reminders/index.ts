import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";
import { sendReminderEmail } from "../_shared/email.ts";

/**
 * check-task-reminders — called every 15 minutes by cron-job.org.
 *
 * For each user:
 *   - urgent mode: check threshold-based reminders (48h, 24h, 2h, overdue)
 *   - daily mode: send one digest per day at the user's chosen time
 *
 * Uses the service role key to bypass RLS and process all users.
 */

// Threshold definitions: label → milliseconds
const THRESHOLDS: { label: string; ms: number }[] = [
  { label: "48h", ms: 48 * 60 * 60 * 1000 },
  { label: "24h", ms: 24 * 60 * 60 * 1000 },
  { label: "2h", ms: 2 * 60 * 60 * 1000 },
  { label: "overdue", ms: 0 },
];

interface Task {
  id: string;
  title: string;
  subject: string;
  type: string;
  due_date: string;
  due_time: string | null;
  completed: boolean;
  user_id: string;
}

interface Profile {
  id: string;
  timezone: string;
  reminder_mode: string;
  daily_digest_time: string;
}

interface UserEmail {
  id: string;
  email: string;
}

/**
 * Convert a task's due_date + due_time into a UTC Date object,
 * interpreting them in the user's timezone.
 */
function getDeadlineUtc(
  dueDate: string,
  dueTime: string | null,
  timezone: string
): Date {
  const time = dueTime ?? "23:59:00";
  // Build an ISO-like string in the user's local time
  const localStr = `${dueDate}T${time}`;

  // Use Intl to find the UTC offset for this timezone at this local time.
  // We construct a date assuming UTC first, then adjust.
  const naive = new Date(localStr + "Z"); // treat as UTC temporarily

  // Get the offset by formatting in the target timezone
  const formatter = new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  // A more robust approach: use the timezone to figure out the offset
  // by comparing what "now" looks like in UTC vs the timezone.
  // For a specific local datetime → UTC conversion, we iterate:
  // Start with a guess, check the offset at that guess, adjust.
  let guess = naive.getTime();
  for (let i = 0; i < 3; i++) {
    const parts = formatter.formatToParts(new Date(guess));
    const get = (t: string) =>
      parts.find((p) => p.type === t)?.value ?? "0";
    const formatted = `${get("year")}-${get("month")}-${get("day")}T${get("hour")}:${get("minute")}:${get("second")}Z`;
    const localAtGuess = new Date(formatted);
    const diff = localAtGuess.getTime() - naive.getTime();
    guess = guess - diff;
  }
  return new Date(guess);
}

/**
 * Get the current local date string (YYYY-MM-DD) and time-of-day string (HH:MM:SS)
 * for a given timezone.
 */
function getLocalNow(timezone: string): { date: string; time: string } {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });
  const parts = formatter.formatToParts(now);
  const get = (t: string) => parts.find((p) => p.type === t)?.value ?? "00";
  const date = `${get("year")}-${get("month")}-${get("day")}`;
  const time = `${get("hour")}:${get("minute")}:${get("second")}`;
  return { date, time };
}

/**
 * Format a threshold label into a human-readable string for the email.
 */
function thresholdLabel(threshold: string): string {
  switch (threshold) {
    case "48h":
      return "due in ~2 days";
    case "24h":
      return "due in ~1 day";
    case "2h":
      return "due in ~2 hours";
    case "overdue":
      return "overdue — did you submit this?";
    default:
      return threshold;
  }
}

Deno.serve(async (req: Request) => {
  // Only accept POST (from cron-job.org)
  if (req.method === "OPTIONS") {
    return new Response("ok", {
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "authorization, content-type",
      },
    });
  }

  // --- Auth: verify CRON_SECRET ---
  const cronSecret = Deno.env.get("CRON_SECRET");
  if (!cronSecret) {
    console.error("CRON_SECRET not configured");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("authorization") ?? "";
  const token = authHeader.replace(/^Bearer\s+/i, "");

  if (token !== cronSecret) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  // --- Supabase client with service role ---
  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(supabaseUrl, serviceRoleKey);

  const now = new Date();
  const results: { user: string; mode: string; sent: number; errors: number }[] = [];

  try {
    // Fetch all profiles
    const { data: profiles, error: profilesError } = await supabase
      .from("profiles")
      .select("id, timezone, reminder_mode, daily_digest_time");

    if (profilesError) {
      throw new Error(`Failed to fetch profiles: ${profilesError.message}`);
    }

    if (!profiles || profiles.length === 0) {
      return new Response(
        JSON.stringify({ message: "No users to process", results: [] }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch all user emails from auth.users
    const { data: authData, error: authError } = await supabase.auth.admin.listUsers();
    if (authError) {
      throw new Error(`Failed to fetch auth users: ${authError.message}`);
    }

    const emailMap = new Map<string, string>();
    for (const user of authData.users) {
      if (user.email) {
        emailMap.set(user.id, user.email);
      }
    }

    // Process each user
    for (const profile of profiles as Profile[]) {
      const userEmail = emailMap.get(profile.id);
      if (!userEmail) {
        console.warn(`No email found for user ${profile.id}, skipping`);
        continue;
      }

      const userResult = { user: profile.id, mode: profile.reminder_mode, sent: 0, errors: 0 };

      if (profile.reminder_mode === "urgent") {
        await processUrgentMode(supabase, profile, userEmail, now, userResult);
      } else if (profile.reminder_mode === "daily") {
        await processDailyMode(supabase, profile, userEmail, now, userResult);
      }

      results.push(userResult);
    }

    return new Response(
      JSON.stringify({ message: "OK", processed: results.length, results }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("check-task-reminders error:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

/**
 * Urgent mode: check each incomplete task against the four thresholds.
 * Group all newly-due reminders by threshold and send one email per user.
 */
async function processUrgentMode(
  supabase: ReturnType<typeof createClient>,
  profile: Profile,
  userEmail: string,
  now: Date,
  result: { sent: number; errors: number }
) {
  // Fetch incomplete tasks for this user
  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("id, title, subject, type, due_date, due_time, completed, user_id")
    .eq("user_id", profile.id)
    .eq("completed", false);

  if (tasksError) {
    console.error(`Failed to fetch tasks for ${profile.id}:`, tasksError.message);
    result.errors++;
    return;
  }

  if (!tasks || tasks.length === 0) return;

  // Fetch existing sent reminders for this user's tasks
  const taskIds = tasks.map((t: Task) => t.id);
  const { data: sentReminders, error: sentError } = await supabase
    .from("task_reminders_sent")
    .select("task_id, threshold")
    .in("task_id", taskIds);

  if (sentError) {
    console.error(`Failed to fetch sent reminders for ${profile.id}:`, sentError.message);
    result.errors++;
    return;
  }

  const sentSet = new Set(
    (sentReminders ?? []).map(
      (r: { task_id: string; threshold: string }) => `${r.task_id}:${r.threshold}`
    )
  );

  // Determine which (task, threshold) pairs need to fire
  const toSend: { task: Task; threshold: string }[] = [];

  for (const task of tasks as Task[]) {
    const deadline = getDeadlineUtc(task.due_date, task.due_time, profile.timezone);
    const gap = deadline.getTime() - now.getTime(); // positive = still in future

    for (const th of THRESHOLDS) {
      const key = `${task.id}:${th.label}`;
      if (sentSet.has(key)) continue; // already sent

      // Level check: gap <= threshold_duration
      // For overdue (ms=0): gap <= 0, i.e. now >= deadline
      if (gap <= th.ms) {
        toSend.push({ task, threshold: th.label });
      }
    }
  }

  if (toSend.length === 0) return;

  // Build one email for this user with all triggered reminders
  const lines: string[] = [
    `Hi! Here's an update on your assignments:\n`,
  ];

  // Group by threshold for readability
  const grouped = new Map<string, Task[]>();
  for (const item of toSend) {
    const list = grouped.get(item.threshold) ?? [];
    list.push(item.task);
    grouped.set(item.threshold, list);
  }

  for (const [threshold, taskList] of grouped) {
    lines.push(`📌 ${thresholdLabel(threshold)}:`);
    for (const task of taskList) {
      lines.push(`  • ${task.title} (${task.subject} — ${task.type}) — due ${task.due_date}${task.due_time ? " at " + task.due_time : ""}`);
    }
    lines.push("");
  }

  lines.push("— Halo ✨");

  const emailResult = await sendReminderEmail({
    to: userEmail,
    subject: `Halo — ${toSend.length} assignment reminder${toSend.length > 1 ? "s" : ""}`,
    body: lines.join("\n"),
  });

  if (emailResult.success) {
    // Insert dedup rows only after successful send
    const dedupRows = toSend.map((item) => ({
      task_id: item.task.id,
      threshold: item.threshold,
    }));

    const { error: insertError } = await supabase
      .from("task_reminders_sent")
      .insert(dedupRows);

    if (insertError) {
      console.error(`Failed to insert dedup rows for ${profile.id}:`, insertError.message);
      result.errors++;
    }
    result.sent += toSend.length;
  } else {
    console.error(`Failed to send urgent email to ${userEmail}:`, emailResult.error);
    result.errors++;
  }
}

/**
 * Daily mode: send one digest at the user's chosen daily_digest_time,
 * listing all incomplete tasks. Only send if there are pending tasks.
 */
async function processDailyMode(
  supabase: ReturnType<typeof createClient>,
  profile: Profile,
  userEmail: string,
  _now: Date,
  result: { sent: number; errors: number }
) {
  const localNow = getLocalNow(profile.timezone);

  // Level check: local time >= daily_digest_time
  // daily_digest_time is stored as HH:MM (or HH:MM:SS)
  const digestTime = profile.daily_digest_time.substring(0, 5); // "HH:MM"
  const currentTime = localNow.time.substring(0, 5); // "HH:MM"

  if (currentTime < digestTime) {
    return; // not yet time
  }

  // Dedup check: have we already sent for today's local date?
  const { data: existing, error: checkError } = await supabase
    .from("daily_digest_sent_log")
    .select("id")
    .eq("user_id", profile.id)
    .eq("sent_for_date", localNow.date)
    .limit(1);

  if (checkError) {
    console.error(`Failed to check digest log for ${profile.id}:`, checkError.message);
    result.errors++;
    return;
  }

  if (existing && existing.length > 0) {
    return; // already sent today
  }

  // Fetch ALL incomplete tasks (any due date)
  const { data: tasks, error: tasksError } = await supabase
    .from("tasks")
    .select("id, title, subject, type, due_date, due_time")
    .eq("user_id", profile.id)
    .eq("completed", false)
    .order("due_date", { ascending: true });

  if (tasksError) {
    console.error(`Failed to fetch tasks for digest ${profile.id}:`, tasksError.message);
    result.errors++;
    return;
  }

  if (!tasks || tasks.length === 0) {
    return; // no pending tasks, no email
  }

  // Build digest email
  const lines: string[] = [
    `Reminder: Here's everything still on your plate:\n`,
  ];

  for (const task of tasks as Task[]) {
    const overdue = task.due_date < localNow.date ? " ⚠️ OVERDUE" : "";
    lines.push(`• ${task.title} (${task.subject} — ${task.type}) — due ${task.due_date}${task.due_time ? " at " + task.due_time : ""}${overdue}`);
  }

  lines.push(`\n${tasks.length} task${tasks.length > 1 ? "s" : ""} total.`);
  lines.push("\n— Halo ✨");

  const emailResult = await sendReminderEmail({
    to: userEmail,
    subject: `Halo — Daily digest (${tasks.length} pending task${tasks.length > 1 ? "s" : ""})`,
    body: lines.join("\n"),
  });

  if (emailResult.success) {
    // Insert dedup row
    const { error: insertError } = await supabase
      .from("daily_digest_sent_log")
      .insert({ user_id: profile.id, sent_for_date: localNow.date });

    if (insertError) {
      console.error(`Failed to insert digest dedup for ${profile.id}:`, insertError.message);
      result.errors++;
    }
    result.sent++;
  } else {
    console.error(`Failed to send digest to ${userEmail}:`, emailResult.error);
    result.errors++;
  }
}
