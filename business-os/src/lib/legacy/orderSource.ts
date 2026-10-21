// Legacy-page code for Kids Care → Sales: orders by channel (Nuport source) for a day, month or year.
// Reads sales_daily[].by_channel written by the Nuport sync. Inserted by PATCHES; runs in the page's scope.
export const ORDER_SOURCE_JS = String.raw`/* Business OS: order source card (sales_daily.by_channel) */
const OS_CH = [['call', 'Sales team (call / up-sell)'], ['whatsapp', 'WhatsApp'], ['messenger', 'Messenger'], ['web_ads', 'Website · Ads (FB/paid)'], ['web_organic', 'Website · Google organic'], ['web_direct', 'Website · Direct'], ['web_other', 'Website · Onnanno'], ['offline', 'Offline'], ['other', 'Onnanno'], ['unknown', 'Source jana nai']];
let osMode = 'day', osDay = null, osMonth = null, osYear = null;
function orderSourceCard(id) {
  const today = todayStr();
  osDay = osDay || today; osMonth = osMonth || today.slice(0, 7); osYear = osYear || today.slice(0, 4);
  const rows = (S.sales_daily || []).filter((r) => r.business === id && r.date);
  const [from, to, label] = osMode === 'day' ? [osDay, osDay, new Date(osDay + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })]
    : osMode === 'month' ? [osMonth + '-01', osMonth + '-31', monthLabel(osMonth)] : [osYear + '-01-01', osYear + '-12-31', osYear + ' (pura bochor)'];
  const R = rows.filter((r) => r.date >= from && r.date <= to);
  const Z = () => ({ orders: 0, cancelled: 0, sent: 0, sent_amount: 0, in_transit: 0, in_transit_amount: 0, delivered: 0, delivered_amount: 0, returned: 0 });
  const add = (a, b) => { for (const k in a) a[k] += Number(b[k]) || 0; };
  const agg = {}; let noSrcDays = 0, noSrcOrders = 0;
  R.forEach((r) => { if (r.by_channel) Object.entries(r.by_channel).forEach(([k, v]) => add(agg[k] = agg[k] || Z(), v)); else if (r.orders) { noSrcDays++; noSrcOrders += r.orders; } });
  if (noSrcOrders) { agg.unknown = agg.unknown || Z(); agg.unknown.orders += noSrcOrders; }
  const tot = Z(); Object.values(agg).forEach((v) => add(tot, v));
  const list = OS_CH.filter(([k]) => agg[k] && agg[k].orders).map(([k, l]) => ({ k, l, ...agg[k] }));
  // in transit right now, across all dates
  const nowT = {}; rows.forEach((r) => r.by_channel && Object.entries(r.by_channel).forEach(([k, v]) => { if (v.in_transit) { nowT[k] = nowT[k] || [0, 0]; nowT[k][0] += v.in_transit; nowT[k][1] += v.in_transit_amount; } }));
  const pct = (a, b) => (b ? Math.round((a / b) * 100) + '%' : '—');
  const modeSel = el('select', { 'aria-label': 'Shomoy' }, [['day', 'Din'], ['month', 'Mash'], ['year', 'Bochor']].map(([v, l]) => el('option', { value: v, selected: osMode === v }, l)));
  modeSel.addEventListener('change', () => { osMode = modeSel.value; render(); });
  let pick;
  if (osMode === 'day') { pick = el('input', { type: 'date', max: today, 'aria-label': 'Din' }); pick.value = osDay; pick.addEventListener('change', () => { if (pick.value) { osDay = pick.value; render(); } }); }
  else if (osMode === 'month') { pick = el('input', { type: 'month', max: today.slice(0, 7), 'aria-label': 'Mash' }); pick.value = osMonth; pick.addEventListener('change', () => { if (pick.value) { osMonth = pick.value; render(); } }); }
  else { const ys = [...new Set(rows.map((r) => r.date.slice(0, 4)).concat([today.slice(0, 4)]))].sort().reverse(); pick = el('select', { 'aria-label': 'Bochor' }, ys.map((y) => el('option', { value: y, selected: y === osYear }, y))); pick.addEventListener('change', () => { osYear = pick.value; render(); }); }
  const todayBtn = el('button', { class: 'btn sm' }, 'Aaj'); todayBtn.addEventListener('click', () => { osMode = 'day'; osDay = today; render(); });
  const top = (k) => (agg[k] ? agg[k].orders : 0);
  const web = ['web_ads', 'web_organic', 'web_direct', 'web_other'].reduce((s, k) => s + top(k), 0);
  return card('Order kotha theke ashche · ' + label, 'Nuport er order (order toirir din onujayi) · call, WhatsApp, Messenger, website ar ads alada · din e 3 bar auto update',
    el('div', { class: 'ctrls' }, modeSel, pick, todayBtn),
    el('div', { class: 'tiles' },
      tile('var(--t1)', 'Mot order', String(tot.orders), 'Cancel ' + tot.cancelled + ' · courier e ' + tot.sent),
      tile('var(--t2)', 'Sales team (call)', String(top('call')), pct(top('call'), tot.orders) + ' order'),
      tile('var(--t4)', 'WhatsApp + Messenger', String(top('whatsapp') + top('messenger')), 'WhatsApp ' + top('whatsapp') + ' · Messenger ' + top('messenger')),
      tile('var(--t5)', 'Website', String(web), 'Ads theke ' + top('web_ads') + ' · Google ' + top('web_organic'))),
    list.length ? table([
      { l: 'Kotha theke', f: (x) => el('b', {}, x.l) }, { l: 'Order', r: 1, f: (x) => el('b', {}, String(x.orders)) }, { l: 'Share', r: 1, f: (x) => pct(x.orders, tot.orders) },
      { l: 'Cancel', r: 1, f: (x) => x.cancelled }, { l: 'Courier e pathano', r: 1, f: (x) => (x.sent ? x.sent + ' · ' + tk(x.sent_amount) : '—') },
      { l: 'Ekhono rastay', r: 1, f: (x) => (x.in_transit ? x.in_transit + ' · ' + tk(x.in_transit_amount) : '—') },
      { l: 'Delivered', r: 1, f: (x) => (x.delivered ? x.delivered + ' · ' + tk(x.delivered_amount) : '—') }], [...list, { k: '_t', l: 'Mot', ...tot }])
      : emptyBox('Ei shomoy e kono order nai', osMode === 'day' && new Date(osDay + 'T00:00:00').getDay() === 5 ? 'Shukrobar — chuti.' : 'Nuport e ei shomoyer order sync hoyni ba order hoyni.'),
    Object.keys(nowT).length ? el('p', { class: 'note' }, '🚚 Ekhon courier e (shob tarikh): ' + OS_CH.filter(([k]) => nowT[k]).map(([k, l]) => l + ' ' + nowT[k][0] + ' ta (' + tk(nowT[k][1]) + ')').join(' · ')) : null,
    noSrcDays ? el('p', { class: 'note' }, noSrcDays + ' din er order er source Nuport theke ekhono ana hoyni (' + noSrcOrders + ' ta "Source jana nai" e). Purono data ana hole thik hobe.') : null,
    el('p', { class: 'note' }, 'FACT: Nuport er "source" field. Sales team = UP_SELL. Website ads = website order jar link e paid/FB campaign tag chilo. Messenger e ad theke asha order Messenger e-i gona hoy.'));
}
`;
