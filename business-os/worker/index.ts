// Background worker: `npm run worker` (its own container in docker-compose).
// Schedules are Asia/Dhaka. AI jobs cost API credits and only run with AI_JOBS=on.
import cron from 'node-cron';
import { drainQueue, runJob } from '../src/lib/jobs/runner';
import { prisma } from '../src/lib/prisma';

const TZ = { timezone: 'Asia/Dhaka' };
const on = (v?: string) => /^(1|on|true|yes)$/i.test(v || '');
const schedule = (expr: string, kind: string, params: unknown = {}) => {
  cron.schedule(expr, () => { runJob(kind, params).catch((e) => console.error(e)); }, TZ);
  console.log('[worker] ' + kind.padEnd(18) + expr);
};

async function main() {
  // stale "running"/"claimed" rows from a crash
  await prisma.job.updateMany({ where: { status: { in: ['running', 'claimed'] } }, data: { status: 'failed', error: 'Worker restarted', finishedAt: new Date() } });

  if (process.env.NUPORT_API_KEY) schedule('50 8,13,20 * * *', 'nuport_sync');
  else console.log('[worker] nuport_sync skipped (no NUPORT_API_KEY)');
  if (process.env.GOOGLE_SERVICE_ACCOUNT_JSON && process.env.KC_SHEET_CALL_LIVE) schedule('55 8,13,20 * * *', 'sheets_sync');
  else console.log('[worker] sheets_sync skipped (no GOOGLE_SERVICE_ACCOUNT_JSON / KC_SHEET_*)');
  if (!on(process.env.BACKUP_DISABLED)) schedule('10 3 * * *', 'backup');

  if (on(process.env.AI_JOBS)) {
    schedule('47 11 * * 6', 'growth_weekly', { business: 'kidscare' });
    schedule('41 9 * * 6', 'competitor_weekly');
    schedule('5 9 1,20 * *', 'loan_plan');
    schedule('30 10 * * 5', 'learning_nudge');
  } else console.log('[worker] AI jobs off (set AI_JOBS=on to run growth/competitor/loan/learning jobs here)');

  let busy = false;
  const tick = async () => { if (busy) return; busy = true; try { await drainQueue(); } catch (e) { console.error('[worker] queue', e); } busy = false; };
  setInterval(tick, 5000);
  tick();
  console.log('[worker] started');
}

main().catch((e) => { console.error(e); process.exit(1); });
