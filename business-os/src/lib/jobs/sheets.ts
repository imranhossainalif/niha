// Sales-team Google Sheets → calls_daily + sales_team/*. Downloads the sheets with the service account and runs
// scripts/kc_sync.py unchanged (it holds all the parsing rules), then writes its output.
// Sheet ids come from .env (KC_SHEET_*), since they are not in the script.
import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { db } from '../db';
import { downloadSheet } from '../google';

function run(cmd: string, args: string[], env: Record<string, string>): Promise<string> {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args, { env: { ...process.env, ...env } });
    let out = '', errOut = '';
    p.stdout.on('data', (d) => (out += d)); p.stderr.on('data', (d) => (errOut += d));
    p.on('error', reject);
    p.on('close', (code) => (code === 0 ? resolve(out) : reject(new Error(cmd + ' exited ' + code + ': ' + errOut.slice(-1500)))));
  });
}

export async function sheetsSync() {
  const E = process.env;
  const need = ['KC_SHEET_CALL_LIVE', 'KC_SHEET_UPSALES', 'KC_SHEET_DAILY'];
  const missing = need.filter((k) => !E[k]);
  if (missing.length) throw new Error('Set ' + missing.join(', ') + ' in .env (Google Sheet ids)');
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), 'kcsync-'));
  try {
    const f = (n: string) => path.join(dir, n);
    await fs.writeFile(f('call_live.csv'), await downloadSheet(E.KC_SHEET_CALL_LIVE!, 'csv', E.KC_SHEET_CALL_LIVE_GID));
    await fs.writeFile(f('upsales.xlsx'), await downloadSheet(E.KC_SHEET_UPSALES!, 'xlsx'));
    await fs.writeFile(f('daily.xlsx'), await downloadSheet(E.KC_SHEET_DAILY!, 'xlsx'));
    const args = [path.join(process.cwd(), 'scripts', 'kc_sync.py'), f('call_live.csv'), f('upsales.xlsx'), f('daily.xlsx'), f('out')];
    if (E.KC_SHEET_V6 && E.KC_SHEET_UPS_OLD) {
      await fs.writeFile(f('v6.xlsx'), await downloadSheet(E.KC_SHEET_V6, 'xlsx'));
      await fs.writeFile(f('ups_old.xlsx'), await downloadSheet(E.KC_SHEET_UPS_OLD, 'xlsx'));
      // existing calls_daily, so older days keep their v7 numbers
      await fs.mkdir(f('existing'));
      for (const s of await db().collection('calls_daily').limit(5000).get()) await fs.writeFile(path.join(f('existing'), s.id + '.json'), JSON.stringify(s.data));
      args.push(f('v6.xlsx'), f('ups_old.xlsx'), f('existing'));
    }
    await run(E.PYTHON || 'python3', ['-I', ...args], {});
    const writes: { collection: string; doc_id: string; data: Record<string, unknown> }[] = JSON.parse(await fs.readFile(f('out/writes.json'), 'utf8'));
    const store = db();
    for (const w of writes) {
      if (!['calls_daily', 'sales_team'].includes(w.collection)) continue; // the script only ever writes these
      await store.collection(w.collection).doc(w.doc_id).set(w.data);
    }
    return { docs: writes.length };
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}
