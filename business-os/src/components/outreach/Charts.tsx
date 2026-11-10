'use client';
// Small inline-SVG charts for the Outreach dashboard and report (no chart library; colours come from the .sm tokens).
import type { ReactNode } from 'react';

/** Daily bars (volume) with a line on top (replies). */
export function Trend({ days, bars, line, barLabel, lineLabel }: { days: string[]; bars: number[]; line: number[]; barLabel: string; lineLabel: string }) {
  const W = 640, H = 190, L = 30, B = 22, T = 10;
  const max = Math.max(1, ...bars), lmax = Math.max(1, ...line);
  const bw = (W - L - 6) / Math.max(1, days.length);
  const x = (i: number) => L + i * bw + bw / 2;
  const y = (v: number, m: number) => T + (H - T - B) * (1 - v / m);
  const pts = line.map((v, i) => `${x(i)},${y(v, lmax)}`).join(' ');
  const tick = Math.max(1, Math.ceil(days.length / 8));
  const label = (d: string) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
  return (
    <div className="stack" style={{ gap: 6 }}>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }} role="img" aria-label={barLabel + ' and ' + lineLabel + ' per day'}>
        {[0, 0.5, 1].map((f) => <g key={f}><line x1={L} x2={W} y1={y(max * f, max)} y2={y(max * f, max)} stroke="var(--line)" strokeDasharray={f ? '3 4' : undefined} /><text x={L - 5} y={y(max * f, max) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{Math.round(max * f)}</text></g>)}
        {bars.map((v, i) => <rect key={i} x={x(i) - Math.min(14, bw * 0.34)} width={Math.min(28, bw * 0.68)} y={y(v, max)} height={Math.max(0, H - B - y(v, max))} rx="3" fill="var(--accent)" opacity=".78"><title>{label(days[i])}: {v} {barLabel.toLowerCase()}, {line[i]} {lineLabel.toLowerCase()}</title></rect>)}
        {line.some((v) => v > 0) && <><polyline points={pts} fill="none" stroke="var(--warn)" strokeWidth="2.2" strokeLinejoin="round" />{line.map((v, i) => (v ? <circle key={i} cx={x(i)} cy={y(v, lmax)} r="3.2" fill="var(--warn)" /> : null))}</>}
        {days.map((d, i) => (i % tick === 0 ? <text key={d} x={x(i)} y={H - 6} textAnchor="middle" fontSize="10" fill="var(--muted)">{label(d)}</text> : null))}
      </svg>
      <div className="row xs muted"><span className="row" style={{ gap: 5 }}><i style={{ width: 10, height: 10, borderRadius: 3, background: 'var(--accent)', display: 'inline-block' }} />{barLabel}</span><span className="row" style={{ gap: 5 }}><i style={{ width: 14, height: 3, background: 'var(--warn)', display: 'inline-block' }} />{lineLabel} (own scale, peak {lmax})</span></div>
    </div>
  );
}

/** Funnel: each step as a bar relative to the first, with the step-to-step conversion. */
export function Funnel({ steps }: { steps: [string, number][] }) {
  const top = Math.max(1, steps[0]?.[1] || 0);
  return (
    <div className="stack" style={{ gap: 7 }}>
      {steps.map(([label, v], i) => { const prev = i ? steps[i - 1][1] : 0; return (
        <div key={label} style={{ display: 'grid', gridTemplateColumns: 'minmax(70px, 120px) minmax(0, 1fr) minmax(64px, 96px)', gap: 10, alignItems: 'center' }}>
          <span className="sm-t" style={{ fontWeight: 600 }}>{label}</span>
          <div style={{ background: 'var(--soft)', borderRadius: 8, height: 26, overflow: 'hidden' }}><div style={{ width: Math.max(v ? 2 : 0, (v / top) * 100) + '%', height: '100%', borderRadius: 8, background: `color-mix(in srgb, var(--accent) ${100 - i * 9}%, var(--info))`, transition: 'width .4s var(--ease)' }} /></div>
          <span style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}><b>{v}</b>{i > 0 && <span className="muted xs"> · {prev ? Math.round((v / prev) * 100) + '%' : '—'}</span>}</span>
        </div>); })}
      <span className="muted xs">The % is the conversion from the step above.</span>
    </div>
  );
}

/** A value with a bar behind it, for table cells. */
export function BarCell({ value, max, color = 'var(--accent)', children }: { value: number; max: number; color?: string; children: ReactNode }) {
  return <div style={{ position: 'relative', minWidth: 70 }}><div style={{ position: 'absolute', inset: '2px 0', borderRadius: 6, background: color, opacity: 0.16, width: Math.min(100, max ? (value / max) * 100 : 0) + '%', marginLeft: 'auto', right: 0, left: 'auto' }} /><span style={{ position: 'relative', padding: '0 6px' }}>{children}</span></div>;
}

/** Horizontal share bars (e.g. reply types, pipeline stages). */
export function Shares({ items }: { items: { label: string; value: number; color?: string }[] }) {
  const total = items.reduce((n, x) => n + x.value, 0);
  if (!total) return <p className="muted">No data yet.</p>;
  return (
    <div className="stack" style={{ gap: 8 }}>
      <div style={{ display: 'flex', height: 14, borderRadius: 99, overflow: 'hidden', background: 'var(--soft)' }}>{items.filter((x) => x.value).map((x) => <div key={x.label} title={x.label + ': ' + x.value} style={{ width: (x.value / total) * 100 + '%', background: x.color || 'var(--accent)' }} />)}</div>
      <div className="row" style={{ gap: 12 }}>{items.filter((x) => x.value).map((x) => <span key={x.label} className="row xs" style={{ gap: 5 }}><i style={{ width: 9, height: 9, borderRadius: 3, background: x.color || 'var(--accent)', display: 'inline-block' }} />{x.label} <b>{x.value}</b><span className="muted">{Math.round((x.value / total) * 100)}%</span></span>)}</div>
    </div>
  );
}
