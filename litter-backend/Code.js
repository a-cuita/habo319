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
  // Collecting (S3-P21): one row per collection, one per stretch, and the
  // litter types (Collect.js). Hidden from the map (S3-P22, Q319): when, and
  // by whom, HABO's staff took a collection off the public map. Plan and XP
  // (Oct 24, in chat): the plan it started from, and the XP it earned.
  collections: {
    name: 'Collections',
    header: ['Collection ID', 'Account ID', 'Handle', 'Started', 'Start cell', 'Ended', 'End cell', 'Status', 'Stretches',
      'Pounds', 'Miles', 'Active minutes', 'Volunteer hours', 'Hours note', 'Last pressed', 'Updated', 'Key', 'Hidden from the map', 'Hidden by',
      'Plan', 'XP', 'Discard reason', 'GPX track', 'Check-ins', 'Recording started', 'Simulated'],
    widths: [100, 90, 140, 150, 130, 150, 130, 120, 80, 80, 80, 100, 110, 260, 150, 150, 120, 150, 220, 90, 60, 220, 200, 200, 150, 90],
    formats: { 4: 'yyyy-mm-dd h:mm', 5: '@', 6: 'yyyy-mm-dd h:mm', 7: '@', 15: 'yyyy-mm-dd h:mm', 16: 'yyyy-mm-dd h:mm', 17: '@', 18: 'yyyy-mm-dd h:mm', 20: '@', 23: '@', 24: '@', 25: 'yyyy-mm-dd h:mm:ss' }
  },
  // Turnarounds (Oct 24, in chat): where the stretch turned back, with no
  // weighing and no new stretch.
  stretches: {
    name: 'Stretches',
    header: ['Stretch ID', 'Collection ID', 'Account ID', 'Number', 'Started', 'Ended', 'Cells', 'Street miles', 'Off-street miles',
      'Active minutes', 'Paused minutes', 'Break minutes', 'Break where', 'Scale (lb)', 'New bag', 'Pounds', 'CPUE', 'Litter Index',
      'Litter types', 'Visual rating', 'Discarded', 'Past sunset', 'From track', 'Received', 'Key', 'Break question', 'Turnarounds',
      'Discard reason', 'Litter pulse cell'],
    widths: [90, 100, 90, 70, 150, 150, 300, 90, 100, 100, 100, 100, 120, 80, 70, 80, 80, 90, 300, 90, 80, 90, 80, 150, 120, 110, 200, 220, 120],
    formats: { 5: 'yyyy-mm-dd h:mm', 6: 'yyyy-mm-dd h:mm', 7: '@', 13: '@', 24: 'yyyy-mm-dd h:mm', 25: '@', 27: '@', 28: '@', 29: '@' }
  },
  // Plans (Oct 24, in chat): the stretches someone means to collect, made
  // before they start (Plan.js). Each stretch's cells and turnarounds are
  // split by " / ". Collection: the one it started, or Replaced.
  plans: {
    name: 'Plans',
    header: ['Plan ID', 'Account ID', 'Created', 'Stretches', 'Cells', 'Turnarounds', 'Miles', 'Collection', 'Updated'],
    widths: [90, 90, 150, 80, 420, 220, 80, 110, 150],
    formats: { 3: 'yyyy-mm-dd h:mm', 5: '@', 6: '@', 8: '@', 9: 'yyyy-mm-dd h:mm' }
  },
  // Accepted segments (S5-P3): a player's plan, proposed; HABO's staff accept
  // it by typing Yes under Accepted (Q527); Kind is Path or Field (Q533). Its
  // rates in the next tab, a simulated walk's marked Simulated (Q529).
  segments: {
    name: 'Segments',
    header: ['Segment ID', 'Name', 'Proposed by', 'Proposed', 'Plan', 'Squares', 'Miles', 'Accepted', 'Note', 'Kind'],
    widths: [90, 220, 90, 150, 80, 420, 70, 80, 260, 70],
    formats: { 4: 'yyyy-mm-dd h:mm', 5: '@', 6: '@', 8: '@' }
  },
  rates: {
    name: 'Segment rates',
    header: ['Segment ID', 'Collection ID', 'Collected', 'Pounds', 'Miles', 'Days', 'Rate (lb per mile per day)', 'Squares covered (%)', 'Simulated'],
    widths: [90, 100, 150, 70, 70, 60, 170, 130, 90],
    formats: { 3: 'yyyy-mm-dd h:mm' }
  },
  // The published work our decisions lean on (S5-P3, Q520), kept so it can
  // be shown later as info.
  sources: {
    name: 'Sources',
    header: ['Source', 'Link', 'Used for', 'Our reasoning', 'Date', 'Card'],
    widths: [320, 260, 260, 360, 100, 80]
  },
  types: {
    name: 'Litter Types',
    header: ['Litter type', 'Added by', 'Status', 'Added'],
    widths: [260, 90, 160, 150],
    formats: { 4: 'yyyy-mm-dd h:mm' }
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
    signOut: signOut_,
    collectStart: collectStart_,
    collectStretch: collectStretch_,
    collectEnd: collectEnd_,
    collectFix: collectFix_,
    collectTrack: collectTrack_,
    collectCheckins: collectCheckins_,
    collectLoad: collectLoad_,
    collectDiscard: collectDiscard_,
    planSave: planSave_,
    segmentPropose: segmentPropose_,
    addLitterType: addLitterType_,
    mapLoad: mapLoad_,
    myCollections: myCollections_
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
  // The once-only changes, until each is marked done.
  var props = PropertiesService.getScriptProperties();
  var onceLeft = !props.getProperty('READINGS_REWORKED') || !props.getProperty('GRID_HALVED') || !props.getProperty('GRID_10M') || !props.getProperty('GRID_10M_TRACK');
  if (!tabsMissing && !colsMissing && !tzWrong && !onceLeft && !missingSettings_(ss).length) {
    cache.put(cacheKey, '1', 600);
    return;
  }
  withLock_(function () {
    if (ss.getSpreadsheetTimeZone() !== Session.getScriptTimeZone()) ss.setSpreadsheetTimeZone(Session.getScriptTimeZone());
    Object.keys(TABS).forEach(function (k) { ensureTab_(ss, TABS[k]); });
    Object.keys(TABS).forEach(function (k) { ensureColumns_(ss, TABS[k]); });
    // MoCiSN's 15 litter types, the first time (Q346).
    var types = ss.getSheetByName(TABS.types.name);
    if (types.getLastRow() < 2) {
      types.getRange(2, 1, SEED_LITTER_TYPES.length, 4).setValues(SEED_LITTER_TYPES.map(function (t) { return [t, '', TYPE_SHARED, '']; }));
    }
    // The sources so far, the first time (S5-P3, Q520).
    var src = ss.getSheetByName(TABS.sources.name);
    if (src.getLastRow() < 2) src.getRange(2, 1, SEED_SOURCES.length, 6).setValues(SEED_SOURCES);
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
    rereadOnce_(ss);
    regridOnce_(ss, 'GRID_HALVED', 2, LitterGeo.MILE_M / 20);
    // 10 m squares (S5-P1, Q516): each square kept so far becomes its 64.
    regridOnce_(ss, 'GRID_10M', 8, LitterGeo.MILE_M / 160);
    trackOnlyOnce_(ss);
  });
  cache.put(cacheKey, '1', 600);
}

// Once (S3-P27, Q421): every stretch's reading worked out again with the
// Litter Index's new math, so the map uses one math.
function rereadOnce_(ss) {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('READINGS_REWORKED')) return;
  var sheet = ss.getSheetByName(TABS.stretches.name);
  var last = sheet.getLastRow();
  if (last >= 2) {
    var rows = sheet.getRange(2, 1, last - 1, TABS.stretches.header.length).getValues();
    var out = rows.map(function (v) {
      var lbs = v[STRETCH_COL.pounds - 1];
      if (!String(v[0]).trim() || v[STRETCH_COL.discarded - 1] === 'Yes' || lbs === '' || lbs == null) return [v[STRETCH_COL.cpue - 1], v[STRETCH_COL.index - 1]];
      var rd = LitterGeo.reading(Number(lbs), ((Number(v[STRETCH_COL.streetMi - 1]) || 0) + (Number(v[STRETCH_COL.offMi - 1]) || 0)) * LitterGeo.MILE_M, Number(v[STRETCH_COL.activeMin - 1]) || 0);
      return [rd.cpue == null ? '' : round_(rd.cpue, 3), rd.index == null ? '' : round_(rd.index, 3)];
    });
    sheet.getRange(2, STRETCH_COL.cpue, out.length, 2).setValues(out);
  }
  props.setProperty('READINGS_REWORKED', new Date().toISOString());
}

// Once (S5, Oct 29): the cells halved, from a tenth of a mile to a
// twentieth. Every cell kept so far becomes the four that make it up, where
// it's a plan's cells or a weighing's (only those its walk's saved GPX track
// passed through, when it has one); where it's one place (a start, an end,
// a turnaround, a litter pulse, a break), the first of the four. Readings
// stay as they were.
// The same again for 10 m squares (S5-P1, Q516): each square becomes its
// 8 x 8, by the same rules; a place becomes the one in its middle.
// `factor` is how many new squares fit along an old one's side, and `cellM`
// the new squares' size, in meters.
function regridOnce_(ss, prop, factor, cellM) {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(prop)) return;
  var isCell = function (x) { return /^-?\d+_-?\d+$/.test(x); };
  var rc = function (x) { var m = /^(-?\d+)_(-?\d+)$/.exec(x); return [Number(m[1]) * factor, Number(m[2]) * factor]; };
  var four = function (x) {
    var p = rc(x), out = [];
    for (var i = 0; i < factor; i++) for (var j = 0; j < factor; j++) out.push((p[0] + i) + '_' + (p[1] + j));
    return out;
  };
  var mid = factor > 2 ? factor / 2 : 0;
  var one = function (x) { var p = rc(x); return (p[0] + mid) + '_' + (p[1] + mid); };
  var at = function (q) { var p = LitterGeo.xy(q[0], q[1]); return Math.floor(p.y / cellM) + '_' + Math.floor(p.x / cellM); };
  // Where each collection's saved GPX track went, in the new cells (Jeremy,
  // Oct 29): a weighing's old cell becomes only the new cells in it that its
  // walk's track passed through, or all four when the track passed none.
  var walked = {};
  var cs = ss.getSheetByName(TABS.collections.name), cLast = cs.getLastRow();
  if (cLast >= 2) cs.getRange(2, 1, cLast - 1, COLLECTION_COL.track).getValues().forEach(function (r) {
    var pts = parseTrack_(r[COLLECTION_COL.track - 1]);
    if (pts.length < 2) return;
    var seen = {};
    // Every point, and points every quarter square between them.
    pts.forEach(function (q, k) {
      seen[at(q)] = true;
      if (!k) return;
      var a = pts[k - 1], n = Math.ceil(LitterGeo.dist(LitterGeo.xy(a[0], a[1]), LitterGeo.xy(q[0], q[1])) / (cellM / 4));
      for (var t = 1; t < n; t++) seen[at([a[0] + (q[0] - a[0]) * t / n, a[1] + (q[1] - a[1]) * t / n])] = true;
    });
    walked[r[0]] = seen;
  });
  var some = function (x, seen) {
    var all = four(x), hit = seen ? all.filter(function (y) { return seen[y]; }) : [];
    return hit.length ? hit : all;
  };
  // A list of cells, kept apart by spaces, and by " / " between a plan's stretches.
  var area = function (v, seen) {
    return String(v || '').split(/(\s*\/\s*)/).map(function (part) {
      if (/\//.test(part)) return part;
      return part.split(/\s+/).filter(String).map(function (x) { return isCell(x) ? some(x, seen).join(' ') : x; }).join(' ');
    }).join('');
  };
  var points = function (v) {
    return String(v || '').split(/(\s*\/\s*)/).map(function (part) {
      if (/\//.test(part)) return part;
      return part.split(/\s+/).filter(String).map(function (x) { return isCell(x) ? one(x) : x; }).join(' ');
    }).join('');
  };
  var redo = function (tab, cols) {
    var sheet = ss.getSheetByName(tab.name);
    var last = sheet.getLastRow();
    if (last < 2) return;
    Object.keys(cols).forEach(function (col) {
      var range = sheet.getRange(2, Number(col), last - 1, 1);
      range.setValues(range.getValues().map(function (r) { return [String(r[0]).trim() ? cols[col](r[0]) : r[0]]; }));
    });
  };
  // A weighing's cells, by its collection's track.
  var sh = ss.getSheetByName(TABS.stretches.name), sLast = sh.getLastRow();
  if (sLast >= 2) {
    var of = sh.getRange(2, STRETCH_COL.collection, sLast - 1, 1).getValues();
    var cellsRange = sh.getRange(2, STRETCH_COL.cells, sLast - 1, 1);
    cellsRange.setValues(cellsRange.getValues().map(function (r, k) { return [String(r[0]).trim() ? area(r[0], walked[of[k][0]]) : r[0]]; }));
  }
  var sc = {}, cc = {}, pc = {};
  sc[STRETCH_COL.turns] = points; sc[STRETCH_COL.pulseCell] = points; sc[STRETCH_COL.breakWhere] = points;
  cc[COLLECTION_COL.startCell] = points; cc[COLLECTION_COL.endCell] = points;
  pc[PLAN_COL.cells] = area; pc[PLAN_COL.turns] = points;
  redo(TABS.stretches, sc);
  redo(TABS.collections, cc);
  redo(TABS.plans, pc);
  props.setProperty(prop, new Date().toISOString());
}

var SEED_SOURCES = [
  ['Hoyle, S.D., and others (2024). Catch per unit effort modelling for stock assessment: a summary of good practices. Fisheries Research.', '',
    'What catch per unit effort is, and how it is standardized', 'The Litter Index is a catch per unit effort; good practice is one measure of effort, which is why using both miles and hours was questioned.', '2026-10-30', 'S5-P3'],
  ['Marine Conservation Society (UK). Beachwatch beach litter surveys.', '',
    'Volunteers record effort (people, time, distance) with their counts', 'Volunteer litter counts are corrected for effort, as the Litter Index does.', '2026-10-30', 'S5-P3'],
  ['Cowger, W., and others (2022). Litter origins, accumulation rates, and hierarchical composition on urban roadsides of the Inland Empire, California. Environmental Research Letters 17(1).', '',
    'Accumulation rate from cleaning the same roadside stretches again and again', 'The accumulation rate (pounds per mile per day on a stretch cleaned again) is measured the same way.', '2026-10-30', 'S5-P3'],
  ['Virginia Transportation Research Council. Roadside litter surveys at fixed sites.', '',
    'Repeated pickups at fixed sites; the first repeat carries what the first cleanup missed', 'Why the first repeat runs high, and why the median of recent rates is shown.', '2026-10-30', 'S5-P3'],
  ['NOAA Marine Debris Program (2021). Marine Debris Monitoring and Assessment Project Shoreline Survey Guide (NOAA Technical Memorandum NOS OR&R 56).', 'https://marinedebris.noaa.gov/protocol/noaa-marine-debris-monitoring-and-assessment-project-shoreline-survey-guide',
    'Accumulation surveys clear the same shoreline site (100 m or longer) each visit and count per area', 'Fields: what is searched is counted as an area, the squares the track passes through.', '2026-10-30', 'S5-P3'],
  ['Buckland, S.T., and others (2001). Introduction to Distance Sampling. Oxford University Press.', 'https://academic.oup.com/book/53746',
    'Strip transects: everything within a set distance either side of a walked line', 'A walker\'s range of attention; with 10 m squares, the squares along the track are the strip searched.', '2026-10-30', 'S5-P1, S5-P3']
];

// A walk with a saved GPX track keeps only the squares its track passed
// through (S5-P1, C602, Jeremy's agree, Oct 30): an old square the track
// never touched had become all 64 small ones. A weighing the track missed
// entirely keeps its squares as they are. Once.
function trackOnlyOnce_(ss) {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('GRID_10M_TRACK')) return;
  var walked = {};
  var cs = ss.getSheetByName(TABS.collections.name), cLast = cs.getLastRow();
  if (cLast >= 2) cs.getRange(2, 1, cLast - 1, COLLECTION_COL.track).getValues().forEach(function (r) {
    var pts = parseTrack_(r[COLLECTION_COL.track - 1]);
    if (pts.length < 2) return;
    var seen = {};
    pts.forEach(function (q, k) {
      seen[LitterGeo.cellAt(q[0], q[1])] = true;
      if (!k) return;
      var a = pts[k - 1], n = Math.ceil(LitterGeo.dist(LitterGeo.xy(a[0], a[1]), LitterGeo.xy(q[0], q[1])) / (LitterGeo.CELL_M / 4));
      for (var t = 1; t < n; t++) seen[LitterGeo.cellAt(a[0] + (q[0] - a[0]) * t / n, a[1] + (q[1] - a[1]) * t / n)] = true;
    });
    walked[r[0]] = seen;
  });
  var sh = ss.getSheetByName(TABS.stretches.name), sLast = sh.getLastRow();
  if (sLast >= 2) {
    var of = sh.getRange(2, STRETCH_COL.collection, sLast - 1, 1).getValues();
    var range = sh.getRange(2, STRETCH_COL.cells, sLast - 1, 1);
    range.setValues(range.getValues().map(function (r, k) {
      var seen = walked[of[k][0]];
      if (!seen || !String(r[0]).trim()) return [r[0]];
      var all = String(r[0]).split(/\s+/).filter(String), hit = all.filter(function (x) { return seen[x]; });
      return [hit.length ? hit.join(' ') : r[0]];
    }));
  }
  props.setProperty('GRID_10M_TRACK', new Date().toISOString());
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
    [SETTING_PUBLIC_URL, DEFAULT_PUBLIC_URL],
    [SETTING_SUNSET_WARN, '60'],
    [SETTING_NO_START, '15'],
    [SETTING_AUTO_END, '12'],
    [SETTING_EDIT_HOURS, '48'],
    [SETTING_COLOUR_0, MOCISN_COLOURS[0]],
    [SETTING_COLOUR_5, MOCISN_COLOURS[1]],
    [SETTING_COLOUR_10, MOCISN_COLOURS[2]],
    [SETTING_PAUSED_COLOUR, DEFAULT_PAUSED_COLOUR],
    [SETTING_BREAK_AFTER, '10'],
    [SETTING_PLAN_XP, '1'],
    [SETTING_RATING_XP_1, '3'],
    [SETTING_RATING_XP_2, '2'],
    [SETTING_RATING_XP_3, '1'],
    [SETTING_RATING_BONUS, '5'],
    [SETTING_TYPES_XP, '1'],
    [SETTING_START_SAYINGS, '']
  ].concat(DARK_SETTINGS.map(function (d) { return [d[1], d[2]]; }), SEGMENT_SETTINGS).filter(function (s) { return have.indexOf(s[0]) === -1; });
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
    // What was written reaches the Sheet before the next one in line reads
    // it, so two loads at once can't both add the same missing rows (Oct 24,
    // |C514: the five XP settings were added twice).
    try { SpreadsheetApp.flush(); } finally { lock.releaseLock(); }
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
