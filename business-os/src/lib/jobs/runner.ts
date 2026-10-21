// Job registry + queue. The worker runs scheduled jobs and anything queued in the `jobs` table
// (from Admin, POST /api/inbox/import, or the API).
import { prisma } from '../prisma';
import { importHistory } from '../inbox/process';
import { nuportBackfill, nuportRecompute, nuportSync } from './nuport';
import { sheetsSync } from './sheets';
import { backup } from './backup';
import { competitorWeekly, growthWeekly, learningNudge, loanPlan } from './ai_jobs';

export const JOBS: Record<string, (params: any) => Promise<unknown>> = {
  nuport_sync: () => nuportSync(),
  nuport_backfill: (p) => nuportBackfill({ fromDate: String(p?.from_date || '') }),
  nuport_recompute: (p) => nuportRecompute({ fromDate: String(p?.from_date || '') }),
  sheets_sync: () => sheetsSync(),
  inbox_import: (p) => importHistory(Number(p?.days) || 30),
  backup: () => backup(),
  growth_weekly: (p) => growthWeekly(p?.business || 'kidscare'),
  competitor_weekly: () => competitorWeekly(),
  loan_plan: () => loanPlan(),
  learning_nudge: () => learningNudge(),
};

const running = new Set<string>();

/** Run a job now, recording it in the jobs table. One job of a kind at a time. */
export async function runJob(kind: string, params: unknown = {}, existingId?: string) {
  const fn = JOBS[kind];
  if (!fn) throw new Error('Unknown job ' + kind);
  const id = existingId ?? (await prisma.job.create({ data: { kind, params: params as object, createdBy: 'schedule' } })).id;
  if (running.has(kind)) {
    await prisma.job.update({ where: { id }, data: { status: 'failed', error: 'Already running', finishedAt: new Date() } });
    return;
  }
  running.add(kind);
  await prisma.job.update({ where: { id }, data: { status: 'running', startedAt: new Date() } });
  const t0 = Date.now();
  try {
    const result = await fn(params);
    await prisma.job.update({ where: { id }, data: { status: 'done', result: (result ?? {}) as object, finishedAt: new Date() } });
    console.log(`[job] ${kind} done in ${Math.round((Date.now() - t0) / 1000)}s`, JSON.stringify(result).slice(0, 300));
  } catch (e) {
    const msg = (e as Error).message?.slice(0, 2000) || String(e);
    await prisma.job.update({ where: { id }, data: { status: 'failed', error: msg, finishedAt: new Date() } });
    console.error(`[job] ${kind} failed:`, msg);
  } finally {
    running.delete(kind);
  }
}

/** Pick up queued jobs (claimed atomically so two workers never run the same one). */
export async function drainQueue() {
  for (;;) {
    const rows = await prisma.$queryRaw<{ id: string; kind: string; params: unknown }[]>`
      UPDATE jobs SET status = 'claimed' WHERE id = (SELECT id FROM jobs WHERE status = 'queued' ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED)
      RETURNING id, kind, params`;
    if (!rows[0]) return;
    await runJob(rows[0].kind, rows[0].params, rows[0].id).catch((e) => console.error('[job]', e));
  }
}
