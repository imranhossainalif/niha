// Kids Care monthly P&L and product costing: ports of plMonth / plFixed / plAds / spendItems / pcVer / pcMonthCostKg
// from legacy/business-os.html. `S` holds collections as arrays of {id, ...data}, like the legacy page's state.
type R = Record<string, any>;
export type State = Record<string, R[] | undefined>;

const sumBy = <T,>(arr: T[], f: (x: T) => unknown) => arr.reduce((s, r) => s + (Number(f(r)) || 0), 0);
const col = (S: State, c: string) => S[c] ?? [];

/* ---------- product costing (versioned pc_items) ---------- */
export const pcNorm = (s: unknown) => String(s || '').toLowerCase().replace(/suger/g, 'sugar').replace(/[^a-z0-9]/g, '');
export const pcHist = (p: R) => [...(p.history || [])].sort((a: R, b: R) => String(a.from).localeCompare(String(b.from)));
/** The costing version in force on date d (the first version if d is before all of them). */
export function pcVer(p: R, d: string): R | undefined {
  const h = pcHist(p); let v = h[0];
  for (const x of h) if (x.from <= d) v = x;
  return v;
}
export const pcSizeCalc = (s: R) => ({
  ...s,
  margin: s.price && s.cost != null && s.cost !== '' ? s.price - s.cost : null,
  margin_pct: s.price && s.cost != null && s.cost !== '' ? Math.round(((s.price - s.cost) / s.price) * 1000) / 10 : null,
});
export function pcFind(S: State, name: string) {
  const n = pcNorm(name);
  return col(S, 'pc_items').find((p) => pcNorm(p.name) === n || (p.aliases || []).some((a: string) => pcNorm(a) === n));
}
const pcKgCost = (v: R | undefined) => { const s = (v?.sizes || []).find((x: R) => x.size === '1kg'); return s && s.cost ? Number(s.cost) : null; };
/** Cost per kg for a month, prorated by day when costing changed inside the month; null = no change (keep the import's cost). */
export function pcMonthCostKg(S: State, name: string, m: string): number | null {
  const p = pcFind(S, name); if (!p || pcHist(p).length < 2) return null;
  const [y, mo] = m.split('-').map(Number); const n = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  let tot = 0, cnt = 0;
  for (let d = 1; d <= n; d++) { const c = pcKgCost(pcVer(p, m + '-' + String(d).padStart(2, '0'))); if (c == null) return null; tot += c; cnt++; }
  const base = pcKgCost(pcHist(p)[0]); const avg = tot / cnt;
  return base != null && Math.abs(avg - base) < 0.01 ? null : avg;
}

/* ---------- P&L ---------- */
export const plMonths = (S: State) => col(S, 'pl_kidscare').filter((d) => /^\d{4}-\d\d$/.test(d.id)).sort((a, b) => a.id.localeCompare(b.id));
const usdRate = (S: State) => Number(col(S, 'settings').find((s) => s.id === 'kidscare')?.usd_rate) || 122;

export function spendItems(S: State, m: string, biz: string) {
  const imp = biz === 'kidscare' ? ((col(S, 'spend_import').find((d) => d.id === m) || {}).items || []).map((x: R, i: number) => ({ ...x, _imp: m + '#' + i })) : [];
  const own = col(S, 'daily_spend').filter((x) => (x.business || 'kidscare') === biz && (x.date || '').slice(0, 7) === m);
  return [...imp, ...own].sort((a: R, b: R) => (a.date || '').localeCompare(b.date || ''));
}

export function plFixed(S: State, m: string, biz: string) {
  const items = col(S, 'fixed_costs').filter((f) => (f.business || 'kidscare') === biz && (!f.start_month || f.start_month <= m) && (!f.end_month || f.end_month >= m) && f.active !== 'no');
  const tx = col(S, 'transactions').filter((t) => t.business === biz && t.type === 'expense' && (t.date || '').slice(0, 7) === m && t.category !== 'Product kena' && t.category !== 'Ads' && t.category !== 'Loan kisti');
  return { items, tx, total: sumBy(items, (f) => f.amount) + sumBy(tx, (t) => t.amount) };
}

/** Ad cost in ৳: a manual USD figure wins; otherwise the month's daily FB spend (USD) × rate. Plus "Ads" expense transactions. */
export function plAds(S: State, m: string, doc: R | undefined, liveDaily?: Record<string, number>) {
  const extra = col(S, 'transactions').filter((t) => t.business === 'kidscare' && t.type === 'expense' && t.category === 'Ads' && (t.date || '').slice(0, 7) === m);
  const other = sumBy(extra, (t) => t.amount);
  if (doc && doc.ads_usd_manual != null) {
    const r = doc.ads_rate || usdRate(S);
    return { daily: {} as Record<string, number>, usd: doc.ads_usd_manual, fb: doc.ads_usd_manual * r, other, total: doc.ads_usd_manual * r + other, manual: true, rate: r };
  }
  const daily: Record<string, number> = { ...((doc && doc.ads_daily) || {}) };
  for (const [d, v] of Object.entries(liveDaily || {})) if (d.slice(0, 7) === m) daily[d] = Number(v) || 0;
  const usd = sumBy(Object.values(daily), (v) => v);
  const rate = usdRate(S);
  return { daily, usd, fb: usd * rate, other, total: usd * rate + other, manual: false, rate };
}

export function plMonth(S: State, m: string, liveAdsDaily?: Record<string, number>) {
  const doc = plMonths(S).find((d) => d.id === m);
  const nu = col(S, 'sales_daily').filter((r) => r.business === 'kidscare' && (r.date || '').slice(0, 7) === m);
  const nuSales = sumBy(nu, (r) => r.delivered_amount);
  // months without a sales export: estimate product cost from the cost/sales ratio of the last 3 exported months
  const recent = plMonths(S).filter((d) => d.id < m && d.sales).slice(-3);
  const ratio = recent.length ? sumBy(recent, (d) => d.cost) / (sumBy(recent, (d) => d.sales) || 1) : 0.5;
  const fromExport = !!(doc && doc.sales);
  const sales: number = fromExport ? doc!.sales : nuSales;
  let cost: number = fromExport ? doc!.cost : Math.round(nuSales * ratio);
  let pcAdj: { delta: number; names: string[] } | null = null;
  if (fromExport && (doc!.products || []).length) {
    let delta = 0; const ch: string[] = [];
    doc!.products.forEach((x: R) => { if (x.unit === 'unit') return; const c = pcMonthCostKg(S, x.name, m); if (c != null) { delta += (+x.qty) * c - x.cost; ch.push(x.name); } });
    if (ch.length) { cost += Math.round(delta); pcAdj = { delta: Math.round(delta), names: ch }; }
  }
  const ads = plAds(S, m, doc, liveAdsDaily);
  const fx = plFixed(S, m, 'kidscare');
  const sp = [...spendItems(S, m, 'kidscare').filter((x: R) => !x.excl), ...((doc && doc.other_costs) || []).map((o: R) => ({ desc: o.name + ' (workbook)', amount: o.amount, category: 'other', date: m + '-01' }))];
  const daily = sumBy(sp, (x: R) => x.amount);
  const gross = sales - cost;
  const net = gross - ads.total - fx.total - daily;
  return {
    m, sales, cost, gross, gm: sales ? gross / sales : 0, ads, fx, daily, net, pcAdj, nuSales, nuDays: nu.length, est: !fromExport,
    src: fromExport ? (doc!.source || 'Sales export') + (doc!.estimate ? ' (revenue estimate)' : '') : nu.length ? 'Nuport (cost estimate ' + Math.round(ratio * 100) + '%)' : 'Data nai',
  };
}

export function plMonthList(S: State, today: string) {
  const set = new Set(plMonths(S).map((d) => d.id));
  col(S, 'sales_daily').filter((r) => r.business === 'kidscare').forEach((r) => set.add((r.date || '').slice(0, 7)));
  set.add(today.slice(0, 7));
  return [...set].filter(Boolean).sort();
}
