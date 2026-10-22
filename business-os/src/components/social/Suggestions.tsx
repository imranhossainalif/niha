'use client';
// Ideas: the AI plan (best times, format verdicts, content mix, ready posts, competitors, groups, what to avoid),
// competitors' Instagram posts, and the research settings.
import { useEffect, useState } from 'react';
import { Icon, NetLogo } from './icons';
import { api, compact, Empty, FORMAT_LABEL, Label, Skel, useToast } from './ui';
import type { Draft } from './Composer';

type Plan = {
  date: string; posts_analyzed: number; summary: string;
  best_times?: { network?: string; day: string; time: string; why: string; label?: string }[];
  formats?: { format: string; verdict: string; why?: string; label?: string }[];
  content_mix?: { type: string; share: string; why?: string }[];
  ideas?: { title: string; format: string; network?: string; when?: string; hook?: string; caption: string; hashtags?: string; why?: string; label?: string }[];
  competitors?: { name: string; note: string; link?: string }[];
  groups?: { name: string; link?: string; why: string; how?: string }[];
  avoid?: string[];
};
type Comp = { username: string; followers: number; posts: { created: string; text: string; format: string; likes: number; comments: number; permalink?: string; thumb?: string }[] };
type Res = { plan: Plan | null; settings: { ig_competitors: string[]; fb_competitors: string[]; groups: string[]; notes: string }; competitors: Comp[]; jobs: { kind: string; status: string; at: string; error?: string }[] };
const lines = (s: string) => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
const VERDICT: Record<string, [string, string]> = { 'beshi koro': ['Beshi korun', 'var(--good)'], chalao: ['Chalan', 'var(--info)'], 'kom koro': ['Kom korun', 'var(--bad)'], 'test koro': ['Test korun', '#8a63d2'] };

export function Suggestions({ business, onUse }: { business: string; onUse: (d: Draft) => void }) {
  const toast = useToast();
  const [r, setR] = useState<Res | null>(null); const [busy, setBusy] = useState('');
  const [form, setForm] = useState({ ig: '', fb: '', groups: '', notes: '' }); const [showSet, setShowSet] = useState(false);
  const load = () => api<Res>(`/api/social/${business}/research`).then((x) => { setR(x); setForm({ ig: x.settings.ig_competitors.join('\n'), fb: x.settings.fb_competitors.join('\n'), groups: x.settings.groups.join('\n'), notes: x.settings.notes || '' }); }).catch((e) => toast(e.message, 'err'));
  useEffect(() => { load(); }, [business]);
  const run = async (action: 'ideas' | 'sync') => { setBusy(action); try { const x = await api<{ queued: boolean; note?: string }>(`/api/social/${business}/research`, { method: 'POST', json: { action } }); toast(x.queued ? (action === 'ideas' ? 'AI research shuru — 3-8 min lagbe, tarpor ei page refresh korun' : 'Data ana hocche — 2-5 min') : x.note || 'Age theke cholche'); } catch (e) { toast((e as Error).message, 'err'); } setBusy(''); };
  const save = async () => { setBusy('save'); try { await api(`/api/social/${business}/research`, { method: 'PUT', json: { ig_competitors: lines(form.ig), fb_competitors: lines(form.fb), groups: lines(form.groups), notes: form.notes } }); toast('Save hoyeche'); setShowSet(false); load(); } catch (e) { toast((e as Error).message, 'err'); } setBusy(''); };
  const copy = async (t: string) => { try { await navigator.clipboard.writeText(t); toast('Caption copy hoyeche'); } catch { toast('Copy hoyni — haate select korun', 'err'); } };
  if (!r) return <div className="stack"><div className="sm-card stack"><Skel h={20} w={200} /><Skel h={60} /></div><div className="sm-grid sm-g3">{[0, 1, 2].map((i) => <div key={i} className="sm-card"><Skel h={120} /></div>)}</div></div>;
  const P = r.plan;
  const lastJob = r.jobs.find((j) => j.kind === 'social_ideas');
  const compPosts = r.competitors.flatMap((c) => c.posts.map((p) => ({ ...p, who: c.username }))).sort((a, b) => b.likes + 2 * b.comments - (a.likes + 2 * a.comments)).slice(0, 16);

  return (
    <div className="stack" style={{ gap: 14 }}>
      <section className="sm-card tint row" style={{ alignItems: 'flex-start' }}>
        <span style={{ width: 44, height: 44, borderRadius: 14, background: 'var(--accent)', color: '#fff', display: 'grid', placeItems: 'center', flex: 'none' }}><Icon name="spark" size={22} /></span>
        <div className="grow stack" style={{ gap: 4 }}>
          <h2>AI social media plan</h2>
          <span className="muted sm-t">{P ? 'Shesh analyze ' + P.date + ' · ' + P.posts_analyzed + ' ta nijer post + web research' : 'Ekhono analyze hoyni'} · nijei proti Budh o Shoni sokal e{lastJob && lastJob.status !== 'done' ? ' · shesh job: ' + lastJob.status : ''}</span>
          {lastJob?.status === 'failed' && lastJob.error && <span className="xs" style={{ color: 'var(--bad)' }}>{lastJob.error.slice(0, 160)}</span>}
        </div>
        <button className="sm-btn" onClick={() => setShowSet((x) => !x)}><Icon name="edit" size={14} />Research settings</button>
        <button className="sm-btn primary" onClick={() => run('ideas')} disabled={busy === 'ideas'}>{busy === 'ideas' ? <span className="sm-spin" /> : <Icon name="spark" size={14} />}Ekhon analyze korun</button>
      </section>

      {showSet && (
        <section className="sm-card stack sm-fade">
          <h3>Research settings</h3>
          <div className="sm-grid sm-g2">
            <label className="sm-label">Competitor er Instagram (username, protita line e)<textarea className="sm-input" rows={4} value={form.ig} onChange={(e) => setForm({ ...form, ig: e.target.value })} placeholder={'babyfoodbd\n@onno_brand'} /><span className="muted xs" style={{ fontWeight: 400 }}>Business/creator account er post shorasori ashe.</span></label>
            <label className="sm-label">Competitor er Facebook page (link)<textarea className="sm-input" rows={4} value={form.fb} onChange={(e) => setForm({ ...form, fb: e.target.value })} placeholder="https://facebook.com/…" /><span className="muted xs" style={{ fontWeight: 400 }}>Facebook onner post API te dey na — AI web e research korbe.</span></label>
            <label className="sm-label">Je group e share koren (link)<textarea className="sm-input" rows={3} value={form.groups} onChange={(e) => setForm({ ...form, groups: e.target.value })} /></label>
            <label className="sm-label">AI ke ja jante hobe<textarea className="sm-input" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Ei mashe Khichuri push korbo; kono offer nai" /></label>
          </div>
          <div className="row"><button className="sm-btn primary" onClick={save} disabled={busy === 'save'}>Save</button><button className="sm-btn" onClick={() => run('sync')} disabled={busy === 'sync'}><Icon name="refresh" size={14} />Competitor er post anun</button></div>
        </section>
      )}

      {!P ? <Empty icon="spark" title="Ekhono AI plan nai">"Ekhon analyze korun" chapun — AI apnar post er data, competitor ar web research dekhe best time, format, content mix ar ready caption dibe. 3-8 minute lage.</Empty> : (<>
        <section className="sm-card stack sm-fade"><h3>Mul kotha</h3>
          <div className="stack" style={{ gap: 6 }}>{P.summary.split('\n').filter((l) => l.trim()).map((l, i) => { const m = /^\s*[-•]?\s*(FACT|HYPOTHESIS):?\s*(.*)$/.exec(l); return <div key={i} className="row" style={{ alignItems: 'flex-start', flexWrap: 'nowrap' }}>{m ? <Label k={m[1]} /> : <span className="sm-dot" style={{ background: 'var(--accent)', marginTop: 7 }} />}<span>{m ? m[2] : l.replace(/^\s*[-•]\s*/, '')}</span></div>; })}</div>
        </section>

        <div className="sm-grid sm-g3">
          <section className="sm-card stack sm-fade"><span className="row"><Icon name="clock" style={{ color: 'var(--accent)' }} /><h3>Kokhon post korben</h3></span>
            {(P.best_times ?? []).map((t, i) => <div key={i} className="sm-acc" style={{ display: 'grid', gap: 2 }}><span className="row"><b>{t.day} · {t.time}</b>{t.network && <span className="muted xs">{t.network}</span>}<span className="grow" /><Label k={t.label} /></span><span className="muted xs">{t.why}</span></div>)}</section>
          <section className="sm-card stack sm-fade"><span className="row"><Icon name="image" style={{ color: 'var(--accent)' }} /><h3>Kon format</h3></span>
            {(P.formats ?? []).map((f, i) => { const [l, c] = VERDICT[f.verdict] ?? [f.verdict, 'var(--muted)']; return <div key={i} className="sm-acc" style={{ display: 'grid', gap: 2 }}><span className="row"><b>{FORMAT_LABEL[f.format] || f.format}</b><span className="sm-badge" style={{ background: `color-mix(in srgb, ${c} 14%, transparent)`, color: c }}>{l}</span><span className="grow" /><Label k={f.label} /></span>{f.why && <span className="muted xs">{f.why}</span>}</div>; })}</section>
          <section className="sm-card stack sm-fade"><span className="row"><Icon name="chart" style={{ color: 'var(--accent)' }} /><h3>Shoptaher content mix</h3></span>
            {(P.content_mix ?? []).map((m, i) => { const n = parseInt(m.share) || 0; return <div key={i} className="stack" style={{ gap: 3 }}><span className="row sm-t"><b>{m.type}</b><span className="grow" /><b>{m.share}</b></span><div style={{ height: 6, borderRadius: 3, background: 'var(--soft)' }}><div style={{ height: 6, borderRadius: 3, width: Math.min(100, n) + '%', background: 'var(--accent)' }} /></div>{m.why && <span className="muted xs">{m.why}</span>}</div>; })}</section>
        </div>

        <section className="stack"><span className="row"><h2>Ready post idea</h2><span className="sm-badge">{(P.ideas ?? []).length}</span><span className="muted xs">"Post banan" chaple composer e caption boshe jabe</span></span>
          <div className="sm-gal" style={{ gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))' }}>
            {(P.ideas ?? []).map((x, i) => (
              <div key={i} className="sm-card stack sm-fade" style={{ gap: 8, animationDelay: i * 40 + 'ms' }}>
                <span className="row"><span className="sm-badge">{FORMAT_LABEL[x.format] || x.format}</span>{x.network && <span className="muted xs">{x.network}</span>}<span className="grow" /><Label k={x.label} /></span>
                <b style={{ fontFamily: 'var(--display)', fontSize: 15 }}>{x.title}</b>
                {x.when && <span className="row muted xs"><Icon name="clock" size={13} />{x.when}</span>}
                {x.hook && <span className="sm-t"><b>Hook:</b> {x.hook}</span>}
                <p className="sm-t clamp3" style={{ whiteSpace: 'pre-wrap', margin: 0, background: 'var(--soft)', padding: 10, borderRadius: 10 }}>{x.caption}</p>
                {x.hashtags && <span className="xs" style={{ color: 'var(--accent)' }}>{x.hashtags}</span>}
                {x.why && <span className="muted xs">Keno: {x.why}</span>}
                <div className="row"><button className="sm-btn primary sm" onClick={() => onUse({ text: x.caption + (x.hashtags ? '\n\n' + x.hashtags : ''), idea_label: x.label })}><Icon name="edit" size={13} />Post banan</button><button className="sm-btn sm ghost" onClick={() => copy(x.caption + (x.hashtags ? '\n\n' + x.hashtags : ''))}><Icon name="copy" size={13} />Copy</button></div>
              </div>))}
          </div>
        </section>

        <div className="sm-grid sm-g2">
          <section className="sm-card stack"><h3>Competitor ra ki korche</h3>
            {(P.competitors ?? []).map((c, i) => <div key={i} className="sm-acc" style={{ display: 'grid', gap: 2 }}><span className="row"><b>{c.name}</b>{c.link && <a className="lnk xs" href={c.link} target="_blank" rel="noreferrer">dekhun ↗</a>}</span><span className="muted xs">{c.note}</span></div>)}</section>
          <section className="sm-card stack"><h3>Group / page e share korun</h3><span className="muted xs">Meta API diye group e post kora jay na (2024 theke) — caption copy kore group e nije share korun.</span>
            {(P.groups ?? []).map((g, i) => <div key={i} className="sm-acc" style={{ display: 'grid', gap: 2 }}><span className="row"><b>{g.name}</b>{g.link && <a className="lnk xs" href={g.link} target="_blank" rel="noreferrer">khulun ↗</a>}</span><span className="muted xs">{g.why}{g.how ? ' · Ki post: ' + g.how : ''}</span></div>)}</section>
        </div>
        {!!P.avoid?.length && <section className="sm-card stack" style={{ borderColor: 'color-mix(in srgb, var(--bad) 30%, var(--line))' }}><span className="row"><Icon name="alert" style={{ color: 'var(--bad)' }} /><h3>Ja korben na</h3></span><div className="row">{P.avoid.map((a, i) => <span key={i} className="sm-badge" style={{ background: 'color-mix(in srgb, var(--bad) 10%, transparent)', color: 'var(--bad)' }}>{a}</span>)}</div></section>}
      </>)}

      {compPosts.length > 0 && (
        <section className="stack"><span className="row"><NetLogo net="instagram" size={20} /><h2>Competitor der Instagram e ja cholche</h2></span>
          <div className="sm-gal">{compPosts.map((p, i) => (
            <a key={i} className="sm-gcard" href={p.permalink} target="_blank" rel="noreferrer">
              {p.thumb ? <img className="img" src={p.thumb} alt="" loading="lazy" /> : <div className="img" />}
              <div className="body"><span className="muted xs">@{p.who} · {new Date(p.created).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {FORMAT_LABEL[p.format] || p.format}</span><span className="clamp2">{p.text}</span>
                <span className="row xs" style={{ gap: 10, fontWeight: 600 }}><span className="row" style={{ gap: 3 }}><Icon name="heart" size={13} />{compact(p.likes)}</span><span className="row" style={{ gap: 3 }}><Icon name="comment" size={13} />{compact(p.comments)}</span></span></div>
            </a>))}</div>
        </section>
      )}
    </div>
  );
}
