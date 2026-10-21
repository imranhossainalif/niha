// Nightly pg_dump → BACKUP_DIR/business_os-YYYY-MM-DD.sql.gz, keeping the newest BACKUP_KEEP (default 14).
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { pipeline } from 'node:stream/promises';
import { envVal } from '../config';

export async function backup() {
  const dir = process.env.BACKUP_DIR || path.join(process.cwd(), 'backups');
  const keep = Number(envVal("BACKUP_KEEP")) || 14;
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'business_os-' + new Date().toISOString().slice(0, 10) + '.sql.gz');
  const url = new URL(process.env.DATABASE_URL!);
  url.searchParams.delete('schema');
  const p = spawn('pg_dump', ['--no-owner', '--dbname', url.toString()]);
  let errOut = ''; p.stderr.on('data', (d) => (errOut += d));
  const done = new Promise<void>((res, rej) => { p.on('error', rej); p.on('close', (c) => (c === 0 ? res() : rej(new Error('pg_dump exited ' + c + ': ' + errOut.slice(-500))))); });
  await Promise.all([pipeline(p.stdout, zlib.createGzip(), fs.createWriteStream(file)), done]);
  const old = fs.readdirSync(dir).filter((f) => /^business_os-.*\.sql\.gz$/.test(f)).sort().reverse().slice(keep);
  old.forEach((f) => fs.unlinkSync(path.join(dir, f)));
  return { file, bytes: fs.statSync(file).size, removed: old.length };
}
