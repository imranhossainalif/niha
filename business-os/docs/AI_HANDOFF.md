# EasyFounder — AI handoff

**Read this first if you are a new AI taking over this project.** It is written by a previous AI session for the next
one. It contains **no secrets** — access (API key, SSH) is handed over separately, see
[`ai-access-checklist.md`](ai-access-checklist.md).

Last updated: 2026-11-01 (after the `localservicehq` business was added and the Sales Team per-rep fix went live).

---

## 1. What this project is

**EasyFounder** is Imran Hossain Alif's self-hosted business OS / CRM dashboard (live: <https://os.osmanhadi.live>).
Everything runs on his own VPS: Next.js 15 web app + a background worker + PostgreSQL + Caddy (Docker Compose).

Businesses (`business-os/src/lib/business.ts` → `BIZ`): `kidscare` (Kids Care BD, baby food), `insafia`, `lrf`
(Local Revenue Flow), `localservicehq` (new agency business, LRF-style structure), `itevs`, `hajj`, `others`,
`personal`.

- Repo: `github.com/imranhossainalif/niha`, app code in `business-os/`.
- Deploy branch: **`claude/nice-wright-ngqxec`**. A push there goes live within ~5 minutes (`deploy/update.sh` timer).
- Languages: the **UI is Banglish** (Bangla words in English letters). You (the AI) reply to Imran in **Banglish**.
  Customer-facing Messenger replies are in **Bangla script**, everyone is "আপু".

### Read these next (in this order)

1. `business-os/CLAUDE.md` — architecture, conventions, non-negotiable rules (the main guide).
2. `business-os/docs/ORIGINAL_BRIEF.md` — the original brief, product rules, build order.
3. `business-os/docs/DATA_MODEL.md` — collections and fields.
4. `business-os/docs/DEEPSEEK_GUIDE.md` — Banglish guide written for AI coding tools (deploy rules, what is built).
5. This file — access, live-operation, known issues.

---

## 2. Non-negotiable rules (never break these)

- **Never remove a tab or an option.** Add the new thing and keep the old one until the new one matches.
- **`data/` and `.env` never go into git.** The repo may be public or private — secrets in history stay forever.
- **Never put a secret in code, a commit, a chat message or a prompt.** Integration keys live in
  Admin → Integrations (encrypted) or `.env`; in code read them only with `await cfg('KEY')` (`src/lib/config.ts`).
- **Kids Care is baby food:** no health/cure/weight-gain claims, never invent prices or offers.
- **Lottery/draw offers** need prior Ministry of Commerce permission (BD Digital Commerce Guidelines 2021, 3.1.8).
- **Analytics collections are aggregates only** (no customer names/phones). Customer data lives only in
  `inbox_messages` (role-restricted) and may only go to Meta and Anthropic.
- **Analysis labels `FACT` (from data) vs `HYPOTHESIS` (guess).** No guarantees about CPM/CTR/sales.
- **Dates use Asia/Dhaka** (`src/lib/time.ts`: `bdDate`, `bdToday`).
- **Never deploy yourself.** Work on a `deepseek/*` (or feature) branch, open a PR, and let Imran/Claude merge.
  Merging into the deploy branch = live in ~5 minutes.

---

## 3. Stack and architecture map

| Area | Where |
|---|---|
| Data layer (one `docs` table, JSONB) | `src/lib/db.ts` — always `db(principal)`, never raw SQL in request paths |
| Access / roles | `src/lib/access.ts`, `src/lib/business.ts` |
| Auth (Auth.js credentials, JWT) | `src/auth.ts`, `src/lib/session.ts`, login `/login`, first-run `/setup` |
| Config / integration keys | `src/lib/config.ts` (`cfg('KEY')`; env wins, else encrypted `app_settings`) |
| Legacy dashboard (every tab) | `legacy/business-os.html` (**do not edit**) + `public/legacy/bos-shim.js` + `src/lib/legacy/patches.ts` |
| Extra legacy tab code | `src/lib/legacy/*.ts` (`salesLive.ts` = Sales Team, `attendance.ts`, `webTraffic.ts`, …) |
| Native pages | `/` (home counts), `/admin`, `/settings`, `/social/[business]`, `/legal/*` |
| InboxPilot (Messenger AI) | `src/lib/inbox/*`, webhook `src/app/api/meta/webhook/route.ts` |
| Social media (Publer-like) | `src/lib/social/*`, `src/components/social/*`, `src/app/social/[business]/page.tsx` |
| AI assistant (server-side) | `src/lib/ai/agent.ts` (`askAssistant`, `runAgent`) |
| Calculations (tested) | `src/lib/calc/nuport.ts`, `pl.ts`, `engine.ts` |
| Worker / scheduled jobs | `worker/index.ts`, `src/lib/jobs/runner.ts`, `src/lib/jobs/*` |
| Sheets sync | `scripts/kc_sync.py` (calls_daily, sales_team), `src/lib/jobs/sheets.ts` |
| REST API / OpenAPI / MCP | `src/app/api/v1/**`, `src/lib/openapi.ts`, `src/app/mcp/route.ts`, `src/lib/mcp.ts` |
| Deploy | `deploy/update.sh`, `deploy/setup-vps.sh`, `docker-compose.yml`, `Caddyfile` |

### Two sources of truth that bite you

1. **Legacy UI**: `legacy/business-os.html` is the spec and must stay untouched. Changes are `{find, replace}` pairs in
   `src/lib/legacy/patches.ts`; every `find` must match **exactly once** or `/app` throws a 500 for every tab
   (`tests/legacy.test.ts` checks this). New legacy code lives in `String.raw` modules — watch backticks/`${`.
2. **Calc ports**: `src/lib/calc/*` are tested ports of functions in the legacy file. If you change a formula, change
   both (or finish the native port) and update the tests.

---

## 4. Data layer in one paragraph

One table `docs(collection, id, data jsonb, version, seq, business)` plus `doc_tombstones`. API shape mirrors the old
artifact: `db(p).collection(c).doc(id).get/set/update/delete`, `.add()`, `.where(field, op, value).orderBy().limit().offset().get()`.
Writes bump `version` (optimistic lock via `expectedVersion`) and `seq` (global change feed, polled by the legacy shim via
`GET /api/v1/sync?since=`). `business` is derived on write (`docBusiness()`), and staff only see their assigned businesses
(`allowedBusinesses` + SQL filter inside `db.ts`). Collections are listed in `src/lib/business.ts` (`LEGACY_COLS`) and
`docs/DATA_MODEL.md`. Sanitized example documents are in [`fixtures/`](fixtures/).

---

## 5. Local development

Prereqs: Node 22+, npm, PostgreSQL 16 (or Docker), Python 3 + `openpyxl` for the Sheets sync, `pg_dump` for backups.

```bash
cd business-os
npm install
cp .env.example .env              # fill DATABASE_URL; never use the production database
npx prisma migrate deploy
npm run dev                       # http://localhost:3000
npm run worker                    # second process (optional, for jobs)

npm run typecheck                 # must pass before a PR
npm test                          # unit tests (DB tests are skipped)
npm run build                     # full Next build
```

DB/integration tests need a **throwaway** database (they write and delete rows):

```bash
TEST_DATABASE_URL="postgresql://user:pass@localhost:5432/business_os_test" npm test
```

**Never point `TEST_DATABASE_URL` at production.** If you do not have a test DB, run only the unit tests and say
"DB tests not verified" in your report.

Useful: `/setup` only works on an empty DB (creates the owner); `npm run user:create -- email 'long-password' owner`.

---

## 6. Live access for an AI

The web session cookie cannot be handed to an AI. Use the app's own **API key** instead.

1. Imran creates a key in **Admin → API keys** (`/admin`): name e.g. `ai-read` (read-only) or `ai-write`
   (read + write). The key is shown **once**; it is `bos_...`.
2. The key is delivered **outside chat**, e.g. a local env file (see `ai-access-checklist.md`):
   `EASYFOUNDER_API_KEY=bos_...`.
3. Usage (all endpoints are on the live domain):

```bash
BASE=https://os.osmanhadi.live
H="Authorization: Bearer $EASYFOUNDER_API_KEY"

curl -s -H "$H" "$BASE/api/v1/me"                                  # role + scopes of this key
curl -s -H "$H" "$BASE/api/v1/docs/tasks?where=business==kidscare&limit=5"
curl -s -H "$H" "$BASE/api/v1/reports/kidscare"                    # L×C×M×F, P&L, in-transit
curl -s -H "$H" "$BASE/api/v1/kb/search?q=offer"
```

Other useful endpoints: `GET/POST /api/v1/docs/:collection`, `GET/PUT/PATCH/DELETE /api/v1/docs/:collection/:id`
(send `If-Match: <version>` to avoid overwriting newer edits), `POST /api/v1/batch`, `GET /api/v1/sync`,
`POST /api/v1/ai/assistant`, `GET /api/v1/me`. Spec: `GET /api/v1/openapi.json` (public); source `src/lib/openapi.ts` —
**update the spec when you add an endpoint**.

Jobs (owner/admin key): `GET /api/jobs`, `POST /api/jobs` with `{ "kind": "sheets_sync", "params": {} }`. Kinds:
`nuport_sync`, `nuport_backfill`, `nuport_recompute`, `nuport_refetch`, `sheets_sync`, `inbox_import`, `backup`,
`growth_weekly`, `competitor_weekly`, `loan_plan`, `learning_nudge`, `health_check`, `social_sync`, `social_ideas`,
`inbox_web_sync`, `social_publish`.

**MCP** (for Claude/other AI connectors): URL `https://os.osmanhadi.live/mcp`, header `Authorization: Bearer <key>`.
Tools: `list_collections`, `get_doc`, `query_docs`, `put_doc`, `patch_doc`, `delete_doc`, `search_knowledge`,
`ask_assistant` (write tools require a write key).

Dashboard routes: `/` home counts · `/app` full legacy dashboard · `/admin` users/API keys/jobs/integrations status ·
`/settings` API & connection health · `/social/kidscare` social media · `/legal/privacy`, `/legal/terms`.

**Key limitations:** API keys are owner/admin-level and are **not** business- or collection-scoped (a write key can
overwrite/delete live docs). Keys are revocable and show `lastUsedAt` in Admin. Prefer read-only; create a write key
only for the current task and revoke it afterwards.

---

## 7. Deploy, branches, and what "live" means

- Auto-deploy: systemd timer `bos-update` runs `deploy/update.sh` every 5 minutes: `git fetch origin claude/nice-wright-ngqxec`,
  hard reset, `docker compose up -d --build`. Migrations run on web container start (`prisma migrate deploy`).
- **A push to `claude/nice-wright-ngqxec` = live in minutes.** Never push there yourself.
- Workflow: `deepseek/<task>` branch → `npm run typecheck && npm test` → PR → Imran/Claude merges → auto-deploy.
- The build container runs `next build`; if the build fails the old container keeps serving.
- **Known deploy gap (unfixed):** there is **no pre-deploy backup/rollback** before migrations. Before a risky
  migration, ask Imran for a fresh `pg_dump` first (nightly backups are at 03:10 Asia/Dhaka, 14 kept).
- On the server, `rm -rf`, `docker volume rm`, DB drop, `git reset --hard`, force-push and SSH changes need Imran's
  explicit permission. Prefer never logging into the server: code + PR + merge is enough.

---

## 8. Where secrets live (and why you will not see them)

| Secret | Where it should be set | How code reads it |
|---|---|---|
| Anthropic, Meta, Nuport, Google Sheets, Supermetrics, Make, YouTube/TikTok OAuth | `.env` or **Admin → Integrations** (encrypted AES-256-GCM) | `await cfg('KEY')` only |
| `AUTH_SECRET`, DB password, `POSTGRES_PASSWORD` | `.env` on the server (and local `.env` for dev) | env only |
| User password hashes / sessions | PostgreSQL (`users`, JWT cookie) | never read |
| OAuth tokens (YouTube/TikTok) | encrypted `app_settings` (`saveSecret`) | `readSecret()` |

Never ask Imran to paste a key, password or token into chat. If a key is needed for a test, he puts it in a local env
file or Admin → Integrations and tells you the **path/where**, not the value. Verify integration health in
**Settings → API o connection** instead of making live third-party calls when possible.

---

## 9. Privacy / data rules

- `inbox_messages` holds customer names, phones, addresses → **do not paste it into an external AI prompt**, do not send
  it anywhere except Meta (Messenger) and Anthropic (for the reply), as the product already does.
- Analytics collections (`web_traffic`, `social_*`, `calls_daily`, `sales_daily`) are aggregates — keep them that way.
- If you need to inspect shapes, use [`fixtures/`](fixtures/) or aggregate counts, not raw customer docs.
- If you (the cloud AI) read PII through the API, remember that prompt/code text may leave Imran's machine. Ask before
  querying `inbox_messages`.

---

## 10. Working agreement (how Imran expects an AI to work)

1. Understand the task; if something is genuinely unclear, ask **one** small question, then proceed.
2. Read the existing code and follow its style, naming and comment density. No refactors nobody asked for.
3. Add tests for new logic (`tests/`), run `npm run typecheck && npm test`.
4. Small commits with clear messages; check `git status` that `.env`/`data/` are not staged.
5. Tell Imran in **Banglish**, step by step, what changed, where, and what he has to click.
6. If you could not verify something (live tokens, prod DB, Meta API), say **"verify kora hoyni"** — never claim
   something works when it was only read in code.
7. Label `FACT` vs `HYPOTHESIS` in analysis.
8. Do not touch `legacy/business-os.html`; do not remove tabs; do not deploy.

---

## 11. Known issues / roadmap (as of 2026-11-01)

**Open, high value:**
- **Deploy/migration safety:** no pre-migration `pg_dump` in `deploy/update.sh` (P1).
- **Backups:** `deploy/setup-vps.sh` creates `backups/` as `chmod 777`, dump files use default permissions and the DB
  password is in `pg_dump` argv; dumps contain PII (P1).
- **Auth hardening:** no login rate limit; `/setup` on a fresh DB is only protected by `ADMIN_EMAIL`; setup race can create
  two owners (P1).
- **InboxPilot "makhna" product lookup** (guide §9): Banglish↔Bangla BM25 mismatch + index pollution + WANTS_LIST list
  dump. Fix design: deterministic normalize/transliteration, clean index, product-first ranking, price grounding.
- **Legacy patch fragility:** patch #19 only matches after patch #14 (order-dependent); a mismatch makes `/app` a 500.
- **Social publishing:** a post can get stuck in `publishing` (claim before token resolution, no try/finally, no stale
  sweep); duplicate-post risk on crash between external post and doc write.
- **Change feed:** `changes()` can advance `since` past a concurrent write; shim applies upserts before deletes (rare).

**Roadmap (from `docs/ORIGINAL_BRIEF.md` §8 and the guide):**
- Native React ports, cheapest first: P&L → Product costing (read-only) → Growth Engine → Sales → Sales Team →
  Attendance → Overview/Tasks/Money. Keep the legacy tab until the native one matches.
- Typed Prisma models for hot collections (tasks, sales_daily, calls_daily, transactions, loans, inbox_messages, leads,
  clients) — not started.
- Sentry/error monitoring — not started.
- Staging environment does not exist yet (see §12) — strongly recommended before write-heavy work.
- User-owned items (do not "fix" yourself): domain move to `easyfounder.si/.site`, Meta/YouTube/TikTok OAuth setup,
  filling InboxPilot products/offers/delivery, rotating old keys, disk cleanup (~81% full at last check).

---

## 12. Staging (recommended before any write-heavy work)

There is no staging stack today. For anything that changes data or is hard to test read-only, ask Imran to either:
1. run a **second Docker Compose project** on the VPS (separate folder, `.env`, `COMPOSE_PROJECT_NAME`, port/domain,
   its own PostgreSQL), restore a recent `pg_dump` into it, and give the AI a *staging* API key; or
2. run the stack locally on the Mac with Docker using a restored dump.

Never point staging/`TEST_DATABASE_URL` at the production database. Production API keys stay out of staging.

---

## 13. Handoff checklist (what to give an AI, what never to give)

Give:
- Repo access (the Mac already has an SSH key at `~/.ssh/id_ed25519` added to Imran's GitHub account; the AI can
  clone/push with it).
- This file + checklist + the repo docs.
- A **read-only** API key (`ai-read`) via a local env file; optionally a short-lived `ai-write` key.
- `TEST_DATABASE_URL` for a throwaway DB (optional but needed for DB tests).

Never give: `.env` values, `AUTH_SECRET`, DB password, integration tokens, server root passwords, customer PII, or
production DB credentials. Do not paste any of those into a chat prompt.

Full step-by-step: [`ai-access-checklist.md`](ai-access-checklist.md).

---

## 14. Quick verification (run these after a deploy)

```bash
curl -sI https://os.osmanhadi.live/app | grep -i location   # expect: location: /login?next=/app
curl -s -o /dev/null -w '%{http_code}\n' https://os.osmanhadi.live/login           # 200
curl -s -H "Authorization: Bearer $EASYFOUNDER_API_KEY" https://os.osmanhadi.live/api/v1/me
```

A deploy is live when those answer from the new code (e.g. the `/app` relative redirect after the 2026-10 fix).
If the site answers 502 briefly, it is rebuilding — wait a minute and retry.
