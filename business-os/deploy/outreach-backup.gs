/**
 * EasyFounder — Outreach CRM → Google Sheet backup (every hour, no clicks needed).
 *
 * What it does: copies ALL Outreach data (prospects, the full activity log, daily numbers) from
 * https://os.osmanhadi.live into one Google Sheet inside your Drive folder, and once a day saves a
 * dated copy in a "Daily copies" sub-folder (the last 30 are kept). The dashboard is never changed by this.
 *
 * Setup (once, ~3 minutes, in the Google account that owns the folder):
 *  1. Open https://script.google.com → open your existing "Business OS" project (the one that pushes the
 *     sales sheets) → "+" next to Files → Script → name it  outreach-backup  → paste this whole file → Save.
 *     (In that project BOS_API_KEY already exists, so there is nothing else to fill in.)
 *     No such project? New project → paste this file → put your key in OUTREACH_API_KEY below
 *     (EasyFounder → Admin → API keys → create a READ key).
 *  2. Choose the function  setupOutreachBackup  at the top → Run → allow the permissions.
 *     It makes the first backup now and then repeats every hour.
 * Check: View → Executions, or EasyFounder → Outreach → Settings → "Google Sheet backup".
 */
var OUTREACH_URL = 'https://os.osmanhadi.live/api/outreach/export?mark=1';
var OUTREACH_FOLDER_ID = '1Il6WKAGDrs2DMbwla2Kqc-msq0q_M1GJ'; // the Drive folder the backup lives in
var OUTREACH_FILE_NAME = 'EasyFounder Outreach Backup';
var OUTREACH_API_KEY = ''; // leave empty when BOS_API_KEY exists in this project
var OUTREACH_KEEP_COPIES = 30;

function setupOutreachBackup() {
  ScriptApp.getProjectTriggers().forEach(function (t) { if (t.getHandlerFunction() === 'outreachBackup') ScriptApp.deleteTrigger(t); });
  ScriptApp.newTrigger('outreachBackup').timeBased().everyHours(1).create();
  outreachBackup();
}

function outreachKey_() {
  if (OUTREACH_API_KEY) return OUTREACH_API_KEY;
  if (typeof BOS_API_KEY !== 'undefined' && String(BOS_API_KEY).indexOf('bos_') === 0) return BOS_API_KEY;
  throw new Error('No API key: put an EasyFounder API key in OUTREACH_API_KEY (Admin → API keys)');
}

/** The backup spreadsheet in the folder (created the first time). */
function outreachFile_() {
  var folder = DriveApp.getFolderById(OUTREACH_FOLDER_ID);
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('OUTREACH_SHEET_ID');
  if (id) { try { var f = DriveApp.getFileById(id); if (!f.isTrashed()) return SpreadsheetApp.openById(id); } catch (e) { /* deleted: make a new one */ } }
  var found = folder.getFilesByName(OUTREACH_FILE_NAME);
  var ss;
  if (found.hasNext()) ss = SpreadsheetApp.openById(found.next().getId());
  else { ss = SpreadsheetApp.create(OUTREACH_FILE_NAME); DriveApp.getFileById(ss.getId()).moveTo(folder); }
  props.setProperty('OUTREACH_SHEET_ID', ss.getId());
  return ss;
}

/** Replace one tab with a table. The new rows are written first and the old extra rows removed after, so a failure never leaves it empty. */
function outreachWrite_(ss, name, table) {
  var sh = ss.getSheetByName(name) || ss.insertSheet(name);
  var head = table.head, rows = table.rows, cols = head.length;
  var data = [head].concat(rows.map(function (r) { r = r.slice(0, cols); while (r.length < cols) r.push(''); return r.map(function (c) { return typeof c === 'string' && /^[=+\-@]/.test(c) ? "'" + c : c; }); }));
  if (sh.getMaxColumns() < cols) sh.insertColumnsAfter(sh.getMaxColumns(), cols - sh.getMaxColumns());
  if (sh.getMaxRows() < data.length) sh.insertRowsAfter(sh.getMaxRows(), data.length - sh.getMaxRows());
  sh.getRange(1, 1, data.length, cols).setValues(data);
  var lastRow = sh.getLastRow(), lastCol = sh.getLastColumn();
  if (lastRow > data.length) sh.getRange(data.length + 1, 1, lastRow - data.length, Math.max(lastCol, cols)).clearContent();
  if (lastCol > cols) sh.getRange(1, cols + 1, Math.max(lastRow, 1), lastCol - cols).clearContent();
  sh.setFrozenRows(1);
  sh.getRange(1, 1, 1, cols).setFontWeight('bold').setBackground('#0b372f').setFontColor('#ffffff');
}

function outreachBackup() {
  var r = UrlFetchApp.fetch(OUTREACH_URL, { headers: { Authorization: 'Bearer ' + outreachKey_() }, muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) throw new Error('EasyFounder answered ' + r.getResponseCode() + ': ' + r.getContentText().slice(0, 300));
  var d = JSON.parse(r.getContentText());
  var ss = outreachFile_();
  outreachWrite_(ss, 'Prospects', d.prospects);
  outreachWrite_(ss, 'Activity log', d.activities);
  outreachWrite_(ss, 'Daily numbers', d.daily);
  var now = new Date();
  outreachWrite_(ss, 'Backup info', { head: ['What', 'Value'], rows: [
    ['Last backup', Utilities.formatDate(now, 'Asia/Dhaka', 'yyyy-MM-dd HH:mm') + ' (Bangladesh time)'],
    ['Prospects', d.counts.prospects], ['Activity rows', d.counts.activities],
    ['Source', 'https://os.osmanhadi.live → Outreach'],
    ['Note', 'This file is overwritten every hour. Do not type here — edit in EasyFounder. Older versions: the "Daily copies" folder, or File → Version history.'],
  ] });
  var first = ss.getSheetByName('Sheet1'); if (first && ss.getSheets().length > 1 && first.getLastRow() === 0) ss.deleteSheet(first);
  outreachDailyCopy_(ss, now);
  Logger.log('Outreach backup: ' + d.counts.prospects + ' prospects, ' + d.counts.activities + ' activity rows → ' + ss.getUrl());
}

/** One dated copy per day in "Daily copies"; only the newest OUTREACH_KEEP_COPIES are kept. */
function outreachDailyCopy_(ss, now) {
  var day = Utilities.formatDate(now, 'Asia/Dhaka', 'yyyy-MM-dd');
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('OUTREACH_LAST_COPY') === day) return;
  var folder = DriveApp.getFolderById(OUTREACH_FOLDER_ID);
  var it = folder.getFoldersByName('Daily copies');
  var sub = it.hasNext() ? it.next() : folder.createFolder('Daily copies');
  DriveApp.getFileById(ss.getId()).makeCopy(OUTREACH_FILE_NAME + ' ' + day, sub);
  props.setProperty('OUTREACH_LAST_COPY', day);
  var files = [], f = sub.getFiles();
  while (f.hasNext()) { var x = f.next(); if (x.getName().indexOf(OUTREACH_FILE_NAME + ' ') === 0) files.push(x); }
  files.sort(function (a, b) { return a.getName() < b.getName() ? 1 : -1; });
  for (var i = OUTREACH_KEEP_COPIES; i < files.length; i++) files[i].setTrashed(true);
}
