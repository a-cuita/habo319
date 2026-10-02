/**
 * Volunteer check-in, the public side of events. A volunteer opens an
 * event's page by its check-in code (from the QR code or the event iPad),
 * agrees to the event's waivers, and is recorded on the Check-ins tab,
 * matched to or added to the Volunteers tab. Phones and the iPad ("kiosk")
 * use the same two calls: getEvent and checkIn.
 */

// Column numbers (1-based), matching the headers in TABS (Code.js).
var WAIVER_COL = { id: 1, title: 2, text: 3, type: 4, active: 5, updated: 6 };
var VOLUNTEER_COL = { id: 1, first: 2, last: 3, email: 4, phone: 5, firstSeen: 6, lastSeen: 7 };
var CHECKIN_COL = { id: 1, at: 2, eventId: 3, eventName: 4, volunteerId: 5, name: 6, email: 7, phone: 8,
  method: 9, signedName: 10 };

/* ── Called from the site ── */

// What a check-in page needs for one event. Nothing about other volunteers.
function getEvent_(req) {
  ensureSchema_();
  var ev = findEventByCode_(req.code);
  var win = checkinWindow_(ev);
  return {
    code: ev.code,
    name: ev.name,
    date: ev.date,
    start: ev.start,
    end: ev.end,
    location: ev.location,
    description: ev.description,
    status: win.status,
    opensAt: win.opens ? win.opens.toISOString() : '',
    timeZone: win.timeZone,
    waivers: eventWaivers_(ev).map(function (w) {
      return { id: w.id, title: w.title, text: w.text, type: w.type };
    })
  };
}

// Records a check-in. Checking in twice for the same event is harmless: the
// second time just reports the first.
function checkIn_(req) {
  ensureSchema_();
  var ev = findEventByCode_(req.code);
  var status = checkinWindow_(ev).status;
  if (status !== 'open') throw new Error(CLOSED_MESSAGES[status]);

  var v = validateVolunteer_(req);
  var waivers = eventWaivers_(ev);
  var decisions = (req && req.decisions) || {};
  waivers.forEach(function (w) {
    var d = decisions[w.id];
    if (w.type === 'Required' && d !== 'agree') throw new Error('Please agree to "' + w.title + '" to check in.');
    if (w.type === 'Optional' && d !== 'agree' && d !== 'decline') throw new Error('Please choose yes or no for "' + w.title + '".');
  });
  var signedName = clean_(req.signedName, 120);
  if (waivers.length && !signedName) throw new Error('Type your full name to sign.');
  var method = req.method === 'kiosk' ? 'Kiosk' : 'Phone';

  return withLock_(function () {
    var now = new Date();
    var vol = findOrCreateVolunteer_(v, now);
    var sheet = getDb_().getSheetByName(TABS.checkins.name);
    var last = lastRowWith_(sheet, CHECKIN_COL.id);
    var rows = last > 1 ? sheet.getRange(2, 1, last - 1, CHECKIN_COL.volunteerId).getDisplayValues() : [];
    var mine = rows.filter(function (r) { return r[CHECKIN_COL.volunteerId - 1] === vol.id; });
    var result = { firstName: v.first, eventName: ev.name, hours: ev.hours, returning: !vol.isNew };
    if (mine.some(function (r) { return r[CHECKIN_COL.eventId - 1] === ev.id; })) {
      result.already = true;
      result.eventCount = mine.length;
      return result;
    }

    var checkinId = nextId_('C', rows.map(function (r) { return r[0]; }));
    var name = v.first + ' ' + v.last;
    sheet.getRange(last + 1, 1, 1, CHECKIN_COL.signedName).setValues([[
      checkinId, now, ev.id, safeCell_(ev.name), vol.id, safeCell_(name), safeCell_(v.email), v.phone, method,
      safeCell_(signedName)
    ]]);
    if (waivers.length) {
      var sigs = getDb_().getSheetByName(TABS.signatures.name);
      sigs.getRange(sigs.getLastRow() + 1, 1, waivers.length, 10).setValues(waivers.map(function (w) {
        return [now, checkinId, ev.id, vol.id, safeCell_(name), w.id, safeCell_(w.title), fingerprint_(w.text),
          decisions[w.id] === 'agree' ? 'Agreed' : 'Declined', safeCell_(signedName)];
      }));
    }
    result.already = false;
    result.eventCount = mine.length + 1;
    return result;
  });
}

var CLOSED_MESSAGES = {
  upcoming: "Check-in for this event isn't open yet.",
  closed: 'Check-in for this event has closed.',
  unscheduled: "This event doesn't have a date and time yet."
};

/* ── Events and waivers ── */

function findEventByCode_(code) {
  var wanted = clean_(code, 20).toUpperCase();
  var ev = wanted && readEvents_([], []).filter(function (e) { return e.code.toUpperCase() === wanted; })[0];
  if (!ev) throw new Error("We couldn't find that event. Check the link or QR code.");
  return ev;
}

// Check-in is open from a set time before the event starts until a set time
// after it ends (both in Settings), in the Sheet's time zone.
function checkinWindow_(ev) {
  var tz = getDb_().getSpreadsheetTimeZone();
  if (!ev.date || !ev.start || !ev.end) return { status: 'unscheduled', timeZone: tz };
  var start = Utilities.parseDate(ev.date + ' ' + ev.start, tz, 'yyyy-MM-dd HH:mm');
  var end = Utilities.parseDate(ev.date + ' ' + ev.end, tz, 'yyyy-MM-dd HH:mm');
  var opens = new Date(start.getTime() - minutesSetting_(SETTING_OPENS_BEFORE, 60) * 60000);
  var closes = new Date(end.getTime() + minutesSetting_(SETTING_CLOSES_AFTER, 60) * 60000);
  var now = new Date();
  return { status: now < opens ? 'upcoming' : now > closes ? 'closed' : 'open', opens: opens, timeZone: tz };
}

function minutesSetting_(name, fallback) {
  var n = Number(getSetting_(name));
  return isFinite(n) && n >= 0 && getSetting_(name) !== '' ? n : fallback;
}

// The event's active waivers, in the order the event lists them. A waiver
// that has been unchecked as Active isn't shown.
function eventWaivers_(ev) {
  var byId = {};
  readWaivers_().forEach(function (w) { byId[w.id] = w; });
  return ev.waiverIds.map(function (id) { return byId[id]; }).filter(function (w) { return w && w.active; });
}

// Every waiver with a title. Rows typed in by hand get an ID when first read.
// Type is "Optional" only when it says so; anything else is required.
function readWaivers_() {
  var sheet = getDb_().getSheetByName(TABS.waivers.name);
  var count = lastRowWith_(sheet, WAIVER_COL.id) - 1;
  if (count < 1) return [];
  var shown = sheet.getRange(2, 1, count, WAIVER_COL.active).getDisplayValues();
  backfillIds_(sheet, shown, WAIVER_COL.id, WAIVER_COL.title, 'W');
  return shown
    .map(function (r) {
      return {
        id: r[WAIVER_COL.id - 1].trim(),
        title: r[WAIVER_COL.title - 1].trim(),
        name: r[WAIVER_COL.title - 1].trim(),
        text: r[WAIVER_COL.text - 1].trim(),
        type: /^opt/i.test(r[WAIVER_COL.type - 1].trim()) ? 'Optional' : 'Required',
        active: isTrue_(r[WAIVER_COL.active - 1])
      };
    })
    .filter(function (w) { return w.title; });
}

// A short fingerprint of a waiver's text, so a signature can be tied to the
// exact wording that was shown.
function fingerprint_(text) {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8);
  return bytes.slice(0, 6).map(function (b) { return ('0' + (b & 0xff).toString(16)).slice(-2); }).join('');
}

/* ── Volunteers ── */

function validateVolunteer_(req) {
  req = req || {};
  var v = {
    first: clean_(req.firstName, 60).replace(/\s+/g, ' '),
    last: clean_(req.lastName, 60).replace(/\s+/g, ' '),
    email: clean_(req.email, 200).toLowerCase(),
    phone: ''
  };
  var digits = normalizePhone_(req.phone);
  if (!v.first || !v.last) throw new Error('Please enter your first and last name.');
  if (!v.email && !digits) throw new Error('Please enter an email or phone number.');
  if (v.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.email)) throw new Error('That email address looks incomplete.');
  if (clean_(req.phone, 40) && (digits.length < 7 || digits.length > 15)) throw new Error('That phone number looks incomplete.');
  v.phone = digits.length === 10 ? '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6) : digits;
  return v;
}

// Digits only, without a leading US country code.
function normalizePhone_(phone) {
  var d = String(phone || '').replace(/\D/g, '');
  return d.length === 11 && d.charAt(0) === '1' ? d.slice(1) : d;
}

// The volunteer with the same first and last name and the same email or
// phone. Matching on name too keeps family members who share a phone or
// email apart. A match missing an email or phone gets it filled in.
function findOrCreateVolunteer_(v, now) {
  var sheet = getDb_().getSheetByName(TABS.volunteers.name);
  var last = lastRowWith_(sheet, VOLUNTEER_COL.id);
  var rows = last > 1 ? sheet.getRange(2, 1, last - 1, VOLUNTEER_COL.phone).getDisplayValues() : [];
  var lower = function (s) { return String(s).trim().replace(/\s+/g, ' ').toLowerCase(); };
  var phoneDigits = normalizePhone_(v.phone);
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    var sameName = lower(r[VOLUNTEER_COL.first - 1]) === lower(v.first) && lower(r[VOLUNTEER_COL.last - 1]) === lower(v.last);
    var sameEmail = v.email && lower(r[VOLUNTEER_COL.email - 1]) === v.email;
    var samePhone = phoneDigits && normalizePhone_(r[VOLUNTEER_COL.phone - 1]) === phoneDigits;
    if (sameName && (sameEmail || samePhone)) {
      var row = i + 2;
      if (v.email && !r[VOLUNTEER_COL.email - 1].trim()) sheet.getRange(row, VOLUNTEER_COL.email).setValue(safeCell_(v.email));
      if (v.phone && !r[VOLUNTEER_COL.phone - 1].trim()) sheet.getRange(row, VOLUNTEER_COL.phone).setValue(v.phone);
      sheet.getRange(row, VOLUNTEER_COL.lastSeen).setValue(now);
      return { id: r[VOLUNTEER_COL.id - 1].trim(), isNew: false };
    }
  }
  var id = nextId_('V', rows.map(function (r) { return r[0].trim(); }));
  sheet.getRange(last + 1, 1, 1, VOLUNTEER_COL.lastSeen).setValues([[
    id, safeCell_(v.first), safeCell_(v.last), safeCell_(v.email), v.phone, now, now
  ]]);
  return { id: id, isNew: true };
}
