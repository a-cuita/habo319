/**
 * Admin tools inside the Sheet: a "HABO 319 Admin" menu that opens a modal
 * for managing events. Only people who can edit the Sheet see the menu, and
 * the modal's server calls run as them.
 *
 * Functions without a trailing underscore can be called from the modal via
 * google.script.run, so they return plain strings and numbers (Dates can't
 * cross that bridge).
 */

// Events tab columns (1-based), matching TABS.events.header in Code.js.
var EVENT_COL = { id: 1, name: 2, date: 3, start: 4, end: 5, hours: 6, location: 7, code: 8, created: 9, updated: 10 };

// Unambiguous characters for check-in codes (no 0/O, 1/I/L).
var CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu('HABO 319 Admin')
    .addItem('Manage events', 'openEventsAdmin')
    .addToUi();
}

function openEventsAdmin() {
  ensureSchema_();
  var html = HtmlService.createTemplateFromFile('Admin').evaluate().setWidth(1100).setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, 'Events');
}

// Pulls another HTML file into a template: <?!= include('QrLib'); ?>
function include(name) {
  return HtmlService.createHtmlOutputFromFile(name).getContent();
}

/* ── Called from the modal ── */

function adminGetEvents() {
  ensureSchema_();
  return { events: readEvents_(), publicUrl: getSetting_(SETTING_PUBLIC_URL) || DEFAULT_PUBLIC_URL };
}

// Creates an event (input.id empty) or updates one. A new event gets the next
// ID and a fresh check-in code; editing never changes the code.
function adminSaveEvent(input) {
  ensureSchema_();
  var ev = validateEvent_(input);
  var savedId = withLock_(function () {
    var sheet = getDb_().getSheetByName(TABS.events.name);
    var ids = columnValues_(sheet, EVENT_COL.id);
    var now = new Date();
    var row;
    if (ev.id) {
      var i = ids.indexOf(ev.id);
      if (i < 0) throw new Error('That event is no longer in the Sheet. Close this window and reopen it.');
      row = i + 2;
    } else {
      ev.id = nextEventId_(ids);
      row = lastEventRow_(sheet) + 1;
      sheet.getRange(row, EVENT_COL.id).setValue(ev.id);
      sheet.getRange(row, EVENT_COL.code).setValue(newCheckinCode_(columnValues_(sheet, EVENT_COL.code)));
      sheet.getRange(row, EVENT_COL.created).setValue(now);
    }
    sheet.getRange(row, EVENT_COL.name, 1, 4)
      .setValues([[safeCell_(ev.name), dateSerial_(ev.date), timeSerial_(ev.start), timeSerial_(ev.end)]]);
    sheet.getRange(row, EVENT_COL.location).setValue(safeCell_(ev.location));
    sheet.getRange(row, EVENT_COL.updated).setValue(now);
    return ev.id;
  });
  var result = adminGetEvents();
  result.savedId = savedId;
  return result;
}

/* ── Events tab ── */

// Every event with a name. Rows typed in by hand get an ID and check-in code
// filled in the first time they're read.
function readEvents_() {
  var sheet = getDb_().getSheetByName(TABS.events.name);
  var count = lastEventRow_(sheet) - 1;
  if (count < 1) return [];
  var range = sheet.getRange(2, 1, count, EVENT_COL.updated);
  var values = range.getValues();
  var shown = range.getDisplayValues();

  var needsIds = shown.some(function (r) {
    return r[EVENT_COL.name - 1].trim() && (!r[EVENT_COL.id - 1].trim() || !r[EVENT_COL.code - 1].trim());
  });
  if (needsIds) {
    withLock_(function () {
      var ids = columnValues_(sheet, EVENT_COL.id);
      var codes = columnValues_(sheet, EVENT_COL.code);
      shown.forEach(function (r, i) {
        if (!r[EVENT_COL.name - 1].trim()) return;
        if (!ids[i]) {
          ids[i] = nextEventId_(ids);
          sheet.getRange(i + 2, EVENT_COL.id).setValue(ids[i]);
        }
        if (!codes[i]) {
          codes[i] = newCheckinCode_(codes);
          sheet.getRange(i + 2, EVENT_COL.code).setValue(codes[i]);
        }
        r[EVENT_COL.id - 1] = ids[i];
        r[EVENT_COL.code - 1] = codes[i];
      });
    });
  }

  var tz = getDb_().getSpreadsheetTimeZone();
  return shown
    .map(function (r, i) {
      return {
        id: r[EVENT_COL.id - 1].trim(),
        name: r[EVENT_COL.name - 1].trim(),
        date: toYmd_(values[i][EVENT_COL.date - 1], tz),
        start: toHm_(r[EVENT_COL.start - 1]),
        end: toHm_(r[EVENT_COL.end - 1]),
        hours: r[EVENT_COL.hours - 1].trim(),
        location: r[EVENT_COL.location - 1].trim(),
        code: r[EVENT_COL.code - 1].trim()
      };
    })
    .filter(function (e) { return e.name; });
}

function validateEvent_(input) {
  input = input || {};
  var ev = {
    id: clean_(input.id, 20),
    name: clean_(input.name, 120),
    date: clean_(input.date, 10),
    start: clean_(input.start, 5),
    end: clean_(input.end, 5),
    location: clean_(input.location, 200)
  };
  if (!ev.name) throw new Error('Give the event a name.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ev.date)) throw new Error('Pick a date.');
  if (!/^\d{2}:\d{2}$/.test(ev.start) || !/^\d{2}:\d{2}$/.test(ev.end)) throw new Error('Set a start and end time.');
  if (ev.end <= ev.start) throw new Error('The end time has to be after the start time.');
  return ev;
}

// The last row holding an event (an ID or a name). getLastRow() can't be used
// here: the Hours formula fills its whole column, so it reports the bottom of
// the sheet.
function lastEventRow_(sheet) {
  var rows = sheet.getRange(2, EVENT_COL.id, sheet.getMaxRows() - 1, 2).getDisplayValues();
  for (var i = rows.length - 1; i >= 0; i--) {
    if (rows[i][0].trim() || rows[i][1].trim()) return i + 2;
  }
  return 1;
}

// Event column values below the header, as trimmed display strings.
function columnValues_(sheet, col) {
  var count = lastEventRow_(sheet) - 1;
  if (count < 1) return [];
  return sheet.getRange(2, col, count, 1).getDisplayValues().map(function (r) { return r[0].trim(); });
}

// E001, E002, ... one past the highest existing number.
function nextEventId_(ids) {
  var max = 0;
  ids.forEach(function (id) {
    var m = /^E(\d+)$/.exec(id || '');
    if (m) max = Math.max(max, Number(m[1]));
  });
  return 'E' + ('00' + (max + 1)).slice(-3);
}

function newCheckinCode_(taken) {
  var code;
  do {
    code = '';
    for (var i = 0; i < 6; i++) code += CODE_CHARS.charAt(Math.floor(Math.random() * CODE_CHARS.length));
  } while (taken.indexOf(code) !== -1);
  return code;
}

/* ── Dates and times ── */

// Sheets stores a date as days since 1899-12-30 and a time as a fraction of a
// day. Writing those numbers (with the column's format) avoids any time zone
// conversion on the way in.
function dateSerial_(ymd) {
  var p = ymd.split('-').map(Number);
  return (Date.UTC(p[0], p[1] - 1, p[2]) - Date.UTC(1899, 11, 30)) / 86400000;
}

function timeSerial_(hm) {
  var p = hm.split(':').map(Number);
  return (p[0] * 60 + p[1]) / 1440;
}

// A Date cell as YYYY-MM-DD, read in the Sheet's own time zone.
function toYmd_(value, tz) {
  if (value instanceof Date) return Utilities.formatDate(value, tz, 'yyyy-MM-dd');
  if (typeof value === 'number') {
    return new Date(Date.UTC(1899, 11, 30) + Math.round(value) * 86400000).toISOString().slice(0, 10);
  }
  var s = String(value).trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : '';
}

// A time as HH:MM, parsed from how the Sheet displays it ("9:00 AM", "14:30").
// Reading the displayed text sidesteps the time zone quirks of the 1899 dates
// that Sheets returns for time-only cells.
function toHm_(shown) {
  var m = /^(\d{1,2}):(\d{2})(?::\d{2})?\s*([ap])?\.?\s*m?\.?$/i.exec(String(shown).trim());
  if (!m) return '';
  var h = Number(m[1]);
  if (m[3]) h = (h % 12) + (m[3].toLowerCase() === 'p' ? 12 : 0);
  return ('0' + h).slice(-2) + ':' + m[2];
}
