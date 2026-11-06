import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sessionPrincipal } from '@/lib/session';
import { collectionCounts, db } from '@/lib/db';
import { BIZ } from '@/lib/business';
import { isFull } from '@/lib/access';
import { bdToday, daysTo } from '@/lib/time';
import { latestHealth } from '@/lib/health';
import { Brand } from '@/components/Brand';

export const dynamic = 'force-dynamic';
const tk = (n: number) => '৳' + Math.round(n).toLocaleString('en-IN');

export default async function Home() {
  const p = await sessionPrincipal();
  if (!p || p.kind !== 'user') redirect('/login');
  const store = db(p);
  const [counts, sales, tasks, health] = await Promise.all([
    collectionCounts(p),
    store.collection('sales_daily').where('business', '==', 'kidscare').orderBy('date', 'desc').limit(60).get(),
    store.collection('tasks').where('done', '==', false).limit(2000).get(),
    latestHealth(),
  ]);
  const today = bdToday();
  const last30 = sales.map((s) => s.data as Record<string, number & string>).filter((r) => daysTo(String(r.date), today) > -31 && daysTo(String(r.date), today) <= 0);
  const sum = (k: string) => last30.reduce((a, r) => a + (Number(r[k]) || 0), 0);
  const allSales = sales.map((s) => s.data as Record<string, number>);
  const transit = allSales.reduce((a, r) => a + (Number(r.sent_in_transit) || 0), 0);
  const transitTk = allSales.reduce((a, r) => a + (Number(r.sent_in_transit_amount) || 0), 0);
  const overdue = tasks.filter((t) => t.data.status !== 'complete' && typeof t.data.date === 'string' && (t.data.date as string) < today).length;
  const total = counts.reduce((a, c) => a + c.count, 0);
  const myBiz = isFull(p) ? BIZ : BIZ.filter((b) => p.businesses.includes(b.id));
  const checked = health ? new Date(health.checked_at).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : null;

  return (
    <main className="mx-auto grid max-w-5xl gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="sr-only">EasyFounder</h1><Brand height={40} />
          <p className="muted text-sm">{p.email} · {p.role} · {today} (Dhaka)</p>
        </div>
        <nav className="flex flex-wrap gap-2">
          <a className="btn btn-primary" href="/app">Dashboard kholun (shob tab)</a>
          {isFull(p) && <Link className="btn" href="/admin">Admin</Link>}
          <a className="btn" href="/logout">Logout</a>
        </nav>
      </header>

      {/* System status is always visible (Nielsen #1) — stale data must never look fresh. */}
      {health && (
        <div className={'health-strip' + (health.bad ? ' bad' : health.warn ? ' warn' : '')} role="status">
          <b>{health.bad ? `${health.bad} ta jinish kaj korche na` : health.warn ? `${health.warn} ta jinish dekhte hobe` : 'Shob connection thik ache'}</b>
          <span className="muted">Shesh check {checked} · proti ghonta e nijei check hoy</span>
          <a className="link ml-auto text-sm font-semibold" href="/settings">Settings e dekhun →</a>
        </div>
      )}

      {/* One question above the fold: "business kemon cholche?" — 4 chunks max (PFD L0). */}
      <section className="grid grid-cols-2 gap-3 md:grid-cols-4" aria-label="Aajker obostha">
        <Tile label="Kids Care order · 30 din" value={String(sum('orders'))} sub={'Delivered ' + sum('delivered')} source="Nuport" />
        <Tile label="Delivered sale · 30 din" value={tk(sum('delivered_amount'))} sub={'Cancel ' + sum('cancelled')} source="Nuport" />
        <Tile label="Ekhon courier e" value={transit + ' order'} sub={tk(transitTk)} source="Nuport" />
        <Tile label="Open task" value={String(tasks.length)} sub={overdue + ' ta date par hoye geche'} source="Dashboard" tone={overdue > 0 ? 'warn' : undefined} />
      </section>
      {last30.length === 0 && (
        <p className="card muted text-sm">Ei 30 dine Kids Care er kono order data nai — Nuport sync check korun, ba <a className="link" href="/settings">Settings</a> e last sync dekhun.</p>
      )}

      <section className="card grid gap-3">
        <h2 className="font-semibold">Business</h2>
        <div className="flex flex-wrap gap-2">
          {myBiz.map((b) => (
            <a key={b.id} href={'/app#biz:' + b.id} className="biz" style={{ ['--biz-color' as string]: b.color }}>
              <span className="dot" />
              {b.name}
            </a>
          ))}
        </div>
      </section>

      {/* Database counts are reference data, not the default view — one click deeper (PFD L0). */}
      <details className="card">
        <summary className="cursor-pointer font-semibold">Database · {total.toLocaleString()} doc, {counts.length} collection</summary>
        <div className="mt-2 grid grid-cols-2 gap-x-6 sm:grid-cols-3">
          {counts.map((c) => (
            <div key={c.collection} className="flex justify-between border-b py-1 text-sm" style={{ borderColor: 'var(--line)' }}>
              <span>{c.collection}</span>
              <b className="num">{c.count}</b>
            </div>
          ))}
        </div>
        {counts.length === 0 && <p className="muted text-sm">Kono data nai. Server e <code>npm run db:import</code> chalan.</p>}
      </details>
    </main>
  );
}

function Tile({ label, value, sub, source, tone }: { label: string; value: string; sub: string; source: string; tone?: 'warn' | 'bad' }) {
  return (
    <div className={'kpi' + (tone ? ' ' + tone : '')}>
      <div className="kpi-label">{label}</div>
      <div className="kpi-value">{value}</div>
      <div className="kpi-sub">{sub} · {source}</div>
    </div>
  );
}
