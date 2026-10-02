/**
 * Backend for the volunteer check-in site: an Apps Script web app bound to
 * the program's Google Sheet, which holds all of the data so it can be read,
 * audited, and hand-edited directly. Deployed with clasp (see README.md).
 *
 * The site POSTs JSON (sent as text/plain) and gets back either
 * { success: true, data } or { success: false, error }.
 */

var SERVICE_NAME = 'Volunteer Check-in';

// Tabs the backend keeps in the Sheet, created on first use. Everything in
// them is meant to be read and edited by hand.
var TABS = {
  settings: {
    name: 'Settings',
    header: ['Setting', 'Value'],
    widths: [200, 520]
  },
  questions: {
    name: 'Preview Questions',
    header: ['Question', 'Answer choices (separate with |, or leave blank for a written answer)'],
    widths: [380, 620]
  },
  responses: {
    name: 'Preview Responses',
    header: ['Submitted', 'Submission', 'Name', 'Question', 'Answer', 'Note'],
    widths: [150, 90, 140, 380, 300, 380]
  },
  // Hours is a live formula over Start and End, so fixing an event's times by
  // hand updates its hours. Columns are listed in EVENT_COL (Admin.js).
  events: {
    name: 'Events',
    header: ['Event ID', 'Name', 'Date', 'Start', 'End',
      '={"Hours"; ARRAYFORMULA(IF((D2:D="")+(E2:E=""), "", ROUND((E2:E-D2:D)*24, 2)))}',
      'Location', 'Check-in code', 'Created', 'Updated', 'Description', 'Host', 'Co-hosts'],
    widths: [80, 260, 150, 90, 90, 60, 240, 110, 150, 150, 400, 200, 300],
    formats: { 3: 'ddd, mmm d, yyyy', 4: 'h:mm am/pm', 5: 'h:mm am/pm', 6: '0.00', 8: '@',
      9: 'yyyy-mm-dd h:mm', 10: 'yyyy-mm-dd h:mm' }
  },
  // Hosts on the Events tab refer to people as "Name (P001)". Columns are
  // listed in PERSON_COL (People.js).
  people: {
    name: 'People',
    header: ['Person ID', 'Name', 'Title', 'Bio', 'Email', 'Phone', 'Photo', 'Show publicly', 'Active',
      'Created', 'Updated'],
    widths: [80, 180, 180, 360, 200, 130, 280, 100, 70, 150, 150],
    formats: { 10: 'yyyy-mm-dd h:mm', 11: 'yyyy-mm-dd h:mm' }
  }
};

var SETTING_PREVIEW_CODE = 'Preview access code';
var SETTING_PREVIEW_INTRO = 'Preview intro';
var SETTING_PUBLIC_URL = 'Public site URL';
var DEFAULT_PUBLIC_URL = 'https://a-cuita.github.io/habo319/';

var SEED_PREVIEW_INTRO =
  "We're rebuilding the HABO 319 volunteer site. Volunteers will check in at events, and their hours " +
  'count as in-kind match for the grant. A few quick decisions: tap an answer, and add a note if you like.';

var SEED_QUESTIONS = [
  ["How should we count a volunteer's hours?",
    'Full event time for everyone who checks in (staff fix exceptions) | ' +
    'From when they check in until the event ends | ' +
    "Let's talk"],
  ['How should people check in at an event? (An iPad on a stand at the table.)',
    'Big QR code to scan, plus a sign-in form for people without phones | ' +
    'QR code only | Sign-in form only | ' +
    "Let's talk"],
  ['How do we recognize returning volunteers?',
    'Email | Phone number | Either one | Both'],
  ['Waivers, photo release, and safety acknowledgment can differ by event. When do volunteers sign?',
    'At every event | ' +
    'Once, and again only when an event needs something different | ' +
    "Let's talk"],
  ['Should staff have a hidden menu, behind an access code, to see a live head count at events?',
    "Yes | Not needed | Let's talk"],
  ['Anything else we should know or include?', '']
];

// Actions the site can call, by name. Each handler gets the parsed request.
var ACTIONS = {
  health: health_,
  previewUnlock: previewUnlock_,
  previewSubmit: previewSubmit_
};

// Opening the web app URL in a browser runs the health check, which confirms
// the deployment is live and sets up the Sheet's tabs if they're missing.
function doGet() {
  return respond_(health_);
}

function doPost(e) {
  var req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return json_({ success: false, error: 'Request body must be JSON' });
  }
  var action = req && req.action;
  if (!Object.prototype.hasOwnProperty.call(ACTIONS, action)) {
    return json_({ success: false, error: 'Unknown action: ' + action });
  }
  return respond_(function () { return ACTIONS[action](req); });
}

function health_() {
  ensureSchema_();
  return { service: SERVICE_NAME, storage: 'connected', time: new Date().toISOString() };
}

/* ── Preview: questions for reviewers, behind an access code ── */

function previewUnlock_(req) {
  ensureSchema_();
  requirePreviewCode_(req.code);
  return { intro: getSetting_(SETTING_PREVIEW_INTRO), questions: getPreviewQuestions_() };
}

// Saves one row per answered question. The question text is stored as the
// reviewer saw it, so later edits to the questions tab don't blur the record.
function previewSubmit_(req) {
  ensureSchema_();
  requirePreviewCode_(req.code);
  var name = clean_(req.name, 100);
  if (!name) throw new Error('Please enter your name');
  var answers = Array.isArray(req.answers) ? req.answers.slice(0, 50) : [];
  var submitted = new Date();
  var submission = Utilities.getUuid().slice(0, 8);
  var rows = [];
  answers.forEach(function (a) {
    var question = clean_(a && a.question, 500);
    var answer = clean_(a && a.answer, 500);
    var note = clean_(a && a.note, 2000);
    if (question && (answer || note)) {
      rows.push([submitted, submission, name, question, answer, note].map(safeCell_));
    }
  });
  if (!rows.length) throw new Error('Please answer at least one question');
  withLock_(function () {
    var sheet = getDb_().getSheetByName(TABS.responses.name);
    sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, rows[0].length).setValues(rows);
  });
  return { saved: rows.length };
}

function requirePreviewCode_(code) {
  var expected = getSetting_(SETTING_PREVIEW_CODE);
  if (!expected) throw new Error('Preview access is turned off');
  if (String(code == null ? '' : code).trim() !== expected) throw new Error('Wrong access code');
}

function getPreviewQuestions_() {
  var rows = getDb_().getSheetByName(TABS.questions.name).getDataRange().getDisplayValues().slice(1);
  return rows
    .filter(function (r) { return r[0].trim(); })
    .map(function (r) {
      return {
        question: r[0].trim(),
        choices: r[1].split('|').map(function (s) { return s.trim(); }).filter(Boolean)
      };
    });
}

/* ── Sheet ── */

// The Sheet this script is bound to.
function getDb_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  if (!ss) throw new Error('Script is not bound to a spreadsheet');
  return ss;
}

// Brings the Sheet up to date: creates missing tabs, adds missing settings
// (with defaults that can be changed by hand), and keeps the Sheet's time
// zone matched to the script's so dates and times read back as written.
function ensureSchema_() {
  var ss = getDb_();
  var tabsMissing = Object.keys(TABS).some(function (k) { return !ss.getSheetByName(TABS[k].name); });
  var colsMissing = !tabsMissing && Object.keys(TABS).some(function (k) {
    return ss.getSheetByName(TABS[k].name).getLastColumn() < TABS[k].header.length;
  });
  var tzWrong = ss.getSpreadsheetTimeZone() !== Session.getScriptTimeZone();
  if (!tabsMissing && !colsMissing && !tzWrong && !missingSettings_(ss).length) return;
  withLock_(function () {
    if (ss.getSpreadsheetTimeZone() !== Session.getScriptTimeZone()) {
      ss.setSpreadsheetTimeZone(Session.getScriptTimeZone());
    }
    ensureTab_(ss, TABS.settings);
    ensureTab_(ss, TABS.questions, function (sheet) {
      sheet.getRange(2, 1, SEED_QUESTIONS.length, 2).setValues(SEED_QUESTIONS).setWrap(true);
    });
    ensureTab_(ss, TABS.responses);
    ensureTab_(ss, TABS.events);
    ensureTab_(ss, TABS.people);
    Object.keys(TABS).forEach(function (k) { ensureColumns_(ss, TABS[k]); });
    var missing = missingSettings_(ss);
    if (missing.length) {
      var sheet = ss.getSheetByName(TABS.settings.name);
      var row = sheet.getLastRow() + 1;
      sheet.getRange(row, 2, missing.length, 1).setNumberFormat('@').setWrap(true);
      sheet.getRange(row, 1, missing.length, 2).setValues(missing);
    }
  });
}

// Settings rows that don't exist yet, as [name, default value].
function missingSettings_(ss) {
  var sheet = ss.getSheetByName(TABS.settings.name);
  var have = sheet ? sheet.getDataRange().getDisplayValues().map(function (r) { return r[0].trim(); }) : [];
  return [
    [SETTING_PREVIEW_CODE, String(100000 + Math.floor(Math.random() * 900000))],
    [SETTING_PREVIEW_INTRO, SEED_PREVIEW_INTRO],
    [SETTING_PUBLIC_URL, DEFAULT_PUBLIC_URL],
    [SETTING_HEADSHOTS_FOLDER, '']
  ].filter(function (s) { return have.indexOf(s[0]) === -1; });
}

function ensureTab_(ss, tab, seed) {
  if (ss.getSheetByName(tab.name)) return;
  var sheet = ss.insertSheet(tab.name);
  sheet.getRange(1, 1, 1, tab.header.length).setValues([tab.header]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  tab.widths.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  Object.keys(tab.formats || {}).forEach(function (col) {
    sheet.getRange(2, Number(col), sheet.getMaxRows() - 1, 1).setNumberFormat(tab.formats[col]);
  });
  if (seed) seed(sheet);
}

// Adds columns that were added to a tab's layout after the tab was created,
// at the end so existing columns stay where they are.
function ensureColumns_(ss, tab) {
  var sheet = ss.getSheetByName(tab.name);
  var have = sheet.getLastColumn();
  if (have >= tab.header.length) return;
  var extra = tab.header.slice(have);
  sheet.getRange(1, have + 1, 1, extra.length).setValues([extra]).setFontWeight('bold');
  for (var col = have + 1; col <= tab.header.length; col++) {
    sheet.setColumnWidth(col, tab.widths[col - 1]);
    if (tab.formats && tab.formats[col]) {
      sheet.getRange(2, col, sheet.getMaxRows() - 1, 1).setNumberFormat(tab.formats[col]);
    }
  }
}

function getSetting_(name) {
  var rows = getDb_().getSheetByName(TABS.settings.name).getDataRange().getDisplayValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0].trim() === name) return rows[i][1].trim();
  }
  return '';
}

function setSetting_(name, value) {
  var sheet = getDb_().getSheetByName(TABS.settings.name);
  var names = sheet.getDataRange().getDisplayValues().map(function (r) { return r[0].trim(); });
  var row = names.indexOf(name) + 1 || sheet.getLastRow() + 1;
  sheet.getRange(row, 1, 1, 2).setValues([[name, value]]);
}

/* ── Helpers ── */

function withLock_(fn) {
  var lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    return fn();
  } finally {
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

function respond_(fn) {
  try {
    return json_({ success: true, data: fn() });
  } catch (err) {
    console.error(err);
    return json_({ success: false, error: err.message || String(err) });
  }
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
