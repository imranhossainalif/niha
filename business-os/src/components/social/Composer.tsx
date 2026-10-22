'use client';
// Post composer: pick accounts, write (or let AI write), add photos/video, preview, then Draft / Publish now / Schedule.
import { useMemo, useRef, useState } from 'react';
import { api, Avatar, Label, Modal, NetIcon, TYPE_LABEL, type Account, type MediaRef, type Net, type Post } from './ui';

const LIMIT: Record<Net, number> = { facebook: 63206, instagram: 2200 };
const toLocalInput = (iso?: string | null) => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };

export type Draft = Partial<Post> & { idea_label?: string };

export function Composer({ business, accounts, initial, defaultTime, onClose, onSaved }: {
  business: string; accounts: Account[]; initial?: Draft; defaultTime?: string; onClose: () => void; onSaved: (msg: string) => void;
}) {
  const editing = !!initial?.id;
  const [sel, setSel] = useState<string[]>(initial?.targets?.map((t) => t.account_id) ?? accounts.map((a) => a.id));
  const [text, setText] = useState(initial?.text ?? '');
  const [custom, setCustom] = useState<Record<string, string>>(Object.fromEntries((initial?.targets ?? []).filter((t) => t.text != null).map((t) => [t.account_id, t.text!])));
  const [media, setMedia] = useState<MediaRef[]>(initial?.media ?? []);
  const [link, setLink] = useState(initial?.link ?? '');
  const [labels, setLabels] = useState<string[]>(initial?.labels ?? []);
  const [ctype, setCtype] = useState(initial?.content_type ?? '');
  const [when, setWhen] = useState(toLocalInput(initial?.scheduled_at || defaultTime));
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const [aiOpen, setAiOpen] = useState(false); const [aiPrompt, setAiPrompt] = useState(''); const [tags, setTags] = useState<string[]>([]);
  const [preview, setPreview] = useState<string>(sel[0] ?? '');
  const file = useRef<HTMLInputElement>(null);
  const chosen = accounts.filter((a) => sel.includes(a.id));
  const nets = [...new Set(chosen.map((a) => a.network))];
  const textFor = (id: string) => custom[id] ?? text;
  const problems = useMemo(() => {
    const p: string[] = [];
    if (!chosen.length) p.push('Kon page/account e jabe bachai korun.');
    if (nets.includes('instagram') && !media.length) p.push('Instagram e chobi ba video lagbe.');
    if (nets.includes('instagram') && media.length > 10) p.push('Instagram e 10 tar beshi na.');
    if (nets.includes('facebook') && media.length > 1 && media.some((m) => m.mime.startsWith('video/'))) p.push('Facebook e video ekta-i dite hobe (chobir sathe na).');
    for (const a of chosen) if (textFor(a.id).length > LIMIT[a.network]) p.push(a.name + ': lekha ' + LIMIT[a.network] + ' okkhorer beshi.');
    if (!media.length && !text.trim() && !link) p.push('Kichu likhun ba chobi din.');
    return p;
  }, [chosen, nets, media, text, custom, link]);

  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setErr('');
    for (const f of Array.from(files)) {
      setBusy('Upload hocche: ' + f.name);
      try { const fd = new FormData(); fd.append('file', f); const m = await api<MediaRef>('/api/social/media', { method: 'POST', body: fd }); setMedia((x) => [...x, { id: m.id, url: m.url, mime: m.mime }]); }
      catch (e) { setErr((e as Error).message); }
    }
    setBusy('');
  }
  async function ai() {
    setBusy('AI likhche…'); setErr('');
    try { const r = await api<{ caption: string; hashtags: string[] }>('/api/social/caption', { method: 'POST', json: { prompt: aiPrompt, text, networks: nets, business } }); setText(r.caption); setTags(r.hashtags); setAiOpen(false); }
    catch (e) { setErr((e as Error).message); }
    setBusy('');
  }
  async function save(action: 'draft' | 'schedule' | 'now') {
    if (action !== 'draft' && problems.length) { setErr(problems.join(' ')); return; }
    if (action === 'schedule' && !when) { setErr('Kobe jabe seta din.'); return; }
    if (action === 'now' && !confirm('Ekhoni ' + chosen.map((a) => a.name).join(', ') + ' e post hobe. Thik?')) return;
    setBusy(action === 'now' ? 'Post hocche…' : 'Save hocche…'); setErr('');
    const body = { text, media, link: link || undefined, labels, content_type: ctype || undefined, action: action === 'now' && editing ? 'draft' : action,
      scheduled_at: action === 'schedule' ? new Date(when).toISOString() : null,
      targets: chosen.map((a) => ({ account_id: a.id, network: a.network, name: a.name, ...(custom[a.id] != null ? { text: custom[a.id] } : {}) })) };
    try {
      if (editing) {
        await api('/api/social/posts/' + initial!.id, { method: 'PATCH', json: body });
        if (action === 'now') { const r = await api<{ status: string }>('/api/social/posts/' + initial!.id + '/publish', { method: 'POST' }); onSaved(r.status === 'published' ? 'Post hoye geche ✓' : 'Kichu jaygay hoyni — calendar e dekhun'); return; }
      } else {
        const r = await api<{ status: string }>('/api/social/' + business + '/posts', { method: 'POST', json: body });
        if (action === 'now') { onSaved(r.status === 'published' ? 'Post hoye geche ✓' : 'Kichu jaygay hoyni — calendar e dekhun'); return; }
      }
      onSaved(action === 'draft' ? 'Draft save hoyeche' : 'Schedule hoyeche: ' + new Date(when).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
    } catch (e) { setErr((e as Error).message); setBusy(''); }
  }
  const pv = accounts.find((a) => a.id === preview && sel.includes(a.id)) ?? chosen[0];

  return (
    <Modal onClose={onClose} wide>
      <div className="grid gap-4 md:grid-cols-[1fr_340px]">
        <div className="grid content-start gap-3">
          <h2 className="text-lg font-semibold">{editing ? 'Post edit' : 'Notun post'} {initial?.idea_label && <Label k={initial.idea_label} />}</h2>
          {!accounts.length && <p className="text-sm" style={{ color: '#d64545' }}>Kono account connect kora nai — "Accounts" tab e age connect korun.</p>}
          <div className="flex flex-wrap gap-3">
            {accounts.map((a) => (
              <button key={a.id} type="button" title={a.name} onClick={() => { setSel((s) => (s.includes(a.id) ? s.filter((x) => x !== a.id) : [...s, a.id])); setPreview(a.id); }} className="flex items-center gap-2 text-sm" style={{ border: '1px solid var(--line)', borderRadius: 999, padding: '3px 10px 3px 3px', background: sel.includes(a.id) ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'transparent', borderColor: sel.includes(a.id) ? 'var(--accent)' : 'var(--line)' }}>
                <Avatar a={a} size={26} on={sel.includes(a.id)} />{a.username ? '@' + a.username : a.name}
              </button>
            ))}
          </div>
          <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 10, display: 'grid', gap: 8 }}>
            <textarea className="input" rows={8} value={text} onChange={(e) => setText(e.target.value)} placeholder="Ki likhben… (hook prothom line e, sheshe 'inbox korun')" style={{ border: 0, padding: 0, resize: 'vertical' }} />
            {!!tags.length && <div className="flex flex-wrap gap-1">{tags.map((t) => <button key={t} type="button" className="btn" style={{ padding: '1px 8px', fontSize: 12 }} onClick={() => setText((x) => x + (x.endsWith(' ') || !x ? '' : ' ') + (t.startsWith('#') ? t : '#' + t))}>{t.startsWith('#') ? t : '#' + t}</button>)}</div>}
            <div className="flex flex-wrap items-center gap-2">
              <button type="button" className="btn" onClick={() => setAiOpen((x) => !x)}>✨ AI Assist</button>
              <span className="muted text-xs" style={{ marginLeft: 'auto' }}>{text.length} okkhor{nets.includes('instagram') ? ' · Instagram limit 2200' : ''}</span>
            </div>
            {aiOpen && (
              <div className="grid gap-2">
                <input className="input" value={aiPrompt} onChange={(e) => setAiPrompt(e.target.value)} placeholder={text ? 'Ki bodlabo? (jemon: aro chhoto koro, emoji dao, Bangla te)' : 'Ki niye post? (jemon: Homemade Cerelac, 6 mash er baby, ingredients)'} onKeyDown={(e) => { if (e.key === 'Enter') ai(); }} />
                <div><button type="button" className="btn btn-primary" onClick={ai} disabled={!!busy}>Likho</button> <span className="muted text-xs">Health claim, offer ba dam AI nijer theke likhbe na.</span></div>
              </div>
            )}
            <div className="flex flex-wrap gap-2">
              {media.map((m, i) => (
                <div key={m.id} style={{ position: 'relative', width: 96, height: 96, borderRadius: 8, overflow: 'hidden', background: '#000' }}>
                  {m.mime.startsWith('video/') ? <video src={m.url} style={{ width: '100%', height: '100%', objectFit: 'cover' }} muted /> : <img src={m.url} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                  <button type="button" aria-label="Muchun" onClick={() => setMedia((x) => x.filter((y) => y.id !== m.id))} style={{ position: 'absolute', top: 2, right: 2, background: 'rgba(0,0,0,.6)', color: '#fff', borderRadius: 10, width: 20, height: 20, fontSize: 12 }}>✕</button>
                  {i > 0 && <button type="button" aria-label="Age" onClick={() => setMedia((x) => { const y = [...x]; [y[i - 1], y[i]] = [y[i], y[i - 1]]; return y; })} style={{ position: 'absolute', bottom: 2, left: 2, background: 'rgba(0,0,0,.6)', color: '#fff', borderRadius: 10, width: 20, height: 20, fontSize: 12 }}>‹</button>}
                </div>
              ))}
              <button type="button" onClick={() => file.current?.click()} onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); upload(e.dataTransfer.files); }} style={{ width: 96, height: 96, border: '2px dashed var(--line)', borderRadius: 8, fontSize: 28 }} className="muted">＋</button>
              <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" multiple hidden onChange={(e) => { upload(e.target.files); e.target.value = ''; }} />
            </div>
          </div>
          <details>
            <summary className="cursor-pointer text-sm font-semibold">Aro: link, label, post er dhoron, alada account e alada lekha</summary>
            <div className="mt-2 grid gap-2 sm:grid-cols-2">
              <label className="grid gap-1 text-sm">Link (Facebook)<input className="input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://kidscarebd.com/…" /></label>
              <label className="grid gap-1 text-sm">Post er dhoron (analysis er jonno)
                <select className="input" value={ctype} onChange={(e) => setCtype(e.target.value)}><option value="">— AI nijei bujhbe —</option>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select>
              </label>
              <label className="grid gap-1 text-sm sm:col-span-2">Label (koma diye)<input className="input" value={labels.join(', ')} onChange={(e) => setLabels(e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} placeholder="Cerelac, Puja offer" /></label>
              {chosen.map((a) => (
                <label key={a.id} className="grid gap-1 text-sm sm:col-span-2">
                  <span className="flex items-center gap-2"><NetIcon net={a.network} /> {a.name}: alada lekha <input type="checkbox" checked={custom[a.id] != null} onChange={(e) => setCustom((c) => { const n = { ...c }; if (e.target.checked) n[a.id] = text; else delete n[a.id]; return n; })} /></span>
                  {custom[a.id] != null && <textarea className="input" rows={4} value={custom[a.id]} onChange={(e) => setCustom((c) => ({ ...c, [a.id]: e.target.value }))} />}
                </label>
              ))}
            </div>
          </details>
          {(err || problems.length > 0) && <p className="text-sm" style={{ color: err ? '#d64545' : 'var(--muted)' }}>{err || problems.join(' ')}</p>}
          {busy && <p className="text-sm">{busy}</p>}
          <div className="flex flex-wrap items-center gap-2" style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <button type="button" className="btn" disabled={!!busy} onClick={() => save('draft')}>Draft</button>
            <button type="button" className="btn" disabled={!!busy || problems.length > 0} onClick={() => save('now')}>Ekhoni post</button>
            <input className="input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ width: 'auto' }} aria-label="Kobe" />
            <button type="button" className="btn btn-primary" disabled={!!busy || problems.length > 0} onClick={() => save('schedule')}>Schedule</button>
          </div>
        </div>
        <div className="grid content-start gap-2">
          <div className="flex items-center gap-2 text-sm"><b>Preview</b>
            <select className="input" style={{ width: 'auto' }} value={pv?.id ?? ''} onChange={(e) => setPreview(e.target.value)}>{chosen.map((a) => <option key={a.id} value={a.id}>{a.network === 'instagram' ? 'Instagram' : 'Facebook'} · {a.name}</option>)}</select>
          </div>
          {pv ? <PostPreview a={pv} text={textFor(pv.id)} media={media} link={link} /> : <p className="muted text-sm">Account bachai korle preview dekhabe.</p>}
        </div>
      </div>
    </Modal>
  );
}

export function PostPreview({ a, text, media, link }: { a: Account; text: string; media: MediaRef[]; link?: string }) {
  const first = media[0];
  const mediaBox = first && (first.mime.startsWith('video/')
    ? <video src={first.url} controls style={{ width: '100%', aspectRatio: a.network === 'instagram' ? '9/16' : 'auto', objectFit: 'cover', background: '#000' }} />
    : <div style={{ position: 'relative' }}><img src={first.url} alt="" style={{ width: '100%', aspectRatio: a.network === 'instagram' ? '4/5' : 'auto', objectFit: 'cover', display: 'block' }} />{media.length > 1 && <span style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,.6)', color: '#fff', borderRadius: 12, padding: '0 8px', fontSize: 12 }}>1/{media.length}</span>}</div>);
  const body = <p style={{ whiteSpace: 'pre-wrap', fontSize: 14, margin: 0 }}>{a.network === 'instagram' ? <><b>{a.username || a.name}</b> {text}</> : text}</p>;
  return (
    <div style={{ border: '1px solid var(--line)', borderRadius: 12, overflow: 'hidden', background: 'var(--panel)' }}>
      <div className="flex items-center gap-2" style={{ padding: 10 }}><Avatar a={a} size={34} /><div><b className="text-sm">{a.username || a.name}</b><div className="muted text-xs">{a.network === 'instagram' ? 'Instagram' : 'Ekhon · 🌐'}</div></div></div>
      {a.network === 'facebook' && <div style={{ padding: '0 10px 10px' }}>{body}{link && !media.length && <div className="muted text-xs" style={{ marginTop: 6, border: '1px solid var(--line)', borderRadius: 8, padding: 8 }}>🔗 {link}</div>}</div>}
      {mediaBox}
      {a.network === 'instagram' && <div style={{ padding: 10, display: 'grid', gap: 6 }}><div style={{ fontSize: 18 }}>♡ 💬 ➤</div>{body}</div>}
      {a.network === 'facebook' && <div className="muted flex justify-around text-xs" style={{ padding: 8, borderTop: '1px solid var(--line)' }}><span>👍 Like</span><span>💬 Comment</span><span>↪ Share</span></div>}
    </div>
  );
}
