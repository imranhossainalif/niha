'use client';
// Outreach CRM: one prospect — details, social profiles with one-click logging, timeline; also the "add" form and CSV import.
import { useEffect, useState } from 'react';
import { ACTIONS, actionLabel, platformOf, type Activity, type Profile, type Prospect } from '@/lib/outreach/core';
import { api, Modal, useToast } from '../social/ui';
import { dmy, opt, Pf, pf, Pill, Sel, short, type Ctx } from './shared';

const blank = (c: Ctx): Prospect => ({ business: 'lrf', name: '', profiles: [{ platform: 'linkedin', url: '' }], stage: 'cold', reply_status: 'none', sales_stage: 'prospect', owner: c.me, brand: c.settings.brands[0] || '', created_at: '' });
const withAny = (list: string[], v?: string) => (v && !list.includes(v) ? [...list, v] : list);

function Fields({ c, d, set }: { c: Ctx; d: Prospect; set: (patch: Partial<Prospect>) => void }) {
  const s = c.settings;
  const T = (k: keyof Prospect, label: string, ph = '') => <label>{label}<input className="sm-input" value={(d[k] as string) || ''} placeholder={ph} onChange={(e) => set({ [k]: e.target.value } as Partial<Prospect>)} /></label>;
  const S = (k: keyof Prospect, label: string, items: (string | [string, string])[]) => <label>{label}<Sel value={(d[k] as string) || ''} onChange={(v) => set({ [k]: v } as Partial<Prospect>)} items={items} any="—" /></label>;
  const reps = [...new Set([c.me, ...s.reps, ...c.prospects.map((p) => p.owner || '')].filter(Boolean))];
  return (
    <div className="or-form">
      {T('name', 'Nam *', 'Manusher nam')}{T('company', 'Business er nam')}
      {S('role', 'Role', withAny(s.roles, d.role))}{S('industry', 'Industry / business type', withAny(s.industries, d.industry))}
      {S('size', 'Business size (team)', withAny(s.sizes, d.size))}{T('country', 'Country', 'USA')}{T('city', 'City', 'Huntsville')}
      {T('website', 'Website')}{T('email', 'Email')}{T('phone', 'Phone / WhatsApp')}
      {S('source', 'Prothom kothay pelam (source)', s.platforms.map((x) => [x.id, x.label]))}
      {S('brand', 'Amader kon brand er jonno', withAny(s.brands, d.brand))}
      {S('owner', 'Rep (ke dekhbe)', reps.map((r) => [r, short(r)]))}
      {S('stage', 'Stage', s.stages.map((x) => [x.id, x.label]))}{S('reply_status', 'Reply status', s.reply_statuses.map((x) => [x.id, x.label]))}{S('sales_stage', 'Sales stage', s.sales_stages.map((x) => [x.id, x.label]))}
      <label>Deal value<input className="sm-input" type="number" value={d.deal_value || ''} onChange={(e) => set({ deal_value: Number(e.target.value) || 0 })} /></label>
      {d.sales_stage === 'lost' && S('lost_reason', 'Keno lost', withAny(s.lost_reasons, d.lost_reason))}
      <label>Tag (comma diye)<input className="sm-input" value={(d.tags || []).join(', ')} onChange={(e) => set({ tags: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} /></label>
      {s.fields.map((f) => { const v = d.custom?.[f.id]; const up = (x: unknown) => set({ custom: { ...(d.custom || {}), [f.id]: x } }); return (
        <label key={f.id}>{f.label}{f.type === 'select' ? <Sel value={String(v ?? '')} onChange={up} items={f.options || []} any="—" />
          : f.type === 'check' ? <span className="row"><input type="checkbox" checked={!!v} onChange={(e) => up(e.target.checked)} /> Hya</span>
          : <input className="sm-input" type={f.type === 'number' ? 'number' : f.type === 'date' ? 'date' : 'text'} value={String(v ?? '')} onChange={(e) => up(e.target.value)} />}</label>); })}
    </div>
  );
}
function ProfileRows({ c, d, set }: { c: Ctx; d: Prospect; set: (patch: Partial<Prospect>) => void }) {
  const up = (i: number, patch: Partial<Profile>) => set({ profiles: d.profiles.map((x, n) => (n === i ? { ...x, ...patch } : x)) });
  return (
    <div className="stack" style={{ gap: 6 }}>
      <b className="sm-t">Social profile (jotogulo platform e ache shob din)</b>
      {d.profiles.map((x, i) => (
        <div key={i} className="row">
          <Sel value={x.platform} onChange={(v) => up(i, { platform: v })} items={c.settings.platforms.map((p) => [p.id, p.label])} className="sm-input" />
          <input className="sm-input grow" style={{ minWidth: 220, width: 'auto' }} placeholder="Profile link (https://…)" value={x.url} onChange={(e) => { const url = e.target.value; const g = platformOf(url); up(i, { url, ...(g !== 'other' && !x.url ? { platform: g } : {}) }); }} />
          <label className="row xs muted" style={{ gap: 4 }}><input type="checkbox" checked={!!x.connected} onChange={(e) => up(i, { connected: e.target.checked })} />Connected</label>
          <button className="sm-btn ghost sm danger" onClick={() => set({ profiles: d.profiles.filter((_, n) => n !== i) })}>✕</button>
        </div>))}
      <div><button className="sm-btn sm" onClick={() => set({ profiles: [...d.profiles, { platform: c.settings.platforms.find((p) => !d.profiles.some((x) => x.platform === p.id))?.id || 'other', url: '' }] })}>+ Arekta platform</button></div>
    </div>
  );
}

export function AddProspect({ c, onClose, onSaved }: { c: Ctx; onClose: () => void; onSaved: (p: Prospect) => void }) {
  const toast = useToast();
  const [d, setD] = useState<Prospect>(() => blank(c));
  const [busy, setBusy] = useState(false); const [dup, setDup] = useState<Prospect | null>(null);
  const save = async (force = false) => {
    if (!d.name.trim() && !(d.company || '').trim()) return toast('Nam ba business er nam din', 'err');
    setBusy(true);
    try {
      const r = await fetch('/api/outreach/prospects', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...d, profiles: d.profiles.filter((x) => x.url.trim()), force }) });
      const j = await r.json();
      if (r.status === 409) { setDup(j.duplicate); return; }
      if (!r.ok) throw new Error(j?.error?.message || 'Save hoyni');
      toast('Prospect add hoyeche'); onSaved(j.prospect);
    } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  return (
    <Modal onClose={onClose} width={860}>
      <div className="stack" style={{ padding: 18, gap: 14 }}>
        <h2>Notun prospect</h2>
        <ProfileRows c={c} d={d} set={(p) => setD({ ...d, ...p })} />
        <Fields c={c} d={d} set={(p) => setD({ ...d, ...p })} />
        <label className="or-f">Note<textarea className="sm-input" rows={2} value={d.notes || ''} onChange={(e) => setD({ ...d, notes: e.target.value })} /></label>
        {dup && <div className="sm-warn">Ei link / email / phone diye age thekei ache: <b>{dup.name}</b>{dup.company ? ' (' + dup.company + ')' : ''} · rep {short(dup.owner)}. <button className="sm-btn sm" onClick={() => { onClose(); c.open(dup); }}>Oita khulun</button> <button className="sm-btn sm" onClick={() => save(true)}>Tobuo notun add korun</button></div>}
        <div className="row"><span className="grow" /><button className="sm-btn" onClick={onClose}>Batil</button><button className="sm-btn primary" disabled={busy} onClick={() => save()}>{busy ? 'Save hocche…' : 'Save'}</button></div>
      </div>
    </Modal>
  );
}

export function ImportBox({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const toast = useToast();
  const [csv, setCsv] = useState(''); const [busy, setBusy] = useState(false);
  const run = async () => { setBusy(true); try { const r = await api<{ rows: number; added: number; duplicates: number; skipped: number }>('/api/outreach/import', { method: 'POST', json: { csv } }); toast(`${r.added} ta add hoyeche · ${r.duplicates} ta age thekei chilo · ${r.skipped} ta te nam nai`); onDone(); } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); } };
  return (
    <Modal onClose={onClose} width={760}>
      <div className="stack" style={{ padding: 18 }}>
        <h2>Import (CSV / Google Sheet)</h2>
        <p className="muted">Sheet theke header shoho row gulo copy kore ekhane paste korun. Column er nam: <code>name, company, role, industry, size, country, city, website, email, phone, brand, owner, tags, notes</code> ar profile link er jonno <code>linkedin, instagram, facebook, x, tiktok</code>. Je link age thekei ache, seta bad jabe.</p>
        <textarea className="sm-input" rows={10} placeholder={'name,company,city,country,industry,linkedin,instagram\nJohn Smith,Smith Roofing,Huntsville,USA,Roofing,https://linkedin.com/in/johnsmith,'} value={csv} onChange={(e) => setCsv(e.target.value)} />
        <div className="row"><span className="grow" /><button className="sm-btn" onClick={onClose}>Batil</button><button className="sm-btn primary" disabled={busy || !csv.trim()} onClick={run}>{busy ? 'Import hocche…' : 'Import'}</button></div>
      </div>
    </Modal>
  );
}

export function ProspectView({ c, id, onClose, onChanged, onDeleted }: { c: Ctx; id: string; onClose: () => void; onChanged: (p: Prospect) => void; onDeleted: () => void }) {
  const toast = useToast(); const s = c.settings;
  const live = c.prospects.find((p) => p.id === id);
  const [d, setD] = useState<Prospect | null>(live || null);
  const [dirty, setDirty] = useState(false);
  const [acts, setActs] = useState<Activity[] | null>(null);
  const [tab, setTab] = useState<'log' | 'edit'>('log');
  const [sender, setSender] = useState<Record<string, string>>(() => { try { return JSON.parse(localStorage.getItem('bos_or_sender') || '{}'); } catch { return {}; } });
  const [note, setNote] = useState(''); const [when, setWhen] = useState(''); const [sent, setSent] = useState('positive'); const [tpl, setTpl] = useState('');
  const loadActs = () => api<{ activities: Activity[] }>('/api/outreach/prospects/' + id).then((r) => setActs(r.activities)).catch(() => setActs([]));
  useEffect(() => { loadActs(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);
  useEffect(() => { if (live && !dirty) setD(live); }, [live, dirty]);
  if (!d) return null;
  const set = (patch: Partial<Prospect>) => { setD({ ...d, ...patch }); setDirty(true); };
  const save = async (patch?: Partial<Prospect>) => {
    try { const r = await api<{ prospect: Prospect }>('/api/outreach/prospects/' + id, { method: 'PATCH', json: patch || { ...d, profiles: d.profiles.filter((x) => x.url.trim() || x.out || x.back || x.msgs) } }); setDirty(false); setD(r.prospect); onChanged(r.prospect); toast('Save hoyeche'); }
    catch (e: any) { toast(e.message, 'err'); }
  };
  const log = async (type: string, platform?: string, extra: Record<string, string> = {}) => {
    if (dirty) return toast('Age edit gulo Save korun', 'err');
    const at = when ? new Date(when + 'T12:00:00+06:00').toISOString() : undefined;
    const p = await c.log(d, type, platform, { sender: platform ? sender[platform] : undefined, note: note || undefined, template: tpl || undefined, at, ...extra });
    if (p) { setD(p); setNote(''); loadActs(); }
  };
  const pickSender = (platform: string, v: string) => { const n = { ...sender, [platform]: v }; setSender(n); try { localStorage.setItem('bos_or_sender', JSON.stringify(n)); } catch { /* private mode */ } };
  const del = async () => { if (!confirm(d.name + ' ke purapuri muche felben? Er shob log o muche jabe.')) return; try { await api('/api/outreach/prospects/' + id, { method: 'DELETE' }); toast('Muche fela hoyeche'); onDeleted(); } catch (e: any) { toast(e.message, 'err'); } };
  const custom = s.actions;
  return (
    <Modal onClose={onClose} width={980}>
      <div className="stack" style={{ padding: 18, gap: 14 }}>
        <div className="stack" style={{ gap: 4, paddingRight: 40 }}>
          <h2>{d.name}{d.company ? <span className="muted" style={{ fontWeight: 500 }}> · {d.company}</span> : null}</h2>
          <div className="row"><Pill o={opt(s.stages, d.stage)} fallback={d.stage} />{d.reply_status && d.reply_status !== 'none' && <Pill o={opt(s.reply_statuses, d.reply_status)} />}<Pill o={opt(s.sales_stages, d.sales_stage)} />
            <span className="muted xs">{[d.role, d.industry, d.size && d.size + ' jon', [d.city, d.country].filter(Boolean).join(', ')].filter(Boolean).join(' · ')}</span>
            <span className="muted xs">Source: {d.source ? pf(s, d.source).label : '—'} · Rep: {short(d.owner)} · {d.touches || 0} touch</span></div>
        </div>
        <div className="row"><div className="sm-seg" role="group"><button type="button" aria-pressed={tab === 'log'} onClick={() => setTab('log')}>Kaj log korun</button><button type="button" aria-pressed={tab === 'edit'} onClick={() => setTab('edit')}>Tothyo edit</button></div><span className="grow" />{dirty && <button className="sm-btn primary sm" onClick={() => save()}>Save</button>}</div>

        {tab === 'log' ? (<>
          <div className="row">
            <input className="sm-input grow" style={{ width: 'auto', minWidth: 200 }} placeholder="Note (icche hole) — porer button er shathe save hobe" value={note} onChange={(e) => setNote(e.target.value)} />
            {s.templates.length > 0 && <Sel value={tpl} onChange={setTpl} items={s.templates.map((t) => [t.id, t.label])} any="Template: —" className="sm-input" />}
            <label className="row xs muted" style={{ gap: 4 }}>Tarikh<input type="date" className="sm-input" style={{ width: 150 }} max={c.today} value={when} onChange={(e) => setWhen(e.target.value)} /></label>
          </div>
          <div className="sm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))' }}>
            {d.profiles.map((x, i) => { const P = pf(s, x.platform); const mine = s.senders.filter((z) => z.platform === x.platform); return (
              <div key={i} className="or-prof">
                <div className="row"><Pf s={s} id={x.platform} href={x.url} /><span className="muted xs grow" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{x.url || 'link nai'}</span></div>
                <div className="row xs">
                  <span className="or-pill">{x.back ? '✓ ' + P.back + ' ' + dmy(x.back) : x.out ? '… ' + P.connect + ' pathano ' + dmy(x.out) : P.connect + ' hoyni'}</span>
                  <span className="or-pill">{x.msgs ? 'Msg ' + x.msgs + ' · ' + dmy(x.last_msg) : 'Message jay ni'}</span>
                  {x.replied && <span className="or-pill" style={{ color: 'var(--good)' }}>Reply {dmy(x.replied)}</span>}
                </div>
                {mine.length > 0 && <Sel value={sender[x.platform] || ''} onChange={(v) => pickSender(x.platform, v)} items={mine.map((z) => [z.id, z.name])} any="Amader kon account theke?" />}
                <div className="row">
                  {!x.out && !x.back && <button className="sm-btn sm soft" onClick={() => log('connect', x.platform)}>{P.connect} pathiyechi</button>}
                  {!x.back && <button className="sm-btn sm soft" onClick={() => log('accepted', x.platform)}>{P.back}</button>}
                  {x.out && !x.back && <button className="sm-btn sm" onClick={() => log('withdrawn', x.platform)}>Tule niyechi</button>}
                  <button className="sm-btn sm primary" onClick={() => log('msg', x.platform)}>Msg {(x.msgs || 0) + 1} pathiyechi</button>
                </div>
                <div className="row">
                  <Sel value={sent} onChange={setSent} items={s.reply_statuses.filter((z) => z.id !== 'none').map((z) => [z.id, z.label])} className="sm-input" />
                  <button className="sm-btn sm" style={{ borderColor: 'var(--good)', color: 'var(--good)' }} onClick={() => log('reply', x.platform, { sentiment: sent })}>Reply peyechi</button>
                </div>
                <div className="row"><button className="sm-btn sm ghost" onClick={() => log('like', x.platform)}>Like</button><button className="sm-btn sm ghost" onClick={() => log('comment', x.platform)}>Comment</button><button className="sm-btn sm ghost" onClick={() => log('view', x.platform)}>Profile dekhechi</button>
                  {custom.map((a) => <button key={a.id} className="sm-btn sm ghost" onClick={() => log(a.id, x.platform)}>{a.label}</button>)}</div>
              </div>); })}
            {!d.profiles.length && <p className="muted">"Tothyo edit" e giye social profile link add korun.</p>}
          </div>
          <div className="row"><b className="sm-t">Sales:</b>{ACTIONS.filter((a) => a.kind === 'deal').map((a) => <button key={a.id} className="sm-btn sm" onClick={() => log(a.id)}>{a.label}</button>)}<button className="sm-btn sm" disabled={!note.trim()} onClick={() => log('note')}>Shudhu note save</button></div>
          <div className="or-form sm-card flat tint" style={{ padding: 12 }}>
            <label>Next action (er por ki korbo)<input className="sm-input" value={d.next_action || ''} placeholder="jemon: case study pathabo" onChange={(e) => set({ next_action: e.target.value })} /></label>
            <label>Kobe (ei tarikh porjonto "Aajker kaj" e ashbe na)<input type="date" className="sm-input" value={d.next_due || ''} onChange={(e) => set({ next_due: e.target.value })} /></label>
            <label>Tar somossa / pain (ja janlam)<input className="sm-input" value={d.pain || ''} onChange={(e) => set({ pain: e.target.value })} /></label>
            {d.awaiting && <label>Uttor diye diyechi?<button className="sm-btn sm" onClick={() => save({ awaiting: false } as any)}>Hya, "uttor baki" shoran</button></label>}
          </div>
          <div className="stack" style={{ gap: 6 }}><b className="sm-t">Timeline</b>
            {acts === null ? <span className="muted">Load hocche…</span> : !acts.length ? <span className="muted">Ekhono kichu log hoyni.</span> : (
              <div className="or-tl">{acts.map((a) => <div key={a.id}><div className="row xs"><b>{actionLabel(a.type, s)}{a.step ? ' · Msg ' + a.step : ''}{a.sentiment ? ' · ' + (opt(s.reply_statuses, a.sentiment)?.label || a.sentiment) : ''}</b>{a.platform && <Pf s={s} id={a.platform} />}<span className="muted">{new Date(a.at).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })} · {short(a.by)}{a.sender ? ' · ' + (s.senders.find((z) => z.id === a.sender)?.name || a.sender) : ''}</span></div>{a.note && <div className="sm-t">{a.note}</div>}</div>)}</div>)}
          </div>
        </>) : (<>
          <ProfileRows c={c} d={d} set={set} />
          <Fields c={c} d={d} set={set} />
          <label className="or-f">Note<textarea className="sm-input" rows={3} value={d.notes || ''} onChange={(e) => set({ notes: e.target.value })} /></label>
          <div className="row"><button className="sm-btn danger sm" onClick={del}>Prospect muchun</button><span className="grow" /><button className="sm-btn primary" disabled={!dirty} onClick={() => save()}>Save</button></div>
        </>)}
      </div>
    </Modal>
  );
}
