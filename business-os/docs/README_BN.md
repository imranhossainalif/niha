# Business OS: how to use this with Claude Code

## What's in this folder
- `CLAUDE.md`: the full brief for Claude Code (what to build and how). Claude Code reads it automatically.
- `legacy/business-os.html`: the current dashboard. Claude Code builds from it as the spec.
- `data/`: all of the dashboard's data as of 20 Oct 2026 (tasks, loans, sales, P&L, product costing, knowledge store, and more).
- `scripts/`: the Nuport sync and Google Sheets sync scripts.
- `.env.example`: the list of keys you'll need. Don't put real keys in this file; they go in a `.env` file on your server.

## Steps
1. Make a new private repo on GitHub (for example `business-os`) and upload everything in this folder. Don't upload a `.env` file.
2. Open the repo in Claude Code, then tell it: **"CLAUDE.md porre step 1 theke shuru koro"** ("read CLAUDE.md and start from step 1").
3. Work through it one step at a time. After each step, check that it runs locally, then go to the next.
4. Hosting: a VPS (for example DigitalOcean, Hetzner, or a BD VPS) with Docker. Claude Code will write the deploy instructions.
5. Fill in your keys in `.env` on the server yourself:
   - Anthropic API key
   - Nuport key
   - Meta page token and app secret
6. In the Meta app's webhook settings, change the callback URL to `https://<your-domain>/api/meta/webhook`. After that, Make isn't needed anymore.

## Improving it later
- Open the repo in Claude Code and say what you want changed. CLAUDE.md keeps the context.
- The app has its own API (`/api/v1`), so Claude can read and write data through it, for example from scheduled tasks.

## Note
- Until the new app is fully running, keep using the current dashboard (the artifact). Nothing gets deleted.
