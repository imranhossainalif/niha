import Link from 'next/link';
import { redirect } from 'next/navigation';
import { sessionPrincipal } from '@/lib/session';
import { configStatus } from '@/lib/config';
import { checkAll, latestHealth, type Health, type Status } from '@/lib/health';
import { IntegrationsForm } from '@/components/IntegrationsForm';
import { recheckAction } from './actions';

export const dynamic = 'force-dynamic';
export const maxDuration = 120;

const LOOK: Record<Status, { dot: string; label: string; bg: string }> = {
  bad: { dot: '#d64545', label: 'Kaj korche na', bg: 'color-mix(in srgb, #d64545 10%, transparent)' },
  warn: { dot: '#d99a1e', label: 'Dekhun', bg: 'color-mix(in srgb, #d99a1e 10%, transparent)' },
  ok: { dot: '#1f9d6b', label: 'Thik ache', bg: 'transparent' },
  off: { dot: '#8a9993', label: 'Connect kora nai', bg: 'transparent' },
};
const ORDER: Status[] = ['bad', 'warn', 'ok', 'off'];
const nf = (n: number) => n.toLocaleString('en-IN', { maximumFractionDigits: 1 });

function LimitBar({ l }: { l: NonNullable<Health['limits']>[number] }) {
  const pct = l.max ? Math.min(100, (l.used / l.max) * 100) : 0;
  const color = pct >= 90 ? '#d64545' : pct >= 75 ? '#d99a1e' : '#1f9d6b';
  return (
    <div className="grid gap-1 text-sm">
      <div className="flex flex-wrap justify-between gap-2"><span>{l.label}</span><b>{nf(l.used)} / {nf(l.max)}{l.unit ? ' ' + l.unit : ''} · {Math.round(pct)}% use · baki {nf(Math.max(0, l.max - l.used))}{l.unit ? ' ' + l.unit : ''}</b></div>
      <div style={{ height: 8, borderRadius: 4, background: 'var(--line)' }}><div style={{ height: 8, borderRadius: 4, width: pct + '%', background: color }} /></div>
      {l.note && <span className="muted text-xs">{l.note}</span>}
    </div>
  );
}

export default async function Settings({ searchParams }: { searchParams: Promise<{ msg?: string }> }) {
  const me = await sessionPrincipal();
  if (!me || me.kind !== 'user') redirect('/login?next=/settings');
  if (me.role === 'staff') redirect('/');
  const sp = await searchParams;
  let h = await latestHealth();
  if (!h || Date.now() - Date.parse(h.checked_at) > 10 * 60e3) h = await checkAll();
  const integrations = await configStatus();
  const items = [...h.items].sort((a, b) => ORDER.indexOf(a.status) - ORDER.indexOf(b.status));
  const ok = items.filter((i) => i.status === 'ok').length, off = items.filter((i) => i.status === 'off').length;
  const isOwner = me.role === 'owner';
  const checked = new Date(h.checked_at).toLocaleString('en-GB', { timeZone: 'Asia/Dhaka', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

  return (
    <main className="mx-auto grid max-w-5xl gap-4 p-4">
      <header className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-2xl font-semibold">Settings · API o connection</h1>
          <p className="muted text-sm">Kon API connect ache, kaj korche kina, credit/limit koto baki — ek jaygay.</p>
        </div>
        <nav className="flex gap-2"><a className="btn" href="/app">Dashboard</a><Link className="btn" href="/admin">Admin</Link></nav>
      </header>
      {sp.msg && <p className="card text-sm">{sp.msg === 'saved' ? 'Save hoyeche, abar check kora hoyeche.' : sp.msg === 'owner_only' ? 'Key shudhu owner bodlate pare.' : sp.msg}</p>}

      <section className="card flex flex-wrap items-center justify-between gap-3" style={{ background: h.bad ? LOOK.bad.bg : h.warn ? LOOK.warn.bg : undefined }}>
        <div className="grid gap-1">
          <b className="text-lg">{h.bad ? `⛔ ${h.bad} ta jinish kaj korche na` : h.warn ? `⚠️ ${h.warn} ta jinish dekhte hobe` : '✅ Shob connection thik ache'}</b>
          <span className="muted text-sm">{ok} ta thik · {h.warn} ta dekhun · {h.bad} ta bondho · {off} ta connect kora nai · shesh check {checked} (proti ghonta e nijei check hoy)</span>
        </div>
        <form action={recheckAction}><button className="btn btn-primary" type="submit">Ekhon abar check korun</button></form>
      </section>

      <div className="grid gap-3 md:grid-cols-2">
        {items.map((it) => {
          const L = LOOK[it.status];
          return (
            <section key={it.id} className="card grid content-start gap-3" style={{ background: L.bg }}>
              <div className="flex items-start justify-between gap-2">
                <h2 className="font-semibold">{it.name}</h2>
                <span className="flex shrink-0 items-center gap-1 text-xs font-semibold" style={{ color: L.dot }}><span style={{ width: 10, height: 10, borderRadius: 5, background: L.dot, display: 'inline-block' }} />{L.label}</span>
              </div>
              <p className="text-sm">{it.summary}</p>
              {(it.limits ?? []).map((l, i) => <LimitBar key={i} l={l} />)}
              {!!it.details?.length && (
                <table className="t text-xs"><tbody>{it.details.map(([k, v], i) => <tr key={i}><td className="muted">{k}</td><td style={{ overflowWrap: 'anywhere' }}>{v}</td></tr>)}</tbody></table>
              )}
              {it.fix && it.status !== 'ok' && <p className="text-sm"><b>Ki korben:</b> {it.fix}</p>}
              {!!it.links?.length && <div className="flex flex-wrap gap-2 text-sm">{it.links.map((l) => <a key={l.url} className="link" href={l.url} target="_blank" rel="noreferrer">{l.label} ↗</a>)}</div>}
              {!!it.keys?.length && (
                <details>
                  <summary className="cursor-pointer text-sm font-semibold">{isOwner ? 'Key bosan / bodlan' : 'Kon key boshano'}</summary>
                  <div className="mt-2"><IntegrationsForm integrations={integrations} isOwner={isOwner} back="/settings" only={it.keys} /></div>
                </details>
              )}
            </section>
          );
        })}
      </div>

      <section className="card grid gap-3">
        <details>
          <summary className="cursor-pointer font-semibold">Shob key ek shathe (AI jobs, Google Sheets id, ityadi)</summary>
          <p className="muted my-2 text-sm">Key server e encrypted thake, 30 second er moddhe chalu hoy. Faka rakhle ager value thake; muchte <code>-</code> likhun. Server .env er value agradhikar pay.</p>
          <IntegrationsForm integrations={integrations} isOwner={isOwner} back="/settings" />
        </details>
      </section>
    </main>
  );
}
