# EasyFounder (formerly "Business OS") — notes for Claude Code

Self-hosted business OS for Imran Hossain Alif (Bangladesh), branded **EasyFounder** (logo files in `public/brand/`: `logo.png` green, `logo-white.png` for dark backgrounds, `mark*.png`, favicons). The original brief is `docs/ORIGINAL_BRIEF.md`
(build order, product rules, integrations) — read it before large changes. Keep this file current when the architecture changes.

## Non-negotiable product rules
- Analysis text labels **FACT** (from data) vs **HYPOTHESIS** (inference). No guarantees on CPM, CTR or sales.
- Kids Care is baby food: never health/cure/weight-gain claims; never invent prices or offers.
- Lottery/draw offers need prior Ministry of Commerce permission (BD Digital Commerce Guidelines 2021, 3.1.8).
- Analytics collections hold aggregates only (no customer names/phones). Customer data lives only in `inbox_messages`
  (role-restricted) and goes only to Meta and Anthropic.
- **Never remove an existing tab or option** when refactoring. UI language is Banglish; keep existing labels.
- `data/` and `.env` never go into git (the GitHub repo is public).

## Stack
Next.js 15 (App Router, route handlers, server actions) · TypeScript · PostgreSQL 16 + Prisma 6 · Auth.js v5 credentials (JWT)
· Tailwind for native pages · `worker/` process with node-cron · `@anthropic-ai/sdk` server-side only · Docker Compose
(web, worker, postgres, caddy).

## Architecture
- **Data (Phase 1):** one table `docs(collection, id, data jsonb, version, business, seq)` — `src/lib/db.ts`.
  API shape mirrors the legacy page: `db(principal).collection(c).doc(id).get/set/update/delete`, `.add()`,
  `.where(field, op, value).orderBy().limit().offset().get()`. Every write bumps `version` (optimistic lock via
  `expectedVersion`) and `seq` (global sequence → change feed `changes()` / `GET /api/v1/sync`). Deletes leave a row in
  `doc_tombstones`. `business` is derived on write by `docBusiness()` in `src/lib/business.ts`.
- **Access:** `src/lib/access.ts`. Principal = system (worker/webhook) or user (session or API key with scopes).
  owner/admin see everything; staff only docs whose `business` is assigned to them, plus `SHARED_COLLECTIONS`. Enforced
  inside the db layer (SQL filter on reads, checks on writes) — always go through `db(principal)`, never raw SQL for user requests.
- **Legacy UI:** `/app` serves `legacy/business-os.html` (the spec, unmodified on disk) with `public/legacy/bos-shim.js`
  providing `window.claude.use('db'|'mcp'|'sample'|'user')` on top of this server, and the small text patches in
  `src/lib/legacy/patches.ts` (each must match exactly once; a test checks them). This is how every tab works today.
  To port a tab natively: build it as a React page/component, then link to it — keep the legacy tab until the native one
  matches, and never drop an option.
- **InboxPilot:** `src/lib/inbox/*`. Webhook `src/app/api/meta/webhook/route.ts` (signature check, 200 at once, processing
  in `after()`). One doc per message in `inbox_messages` (id = Meta `mid`, dedupe by create-only write), config in
  `inbox_config/kidscare` (`ai_on` defaults to false). AI decision: `src/lib/inbox/ai.ts` (structured JSON output).
  Knowledge = `inbox_config.kb/rules` if pushed from the UI ("AI te live koro"), else compiled live (`compile.ts`, port of
  ibCompile/ibRulesCompile). Team replies enforce Meta's 24 h window. `channel` already supports messenger/instagram/whatsapp.
  The shim maps the old Make data-store calls to `/api/inbox/*`.
- **AI:** `/api/ai/sample` streams one Claude turn for the browser (the legacy chat runs its own tools client-side and loops).
  Server-side agent with the same tools/rules: `src/lib/ai/agent.ts` (`askAssistant`, `runAgent`), used by
  `/api/v1/ai/assistant`, `/mcp` and the scheduled jobs. Models: `ANTHROPIC_MODEL` (default `claude-haiku-5-5`),
  `ANTHROPIC_MODEL_COMPLEX` (default `claude-opus-5-5`).
- **Calculations (tested):** `src/lib/calc/nuport.ts` (sales_daily fields = `scripts/nuport_sync.py`), `pl.ts` (P&L, product
  costing versions), `engine.ts` (L×C×M×F, MER/POAS). Ports of the legacy functions — if you change one, change both or port the tab.
- **Worker:** `worker/index.ts` (cron, Asia/Dhaka) + `src/lib/jobs/runner.ts` (registry + `jobs` table queue, claimed with
  `FOR UPDATE SKIP LOCKED`). Jobs: `nuport_sync`, `sheets_sync` (downloads sheets, runs `scripts/kc_sync.py` unchanged),
  `inbox_import`, `backup` (pg_dump), and AI jobs gated by `AI_JOBS=on`.
- **Attendance tab (Kids Care):** `src/lib/legacy/attendance.ts`, from `sales_team/staff` + `staff_<YYYY-MM>` (team daily
  report sheet, parsed in `scripts/kc_sync.py` section 3, incl. office hours/fine rules from its সেটিংস tab).
- **Settings → API o connection** (`/settings`): `src/lib/health.ts` checks every outside service live (Anthropic 1-token call,
  Meta debug_token + ad accounts, Nuport, Make.com org) or by push freshness (Sheets, GA4), stored in `system_health/latest`
  (hourly job `health_check`); `/api/health` feeds the dashboard warning. AI tokens per month: `src/lib/aiUsage.ts` → `system_usage`.
- **Social Media (Kids Care tab, Publer-like):** native page `/social/[business]` (`src/components/social/*`), shown in the legacy
  tab through ONE permanent iframe laid over a placeholder (the legacy page re-draws `#view` on every data update; a re-created
  frame would reload and lose a draft). Graph API in `src/lib/social/meta.ts` (system-user token `META_SOCIAL_TOKEN` → page
  tokens on the fly; FB photo/album/video/link, IG photo/reel/carousel; posts + insights; IG Business Discovery for competitors).
  Jobs `src/lib/jobs/social.ts`: publish due posts (worker checks every minute), `social_sync` (3 h), `social_ideas` (AI plan,
  Wed+Sat). Media files: `src/lib/social/media.ts` → Docker volume `media`, public at `/media/<id>`. Analytics math:
  `src/lib/social/analytics.ts` (BD hours). Collections: social_accounts/posts/insights/daily/audience/competitors/settings/ai.
  Meta does not allow posting to Facebook groups by API: groups are suggestions only.
  YouTube (`src/lib/social/youtube.ts`, Google OAuth) and TikTok (`tiktok.ts`, TikTok OAuth, FILE_UPLOAD chunks, inbox draft or
  direct post) log in through `/api/social/oauth/[provider]/start|callback`; tokens via `saveSecret('oauth:<account>')` (encrypted,
  never in docs), refreshed by `oauth.getAccess`. UI styles: `src/components/social/social.css` (scoped `.sm`, dashboard fonts/colours).
  `/legal/privacy` and `/legal/terms` exist because TikTok/Google ask for them.
- **Inbox AI knowledge:** besides the compiled products/offers/delivery/FAQ (`compile.ts`), each reply also gets (`context.ts`)
  the closest passages of our website (`web.ts`: sitemap/links crawl of `WEBSITE_URL` → `inbox_web`, job `inbox_web_sync` daily 06:30,
  BM25 lookup) and the most similar past customer→TEAM reply pairs (`learn.ts`, built from `inbox_messages`, phones scrubbed, 15 min cache).
  Two websites (`WEBSITE_URL`, `WEBSITE_URL_2`, set in InboxPilot → Knowledge base) are read by `webSync`: pages, plus the shop catalogue
  (`products.ts`: Shopify `/products.json`, WooCommerce Store API incl. per-variation prices, else JSON-LD on pages) into `inbox_products`;
  the question's products with every variation + price go into the prompt as SHOP PRODUCTS (they win over KNOWLEDGE for prices).
  Uploaded PDF/TXT/MD/CSV (`files.ts`, route `/api/inbox/files`, job `inbox_file`): a PDF is read by Claude as a document block (scans/tables/Bangla
  work), text goes to `inbox_web` kind "file"; originals in MEDIA_DIR/kb, never served. UI: `__bos.sourcesCard()` in `public/legacy/bos-shim.js`.
  Reply rules (prompt in `ai.ts`, layout enforced by `format.ts`): Bangla script, everyone is "আপু", short paragraphs with blank lines, an information
  question gets ONLY the information (no prices unless asked), product descriptions (ingredients) come from `inbox_products.description`.
  When the AI has no answer / fails / the customer is angry, `process.ts sendFallback` sends the team's standard "please wait" text
  (`inbox_config.fallback_text`, Admin → InboxPilot; not repeated within 15 min); an answer + "team must follow up" is sent and the chat stays waiting.
  Prompt rule: prices/offers/delivery only from KNOWLEDGE (or website); past replies are for tone, never for numbers. Admin → InboxPilot has
  a status line and an "AI test" box (`/api/inbox/test`, sends nothing).
- **Config:** `src/lib/config.ts` — `await cfg('KEY')` = env var, else the value saved in Admin → Integrations
  (`app_settings`, AES-256-GCM with a key from AUTH_SECRET, 30 s cache). Use it for every integration key; never read
  those from `process.env` directly. The worker checks keys at run time, so saving in Admin needs no restart.
- **Sheets:** the Apps Script `deploy/sheets-push.gs` (runs in Imran's Google account every 30 min) uploads the sheet
  exports to `POST /api/integrations/sheets`; `runKcSync()` runs `scripts/kc_sync.py` and writes calls_daily/sales_team.
  The service-account pull (`sheets_sync`) is the alternative.
- **Deploy:** production is `/opt/business-os` on the VPS (os.osmanhadi.live). `deploy/update.sh` (systemd timer
  `bos-update`, every 5 min) pulls `claude/nice-wright-ngqxec` and rebuilds when it changed — **a push to that branch
  goes live within minutes**, so run `npm run typecheck && npm test` before pushing. First install: `deploy/setup-vps.sh`.
- **API:** `/api/v1/docs/:collection[/:id]` (GET/POST/PUT/PATCH/DELETE, `If-Match` versions), `/api/v1/batch`, `/api/v1/sync`,
  `/api/v1/kb/search`, `/api/v1/reports/:business`, `/api/v1/ai/assistant`, `/api/v1/me`. Keys: `src/lib/apikeys.ts`
  (sha256 stored, shown once). Spec: `src/lib/openapi.ts` — **update it when adding endpoints**. MCP: `src/app/mcp/route.ts` + `src/lib/mcp.ts`.

## Conventions
- Server-only secrets; nothing secret in `public/` or client code.
- Throw errors with `{status, code}`; route handlers wrap with `handle()` from `src/lib/http.ts`.
- Dates for business logic are Asia/Dhaka (`src/lib/time.ts`: `bdDate`, `bdToday`).
- Tests: `npm test` (unit). DB tests need `TEST_DATABASE_URL` pointing at a throwaway database (they write and delete rows).
- Data model reference: `docs/DATA_MODEL.md`. Import: `npm run db:import` (idempotent).

## Status / next steps (build order from the brief)
1. Scaffold, Docker, Doc table, auth + roles, import — **done**.
2. Port UI module by module — all tabs run via the legacy shim; native pages so far: Home (counts + KPIs), Admin. Next:
   native Overview, Tasks, Money/Loans, Kids Care Sales/P&L/Costing/Growth Engine (calc modules already exist and are tested).
3. InboxPilot native, Nuport worker, Sheets worker — **done** (needs real keys to verify against Meta/Nuport; Sheets ids go in `.env`).
4. API + keys + OpenAPI + MCP — **done**.
5. Typed Prisma models for hot collections (tasks, sales_daily, calls_daily, transactions, loans, inbox_messages, leads,
   clients) — **not started**; nightly `pg_dump` — **done**; Sentry — **not started** (logs go to stdout).
