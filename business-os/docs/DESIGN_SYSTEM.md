# EasyFounder Design System

One design system for the whole dashboard — native pages, the legacy dashboard
(`/app`) and Social Media. Written 2026-11-06 from three UI/UX articles
(Upslide 12 principles, Nielsen & Molich 10 heuristics, Skins Factory guide),
the ui-ux-pro-max skill, and the perception-first-design framework (PFD v3.6).

## The problem it fixes (FACT, audited 2026-11-06)

- **Three token systems, none shared.** Legacy `:root` vars, native `globals.css`
  + Tailwind config, and `social.css` each had their own copy. Tailwind
  `accent` was orange `#C9661C` while CSS `var(--accent)` was green `#13896F`,
  so `bg-accent` and `btn-primary` disagreed. Settings hardcoded a fourth
  status palette (`#d64545/#d99a1e/#1f9d6b`).
- **Business colors defined twice, with different values.** Native
  `src/lib/business.ts` says kidscare `#C9661C`, lrf `#13896F`; the legacy
  sidebar dots said kidscare `#F2A65A`, lrf `#5FD0A3`. Same business, different
  color depending on the page.
- **KPI tiles shouted.** Six saturated colors with white text — everything was
  bold, so nothing stood out (PFD L1: one dominant weight per screen).
- **System status was buried.** Sync health lived only in Settings, so stale
  data looked fresh. No loading skeletons — first paint was a flash of empty.
- **Navigation overload.** 21 sidebar items + 19 sub-tabs per business (27 for
  LRF), no grouping or favorites.

## Tokens — one source of truth

| Token | Light | Dark | Where |
|---|---|---|---|
| `--bg` / `--panel` / `--soft` | `#F2F5F4` / `#FFFFFF` / `#EAF0EE` | `#0D1412` / `#151F1C` / `#1C2925` | globals.css, redesign.css, social.css |
| `--fg` / `--muted` / `--line` | `#14211E` / `#5C6E69` / `#D7E0DD` | `#E3ECE9` / `#93A6A0` / `#28372F` | same |
| `--accent` | `#13896F` | `#34C08E` | same + tailwind.config.ts |
| `--good` / `--warn` / `--bad` / `--info` | `#0E8A62` / `#B8650E` / `#C2363F` / `#2F6FD1` | `#34C08E` / `#E8973A` / `#EE6B73` / `#6BA4F5` | same |
| `--biz-*` (9 businesses) | see `src/lib/business.ts` BIZ | same | same |

**Rules**

1. **Color means status, never decoration.** Green = good, amber = check, red =
   broken, blue = info. No per-card rainbow.
2. **One accent.** Green `#13896F`. The only primary action on a screen is
   green; everything else is neutral.
3. **Max 2 font families** (+ mono for numbers/code): Bricolage Grotesque
   (display), Figtree (body), JetBrains Mono (numbers). Body 14px, line-height
   1.5. All money/counts use tabular numerals (`.num`).
4. **One spacing scale** (4px base), one radius scale (8/12/14/18px), one
   shadow scale (`--sh1`/`--sh2`). No new radius or shadow values.
5. **Business colors come from `src/lib/business.ts` only.** Never hardcode a
   business hex in a component — use `var(--biz-<id>)` or `b.color`.
6. **Change a token in all four places** (globals.css, redesign.css,
   social.css, tailwind.config.ts) — `tests/design-tokens.test.ts` fails if
   they disagree.

## Layout & IA

- **Structure before surface.** Group by user intent (Sales / P&L / Calls /
  Marketing / Health), not by internal collection names. No internal jargon
  (`sales_daily`, `pl_kidscare`) in the UI — use the owner's Banglish words
  ("Ekhon courier e", "Order", "Delivered").
- **Default view answers one question in 5 seconds:** "business kemon
  cholche?" — max 4–6 KPI cards above the fold (PFD L0: working memory holds
  3–5 chunks). Everything else is one click deeper (tabs, `<details>`,
  slide-out panels), never crammed in.
- **Recognition, not recall (Nielsen #6).** Business name, date range,
  comparison period and data source are pinned on every screen — a number
  always says where it came from ("Kids Care · Nuport · 30 din").
- **System status is always visible (Nielsen #1).** A health strip on the
  home page shows bad/warn counts + last check time. A number with a stale
  source says so next to the number ("Oct P&L = partial export").
- **Tables are built for density.** Sticky headers, right-aligned tabular
  numerals, row hover, user-controlled columns where the table is wide,
  designed empty states — never a bare empty table.

## Components

- **KPI card (`.kpi`)** — calm white card, 3px accent bar on the left, one
  headline number. `.warn` / `.bad` change only the bar color.
- **Card (`.card`)** — white panel, 1px border, `--sh1` shadow, 12px radius.
- **Button (`.btn`)** — 36px min height (44px touch target on coarse
  pointers is the goal for primary actions), `.btn-primary` is the one green
  action. Danger is red text, never a red fill.
- **Badge (`.badge`)** — status is color + text + dot, never color alone.
- **Health strip (`.health-strip`)** — bad/warn tint + counts + link to Settings.
- **Business picker (`.biz`)** — pill with a canonical-color dot.
- **Skeleton (`.skel` / `.sm-skel`)** — shimmer while loading; never a flash
  of empty states.

## States — design every one, not just the happy screen

Default, hover, active, selected, disabled, loading (skeleton), empty (with
guidance + CTA, keep the existing `emptyBox()` pattern), error (plain language
+ what to do next, never a raw code like `(#10)` alone), warning, success,
confirmation. Destructive actions need a confirmation. Every job/publish/save
gives feedback — never leave the user wondering whether it ran.

## Accessibility — baseline, not a feature

Contrast 4.5:1 for text, visible focus rings (never remove them), keyboard
navigation for every action, touch targets ≥44px, `lang` must match the
language actually shown (Banglish copy is currently served as `lang="en"` —
known gap, fix with the copy), reduced-motion respected everywhere.

## Motion

150–300ms, ease-out, one meaning per motion. Enter slower than exit.
`prefers-reduced-motion` turns it off. Never animate width/height; use
transform/opacity.

## What this redesign deliberately did NOT change

- **No legacy JS or data logic.** The legacy file (`legacy/business-os.html`)
  is untouched — the redesign is an override layer
  (`public/legacy/redesign.css`) loaded after it by `legacyDocument()`, so the
  86-patch layer keeps matching exactly once. The 273 inline `style:` props
  and hardcoded hexes inside legacy render code are still there; new code
  must not add more.
- **No navigation restructure yet.** Collapsing 21 sidebar items + 19/27
  sub-tabs into ≤7 grouped sections needs the owner's call on which tabs go
  where — proposed in the PR description, not implemented here.
- **No dark-mode toggle.** Dark mode still follows `prefers-color-scheme` +
  `data-theme`; a visible toggle is a follow-up.
- **No new chart library.** Charts stay hand-rolled D3 (now served locally,
  no CDN).

## How to verify

- `npm run typecheck` — the 35 pre-existing errors on the clean deploy branch
  (Prisma client stub cascade in this sandbox) are unchanged; none in the
  redesigned files.
- `npm test` — full suite, including `tests/design-tokens.test.ts` (token
  agreement across all four token files) and the new home/legacy tests.
- Visual check after merge: home (`/`), Settings, Admin, Social, and `/app`
  (legacy) side by side — one accent, one card style, one status language.
