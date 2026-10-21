# Business OS

Self-hosted CRM / business operating system for Imran's businesses (Kids Care BD, Insafia, LRF, Itevs, Hajj/Umrah, …).
Next.js + PostgreSQL + a background worker. Everything from the old claude.ai dashboard works here, plus the native
Messenger inbox (InboxPilot), the Nuport and Google Sheets syncs, an API for Claude, and nightly backups.

> **Private data.** `data/` (the export) and `.env` are git-ignored. This repo is public, so keep it that way,
> or make the repo private before committing any data.

## What's where

| Path | What |
|---|---|
| `/` | Home: key numbers + document counts per collection |
| `/app` | The full dashboard (every tab of the legacy file), running on this server |
| `/admin` | Users and roles, API keys, InboxPilot AI on/off, integrations status, background jobs |
| `/api/meta/webhook` | Meta webhook (Messenger) → InboxPilot + AI reply |
| `/api/v1/*` | REST API (Bearer key); spec at `/api/v1/openapi.json` |
| `/mcp` | MCP endpoint (streamable HTTP) for connecting Claude to the live app |

Roles: **owner** (everything + API keys), **admin** (everything, can add staff), **staff** (only their assigned businesses;
no Money/loans unless assigned to `personal`).

## Run on a VPS with Docker (recommended)

1. A VPS (Hetzner, DigitalOcean, or a BD VPS) with Docker installed and a domain whose A record points at it.
2. Copy this folder to the server (e.g. `git clone`), then:
   ```bash
   cp .env.example .env        # fill in: DOMAIN, POSTGRES_PASSWORD, AUTH_SECRET (openssl rand -base64 32), keys
   mkdir -p data backups       # put the export here: data/<collection>/<id>.json
   docker compose up -d --build
   docker compose exec web npm run db:import      # load data/ (safe to re-run: unchanged docs are skipped)
   ```
3. Open `https://<DOMAIN>/setup` and create the owner account (only `ADMIN_EMAIL` is allowed, only once).
4. Meta app → Webhooks: callback URL `https://<DOMAIN>/api/meta/webhook`, verify token = `META_VERIFY_TOKEN`,
   subscribe the page to `messages`. Then Make isn't needed for the inbox anymore.
5. In `/admin`, turn **AI auto-reply** on when ready (it starts **off**). Use *Messenger import* to pull the last 30 days.

Update later: `git pull && docker compose up -d --build` (migrations run on start).
Backups: the worker writes `backups/business_os-YYYY-MM-DD.sql.gz` every night at 03:10 (keeps 14). Restore:
`gunzip -c backups/<file>.sql.gz | docker compose exec -T postgres psql -U bos business_os`.

## Run on a plain Node host (no Docker)

Needs Node 22, PostgreSQL 16, and for the worker: `python3` with `openpyxl` (Sheets sync) and `pg_dump` (backups).

```bash
npm ci
cp .env.example .env            # set DATABASE_URL yourself here
npx prisma migrate deploy
npm run db:import               # loads ./data
npm run build
npm start                       # web on :3000 (put nginx/Caddy in front for HTTPS)
npm run worker                  # second process (systemd / pm2)
```
Create the owner at `/setup`, or from the shell: `npm run user:create -- you@example.com 'long-password' owner`.

## Integrations

Keys can go in `.env` **or** in `/admin` → Integrations (owner only, stored encrypted; `.env` wins). Saved keys work
within 30 seconds, no restart.

**Sales-team sheets (recommended way):** paste `deploy/sheets-push.gs` into https://script.google.com in the Google
account that owns the sheets, put an owner API key in it, run `setup` once. It pushes the sheets every 30 minutes.

**Auto-update:** after a GitHub deploy key is on the server, `bash deploy/enable-auto-update.sh` installs a timer that
pulls the deploy branch every 5 minutes and rebuilds when it changed.

| Feature | Needs | Schedule |
|---|---|---|
| InboxPilot AI replies | `ANTHROPIC_API_KEY`, `META_PAGE_TOKEN`, `META_APP_SECRET` | on every message |
| Nuport → `sales_daily` | `NUPORT_API_KEY`; first run also `NUPORT_START_SO` | 08:50, 13:50, 20:50 Dhaka |
| Sales-team Sheets → `calls_daily`, `sales_team/*` | `GOOGLE_SERVICE_ACCOUNT_JSON`, `KC_SHEET_*` (share the sheets with the service account) | 08:55, 13:55, 20:55 |
| FB ad / page data in the dashboard | `SUPERMETRICS_API_KEY` | live |
| Weekly growth plan, competitor research, loan plan, learning nudge | `ANTHROPIC_API_KEY`, `AI_JOBS=on` | Sat 11:47, Sat 09:41, 1st & 20th, Fri |

Any job can also be started from `/admin` → Background jobs.

## Using the API (Claude scheduled tasks, scripts)

Owner creates a key in `/admin` (read, or read+write). Examples:

```bash
K=bos_...
curl -H "Authorization: Bearer $K" "https://<DOMAIN>/api/v1/docs/tasks?where=business==kidscare&where=done==false&limit=50"
curl -H "Authorization: Bearer $K" -X PATCH -H 'content-type: application/json' \
     -d '{"done":true,"status":"complete"}' "https://<DOMAIN>/api/v1/docs/tasks/<id>"
curl -H "Authorization: Bearer $K" "https://<DOMAIN>/api/v1/reports/kidscare"        # L×C×M×F, P&L, in-transit
curl -H "Authorization: Bearer $K" -X POST -H 'content-type: application/json' \
     -d '{"business":"kidscare","message":"Ei shoptaher top 5 kaj?"}' "https://<DOMAIN>/api/v1/ai/assistant"
```
Writes can send `If-Match: <version>` to avoid overwriting a newer change (409 if it moved).
To connect Claude as a connector, add a custom MCP server: URL `https://<DOMAIN>/mcp`, header `Authorization: Bearer <key>`.

## Development

```bash
npm run dev                      # needs DATABASE_URL in .env
npm test                         # unit tests
TEST_DATABASE_URL=postgresql://…/business_os_test npm test   # + DB/integration tests (use a throwaway DB!)
npm run typecheck
```
See `CLAUDE.md` for the architecture and how to extend it.
