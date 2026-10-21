// Small, explicit edits applied to legacy/business-os.html when it is served at /app.
// The spec file itself stays untouched. Each `find` must occur exactly once, or the page refuses to load
// (so a change to the legacy file can't silently drop a patch). Remove a patch once its tab is ported natively.
import { SALES_LIVE_JS } from './salesLive';
import { ORDER_SOURCE_JS } from './orderSource';

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
    replace: ORDER_SOURCE_JS + "function bizSales(id) { const __o = bizSalesBase(id); return id === 'kidscare' ? [orderSourceCard(id), ...__o] : __o; }\nfunction bizSalesBase(id) {",
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
    + '<style>.card div{min-width:0}.card .ctrls{flex-wrap:wrap}.card select,.card input{max-width:100%}</style>\n'
    + applyPatches(legacyHtml) + '\n</html>\n';
}
