'use client';
// Content calendar: week, month or list. Click a post to edit (or see a published one), "+" on a day to add.
import { useEffect, useState } from 'react';
import { api, NetIcon, STATUS, timeLocal, ymdLocal, type Post } from './ui';

type View = 'week' | 'month' | 'list';
const startOfWeek = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 1) % 7)); return x; }; // Saturday
const addD = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };

export function Calendar({ business, refresh, onOpen, onNew }: { business: string; refresh: number; onOpen: (p: Post) => void; onNew: (day: string) => void }) {
  const [view, setView] = useState<View>('week');
  const [anchor, setAnchor] = useState(() => new Date());
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [q, setQ] = useState(''); const [status, setStatus] = useState('');
  const [err, setErr] = useState('');
  const first = view === 'month' ? startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1)) : view === 'week' ? startOfWeek(anchor) : addD(new Date(), -30);
  const days = view === 'month' ? 42 : view === 'week' ? 7 : 90;
  const last = addD(first, days - 1);
  useEffect(() => {
    let on = true;
    api<{ posts: Post[] }>(`/api/social/${business}/posts?from=${ymdLocal(addD(first, -1))}&to=${ymdLocal(addD(last, 1))}`).then((r) => on && setPosts(r.posts)).catch((e) => on && setErr(e.message));
    return () => { on = false; };
  }, [business, refresh, ymdLocal(first), days]);
  const shown = (posts ?? []).filter((p) => (!q || (p.text + ' ' + (p.labels ?? []).join(' ')).toLowerCase().includes(q.toLowerCase())) && (!status || p.status === status));
  const when = (p: Post) => p.published_at || p.scheduled_at || '';
  const byDay = new Map<string, Post[]>();
  for (const p of shown) { const w = when(p); if (!w) continue; const k = ymdLocal(new Date(w)); byDay.set(k, [...(byDay.get(k) ?? []), p]); }
  const drafts = shown.filter((p) => !when(p));
  const move = (k: number) => setAnchor((a) => (view === 'month' ? new Date(a.getFullYear(), a.getMonth() + k, 1) : addD(a, 7 * k)));
  const today = ymdLocal(new Date());
  const title = view === 'month' ? anchor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : view === 'week' ? first.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' – ' + last.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : 'Shesh 30 din theke shamner 2 mash';

  const Chip = ({ p }: { p: Post }) => {
    const [l, c] = STATUS[p.status] ?? [p.status, '#888'];
    const m = p.media[0];
    return (
      <button type="button" onClick={() => onOpen(p)} className="text-left" style={{ width: '100%', border: '1px solid var(--line)', borderLeft: '3px solid ' + c, borderRadius: 8, background: 'var(--panel)', padding: 6, display: 'grid', gap: 4, fontSize: 12 }}>
        <span className="flex items-center gap-1">{[...new Set(p.targets.map((t) => t.network))].map((n) => <NetIcon key={n} net={n} size={14} />)}<b>{when(p) ? timeLocal(when(p)) : 'Draft'}</b><span style={{ marginLeft: 'auto', color: c, fontWeight: 600 }}>{l}</span></span>
        {m && (m.mime.startsWith('video/') ? <video src={m.url} muted style={{ width: '100%', height: 70, objectFit: 'cover', borderRadius: 4, background: '#000' }} /> : <img src={m.url} alt="" style={{ width: '100%', height: 70, objectFit: 'cover', borderRadius: 4 }} />)}
        <span style={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.text || '(lekha nai)'}</span>
      </button>
    );
  };

  return (
    <section className="card grid gap-3">
      <div className="flex flex-wrap items-center gap-2">
        {view !== 'list' && <><button className="btn" onClick={() => move(-1)} aria-label="Ager">‹</button><button className="btn" onClick={() => setAnchor(new Date())}>Aaj</button><button className="btn" onClick={() => move(1)} aria-label="Porer">›</button></>}
        <b>{title}</b>
        <span style={{ marginLeft: 'auto' }} className="flex flex-wrap gap-2">
          <input className="input" style={{ width: 160 }} placeholder="Post khujun" value={q} onChange={(e) => setQ(e.target.value)} />
          <select className="input" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)}><option value="">Shob</option>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
          {(['week', 'month', 'list'] as View[]).map((v) => <button key={v} className={'btn' + (view === v ? ' btn-primary' : '')} onClick={() => setView(v)}>{{ week: 'Shoptah', month: 'Mash', list: 'List' }[v]}</button>)}
        </span>
      </div>
      {err && <p className="text-sm" style={{ color: '#d64545' }}>{err}</p>}
      {view === 'list' ? (
        <div className="grid gap-2">
          {[...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([d, ps]) => (
            <div key={d} className="grid gap-2" style={{ gridTemplateColumns: '110px 1fr' }}>
              <b className="text-sm" style={{ color: d === today ? 'var(--accent)' : undefined }}>{new Date(d + 'T00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short' })}</b>
              <div className="grid gap-2 sm:grid-cols-3">{ps.map((p) => <Chip key={p.id} p={p} />)}</div>
            </div>
          ))}
          {!byDay.size && <p className="muted text-sm">Ei shomoye kono post nai.</p>}
        </div>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, minmax(110px, 1fr))', gap: 4, minWidth: 780 }}>
            {['Shoni', 'Robi', 'Shom', 'Mongol', 'Budh', 'Brihoshpoti', 'Shukro'].map((w) => <div key={w} className="muted text-xs font-semibold" style={{ padding: '0 4px' }}>{w}</div>)}
            {Array.from({ length: days }, (_, i) => addD(first, i)).map((d) => {
              const k = ymdLocal(d); const ps = byDay.get(k) ?? [];
              const out = view === 'month' && d.getMonth() !== anchor.getMonth();
              return (
                <div key={k} style={{ minHeight: view === 'week' ? 260 : 120, background: k === today ? 'color-mix(in srgb, var(--accent) 8%, transparent)' : 'color-mix(in srgb, var(--line) 35%, transparent)', borderRadius: 8, padding: 4, display: 'grid', alignContent: 'start', gap: 4, opacity: out ? 0.5 : 1 }}>
                  <div className="flex items-center justify-between text-xs"><b style={{ color: k === today ? 'var(--accent)' : undefined }}>{d.getDate()} {d.getDate() === 1 || view === 'week' ? d.toLocaleDateString('en-GB', { month: 'short' }) : ''}</b>
                    {k >= today && <button type="button" aria-label="Ei dine post" onClick={() => onNew(k)} className="muted" style={{ fontSize: 16, lineHeight: 1 }}>＋</button>}</div>
                  {ps.map((p) => <Chip key={p.id} p={p} />)}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {!!drafts.length && (
        <div className="grid gap-2"><b className="text-sm">Draft ({drafts.length})</b><div className="grid gap-2 sm:grid-cols-4">{drafts.map((p) => <Chip key={p.id} p={p} />)}</div></div>
      )}
      {posts === null && <p className="muted text-sm">Load hocche…</p>}
    </section>
  );
}
