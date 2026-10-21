// Sales-team Google Sheets → calls_daily + sales_team/*. All parsing rules live in scripts/kc_sync.py (run unchanged).
// Two ways in:
//  - push: the Google Apps Script (deploy/sheets-push.gs) uploads the sheets to POST /api/integrations/sheets
//  - pull: the worker downloads them with a service account (GOOGLE_SERVICE_ACCOUNT_JSON + KC_SHEET_*)
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { db } from '../db';
import { cfg } from '../config';
import { downloadSheet } from '../google';

export type SheetFiles = { callLiveCsv: Buffer; upsalesXlsx: Buffer; dailyXlsx: Buffer; v6Xlsx?: Buffer; upsOldXlsx?: Buffer };

function run(cmd: string, args: string[]): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { env: process.env });
    let out = '', errOut = '';
    p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (errOut += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(cmd + ' exited ' + code + ': ' + errOut.slice(-1500)))));
  });
}

/** Run kc_sync.py on the given sheet exports and write its docs. */
export async function runKcSync(files: SheetFiles) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kcsync-'));
  try {
    const f = (n: string) => path.join(dir, n);
    await fs.writeFile(f('call_live.csv'), files.callLiveCsv);
    await fs.writeFile(f('upsales.xlsx'), files.upsalesXlsx);
    await fs.writeFile(f('daily.xlsx'), files.dailyXlsx);
    const args = [path.join(process.cwd(), 'scripts', 'kc_sync.py'), f('call_live.csv'), f('upsales.xlsx'), f('daily.xlsx'), f('out')];
    if (files.v6Xlsx && files.upsOldXlsx) {
      await fs.writeFile(f('v6.xlsx'), files.v6Xlsx);
      await fs.writeFile(f('ups_old.xlsx'), files.upsOldXlsx);
      // existing calls_daily, so older days keep their v7 numbers
      await fs.mkdir(f('existing'));
      for (const s of await db().collection('calls_daily').limit(5000).get()) await fs.writeFile(path.join(f('existing'), s.id + '.json'), JSON.stringify(s.data));
      args.push(f('v6.xlsx'), f('ups_old.xlsx'), f('existing'));
    }
    await run(process.env.PYTHON || 'python3', ['-I', ...args]);
    const writes: { collection: string; doc_id: string; data: Record<string, unknown> }[] = JSON.parse(await fs.readFile(f('out/writes.json'), 'utf8'));
    const store = db();
    let n = 0;
    for (const w of writes) {
      if (!['calls_daily', 'sales_team'].includes(w.collection)) continue; // the script only ever writes these
      await store.collection(w.collection).doc(w.doc_id).set(w.data);
      n++;
    }
    const today = writes.find((w) => w.doc_id === 'live_calls')?.data?.today as { name: string; calls?: number }[] | undefined;
    return { docs: n, today_calls: today?.find((r) => r.name === 'Total')?.calls ?? null };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

/** Pull mode (worker): download with the service account. */
export async function sheetsSync() {
  const [call, gid, ups, daily, v6, old] = await Promise.all(['KC_SHEET_CALL_LIVE', 'KC_SHEET_CALL_LIVE_GID', 'KC_SHEET_UPSALES', 'KC_SHEET_DAILY', 'KC_SHEET_V6', 'KC_SHEET_UPS_OLD'].map((k) => cfg(k as never)));
  if (!call || !ups || !daily) throw new Error('Set the KC_SHEET_* sheet ids in Admin → Integrations (or use the Apps Script push)');
  return runKcSync({
    callLiveCsv: await downloadSheet(call, 'csv', gid),
    upsalesXlsx: await downloadSheet(ups, 'xlsx'),
    dailyXlsx: await downloadSheet(daily, 'xlsx'),
    ...(v6 && old ? { v6Xlsx: await downloadSheet(v6, 'xlsx'), upsOldXlsx: await downloadSheet(old, 'xlsx') } : {}),
  });
}
