# Halo

Assignment tracker, calendar, class routine, and reminder email system.

## Architecture

- **Backend:** Supabase (Postgres + Auth + Edge Functions)
- **Frontend:** React + Vite (deployed on Vercel)
- **Auth:** Google OAuth only (via Supabase Auth)
- **Email:** Google Apps Script relay (swappable to Resend later)
- **Scheduling:** cron-job.org → Edge Function (every 15 min)

## Project Structure

```
halo/
├── supabase/
│   ├── migrations/          # Versioned SQL migrations
│   └── functions/
│       ├── _shared/
│       │   ├── email.ts     # Provider-swappable email helper
│       │   └── cors.ts      # CORS headers
│       └── check-task-reminders/
│           └── index.ts     # Cron-triggered reminder function
├── src/                     # React frontend (throwaway test UI)
│   ├── lib/supabase.ts      # Supabase client init
│   ├── pages/               # Login, Dashboard, Tasks, Calendar, Routine, Settings
│   ├── App.tsx
│   └── main.tsx
├── docs/
│   └── apps-script-setup.md # Apps Script relay setup instructions
├── .env.example             # Environment variable placeholders
└── package.json
```

## Setup

### 1. Clone and install

```bash
git clone https://github.com/lousyass/halo.git
cd halo
npm install
```

### 2. Configure environment

Copy `.env.example` to `.env` and fill in:

```
VITE_SUPABASE_URL=https://rzlktluhwayzlybncdbw.supabase.co
VITE_SUPABASE_ANON_KEY=<your-anon-key>
```

### 3. Google OAuth

- Create a Google Cloud OAuth 2.0 client
- Add `https://rzlktluhwayzlybncdbw.supabase.co/auth/v1/callback` as a redirect URI
- Configure the client ID and secret in the Supabase Dashboard under **Auth → Providers → Google**

### 4. Run the dev server

```bash
npm run dev
```

### 5. Edge Function secrets (already set in Supabase)

The following are configured via `supabase secrets set` (never committed):

- `CRON_SECRET` — shared with cron-job.org
- `APPS_SCRIPT_WEBHOOK_URL` — Apps Script deployment URL
- `APPS_SCRIPT_SHARED_SECRET` — must match the Apps Script `SHARED_SECRET` property

### 6. cron-job.org

Create a job at [cron-job.org](https://cron-job.org):
- URL: `https://rzlktluhwayzlybncdbw.supabase.co/functions/v1/check-task-reminders`
- Schedule: Every 15 minutes
- Method: GET or POST
- Header: `Authorization: Bearer <CRON_SECRET value>`

## Database Tables

| Table | Purpose |
|---|---|
| `profiles` | User profiles (extends auth.users) |
| `tasks` | Assignments/exams |
| `routine_entries` | Weekly class schedule template |
| `day_backgrounds` | Optional background image per calendar day |
| `task_reminders_sent` | Dedup for threshold-based reminders (service role only) |
| `daily_digest_sent_log` | Dedup for daily digest emails (service role only) |

All tables have RLS enabled. User-facing tables use `auth.uid() = user_id` policies.
`task_reminders_sent` and `daily_digest_sent_log` have no user policies — only the Edge Function (service role) writes to them.

## Reminder Modes

- **Urgent:** Emails at 48h, 24h, 2h before deadline + overdue. One email per user per cron run, grouped by threshold.
- **Daily:** One digest email per day at user's chosen time, listing all incomplete tasks. Only sent if there are pending tasks.

Both modes use level-check + dedup tables to be self-healing if a cron run is late or skipped.
