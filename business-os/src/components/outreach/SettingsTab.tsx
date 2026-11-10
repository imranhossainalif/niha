'use client';
// Outreach CRM settings: every list the team picks from, our own accounts and their limits, custom fields and actions.
import { useState } from 'react';
import type { CustomAction, CustomField, Opt, PlatformOpt, Sender, Settings } from '@/lib/outreach/core';
import { api, useToast } from '../social/ui';
import { Sel, type Ctx } from './shared';

const slug = (t: string) => t.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'x' + Date.now().toString(36);
const CORE = new Set(['cold', 'watching', 'engaging', 'connected', 'engaged', 'warm', 'hot', 'dormant', 'dnc', 'none', 'positive', 'neutral', 'negative', 'prospect', 'meeting', 'meeting_done', 'proposal', 'won', 'lost', 'linkedin', 'instagram', 'facebook', 'x', 'tiktok', 'email', 'phone', 'other']);

function Lines({ label, hint, value, onChange }: { label: string; hint?: string; value: string[]; onChange: (v: string[]) => void }) {
  return <label className="or-f">{label}<textarea className="sm-input" rows={Math.min(10, Math.max(3, value.length + 1))} value={value.join('\n')} onChange={(e) => onChange(e.target.value.split('\n').map((x) => x.trimStart()))} /><span className="xs">{hint || 'Proti line e ekta.'}</span></label>;
}
function Opts<T extends Opt>({ title, hint, list, onChange, extra }: { title: string; hint?: string; list: T[]; onChange: (l: T[]) => void; extra?: (o: T, up: (p: Partial<T>) => void) => React.ReactNode }) {
  const up = (i: number, p: Partial<T>) => onChange(list.map((x, n) => (n === i ? { ...x, ...p } : x)));
  return (
    <section className="sm-card stack"><h3>{title}</h3>{hint && <span className="muted xs">{hint}</span>}
      {list.map((o, i) => (
        <div key={o.id} className="row">
          <input type="color" value={o.color || '#8a9993'} onChange={(e) => up(i, { color: e.target.value } as Partial<T>)} style={{ width: 34, height: 34, border: 0, background: 'none', padding: 0 }} />
          <input className="sm-input" style={{ width: 200 }} value={o.label} onChange={(e) => up(i, { label: e.target.value } as Partial<T>)} />
          {extra?.(o, (p) => up(i, p))}
          {!CORE.has(o.id) && <button className="sm-btn ghost sm danger" onClick={() => onChange(list.filter((_, n) => n !== i))}>✕</button>}
        </div>))}
      <div><button className="sm-btn sm" onClick={() => { const label = prompt('Notun ta r nam?'); if (!label?.trim()) return; let id = slug(label); while (list.some((x) => x.id === id)) id += '2'; onChange([...list, { id, label: label.trim(), color: '#5F7A74' } as T]); }}>+ Notun</button></div>
    </section>
  );
}
const Num = ({ label, v, on }: { label: string; v: number | undefined; on: (n: number) => void }) => <label className="or-f">{label}<input type="number" min={0} className="sm-input" value={v ?? ''} onChange={(e) => on(Number(e.target.value) || 0)} /></label>;

export function SettingsTab({ c, onSaved }: { c: Ctx; onSaved: (s: Settings) => void }) {
  const toast = useToast();
  const [s, setS] = useState<Settings>(c.settings);
  const [busy, setBusy] = useState(false);
  const set = (p: Partial<Settings>) => setS({ ...s, ...p });
  const save = async () => {
    setBusy(true);
    const clean = (l: string[]) => [...new Set(l.map((x) => x.trim()).filter(Boolean))];
    try {
      const body: Settings = { ...s, industries: clean(s.industries), sizes: clean(s.sizes), roles: clean(s.roles), brands: clean(s.brands), reps: clean(s.reps), lost_reasons: clean(s.lost_reasons),
        senders: s.senders.filter((x) => x.name.trim()), fields: s.fields.filter((x) => x.label.trim()), actions: s.actions.filter((x) => x.label.trim()), templates: s.templates.filter((x) => x.label.trim()) };
      const r = await api<{ settings: Settings }>('/api/outreach/settings', { method: 'PUT', json: body });
      setS(r.settings); onSaved(r.settings); toast('Settings save hoyeche');
    } catch (e: any) { toast(e.message, 'err'); } finally { setBusy(false); }
  };
  if (!c.canAdmin) return <div className="sm-card">Settings shudhu owner/admin bodlate paren.</div>;
  const upSender = (i: number, p: Partial<Sender>) => set({ senders: s.senders.map((x, n) => (n === i ? { ...x, ...p } : x)) });
  const upField = (i: number, p: Partial<CustomField>) => set({ fields: s.fields.map((x, n) => (n === i ? { ...x, ...p } : x)) });
  const upAct = (i: number, p: Partial<CustomAction>) => set({ actions: s.actions.map((x, n) => (n === i ? { ...x, ...p } : x)) });
  const upTpl = (i: number, p: Partial<Settings['templates'][number]>) => set({ templates: s.templates.map((x, n) => (n === i ? { ...x, ...p } : x)) });
  return (
    <div className="sm-grid">
      <div className="sm-card tint row"><span className="grow">Ekhane ja add korben, ta prospect form, filter ar report e nije thekei chole ashbe. Bodlanor por <b>Save</b> chapun.</span><button className="sm-btn primary" disabled={busy} onClick={save}>{busy ? 'Save hocche…' : 'Save'}</button></div>

      <section className="sm-card stack"><h3>Amader account (je ID theke outreach hoy) + din-er limit</h3>
        <span className="muted xs">Limit boshale Dashboard e meter dekhabe. LinkedIn/Instagram official shonkha dey na — shadharon poramorsho: LinkedIn din e 15–25 request, shoptahe ~100. Nijer account er obostha bujhe boshan.</span>
        {s.senders.map((x, i) => (
          <div key={x.id} className="row">
            <Sel value={x.platform} onChange={(v) => upSender(i, { platform: v })} items={s.platforms.map((p) => [p.id, p.label])} className="sm-input" />
            <input className="sm-input" style={{ width: 190 }} placeholder="Account er nam" value={x.name} onChange={(e) => upSender(i, { name: e.target.value })} />
            <input className="sm-input" style={{ width: 120 }} type="number" placeholder="Request/din" value={x.day_connect || ''} onChange={(e) => upSender(i, { day_connect: Number(e.target.value) || 0 })} />
            <input className="sm-input" style={{ width: 130 }} type="number" placeholder="Request/7 din" value={x.week_connect || ''} onChange={(e) => upSender(i, { week_connect: Number(e.target.value) || 0 })} />
            <input className="sm-input" style={{ width: 120 }} type="number" placeholder="Message/din" value={x.day_msg || ''} onChange={(e) => upSender(i, { day_msg: Number(e.target.value) || 0 })} />
            <button className="sm-btn ghost sm danger" onClick={() => set({ senders: s.senders.filter((_, n) => n !== i) })}>✕</button>
          </div>))}
        <div><button className="sm-btn sm" onClick={() => set({ senders: [...s.senders, { id: 'acc_' + Date.now().toString(36), platform: 'linkedin', name: '', day_connect: 20, week_connect: 100, day_msg: 30 }] })}>+ Account</button></div>
      </section>

      <section className="sm-card stack"><h3>Target ar niyom</h3>
        <div className="or-form">
          <Num label="Rep proti din: request / follow" v={s.targets.connect} on={(n) => set({ targets: { ...s.targets, connect: n } })} />
          <Num label="Rep proti din: message" v={s.targets.msg} on={(n) => set({ targets: { ...s.targets, msg: n } })} />
          <Num label="Rep proti din: mot touch" v={s.targets.touch} on={(n) => set({ targets: { ...s.targets, touch: n } })} />
          <Num label="Koto din reply na ele follow-up" v={s.followup_days} on={(n) => set({ followup_days: n })} />
          <Num label="Shorbocho koyta message (Msg 1, 2, 3…)" v={s.max_steps} on={(n) => set({ max_steps: n })} />
          <Num label="Koto din pending thakle request tulte bolbe" v={s.pending_days} on={(n) => set({ pending_days: n })} />
          <Num label="Koto din jogajog na thakle 'thanda'" v={s.cooling_days} on={(n) => set({ cooling_days: n })} />
        </div>
      </section>

      <div className="sm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
        <section className="sm-card"><Lines label="Industry / business type" value={s.industries} onChange={(v) => set({ industries: v })} /></section>
        <section className="sm-card"><Lines label="Business size" value={s.sizes} onChange={(v) => set({ sizes: v })} /></section>
        <section className="sm-card"><Lines label="Role" value={s.roles} onChange={(v) => set({ roles: v })} /></section>
        <section className="sm-card"><Lines label="Amader brand" value={s.brands} onChange={(v) => set({ brands: v })} /></section>
        <section className="sm-card"><Lines label="Rep (team er email)" hint="Proti line e ekjon er login email." value={s.reps} onChange={(v) => set({ reps: v })} /></section>
        <section className="sm-card"><Lines label="Lost er karon" value={s.lost_reasons} onChange={(v) => set({ lost_reasons: v })} /></section>
      </div>

      <Opts<PlatformOpt> title="Platform" hint="Notun platform add korte paren (jemon Threads, Pinterest, Upwork). 'Request' ar 'Accept' er lekha platform onujayi bodlan." list={s.platforms} onChange={(l) => set({ platforms: l.map((x) => ({ ...x, connect: x.connect || 'Follow', back: x.back || 'Follow back' })) })}
        extra={(o, up) => <><input className="sm-input" style={{ width: 190 }} placeholder="Request er nam" value={o.connect || ''} onChange={(e) => up({ connect: e.target.value })} /><input className="sm-input" style={{ width: 170 }} placeholder="Accept er nam" value={o.back || ''} onChange={(e) => up({ back: e.target.value })} /></>} />
      <div className="sm-grid" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))' }}>
        <Opts title="Stage (shomporko)" list={s.stages} onChange={(l) => set({ stages: l })} />
        <Opts title="Reply status" list={s.reply_statuses} onChange={(l) => set({ reply_statuses: l })} />
        <Opts title="Sales stage" list={s.sales_stages} onChange={(l) => set({ sales_stages: l })} />
      </div>

      <section className="sm-card stack"><h3>Nijer field (prospect e notun tothyo rakhte)</h3>
        <span className="muted xs">Jemon: "Google review koyta", "Ads chalay?", "Budget". "Dropdown" hole filter ar report e-o ashbe.</span>
        {s.fields.map((x, i) => (
          <div key={x.id} className="row">
            <input className="sm-input" style={{ width: 210 }} placeholder="Field er nam" value={x.label} onChange={(e) => upField(i, { label: e.target.value })} />
            <Sel value={x.type} onChange={(v) => upField(i, { type: v as CustomField['type'] })} items={[['text', 'Lekha'], ['number', 'Shonkha'], ['select', 'Dropdown'], ['date', 'Tarikh'], ['link', 'Link'], ['check', 'Hya / Na']]} className="sm-input" />
            {x.type === 'select' && <input className="sm-input grow" style={{ width: 'auto', minWidth: 200 }} placeholder="Option gulo comma diye" value={(x.options || []).join(', ')} onChange={(e) => upField(i, { options: e.target.value.split(',').map((t) => t.trim()).filter(Boolean) })} />}
            <button className="sm-btn ghost sm danger" onClick={() => set({ fields: s.fields.filter((_, n) => n !== i) })}>✕</button>
          </div>))}
        <div><button className="sm-btn sm" onClick={() => set({ fields: [...s.fields, { id: 'f_' + Date.now().toString(36), label: '', type: 'text' }] })}>+ Field</button></div>
      </section>

      <section className="sm-card stack"><h3>Nijer action button (log korar jonno)</h3>
        <span className="muted xs">Jemon: "Story reply", "Voice note", "Loom pathano", "Group e comment". "Message" dile Msg 1/2/3 e gona hobe; "Touch" dile shudhu engagement.</span>
        {s.actions.map((x, i) => (
          <div key={x.id} className="row">
            <input className="sm-input" style={{ width: 230 }} placeholder="Button er nam" value={x.label} onChange={(e) => upAct(i, { label: e.target.value })} />
            <Sel value={x.kind} onChange={(v) => upAct(i, { kind: v as CustomAction['kind'] })} items={[['touch', 'Touch (engagement)'], ['msg', 'Message'], ['none', 'Shudhu note']]} className="sm-input" />
            <button className="sm-btn ghost sm danger" onClick={() => set({ actions: s.actions.filter((_, n) => n !== i) })}>✕</button>
          </div>))}
        <div><button className="sm-btn sm" onClick={() => set({ actions: [...s.actions, { id: 'a_' + Date.now().toString(36), label: '', kind: 'touch' }] })}>+ Action</button></div>
      </section>

      <section className="sm-card stack"><h3>Message template</h3>
        <span className="muted xs">Log korar shomoy kon template pathalen seta bachai korle pore bujha jabe kon ta bhalo kaj kore.</span>
        {s.templates.map((x, i) => (
          <div key={x.id} className="stack" style={{ gap: 6 }}>
            <div className="row"><input className="sm-input" style={{ width: 240 }} placeholder="Nam (jemon LI-Msg1-v2)" value={x.label} onChange={(e) => upTpl(i, { label: e.target.value })} /><button className="sm-btn sm" onClick={() => navigator.clipboard?.writeText(x.text)}>Copy</button><button className="sm-btn ghost sm danger" onClick={() => set({ templates: s.templates.filter((_, n) => n !== i) })}>✕</button></div>
            <textarea className="sm-input" rows={3} placeholder="Message er lekha" value={x.text} onChange={(e) => upTpl(i, { text: e.target.value })} />
          </div>))}
        <div><button className="sm-btn sm" onClick={() => set({ templates: [...s.templates, { id: 't_' + Date.now().toString(36), label: '', text: '' }] })}>+ Template</button></div>
      </section>
      <div className="row"><span className="grow" /><button className="sm-btn primary" disabled={busy} onClick={save}>{busy ? 'Save hocche…' : 'Save'}</button></div>
    </div>
  );
}
