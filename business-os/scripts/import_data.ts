// Load every data/<collection>/<id>.json into the docs table. Idempotent: unchanged docs are skipped,
// changed ones are overwritten (version bumps), nothing is deleted.
// Usage: npm run db:import [-- <data dir>]
import fs from 'node:fs';
import path from 'node:path';
import { db } from '../src/lib/db';
import { prisma } from '../src/lib/prisma';

const dir = path.resolve(process.argv[2] || 'data');
const isDeepEqual = (a: unknown, b: unknown) => JSON.stringify(sortKeys(a)) === JSON.stringify(sortKeys(b));
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === 'object') return Object.fromEntries(Object.keys(v).sort().map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]));
  return v;
}

async function main() {
  if (!fs.existsSync(dir)) throw new Error('No data dir: ' + dir);
  const store = db();
  const totals: Record<string, { created: number; updated: number; same: number }> = {};
  for (const col of fs.readdirSync(dir).sort()) {
    const cdir = path.join(dir, col);
    if (!fs.statSync(cdir).isDirectory()) continue;
    const t = (totals[col] = { created: 0, updated: 0, same: 0 });
    for (const f of fs.readdirSync(cdir).filter((x) => x.endsWith('.json')).sort()) {
      const id = f.slice(0, -5);
      const data = JSON.parse(fs.readFileSync(path.join(cdir, f), 'utf8'));
      delete data.id;
      const ref = store.collection(col).doc(id);
      const cur = await ref.get();
      if (cur && isDeepEqual(cur.data, data)) { t.same++; continue; }
      await ref.set(data);
      cur ? t.updated++ : t.created++;
    }
  }
  console.table(totals);
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1); });
