import { handle, json } from '@/lib/http';
import { needPrincipal } from '@/lib/apiutil';
import { isFull } from '@/lib/access';
import { cfg } from '@/lib/config';
import { prisma } from '@/lib/prisma';
import { runKcSync } from '@/lib/jobs/sheets';

export const runtime = 'nodejs';
export const maxDuration = 300;

/**
 * Push from the Google Apps Script (deploy/sheets-push.gs): multipart form with
 * call_live (CSV of the Live_Dashboard tab), upsales, daily, and optionally v6, ups_old (XLSX exports).
 * Runs kc_sync.py and writes calls_daily + sales_team/*. Owner/admin API key with write scope.
 */
export const POST = handle(async (req: Request) => {
  const p = await needPrincipal(req, 'write');
  if (!isFull(p)) throw Object.assign(new Error('Owner/admin key required'), { status: 403, code: 'permission_denied' });
  if ((await cfg('SHEETS_PUSH_ENABLED'))?.match(/^(0|off|false|no)$/i)) throw Object.assign(new Error('Sheets push is turned off in Admin'), { status: 403, code: 'disabled' });
  const fd = await req.formData();
  const buf = async (k: string) => { const f = fd.get(k); return f && typeof f !== 'string' ? Buffer.from(await f.arrayBuffer()) : undefined; };
  const [callLiveCsv, upsalesXlsx, dailyXlsx, v6Xlsx, upsOldXlsx] = await Promise.all(['call_live', 'upsales', 'daily', 'v6', 'ups_old'].map(buf));
  if (!callLiveCsv || !upsalesXlsx || !dailyXlsx) throw Object.assign(new Error('call_live, upsales and daily are required'), { status: 400, code: 'bad_request' });
  const job = await prisma.job.create({ data: { kind: 'sheets_push', status: 'running', startedAt: new Date(), createdBy: p.kind === 'user' ? p.email : 'system' } });
  try {
    const result = await runKcSync({ callLiveCsv, upsalesXlsx, dailyXlsx, v6Xlsx, upsOldXlsx });
    await prisma.job.update({ where: { id: job.id }, data: { status: 'done', result, finishedAt: new Date() } });
    return json({ ok: true, ...result });
  } catch (e) {
    await prisma.job.update({ where: { id: job.id }, data: { status: 'failed', error: (e as Error).message.slice(0, 2000), finishedAt: new Date() } });
    throw Object.assign(new Error((e as Error).message.slice(0, 500)), { status: 500, code: 'sync_failed' });
  }
});
