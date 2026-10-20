# Business OS — self-hosted rebuild

You (Claude Code) are turning a working single-file prototype into a real, self-hosted CRM / business operating system for Imran Hossain Alif (Bangladesh). Read this whole file before writing code.

## 1. What exists today

- `legacy/business-os.html`: one ~475 KB HTML file. It is the **spec**. It ran as a claude.ai Artifact and used platform capabilities via `window.claude.use(...)`:
  - `db`: a Firestore-like doc store (`db.collection(c).doc(id).set/update/delete`, `onSnapshot`).
  - `mcp`: calls to connectors. **Make** (`data-store-records_*`, `scenarios_run`) for the Messenger inbox, and **Supermetrics** (`data_query`, `get_async_query_results`) for Facebook ad/page data.
  - `sample`: Claude calls from the page, used by the AI Assistant chat with page tools and by image→text in InboxPilot.
  - `user`: viewer identity and permission checks.
- `data/<collection>/<id>.json`: full export of the database (≈1,000 docs) on 2026-10-20. The schema is in `docs/DATA_MODEL.md`.
- `scripts/kc_sync.py`: Google Sheets (sales team call system) → `calls_daily` and `sales_team` aggregates.
- `scripts/nuport_sync.py`: Nuport orders → `sales_daily` rows (definitions of every field are in the code).
- `.env.example`: every secret the app needs. Secrets live only in `.env` / server env, never in the frontend or git.

The UI language is **Banglish** (Bangla in English letters), with some Bangla script. Keep the existing wording and labels.

## 2. Target

A multi-user web app hosted on Imran's own server, which he can keep improving later with Claude (Claude Code on the repo, plus Claude via the app's API).

**Stack (use this; don't re-litigate):**
- Next.js (App Router) + TypeScript, server actions / route handlers
- PostgreSQL + Prisma
- Auth: email + password (Auth.js credentials) with roles `owner`, `admin`, `staff`. Staff only see the businesses they're assigned to.
- Background jobs: a `worker` process with node-cron (same repo)
- Anthropic TypeScript SDK on the server only
- Tailwind; d3 or Recharts for charts (the legacy file uses d3)
- Deploy: Docker Compose (`web`, `worker`, `postgres`, `caddy` for HTTPS) on a VPS. Also add a `README` section for a plain Node host.

## 3. Data layer

Phase 1: one generic table, so the legacy code ports fast and the import is lossless.
```
Doc(collection text, id text, data jsonb, version int, created_at, updated_at, PRIMARY KEY(collection,id))
```
Write a small server-side `db` API with the same shape the legacy code uses (`collection(c).doc(id).get/set/update/delete`, `where/orderBy/limit`). Use optimistic `version` checks. Add live updates through polling or SSE.

Phase 3: move the hot collections to typed Prisma models: `tasks`, `sales_daily`, `calls_daily`, `transactions`, `loans`, `inbox_messages`, `leads`, `clients`.

`scripts/import_data.ts` must load every file in `data/` into `Doc`, and must be idempotent.

## 4. Modules to port (all of them; never drop a tab or option)

Grep `legacy/business-os.html` for these registries: `BTABS`, `ATABS`, `TITLES`, `FORMS`, `VIEWS`, and `COLS` (the list of collections).

- **Overview / Today / Tasks / Target & Goal / Recovery 90 / Review / Attention**
- **Money:** accounts, transactions, loans + loan_payments, dues, budgets, fixed costs
- **Business pages** (kidscare, insafia, lrf, itevs, hajj, others, personal), each with tabs:
  - Briefing, InboxPilot (kidscare), Growth Engine, AI Assistant, Marketing, Sales, Sales Team, Finance, P&L (mash), Product costing (`pc_items` with dated price versions), Daily spend, Targets, Funnel (`funnel_steps`), Playbook
- **Agency side** (lrf/itevs): leads, lead lists, clients, client tasks, payments, proposals, meetings, packages, templates, SOPs, proofs, feedback, outreach_daily
- **Global:** Search, Idea Book, Knowledge Store (`kb_docs`, `kb_chunks` with BM25 search, `kb_notes`), Issues, Live report, Learning, Book library, Competitor watch (`comp_watch`, `comp_weekly`)

Mobile layout must work at 375 px.

## 5. Integrations (replace Make wherever possible)

### 5.1 InboxPilot: Messenger inbox + AI agent (highest priority)

Today this runs through Make scenario 6699097 and data store `kc_inbox`. Rebuild it natively:

- **`GET /api/meta/webhook`:** if `hub.verify_token == META_VERIFY_TOKEN`, return `hub.challenge` as plain text.
- **`POST /api/meta/webhook`:**
  - Verify `X-Hub-Signature-256` with `META_APP_SECRET`, then answer 200 immediately and process async (Meta retries if you're slow).
  - Skip `is_echo` messages and dedupe on `mid`.
  - Store the message in `inbox_messages`: `conv`, `channel`, `dir` (in/out), `by` (customer/ai/team), `text`, `ts`, `mid`, `intent`, `mood`, `human`, `lead`, `order` json, `status` (open/waiting/done), `name`.
- **AI reply:** runs only when `inbox_config.ai_on` is true.
  - Call Claude with the knowledge base, the rules, and the last ~10 messages of the conversation.
  - Require JSON only: `{reply, intent: price|order|delivery|complaint|product_info|other, mood: happy|normal|angry, needs_human, lead_score 0-100, order:{name,phone,address,product,qty,baby_age}}`.
  - If `needs_human` is false, send through Graph API `POST /v21.0/me/messages` (`messaging_type: RESPONSE`) and store the reply. Otherwise set the conversation to `waiting`.
- **Knowledge compile:** combine Products, Special offers (only active and not expired), Couriers, Knowledge-base entries and Settings (greeting, tone, rules, sample chats) into one text. Port `ibCompile` / `ibRulesCompile` from the legacy file. Cap it at about 30k characters.
- **UI:** the same menu as InboxPilot:
  - Home, Inbox, Notifications, Orders, Leads, Products, Special offers, Broadcasts, Analytics, Agent desk, Knowledge base, Channels, Couriers, Settings, Team, Billing
  - A global "AI reply ON/OFF" toggle
- **Team reply** from the inbox: only within 24 h of the customer's last message (Meta policy). Show the 24-hour window in the UI.
- **Old-message import:**
  - `GET /{page-id}/conversations?platform=messenger&fields=participants,messages.limit(25){id,message,from,created_time}`, following paging cursors.
  - Run it as a background job with a date limit (default last 30 days), and dedupe by `mid`.
  - A message is "out/team" when `from.id == META_PAGE_ID`. The conversation id is the participant who isn't the page.
- **Image → knowledge:** upload an image, Claude vision extracts the text, the user reviews it, then saves it as a KB entry.
- **Website → knowledge:** the server fetches the URL, extracts readable text, and the user reviews it before saving. This replaces the Make scenario that the free plan couldn't run.
- Later: Instagram DM (same Meta app) and WhatsApp Cloud API. Design `channel` for these from day one.

### 5.2 Nuport (Kids Care orders)
A worker job at 08:50, 13:50 and 20:50 Asia/Dhaka does the following:
- Fetches SO numbers from the last known number to +300 (stop after 30 consecutive 404s).
- Re-fetches orders from the last 14 days so status changes are picked up.
- Upserts `sales_daily` per BD date, using the field definitions in `scripts/nuport_sync.py`.

The Sales tab must show "Ekhon courier e (in transit): N order · ৳X" across all dates.

### 5.3 Google Sheets sales-team sync
Port `scripts/kc_sync.py`. It runs 3× a day and writes `calls_daily` and `sales_team/*`. It uses a service account to read the sheets. The sheet ids are in the script's docstring/usage.

### 5.4 Facebook ads / page data
Use the Supermetrics API (or the Meta Marketing API directly with a system-user token) for ad spend per day. That feeds the P&L, MER and the Growth Engine.

### 5.5 AI Assistant (per business)
This is a server-side Claude tool-use loop. Port the tools from the legacy `aiTools`: `search_knowledge` (BM25 over `kb_chunks`), `get_records`, `add_ideas`, `add_tasks`, `add_funnel_steps`.
- Stream the responses.
- Save chats in `ai_chat`.

### 5.6 Scheduled AI jobs (today these are Claude scheduled tasks; keep them working)
- Weekly Growth Engine (Sat 11:47)
- Weekly competitor research (Sat 09:41)
- Monthly loan plan (1st & 20th)
- Weekly learning nudge (Fri)

Expose what they need through the API (§6) so they can keep running from Claude. Optionally re-implement them as worker jobs calling the Anthropic API.

## 6. "Improve it any time with Claude": the API

- REST API under `/api/v1` with per-key auth (`Authorization: Bearer <key>`, keys created by the owner in Settings with read/write scopes):
  - `GET/PUT/PATCH/DELETE /api/v1/docs/:collection/:id`
  - `GET /api/v1/docs/:collection?where=&limit=&cursor=`
  - `POST /api/v1/batch`
- Publish an OpenAPI spec at `/api/v1/openapi.json`.
- Optional: a tiny MCP server (`/mcp`, streamable HTTP) wrapping the same endpoints, so Claude can be connected to the live app as a connector.
- Keep `CLAUDE.md` up to date as the architecture changes, so future Claude Code sessions can safely extend the app.

## 7. Non-negotiable product rules

- Analysis text labels **FACT** (from data) and **HYPOTHESIS** (inference). No guarantees about CPM, CTR or sales.
- Kids Care is baby food. The AI must never make health, cure or weight-gain claims, and must never invent prices or offers.
- Lottery/draw offers need prior Ministry of Commerce permission (BD Digital Commerce Guidelines 2021, 3.1.8).
- Analytics collections store aggregates, not customer names or phones. Inbox/order records may hold customer data; restrict them by role and never send them to third parties beyond Meta and Anthropic.
- Never remove an existing tab or option when refactoring.

## 8. Build order and done-criteria

1. **Scaffold:** repo, Docker, Prisma `Doc`, auth with roles, `import_data.ts`. *Done when* every collection imports and a logged-in owner sees the counts.
2. **Port the UI module by module.** Start with Overview, Tasks, Money/Loans, the Kids Care business page (Sales, P&L, Product costing, Growth Engine), then the rest. *Done when* each tab renders the imported data the same way as the legacy file.
3. **InboxPilot native**, then the Nuport worker, then the Sheets worker. *Done when* a test Messenger message gets an AI reply and appears in the inbox, and Nuport numbers match the Nuport panel for the last 3 days.
4. **API + keys + OpenAPI**, plus the optional MCP endpoint.
5. **Typed tables** for the hot collections, backups (nightly `pg_dump`), and Sentry/logging.

Write tests for the sync math (Nuport fields, P&L, Growth Engine L×C×M×F) and for the webhook signature and verify handlers.
