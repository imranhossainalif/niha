// Legacy-page code: Kids Care "Attendance" tab, from the team daily report sheet (KidsCareBD_Daily_Report_1).
// Data: sales_team/staff (current month) and sales_team/staff_<YYYY-MM> (one per month), written by scripts/kc_sync.py
// on every sheet push. Shows who came in by a chosen time, hours worked, day-wise score and a leaderboard.
export const ATTENDANCE_JS = String.raw`/* Business OS: attendance tab (sales_team/staff*) */
let atDay = null, atMon = null, atGrid = 'hours', atLbSort = 'score', atLbP = 'month';
let atCut = (() => { try { return localStorage.getItem('bos_at_cut') || '10:45'; } catch (e) { return '10:45'; } })();
const atMin = (t) => { const m = /^(\d{1,2}):(\d{2})/.exec(t || ''); return m ? +m[1] * 60 + +m[2] : null; };
const atHM = (m) => (m == null ? '—' : String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(Math.round(m % 60)).padStart(2, '0'));
const atH = (h) => (h ? (Math.round(h * 10) / 10) + ' gh' : '—');
function atDoc(mon) {
  const cur = stDoc('staff');
  return S.sales_team.find((d) => d.id === 'staff_' + mon) || (cur && cur.month === mon ? cur : null);
}
function atMonths() {
  const s = new Set(S.sales_team.filter((d) => /^staff_\d{4}-\d{2}$/.test(d.id)).map((d) => d.id.slice(6)));
  const cur = stDoc('staff'); if (cur && cur.month) s.add(cur.month);
  return [...s].sort().reverse();
}
/** One person on one day: times, hours (live while still in office today), status. */
function atDayInfo(p, date, O, nowMin) {
  const d = (p.days || []).find((x) => x.date === date) || null;
  const offJs = ((Number(O.off_day) || 6) + 6) % 7; // sheet 1=Sun..7=Sat → JS getDay
  const off = new Date(date + 'T00:00:00').getDay() === offJs;
  const inM = atMin(d && d.in), outM = atMin(d && d.out), start = atMin(O.in) || 600, cut = atMin(atCut) || 645;
  const isToday = date === todayStr();
  let hours = d && d.hours ? Number(d.hours) : 0, live = false;
  if (!hours && inM != null && outM != null && outM > inM) hours = (outM - inM) / 60;
  if (!hours && inM != null && outM == null && isToday && nowMin > inM) { hours = (nowMin - inM) / 60; live = true; }
  let st;
  if (inM == null) st = off ? ['Chuti', ''] : isToday && nowMin < cut ? ['Ekhono ashe nai', 'w'] : ['Ashe nai', 'b'];
  else if (inM <= start) st = ['Shomoy moto', 'g'];
  else st = [(inM - start) + ' min deri', inM <= cut ? 'w' : 'b'];
  const rep = d && d.report && d.report !== '❌' && d.report !== '—';
  return { d, off, inM, outM, hours, live, st, late: inM != null && inM > start, rep, score: d ? Number(d.score) || 0 : 0, inOffice: inM != null && outM == null && isToday };
}
function attendanceView(id) {
  if (id !== 'kidscare') return [card('Attendance', '', emptyBox('Sheet connect kora nai', 'Ei business er daily report sheet ekhono jog hoyni. Kids Care er moto sheet dile ekhane ashbe.'))];
  const months = atMonths();
  if (!months.length) return [card('Attendance', '', emptyBox('Ekhono sync hoyni', 'Daily report sheet (KidsCareBD_Daily_Report_1) er prothom push er por ekhane hajira, ghonta ar score dekhabe.'))];
  const today = todayStr();
  if (!atMon || !months.includes(atMon)) atMon = months[0];
  const SF = atDoc(atMon); const O = SF.office || {}; const people = (SF.people || []).filter((p) => p.name && !/^Extra/i.test(p.name));
  const now = new Date(); const nowMin = now.getHours() * 60 + now.getMinutes();
  if (!atDay || atDay.slice(0, 7) !== atMon) atDay = atMon === today.slice(0, 7) ? today : (SF.people[0] && SF.people[0].days.length ? SF.people[0].days[SF.people[0].days.length - 1].date : atMon + '-01');
  const shift = (k) => { const x = new Date(atDay + 'T00:00:00'); x.setDate(x.getDate() + k); const n = ymd(x); if (n.slice(0, 7) !== atMon && months.includes(n.slice(0, 7))) atMon = n.slice(0, 7); atDay = n; render(); };
  const bPrev = el('button', { class: 'btn sm', 'aria-label': 'Ager din' }, '‹'); bPrev.addEventListener('click', () => shift(-1));
  const bNext = el('button', { class: 'btn sm', 'aria-label': 'Porer din' }, '›'); bNext.addEventListener('click', () => shift(1)); if (atDay >= today) bNext.disabled = true;
  const dIn = el('input', { type: 'date', 'aria-label': 'Din', max: today }); dIn.value = atDay;
  dIn.addEventListener('change', () => { if (!dIn.value) return; atDay = dIn.value; if (months.includes(atDay.slice(0, 7))) atMon = atDay.slice(0, 7); render(); });
  const bToday = el('button', { class: 'btn sm' }, 'Aaj'); bToday.addEventListener('click', () => { atDay = today; atMon = today.slice(0, 7); render(); });
  const cutIn = el('input', { type: 'time', 'aria-label': 'Kon shomoy porjonto', step: 60 }); cutIn.value = atCut;
  cutIn.addEventListener('change', () => { if (!cutIn.value) return; atCut = cutIn.value; try { localStorage.setItem('bos_at_cut', atCut); } catch (e) { /* ignore */ } render(); });

  /* 1. the chosen day */
  const rows = people.map((p) => ({ p, ...atDayInfo(p, atDay, O, nowMin) }));
  const cut = atMin(atCut) || 645;
  const came = rows.filter((r) => r.inM != null && r.inM <= cut), lateAfter = rows.filter((r) => r.inM != null && r.inM > cut), absent = rows.filter((r) => r.inM == null && !r.off);
  const onTime = rows.filter((r) => r.st[1] === 'g'), latecomers = rows.filter((r) => r.late);
  const avgLate = latecomers.length ? Math.round(sumBy(latecomers, (r) => r.inM - (atMin(O.in) || 600)) / latecomers.length) : 0;
  const names = (xs) => xs.map((r) => r.p.name).join(', ') || '—';
  const isOff = rows.length && rows.every((r) => r.off);
  const tiles = el('div', { class: 'tiles' },
    tile('var(--t1)', atCut + ' er moddhe office e', came.length + ' / ' + people.length, names(came)),
    tile('var(--t2)', 'Shomoy moto (' + (O.in || '10:00') + ' er age)', String(onTime.length), names(onTime)),
    tile('var(--t5)', 'Deri te ashche', String(latecomers.length), latecomers.length ? 'Gor ' + avgLate + ' min deri' + (lateAfter.length ? ' · ' + atCut + ' er pore: ' + names(lateAfter) : '') : 'Keu deri koreni'),
    tile('var(--t3)', 'Ashe nai', isOff ? 'Chuti' : String(absent.length), isOff ? 'Saptahik chutir din' : names(absent)),
    tile('var(--t4)', 'Mot kaj er ghonta', atH(sumBy(rows, (r) => r.hours)), rows.some((r) => r.live) ? 'Ekhon office e: ' + names(rows.filter((r) => r.inOffice)) : 'Gor ' + atH(sumBy(rows, (r) => r.hours) / Math.max(1, rows.filter((r) => r.hours).length)) + ' / jon'),
    tile('var(--t6)', 'Report diyeche', rows.filter((r) => r.rep).length + ' / ' + people.length, 'Gor score ' + Math.round(sumBy(rows, (r) => r.score) / Math.max(1, people.length))));
  const tg = O.targets || {};
  const work = (r) => {
    const t = tg[r.p.name] || {}; const m = (r.d && r.d.m) || {};
    const parts = Object.entries(m).filter(([, v]) => v).map(([k, v]) => { const i = (t.metrics || []).indexOf(k); const tv = i >= 0 ? (t.targets || [])[i] : 0; return k + ' ' + nf.format(v) + (tv ? '/' + nf.format(tv) : ''); });
    return parts.length ? el('span', { class: 'note' }, parts.join(' · ')) : '—';
  };
  const dayTbl = table([
    { l: 'Naam', f: (r) => el('div', {}, el('b', {}, r.p.name), el('div', { class: 'note' }, r.p.role || '')) },
    { l: 'Dhoka', f: (r) => (r.inM != null ? el('b', {}, atHM(r.inM)) : '—') },
    { l: 'Ber', f: (r) => (r.outM != null ? atHM(r.outM) : r.inOffice ? pill('Office e', 'g') : '—') },
    { l: 'Ghonta', r: 1, f: (r) => (r.live ? el('span', {}, atH(r.hours), el('div', { class: 'note' }, 'cholche')) : atH(r.hours)) },
    { l: 'Obostha', f: (r) => pill(r.st[0], r.st[1]) },
    { l: 'Report', f: (r) => (r.off && !r.d ? '' : r.rep ? pill('Diyeche', 'g') : pill('Dey nai', 'b')) },
    { l: 'Score', r: 1, f: (r) => (r.score ? el('b', { style: 'color:' + (r.score >= 80 ? 'var(--good)' : r.score >= 50 ? 'var(--warn)' : 'var(--bad)') }, String(Math.round(r.score))) : '—') },
    { l: 'Kaj (aaj / target)', f: work },
    { l: 'Ki korse / shomossa', f: (r) => { const d = r.d || {}; const t = [d.main, d.other].filter(Boolean).join(' · '); return t || d.problem ? el('div', {}, t ? el('div', {}, t) : null, d.problem ? el('div', { class: 'note' }, 'Shomossa: ' + d.problem) : null, d.plan ? el('div', { class: 'note' }, 'Kal: ' + d.plan) : null) : '—'; } }],
    [...rows].sort((a, b) => (a.inM == null) - (b.inM == null) || (a.inM || 0) - (b.inM || 0)));
  const dayCard = card('Hajira · ' + new Date(atDay + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' }),
    'Daily report sheet theke · office ' + (O.in || '10:00') + '–' + (O.out || '19:00') + ' · sheet push ' + ago(SF.asof) + ' (10 min por por)',
    el('div', { class: 'ctrls' }, bPrev, dIn, bNext, bToday, el('span', { class: 'note' }, 'Kon shomoy porjonto:'), cutIn), tiles, dayTbl,
    el('p', { class: 'note' }, 'FACT: dhoka/ber er shomoy ar score sheet theke. "Ghonta" sheet e na thakle dhoka-ber theke; aaj ber na hole ekhon porjonto (cholche). Score = shomoy 30 + report 20 + kaj 50 (sheet er niyom).'));

  /* 2. month grid: hours / in-time / score per day */
  const [y, mo] = atMon.split('-').map(Number); const nd = new Date(y, mo, 0).getDate();
  const last = atMon === today.slice(0, 7) ? Number(today.slice(8)) : nd;
  const dates = Array.from({ length: last }, (_, i) => atMon + '-' + String(i + 1).padStart(2, '0'));
  const gSel = el('select', { 'aria-label': 'Ki dekhabo' }, [['hours', 'Ghonta'], ['in', 'Dhokar shomoy'], ['score', 'Score']].map(([v, l]) => el('option', { value: v, selected: atGrid === v }, l)));
  gSel.addEventListener('change', () => { atGrid = gSel.value; render(); });
  const mSel = el('select', { 'aria-label': 'Mash' }, months.map((m) => el('option', { value: m, selected: m === atMon }, monthLabel(m))));
  mSel.addEventListener('change', () => { atMon = mSel.value; atDay = null; render(); });
  const tH = (O.targets && Object.values(O.targets)[0] && Object.values(O.targets)[0].hours) || 8;
  const cellOf = (p, dt) => {
    const r = atDayInfo(p, dt, O, nowMin);
    if (O.fine_from && dt < O.fine_from && r.inM == null) return ['', '', 'Sheet e hishab shuru ' + dfmt(O.fine_from)];
    if (r.off && r.inM == null) return ['', 'var(--soft)', 'Chuti'];
    if (atGrid === 'in') return r.inM == null ? ['✕', 'color-mix(in srgb, var(--bad) 18%, transparent)', 'Ashe nai'] : [atHM(r.inM), r.st[1] === 'g' ? 'color-mix(in srgb, var(--good) 22%, transparent)' : r.st[1] === 'w' ? 'color-mix(in srgb, var(--warn) 25%, transparent)' : 'color-mix(in srgb, var(--bad) 22%, transparent)', r.st[0]];
    if (atGrid === 'score') { const s = Math.round(r.score); return r.d && (r.score || r.inM != null) ? [String(s), s >= 80 ? 'color-mix(in srgb, var(--good) 25%, transparent)' : s >= 50 ? 'color-mix(in srgb, var(--warn) 25%, transparent)' : 'color-mix(in srgb, var(--bad) 20%, transparent)', 'Score ' + s] : ['—', '', 'Data nai']; }
    if (!r.hours) return [r.inM == null ? '✕' : '?', r.inM == null ? 'color-mix(in srgb, var(--bad) 18%, transparent)' : '', r.inM == null ? 'Ashe nai' : 'Dhokar shomoy ' + atHM(r.inM) + ', ber hoyar shomoy nai'];
    return [String(Math.round(r.hours * 10) / 10), r.hours >= tH ? 'color-mix(in srgb, var(--good) 25%, transparent)' : r.hours >= tH * 0.75 ? 'color-mix(in srgb, var(--warn) 25%, transparent)' : 'color-mix(in srgb, var(--bad) 20%, transparent)', atHM(r.inM) + '–' + (r.outM != null ? atHM(r.outM) : '…')];
  };
  const th = 'padding:6px 4px;font-size:11px;font-weight:600;text-align:center;white-space:nowrap;border-bottom:1px solid var(--line)';
  const grid = el('div', { style: 'overflow-x:auto;-webkit-overflow-scrolling:touch' }, el('table', { style: 'border-collapse:collapse;font-size:12px;min-width:100%' },
    el('thead', {}, el('tr', {}, el('th', { style: th + ';text-align:left;position:sticky;left:0;background:var(--panel)' }, 'Naam'), dates.map((dt) => { const x = new Date(dt + 'T00:00:00'); const b = el('th', { style: th + ';cursor:pointer' + (dt === atDay ? ';color:var(--accent)' : ''), title: 'Ei din dekhun' }, String(x.getDate()), el('div', { class: 'note', style: 'font-weight:400' }, x.toLocaleDateString('en-GB', { weekday: 'narrow' }))); b.addEventListener('click', () => { atDay = dt; render(); }); return b; }))),
    el('tbody', {}, people.map((p) => el('tr', {}, el('td', { style: 'padding:6px 8px 6px 0;white-space:nowrap;font-weight:600;position:sticky;left:0;background:var(--panel)' }, p.name),
      dates.map((dt) => { const [t, bg, tip] = cellOf(p, dt); return el('td', { title: dfmt(dt) + ' · ' + tip, style: 'text-align:center;padding:5px 3px;border:2px solid var(--panel);border-radius:6px;background:' + (bg || 'transparent') + ';min-width:34px' }, t); }))))));
  const gridCard = card('Hajira o ghonta · ' + monthLabel(atMon), 'Protidin ke kokhon dhukse, koto ghonta kaj korse, score koto · tarikh e click korle oi din upore dekhabe', el('div', { class: 'ctrls' }, mSel, gSel), grid,
    el('p', { class: 'note' }, 'Shobuj = purno (ghonta ' + tH + '+, shomoy moto, score 80+) · holud = kom · lal = khub kom / ashe nai · dhushor = chuti · khali = sheet e hishab shuru hoyar age.'));

  /* 3. leaderboard */
  const wk0 = (() => { const x = new Date(atDay + 'T00:00:00'); x.setDate(x.getDate() - 6); return ymd(x); })();
  const P = { month: [monthLabel(atMon), atMon + '-01', atMon + '-31'], week: ['Shesh 7 din (' + dfmt(wk0) + '–' + dfmt(atDay) + ')', wk0, atDay] };
  const pSel = el('select', { 'aria-label': 'Shomoy' }, Object.entries(P).map(([k, v]) => el('option', { value: k, selected: atLbP === k }, v[0]))); pSel.addEventListener('change', () => { atLbP = pSel.value; render(); });
  const sSel = el('select', { 'aria-label': 'Kisher upor rank' }, [['score', 'Score diye'], ['hours', 'Ghonta diye'], ['ontime', 'Shomoy moto ashar % diye'], ['reports', 'Report diye']].map(([v, l]) => el('option', { value: v, selected: atLbSort === v }, l)));
  sSel.addEventListener('change', () => { atLbSort = sSel.value; render(); });
  const [lbL, lbF, lbT] = P[atLbP]; const from = O.fine_from && O.fine_from > lbF ? O.fine_from : lbF;
  const docsFor = [...new Set([lbF.slice(0, 7), lbT.slice(0, 7)])].map(atDoc).filter(Boolean);
  const lb = people.map((p0) => {
    const all = docsFor.flatMap((D) => ((D.people || []).find((x) => x.name === p0.name) || { days: [] }).days.map((d) => ({ ...d })));
    const pp = { ...p0, days: all };
    const ds = all.map((d) => d.date).filter((dt) => dt >= from && dt <= (lbT > today ? today : lbT));
    const info = ds.map((dt) => atDayInfo(pp, dt, O, nowMin)).filter((r) => !r.off || r.inM != null);
    const work = info.filter((r) => !r.off); const scored = work;
    const present = info.filter((r) => r.inM != null);
    return { p: p0, present: present.length, wd: work.length, late: present.filter((r) => r.late).length, ontime: present.length ? present.filter((r) => !r.late).length / present.length : 0,
      avgIn: present.length ? sumBy(present, (r) => r.inM) / present.length : null, hours: sumBy(info, (r) => r.hours), reports: info.filter((r) => r.rep).length,
      score: scored.length ? sumBy(scored, (r) => r.score) / scored.length : 0, fine: atLbP === 'month' ? Number(p0.fine) || 0 : null };
  }).sort((a, b) => (b[atLbSort] - a[atLbSort]) || (b.score - a.score) || (b.hours - a.hours));
  const medal = (i) => pill(['১ম', '২য়', '৩য়'][i] || String(i + 1), i === 0 ? 'g' : i < 3 ? 'w' : '');
  const lbCard = card('Leaderboard · ' + lbL, 'Ke agiye: score, ghonta, shomoy moto asha, report · hishab ' + dfmt(from) + ' theke', el('div', { class: 'ctrls' }, pSel, sSel), table([
    { l: '#', f: (r) => medal(lb.indexOf(r)) },
    { l: 'Naam', f: (r) => el('div', {}, el('b', {}, r.p.name), el('div', { class: 'note' }, r.p.role || '')) },
    { l: 'Gor score', r: 1, f: (r) => el('div', {}, el('b', {}, String(Math.round(r.score))), el('div', { style: 'height:5px;border-radius:3px;background:var(--soft);margin-top:3px' }, el('div', { style: 'height:5px;border-radius:3px;width:' + Math.min(100, r.score) + '%;background:' + (r.score >= 80 ? 'var(--good)' : r.score >= 50 ? 'var(--warn)' : 'var(--bad)') }))) },
    { l: 'Upostithi', r: 1, f: (r) => r.present + ' / ' + r.wd + ' din' },
    { l: 'Shomoy moto', r: 1, f: (r) => (r.present ? Math.round(r.ontime * 100) + '%' : '—') },
    { l: 'Deri', r: 1, f: (r) => r.late || '0' },
    { l: 'Gor dhoka', r: 1, f: (r) => atHM(r.avgIn == null ? null : Math.round(r.avgIn)) },
    { l: 'Mot ghonta', r: 1, f: (r) => atH(r.hours) },
    { l: 'Gor ghonta', r: 1, f: (r) => atH(r.present ? r.hours / r.present : 0) },
    { l: 'Report', r: 1, f: (r) => r.reports },
    { l: 'Jorimana', r: 1, f: (r) => (r.fine == null ? '—' : r.fine ? el('b', { style: 'color:var(--bad)' }, tk(r.fine)) : tk(0)) }], lb),
    el('p', { class: 'note' }, 'FACT: sheet er protidiner data theke. Jorimana = sheet er hishab (' + (O.fine_after || 2) + ' din report na dile ' + tk(O.fine_tk || 200) + ').'));
  return [dayCard, lbCard, gridCard];
}
`;
