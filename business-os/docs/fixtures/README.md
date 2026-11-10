# Sanitized sample documents

These JSON files are **synthetic examples**, written from `docs/DATA_MODEL.md` and the code — they contain **no
production, customer or personal data**. They are not loaded by the app or by the tests; they exist so a new AI (or a
human) can see the shape of the most-used documents without touching the live database.

| File | Collection / doc |
|---|---|
| `calls_daily.sample.json` | `calls_daily/<YYYY-MM-DD>` (Sales Team date-wise table) |
| `sales_team-live_calls.sample.json` | `sales_team/live_calls` (the Sales Team "live" doc) |
| `sales_daily.sample.json` | `sales_daily/<YYYY-MM-DD>` (Nuport orders) |
| `pl_kidscare.sample.json` | `pl_kidscare/<YYYY-MM>` (P&L month) |
| `inbox_config.sample.json` | `inbox_config/kidscare` (InboxPilot settings) |

`calls_daily.sample.json` contains two days on purpose: one where the per-rep receive/order was saved
(`2026-10-30`, numbers present) and an older one where only the Mot totals exist (`2026-10-28`, `rcv`/`ord` empty →
the UI shows `—`). That is the difference the Sales Team date-wise table has to handle.

Rules of thumb visible in these files:

- The five rep names (`Lamia`, `Nusrat`, `Shayla`, `Jhumur`, `Maruf`) are the team's fixed ids in the legacy UI.
- A missing per-rep value in `rcv`/`ord`/`otk` means **unknown** (the UI shows `—`), not zero. Never fill it with a made-up
  number; the sync now persists the sheet's per-rep tables into the day's doc (`src/lib/jobs/callDetail.ts`).
- Money fields are BDT integers; `order_tk` is stored as an integer taka amount.
- Dates are `YYYY-MM-DD` in Asia/Dhaka; timestamps (`asof`) are ISO strings.

To see real shapes, ask Imran for a read-only API key and query
`GET /api/v1/docs/<collection>?limit=1` (see `docs/AI_HANDOFF.md`). Do not query `inbox_messages` unless the task
really needs it — it contains customer PII.
