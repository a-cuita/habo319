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
  }
};

var SETTING_PREVIEW_CODE = 'Preview access code';
var SETTING_PREVIEW_INTRO = 'Preview intro';

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

// Creates any missing tab, seeding Settings with a random preview access code
// that can be changed in the Sheet.
function ensureSchema_() {
  var ss = getDb_();
  var missing = Object.keys(TABS).some(function (k) { return !ss.getSheetByName(TABS[k].name); });
  if (!missing) return;
  withLock_(function () {
    ensureTab_(ss, TABS.settings, function (sheet) {
      var code = String(100000 + Math.floor(Math.random() * 900000));
      sheet.getRange(2, 2, 2, 1).setNumberFormat('@').setWrap(true);
      sheet.getRange(2, 1, 2, 2).setValues([
        [SETTING_PREVIEW_CODE, code],
        [SETTING_PREVIEW_INTRO, SEED_PREVIEW_INTRO]
      ]);
    });
    ensureTab_(ss, TABS.questions, function (sheet) {
      sheet.getRange(2, 1, SEED_QUESTIONS.length, 2).setValues(SEED_QUESTIONS).setWrap(true);
    });
    ensureTab_(ss, TABS.responses);
  });
}

function ensureTab_(ss, tab, seed) {
  if (ss.getSheetByName(tab.name)) return;
  var sheet = ss.insertSheet(tab.name);
  sheet.getRange(1, 1, 1, tab.header.length).setValues([tab.header]).setFontWeight('bold');
  sheet.setFrozenRows(1);
  tab.widths.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  if (seed) seed(sheet);
}

function getSetting_(name) {
  var rows = getDb_().getSheetByName(TABS.settings.name).getDataRange().getDisplayValues();
  for (var i = 1; i < rows.length; i++) {
    if (rows[i][0].trim() === name) return rows[i][1].trim();
  }
  return '';
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
