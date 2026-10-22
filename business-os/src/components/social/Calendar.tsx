'use client';
// Content calendar: week, month or list. Drag a scheduled post/draft to another day to move it (keeps its time).
// Data stays on screen while it refreshes, so nothing flashes.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, NET_NAME, NetLogo, NETS, type Net } from './icons';
import { api, Seg, Skel, STATUS, timeLocal, useToast, ymdLocal, type Post } from './ui';

type View = 'week' | 'month' | 'list';
const startOfWeek = (d: Date) => { const x = new Date(d); x.setHours(0, 0, 0, 0); x.setDate(x.getDate() - ((x.getDay() + 1) % 7)); return x; }; // Saturday
const addD = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const WD = ['Shoni', 'Robi', 'Shom', 'Mongol', 'Budh', 'Brihoshpoti', 'Shukro'];
const movable = (p: Post) => ['scheduled', 'draft', 'failed'].includes(p.status);
const when = (p: Post) => p.published_at || p.scheduled_at || '';

export function Calendar({ business, refresh, nets, onOpen, onNew }: { business: string; refresh: number; nets: Net[]; onOpen: (p: Post) => void; onNew: (day: string) => void }) {
  const toast = useToast();
  const [view, setView] = useState<View>(() => (typeof window !== 'undefined' && window.innerWidth < 700 ? 'list' : 'week'));
  const [anchor, setAnchor] = useState(() => new Date());
  const [posts, setPosts] = useState<Post[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [q, setQ] = useState(''); const [status, setStatus] = useState(''); const [netF, setNetF] = useState<Net[]>([]);
  const [drag, setDrag] = useState<string | null>(null); const [dropDay, setDropDay] = useState<string | null>(null);
  const first = view === 'month' ? startOfWeek(new Date(anchor.getFullYear(), anchor.getMonth(), 1)) : view === 'week' ? startOfWeek(anchor) : addD(startOfWeek(new Date()), -14);
  const days = view === 'month' ? 42 : view === 'week' ? 7 : 63;
  const last = addD(first, days - 1);
  const key = ymdLocal(first) + days;
  const seq = useRef(0);
  useEffect(() => {
    const my = ++seq.current; setLoading(true);
    api<{ posts: Post[] }>(`/api/social/${business}/posts?from=${ymdLocal(addD(first, -1))}&to=${ymdLocal(addD(last, 1))}`)
      .then((r) => { if (my === seq.current) setPosts(r.posts); }).catch((e) => toast(e.message, 'err')).finally(() => my === seq.current && setLoading(false));
  }, [business, refresh, key]);

  const shown = useMemo(() => (posts ?? []).filter((p) => (!q || (p.text + ' ' + (p.labels ?? []).join(' ')).toLowerCase().includes(q.toLowerCase())) && (!status || p.status === status) && (!netF.length || p.targets.some((t) => netF.includes(t.network)))), [posts, q, status, netF]);
  const byDay = useMemo(() => { const m = new Map<string, Post[]>(); for (const p of shown) { const w = when(p); if (!w) continue; const k = ymdLocal(new Date(w)); m.set(k, [...(m.get(k) ?? []), p]); } for (const v of m.values()) v.sort((a, b) => when(a).localeCompare(when(b))); return m; }, [shown]);
  const drafts = shown.filter((p) => !when(p));
  const move = (k: number) => setAnchor((a) => (view === 'month' ? new Date(a.getFullYear(), a.getMonth() + k, 1) : addD(a, 7 * k)));
  const today = ymdLocal(new Date());
  const title = view === 'month' ? anchor.toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }) : view === 'week' ? first.toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) + ' – ' + last.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'Shamner o shesh kodin';
  const counts = { scheduled: shown.filter((p) => p.status === 'scheduled').length, published: shown.filter((p) => p.status === 'published').length, failed: shown.filter((p) => p.status === 'failed' || p.status === 'partial').length };

  async function dropOn(day: string) {
    const p = (posts ?? []).find((x) => x.id === drag); setDrag(null); setDropDay(null);
    if (!p) return;
    const old = p.scheduled_at ? new Date(p.scheduled_at) : new Date(day + 'T20:00');
    const t = new Date(day + 'T00:00'); t.setHours(old.getHours(), old.getMinutes(), 0, 0);
    if (t.getTime() < Date.now() + 60e3) { toast('Ager shomoye neya jabe na', 'err'); return; }
    const prev = posts;
    setPosts((ps) => (ps ?? []).map((x) => (x.id === p.id ? { ...x, scheduled_at: t.toISOString(), status: x.status === 'failed' ? 'scheduled' : x.status } : x)));
    try { await api('/api/social/posts/' + p.id + '/move', { method: 'POST', json: { scheduled_at: t.toISOString() } }); toast('Shoranu hoyeche · ' + t.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })); }
    catch (e) { setPosts(prev); toast((e as Error).message, 'err'); }
  }

  const Card = ({ p, mini }: { p: Post; mini?: boolean }) => {
    const [l, c] = STATUS[p.status] ?? [p.status, '#888'];
    const m = p.media[0];
    const ns = [...new Set(p.targets.map((t) => t.network))];
    return (
      <button type="button" className={'sm-post' + (mini ? ' mini' : '') + (drag === p.id ? ' dragging' : '')} onClick={() => onOpen(p)} draggable={movable(p)}
        onDragStart={(e) => { setDrag(p.id); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', p.id); }} onDragEnd={() => { setDrag(null); setDropDay(null); }} title={p.text}>
        <span className="bar" style={{ background: c }} />
        <span className="row" style={{ gap: 4, paddingLeft: 4 }}>{ns.map((n) => <NetLogo key={n} net={n} size={14} />)}<b>{when(p) ? timeLocal(when(p)) : 'Draft'}</b><span className="grow" />{!mini && <span className="xs" style={{ color: c, fontWeight: 700 }}>{l}</span>}</span>
        {!mini && m && (m.mime.startsWith('video/') ? <video className="thumb" src={m.url} muted preload="metadata" /> : <img className="thumb" src={m.url} alt="" loading="lazy" />)}
        <span className={mini ? 'clamp2 xs' : 'clamp2'} style={{ paddingLeft: 4 }}>{p.text || <i className="muted">(lekha nai)</i>}</span>
      </button>
    );
  };
  const dayProps = (k: string) => ({
    onDragOver: (e: React.DragEvent) => { if (drag && k >= today) { e.preventDefault(); setDropDay(k); } },
    onDragLeave: () => setDropDay((d) => (d === k ? null : d)),
    onDrop: (e: React.DragEvent) => { e.preventDefault(); if (k >= today) dropOn(k); },
  });

  return (
    <section className="sm-card stack" style={{ gap: 12 }}>
      <div className="row">
        {view !== 'list' && <div className="row" style={{ gap: 4 }}><button className="sm-btn icon" onClick={() => move(-1)} aria-label="Ager"><Icon name="chevL" /></button><button className="sm-btn" onClick={() => setAnchor(new Date())}>Aaj</button><button className="sm-btn icon" onClick={() => move(1)} aria-label="Porer"><Icon name="chevR" /></button></div>}
        <h2 style={{ marginLeft: 4 }}>{title}</h2>
        <span className="row xs muted" style={{ gap: 10 }}><span className="row" style={{ gap: 4 }}><span className="sm-dot" style={{ background: STATUS.scheduled[1] }} />{counts.scheduled} schedule</span><span className="row" style={{ gap: 4 }}><span className="sm-dot" style={{ background: STATUS.published[1] }} />{counts.published} post hoyeche</span>{counts.failed > 0 && <span className="row" style={{ gap: 4, color: 'var(--bad)' }}><span className="sm-dot" style={{ background: STATUS.failed[1] }} />{counts.failed} hoyni</span>}</span>
        <span className="grow" />
        <Seg value={view} onChange={setView} items={[['week', <><Icon name="calendar" size={14} />Shoptah</>], ['month', <><Icon name="grid" size={14} />Mash</>], ['list', <><Icon name="list" size={14} />List</>]]} />
      </div>
      <div className="row">
        <div className="row" style={{ gap: 6 }}>
          {NETS.filter((n) => nets.includes(n)).map((n) => <button key={n} type="button" className="sm-chip" aria-pressed={!netF.length || netF.includes(n)} onClick={() => setNetF((f) => (f.includes(n) ? f.filter((x) => x !== n) : [...f, n]))}><NetLogo net={n} size={18} />{NET_NAME[n]}</button>)}
        </div>
        <span className="grow" />
        <div style={{ position: 'relative' }}><Icon name="search" size={15} style={{ position: 'absolute', left: 10, top: 10, color: 'var(--muted)' }} /><input className="sm-input" style={{ width: 190, paddingLeft: 32 }} placeholder="Post khujun" value={q} onChange={(e) => setQ(e.target.value)} /></div>
        <select className="sm-input" style={{ width: 'auto' }} value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Status"><option value="">Shob status</option>{Object.entries(STATUS).map(([k, [l]]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
      <div className="sm-loadbar" style={{ visibility: loading && posts ? 'visible' : 'hidden' }} />

      {posts === null ? (
        <div className="sm-scroll-x"><div className="sm-week">{Array.from({ length: 7 }, (_, i) => <div key={i} className="sm-day"><Skel h={22} w={50} /><Skel h={90} /><Skel h={60} /></div>)}</div></div>
      ) : view === 'list' ? (
        <div className="stack sm-fade" style={{ gap: 14 }}>
          {[...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([d, ps]) => (
            <div key={d} className="stack" style={{ gap: 8 }}>
              <span className="row"><b style={{ fontFamily: 'var(--display)', fontSize: 15, color: d === today ? 'var(--accent)' : undefined }}>{d === today ? 'Aaj · ' : ''}{new Date(d + 'T00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'short' })}</b><span className="muted xs">{ps.length} post</span></span>
              <div className="sm-gal" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))' }}>{ps.map((p) => <Card key={p.id} p={p} />)}</div>
            </div>
          ))}
          {!byDay.size && <p className="muted" style={{ textAlign: 'center', padding: 24 }}>Ei shomoye kono post nai. "＋ Post banan" diye shuru korun.</p>}
        </div>
      ) : (
        <div className="sm-scroll-x sm-fade">
          <div className="sm-week" style={view === 'month' ? { gap: 6 } : undefined}>
            {WD.map((w) => <div key={w} className="muted xs" style={{ fontWeight: 700, padding: '0 4px', textTransform: 'uppercase', letterSpacing: '.04em' }}>{w}</div>)}
            {Array.from({ length: days }, (_, i) => addD(first, i)).map((d) => {
              const k = ymdLocal(d); const ps = byDay.get(k) ?? [];
              const cls = 'sm-day' + (view === 'month' ? ' month' : '') + (k === today ? ' today' : '') + (view === 'month' && d.getMonth() !== anchor.getMonth() ? ' out' : '') + (dropDay === k ? ' drop' : '');
              const max = view === 'month' ? 3 : 99;
              return (
                <div key={k} className={cls} {...dayProps(k)}>
                  <div className="sm-dayhead"><b style={{ color: k === today ? 'var(--accent)' : undefined }}>{d.getDate()}{view === 'week' ? <span className="muted xs" style={{ fontFamily: 'var(--body)', fontWeight: 600, marginLeft: 4 }}>{d.toLocaleDateString('en-GB', { month: 'short' })}</span> : null}</b>
                    {k >= today && <button type="button" className="sm-btn sm ghost icon sm-add" aria-label="Ei dine post" onClick={() => onNew(k)}><Icon name="plus" size={15} /></button>}</div>
                  {ps.slice(0, max).map((p) => <Card key={p.id} p={p} mini={view === 'month'} />)}
                  {ps.length > max && <button type="button" className="sm-btn sm ghost" onClick={() => { setAnchor(d); setView('week'); }}>+{ps.length - max} aro</button>}
                  {view === 'week' && !ps.length && k >= today && <button type="button" className="sm-add muted xs" onClick={() => onNew(k)} style={{ border: '1px dashed var(--line)', borderRadius: 10, padding: 10, background: 'none', cursor: 'pointer' }}>＋ Post</button>}
                </div>
              );
            })}
          </div>
        </div>
      )}
      {!!drafts.length && (
        <div className="stack" style={{ gap: 8, borderTop: '1px solid var(--line)', paddingTop: 12 }}>
          <span className="row"><b>Draft</b><span className="sm-badge">{drafts.length}</span><span className="muted xs">calendar er kono dine tene niye shomoy thik korun</span></span>
          <div className="sm-gal" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))' }}>{drafts.map((p) => <Card key={p.id} p={p} />)}</div>
        </div>
      )}
    </section>
  );
}
