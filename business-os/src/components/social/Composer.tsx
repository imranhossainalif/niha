'use client';
// Publer-style composer: account rail on the left, editor (shared text + per-network text, AI Assist, media with
// upload progress, YouTube/TikTok options), live preview on the right, and Draft / Post now / Schedule at the bottom.
import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon, NET_NAME, NetLogo, type Net } from './icons';
import { api, Avatar, Label, Modal, Seg, TYPE_LABEL, upload, useToast, WEEKDAYS, type Account, type MediaRef, type Post, type PostOptions } from './ui';

const LIMIT: Record<Net, number> = { facebook: 63206, instagram: 2200, youtube: 5000, tiktok: 2200 };
const toLocalInput = (iso?: string | null) => { if (!iso) return ''; const d = new Date(iso); d.setMinutes(d.getMinutes() - d.getTimezoneOffset()); return d.toISOString().slice(0, 16); };
const isVideo = (m: { mime: string }) => m.mime.startsWith('video/');
export type Draft = Partial<Post> & { idea_label?: string };
type Up = { key: string; name: string; p: number; err?: string };
export type BestSlot = { weekday: number; hour: number };

/** Next date-time (local) for a weekday + hour, at least 10 minutes from now. */
function nextSlot(weekday: number, hour: number) {
  const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(hour);
  let add = (weekday - d.getDay() + 7) % 7; if (add === 0 && d.getTime() < Date.now() + 10 * 60e3) add = 7;
  d.setDate(d.getDate() + add); return d;
}

export function Composer({ business, accounts, initial, defaultTime, best, onClose, onSaved }: {
  business: string; accounts: Account[]; initial?: Draft; defaultTime?: string; best?: BestSlot[]; onClose: () => void; onSaved: () => void;
}) {
  const toast = useToast();
  const editing = !!initial?.id;
  const [sel, setSel] = useState<string[]>(initial?.targets?.map((t) => t.account_id) ?? accounts.filter((a) => a.network === 'facebook' || a.network === 'instagram').map((a) => a.id));
  const [text, setText] = useState(initial?.text ?? '');
  const [custom, setCustom] = useState<Record<string, string>>(Object.fromEntries((initial?.targets ?? []).filter((t) => t.text != null).map((t) => [t.account_id, t.text!])));
  const [tab, setTab] = useState<string>('all');
  const [media, setMedia] = useState<MediaRef[]>(initial?.media ?? []);
  const [ups, setUps] = useState<Up[]>([]);
  const [link, setLink] = useState(initial?.link ?? '');
  const [labels, setLabels] = useState<string[]>(initial?.labels ?? []);
  const [ctype, setCtype] = useState(initial?.content_type ?? '');
  const [opt, setOpt] = useState<PostOptions>({ yt_privacy: 'public', yt_kids: false, tt_mode: 'inbox', tt_privacy: 'PUBLIC_TO_EVERYONE', ...(initial?.options ?? {}) });
  const [when, setWhen] = useState(toLocalInput(initial?.scheduled_at || defaultTime));
  const [busy, setBusy] = useState(''); const [err, setErr] = useState('');
  const [ai, setAi] = useState<{ open: boolean; prompt: string; tags: string[] }>({ open: false, prompt: '', tags: [] });
  const [pv, setPv] = useState<string>('');
  const [over, setOver] = useState(false);
  const file = useRef<HTMLInputElement>(null); const ta = useRef<HTMLTextAreaElement>(null);
  const chosen = accounts.filter((a) => sel.includes(a.id));
  const nets = [...new Set(chosen.map((a) => a.network))];
  const textFor = (id: string) => custom[id] ?? text;
  const curText = tab === 'all' ? text : textFor(tab);
  const setCur = (v: string) => (tab === 'all' ? setText(v) : setCustom((c) => ({ ...c, [tab]: v })));
  useEffect(() => { const el = ta.current; if (el) { el.style.height = 'auto'; el.style.height = Math.min(420, Math.max(150, el.scrollHeight)) + 'px'; } }, [curText]);
  useEffect(() => { if (tab !== 'all' && !sel.includes(tab)) setTab('all'); }, [sel, tab]);

  const problems = useMemo(() => {
    const p: string[] = [];
    if (!chosen.length) p.push('Kon account e jabe — bame theke bachai korun.');
    if (ups.some((u) => !u.err)) p.push('Upload shesh hote din…');
    if (nets.includes('instagram') && !media.length) p.push('Instagram e chobi ba video lagbe.');
    if (nets.includes('instagram') && media.length > 10) p.push('Instagram e 10 tar beshi na.');
    if (nets.includes('facebook') && media.length > 1 && media.some(isVideo)) p.push('Facebook e video ekta-i (chobir sathe na).');
    for (const n of ['youtube', 'tiktok'] as Net[]) if (nets.includes(n) && (media.length !== 1 || !isVideo(media[0]))) p.push(NET_NAME[n] + ' e ekta video lagbe (chobi na).');
    for (const a of chosen) if (textFor(a.id).length > LIMIT[a.network]) p.push(a.name + ' (' + NET_NAME[a.network] + '): lekha ' + LIMIT[a.network] + ' okkhorer beshi.');
    if (!media.length && !text.trim() && !link) p.push('Kichu likhun ba chobi/video din.');
    return p;
  }, [chosen, nets, media, text, custom, link, ups]);

  async function addFiles(files: FileList | File[] | null) {
    if (!files) return;
    for (const f of Array.from(files)) {
      const key = Math.random().toString(36).slice(2);
      setUps((u) => [...u, { key, name: f.name, p: 0 }]);
      try { const m = await upload(f, (p) => setUps((u) => u.map((x) => (x.key === key ? { ...x, p } : x)))); setMedia((x) => [...x, m]); setUps((u) => u.filter((x) => x.key !== key)); }
      catch (e) { setUps((u) => u.map((x) => (x.key === key ? { ...x, err: (e as Error).message } : x))); }
    }
  }
  async function runAi() {
    setBusy('ai'); setErr('');
    try { const r = await api<{ caption: string; hashtags: string[] }>('/api/social/caption', { method: 'POST', json: { prompt: ai.prompt, text: curText, networks: tab === 'all' ? nets : [accounts.find((a) => a.id === tab)?.network], business } }); setCur(r.caption); setAi({ open: false, prompt: '', tags: r.hashtags }); }
    catch (e) { setErr((e as Error).message); }
    setBusy('');
  }
  async function save(action: 'draft' | 'schedule' | 'now') {
    if (action !== 'draft' && problems.length) { setErr(problems[0]); return; }
    if (action === 'schedule' && !when) { setErr('Kobe jabe seta din.'); return; }
    if (action === 'now' && !confirm('Ekhoni ' + chosen.map((a) => NET_NAME[a.network] + ': ' + a.name).join(', ') + ' e post hobe. Thik?')) return;
    setBusy(action); setErr('');
    const body = { text, media, link: link || undefined, labels, content_type: ctype || undefined, options: opt, action: action === 'now' && editing ? 'draft' : action,
      scheduled_at: action === 'schedule' ? new Date(when).toISOString() : null,
      targets: chosen.map((a) => ({ account_id: a.id, network: a.network, name: a.name, ...(custom[a.id] != null ? { text: custom[a.id] } : {}) })) };
    try {
      let status = action;
      if (editing) { await api('/api/social/posts/' + initial!.id, { method: 'PATCH', json: body }); if (action === 'now') status = (await api<{ status: string }>('/api/social/posts/' + initial!.id + '/publish', { method: 'POST' })).status as never; }
      else status = (await api<{ status: string }>('/api/social/' + business + '/posts', { method: 'POST', json: body })).status as never;
      if (action === 'now') toast((status as string) === 'published' ? 'Post hoye geche ✓' : 'Kichu jaygay hoyni — calendar e dekhun', (status as string) === 'published' ? 'ok' : 'err');
      else toast(action === 'draft' ? 'Draft save hoyeche' : 'Schedule hoyeche · ' + new Date(when).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }));
      onSaved();
    } catch (e) { setErr((e as Error).message); setBusy(''); }
  }

  const quick: [string, Date][] = [];
  { const d = new Date(); d.setHours(20, 0, 0, 0); if (d.getTime() > Date.now() + 10 * 60e3) quick.push(['Aaj raat 8ta', d]); const k = new Date(); k.setDate(k.getDate() + 1); k.setHours(10, 0, 0, 0); quick.push(['Kal sokal 10ta', k]); }
  for (const b of (best ?? []).slice(0, 2)) quick.push(['★ ' + WEEKDAYS[b.weekday] + ' ' + String(b.hour).padStart(2, '0') + ':00', nextSlot(b.weekday, b.hour + 1)]);
  const preview = accounts.find((a) => a.id === (pv || (tab !== 'all' ? tab : '')) && sel.includes(a.id)) ?? chosen[0];
  const counts = chosen.map((a) => ({ a, n: textFor(a.id).length, max: LIMIT[a.network] }));

  return (
    <Modal onClose={onClose} width={1180}>
      <div className="sm-comp">
        <div className="sm-rail" aria-label="Accounts">
          {accounts.map((a) => (
            <button key={a.id} type="button" title={NET_NAME[a.network] + ' · ' + a.name} aria-pressed={sel.includes(a.id)} onClick={() => { setSel((s) => (s.includes(a.id) ? s.filter((x) => x !== a.id) : [...s, a.id])); setPv(a.id); }}>
              <Avatar a={a} size={38} />
            </button>
          ))}
          {!accounts.length && <span className="muted xs" style={{ padding: '0 6px', textAlign: 'center' }}>Account nai</span>}
        </div>

        <div className="sm-editor">
          <div className="row" style={{ paddingRight: 40 }}>
            <h2>{editing ? 'Post edit' : 'Notun post'}</h2>{initial?.idea_label && <Label k={initial.idea_label} />}
            <span className="grow" />
            {!!chosen.length && <span className="row muted xs">{nets.map((n) => <NetLogo key={n} net={n} size={16} />)} {chosen.length} account</span>}
          </div>
          {!accounts.length && <div className="sm-warn err"><Icon name="alert" />Kono account connect kora nai — "Accounts" e giye age connect korun.</div>}

          {chosen.length > 1 && (
            <div className="sm-seg small" role="group">
              <button type="button" aria-pressed={tab === 'all'} onClick={() => setTab('all')}>Shob account</button>
              {chosen.map((a) => <button key={a.id} type="button" aria-pressed={tab === a.id} onClick={() => { setTab(a.id); setPv(a.id); if (custom[a.id] == null) setCustom((c) => ({ ...c, [a.id]: text })); }}><NetLogo net={a.network} size={14} />{a.username || a.name}{custom[a.id] != null && custom[a.id] !== text ? ' •' : ''}</button>)}
            </div>
          )}
          <div className="sm-box">
            <textarea ref={ta} value={curText} onChange={(e) => setCur(e.target.value)} placeholder={tab === 'all' ? 'Ki likhben? Prothom line e hook, sheshe "inbox korun"…' : 'Shudhu ei account er jonno alada lekha'} aria-label="Post er lekha" />
            {!!ai.tags.length && <div className="row" style={{ padding: '0 12px 8px' }}>{ai.tags.map((t) => { const h = t.startsWith('#') ? t : '#' + t; return <button key={t} type="button" className="sm-chip plain" onClick={() => setCur(curText + (curText.endsWith(' ') || !curText ? '' : ' ') + h)}>{h}</button>; })}</div>}
            <div className="row" style={{ borderTop: '1px solid var(--line)', padding: '8px 10px' }}>
              <button type="button" className={'sm-btn sm ' + (ai.open ? 'soft' : 'ghost')} onClick={() => setAi((x) => ({ ...x, open: !x.open }))}><Icon name="spark" />AI Assist</button>
              <button type="button" className="sm-btn sm ghost" onClick={() => file.current?.click()}><Icon name="image" />Chobi / video</button>
              {tab !== 'all' && <button type="button" className="sm-btn sm ghost" onClick={() => setCustom((c) => { const n = { ...c }; delete n[tab]; return n; })}>Shob er moto korun</button>}
              <span className="grow" />
              {counts.map(({ a, n, max }) => <span key={a.id} className="row xs" title={a.name} style={{ gap: 4, color: n > max ? 'var(--bad)' : 'var(--muted)', fontWeight: 600 }}><NetLogo net={a.network} size={13} />{n}{max < 10000 ? '/' + max : ''}</span>)}
            </div>
            {ai.open && (
              <div className="row sm-fade" style={{ borderTop: '1px solid var(--line)', padding: 10 }}>
                <input className="sm-input grow" autoFocus value={ai.prompt} onChange={(e) => setAi((x) => ({ ...x, prompt: e.target.value }))} onKeyDown={(e) => { if (e.key === 'Enter') runAi(); }} placeholder={curText ? 'Ki bodlabo? (aro chhoto, emoji dao, Bangla te…)' : 'Ki niye post? (Homemade Cerelac, 6 mash+, ingredients…)'} style={{ flex: '1 1 240px' }} />
                <button type="button" className="sm-btn primary" onClick={runAi} disabled={busy === 'ai'}>{busy === 'ai' ? <span className="sm-spin" /> : <Icon name="spark" />}Likho</button>
                <span className="muted xs" style={{ flexBasis: '100%' }}>AI health claim, dam ba offer nijer theke likhbe na.</span>
              </div>
            )}
          </div>

          <div className="row" style={{ alignItems: 'flex-start' }} onDragOver={(e) => { e.preventDefault(); setOver(true); }} onDragLeave={() => setOver(false)} onDrop={(e) => { e.preventDefault(); setOver(false); addFiles(e.dataTransfer.files); }}>
            {media.map((m, i) => (
              <div key={m.id} className="sm-tile">
                {isVideo(m) ? <video src={m.url} muted /> : <img src={m.url} alt="" />}
                {isVideo(m) && <span className="sm-badge" style={{ position: 'absolute', left: 4, top: 4, background: 'rgba(0,0,0,.6)', color: '#fff' }}>Video</span>}
                <button type="button" className="x" aria-label="Muchun" onClick={() => setMedia((x) => x.filter((y) => y.id !== m.id))}>✕</button>
                {i > 0 && <button type="button" className="mv" aria-label="Age nin" onClick={() => setMedia((x) => { const y = [...x]; [y[i - 1], y[i]] = [y[i], y[i - 1]]; return y; })}>‹</button>}
              </div>
            ))}
            {ups.map((u) => (
              <div key={u.key} className="sm-tile" style={{ background: 'var(--soft)', display: 'grid', placeItems: 'center', padding: 8 }} title={u.name}>
                {u.err ? <span className="xs" style={{ color: 'var(--bad)', textAlign: 'center' }}>{u.err}<br /><button type="button" className="sm-btn sm ghost" onClick={() => setUps((x) => x.filter((y) => y.key !== u.key))}>Thik ache</button></span>
                  : <><span className="xs muted">{Math.round(u.p * 100)}%</span><div className="prog"><i style={{ width: u.p * 100 + '%', background: 'var(--accent)' }} /></div></>}
              </div>
            ))}
            <button type="button" className={'sm-drop' + (over ? ' over' : '')} onClick={() => file.current?.click()}><span><Icon name="plus" size={22} /><br />Chobi / video<br /><span style={{ fontWeight: 400 }}>ba ekhane tene anun</span></span></button>
            <input ref={file} type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime" multiple hidden onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }} />
          </div>

          {(nets.includes('youtube') || nets.includes('tiktok')) && (
            <div className="sm-grid sm-g2 sm-fade">
              {nets.includes('youtube') && (
                <div className="sm-card flat stack" style={{ padding: 12 }}>
                  <span className="row" style={{ fontWeight: 700 }}><NetLogo net="youtube" size={18} />YouTube</span>
                  <label className="sm-label">Title (100 okkhor)<input className="sm-input" maxLength={100} value={opt.yt_title ?? ''} onChange={(e) => setOpt({ ...opt, yt_title: e.target.value })} placeholder={(text.split('\n')[0] || 'Video er naam').slice(0, 100)} /></label>
                  <div className="row">
                    <select className="sm-input" style={{ width: 'auto' }} value={opt.yt_privacy} onChange={(e) => setOpt({ ...opt, yt_privacy: e.target.value as PostOptions['yt_privacy'] })} aria-label="Ke dekhbe"><option value="public">Public</option><option value="unlisted">Unlisted</option><option value="private">Private</option></select>
                    <label className="row xs" style={{ fontWeight: 600 }}><input type="checkbox" checked={!!opt.yt_kids} onChange={(e) => setOpt({ ...opt, yt_kids: e.target.checked })} />Bachchader jonno banano (Made for kids)</label>
                  </div>
                  <span className="muted xs">Ma-babader jonno video hole tick diben na. 3 min er kom vertical video Shorts hoye jay.</span>
                </div>
              )}
              {nets.includes('tiktok') && (
                <div className="sm-card flat stack" style={{ padding: 12 }}>
                  <span className="row" style={{ fontWeight: 700 }}><NetLogo net="tiktok" size={18} />TikTok</span>
                  <Seg value={opt.tt_mode ?? 'inbox'} onChange={(v) => setOpt({ ...opt, tt_mode: v })} small items={[['inbox', 'TikTok app e draft'], ['direct', 'Shorasori post']]} />
                  {opt.tt_mode === 'direct' && <select className="sm-input" value={opt.tt_privacy} onChange={(e) => setOpt({ ...opt, tt_privacy: e.target.value })} aria-label="Ke dekhbe"><option value="PUBLIC_TO_EVERYONE">Shobai</option><option value="FOLLOWER_OF_CREATOR">Follower ra</option><option value="MUTUAL_FOLLOW_FRIENDS">Bondhu ra</option><option value="SELF_ONLY">Shudhu ami</option></select>}
                  <span className="muted xs">{opt.tt_mode === 'direct' ? 'TikTok audit er age shorasori post "Only me" hoye jay.' : 'Video TikTok app e notification hishebe jabe — sound/effect diye okhan theke post korun.'}</span>
                </div>
              )}
            </div>
          )}

          <details>
            <summary className="row" style={{ cursor: 'pointer', fontWeight: 700, fontSize: 13 }}><Icon name="chevR" size={14} />Aro: link, label, post er dhoron</summary>
            <div className="sm-grid sm-g2" style={{ marginTop: 10 }}>
              <label className="sm-label">Link (Facebook)<input className="sm-input" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://…" /></label>
              <label className="sm-label">Post er dhoron (analysis er jonno)<select className="sm-input" value={ctype} onChange={(e) => setCtype(e.target.value)}><option value="">AI nijei bujhbe</option>{Object.entries(TYPE_LABEL).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="sm-label" style={{ gridColumn: '1 / -1' }}>Label (koma diye)<input className="sm-input" value={labels.join(', ')} onChange={(e) => setLabels(e.target.value.split(',').map((x) => x.trim()).filter(Boolean))} placeholder="Cerelac, Puja" /></label>
            </div>
          </details>

          {err ? <div className="sm-warn err sm-fade"><Icon name="alert" />{err}</div> : problems.length > 0 && chosen.length > 0 && <div className="sm-warn"><Icon name="alert" />{problems[0]}{problems.length > 1 ? ' (+' + (problems.length - 1) + ')' : ''}</div>}
        </div>

        <div className="sm-preview">
          <div className="row" style={{ marginBottom: 10, paddingRight: 40 }}><b>Preview</b><span className="grow" />
            <div className="row" style={{ gap: 4 }}>{chosen.map((a) => <button key={a.id} type="button" className="sm-btn sm ghost icon" aria-pressed={preview?.id === a.id} style={{ background: preview?.id === a.id ? 'var(--panel)' : undefined, boxShadow: preview?.id === a.id ? 'var(--sh1)' : undefined }} onClick={() => setPv(a.id)} title={a.name}><NetLogo net={a.network} size={18} /></button>)}</div>
          </div>
          {preview ? <PostPreview a={preview} text={textFor(preview.id)} media={media} link={link} title={opt.yt_title} /> : <p className="muted sm-t">Account bachai korle preview dekhabe.</p>}
        </div>
      </div>

      <div className="sm-foot">
        <button type="button" className="sm-btn ghost" disabled={!!busy} onClick={() => save('draft')}>{busy === 'draft' ? <span className="sm-spin" /> : null}Draft</button>
        <button type="button" className="sm-btn" disabled={!!busy || problems.length > 0} onClick={() => save('now')}>{busy === 'now' ? <span className="sm-spin" /> : <Icon name="send" />}Ekhoni post</button>
        <span className="grow" />
        <div className="row" style={{ gap: 6 }}>{quick.map(([l, d]) => <button key={l} type="button" className="sm-chip plain" aria-pressed={when === toLocalInput(d.toISOString())} onClick={() => setWhen(toLocalInput(d.toISOString()))}>{l}</button>)}</div>
        <input className="sm-input" type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} style={{ width: 'auto' }} aria-label="Kobe" />
        <button type="button" className="sm-btn primary" disabled={!!busy || problems.length > 0} onClick={() => save('schedule')}>{busy === 'schedule' ? <span className="sm-spin" /> : <Icon name="clock" />}Schedule</button>
      </div>
    </Modal>
  );
}

export function PostPreview({ a, text, media, link, title }: { a: Account; text: string; media: MediaRef[]; link?: string; title?: string }) {
  const m = media[0];
  const vis = (style: React.CSSProperties) => m ? (isVideo(m) ? <video src={m.url} muted autoPlay loop playsInline style={{ ...style, objectFit: 'cover', background: '#000', display: 'block' }} /> : <img src={m.url} alt="" style={{ ...style, objectFit: 'cover', display: 'block' }} />) : <div style={{ ...style, background: 'var(--soft)', display: 'grid', placeItems: 'center' }} className="muted xs">Video / chobi</div>;
  const name = a.username || a.name;
  if (a.network === 'tiktok') return (
    <div className="sm-fade" style={{ position: 'relative', borderRadius: 18, overflow: 'hidden', background: '#000', maxWidth: 300, margin: '0 auto', boxShadow: 'var(--sh2)' }}>
      {vis({ width: '100%', aspectRatio: '9/16' })}
      <div style={{ position: 'absolute', left: 0, right: 0, bottom: 0, padding: '40px 12px 14px', background: 'linear-gradient(transparent, rgba(0,0,0,.75))', color: '#fff', fontSize: 13 }}><b>@{name}</b><div className="clamp3" style={{ whiteSpace: 'pre-wrap' }}>{text}</div></div>
      <div style={{ position: 'absolute', right: 10, bottom: 90, display: 'grid', gap: 14, color: '#fff', justifyItems: 'center' }}><Icon name="heart" size={26} /><Icon name="comment" size={26} /><Icon name="share" size={26} /></div>
    </div>);
  if (a.network === 'youtube') return (
    <div className="sm-fade sm-card" style={{ padding: 0, overflow: 'hidden' }}>
      {vis({ width: '100%', aspectRatio: '16/9' })}
      <div style={{ padding: 12, display: 'grid', gap: 6 }}><b style={{ fontSize: 15 }}>{(title || text.split('\n')[0] || 'Video er naam').slice(0, 100)}</b>
        <span className="row muted xs"><Avatar a={a} size={22} />{a.name} · ekhoni</span><span className="muted xs clamp3" style={{ whiteSpace: 'pre-wrap' }}>{text}</span></div>
    </div>);
  const body = <p style={{ whiteSpace: 'pre-wrap', fontSize: 14, margin: 0 }}>{a.network === 'instagram' ? <><b>{name}</b> {text}</> : text}</p>;
  return (
    <div className="sm-fade sm-card" style={{ padding: 0, overflow: 'hidden' }}>
      <div className="row" style={{ padding: 10 }}><Avatar a={a} size={34} /><div><b className="sm-t">{name}</b><div className="muted xs">{a.network === 'instagram' ? 'Instagram' : 'Ekhon · 🌐'}</div></div></div>
      {a.network === 'facebook' && <div style={{ padding: '0 12px 10px' }}>{body}{link && !m && <div className="muted xs" style={{ marginTop: 8, border: '1px solid var(--line)', borderRadius: 10, padding: 10 }}>🔗 {link}</div>}</div>}
      {(m || a.network === 'instagram') && <div style={{ position: 'relative' }}>{vis({ width: '100%', aspectRatio: a.network === 'instagram' ? '4/5' : 'auto', maxHeight: 420 })}{media.length > 1 && <span className="sm-badge" style={{ position: 'absolute', top: 8, right: 8, background: 'rgba(0,0,0,.6)', color: '#fff' }}>1/{media.length}</span>}</div>}
      {a.network === 'instagram' && <div style={{ padding: 12, display: 'grid', gap: 6 }}><div className="row" style={{ gap: 14 }}><Icon name="heart" size={22} /><Icon name="comment" size={22} /><Icon name="send" size={22} /><span className="grow" /><Icon name="bookmark" size={22} /></div>{body}</div>}
      {a.network === 'facebook' && <div className="row muted xs" style={{ justifyContent: 'space-around', padding: 8, borderTop: '1px solid var(--line)' }}><span>👍 Like</span><span>💬 Comment</span><span>↪ Share</span></div>}
    </div>);
}
