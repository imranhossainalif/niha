import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sessionPrincipal } from '@/lib/session';
import { collectionCounts, db } from '@/lib/db';
import { BIZ } from '@/lib/business';
import { isFull } from '@/lib/access';
import { bdToday, daysTo } from '@/lib/time';
import { Brand } from '@/components/Brand';

export const dynamic = 'force-dynamic';
const tk = (n: number) => '৳' + Math.round(n).toLocaleString('en-IN');

export default async function Home() {
  const p = await sessionPrincipal();
  if (!p || p.kind !== 'user') redirect('/login');
  const store = db(p);
  const [counts, sales, tasks] = await Promise.all([
    collectionCounts(p),
    store.collection('sales_daily').where('business', '==', 'kidscare').orderBy('date', 'desc').limit(60).get(),
    store.collection('tasks').where('done', '==', false).limit(2000).get(),
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

      {last30.length > 0 && (
        <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Tile label="Kids Care order (30 din)" value={String(sum('orders'))} sub={'Delivered ' + sum('delivered')} />
          <Tile label="Delivered sale (30 din)" value={tk(sum('delivered_amount'))} sub={'Cancel ' + sum('cancelled')} />
          <Tile label="Ekhon courier e (in transit)" value={transit + ' order'} sub={tk(transitTk)} />
          <Tile label="Open task" value={String(tasks.length)} sub={overdue + ' ta date par hoye geche'} />
        </section>
      )}

      <section className="card grid gap-2">
        <h2 className="font-semibold">Business</h2>
        <div className="flex flex-wrap gap-2">
          {myBiz.map((b) => (
            <a key={b.id} href={'/app#biz:' + b.id} className="btn" style={{ borderColor: b.color }}>
              <span style={{ width: 10, height: 10, borderRadius: 5, background: b.color, display: 'inline-block' }} />
              {b.name}
            </a>
          ))}
        </div>
      </section>

      <section className="card">
        <h2 className="mb-2 font-semibold">Database · {total.toLocaleString()} doc, {counts.length} collection</h2>
        <div className="grid grid-cols-2 gap-x-6 sm:grid-cols-3">
          {counts.map((c) => (
            <div key={c.collection} className="flex justify-between border-b py-1 text-sm" style={{ borderColor: 'var(--line)' }}>
              <span>{c.collection}</span>
              <b>{c.count}</b>
            </div>
          ))}
        </div>
        {counts.length === 0 && <p className="muted text-sm">Kono data nai. Server e <code>npm run db:import</code> chalan.</p>}
      </section>
    </main>
  );
}

function Tile({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="card">
      <div className="muted text-xs">{label}</div>
      <div className="text-xl font-semibold">{value}</div>
      <div className="muted text-xs">{sub}</div>
    </div>
  );
}
