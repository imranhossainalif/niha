/**
 * Business OS — Kids Care sales-team sheets → https://os.osmanhadi.live (every 30 minutes).
 *
 * Setup (once, in the Google account that owns the sheets):
 *  1. https://script.google.com → New project → paste this whole file.
 *  2. Put your Business OS API key (Admin → API keys, write) in BOS_API_KEY below.
 *  3. Choose function "setup" at the top → Run → allow the permissions.
 *     It sends the sheets once and then every 30 minutes.
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
  ScriptApp.newTrigger('push').timeBased().everyMinutes(30).create();
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
 *  1. Left menu "Services" (+) → add "Google Analytics Data API" AND "Google Analytics Admin API".
 *  2. Put the GA4 id below: the Measurement ID (G-…) or the numeric Property ID both work.
 *  3. Choose function "setupGA4" → Run → allow. It sends the last ~14 months once, then every hour the last 3 days.
 */
const GA4_PROPERTY = 'G-NEP6NGZB28';
const GA4_URL = 'https://os.osmanhadi.live/api/integrations/ga4';

function setupGA4() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'pushGA4') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('pushGA4').timeBased().everyHours(1).create();
  pushGA4(420);
}

/** Numeric property id: as given, or found from a Measurement ID (G-…) through the Analytics Admin API (cached). */
function ga4PropertyId_() {
  if (/^\d+$/.test(GA4_PROPERTY)) return GA4_PROPERTY;
  var props = PropertiesService.getScriptProperties();
  var cached = props.getProperty('GA4_ID_' + GA4_PROPERTY);
  if (cached) return cached;
  if (!/^G-/.test(GA4_PROPERTY)) throw new Error('GA4_PROPERTY must be the Measurement ID (G-…) or the numeric Property ID');
  var accounts = AnalyticsAdmin.AccountSummaries.list({ pageSize: 200 }).accountSummaries || [];
  for (var a = 0; a < accounts.length; a++) {
    var ps = accounts[a].propertySummaries || [];
    for (var p = 0; p < ps.length; p++) {
      var streams = AnalyticsAdmin.Properties.DataStreams.list(ps[p].property).dataStreams || [];
      for (var k = 0; k < streams.length; k++) {
        if (streams[k].webStreamData && streams[k].webStreamData.measurementId === GA4_PROPERTY) {
          var id = ps[p].property.split('/')[1];
          Logger.log('GA4 property for ' + GA4_PROPERTY + ': ' + id + ' (' + ps[p].displayName + ')');
          props.setProperty('GA4_ID_' + GA4_PROPERTY, id);
          return id;
        }
      }
    }
  }
  throw new Error('No GA4 property with ' + GA4_PROPERTY + ' is visible to this Google account. Give it Viewer access in GA4 → Admin → Property access management.');
}

function pushGA4(days) {
  var propertyId = ga4PropertyId_();
  days = typeof days === 'number' ? days : 3; // a time trigger passes an event object
  var report = AnalyticsData.Properties.runReport({
    dateRanges: [{ startDate: days + 'daysAgo', endDate: 'today' }],
    dimensions: [{ name: 'date' }, { name: 'sessionSource' }, { name: 'sessionMedium' }],
    metrics: [{ name: 'sessions' }, { name: 'totalUsers' }, { name: 'newUsers' }, { name: 'ecommercePurchases' }, { name: 'purchaseRevenue' }],
    limit: 100000,
  }, 'properties/' + propertyId);
  var rows = (report.rows || []).map(function (r) {
    var d = r.dimensionValues, m = r.metricValues;
    return { date: d[0].value, source: d[1].value, medium: d[2].value, sessions: +m[0].value, users: +m[1].value, newUsers: +m[2].value, purchases: +m[3].value, revenue: +m[4].value };
  });
  var r = UrlFetchApp.fetch(GA4_URL, { method: 'post', contentType: 'application/json', payload: JSON.stringify({ property: propertyId, rows: rows }), headers: { Authorization: 'Bearer ' + BOS_API_KEY }, muteHttpExceptions: true });
  Logger.log(r.getResponseCode() + ' ' + r.getContentText().slice(0, 300));
  if (r.getResponseCode() !== 200) throw new Error('Business OS answered ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 300));
}
