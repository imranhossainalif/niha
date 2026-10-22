'use client';
// What worked: KPIs vs the period before (with small daily charts), best time heatmap, by hour, format, content type,
// network split, top and weak posts, followers, Instagram audience. All times Bangladesh.
import { useEffect, useRef, useState } from 'react';
import { Icon, NET_COLOR, NET_NAME, NetLogo, NETS, type Net } from './icons';
import { api, compact, Empty, FORMAT_LABEL, Kpi, nf, pct, Seg, Skel, TYPE_LABEL, useToast, WEEKDAYS } from './ui';

type Agg = { key: string; posts: number; engagement: number; reach: number; avg_eng: number; avg_reach: number; rate: number | null };
type PostRow = { network: Net; ext_id: string; created: string; text?: string; permalink?: string; thumb?: string; format: string; content_type?: string; eng: number; rate: number | null; metrics: Record<string, number | undefined> };
type Day = { date: string; posts: number; engagement: number; reach: number; views: number };
type Data = {
  days: number; total_posts: number; synced: string | null; series: Day[]; networks: Net[];
  analysis: { totals: { posts: number; engagement: number; reach: number; views: number }; byHour: Agg[]; byWeekday: Agg[]; byFormat: Agg[]; byType: Agg[]; byNetwork: Agg[]; heat: (Agg & { weekday: number; hour: number })[]; bestHours: Agg[]; bestDays: Agg[]; bestSlots: (Agg & { weekday: number; hour: number })[]; bestFormat: Agg | null; top: PostRow[]; weak: PostRow[] };
  prev: { posts: number; engagement: number; reach: number; views: number };
  followers: { account_doc: string; network: Net; date: string; followers: number }[];
  audience: { account_doc: string; age_gender: { key: string; value: number }[]; city: { key: string; value: number }[] }[];
};
const slot = (h: number) => String(h).padStart(2, '0') + '–' + String(h + 3).padStart(2, '0');

function Spark({ values, color = 'var(--accent)' }: { values: number[]; color?: string }) {
  const max = Math.max(1, ...values); const W = 120, H = 28;
  return <svg viewBox={`0 0 ${W} ${H}`} width="100%" height={H} preserveAspectRatio="none" aria-hidden="true">{values.map((v, i) => { const w = W / values.length; const h = Math.max(1.5, (v / max) * H); return <rect key={i} x={i * w + 0.5} y={H - h} width={Math.max(1, w - 1.5)} height={h} rx={1} fill={color} opacity={v ? 0.85 : 0.18} />; })}</svg>;
}

function HourChart({ rows, best }: { rows: Agg[]; best: Set<string> }) {
  const by = new Map(rows.map((r) => [Number(r.key), r]));
  const max = Math.max(1, ...rows.map((r) => r.avg_eng)); const W = 600, H = 170;
  const [tip, setTip] = useState<{ x: number; t: string } | null>(null);
  return (
    <div style={{ position: 'relative' }}>
      <svg viewBox={`0 0 ${W} ${H + 22}`} width="100%" role="img" aria-label="Ghonta onujayi engagement">
        {[0.25, 0.5, 0.75, 1].map((g) => <line key={g} x1={0} x2={W} y1={H - g * H} y2={H - g * H} stroke="var(--line)" strokeDasharray="3 4" />)}
        {Array.from({ length: 24 }, (_, h) => { const r = by.get(h); const bw = W / 24; const bh = r ? Math.max(3, (r.avg_eng / max) * (H - 6)) : 0;
          return <g key={h} onMouseEnter={() => r && setTip({ x: (h + 0.5) * bw, t: String(h).padStart(2, '0') + ':00 · gor ' + nf(r.avg_eng, 1) + ' · ' + r.posts + ' post' })} onMouseLeave={() => setTip(null)}>
            <rect x={h * bw} y={0} width={bw} height={H} fill="transparent" />
            {r && <rect x={h * bw + 3} y={H - bh} width={bw - 6} height={bh} rx={4} fill={best.has(String(h)) ? 'var(--accent)' : 'color-mix(in srgb, var(--accent) 35%, transparent)'} style={{ transition: 'height .4s' }} />}
            {h % 3 === 0 && <text x={h * bw + bw / 2} y={H + 16} textAnchor="middle" fontSize="11" fill="currentColor" opacity=".55">{String(h).padStart(2, '0')}</text>}
          </g>; })}
      </svg>
      {tip && <div className="sm-badge" style={{ position: 'absolute', top: 0, left: `calc(${(tip.x / W) * 100}% - 70px)`, background: 'var(--fg)', color: 'var(--panel)', pointerEvents: 'none' }}>{tip.t}</div>}
    </div>
  );
}

function Followers({ rows }: { rows: Data['followers'] }) {
  const nets = [...new Set(rows.map((r) => r.network))];
  if (!nets.some((n) => rows.filter((r) => r.network === n).length >= 2)) return <p className="muted sm-t">Follower er hishab protidin jomche — kichu din por graph dekhabe.</p>;
  const W = 600, H = 150;
  return (
    <div className="stack">
      <div className="row">{nets.map((n) => { const rs = rows.filter((r) => r.network === n); const d = rs.length > 1 ? rs[rs.length - 1].followers - rs[0].followers : 0; return <span key={n} className="row sm-t" style={{ gap: 6 }}><NetLogo net={n} size={16} /><b>{compact(rs[rs.length - 1]?.followers)}</b><span className={'sm-delta ' + (d >= 0 ? 'up' : 'down')}>{d >= 0 ? '+' : ''}{nf(d)}</span></span>; })}</div>
      <svg viewBox={`0 0 ${W} ${H}`} width="100%" role="img" aria-label="Follower">
        <defs>{nets.map((n) => <linearGradient key={n} id={'fg-' + n} x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor={NET_COLOR[n]} stopOpacity=".22" /><stop offset="1" stopColor={NET_COLOR[n]} stopOpacity="0" /></linearGradient>)}</defs>
        {nets.map((n) => {
          const rs = rows.filter((r) => r.network === n); if (rs.length < 2) return null;
          const min = Math.min(...rs.map((r) => r.followers)), max = Math.max(...rs.map((r) => r.followers));
          const x = (i: number) => (i / (rs.length - 1)) * W, y = (v: number) => H - 8 - ((v - min) / Math.max(1, max - min)) * (H - 24);
          const line = rs.map((r, i) => (i ? 'L' : 'M') + x(i).toFixed(1) + ',' + y(r.followers).toFixed(1)).join(' ');
          return <g key={n}><path d={line + ` L${W},${H} L0,${H} Z`} fill={`url(#fg-${n})`} /><path d={line} fill="none" stroke={NET_COLOR[n]} strokeWidth={2.5} strokeLinejoin="round" /></g>;
        })}
      </svg>
      <div className="row muted xs"><span>{rows[0]?.date}</span><span className="grow" /><span>{rows[rows.length - 1]?.date}</span></div>
    </div>
  );
}

export function Analytics({ business, refresh }: { business: string; refresh: number }) {
  const toast = useToast();
  const [days, setDays] = useState('30'); const [net, setNet] = useState<'' | Net>('');
  const [d, setD] = useState<Data | null>(null); const [loading, setLoading] = useState(false); const [syncing, setSyncing] = useState(false);
  const seq = useRef(0);
  useEffect(() => { const my = ++seq.current; setLoading(true); api<Data>(`/api/social/${business}/analytics?days=${days}&network=${net}`).then((x) => my === seq.current && setD(x)).catch((e) => toast(e.message, 'err')).finally(() => my === seq.current && setLoading(false)); }, [business, days, net, refresh]);
  const sync = async () => { setSyncing(true); try { const r = await api<{ queued: boolean; note?: string }>(`/api/social/${business}/research`, { method: 'POST', json: { action: 'sync' } }); toast(r.queued ? 'Notun data ana hocche — 2-5 min por refresh korun' : r.note || 'Age theke cholche'); } catch (e) { toast((e as Error).message, 'err'); } setSyncing(false); };

  if (!d) return <div className="stack"><div className="sm-grid sm-g4">{[0, 1, 2, 3].map((i) => <div key={i} className="sm-card stack"><Skel h={12} w={90} /><Skel h={28} w={110} /><Skel h={28} /></div>)}</div><div className="sm-card"><Skel h={220} /></div></div>;
  const A = d.analysis, T = A.totals;
  const s = d.series;
  const heatMax = Math.max(1, ...A.heat.map((h) => h.avg_eng));
  const heatAt = (w: number, h: number) => A.heat.find((x) => x.weekday === w && x.hour === h);
  const bestH = new Set(A.bestHours.map((x) => x.key));
  const hasViews = T.views > 0;
  const reachD = pct(T.reach + T.views, d.prev.reach + d.prev.views);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="sm-card row" style={{ padding: 12 }}>
        <Seg value={days} onChange={setDays} small items={[['7', '7 din'], ['30', '30 din'], ['90', '90 din'], ['365', '1 bochor']]} />
        <div className="row" style={{ gap: 6 }}>
          <button type="button" className="sm-chip plain" aria-pressed={!net} onClick={() => setNet('')}>Shob</button>
          {NETS.filter((n) => d.networks.includes(n)).map((n) => <button key={n} type="button" className="sm-chip" aria-pressed={net === n} onClick={() => setNet(net === n ? '' : n)}><NetLogo net={n} size={18} />{NET_NAME[n]}</button>)}
        </div>
        <span className="grow" />
        <span className="muted xs">Data: {d.synced ? new Date(d.synced).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }) : 'ekhono ashe nai'} · proti 3 ghonta</span>
        <button className="sm-btn sm" onClick={sync} disabled={syncing}>{syncing ? <span className="sm-spin" /> : <Icon name="refresh" size={14} />}Ekhon data anun</button>
      </div>
      <div className="sm-loadbar" style={{ visibility: loading ? 'visible' : 'hidden', marginTop: -10 }} />

      {!d.total_posts ? <Empty icon="chart" title="Ekhono post er data nai">Account connect korar por "Ekhon data anun" chapun — shesh 90 diner post, reach, view, like, comment, share chole ashbe.</Empty> : (<>
        <div className="sm-grid sm-g4">
          <div className="stack" style={{ gap: 0 }}><Kpi icon="edit" label="Post" value={nf(T.posts)} delta={pct(T.posts, d.prev.posts)} note={'ager ' + d.days + ' din: ' + nf(d.prev.posts)} /></div>
          <div className="sm-card sm-kpi sm-fade"><span className="row muted xs" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}><Icon name="eye" size={14} />{hasViews ? 'Reach + video view' : 'Reach'}</span><span className="row"><span className="v">{compact(T.reach + T.views)}</span>{reachD != null && <span className={'sm-delta ' + (reachD >= 0 ? 'up' : 'down')}>{reachD}%</span>}</span><Spark values={s.map((x) => x.reach + x.views)} color="var(--info)" /></div>
          <div className="sm-card sm-kpi sm-fade"><span className="row muted xs" style={{ fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.05em' }}><Icon name="heart" size={14} />Engagement</span><span className="row"><span className="v">{compact(T.engagement)}</span>{pct(T.engagement, d.prev.engagement) != null && <span className={'sm-delta ' + ((pct(T.engagement, d.prev.engagement) ?? 0) >= 0 ? 'up' : 'down')}>{pct(T.engagement, d.prev.engagement)}%</span>}</span><Spark values={s.map((x) => x.engagement)} /></div>
          <Kpi icon="spark" label="Gor engagement / post" value={nf(T.posts ? T.engagement / T.posts : 0, 1)} note={T.reach ? 'reach er ' + nf((T.engagement / T.reach) * 100, 1) + '% react/comment korse' : 'react + comment + share + save'} />
        </div>

        <section className="sm-card tint stack">
          <span className="row"><Icon name="spark" style={{ color: 'var(--accent)' }} /><h3>Kokhon, ki post korle bhalo hoy</h3><span className="sm-badge" style={{ background: 'color-mix(in srgb, var(--good) 14%, transparent)', color: 'var(--good)' }}>FACT · nijer data</span></span>
          <div className="sm-grid sm-g3">
            <div className="stack" style={{ gap: 4 }}><span className="muted xs" style={{ fontWeight: 700 }}>SHOBCHEYE BHALO SHOMOY</span>{A.bestSlots.length ? A.bestSlots.map((x) => <span key={x.key} className="row"><b>{WEEKDAYS[x.weekday]} {slot(x.hour)}ta</b><span className="muted xs">gor {nf(x.avg_eng)} · {x.posts} post</span></span>) : <span className="muted sm-t">Ek ek shomoye 2+ post hole bolbo.</span>}</div>
            <div className="stack" style={{ gap: 4 }}><span className="muted xs" style={{ fontWeight: 700 }}>BHALO FORMAT</span>{A.byFormat.filter((x) => x.posts >= 2).slice(0, 3).map((x, i) => <span key={x.key} className="row"><b>{i === 0 ? '🏆 ' : ''}{FORMAT_LABEL[x.key] || x.key}</b><span className="muted xs">gor {nf(x.avg_eng)} · {x.posts} post</span></span>)}</div>
            <div className="stack" style={{ gap: 4 }}><span className="muted xs" style={{ fontWeight: 700 }}>BHALO DHORON</span>{A.byType.length ? A.byType.filter((x) => x.posts >= 2).slice(0, 3).map((x, i) => <span key={x.key} className="row"><b>{i === 0 ? '🏆 ' : ''}{TYPE_LABEL[x.key] || x.key}</b><span className="muted xs">gor {nf(x.avg_eng)} · {x.posts} post</span></span>) : <span className="muted sm-t">"Ideas" e analyze korle AI post er dhoron chinbe.</span>}</div>
          </div>
        </section>

        <div className="sm-grid sm-g2">
          <section className="sm-card stack">
            <h3>Best time heatmap</h3><span className="muted xs">Gaar rong = oi din-shomoye post er gor engagement beshi · sonkha = koyta post</span>
            <div className="sm-scroll-x">
              <table className="sm-heat" style={{ borderCollapse: 'separate', borderSpacing: 4 }}>
                <thead><tr><th />{[0, 3, 6, 9, 12, 15, 18, 21].map((h) => <th key={h} className="muted xs" style={{ fontWeight: 600 }}>{slot(h)}</th>)}</tr></thead>
                <tbody>{[6, 0, 1, 2, 3, 4, 5].map((w) => (
                  <tr key={w}><th className="muted xs" style={{ textAlign: 'left', fontWeight: 600, paddingRight: 6 }}>{WEEKDAYS[w]}</th>
                    {[0, 3, 6, 9, 12, 15, 18, 21].map((h) => { const c = heatAt(w, h); const k = c ? c.avg_eng / heatMax : 0; return <td key={h} title={c ? WEEKDAYS[w] + ' ' + slot(h) + ' · gor ' + nf(c.avg_eng, 1) + ' · ' + c.posts + ' post' : 'post nai'} style={{ background: c ? `color-mix(in srgb, var(--accent) ${12 + k * 88}%, transparent)` : 'color-mix(in srgb, var(--soft) 80%, transparent)', color: k > 0.55 ? '#fff' : 'var(--muted)' }}>{c ? c.posts : ''}</td>; })}
                  </tr>))}
                </tbody>
              </table>
            </div>
            <div className="row muted xs">Kom<span style={{ width: 120, height: 8, borderRadius: 4, background: 'linear-gradient(90deg, color-mix(in srgb, var(--accent) 12%, transparent), var(--accent))' }} />Beshi</div>
          </section>
          <section className="sm-card stack"><h3>Kon ghontay post korle koto engagement</h3><span className="muted xs">Gaar bar = shobcheye bhalo ghonta · mouse rakhle details</span><HourChart rows={A.byHour} best={bestH} /></section>
          <section className="sm-card stack"><h3>Format</h3>
            {A.byFormat.map((x) => { const m = Math.max(1, ...A.byFormat.map((y) => y.avg_eng)); return <div key={x.key} className="sm-hbar"><span className="row" style={{ gap: 6 }}><b>{FORMAT_LABEL[x.key] || x.key}</b><span className="muted xs">{x.posts}</span></span><div className="track"><div className="fill" style={{ width: (x.avg_eng / m) * 100 + '%' }} /></div><span className="xs"><b>{nf(x.avg_eng, 1)}</b>{x.rate != null && <span className="muted"> · {nf(x.rate, 1)}%</span>}</span></div>; })}
          </section>
          <section className="sm-card stack"><h3>Post er dhoron</h3>
            {A.byType.length ? A.byType.map((x) => { const m = Math.max(1, ...A.byType.map((y) => y.avg_eng)); return <div key={x.key} className="sm-hbar"><span className="row" style={{ gap: 6 }}><b>{TYPE_LABEL[x.key] || x.key}</b><span className="muted xs">{x.posts}</span></span><div className="track"><div className="fill" style={{ width: (x.avg_eng / m) * 100 + '%', background: 'var(--info)' }} /></div><span className="xs"><b>{nf(x.avg_eng, 1)}</b></span></div>; }) : <p className="muted sm-t">"Ideas" tab e "Ekhon analyze korun" chaple AI protita post er dhoron (product, recipe, review…) chine nibe.</p>}
          </section>
        </div>

        {A.byNetwork.length > 1 && (
          <section className="sm-card stack"><h3>Platform onujayi</h3>
            <div className="sm-grid sm-g4">{A.byNetwork.map((x) => <div key={x.key} className="sm-acc" style={{ display: 'grid', gap: 4 }}><span className="row"><NetLogo net={x.key} size={20} /><b>{NET_NAME[x.key as Net] || x.key}</b></span><span className="sm-t">{x.posts} post · gor <b>{nf(x.avg_eng, 1)}</b></span>{x.avg_reach > 0 && <span className="muted xs">gor reach {compact(x.avg_reach)}</span>}</div>)}</div>
          </section>
        )}

        <section className="sm-card stack"><span className="row"><h3>Shobcheye bhalo post</h3><span className="muted xs">engagement onujayi · click korle post khulbe</span></span>
          <div className="sm-gal">{A.top.map((p) => <PostCard key={p.network + p.ext_id} p={p} />)}</div>
          {A.weak.length > 0 && <><h3 style={{ marginTop: 8 }}>Kom bhalo korse</h3><div className="sm-gal">{A.weak.map((p) => <PostCard key={p.network + p.ext_id} p={p} />)}</div></>}
        </section>

        <div className="sm-grid sm-g2">
          <section className="sm-card stack"><h3>Follower</h3><Followers rows={d.followers} /></section>
          {d.audience.some((a) => a.age_gender?.length || a.city?.length) ? d.audience.map((a) => (
            <section key={a.account_doc} className="sm-card stack"><span className="row"><NetLogo net="instagram" size={18} /><h3>Instagram follower ke</h3></span>
              {(a.age_gender ?? []).sort((x, y) => x.key.localeCompare(y.key)).slice(0, 12).map((x) => { const m = Math.max(1, ...a.age_gender.map((y) => y.value)); return <div key={x.key} className="sm-hbar"><span className="xs">{x.key.replace(' F', ' · Nari').replace(' M', ' · Purush').replace(' U', ' · ?')}</span><div className="track"><div className="fill" style={{ width: (x.value / m) * 100 + '%', background: '#D6249F' }} /></div><span className="xs">{nf(x.value)}</span></div>; })}
              {(a.city ?? []).length > 0 && <span className="muted xs">Shohor: {a.city.slice(0, 6).map((c) => c.key.split(',')[0] + ' ' + nf(c.value)).join(' · ')}</span>}
            </section>)) : <section className="sm-card stack"><h3>Audience</h3><p className="muted sm-t">Instagram e 100+ follower hole boyosh, lingo, shohor ekhane ashbe.</p></section>}
        </div>
      </>)}
    </div>
  );
}

function PostCard({ p }: { p: PostRow }) {
  return (
    <a className="sm-gcard" href={p.permalink} target="_blank" rel="noreferrer">
      {p.thumb ? <img className="img" src={p.thumb} alt="" loading="lazy" /> : <div className="img" style={{ display: 'grid', placeItems: 'center' }}><NetLogo net={p.network} size={36} /></div>}
      <div className="body">
        <span className="row muted xs" style={{ gap: 6 }}><NetLogo net={p.network} size={14} />{new Date(p.created).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
        <span className="clamp2">{p.text || <i className="muted">(lekha nai)</i>}</span>
        <span className="row xs" style={{ gap: 6 }}><span className="sm-badge">{FORMAT_LABEL[p.format] || p.format}</span>{p.content_type && <span className="sm-badge">{TYPE_LABEL[p.content_type] || p.content_type}</span>}</span>
        <span className="row xs" style={{ gap: 10, fontWeight: 600 }}><span className="row" style={{ gap: 3 }}><Icon name="heart" size={13} />{compact(p.metrics.reactions)}</span><span className="row" style={{ gap: 3 }}><Icon name="comment" size={13} />{compact(p.metrics.comments)}</span><span className="row" style={{ gap: 3 }}><Icon name="share" size={13} />{compact(p.metrics.shares)}</span>{(p.metrics.views || p.metrics.reach) ? <span className="row muted" style={{ gap: 3 }}><Icon name="eye" size={13} />{compact(p.metrics.views || p.metrics.reach)}</span> : null}</span>
      </div>
    </a>
  );
}
