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
/* Briefing: right now + today */
function webTodayCard(id) {
  const today = todayStr();
  const W = wtRange(id, today, today);
  const RT = (S.web_traffic || []).find((r) => r.id === id + '_realtime');
  const rtFresh = RT && RT.asof && (Date.now() - Date.parse(RT.asof)) < 45 * 60 * 1000;
  if (!W.T.length && !RT) return card('🌐 Website · aaj', 'Google Analytics (GA4)', emptyBox('Ekhono GA4 data ashe nai', 'Apps Script e setupGA4 run korle ekhane aj koyjon ashlo, kon page dekhche, bounce, ar ekhon live koyjon ache dekhabe.'));
  return card('🌐 Website · aaj', 'Google Analytics (GA4) · ' + (W.last ? 'update ' + ago(W.last) : '') + ' · 15 min por por · GA4 ajker hishab kichu ghonta pichiye thake',
    RT ? el('div', { class: 'banner', style: 'background:var(--soft);border-color:var(--line)' }, el('b', {}, '🟢 Ekhon website e: ' + (RT.activeUsers || 0) + ' jon'), rtFresh ? '' : ' (' + ago(RT.asof) + ' er hishab)',
      (RT.pages || []).length ? el('div', { class: 'note' }, 'Dekhche: ' + RT.pages.slice(0, 5).map((p) => p.page.slice(0, 40) + ' (' + p.users + ')').join(' · ')) : null,
      (RT.devices || []).length ? el('div', { class: 'note' }, RT.devices.map((d) => d.device + ' ' + d.users).join(' · ')) : null) : null,
    wtTiles(W, null),
    el('div', { class: 'grid2' },
      card('Aaj kon page beshi dekhche', '', wtPageTable(W, 8)),
      card('Kotha theke ashche (aaj)', '', W.src.length ? table([{ l: 'Source / medium', f: (x) => el('b', {}, x.k) }, { l: 'Visit', r: 1, f: (x) => nf.format(x.sessions) }, { l: 'Share', r: 1, f: (x) => wtPct(x.sessions, W.tot.sessions) }], W.src.slice(0, 8)) : el('p', { class: 'note' }, '—'))));
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
