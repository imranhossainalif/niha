/**
 * Business OS — Kids Care sales-team sheets → https://os.osmanhadi.live (every 10 minutes).
 *
 * Setup (once, in the Google account that owns the sheets):
 *  1. https://script.google.com → New project → paste this whole file.
 *  2. Put your Business OS API key (Admin → API keys, write) in BOS_API_KEY below.
 *  3. Choose function "setup" at the top → Run → allow the permissions.
 *     It sends the sheets once and then every 10 minutes.
 * Check: View → Executions, or Business OS Admin → Background jobs ("sheets_push").
 */
const BOS_URL = 'https://os.osmanhadi.live/api/integrations/sheets';
const BOS_API_KEY = 'PASTE_YOUR_bos_KEY_HERE';

const SHEETS = {
  call_live: '1LZLQ_3OIGc26htXEwdqIzhfTgHrAGkLivT0JPs2AAuI', // KCB_Call_System_v7 (tab Live_Dashboard, sent as CSV)
  upsales: '1aA7pCk1943DqlH_1x-ztmiYd2jeEgk5Q4mLIxUZChLY',   // KCB_Up_Sales_Tracker_v4.2
  daily: '13y_PetO_1XeY65yI36oAQ3hFjUBrDm86ggdAzi3Ugcw',     // KidsCareBD_Daily_Report_1
  v6: '1zSklLteenQWQWFsLtYu3bjNMcirQuphKt4TzqcfwI4U',        // 1.KCB_Call_System_v6_FINAL (old, reps still log there)
  ups_old: '1bga0S0MJTVk8IrBLa4Vn1Pwiq8lYexQHM0DW3g9FZgM',   // 2.KCB_Up_sales_Tracker (old)
};
const LIVE_TAB = 'Live_Dashboard';

function setup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'push') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('push').timeBased().everyMinutes(10).create();
  push();
}

function exportBlob_(id, format, gid, name) {
  var url = 'https://docs.google.com/spreadsheets/d/' + id + '/export?format=' + format + (gid != null ? '&gid=' + gid : '');
  var r = UrlFetchApp.fetch(url, { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('Export failed for ' + name + ' (' + r.getResponseCode() + ')');
  return r.getBlob().setName(name);
}

function push() {
  if (BOS_API_KEY.indexOf('bos_') !== 0) throw new Error('Put the Business OS API key in BOS_API_KEY first');
  DriveApp.getFileById(SHEETS.call_live); // makes Google ask for Drive read access (needed for the exports)
  var ss = SpreadsheetApp.openById(SHEETS.call_live);
  var tab = ss.getSheetByName(LIVE_TAB);
  if (!tab) throw new Error('Tab "' + LIVE_TAB + '" not found. Tabs: ' + ss.getSheets().map(function (s) { return s.getName(); }).join(', '));
  var payload = {
    call_live: exportBlob_(SHEETS.call_live, 'csv', tab.getSheetId(), 'call_live.csv'),
    upsales: exportBlob_(SHEETS.upsales, 'xlsx', null, 'upsales.xlsx'),
    daily: exportBlob_(SHEETS.daily, 'xlsx', null, 'daily.xlsx'),
  };
  if (SHEETS.v6 && SHEETS.ups_old) {
    payload.v6 = exportBlob_(SHEETS.v6, 'xlsx', null, 'v6.xlsx');
    payload.ups_old = exportBlob_(SHEETS.ups_old, 'xlsx', null, 'ups_old.xlsx');
  }
  var r = UrlFetchApp.fetch(BOS_URL, { method: 'post', payload: payload, headers: { Authorization: 'Bearer ' + BOS_API_KEY }, muteHttpExceptions: true });
  Logger.log(r.getResponseCode() + ' ' + r.getContentText().slice(0, 500));
  if (r.getResponseCode() !== 200) throw new Error('Business OS answered ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 300));
}

/* ---------------- Google Analytics 4 → Business OS (website traffic) ----------------
 * Setup (once):
 *  1. Left menu "Services" (+) → add "Google Analytics Data API" (AnalyticsData) AND "Google Analytics Admin API" (AnalyticsAdmin).
 *  2. GA4_SITES: each business's own website Measurement ID (G-…) or numeric Property ID. Find it in GA4 →
 *     Admin → Data streams → click the website → "Measurement ID". Leave '' for a business without GA4.
 *     Kids Care's ID goes ONLY in kidscare, Local Revenue Flow's ONLY in lrf — otherwise the dashboards mix.
 *  3. Choose function "setupGA4" → Run → allow. It sends history once (~14 months totals, 3 months of pages),
 *     then every 15 minutes: visitors right now + today and yesterday.
 *  The log shows which GA4 property each business got ("kidscare → 1234 (Kids Care BD)") — check it once.
 */
const GA4_SITES = {
  kidscare: '',               // Kids Care BD website (kidscarebd…) — G-XXXXXXXXXX
  lrf: 'G-NEP6NGZB28',        // Local Revenue Flow website
};
const GA4_URL = 'https://os.osmanhadi.live/api/integrations/ga4';

function setupGA4() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'pushGA4') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('pushGA4').timeBased().everyMinutes(15).create();
  pushGA4({ totalsDays: 420, detailDays: 90 });
}

/** {id, name} of the GA4 property: as given (numeric), or found from a Measurement ID (G-…) through the Analytics Admin API (cached). */
function ga4Property_(mid) {
  var props = PropertiesService.getScriptProperties();
  var cached = props.getProperty('GA4P_' + mid);
  if (cached) return JSON.parse(cached);
  var want = /^\d+$/.test(mid) ? 'properties/' + mid : null;
  if (!want && !/^G-/.test(mid)) throw new Error('GA4_SITES value must be a Measurement ID (G-…) or a numeric Property ID: ' + mid);
  var accounts = AnalyticsAdmin.AccountSummaries.list({ pageSize: 200 }).accountSummaries || [];
  for (var a = 0; a < accounts.length; a++) {
    var ps = accounts[a].propertySummaries || [];
    for (var p = 0; p < ps.length; p++) {
      var hit = want ? ps[p].property === want : (AnalyticsAdmin.Properties.DataStreams.list(ps[p].property).dataStreams || [])
        .some(function (s) { return s.webStreamData && s.webStreamData.measurementId === mid; });
      if (hit) {
        var out = { id: ps[p].property.split('/')[1], name: ps[p].displayName || '' };
        props.setProperty('GA4P_' + mid, JSON.stringify(out));
        return out;
      }
    }
  }
  throw new Error('No GA4 property for ' + mid + ' is visible to this Google account. Give it Viewer access in GA4 → Admin → Property access management.');
}

/** One GA4 report as plain objects: {dim1: value, …, met1: number, …}. */
function ga4Report_(pid, days, dims, mets, extra) {
  var req = { dateRanges: [{ startDate: days + 'daysAgo', endDate: 'today' }], dimensions: dims.map(function (d) { return { name: d }; }), metrics: mets.map(function (m) { return { name: m }; }), limit: 100000 };
  for (var k in (extra || {})) req[k] = extra[k];
  var res = AnalyticsData.Properties.runReport(req, 'properties/' + pid);
  return (res.rows || []).map(function (r) {
    var o = {};
    dims.forEach(function (d, i) { o[d] = r.dimensionValues[i].value; });
    mets.forEach(function (m, i) { o[m] = +r.metricValues[i].value; });
    return o;
  });
}

function pushGA4(opts) {
  opts = opts && opts.totalsDays ? opts : { totalsDays: 2, detailDays: 2 }; // a time trigger passes an event object
  var errors = [];
  Object.keys(GA4_SITES).forEach(function (biz) {
    if (!GA4_SITES[biz]) return;
    try { pushGA4Site_(biz, GA4_SITES[biz], opts); } catch (e) { errors.push(biz + ': ' + e); Logger.log(biz + ' failed: ' + e); }
  });
  if (errors.length) throw new Error(errors.join(' | '));
}

function pushGA4Site_(biz, mid, opts) {
  var prop = ga4Property_(mid), pid = prop.id;
  Logger.log(biz + ' → GA4 property ' + pid + ' (' + prop.name + ')');
  var T = opts.totalsDays, D = opts.detailDays;
  var payload = { property: pid, business: biz, propertyName: prop.name };
  payload.rows = ga4Report_(pid, T, ['date', 'sessionSource', 'sessionMedium'], ['sessions', 'totalUsers', 'newUsers', 'ecommercePurchases', 'purchaseRevenue'])
    .map(function (r) { return { date: r.date, source: r.sessionSource, medium: r.sessionMedium, sessions: r.sessions, users: r.totalUsers, newUsers: r.newUsers, purchases: r.ecommercePurchases, revenue: r.purchaseRevenue }; });
  payload.days = ga4Report_(pid, T, ['date'], ['sessions', 'totalUsers', 'newUsers', 'engagedSessions', 'screenPageViews', 'userEngagementDuration', 'addToCarts', 'checkouts', 'ecommercePurchases', 'purchaseRevenue'])
    .map(function (r) { return { date: r.date, sessions: r.sessions, users: r.totalUsers, newUsers: r.newUsers, engagedSessions: r.engagedSessions, views: r.screenPageViews, engagementSec: r.userEngagementDuration, addToCarts: r.addToCarts, checkouts: r.checkouts, purchases: r.ecommercePurchases, revenue: r.purchaseRevenue }; });
  payload.pages = ga4Report_(pid, D, ['date', 'pagePath', 'pageTitle'], ['screenPageViews', 'totalUsers', 'userEngagementDuration'])
    .map(function (r) { return { date: r.date, page: r.pagePath.slice(0, 500), title: (r.pageTitle || '').slice(0, 300), views: r.screenPageViews, users: r.totalUsers, engagementSec: r.userEngagementDuration }; });
  payload.landing = ga4Report_(pid, D, ['date', 'landingPage'], ['sessions', 'engagedSessions'])
    .map(function (r) { return { date: r.date, page: r.landingPage.slice(0, 500), sessions: r.sessions, engagedSessions: r.engagedSessions }; });
  payload.devices = ga4Report_(pid, D, ['date', 'deviceCategory'], ['sessions']).map(function (r) { return { date: r.date, key: r.deviceCategory, sessions: r.sessions }; });
  payload.cities = ga4Report_(pid, D, ['date', 'city'], ['sessions']).map(function (r) { return { date: r.date, key: r.city, sessions: r.sessions }; });
  // visitors on the site right now (last 30 minutes)
  try {
    var rt = function (dim) { var res = AnalyticsData.Properties.runRealtimeReport({ dimensions: [{ name: dim }], metrics: [{ name: 'activeUsers' }], limit: 20 }, 'properties/' + pid); return (res.rows || []).map(function (r) { return [r.dimensionValues[0].value, +r.metricValues[0].value]; }); };
    var tot = AnalyticsData.Properties.runRealtimeReport({ metrics: [{ name: 'activeUsers' }] }, 'properties/' + pid);
    payload.realtime = {
      activeUsers: tot.rows && tot.rows[0] ? +tot.rows[0].metricValues[0].value : 0,
      pages: rt('unifiedScreenName').map(function (x) { return { page: x[0], users: x[1] }; }),
      sources: rt('platform').map(function (x) { return { source: x[0], users: x[1] }; }),
      devices: rt('deviceCategory').map(function (x) { return { device: x[0], users: x[1] }; }),
    };
  } catch (e) { Logger.log('realtime skipped: ' + e); }
  var r = UrlFetchApp.fetch(GA4_URL, { method: 'post', contentType: 'application/json', payload: JSON.stringify(payload), headers: { Authorization: 'Bearer ' + BOS_API_KEY }, muteHttpExceptions: true });
  Logger.log(biz + ' ' + r.getResponseCode() + ' ' + r.getContentText().slice(0, 300));
  if (r.getResponseCode() !== 200) throw new Error('Business OS answered ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 300));
}
