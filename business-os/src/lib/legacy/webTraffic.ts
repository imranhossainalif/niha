// Legacy-page code: website traffic (GA4 → web_traffic) for Kids Care.
// webTodayCard: Briefing tab, "who is on the site now / today". webTrafficCard: Sales tab, any day/month/year.
export const WEB_TRAFFIC_JS = String.raw`/* Business OS: website traffic cards (web_traffic, from GA4 via the Apps Script) */
function wtRange(id, from, to) {
  const T = (S.web_traffic || []).filter((r) => (r.business || 'kidscare') === id && r.date && r.date >= from && r.date <= to);
  const tot = { sessions: 0, users: 0, new_users: 0, engaged_sessions: 0, views: 0, engagement_sec: 0, add_to_carts: 0, checkouts: 0, purchases: 0, revenue: 0 };
  const src = {}, pages = {}, landing = {}, dev = {}, city = {};
  let hasEng = false;
  T.forEach((r) => {
    for (const k in tot) tot[k] += Number((r.total || {})[k]) || 0;
    if ((r.total || {}).engaged_sessions != null) hasEng = true;
    Object.values(r.by_source || {}).forEach((v) => { const k = v.source + ' / ' + v.medium; const x = src[k] = src[k] || { k, sessions: 0, users: 0, purchases: 0 }; x.sessions += v.sessions || 0; x.users += v.users || 0; x.purchases += v.purchases || 0; });
    Object.values(r.pages || {}).forEach((v) => { const x = pages[v.page] = pages[v.page] || { page: v.page, title: v.title, views: 0, users: 0, sec: 0 }; x.views += v.views || 0; x.users += v.users || 0; x.sec += v.engagement_sec || 0; });
    Object.values(r.landing || {}).forEach((v) => { const x = landing[v.page] = landing[v.page] || { page: v.page, sessions: 0, engaged: 0 }; x.sessions += v.sessions || 0; x.engaged += v.engaged_sessions || 0; });
    Object.entries(r.devices || {}).forEach(([k, v]) => { dev[k] = (dev[k] || 0) + v; });
    Object.entries(r.cities || {}).forEach(([k, v]) => { city[k] = (city[k] || 0) + v; });
  });
  const last = T.map((r) => r.asof).filter(Boolean).sort().pop();
  return { T, tot, hasEng, src: Object.values(src).sort((a, b) => b.sessions - a.sessions), pages: Object.values(pages).sort((a, b) => b.views - a.views), landing: Object.values(landing).sort((a, b) => b.sessions - a.sessions), dev, city: Object.entries(city).sort((a, b) => b[1] - a[1]), last };
}
const wtPct = (a, b) => (b ? (Math.round((a / b) * 1000) / 10) + '%' : '—');
const wtDur = (sec, n) => { if (!n) return '—'; const s = Math.round(sec / n); return s >= 60 ? Math.floor(s / 60) + 'm ' + (s % 60) + 's' : s + 's'; };
function wtTiles(W, webOrders) {
  const t = W.tot;
  return el('div', { class: 'tiles' },
    tile('var(--t1)', 'Visit (session)', nf.format(t.sessions), nf.format(t.users) + ' visitor · ' + nf.format(t.new_users) + ' notun'),
    tile('var(--t2)', 'Bounce rate', W.hasEng ? wtPct(t.sessions - t.engaged_sessions, t.sessions) : '—', W.hasEng ? nf.format(t.sessions - t.engaged_sessions) + ' jon kichu na kore chole geche' : 'setupGA4 abar run korun'),
    tile('var(--t4)', 'Gor shomoy', W.hasEng ? wtDur(t.engagement_sec, t.sessions) : '—', nf.format(t.views) + ' page dekha'),
    tile('var(--t5)', 'Cart → Checkout → Kena', (t.add_to_carts || 0) + ' → ' + (t.checkouts || 0) + ' → ' + (t.purchases || 0), webOrders != null ? 'Website order (Nuport) ' + webOrders + ' · conv ' + wtPct(webOrders, t.sessions) : 'GA4 er hishab'));
}
function wtPageTable(W, n) {
  return W.pages.length ? table([{ l: 'Page', f: (x) => el('div', {}, el('b', {}, (x.title || x.page).slice(0, 70)), el('div', { class: 'note' }, x.page.slice(0, 80))) }, { l: 'Dekha', r: 1, f: (x) => nf.format(x.views) }, { l: 'Visitor', r: 1, f: (x) => nf.format(x.users) }, { l: 'Gor shomoy', r: 1, f: (x) => wtDur(x.sec, x.users) }], W.pages.slice(0, n)) : el('p', { class: 'note' }, 'Page er data ekhono ashe nai.');
}
/* Briefing: right now + any period (today / week / month), trend graph by day / week / month, top pages per period */
let wtPer = 'today', wtGran = 'day';
const wtAdd = (d, k) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() + k); return ymd(x); };
const wtSat = (d) => { const x = new Date(d + 'T00:00:00'); x.setDate(x.getDate() - ((x.getDay() + 1) % 7)); return ymd(x); }; // BD week starts Saturday
function wtPeriods(today) {
  const m0 = today.slice(0, 8) + '01', pm = wtAdd(m0, -1).slice(0, 8) + '01', pmEnd = wtAdd(m0, -1), w0 = wtSat(today);
  const dayOfM = Number(today.slice(8));
  return {
    today: ['Aaj', today, today, today === todayStr() ? wtAdd(today, -1) : null, 'gotokal'],
    yesterday: ['Gotokal', wtAdd(today, -1), wtAdd(today, -1), wtAdd(today, -2), 'tar ager din'],
    week: ['Ei shoptah (Shoni theke)', w0, today, wtAdd(w0, -7), 'goto shoptaher ei somoy porjonto', wtAdd(today, -7)],
    d7: ['Shesh 7 din', wtAdd(today, -6), today, wtAdd(today, -13), 'tar ager 7 din', wtAdd(today, -7)],
    month: ['Ei mash', m0, today, pm, 'goto mashe ei tarikh porjonto', wtAdd(pm, Math.min(dayOfM, Number(pmEnd.slice(8))) - 1)],
    d30: ['Shesh 30 din', wtAdd(today, -29), today, wtAdd(today, -59), 'tar ager 30 din', wtAdd(today, -30)],
    lmonth: ['Goto mash', pm, pmEnd, wtAdd(pm, -1).slice(0, 8) + '01', 'tar ager mash', wtAdd(pm, -1)],
  };
}
function wtChange(cur, prev, lbl) {
  if (!prev || !prev.T.length) return null;
  const pc = (a, b) => (b ? Math.round(((a - b) / b) * 100) : null);
  const f = (name, a, b) => { const v = pc(a, b); return v == null ? null : el('span', { style: 'margin-right:12px' }, name + ' ', el('b', { style: 'color:' + (v >= 0 ? 'var(--good)' : 'var(--bad)') }, (v > 0 ? '+' : '') + v + '%')); };
  const br = (W) => (W.tot.sessions ? (W.tot.sessions - W.tot.engaged_sessions) / W.tot.sessions : 0);
  const db = cur.hasEng && prev.hasEng ? Math.round((br(cur) - br(prev)) * 1000) / 10 : null;
  return el('p', { class: 'note' }, lbl + ' er tulonay: ', f('visit', cur.tot.sessions, prev.tot.sessions), f('visitor', cur.tot.users, prev.tot.users), f('page dekha', cur.tot.views, prev.tot.views),
    db == null ? null : el('span', {}, 'bounce ', el('b', { style: 'color:' + (db <= 0 ? 'var(--good)' : 'var(--bad)') }, (db > 0 ? '+' : '') + db + ' point')));
}
/* trend rows: one per day (30), week (12, Sat–Fri) or month (12) */
function wtTrendRows(id, gran, today) {
  const out = [];
  if (gran === 'day') for (let i = 29; i >= 0; i--) { const d = wtAdd(today, -i); out.push({ k: d, l: dfmt(d), from: d, to: d }); }
  else if (gran === 'week') { const w0 = wtSat(today); for (let i = 11; i >= 0; i--) { const f = wtAdd(w0, -7 * i), t = wtAdd(f, 6); out.push({ k: f, l: dfmt(f), from: f, to: t > today ? today : t, part: t > today }); } }
  else { const x = new Date(today.slice(0, 8) + '01T00:00:00'); for (let i = 11; i >= 0; i--) { const m = new Date(x.getFullYear(), x.getMonth() - i, 1); const f = ymd(m), t = ymd(new Date(m.getFullYear(), m.getMonth() + 1, 0)); out.push({ k: f, l: m.toLocaleDateString('en-GB', { month: 'short' }) + (m.getMonth() === 0 || i === 11 ? ' ' + String(m.getFullYear()).slice(2) : ''), from: f, to: t > today ? today : t, part: t > today }); } }
  return out.map((r) => { const W = wtRange(id, r.from, r.to); return { ...r, s: W.tot.sessions, u: W.tot.users, v: W.tot.views, b: W.hasEng && W.tot.sessions ? (W.tot.sessions - W.tot.engaged_sessions) / W.tot.sessions : null, has: W.T.length > 0 }; });
}
function wtTrendChart(box, rows, gran) {
  box.replaceChildren();
  const W = Math.max(280, box.clientWidth), H = 230, M = { t: 14, r: 12, b: 24, l: 40 };
  const x = d3.scaleBand(rows.map((r) => r.k), [M.l, W - M.r]).padding(0.22);
  const y = d3.scaleLinear([0, d3.max(rows, (r) => Math.max(r.s, r.u)) || 1], [H - M.b, M.t]).nice();
  const svg = d3.select(box).append('svg').attr('viewBox', '0 0 ' + W + ' ' + H).attr('width', '100%');
  svg.append('g').selectAll('line').data(y.ticks(4)).join('line').attr('x1', M.l).attr('x2', W - M.r).attr('y1', (v) => y(v)).attr('y2', (v) => y(v)).attr('stroke', 'rgba(255,255,255,.07)');
  svg.append('g').selectAll('text').data(y.ticks(4)).join('text').attr('x', M.l - 6).attr('y', (v) => y(v) + 4).attr('text-anchor', 'end').attr('fill', 'currentColor').attr('opacity', 0.6).style('font-size', '11px').text((v) => nf.format(v));
  const step = Math.ceil(rows.length / (W < 500 ? 5 : 8));
  svg.append('g').selectAll('text').data(rows.filter((_, i) => (rows.length - 1 - i) % step === 0)).join('text').attr('x', (r) => x(r.k) + x.bandwidth() / 2).attr('y', H - 6).attr('text-anchor', 'middle').attr('fill', 'currentColor').attr('opacity', 0.6).style('font-size', '11px').text((r) => r.l);
  const tip = (r) => nf.format(r.s) + ' visit · ' + nf.format(r.u) + ' visitor · ' + nf.format(r.v) + ' page' + (r.b != null ? ' · bounce ' + Math.round(r.b * 100) + '%' : '') + (r.part ? ' (cholche)' : '');
  const lbl = (r) => (gran === 'day' ? dfmt(r.from) : gran === 'week' ? dfmt(r.from) + ' – ' + dfmt(r.to) : r.l);
  svg.append('g').selectAll('rect').data(rows).join('rect').attr('x', (r) => x(r.k)).attr('width', x.bandwidth()).attr('y', (r) => y(r.s)).attr('height', (r) => y(0) - y(r.s)).attr('rx', 2)
    .attr('fill', (r) => (r.part ? 'rgba(78,168,255,.55)' : '#4EA8FF')).on('mousemove', (ev, r) => showTip(box, ev, lbl(r), tip(r))).on('mouseleave', () => (tipOf(box).hidden = true));
  svg.append('path').datum(rows).attr('fill', 'none').attr('stroke', '#3FD3A8').attr('stroke-width', 2).attr('d', d3.line().x((r) => x(r.k) + x.bandwidth() / 2).y((r) => y(r.u)));
  if (gran !== 'day' && rows.length <= 12) svg.append('g').selectAll('text').data(rows.filter((r) => r.s)).join('text').attr('x', (r) => x(r.k) + x.bandwidth() / 2).attr('y', (r) => y(r.s) - 4).attr('text-anchor', 'middle').attr('fill', 'currentColor').attr('opacity', 0.8).style('font-size', '10px').text((r) => nf.format(r.s));
}
/* top pages side by side: today, this week, last 7 days, this month, last 30 days */
function wtPageCompare(id, today) {
  const P = wtPeriods(today);
  const cols = [['today', 'Aaj'], ['week', 'Ei shoptah'], ['month', 'Ei mash'], ['d30', '30 din']];
  const by = {}; cols.forEach(([k]) => { by[k] = {}; wtRange(id, P[k][1], P[k][2]).pages.forEach((x) => { by[k][x.page] = x; }); });
  const all = {}; Object.values(by).forEach((m) => Object.values(m).forEach((x) => { all[x.page] = all[x.page] || { page: x.page, title: x.title }; }));
  const rows = Object.values(all).sort((a, b) => ((by.d30[b.page] || {}).views || 0) - ((by.d30[a.page] || {}).views || 0) || ((by.today[b.page] || {}).views || 0) - ((by.today[a.page] || {}).views || 0)).slice(0, 15);
  if (!rows.length) return el('p', { class: 'note' }, 'Page er data ekhono ashe nai (setupGA4 run korle 3 mash er page data ashbe).');
  const rank = {}; cols.forEach(([k]) => { Object.values(by[k]).sort((a, b) => b.views - a.views).forEach((x, i) => { (rank[k] = rank[k] || {})[x.page] = i + 1; }); });
  return table([{ l: 'Page', f: (x) => el('div', {}, el('b', {}, (x.title || x.page).slice(0, 60)), el('div', { class: 'note' }, x.page.slice(0, 70))) },
    ...cols.map(([k, l]) => ({ l: l + ' (dekha)', r: 1, f: (x) => { const v = by[k][x.page]; return v ? el('span', {}, nf.format(v.views), rank[k][x.page] <= 3 ? el('span', { class: 'note' }, ' #' + rank[k][x.page]) : null) : '—'; } })),
    { l: 'Gor shomoy (30 din)', r: 1, f: (x) => { const v = by.d30[x.page]; return v ? wtDur(v.sec, v.users) : '—'; } }], rows);
}
function webTodayCard(id) {
  const today = todayStr();
  const RT = (S.web_traffic || []).find((r) => r.id === id + '_realtime');
  const rtFresh = RT && RT.asof && (Date.now() - Date.parse(RT.asof)) < 45 * 60 * 1000;
  const any = (S.web_traffic || []).some((r) => (r.business || 'kidscare') === id && r.date);
  if (!any && !RT) return card('🌐 Website traffic', 'Google Analytics (GA4)', emptyBox('Ekhono GA4 data ashe nai', 'Apps Script e setupGA4 run korle ekhane aj, ei shoptah, ei mash koyjon ashlo, kon page dekhche, bounce, ar ekhon live koyjon ache dekhabe.'));
  const P = wtPeriods(today); if (!P[wtPer]) wtPer = 'today';
  const [lbl, from, to, pFrom, pLbl, pTo] = P[wtPer];
  const W = wtRange(id, from, to);
  const prev = pFrom ? wtRange(id, pFrom, pTo || wtAdd(pFrom, Math.round((Date.parse(to) - Date.parse(from)) / 864e5))) : null;
  const pSel = el('select', { 'aria-label': 'Shomoy' }, Object.entries(P).map(([k, v]) => el('option', { value: k, selected: wtPer === k }, v[0])));
  pSel.addEventListener('change', () => { wtPer = pSel.value; render(); });
  const gSel = el('select', { 'aria-label': 'Graph' }, [['day', 'Din onujayi (30 din)'], ['week', 'Shoptah onujayi (12 shoptah)'], ['month', 'Mash onujayi (12 mash)']].map(([v, l]) => el('option', { value: v, selected: wtGran === v }, l)));
  gSel.addEventListener('change', () => { wtGran = gSel.value; render(); });
  const trend = wtTrendRows(id, wtGran, today);
  const chart = el('div', { class: 'chart' }); requestAnimationFrame(() => wtTrendChart(chart, trend, wtGran));
  const done = trend.filter((r) => r.has && !r.part); const best = [...done].sort((a, b) => b.s - a.s)[0];
  const gName = { day: 'din', week: 'shoptah', month: 'mash' }[wtGran];
  const all = (S.web_traffic || []).filter((r) => (r.business || 'kidscare') === id && r.date).map((r) => r.date).sort();
  const pn = ((S.web_traffic || []).filter((r) => (r.business || 'kidscare') === id && r.date && r.property_name).sort((x, y) => y.date.localeCompare(x.date))[0] || {}).property_name;
  return card('🌐 Website traffic · ' + lbl, 'Google Analytics (GA4)' + (pn ? ': ' + pn : '') + ' · ' + (W.last ? 'update ' + ago(W.last) : '') + ' · 15 min por por · GA4 ajker hishab kichu ghonta pichiye thake', el('div', { class: 'ctrls' }, pSel),
    RT ? el('div', { class: 'banner', style: 'background:var(--soft);border-color:var(--line)' }, el('b', {}, '🟢 Ekhon website e: ' + (RT.activeUsers || 0) + ' jon'), rtFresh ? '' : ' (' + ago(RT.asof) + ' er hishab)',
      (RT.pages || []).length ? el('div', { class: 'note' }, 'Dekhche: ' + RT.pages.slice(0, 5).map((p) => p.page.slice(0, 40) + ' (' + p.users + ')').join(' · ')) : null,
      (RT.devices || []).length ? el('div', { class: 'note' }, RT.devices.map((d) => d.device + ' ' + d.users).join(' · ')) : null) : null,
    W.T.length ? wtTiles(W, null) : emptyBox('Ei shomoyer data nai', lbl + ' er GA4 data ekhono ashe nai.'),
    wtChange(W, prev, pLbl),
    el('section', { class: 'card dark' }, el('div', { class: 'hd' }, el('div', {}, el('h2', {}, 'Traffic graph · ' + { day: 'protidin', week: 'proti shoptah', month: 'proti mash' }[wtGran]), el('p', { class: 'note' }, 'Nil bar = visit (session) · shobuj rekha = visitor' + (best ? ' · sobcheye beshi: ' + (wtGran === 'day' ? dfmt(best.from) : wtGran === 'week' ? dfmt(best.from) + ' er shoptah' : best.l) + ' (' + nf.format(best.s) + ')' : '') + (all.length ? ' · data ' + new Date(all[0] + 'T00:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) + ' theke' : ''))), gSel), chart,
      done.length >= 2 ? el('p', { class: 'note' }, 'Gor ' + nf.format(Math.round(sumBy(done, (r) => r.s) / done.length)) + ' visit / ' + gName + ' (shesh hoye jawa ' + done.length + ' ' + gName + ')') : null),
    el('div', { class: 'grid2' },
      card(lbl + ' kon page beshi dekhche', '', wtPageTable(W, 8)),
      card('Kotha theke ashche (' + lbl.toLowerCase() + ')', '', W.src.length ? table([{ l: 'Source / medium', f: (x) => el('b', {}, x.k) }, { l: 'Visit', r: 1, f: (x) => nf.format(x.sessions) }, { l: 'Share', r: 1, f: (x) => wtPct(x.sessions, W.tot.sessions) }], W.src.slice(0, 8)) : el('p', { class: 'note' }, '—'))),
    card('Kon page e beshi traffic: aaj, ei shoptah, ei mash', 'Page view · #1–#3 = oi shomoyer top page · 30 din er dekha onujayi saja', wtPageCompare(id, today)));
}
/* cards at the top of the Kids Care Briefing tab (the AI brief card is added when that feature ships) */
function kcTopCards(id) { return [typeof aiBriefCard === 'function' ? aiBriefCard(id) : null, webTodayCard(id)].filter(Boolean); }
/* Sales tab: same period as the order-source card */
function webTrafficCard(id, from, to, label, webOrders) {
  const W = wtRange(id, from, to);
  if (!W.T.length) return card('Website traffic · ' + label, 'Google Analytics (GA4) theke', emptyBox('Ei shomoyer traffic data nai', (S.web_traffic || []).length ? 'Ei din/mash e GA4 data nai.' : 'GA4 connect hole ekhane visitor, page, bounce, source ar conversion dekhabe (Apps Script → setupGA4).'));
  const dev = Object.entries(W.dev).sort((a, b) => b[1] - a[1]); const devTot = dev.reduce((s, x) => s + x[1], 0);
  return card('Website traffic · ' + label, 'Google Analytics (GA4) · ' + (W.last ? 'update ' + ago(W.last) : ''),
    wtTiles(W, webOrders),
    el('div', { class: 'grid2' },
      card('Kotha theke visit', 'Source / medium', table([{ l: 'Source / medium', f: (x) => el('b', {}, x.k) }, { l: 'Visit', r: 1, f: (x) => nf.format(x.sessions) }, { l: 'Share', r: 1, f: (x) => wtPct(x.sessions, W.tot.sessions) }, { l: 'GA4 kena', r: 1, f: (x) => x.purchases || '—' }], W.src.slice(0, 12))),
      card('Kon page beshi dekhche', 'Page view onujayi', wtPageTable(W, 12))),
    el('div', { class: 'grid2' },
      card('Prothom kon page e dhoke (landing)', 'Bounce = kichu na kore chole jawa', W.landing.length ? table([{ l: 'Landing page', f: (x) => x.page.slice(0, 70) }, { l: 'Visit', r: 1, f: (x) => nf.format(x.sessions) }, { l: 'Bounce', r: 1, f: (x) => wtPct(x.sessions - x.engaged, x.sessions) }], W.landing.slice(0, 10)) : el('p', { class: 'note' }, 'Data nai.')),
      card('Device o shohor', '', el('div', { style: 'display:grid;gap:8px' },
        dev.length ? el('div', {}, dev.map(([k, v]) => pill(k + ' ' + wtPct(v, devTot), ''))) : null,
        W.city.length ? table([{ l: 'Shohor', f: (x) => x[0] }, { l: 'Visit', r: 1, f: (x) => nf.format(x[1]) }], W.city.slice(0, 10)) : el('p', { class: 'note' }, 'Data nai.')))),
    el('p', { class: 'note' }, 'FACT: GA4. Bounce = session e 10 second er kom, 1 page, kono kaj (cart/click) nai. Visitor sonkha din/source jog korle ektu beshi hoy (ekjon duibar ashle).'));
}
`;
