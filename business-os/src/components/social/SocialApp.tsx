'use client';
// Social Media (Kids Care → Social Media tab): Calendar · Analytics · Ideas · Accounts, plus the composer.
// Browser-only rendering (dates use the viewer's clock); inside the dashboard frame it reports its height.
import { useCallback, useEffect, useRef, useState } from 'react';
import './social.css';
import { Icon, NET_NAME, NetLogo, NETS } from './icons';
import { api, Avatar, compact, dateLabel, Modal, STATUS, ToastHost, useToast, type Account, type Post } from './ui';
import { Composer, PostPreview, type BestSlot, type Draft } from './Composer';
import { Calendar } from './Calendar';
import { Analytics } from './Analytics';
import { Suggestions } from './Suggestions';
import { Accounts } from './Accounts';

type Tab = 'calendar' | 'analytics' | 'ideas' | 'accounts';
const TABS: [Tab, string, string][] = [['calendar', 'Calendar', 'calendar'], ['analytics', 'Analytics', 'chart'], ['ideas', 'Ideas', 'spark'], ['accounts', 'Accounts', 'users']];

export function SocialApp(props: { business: string; canAdmin: boolean; embed?: boolean }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
    if (props.embed) {
      document.documentElement.classList.add('sm-embed');
      // follow the dashboard's light/dark choice
      try { const t = window.parent.document.documentElement.getAttribute('data-theme'); if (t) document.documentElement.setAttribute('data-theme', t); } catch { /* not same origin */ }
    }
  }, [props.embed]);
  if (!mounted) return null;
  return <ToastHost><App {...props} /></ToastHost>;
}

function App({ business, canAdmin }: { business: string; canAdmin: boolean }) {
  const toast = useToast();
  const root = useRef<HTMLDivElement>(null);
  const [tab, setTab] = useState<Tab>(() => { try { const t = localStorage.getItem('bos_social_tab') as Tab | null; return t && TABS.some(([k]) => k === t) ? t : 'calendar'; } catch { return 'calendar'; } });
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [best, setBest] = useState<BestSlot[]>([]);
  const [compose, setCompose] = useState<{ initial?: Draft; time?: string } | null>(null);
  const [view, setView] = useState<Post | null>(null);
  const [refresh, setRefresh] = useState(0);
  const loadAccounts = useCallback(() => api<{ connected: Account[] }>(`/api/social/${business}/accounts`).then((r) => setAccounts(r.connected)).catch(() => setAccounts([])), [business]);
  useEffect(() => { loadAccounts(); api<{ analysis: { bestSlots: BestSlot[] } }>(`/api/social/${business}/analytics?days=90`).then((r) => setBest(r.analysis.bestSlots)).catch(() => {}); }, [loadAccounts, business]);
  useEffect(() => { try { localStorage.setItem('bos_social_tab', tab); } catch { /* private mode */ } }, [tab]);
  useEffect(() => {
    if (window.parent === window || !root.current) return;
    const el = root.current;
    const send = () => window.parent.postMessage({ bosSocialHeight: el.offsetHeight + 24 }, location.origin);
    const ro = new ResizeObserver(send); ro.observe(el); send();
    return () => ro.disconnect();
  }, []);
  const nextHour = () => { const d = new Date(); d.setMinutes(0, 0, 0); d.setHours(d.getHours() + 1); return d.toISOString(); };
  const open = (p: Post) => (['draft', 'scheduled', 'failed'].includes(p.status) ? setCompose({ initial: p }) : setView(p));
  const saved = () => { setCompose(null); setRefresh((x) => x + 1); };
  const nets = [...new Set((accounts ?? []).map((a) => a.network))];
  const followers = (accounts ?? []).reduce((s, a) => s + (a.followers || 0), 0);

  return (
    <div ref={root} className="sm">
      <header className="sm-card sm-head" style={{ padding: '14px 16px' }}>
        <div className="stack" style={{ gap: 2 }}>
          <h1>Social Media</h1>
          <span className="row muted xs" style={{ gap: 6 }}>{accounts === null ? 'Load hocche…' : accounts.length ? <>{NETS.filter((n) => nets.includes(n)).map((n) => <NetLogo key={n} net={n} size={14} />)} {accounts.length} account · {compact(followers)} follower</> : 'Kono account connect kora nai'}</span>
        </div>
        <div className="sm-avstack">{(accounts ?? []).slice(0, 6).map((a) => <Avatar key={a.id} a={a} size={30} ring />)}</div>
        <span className="grow" />
        <button className="sm-btn primary" onClick={() => setCompose({ time: nextHour() })} style={{ height: 40, padding: '0 18px', fontSize: 14.5 }}><Icon name="plus" />Post banan</button>
      </header>
      <nav className="sm-seg" role="tablist" style={{ justifySelf: 'start' }}>
        {TABS.map(([k, l, ic]) => <button key={k} type="button" role="tab" aria-selected={tab === k} aria-pressed={tab === k} onClick={() => setTab(k)}><Icon name={ic} size={15} />{l}</button>)}
      </nav>
      {accounts && !accounts.length && tab !== 'accounts' && (
        <div className="sm-card tint row sm-fade"><Icon name="users" style={{ color: 'var(--accent)' }} /><span className="grow">Post korte ar analytics dekhte age Facebook, Instagram, YouTube ba TikTok connect korun.</span><button className="sm-btn primary sm" onClick={() => setTab('accounts')}>Account connect</button></div>
      )}
      <div key={tab} className="sm-fade">
        {tab === 'calendar' && <Calendar business={business} refresh={refresh} nets={nets} onOpen={open} onNew={(day) => setCompose({ time: new Date(day + 'T20:00').toISOString() })} />}
        {tab === 'analytics' && <Analytics business={business} refresh={refresh} />}
        {tab === 'ideas' && <Suggestions business={business} onUse={(d) => setCompose({ initial: d, time: nextHour() })} />}
        {tab === 'accounts' && <Accounts business={business} accounts={accounts ?? []} canAdmin={canAdmin} onChange={loadAccounts} />}
      </div>
      {compose && accounts && <Composer business={business} accounts={accounts} initial={compose.initial} defaultTime={compose.time} best={best} onClose={() => setCompose(null)} onSaved={saved} />}
      {view && accounts && <PostView p={view} accounts={accounts} onClose={() => setView(null)} onChanged={() => { setView(null); saved(); }} toast={toast} />}
    </div>
  );
}

function PostView({ p, accounts, onClose, onChanged, toast }: { p: Post; accounts: Account[]; onClose: () => void; onChanged: () => void; toast: ReturnType<typeof useToast> }) {
  const [busy, setBusy] = useState(false);
  const [l, c] = STATUS[p.status] ?? [p.status, '#888'];
  const retry = async () => { setBusy(true); try { const r = await api<{ status: string }>('/api/social/posts/' + p.id + '/publish', { method: 'POST' }); toast(r.status === 'published' ? 'Post hoye geche ✓' : 'Ekhono kichu jaygay hoyni', r.status === 'published' ? 'ok' : 'err'); onChanged(); } catch (e) { toast((e as Error).message, 'err'); setBusy(false); } };
  const del = async () => { if (!confirm('Calendar theke muchben? (Platform e thaka post okhan theke nije muchte hobe)')) return; try { await api('/api/social/posts/' + p.id, { method: 'DELETE' }); toast('Muche fela hoyeche'); onChanged(); } catch (e) { toast((e as Error).message, 'err'); } };
  const first = accounts.find((a) => a.id === p.targets[0]?.account_id);
  return (
    <Modal onClose={onClose} width={760}>
      <div className="sm-grid sm-g2" style={{ padding: 20, gap: 18 }}>
        <div className="stack">
          <span className="row"><span className="sm-dot" style={{ background: c }} /><b style={{ color: c }}>{l}</b></span>
          <span className="muted xs">{p.published_at ? 'Post: ' + dateLabel(p.published_at) : p.scheduled_at ? 'Schedule: ' + dateLabel(p.scheduled_at) : ''}{p.created_by ? ' · ' + p.created_by : ''}</span>
          <div className="stack" style={{ gap: 6 }}>{p.targets.map((t) => (
            <div key={t.account_id} className="sm-acc" style={{ display: 'grid', gap: 3 }}>
              <span className="row"><NetLogo net={t.network} size={18} /><b>{t.name || NET_NAME[t.network]}</b><span className="grow" /><span className="xs" style={{ fontWeight: 700, color: t.status === 'published' ? 'var(--good)' : t.status === 'failed' ? 'var(--bad)' : 'var(--muted)' }}>{t.status === 'published' ? 'Hoyeche' : t.status === 'failed' ? 'Hoyni' : 'Baki'}</span>{t.permalink && <a className="lnk xs" href={t.permalink} target="_blank" rel="noreferrer">dekhun ↗</a>}</span>
              {t.note && <span className="xs" style={{ color: 'var(--warn)' }}>{t.note}</span>}
              {t.error && <span className="xs" style={{ color: 'var(--bad)' }}>{t.error}</span>}
            </div>))}
          </div>
          <div className="row">{p.targets.some((t) => t.status !== 'published') && <button className="sm-btn primary" disabled={busy} onClick={retry}>{busy ? <span className="sm-spin" /> : <Icon name="refresh" size={14} />}Abar chesta korun</button>}<button className="sm-btn ghost danger" onClick={del}><Icon name="trash" size={14} />Calendar theke muchun</button></div>
        </div>
        <div>{first ? <PostPreview a={first} text={p.targets[0]?.text ?? p.text} media={p.media} link={p.link} title={p.options?.yt_title} /> : <p className="sm-t" style={{ whiteSpace: 'pre-wrap' }}>{p.text}</p>}</div>
      </div>
    </Modal>
  );
}
