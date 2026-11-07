# Abode Assist — deployment and running locally

- **GitHub:** https://github.com/gpr-27/abode-assist
- **Live app:** https://abode-assist.vercel.app

## Demo login details for the reviewer

| Role | Where | Login |
|---|---|---|
| Sales head (sees everything: fact sheet, slots, review queue, merge, reassign) | https://abode-assist.vercel.app/login | `head@abode.demo` / `Demo@1234` |
| Sales executive, Project 1 | https://abode-assist.vercel.app/login | `priya@abode.demo` / `Demo@1234` |
| Sales executive, Project 2 | https://abode-assist.vercel.app/login | `neha@abode.demo` / `Demo@1234` |
| Sales executive, both projects | https://abode-assist.vercel.app/login | `arjun@abode.demo` / `Demo@1234` |
| Buyer (has a past visit and messages) | https://abode-assist.vercel.app/login/buyer | mobile `98765 58210`. SMS is simulated, so the 6-digit code is shown on screen. |
| Buyer, new | https://abode-assist.vercel.app/chat | No login needed. Chat, pick a time, and enter any valid Indian mobile number in the form. |

These are demo accounts on synthetic data. The password is set by `DEMO_PASSWORD` when seeding.

**A 3-minute tour:**
1. Open `/chat` on a phone. Ask "3 BHK carpet area?", then "Can I visit Sunday morning?". Tap a time, fill in the form and tick consent. The visit is booked.
2. Ask "any discount?" and watch the assistant refuse and hand off. Ask about something not in the fact sheet (for example "metro nearby?") and it says a person will confirm.
3. Sign in as `head@abode.demo`:
   - **Leads**: your new lead is at the top, with its response timer and source tag.
   - Open the lead to see the AI summary and the chat, then reply as the executive. The reply appears in the buyer's chat.
   - **Review**: the discount and missing-fact chats are flagged.
   - **Visits**: mark the 1 Nov visit as Visited.
   - **Dashboard**: shows the effect of those actions.
4. **Leads → Import portal CSV**: use the sample CSV link on that screen. It includes a duplicate (merged into the existing lead) and an invalid phone (rejected with a reason).

## Run locally

Prerequisites: Node.js 22+ (tested on 26), pnpm 10+ (the repo pins pnpm 12 via `packageManager`), and a PostgreSQL 15+ database (Supabase free tier or a local Postgres).

```bash
git clone https://github.com/gpr-27/abode-assist.git
cd abode-assist
pnpm install
cp .env.example .env.local        # fill in the values (names listed below)
```

**Database setup:**
- **Supabase:**
  1. Create a project in the region nearest your users (we use ap-south-1).
  2. In the SQL editor, run:
     ```sql
     create role abode_app with login password '<strong-password>';
     grant abode_app to postgres;
     create schema app authorization abode_app;
     grant usage on schema extensions to abode_app;
     grant create on database postgres to abode_app;   -- lets `pnpm db:reset` recreate the schema
     alter role abode_app set search_path = app, extensions;
     -- pgcrypto and pg_trgm are already in the extensions schema on Supabase; elsewhere:
     -- create extension if not exists pgcrypto; create extension if not exists pg_trgm;
     ```
  3. Set `DATABASE_URL` to the **transaction pooler** (port **6543**) and `DIRECT_DATABASE_URL` to the **session pooler** (port **5432**), both with user `abode_app.<project-ref>`.
- **Local Postgres:** create a database and a role, run `create schema app` owned by that role, install `pgcrypto` and `pg_trgm`, then point both URLs at it.

Then:

```bash
pnpm db:migrate      # applies db/schema.sql
pnpm db:seed         # demo data: 2 projects, fact sheet, 5 staff, ~180 leads, slots for −10…+21 days, chats, outbox
pnpm dev             # http://localhost:3000
```

Other commands:

```bash
pnpm test            # 146 tests (unit + DB race tests; DB tests skip if DATABASE_URL is unset)
pnpm typecheck
pnpm lint
pnpm db:reset && pnpm db:seed   # wipe and re-seed (dates are relative to today)
pnpm llm:check GROQ_API_KEY     # health-check one step of the LLM chain with a real tool call
```

If you run without any LLM key, the chat still works: buttons, slot booking, the consent form and handoff are all deterministic. Free-text questions get an honest "I'm having trouble answering right now" reply that still offers slots.

## How it is deployed

- **Hosting:** Vercel project `abode-assist`, linked to the GitHub repo (pushes to `main` deploy to production; other branches get preview URLs). Node.js runtime on Fluid Compute. Functions run in **`bom1` (Mumbai)**, next to the database.
- **Database:** Supabase Postgres, project `abode-assist`, region ap-south-1 (Mumbai). The app connects as its own role to the private `app` schema through the transaction pooler.
- **Reminders (cron):** `GET /api/cron/reminders` sends the WhatsApp/SMS reminders that have come due (mocked through the outbox table). It needs `Authorization: Bearer $CRON_SECRET`. Three things call it:
  - `vercel.json` runs it once a day (the free Vercel plan allows nothing more often);
  - `.github/workflows/reminders.yml` runs it **every 5 minutes**. It needs two repository secrets, `APP_URL` and `CRON_SECRET`, and does nothing until both are set (Settings → Secrets and variables → Actions);
  - any chat message, and the Leads, Visits and Messages pages, also send what is due, and Messages has a **Send due messages now** button.
  A reminder that only comes due after the visit has started is skipped, never sent.
- **Deploy steps used:**
  ```bash
  vercel link --project abode-assist
  vercel env add <NAME> production        # for each variable below
  vercel deploy --prod                    # or push to main
  pnpm db:migrate && pnpm db:seed         # once, from a machine with DIRECT_DATABASE_URL
  ```

## Environment variables (names only)

| Name | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | yes | Postgres connection used by the app (Supabase transaction pooler, port 6543) |
| `DIRECT_DATABASE_URL` | for scripts | Used by `db:migrate` and `db:seed` (and tests); falls back to `DATABASE_URL` |
| `SESSION_SECRET` | yes | 32+ characters; signs session cookies and salts OTP hashes |
| `CRON_SECRET` | yes on Vercel | Bearer token Vercel Cron sends to `/api/cron/reminders` |
| `APP_URL` | recommended | Public base URL used in opt-out links in messages; defaults to the Vercel production URL |
| `ANTHROPIC_API_KEY` | optional | LLM chain step 1 (`claude-sonnet-5-5`) |
| `GROQ_API_KEY` | optional | LLM chain step 2 (Groq free tier) |
| `GROQ_API_KEY_2` | optional | LLM chain step 3 |
| `GEMINI_API_KEY` | optional | LLM chain step 4 (Gemini free tier; personal data is redacted first) |
| `GEMINI_API_KEY_2` | optional | LLM chain step 5 |
| `DEMO_MODE` | optional | `true` shows the simulated SMS one-time code on screen and the demo staff logins on the sign-in page. Off when unset, which is what a real deployment should do |
| `DEMO_PASSWORD` | seed only | Password given to demo staff accounts by `pnpm db:seed` (default `Demo@1234`) |

Any LLM key can be left empty; that step of the chain is skipped.
