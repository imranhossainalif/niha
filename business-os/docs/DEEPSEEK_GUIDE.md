# EasyFounder — DeepSeek (ba onno AI coding tool) er jonno guide

Ei file ta AI ke dao **prothom message e**. Ete project ta ki, kivabe chalate hoy, ki korte hobe na — shob ache.
Ekta kotha: tumi (AI) code likhbe, kintu **live server e kono push/deploy nijer iccha moto korbe na**. Niche "Deploy niyom" dekho.

---

## 1. Project ki

**EasyFounder** = Imran Hossain Alif (Bangladesh) er self-hosted business dashboard.
Duita business: **Kids Care BD** (baby food) ar **LRF**. Live: https://os.osmanhadi.live
Repo: `imranhossainalif/niha`, code ache `business-os/` folder e.

Stack: Next.js 15 (App Router) · TypeScript · PostgreSQL 16 + Prisma 6 · Auth.js v5 · Tailwind · `worker/` (node-cron) ·
`@anthropic-ai/sdk` (inbox AI, server-side) · Docker Compose (web, worker, postgres, caddy).

**Bhasha:** UI Banglish (Roman akkhor e Bangla). Customer ke Messenger reply **Bangla script e**, shobai ke "আপু".
User (Imran) Banglish e likhe — tumi Banglish e uttor dao, step-by-step, kon button e click korte hobe shoho.

## 2. Aage ei file gulo poro (ei order e)

1. `business-os/CLAUDE.md` — architecture er shobcheye updated nôte (eta ei project er "main guide")
2. `business-os/docs/ORIGINAL_BRIEF.md` — mul brief, product rules
3. `business-os/docs/DATA_MODEL.md` — collection / field list
4. Je tab/feature e kaj korbe, tar file (niche "Kothay ki ache")

## 3. Non-negotiable niyom (kokhono bhangbe na)

- **Kono tab ba option remove korbe na.** Notun jinish add koro, purono ta rekhe.
- **`data/` ar `.env` kokhono git e jabe na.** Repo **public**.
- **Kono secret/API key/password code e, chat e, commit e likhbe na.** User ke chat e key paste korte bolbe na;
  Settings/Admin → Integrations e boshate bolo (encrypted save hoy). Env/config pora **sudhu `await cfg('KEY')`** diye.
- Analysis text e **FACT** (data theke) ar **HYPOTHESIS** (anuman) alada label koro. CPM/CTR/sales er guarantee dibe na.
- Kids Care = baby food: **kono health/cure/weight-gain dabi nai. Dam ba offer banano jabe na** (sudhu knowledge/shop data theke).
- Lottery/draw offer = Ministry of Commerce er permission lage (BD Digital Commerce Guidelines 2021, 3.1.8) — permission chhara banabe na.
- Analytics collection e **sudhu aggregate** (customer er nam/phone na). Customer data sudhu `inbox_messages` e (role-restricted).
- Date logic **Asia/Dhaka** (`src/lib/time.ts`: `bdDate`, `bdToday`).

## 4. Kothay ki ache (`business-os/` er vitore)

| Jinish | File / folder |
|---|---|
| Data layer (ekta `docs` table) | `src/lib/db.ts` — shobsomoy `db(principal)` diye, raw SQL na |
| Access / role (owner, admin, staff) | `src/lib/access.ts`, `src/lib/business.ts` |
| Config / integration keys | `src/lib/config.ts` (`cfg('KEY')`) |
| Purono dashboard UI (shob tab) | `legacy/business-os.html` (**disk e unmodified**) + `public/legacy/bos-shim.js` + patch gulo `src/lib/legacy/patches.ts` |
| Legacy tab er extra code | `src/lib/legacy/*.ts` (jemon `salesLive.ts` = Sales Team, `attendance.ts` = Attendance) |
| InboxPilot (Messenger AI reply) | `src/lib/inbox/*` — `ai.ts` (prompt), `context.ts` (kon knowledge dibe), `products.ts` (shop catalogue), `process.ts`, `format.ts`, `web.ts`, `files.ts`, `learn.ts` |
| Social Media tab (Publer-er moto) | `src/lib/social/*`, `src/components/social/*`, `src/app/social/[business]/page.tsx`, `src/app/api/social/**` |
| Settings → API o connection health | `src/lib/health.ts`, `src/app/settings/page.tsx` |
| Admin | `src/app/admin/page.tsx` |
| Worker / scheduled jobs | `worker/index.ts`, `src/lib/jobs/runner.ts`, `src/lib/jobs/social.ts` |
| Sheets sync (Python) | `scripts/kc_sync.py` (calls_daily, sales_team, staff) |
| API spec | `src/lib/openapi.ts` — **notun endpoint dile ekhane update + version bump koro** |
| Tests | `tests/*.test.ts` |
| Deploy | `deploy/update.sh`, `deploy/setup-vps.sh`, `docker-compose.yml`, `Caddyfile` |

### Legacy UI er gotcha (khub important)
Purono tab gulo ekta boro HTML file (`legacy/business-os.html`). Seta **direct edit kora hoy na**.
Bodole `src/lib/legacy/patches.ts` e `{find, replace}` pair dewa hoy:
- `find` text ta HTML e **thik ekbar** match korte hobe (zero ba 2 bar hole test fail).
- `replace` er moddhe je text ta test check kore seta thakte hobe.
- Notun legacy code `String.raw` template string module e likho (jemon `salesLive.ts`). Backtick ba `${` er shabdhan.

## 5. Local e chalano ar test

```bash
cd business-os
npm install
npm run typecheck
# DB test er jonno ekta throwaway Postgres lagbe (production DB kokhono na!)
TEST_DATABASE_URL="postgresql://postgres@localhost:5433/business_os_test?host=/tmp" npm test
```
DB test row likhe/muche — **TEST_DATABASE_URL e kokhono live database diba na.**
Push er aage `npm run typecheck && npm test` duita-i pass korte hobe. (Ekhon 105 ti test pass kore.)

## 6. Deploy niyom (shobcheye jhunkir jinish)

- Production VPS (`/opt/business-os`) **prottek 5 minute e** branch `claude/nice-wright-ngqxec` theke auto pull kore rebuild kore.
  **Oi branch e push = live.** Tai:
  1. **Notun branch e kaj koro** (jemon `deepseek/<kaj-er-nam>`). Oi branch e push korle live e jay na.
  2. Test pass na hole push korbe na.
  3. Merge ta Imran ba Claude review kore korbe. Nijer iccha moto `claude/nice-wright-ngqxec` e merge/push korbe na.
- Server e SSH korle: `rm -rf`, `docker volume rm`, DB drop, `git reset --hard`, force-push — **kono ta-i user er onumoti chhara na.**
- DB schema/data migration e age backup (`pg_dump`) ache kina dekho.

## 7. Kaj korar poddhoti

1. Kaj bujhe nao; na bujhle **ekta** choto proshno koro.
2. Code porar por change koro; ager code er style, naming, comment density maniye likho. Dorkar chhara refactor na.
3. Notun logic er jonno test lekho (`tests/` er moto kore).
4. `npm run typecheck && npm test` chalao.
5. Chhoto commit, bhalo message. `.env`/`data/` add hoyeche kina `git status` e dekho.
6. User ke Banglish e bolo: ki change holo, kothay, user ke ki korte hobe (kon page → kon button).
7. Je jinish verify korte parso na (jemon Meta/TikTok live token), seta **"verify kora hoyni"** bolo — jhut e "kaj kore" bolo na.

## 8. Ekhono baki / user er hat e ache (ei gulo nijer theke "fix" korte jabe na)

- Domain `easyfounder.si` (ba .site) kena + DNS move
- Meta Social token, Facebook/Instagram connect, App Review (pages_messaging Advanced access) + Publish
- YouTube ar TikTok OAuth setup (Social → Accounts tab e guide ache)
- InboxPilot Delivery / Products / Offers table puron, second website link (`WEBSITE_URL_2`)
- Purono "sheets" API key ar server root password rotate
- Disk ~81% full (cleanup er jonno user er onumoti lage)
- Make.com er purono duita scenario (import / team reply) — ekhon unused, bondho korbe kina user bolbe

## 9. Chalu kaj / jana bug

- **Messenger AI "makhna" (মাখনা) product:** "makhna er dam koto" er uttor deye na. Karon: (a) keyword-expansion step
  (`searchKeywords` in `src/lib/inbox/context.ts`) kokhono khali ferot dey; (b) `WANTS_LIST` regex (`src/lib/inbox/products.ts`)
  "ki ki" dekhle 25 ta shob product dhele dey; (c) Banglish "makhna" ar Bangla "মাখনা" BM25 e milay na.
  Fix idea: Banglish↔Bangla transliteration match, `WANTS_LIST` tight kora, mil thaka product age.
- **Sales Team din-wise table:** purono din e per-rep receive/order sheet e nai → ekhon `—` dekhay (fix kora hoyeche).

## 10. DeepSeek er sathe connect korar upay

DeepSeek er API **OpenAI-compatible** (`https://api.deepseek.com`); keu keu Anthropic-style endpoint-o dey (DeepSeek er docs e check koro — ei URL/model naam bodlay).
API key nao: https://platform.deepseek.com → API keys. **Key kokhono chat/repo e dibe na** — nijer computer er environment variable e rakho.

| Upay | Kothay lage | Bhalo dik |
|---|---|---|
| **Claude Code CLI + DeepSeek** | DeepSeek er Anthropic-compatible endpoint thakle `ANTHROPIC_BASE_URL` + `ANTHROPIC_AUTH_TOKEN` + model naam env var e dao | Ei repo er `CLAUDE.md` sorasori pore, file edit/test shob kore |
| **Aider** (`pip install aider-chat`) | `export DEEPSEEK_API_KEY=...` tarpor `aider --model deepseek/deepseek-chat` | Sohoj, git e commit kore, repo map ache |
| **Cline / Roo Code (VS Code)** | Provider = DeepSeek, key boshao | VS Code e chat + file edit + terminal |
| **OpenCode / Continue** | Config e OpenAI-compatible provider, base URL + key | Terminal / IDE |

Prothom session e ei prompt dao (copy-paste):

> Tumi EasyFounder project e kaj korbe. Age `business-os/CLAUDE.md` ar `business-os/docs/DEEPSEEK_GUIDE.md` pura poro, tarpor `docs/ORIGINAL_BRIEF.md`.
> Niyom: notun branch e kaj, `claude/nice-wright-ngqxec` e push na, secret kokhono na, kono tab remove na, `npm run typecheck && npm test` pass korte hobe.
> User Banglish e likhe, tumi Banglish e uttor dao. Prothome bolo tumi ki bujhecho ar ki korbe, tarpor kaj shuru koro.

> **Shotorkota:** DeepSeek diye kaj korale code/prompt tader server e jay. Customer er nam/phone ba kono secret code ba prompt e dibe na.
> DeepSeek model ei repo er ager style/test bujhe na-o pare — tai prottek change **diff dekhe + test pass hole tobei** merge koro, ar boro change ekta Claude-ke diye review koriye nao.
