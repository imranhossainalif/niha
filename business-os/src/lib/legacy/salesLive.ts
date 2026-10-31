// Legacy-page code for the Sales Team tab: a live "aaj" card and a clickable date-wise call list at the top.
// Inserted into legacy/business-os.html by PATCHES (runs in the page's scope, uses its helpers).
export const SALES_LIVE_JS = String.raw`/* Business OS: live "aaj" card + date-wise call list (calls_daily, updated by the Sheets push every ~30 min) */
let stLiveSel = null;
const stMx = (a, b) => Math.max(Number(a) || 0, Number(b) || 0);
/* The sheet's own per-rep table for that day (today_date/selected_date are written by the sheet sync). */
function stDetailRows(d, L) {
  if (!d || !L) return null;
  if (L.today_date ? L.today_date === d.date : L.today_label && String(L.today_label).startsWith(Number(d.date.slice(8)) + ' ')) return L.today;
  if (L.selected_date === d.date) return L.selected_day;
  return null;
}
/* Rep-wise receive/order from the sheet's per-rep table, max-merged so a partial sync never lowers a number. */
function stWithDetail(d, L) {
  const rows = stDetailRows(d, L);
  if (!d || !Array.isArray(rows) || !rows.length) return d;
  const x = { ...d, reps: { ...(d.reps || {}) }, rcv: { ...(d.rcv || {}) }, ord: { ...(d.ord || {}) }, otk: { ...(d.otk || {}) } };
  rows.forEach((r) => {
    if (!r || !r.name) return;
    if (r.name === 'Total') {
      if (r.calls != null) x.calls = stMx(x.calls, r.calls);
      if (r.received != null) x.received = stMx(x.received, r.received);
      if (r.orders != null) x.orders = stMx(x.orders, r.orders);
      if (r.order_tk != null) x.order_tk = stMx(x.order_tk, r.order_tk);
      return;
    }
    if (r.calls != null) x.reps[r.name] = stMx(x.reps[r.name], r.calls);
    if (r.received != null) x.rcv[r.name] = stMx(x.rcv[r.name], r.received);
    if (r.orders != null) x.ord[r.name] = stMx(x.ord[r.name], r.orders);
    if (r.order_tk != null) x.otk[r.name] = stMx(x.otk[r.name], r.order_tk);
  });
  return x;
}
function stLiveCards(REPS, L) {
  const cd = [...(S.calls_daily || [])].sort((a, b) => b.date.localeCompare(a.date));
  const today = todayStr();
  const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');
  const longDate = (d) => new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const repRows = (d) => [...REPS.map((n) => ({ n, c: (d.reps || {})[n] || 0, r: (d.rcv || {})[n], o: (d.ord || {})[n], t: (d.otk || {})[n] || 0 })), { n: 'Mot', c: d.calls || 0, r: d.received || 0, o: d.orders || 0, t: d.order_tk || 0, _t: true }];
  const repTable = (d) => table([{ l: 'Rep', f: (x) => el('b', {}, x.n) }, { l: 'Call', r: 1, f: (x) => nf.format(x.c) }, { l: 'Receive', r: 1, f: (x) => (x.r == null ? '—' : x.r) }, { l: 'Receive %', r: 1, f: (x) => (x.r == null ? '—' : pct(x.r, x.c)) }, { l: 'Order', r: 1, f: (x) => (x._t ? el('b', {}, String(x.o)) : x.o == null ? '—' : x.o) }, { l: 'Conv %', r: 1, f: (x) => (x.r == null || x.o == null ? '—' : pct(x.o, x.r)) }, { l: 'Order ৳', r: 1, f: (x) => (x.t ? tk(x.t) : '—') }], repRows(d));
  const td0 = cd.find((r) => r.date === today) || { date: today, reps: {}, rcv: {}, ord: {}, otk: {}, calls: 0, received: 0, orders: 0, order_tk: 0 };
  // the call sheet's own "today" table has per-rep receive/order even when the merged daily doc doesn't
  const td = stWithDetail(td0, L);
  const sync = L && L.asof ? 'Shesh update ' + ago(L.asof) + ' · sheet theke auto (30 min por por)' : 'Ekhono sync hoyni';
  const liveCard = card('🔴 Aaj live · ' + longDate(today), sync,
    el('div', { class: 'tiles' },
      tile('var(--t1)', 'Aaj call', nf.format(td.calls || 0), 'Rep ' + REPS.filter((n) => ((td.reps || {})[n] || 0) > 0).length + '/' + REPS.length + ' jon call korche'),
      tile('var(--t2)', 'Receive', String(td.received || 0), 'Receive ' + pct(td.received || 0, td.calls || 0)),
      tile('var(--t4)', 'Order (convert)', String(td.orders || 0), 'Conv ' + pct(td.orders || 0, td.received || 0) + ' (receive theke)'),
      tile('var(--t5)', 'Order ৳', td.order_tk ? tk(td.order_tk) : '—', 'Call sheet e likha taka')),
    el('div', { style: 'min-width:0' }, repTable(td)));
  const days = cd.filter((d) => d.date !== today).slice(0, 30);
  if (td.calls || td.received || td.orders || cd.some((d) => d.date === today)) days.unshift(td);
  if (!stLiveSel || !days.some((d) => d.date === stLiveSel)) stLiveSel = days.length ? days[0].date : null;
  const sel0 = days.find((d) => d.date === stLiveSel);
  const sel = sel0 ? stWithDetail(sel0, L) : null;
  const noDetail = sel && (sel.received || 0) > 0 && REPS.some((n) => (sel.rcv || {})[n] == null);
  const detail = sel ? el('div', { style: 'min-width:0;border:1px solid var(--line);border-radius:10px;padding:10px' }, el('b', {}, longDate(sel.date) + ' · ke koto'), repTable(sel),
    noDetail ? el('div', { class: 'note', style: 'margin-top:6px' }, 'Ei din er rep-wise receive/order sheet theke asheni — Mot total dekhano hoyeche. Sheet e oi tarikh select kore ekbar sync korle rep-wise hishab boshe jabe.') : null) : null;
  const dayList = card('Din-wise: koto call, receive, order', 'Niche je din e click korben, tar rep-wise hishab upore dekhabe', detail,
    days.length ? el('div', { style: 'min-width:0' }, table([
      { l: 'Tarikh', f: (d) => el('b', { style: d.date === stLiveSel ? 'color:var(--accent)' : '' }, (d.date === stLiveSel ? '▸ ' : '') + dfmt(d.date) + ' · ' + new Date(d.date + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short' }) + (d.date === today ? ' (aaj)' : '')) },
      { l: 'Call', r: 1, f: (d) => nf.format(d.calls || 0) }, { l: 'Receive', r: 1, f: (d) => d.received || 0 }, { l: 'Receive %', r: 1, f: (d) => pct(d.received || 0, d.calls || 0) },
      { l: 'Order', r: 1, f: (d) => el('b', {}, String(d.orders || 0)) }, { l: 'Conv %', r: 1, f: (d) => pct(d.orders || 0, d.received || 0) }, { l: 'Order ৳', r: 1, f: (d) => (d.order_tk ? tk(d.order_tk) : '—') }],
      days, (d) => { stLiveSel = d.date; render(); })) : emptyBox('Ekhono kono din er data nai', 'Sheet sync hole ekhane ashbe.'));
  return [liveCard, dayList];
}
`;
