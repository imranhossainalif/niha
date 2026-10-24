'use client';
// Admin: try the inbox AI on a made-up customer message. Same knowledge, website and past replies as the real thing; nothing is sent.
import { useState } from 'react';

type Res = { decision: { reply: string; intent: string; mood: string; needs_human: boolean; lead_score: number; order: Record<string, string> }; used: { products?: { name: string; variants: { label: string; price: number }[]; url: string }[]; web: { title: string; url: string; text: string }[]; past: { q: string; a: string }[] } };

export function InboxTest() {
  const [text, setText] = useState('');
  const [chat, setChat] = useState<{ dir: 'in' | 'out'; text: string }[]>([]);
  const [res, setRes] = useState<Res | null>(null); const [busy, setBusy] = useState(false); const [err, setErr] = useState('');
  async function ask(extra?: string) {
    const msgs = [...chat, ...(extra ?? text ? [{ dir: 'in' as const, text: (extra ?? text).trim() }] : [])];
    if (!msgs.length || msgs[msgs.length - 1].dir !== 'in') return;
    setBusy(true); setErr(''); setRes(null);
    try {
      const r = await fetch('/api/inbox/test', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ messages: msgs }) });
      const j = await r.json(); if (!r.ok) throw new Error(j?.error?.message || 'Error ' + r.status);
      setChat(j.decision.reply ? [...msgs, { dir: 'out', text: j.decision.reply }] : msgs); setRes(j); setText('');
    } catch (e) { setErr((e as Error).message); }
    setBusy(false);
  }
  return (
    <details className="rounded border p-3" style={{ borderColor: 'var(--line)' }}>
      <summary className="cursor-pointer font-semibold">✨ AI test korun (kichu pathabe na)</summary>
      <div className="mt-2 grid gap-2 text-sm">
        <p className="muted">Customer er moto ekta proshno likhun. AI ki uttor dito, kon website page ar kon purono uttor dekhlo — dekhun.</p>
        {chat.map((m, i) => <div key={i} style={{ background: m.dir === 'in' ? 'var(--line)' : 'transparent', border: '1px solid var(--line)', borderRadius: 10, padding: '6px 10px', marginLeft: m.dir === 'out' ? 24 : 0, whiteSpace: 'pre-wrap' }}><b>{m.dir === 'in' ? 'Customer' : 'AI'}:</b> {m.text}</div>)}
        <div className="flex gap-2"><input className="input" value={text} placeholder="Jemon: Cerelac er dam koto? 8 mash er babyr jonno kon ta bhalo?" onChange={(e) => setText(e.target.value)} onKeyDown={(e) => { if (e.key === 'Enter') ask(); }} /><button className="btn btn-primary" disabled={busy || !text.trim()} onClick={() => ask()} type="button">{busy ? '…' : 'Pathan'}</button>{chat.length > 0 && <button className="btn" type="button" onClick={() => { setChat([]); setRes(null); }}>Notun</button>}</div>
        {err && <p style={{ color: '#d64545' }}>{err}</p>}
        {res && (
          <div className="grid gap-1">
            <span>Intent: <b>{res.decision.intent}</b> · mood: <b>{res.decision.mood}</b> · lead: <b>{res.decision.lead_score}</b> · {res.decision.needs_human ? <b style={{ color: '#d99a1e' }}>manush ke dite hobe (AI nijer theke pathabe na)</b> : <b style={{ color: '#1f9d6b' }}>AI nijei pathabe</b>}</span>
            {Object.values(res.decision.order).some(Boolean) && <span>Order e pelo: {Object.entries(res.decision.order).filter(([, v]) => v).map(([k, v]) => k + ': ' + v).join(' · ')}</span>}
            <b className="mt-1">Shop product theke dekhlo ({res.used.products?.length ?? 0})</b>
            {(res.used.products ?? []).map((p, i) => <span key={i} className="muted" style={{ fontSize: 12 }}>• {p.name}: {p.variants.map((v) => (v.label ? v.label + ' ' : '') + '৳' + v.price).join(' · ')}</span>)}
            <b className="mt-1">Website / file theke dekhlo ({res.used.web.length})</b>
            {res.used.web.map((h, i) => <span key={i} className="muted" style={{ fontSize: 12 }}>• <a className="link" href={h.url} target="_blank" rel="noreferrer">{h.title || h.url}</a>: {h.text.replace(/\s+/g, ' ').slice(0, 160)}…</span>)}
            {!res.used.web.length && <span className="muted" style={{ fontSize: 12 }}>Kono mil-oyala page/file pay ni.</span>}
            <b className="mt-1">Purono uttor theke dekhlo ({res.used.past.length})</b>
            {res.used.past.map((p, i) => <span key={i} className="muted" style={{ fontSize: 12 }}>• Customer: {p.q.slice(0, 100)} → Amra: {p.a.slice(0, 140)}</span>)}
          </div>
        )}
      </div>
    </details>
  );
}
