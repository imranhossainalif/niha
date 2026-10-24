// Background worker: `npm run worker` (its own container in docker-compose).
// Schedules are Asia/Dhaka. Keys come from .env or Admin → Integrations and are checked at run time,
// so saving a key in Admin is enough (no restart). AI jobs cost API credits and only run with AI_JOBS=on.
import cron from 'node-cron';
import { drainQueue, runJob } from '../src/lib/jobs/runner';
import { db } from '../src/lib/db';
import { prisma } from '../src/lib/prisma';
import { cfg, envVal, isOn, type ConfigKey } from '../src/lib/config';

const TZ = { timezone: 'Asia/Dhaka' };
// long jobs that pick up where they stopped, so a restart just queues them again
const RESUMABLE = ['nuport_backfill', 'nuport_recompute', 'nuport_refetch', 'inbox_import'];
/** Run `kind` on `expr` when every key in `needs` is set (and `flag`, if given, is on). */
const schedule = (expr: string, kind: string, needs: ConfigKey[] = [], flag?: ConfigKey, params: unknown = {}) => {
  cron.schedule(expr, async () => {
    for (const k of needs) if (!(await cfg(k))) return;
    if (flag && !isOn(await cfg(flag))) return;
    runJob(kind, params).catch((e) => console.error(e));
  }, TZ);
  console.log('[worker] ' + kind.padEnd(18) + expr + (needs.length ? '  (needs ' + needs.join(', ') + ')' : '') + (flag ? '  (if ' + flag + '=on)' : ''));
};

async function main() {
  // jobs cut off by a restart (crash or deploy): mark failed, and queue again the ones that can resume
  const cut = await prisma.job.findMany({ where: { status: { in: ['running', 'claimed'] } } });
  await prisma.job.updateMany({ where: { id: { in: cut.map((j) => j.id) } }, data: { status: 'failed', error: 'Worker restarted', finishedAt: new Date() } });
  for (const j of cut.filter((x) => RESUMABLE.includes(x.kind))) {
    await prisma.job.create({ data: { kind: j.kind, params: j.params as object, createdBy: (j.createdBy || 'system') + ' (resumed)' } });
    console.log('[worker] re-queued', j.kind);
  }

  schedule('50 8,13,20 * * *', 'nuport_sync', ['NUPORT_API_KEY']);
  schedule('55 8,13,20 * * *', 'sheets_sync', ['GOOGLE_SERVICE_ACCOUNT_JSON', 'KC_SHEET_CALL_LIVE']);
  if (!isOn(envVal('BACKUP_DISABLED'))) schedule('10 3 * * *', 'backup');
  schedule('30 6 * * *', 'inbox_web_sync', ['WEBSITE_URL']); // AI re-reads the website every morning
  schedule('17 * * * *', 'health_check'); // API / connection status for Settings (hourly)
  schedule('23 */3 * * *', 'social_sync'); // Facebook/Instagram posts, metrics, followers, competitors
  schedule('35 7 * * 3,6', 'social_ideas', ['ANTHROPIC_API_KEY'], undefined, { business: 'kidscare' }); // AI social plan, Wed + Sat
  // scheduled posts: checked every minute, a job row only when something was due
  cron.schedule('* * * * *', async () => {
    try {
      const n = (await db().collection('social_posts').where('status', '==', 'scheduled').limit(500).get()).filter((s) => String(s.data.scheduled_at || '9') <= new Date().toISOString()).length;
      if (n) await runJob('social_publish');
    } catch (e) { console.error('[worker] social_publish', e); }
  }, TZ);
  schedule('47 11 * * 6', 'growth_weekly', ['ANTHROPIC_API_KEY'], 'AI_JOBS', { business: 'kidscare' });
  schedule('41 9 * * 6', 'competitor_weekly', ['ANTHROPIC_API_KEY'], 'AI_JOBS');
  schedule('5 9 1,20 * *', 'loan_plan', ['ANTHROPIC_API_KEY'], 'AI_JOBS');
  schedule('30 10 * * 5', 'learning_nudge', ['ANTHROPIC_API_KEY'], 'AI_JOBS');

  let busy = false;
  const tick = async () => { if (busy) return; busy = true; try { await drainQueue(); } catch (e) { console.error('[worker] queue', e); } busy = false; };
  setInterval(tick, 5000);
  tick();
  console.log('[worker] started');
}

main().catch((e) => { console.error(e); process.exit(1); });
