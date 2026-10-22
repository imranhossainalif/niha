'use client';
// AI plan (best times, formats, content mix, ready ideas, competitor notes, groups) + competitor research settings
// and competitors' latest Instagram posts.
import { useEffect, useState } from 'react';
import { api, FORMAT_LABEL, Label, nf } from './ui';
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
type Comp = { username: string; name?: string; followers: number; picture?: string; asof: string; posts: { created: string; text: string; format: string; likes: number; comments: number; permalink?: string; thumb?: string }[] };
type Res = { plan: Plan | null; settings: { ig_competitors: string[]; fb_competitors: string[]; groups: string[]; notes: string }; competitors: Comp[]; jobs: { kind: string; status: string; at: string; error?: string }[] };
const lines = (s: string) => s.split(/\n|,/).map((x) => x.trim()).filter(Boolean);
const VERDICT: Record<string, string> = { 'beshi koro': '#1f9d6b', chalao: '#2f7fd1', 'kom koro': '#d64545', 'test koro': '#8a63d2' };

export function Suggestions({ business, onUse }: { business: string; onUse: (d: Draft) => void }) {
  const [r, setR] = useState<Res | null>(null); const [err, setErr] = useState(''); const [msg, setMsg] = useState('');
  const [form, setForm] = useState({ ig: '', fb: '', groups: '', notes: '' });
  const load = () => api<Res>(`/api/social/${business}/research`).then((x) => { setR(x); setForm({ ig: x.settings.ig_competitors.join('\n'), fb: x.settings.fb_competitors.join('\n'), groups: x.settings.groups.join('\n'), notes: x.settings.notes || '' }); }).catch((e) => setErr(e.message));
  useEffect(() => { load(); }, [business]);
  const run = async (action: 'ideas' | 'sync') => { setMsg('…'); try { const x = await api<{ queued: boolean; note?: string }>(`/api/social/${business}/research`, { method: 'POST', json: { action } }); setMsg(x.queued ? (action === 'ideas' ? 'AI research shuru korse — 3-8 min lagbe, tarpor refresh korun.' : 'Data ana hocche — 2-5 min.') : x.note || ''); } catch (e) { setMsg((e as Error).message); } };
  const saveSettings = async () => { setMsg('Save hocche…'); try { await api(`/api/social/${business}/research`, { method: 'PUT', json: { ig_competitors: lines(form.ig), fb_competitors: lines(form.fb), groups: lines(form.groups), notes: form.notes } }); setMsg('Save hoyeche. "Ekhon data anun" dile competitor er Instagram post ashbe.'); load(); } catch (e) { setMsg((e as Error).message); } };
  if (err) return <p className="card text-sm" style={{ color: '#d64545' }}>{err}</p>;
  if (!r) return <p className="card muted text-sm">Load hocche…</p>;
  const P = r.plan;
  const lastIdeas = r.jobs.find((j) => j.kind === 'social_ideas');
  const allPosts = r.competitors.flatMap((c) => c.posts.map((p) => ({ ...p, who: c.username, followers: c.followers }))).sort((a, b) => (b.likes + 2 * b.comments) - (a.likes + 2 * a.comments)).slice(0, 24);

  return (
    <div className="grid gap-3">
      <section className="card flex flex-wrap items-center gap-2">
        <div className="grid"><b>AI social media plan</b><span className="muted text-xs">{P ? 'Shesh analyze: ' + P.date + ' · ' + P.posts_analyzed + ' ta nijer post dekhe + web research' : 'Ekhono analyze hoyni'} · nijei proti Budh o Shoni sokal e{lastIdeas && lastIdeas.status !== 'done' ? ' · shesh job: ' + lastIdeas.status + (lastIdeas.error ? ' (' + lastIdeas.error.slice(0, 80) + ')' : '') : ''}</span></div>
        <button className="btn btn-primary" style={{ marginLeft: 'auto' }} onClick={() => run('ideas')}>✨ Ekhon analyze korun</button>
        {msg && <span className="text-sm">{msg}</span>}
      </section>
      {P && (<>
        <section className="card grid gap-2"><h3 className="font-semibold">Mul kotha</h3><div className="text-sm" style={{ whiteSpace: 'pre-wrap' }}>{P.summary}</div></section>
        <div className="grid gap-3 lg:grid-cols-3">
          <section className="card grid content-start gap-2"><h3 className="font-semibold">Kokhon post korben</h3>
            {(P.best_times ?? []).map((t, i) => <div key={i} className="text-sm"><b>{t.day} · {t.time}</b> {t.network && <span className="muted">({t.network})</span>} <Label k={t.label} /><div className="muted text-xs">{t.why}</div></div>)}</section>
          <section className="card grid content-start gap-2"><h3 className="font-semibold">Kon format</h3>
            {(P.formats ?? []).map((f, i) => <div key={i} className="text-sm"><b>{FORMAT_LABEL[f.format] || f.format}</b> <span style={{ color: VERDICT[f.verdict] || 'inherit', fontWeight: 600 }}>· {f.verdict}</span> <Label k={f.label} /><div className="muted text-xs">{f.why}</div></div>)}</section>
          <section className="card grid content-start gap-2"><h3 className="font-semibold">Content mix (shoptahe)</h3>
            {(P.content_mix ?? []).map((m, i) => <div key={i} className="text-sm"><b>{m.share}</b> {m.type}<div className="muted text-xs">{m.why}</div></div>)}</section>
        </div>
        <section className="card grid gap-2"><h3 className="font-semibold">Ready post idea ({(P.ideas ?? []).length})</h3>
          <div className="grid gap-3 md:grid-cols-2">
            {(P.ideas ?? []).map((x, i) => (
              <div key={i} className="grid content-start gap-1" style={{ border: '1px solid var(--line)', borderRadius: 10, padding: 10 }}>
                <div className="flex flex-wrap items-center gap-2"><b>{x.title}</b><Label k={x.label} /></div>
                <span className="muted text-xs">{FORMAT_LABEL[x.format] || x.format}{x.network ? ' · ' + x.network : ''}{x.when ? ' · ' + x.when : ''}</span>
                {x.hook && <span className="text-sm"><b>Hook:</b> {x.hook}</span>}
                <p className="text-sm" style={{ whiteSpace: 'pre-wrap', margin: 0 }}>{x.caption}</p>
                {x.hashtags && <span className="text-xs" style={{ color: 'var(--accent)' }}>{x.hashtags}</span>}
                {x.why && <span className="muted text-xs">Keno: {x.why}</span>}
                <div><button className="btn" onClick={() => onUse({ text: x.caption + (x.hashtags ? '\n\n' + x.hashtags : ''), idea_label: x.label })}>✍ Ei post banan</button></div>
              </div>))}
          </div>
        </section>
        <div className="grid gap-3 lg:grid-cols-2">
          <section className="card grid content-start gap-2"><h3 className="font-semibold">Competitor ra ki korche</h3>
            {(P.competitors ?? []).map((c, i) => <div key={i} className="text-sm"><b>{c.link ? <a className="link" href={c.link} target="_blank" rel="noreferrer">{c.name}</a> : c.name}</b><div className="muted text-xs">{c.note}</div></div>)}</section>
          <section className="card grid content-start gap-2"><h3 className="font-semibold">Group / page e share korar suggestion</h3>
            <p className="muted text-xs">Meta API diye group e post kora jay na (2024 theke bondho) — tai nije share korte hobe: caption copy kore group khulun.</p>
            {(P.groups ?? []).map((g, i) => <div key={i} className="text-sm"><b>{g.link ? <a className="link" href={g.link} target="_blank" rel="noreferrer">{g.name} ↗</a> : g.name}</b><div className="muted text-xs">{g.why}{g.how ? ' · Ki post: ' + g.how : ''}</div></div>)}</section>
        </div>
        {!!P.avoid?.length && <section className="card grid gap-1"><h3 className="font-semibold">Ja korben na</h3><ul className="text-sm" style={{ paddingLeft: 18, listStyle: 'disc' }}>{P.avoid.map((a, i) => <li key={i}>{a}</li>)}</ul></section>}
      </>)}
      {allPosts.length > 0 && (
        <section className="card grid gap-2"><h3 className="font-semibold">Competitor der Instagram e ja bhalo cholche</h3>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {allPosts.map((p, i) => (
              <a key={i} href={p.permalink} target="_blank" rel="noreferrer" className="grid content-start gap-1 text-sm" style={{ border: '1px solid var(--line)', borderRadius: 10, overflow: 'hidden' }}>
                {p.thumb && <img src={p.thumb} alt="" style={{ width: '100%', aspectRatio: '1', objectFit: 'cover' }} />}
                <div style={{ padding: 8, display: 'grid', gap: 4 }}><span className="muted text-xs">@{p.who} · {new Date(p.created).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })} · {FORMAT_LABEL[p.format] || p.format}</span>
                  <span style={{ display: '-webkit-box', WebkitLineClamp: 3, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>{p.text}</span>
                  <span className="text-xs">♡ {nf(p.likes)} · 💬 {nf(p.comments)}</span></div>
              </a>))}
          </div>
        </section>
      )}
      <section className="card grid gap-2">
        <h3 className="font-semibold">Research settings</h3>
        <div className="grid gap-2 md:grid-cols-2">
          <label className="grid gap-1 text-sm">Competitor er Instagram username (protita line e ekta)<textarea className="input" rows={4} value={form.ig} onChange={(e) => setForm({ ...form, ig: e.target.value })} placeholder={'babyfoodbd\n@onno_brand'} /><span className="muted text-xs">Shudhu business/creator account er post dekha jay.</span></label>
          <label className="grid gap-1 text-sm">Competitor er Facebook page (link ba naam)<textarea className="input" rows={4} value={form.fb} onChange={(e) => setForm({ ...form, fb: e.target.value })} placeholder="https://facebook.com/…" /><span className="muted text-xs">Facebook onno page er post API te dey na — AI web research e dekhbe.</span></label>
          <label className="grid gap-1 text-sm">Je group gulo te share koren (link)<textarea className="input" rows={3} value={form.groups} onChange={(e) => setForm({ ...form, groups: e.target.value })} /></label>
          <label className="grid gap-1 text-sm">AI ke ja jante hobe (offer, notun product, target)<textarea className="input" rows={3} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} placeholder="Ei mashe Khichuri push korbo; offer nai" /></label>
        </div>
        <div className="flex flex-wrap gap-2"><button className="btn btn-primary" onClick={saveSettings}>Save</button><button className="btn" onClick={() => run('sync')}>↻ Ekhon data anun</button></div>
      </section>
    </div>
  );
}
