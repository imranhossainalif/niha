# AI access checklist — how to give an AI access without leaking secrets

Companion to [`AI_HANDOFF.md`](AI_HANDOFF.md). This is the "who clicks what" list for Imran. Boxes are meant to be
ticked per AI/session.

**Golden rule:** the AI never receives a secret in a chat message, a commit, a screenshot or a document. Secrets are put
in a **local env file** or in **Admin → Integrations**, and the AI only learns the **path/location**.

---

## Level 0 — what the AI needs at minimum

- [ ] Repo/code access (see Level 1) — this alone covers reading code, running tests, writing the fix.
- [ ] The docs: `CLAUDE.md`, `docs/ORIGINAL_BRIEF.md`, `docs/DATA_MODEL.md`, `docs/DEEPSEEK_GUIDE.md`,
      `docs/AI_HANDOFF.md` (already in the repo).

Without an API key the AI can still work on code and give Imran commands to run. Add Level 2 only for live data work.

---

## Level 1 — code access (repo)

**Already done on the Mac:** an SSH key exists at `~/.ssh/id_ed25519` and is added to the GitHub account
(`imranhossainalif`). The repo remote is `git@github.com:imranhossainalif/niha.git`, so the AI can clone/push even when
the repo is private.

- [ ] Check: `ssh -T git@github.com` → `Hi imranhossainalif! You've successfully authenticated`.
- [ ] Workflow: create `deepseek/<task>` branch → `npm run typecheck && npm test` → push → PR.
- [ ] **Never** push to `claude/nice-wright-ngqxec` (deploy branch = live within ~5 min). The human merges.

If the repo is made **private** and the VPS must keep auto-deploying, add a **read-only deploy key** to the repo and use
it on the server (do this *before* flipping visibility):

- [ ] VPS: `ssh-keygen -t ed25519 -C "niha-deploy" -f /root/.ssh/niha_deploy -N ""`, then `cat /root/.ssh/niha_deploy.pub`.
- [ ] GitHub → repo → Settings → Deploy keys → Add deploy key (read-only).
- [ ] VPS: `cd /opt/business-os && git remote set-url origin git@github.com:imranhossainalif/niha.git`, add an
      `~/.ssh/config` entry `Host github.com / IdentityFile /root/.ssh/niha_deploy / IdentitiesOnly yes`,
      then `git fetch origin claude/nice-wright-ngqxec` must succeed.
- [ ] Only then: Settings → General → Danger Zone → Change visibility → private; verify `bos-update` timer still deploys.

---

## Level 2 — live app API key (dashboard data + actions)

This is how an AI works on the live dashboard without a browser session.

- [ ] Log in as owner (`/login`) → open **Admin** (`/admin`).
- [ ] Section **API keys (Claude / automation)** → create key **`ai-read`**, leave the "write" checkbox **off**.
- [ ] Copy the `bos_...` key **immediately** (shown once) into the env file below. Never paste it into chat.
- [ ] Later, only if the task needs changes: create a second key **`ai-write`** (write checkbox on), use it, revoke it
      after the session.
- [ ] Review `lastUsedAt` in Admin → API keys after each session; revoke keys that are no longer needed.

**Scopes:** a key is `read` or `read+write`; it acts as its owner (owner sees everything, staff sees assigned
businesses). Keys are **not** business/collection-scoped — treat a write key as "can edit/delete live docs".

### Env file (never commit this file, never paste into chat)

```bash
mkdir -p ~/.config/easyfounder && chmod 700 ~/.config/easyfounder
# write it yourself (chat e na):
printf 'EASYFOUNDER_API_KEY=bos_...\n' > ~/.config/easyfounder/ai.env
chmod 600 ~/.config/easyfounder/ai.env
```

The AI loads it in its own shell:

```bash
set -a; . ~/.config/easyfounder/ai.env; set +a
curl -s -H "Authorization: Bearer $EASYFOUNDER_API_KEY" https://os.osmanhadi.live/api/v1/me
```

Expected `/api/v1/me`: `{"id":"...","email":"...","role":"owner","businesses":[...],"scopes":["read"]}` —
`scopes:["read"]` for the read key, `["read","write"]` for the write key.

### Verify read access (safe)

```bash
BASE=https://os.osmanhadi.live
H="Authorization: Bearer $EASYFOUNDER_API_KEY"
curl -s -H "$H" "$BASE/api/v1/docs/tasks?limit=1"
curl -s -H "$H" "$BASE/api/v1/reports/kidscare"
curl -s -H "$H" "$BASE/api/jobs?limit=1"        # owner/admin only
```

### Verify write access (do this only with the write key, and clean up)

Pick a collection that is not part of the business data, create one doc, then delete it:

```bash
curl -s -X POST -H "$H" -H 'content-type: application/json' \
  -d '{"note":"ai access check"}' "$BASE/api/v1/docs/ai_scratch/access-check"
curl -s -X DELETE -H "$H" "$BASE/api/v1/docs/ai_scratch/access-check"
```

If that fails with 403, the key is read-only (as intended for `ai-read`).

### MCP (only if the AI tool supports connectors)

- [ ] URL `https://os.osmanhadi.live/mcp`, header `Authorization: Bearer <same key>`.
- [ ] Read tools work with a read key; `put_doc`/`patch_doc`/`delete_doc`/`ask_assistant` need a write key.

---

## Level 3 — test database (needed for DB/integration tests)

- [ ] Option A (local Mac): Docker Postgres on a spare port, e.g.
      `docker run --rm -e POSTGRES_PASSWORD=test -p 55432:5432 postgres:16-alpine`, then
      `TEST_DATABASE_URL=postgresql://postgres:test@localhost:55432/postgres npm test`.
- [ ] Option B (VPS): a **separate** `business_os_test` database, never the production one.
- [ ] Put it in the same env file: `TEST_DATABASE_URL=...`; the AI runs DB tests with it.
- [ ] **Never** set `TEST_DATABASE_URL` to the production database — those tests delete rows.

---

## Level 4 (optional, not recommended) — VPS SSH

Only for deploy debugging/logs. Prefer "no server access": merge → auto-deploy already covers normal work.

If it is truly needed:
- [ ] Add an SSH key for a dedicated user (not the root password), keep the key on the Mac, never in chat.
- [ ] The AI must ask permission before: `rm -rf`, `docker volume rm`, DB drop, `git reset --hard`, force-push,
      service restarts during business hours, `.env` edits.
- [ ] Logs: `journalctl -u bos-update -n 50 --no-pager`, `docker compose logs -n 100 web worker`.
- [ ] Before risky migrations: `pg_dump` first (there is no automatic pre-deploy backup).

---

## Never hand over (any level)

- [ ] `.env` contents, `AUTH_SECRET`, `POSTGRES_PASSWORD`, `DATABASE_URL` with password
- [ ] Anthropic / Meta / Nuport / Google Sheets / Supermetrics / Make / YouTube / TikTok tokens or app secrets
- [ ] Server root password / private SSH keys in chat
- [ ] Customer PII (`inbox_messages`: names, phones, addresses)
- [ ] Production database credentials for tests/staging
- [ ] Screenshots of InboxPilot chats (they contain customer data)

If a secret is accidentally pasted into a chat or committed: **rotate it**, revoke the API key / token, and check
`git log -p` for the value before assuming it is gone.

---

## After each AI session

- [ ] Revoke the `ai-write` key (Admin → API keys) if one was created.
- [ ] Check `lastUsedAt` on the keys that remain.
- [ ] `git status` in the repo: `.env`, `data/`, `backups/` must not appear.
- [ ] Confirm the PR was merged by a human, not pushed straight to the deploy branch.
- [ ] If an integration key was rotated, update Admin → Integrations and note "needs restart? no — keys are read at run time".
