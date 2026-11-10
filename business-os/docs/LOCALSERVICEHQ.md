# LocalServiceHQ business — setup and revenue-flow structure

LocalServiceHQ (localservicehq.com) is now a business inside EasyFounder, using the same agency-style tabs as **Local Revenue Flow** (LRF), with collections and templates adapted to the local-services directory model.

## What changed in the code

| File | Change |
|---|---|
| `src/lib/business.ts` | `localservicehq` added to `BIZ` (name, colour `#16A34A`) |
| `src/lib/legacy/patches.ts` | Legacy UI patches: sidebar item, BIZ entry, agency tab set for `biz:localservicehq`, dynamic `AG_ID`, live hash, default settings row |

Because `AG_ID` now follows the route, every agency tab (Briefing, Growth Engine, Outreach, Pipeline, Proposals, Clients, Delivery, Reports, Payment, Playbook, Proof, Settings …) reads and writes `business: 'localservicehq'` data.

Known limitation: a few legacy cross-links still navigate to `biz:lrf` (they hardcode the LRF id). They are cosmetic jumps; the data itself is separated by `business`.

## Revenue-flow structure (LocalServiceHQ)

```
Traffic (Pinterest / FB / IG / organic)
   ↓
Calculator + cost guide visit
   ↓
Quote request (calculator CTA / guide form)
   ↓
Contractor match (directory + lead routing)
   ↓
Verified Pro / Featured Pro subscription  ← revenue
```

Mapped to CRM tabs:

| CRM tab | What it holds |
|---|---|
| Briefing | MRR, leads, listings, this week's outreach and posts |
| Growth Engine / Funnel | 5-step funnel: traffic → visit → quote → match → subscription |
| Outreach | Contractor outreach log (email, LinkedIn, FB groups, calls) |
| Content | Posts log (Pinterest, Instagram, Facebook) |
| Pipeline | Contractor leads (stage: new → contacted → replied → meeting → proposal → won/lost) |
| Proposals | Packages and fees sent to contractors |
| Clients | Paying contractors (Verified/Featured Pro) |
| Delivery | Onboarding tasks (claim profile, photos, GBP, lead routing) |
| Reports | Client results (leads delivered, cost per lead) |
| Payment | Monthly fees and setup fees |
| Playbook | Offer, SOPs, scripts |
| Proof | Case studies and results |
| Settings | Outreach targets, MRR goal, USD rate |

## Seed data (templates inside the business)

`seed/localservicehq/` contains 40 starter documents across 20 collections:

- **settings** — outreach targets, $3,000 MRR goal, USD rate
- **goals** — MRR, quote requests, claimed listings
- **funnel_steps** — the five-step LocalServiceHQ funnel
- **packages** — Basic Listing (free), Verified Pro ($99/mo), Featured Pro ($299/mo)
- **templates** — contractor cold email, Facebook group reply, LinkedIn DM
- **sops** — weekly content publishing, contractor outreach
- **lead_lists** — US concrete contractors, US roofing contractors
- **leads** — three sample contractor leads (TX, AZ, FL)
- **proposals** — one Featured Pro proposal
- **clients** + **client_payments** — one onboarding client and its setup fee
- **ctasks** — onboarding tasks
- **meetings**, **proofs**, **feedback**, **posts**, **outreach_daily**, **ideas**, **comp_watch**, **playbooks**

## Import into a server

```bash
npm run seed:lsq
# same as: tsx scripts/import_data.ts seed/localservicehq
```

Idempotent: unchanged docs are skipped, changed docs are updated, nothing is deleted.

On production (Docker):

```bash
docker compose exec web npm run seed:lsq
```

## Access

- Sign in as owner, sidebar → **LocalServiceHQ**
- Every agency tab now reads `business: 'localservicehq'`
- Staff access: Admin → Users → assign the LocalServiceHQ business

## Next steps

1. Replace the three sample contractor leads with real ones from the lead lists.
2. Set the actual MRR goal and outreach targets in Settings.
3. Add the first three paying clients once proposals are accepted.
4. Use Proofs to record the first lead-quality result (leads delivered per month).
5. When the Pinterest API is connected, the Posts collection can be updated from `posts`/`social` data automatically.
