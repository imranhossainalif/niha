// Small, explicit edits applied to legacy/business-os.html when it is served at /app.
// The spec file itself stays untouched. Each `find` must occur exactly once, or the page refuses to load
// (so a change to the legacy file can't silently drop a patch). Remove a patch once its tab is ported natively.
import { SALES_LIVE_JS } from './salesLive';
import { ORDER_SOURCE_JS } from './orderSource';
import { WEB_TRAFFIC_JS } from './webTraffic';
import { ATTENDANCE_JS } from './attendance';

const SOCIAL_JS = String.raw`/* Business OS: Social Media tab = the native /social page in ONE permanent frame.
   The dashboard re-draws the view on every data update and on resize; re-creating the frame would reload it and lose
   a half-written post. So the frame lives outside #view and is laid over a placeholder that the tab draws. */
function socialView(id) {
  const B = window.__bosSocial || (window.__bosSocial = (() => {
    const host = document.createElement('div');
    host.style.cssText = 'position:absolute;z-index:1;display:none';
    const f = document.createElement('iframe');
    f.title = 'Social Media'; f.style.cssText = 'width:100%;height:700px;border:0;display:block;background:transparent';
    host.appendChild(f); document.body.appendChild(host);
    const st = { host, f, id: null, ph: null, c: 0, d: 0 };
    const size = () => { const h = Math.max(500, st.c, st.d) + 'px'; f.style.height = h; if (st.ph) st.ph.style.height = h; };
    st.size = size;
    window.addEventListener('message', (e) => {
      if (e.origin !== location.origin || !e.data || e.source !== f.contentWindow) return;
      if (e.data.bosSocialHeight) st.c = e.data.bosSocialHeight;
      if (e.data.bosSocialDialog != null) st.d = e.data.bosSocialDialog;
      size();
      if (e.data.bosSocialFocus) host.scrollIntoView({ behavior: 'smooth', block: 'start' });
      if (e.data.bosSocialToast) toast(String(e.data.bosSocialToast));
      if (e.data.bosSocialConnected != null) f.contentWindow.postMessage({ bosSocialConnected: e.data.bosSocialConnected }, location.origin);
    });
    // follow the placeholder: shown and placed over it while it is on the page, hidden otherwise
    setInterval(() => {
      if (!st.ph || !document.body.contains(st.ph)) { host.style.display = 'none'; return; }
      const r = st.ph.getBoundingClientRect();
      host.style.display = 'block'; host.style.top = (r.top + window.scrollY) + 'px'; host.style.left = (r.left + window.scrollX) + 'px'; host.style.width = r.width + 'px';
    }, 200);
    return st;
  })());
  if (B.id !== id) { B.id = id; B.c = 0; B.d = 0; B.f.src = '/social/' + id + '?embed=1'; }
  B.ph = el('div', { style: 'width:100%' }); B.size();
  return [B.ph];
}
`;

export type Patch = { name: string; find: string; replace: string };

export const PATCHES: Patch[] = [
  {
    name: 'Serve d3 from this server (no CDN dependency)',
    find: '<script src="https://cdnjs.cloudflare.com/ajax/libs/d3/7.9.0/d3.min.js"></script>',
    replace: '<script src="/legacy/vendor/d3-7.9.0.min.js"></script>',
  },
  {
    name: 'InboxPilot: website → knowledge fetches the page on the server (replaces the Make scenario)',
    find: "const webB = el('button', { class: 'btn sm' }, '+ Website theke'); webB.addEventListener('click', () => openForm('ib_kb', null, { business: 'kidscare', kind: 'web', use: 'true', text: '' }));",
    replace: "const webB = el('button', { class: 'btn sm' }, '+ Website theke'); webB.addEventListener('click', async () => { const u = prompt('Website er link (lekha ber kore dekhabo, apni check kore save korben)'); if (!u) return; toast('Page porchi…'); try { const r = await window.__bos.fetchUrl(u); openForm('ib_kb', null, { business: 'kidscare', kind: 'web', use: 'true', link: r.url, title: 'Website: ' + (r.title || r.url).slice(0, 120), text: r.text }); } catch (e) { toast('Page pora jayni: ' + (e.message || e.code)); openForm('ib_kb', null, { business: 'kidscare', kind: 'web', use: 'true', link: u, text: '' }); } });",
  },
  {
    name: 'InboxPilot: show the live 24-hour reply window',
    find: "el('span', { class: 'note' }, 'Messenger e customer er shesh message er 24 ghontar moddhe reply dite hoy.')",
    replace: "el('span', { class: 'note' }, window.__bos.windowNote(c.ms))",
  },
  {
    name: 'InboxPilot Channels: native webhook status + old-message import',
    find: "row('Make scenario (team reply)', set.send_scenario, 'ID ' + (set.send_scenario || '—'))));",
    replace: "row('Make scenario (team reply)', set.send_scenario, 'ID ' + (set.send_scenario || '—')),\n    row('Native webhook (ei server)', true, 'Meta app er callback URL: ' + location.origin + '/api/meta/webhook — eta set korle Make ar lagbe na.'),\n    window.__bos.importBox()));",
  },
  {
    name: 'InboxPilot Billing: AI now runs on our own Anthropic key',
    find: "el('div', {}, el('b', {}, 'AI: '), 'Make er built-in Claude Haiku 5.5 — Make credit theke kate, alada API key lage na.'),",
    replace: "el('div', {}, el('b', {}, 'AI: '), 'Nijer Anthropic API key (server .env e ANTHROPIC_API_KEY, model ANTHROPIC_MODEL) — Anthropic console e khoroch dekhun.'),",
  },
  {
    name: 'InboxPilot Team: access is now per user in Admin → Users',
    find: "'Inbox dekhte protita member er nijer claude.ai te Make connector lagbe, ba apni nijer device theke uttor dite paren.'",
    replace: "'Inbox dekhte member ke Admin → Users e login din ar Kids Care business assign korun.'",
  },
  {
    name: 'Sales Team: live "aaj" card and clickable date-wise call list at the top',
    find: 'function bizSalesTeam(id) {',
    replace: SALES_LIVE_JS + 'function bizSalesTeam(id) {',
  },
  {
    name: 'Sales Team: show the live cards first',
    find: '  return [kcSprint(true), tiles, mergeNote, dayCard',
    replace: '  return [...stLiveCards(REPS, L), kcSprint(true), tiles, mergeNote, dayCard',
  },
  {
    name: 'Ad data: point to Admin → Integrations instead of claude.ai connectors',
    find: "server_not_connected: 'Supermetrics connector nai. claude.ai Settings → Connectors e add korun.'",
    replace: "server_not_connected: 'Ad data er token nai. Admin → Integrations e Meta \"Ads token\" (free) ba Supermetrics key boshan.'",
  },
  {
    name: 'Kids Care Sales: order source card (call / WhatsApp / Messenger / website / ads) by day, month or year',
    find: 'function bizSales(id) {',
    replace: ORDER_SOURCE_JS + WEB_TRAFFIC_JS + "function bizSales(id) { const __o = bizSalesBase(id); return id === 'kidscare' ? [...orderSourceCard(id), ...__o] : __o; }\nfunction bizSalesBase(id) {",
  },
  {
    name: 'Sync web_traffic (GA4) into the page too',
    find: "'ib_kb', 'ib_broadcasts'];",
    replace: "'ib_kb', 'ib_broadcasts', 'web_traffic', 'ai_brief'];",
  },
  {
    name: 'Kids Care Briefing: website today card at the top',
    find: "  if (tab === 'briefing') { const p = bizBriefing(id); return [p[0], id === 'kidscare' ? kcSprint(false) : null,",
    replace: "  if (tab === 'briefing') { const p = bizBriefing(id); return [p[0], ...(id === 'kidscare' ? kcTopCards(id) : []), id === 'kidscare' ? kcSprint(false) : null,",
  },
  {
    name: 'Attendance tab: code (team daily report sheet → hajira, ghonta, score, leaderboard)',
    find: 'function bizTeam(id) {',
    replace: ATTENDANCE_JS + 'function bizTeam(id) {',
  },
  {
    name: 'Attendance tab: in the business tab bar, after Sales Team',
    find: "['salesteam', 'Sales Team'], ",
    replace: "['salesteam', 'Sales Team'], ['attendance', 'Attendance'], ",
  },
  {
    name: 'Attendance tab: allowed route',
    find: "'sales','salesteam','finance'",
    replace: "'sales','salesteam','attendance','finance'",
  },
  {
    name: 'Attendance tab: view',
    find: 'sales: bizSales, salesteam: bizSalesTeam, finance: bizFinance, operations: bizOperations, product: bizProduct, content: bizContent, team: bizTeam',
    replace: 'sales: bizSales, salesteam: bizSalesTeam, attendance: attendanceView, finance: bizFinance, operations: bizOperations, product: bizProduct, content: bizContent, team: bizTeam',
  },
  {
    name: 'LRF Briefing: website traffic card (GA4, business lrf)',
    find: "if (tab === 'briefing') return [...agBriefing(), r90Card(id), ...bizBriefing(id)].filter(Boolean);",
    replace: "if (tab === 'briefing') return [...agBriefing(), webTodayCard(id), r90Card(id), ...bizBriefing(id)].filter(Boolean);",
  },
  {
    name: 'Sidebar profile opens Settings (API o connection, keys, limits)',
    find: '<div class="me"><i>I</i><div><b>Imran Hossain Alif</b><br>Owner</div></div>',
    replace: '<a class="me" href="/settings" title="Settings: API o connection, credit o limit" style="text-decoration:none;color:inherit;cursor:pointer"><i>I</i><div><b>Imran Hossain Alif</b><br>Owner · ⚙ Settings</div></a>',
  },
  {
    name: 'Social Media tab: in the business tab bar, after Marketing',
    find: "['marketing', 'Marketing'], ['sales', 'Sales'], ['salesteam', 'Sales Team'],",
    replace: "['marketing', 'Marketing'], ['social', 'Social Media'], ['sales', 'Sales'], ['salesteam', 'Sales Team'],",
  },
  {
    name: 'Social Media tab: allowed route',
    find: "'marketing','sales','salesteam','attendance'",
    replace: "'marketing','social','sales','salesteam','attendance'",
  },
  {
    name: 'Social Media tab: view (native page in a frame)',
    find: 'content: bizContent, team: bizTeam, calendar: bizCalendar, settings: bizSettings })[tab](id);',
    replace: 'content: bizContent, team: bizTeam, social: socialView, calendar: bizCalendar, settings: bizSettings })[tab](id);',
  },
  {
    name: 'Social Media tab: code',
    find: 'function bizCalendar(id) {',
    replace: SOCIAL_JS + 'function bizCalendar(id) {',
  },
  {
    name: 'Brand: EasyFounder (tab title)',
    find: '<title>Business OS</title>',
    replace: '<title>EasyFounder</title>',
  },
  {
    name: 'Brand: EasyFounder logo in the sidebar (full logo on desktop, mark on phones)',
    find: '<div class="brand"><i>B</i>Business OS</div>',
    replace: '<a class="brand" href="#overview" aria-label="EasyFounder" style="text-decoration:none"><img src="/brand/logo-white.png" alt="EasyFounder" style="width:100%;max-width:196px;height:auto;display:block"></a><a class="brand-m" href="#overview" aria-label="EasyFounder"><img src="/brand/mark-white.png" alt="EasyFounder" style="height:30px;width:30px;display:block"></a>',
  },
  {
    name: 'Brand: EasyFounder in the breadcrumb',
    find: "replaceChildren('Business OS › ',",
    replace: "replaceChildren('EasyFounder › ',",
  },
  {
    name: 'Brand: EasyFounder in the AI assistant rules',
    find: `You are the business assistant inside Imran's "Business OS" dashboard,`,
    replace: `You are the business assistant inside Imran's "EasyFounder" dashboard,`,
  },
  {
    name: 'InboxPilot Knowledge: websites (pages + products) and PDF/file upload for the AI',
    find: "return [card('Knowledge base', 'AI shudhu ekhane ja ache ta diye uttor dey. Product/offer/courier alada menu te.',",
    replace: "return [window.__bos.sourcesCard(), card('Knowledge base', 'AI shudhu ekhane ja ache ta diye uttor dey. Product/offer/courier alada menu te.',",
  },
];

export function applyPatches(html: string, patches = PATCHES): string {
  let out = html;
  for (const p of patches) {
    const n = out.split(p.find).length - 1;
    if (n !== 1) throw new Error(`Legacy patch "${p.name}" matched ${n} times (expected 1)`);
    out = out.replace(p.find, () => p.replace);
  }
  return out;
}

/** Full HTML document: the legacy file is an artifact body, so add the document shell and the compatibility shim. */
export function legacyDocument(legacyHtml: string): string {
  return '<!doctype html>\n<html lang="en">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n<script src="/legacy/bos-shim.js"></script>\n'
    // phone width: let cards and selects shrink instead of pushing the page sideways
    + '<style>.card div{min-width:0}.card .ctrls{flex-wrap:wrap}.card select,.card input{max-width:100%}'
    + '.brand-m{display:none}@media (max-width:860px){.brand-m{display:flex;align-items:center;flex:none;padding:0 6px 0 2px}}</style>\n'
    + '<link rel="icon" href="/favicon.ico" sizes="any"><link rel="icon" type="image/png" href="/brand/favicon-32.png"><link rel="apple-touch-icon" href="/brand/apple-touch-icon.png"><meta name="theme-color" content="#0b372f">\n'
    + applyPatches(legacyHtml) + '\n</html>\n';
}
