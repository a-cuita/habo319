/**
 * Backend for HABO's litter page (S3-P20, the litter class's step 1): an Apps
 * Script web app bound to its own Google Sheet, which holds all of the data
 * so it can be read, audited and hand-edited directly, as the volunteer
 * check-in's does. The check-in's Sheet is only read, to match an account to
 * its volunteer record. Deployed with clasp (see README.md).
 *
 * The page on GitHub Pages POSTs JSON (sent as text/plain) and gets back
 * { success: true, data } or { success: false, error }. Opened on the web
 * app's own link (its dev link, while it's tried), the same page is served
 * here and calls api() through google.script.run.
 */

var SERVICE_NAME = 'HABO litter page';

// Tabs the backend keeps in the Sheet, created on first use. Columns are
// found by their place, listed in ACCOUNT_COL and DEVICE_COL (Accounts.js).
var TABS = {
  settings: {
    name: 'Settings',
    header: ['Setting', 'Value'],
    widths: [220, 640]
  },
  // One row per litter tracking account (Q257, Q262): set up once, on the
  // litter page, the first time someone opens it (Q263), with an email and
  // no phone (Oct 23, in chat). The waiver columns are the latest signing.
  accounts: {
    name: 'Accounts',
    header: ['Account ID', 'Created', 'First name', 'Last name', 'Email', 'Handle', 'Map shows', '18 or older',
      'Waiver signed', 'Waiver', 'Waiver fingerprint', 'Signed name', 'Signature', 'Check-in volunteer', 'Updated', 'Status'],
    widths: [90, 150, 130, 130, 220, 150, 100, 90, 150, 280, 130, 180, 280, 130, 150, 80],
    formats: { 2: 'yyyy-mm-dd h:mm', 6: '@', 9: 'yyyy-mm-dd h:mm', 15: 'yyyy-mm-dd h:mm' }
  },
  // Every time someone signs the waiver: setting up, and again each time its
  // words change (Oct 23, in chat), with whether their emailed copy went.
  signatures: {
    name: 'Waiver Signatures',
    header: ['Signed', 'Account ID', 'Name', 'Email', 'Waiver', 'Waiver fingerprint', 'Signed name', 'Signature', 'Copy emailed'],
    widths: [150, 90, 180, 220, 280, 130, 180, 280, 220],
    formats: { 1: 'yyyy-mm-dd h:mm' }
  },
  // One row per phone or browser an account is signed in on. Only a
  // fingerprint of each sign-in's secret is kept, never the secret itself.
  devices: {
    name: 'Devices',
    header: ['Device ID', 'Account ID', 'Secret fingerprint', 'Signed in', 'Last used', 'How', 'Signed out'],
    widths: [90, 90, 420, 150, 150, 160, 150],
    formats: { 4: 'yyyy-mm-dd h:mm', 5: 'yyyy-mm-dd h:mm', 7: 'yyyy-mm-dd h:mm' }
  },
  // Every account set up or changed, by whom, with what it was before.
  changes: {
    name: 'Changes',
    header: ['Time', 'Who', 'What', 'Item', 'Field', 'Before', 'After'],
    widths: [150, 200, 90, 200, 140, 260, 260],
    formats: { 1: 'yyyy-mm-dd h:mm:ss' }
  }
};

var SETTING_WAIVER_TITLE = 'Waiver title';
var SETTING_WAIVER_TEXT = 'Waiver text';
var SETTING_EMAILS_FROM = 'Emails from';
var SETTING_CHECKIN_SHEET = 'Check-in Sheet';
var SETTING_SIGNATURES_FOLDER = 'Signatures folder';
var SETTING_PUBLIC_URL = 'Public page URL';
var DEFAULT_PUBLIC_URL = 'https://a-cuita.github.io/habo319/litter/';
var DEFAULT_EMAILS_FROM = 'helpabrotherout.319@gmail.com';   // Q384 (a): codes and waiver copies
var DEFAULT_CHECKIN_SHEET = 'https://docs.google.com/spreadsheets/d/1aWB5Foa0fZ6qTAGdW8yU6SmKLHeiC7OabZv_zrKnNhY/edit';

// Actions the page can call, by name. Each handler gets the parsed request.
// Built on each request: the handlers live in files that load after this one.
function actions_() {
  return {
    health: health_,
    start: start_,
    handleFree: handleFree_,
    setUp: setUp_,
    signWaiver: signWaiver_,
    signInStart: signInStart_,
    signInCode: signInCode_,
    updateMe: updateMe_,
    signOut: signOut_
  };
}

// The web app's own link opens the litter page (how it's tried on the dev
// link); ?health=1 runs the health check, which also sets up the Sheet.
function doGet(e) {
  if (e && e.parameter && e.parameter.health) return respond_(health_);
  ensureSchema_();
  return HtmlService.createHtmlOutputFromFile('Page')
    .setTitle('HABO litter page')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ success: false, error: 'Request body must be JSON' });
  }
  return json_(dispatch_(req));
}

// The same actions for the page when it's served here, through
// google.script.run, which hands back a string.
function api(body) {
  var req;
  try {
    req = JSON.parse(String(body || ''));
  } catch (err) {
    return JSON.stringify({ success: false, error: 'Request body must be JSON' });
  }
  return JSON.stringify(dispatch_(req));
}

function dispatch_(req) {
  var action = req && req.action;
  var actions = actions_();
  if (!Object.prototype.hasOwnProperty.call(actions, action)) return { success: false, error: 'Unknown action: ' + action };
  try {
    return { success: true, data: actions[action](req) };
  } catch (err) {
    console.error(err);
    return { success: false, error: err.message || String(err), code: err.code || '' };
  }
}

function health_() {
  ensureSchema_(true);
  return { service: SERVICE_NAME, storage: 'connected', time: new Date().toISOString() };
}

/* ── Sheet ── */

// The Sheet this script is bound to.
function getDb_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Script is not bound to a spreadsheet');
  return ss;
}

// Brings the Sheet up to date: creates missing tabs and columns, adds
// missing settings (with defaults that can be changed by hand), and keeps
// the Sheet's time zone matched to the script's. Every entry point calls
// this first; a passing check is remembered for ten minutes.
function ensureSchema_(force) {
  settingsMemo_ = null;
  var cache = CacheService.getScriptCache();
  var cacheKey = 'schema-ok:' + schemaFingerprint_();
  if (!force && cache.get(cacheKey)) return;
  var ss = getDb_();
  var tabsMissing = Object.keys(TABS).some(function (k) { return !ss.getSheetByName(TABS[k].name); });
  var colsMissing = !tabsMissing && Object.keys(TABS).some(function (k) {
    return ss.getSheetByName(TABS[k].name).getLastColumn() < TABS[k].header.length;
  });
  var tzWrong = ss.getSpreadsheetTimeZone() !== Session.getScriptTimeZone();
  if (!tabsMissing && !colsMissing && !tzWrong && !missingSettings_(ss).length) {
    cache.put(cacheKey, '1', 600);
    return;
  }
  withLock_(function () {
    if (ss.getSpreadsheetTimeZone() !== Session.getScriptTimeZone()) ss.setSpreadsheetTimeZone(Session.getScriptTimeZone());
    Object.keys(TABS).forEach(function (k) { ensureTab_(ss, TABS[k]); });
    Object.keys(TABS).forEach(function (k) { ensureColumns_(ss, TABS[k]); });
    // A new bound Sheet starts with an empty "Sheet1".
    var first = ss.getSheetByName('Sheet1');
    if (first && ss.getSheets().length > 1 && first.getLastRow() === 0) ss.deleteSheet(first);
    var missing = missingSettings_(ss);
    if (missing.length) {
      var sheet = ss.getSheetByName(TABS.settings.name);
      var row = sheet.getLastRow() + 1;
      sheet.getRange(row, 2, missing.length, 1).setNumberFormat('@').setWrap(true);
      sheet.getRange(row, 1, missing.length, 2).setValues(missing);
    }
    settingsMemo_ = null;
  });
  cache.put(cacheKey, '1', 600);
}

// Changes whenever a tab's layout or the list of settings changes, so a new
// version of the code always re-checks the Sheet.
function schemaFingerprint_() {
  var layout = Object.keys(TABS).map(function (k) { return TABS[k].name + ':' + TABS[k].header.length; });
  return fingerprint_(layout.join('|') + '|' + missingSettings_(null).length);
}

// Settings rows that don't exist yet, as [name, default value]. With no
// spreadsheet, every setting.
function missingSettings_(ss) {
  var sheet = ss && ss.getSheetByName(TABS.settings.name);
  var have = sheet ? sheet.getDataRange().getDisplayValues().map(function (r) { return r[0].trim(); }) : [];
  return [
    [SETTING_WAIVER_TITLE, SEED_WAIVER_TITLE],
    [SETTING_WAIVER_TEXT, SEED_WAIVER_TEXT],
    [SETTING_EMAILS_FROM, DEFAULT_EMAILS_FROM],
    [SETTING_CHECKIN_SHEET, DEFAULT_CHECKIN_SHEET],
    [SETTING_SIGNATURES_FOLDER, ''],
    [SETTING_PUBLIC_URL, DEFAULT_PUBLIC_URL]
  ].filter(function (s) { return have.indexOf(s[0]) === -1; });
}

function ensureTab_(ss, tab) {
  if (ss.getSheetByName(tab.name)) return;
  var sheet = ss.insertSheet(tab.name);
  sheet.getRange(1, 1, 1, tab.header.length).setValues([tab.header]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  tab.widths.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  Object.keys(tab.formats || {}).forEach(function (col) {
    sheet.getRange(2, Number(col), sheet.getMaxRows() - 1, 1).setNumberFormat(tab.formats[col]);
  });
}

// Adds columns added to a tab's layout after the tab was made, at the end.
function ensureColumns_(ss, tab) {
  var sheet = ss.getSheetByName(tab.name);
  var have = sheet.getLastColumn();
  if (have >= tab.header.length) return;
  var extra = tab.header.slice(have);
  sheet.getRange(1, have + 1, 1, extra.length).setValues([extra]).setFontWeight('bold');
  for (var col = have + 1; col <= tab.header.length; col++) sheet.setColumnWidth(col, tab.widths[col - 1]);
}

// The Settings tab, read once per request (ensureSchema_ starts each request fresh).
var settingsMemo_ = null;

function getSetting_(name) {
  if (!settingsMemo_) settingsMemo_ = getDb_().getSheetByName(TABS.settings.name).getDataRange().getDisplayValues();
  for (var i = 1; i < settingsMemo_.length; i++) {
    if (settingsMemo_[i][0].trim() === name) return settingsMemo_[i][1];
  }
  return '';
}

function setSetting_(name, value) {
  var sheet = getDb_().getSheetByName(TABS.settings.name);
  var names = sheet.getDataRange().getDisplayValues().map(function (r) { return r[0].trim(); });
  var row = names.indexOf(name) + 1 || sheet.getLastRow() + 1;
  sheet.getRange(row, 1, 1, 2).setValues([[name, value]]);
  settingsMemo_ = null;
}

// The last row with something in column `col`.
function lastRowWith_(sheet, col) {
  var last = sheet.getLastRow();
  if (last < 2) return last;
  var vals = sheet.getRange(1, col, last, 1).getDisplayValues();
  for (var i = vals.length - 1; i >= 0; i--) if (String(vals[i][0]).trim()) return i + 1;
  return 1;
}

// The next id after the highest in `ids`, like A001, A002.
function nextId_(prefix, ids) {
  var n = ids.reduce(function (m, id) {
    var k = Number(String(id).slice(prefix.length));
    return String(id).indexOf(prefix) === 0 && k > m ? k : m;
  }, 0);
  return prefix + ('00' + (n + 1)).slice(-3);
}

function logChange_(who, what, item, field, before, after) {
  var sheet = getDb_().getSheetByName(TABS.changes.name);
  sheet.getRange(sheet.getLastRow() + 1, 1, 1, 7).setValues([[new Date(), safeCell_(who), what, safeCell_(item), field,
    safeCell_(String(before == null ? '' : before)), safeCell_(String(after == null ? '' : after))]]);
}

/* ── Helpers ── */

// Wrong codes lock out after 5 tries within 15 minutes, which makes guessing
// a 6-digit code impractical.
var MAX_CODE_FAILURES = 5;

function requireNotLocked_(scope) {
  var fails = Number(CacheService.getScriptCache().get('code-fails:' + scope) || 0);
  if (fails >= MAX_CODE_FAILURES) throw new Error('Too many wrong codes. Try again in 15 minutes.');
}

// Counts a wrong try against `scope`, then throws `message`.
function noteWrongCode_(scope, message) {
  var cache = CacheService.getScriptCache();
  var key = 'code-fails:' + scope;
  cache.put(key, String(Number(cache.get(key) || 0) + 1), 15 * 60);
  throw new Error(message);
}

// Runs fn while holding the script lock. Safe to nest.
var lockDepth_ = 0;
function withLock_(fn) {
  if (lockDepth_ > 0) return fn();
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  lockDepth_++;
  try {
    return fn();
  } finally {
    lockDepth_--;
    lock.releaseLock();
  }
}

function clean_(value, maxLength) {
  return String(value == null ? '' : value).trim().slice(0, maxLength);
}

// Keeps submitted text from being read as a formula when written to the Sheet.
function safeCell_(value) {
  return typeof value === 'string' && /^[=+\-@]/.test(value) ? "'" + value : value;
}

// A short fingerprint of a text, so a signature is tied to the exact words
// shown (the same as the check-in's).
function fingerprint_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.slice(0, 6).map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

// The whole SHA-256 of a text, as hex: how a sign-in's secret is kept.
function digestHex_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

// An error the page can tell apart, like a sign-in that's no longer good.
function coded_(code, message) {
  var e = new Error(message);
  e.code = code;
  return e;
}

function respond_(fn) {
  try {
    return json_({ success: true, data: fn() });
  } catch (err) {
    console.error(err);
    return json_({ success: false, error: err.message || String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
