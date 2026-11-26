/**
 * Walks older than "Walks kept in the live tabs (days)" (90 to start) move to
 * the archive each night (S7-P3, from |S6-P1 item 4 and |M859): the walk, its
 * weighings and its rates together (|Q855 (a)), one walk at a time as it
 * passes the days (|Q873 (a)). Nothing is lost: the archive keeps every row.
 *
 * Where (|Q856, |Q882 (b)): a Google Sheet for each fiscal year, Oct 1 to
 * Sep 30, named like "HABO Litter Cold Storage: Walks 2026-27", in the cold
 * storage folder beside Gchat's; in it, a tab for each quarter, one for each
 * kind of row, since each has its own columns: "Oct-Dec 2026 Walks",
 * "Oct-Dec 2026 Weighings", "Oct-Dec 2026 Rates". A walk's quarter is the one
 * it started in.
 *
 * What stays live, whatever its age:
 * - a walk inside the time it can still be fixed;
 * - a walk in a running Quest's or bounty's dates, until it has ended and the
 *   time to fix walks after it has passed (|Q928 (a));
 * - each segment's last cleaning (the card's item 3), and on each segment, any
 *   cleaning after one that stays: a segment's cleanings leave in order, and a
 *   collection made of pieces leaves whole;
 * - a player's walks of one day, together (Walks in one day).
 *
 * Written down before anything moves, so nothing anyone sees changes:
 * - each segment's running state (Archived segments tab): how many of its
 *   collections are archived, its clock, the pounds carried toward its next
 *   rate, who collected it first and who gave its first rate. Its rates and
 *   clock go on from there exactly as before (pathSequence_ in Segments.js).
 * - each player's archived totals on their Accounts row (|Q927 (a)): walks,
 *   pounds, miles and volunteer hours, added to what's live for badges and
 *   hours; with what the other badges count, in "Archived for badges".
 * - each player's settled XP: their XP lines stay on their tab (|Q860 (a)),
 *   and a Challenge or Quest that's over keeps the XP it paid (xpDues_).
 * - a bounty that's over: its pounds and miles, on its row, for its sponsor.
 * - in each player's XP tab, the last four quarters archived: walks, miles,
 *   pounds and XP (|Q872 (a)).
 *
 * Read from the archive: Your collections' Show older walks (|Q858 (b)),
 * opened and shared but not changed (|Q859 (a)); and Maps, for days before
 * the live tabs' (|Q857 (a)).
 */

var SETTING_KEEP_DAYS = 'Walks kept in the live tabs (days)';
var ARCHIVE_HANDLER = 'archiveNightly';
// Walks moved in one night's run: a run stays well inside Apps Script's six
// minutes, and any left over go the next night.
var ARCHIVE_BATCH = 150;
var ARCH_QUARTERS = ['Oct-Dec', 'Jan-Mar', 'Apr-Jun', 'Jul-Sep'];
var ARCH_KINDS = { walks: 'Walks', weighings: 'Weighings', rates: 'Rates' };
var ARCH_SEG_COL = { segment: 1, n: 2, clock: 3, carry: 4, known: 5, first: 6, firstRate: 7, updated: 8 };
// "Walks in one day" kept for these minutes apart, and any an achievement uses.
var ARCH_SHIFT_MINUTES = [30, 60, 90, 120, 180];

// The days walks stay live: the setting, but never less than the Rate window
// (a rate in it is read from the live tabs) or the time a walk can be fixed.
function keepDays_() {
  var set = Number(getSetting_(SETTING_KEEP_DAYS));
  if (!(set > 0)) set = 90;
  var win = minutesSetting_(SETTING_RATE_WINDOW, 60), edit = minutesSetting_(SETTING_EDIT_HOURS, 48) / 24;
  return Math.max(set, win, Math.ceil(edit) + 1);
}
function archiveCutoff_(now) { return (now || Date.now()) - keepDays_() * DAY_MS; }

// A time's fiscal year (Oct 1 to Sep 30) and quarter: { fy: 2026, fyName: '2026-27', q: 0, label: 'Oct-Dec 2026', key: '2026-0' }.
function archiveWhen_(ms) {
  var tz = Session.getScriptTimeZone(), d = new Date(ms);
  var y = Number(Utilities.formatDate(d, tz, 'yyyy')), m = Number(Utilities.formatDate(d, tz, 'M'));
  var fy = m >= 10 ? y : y - 1, q = m >= 10 ? 0 : Math.floor((m - 1) / 3) + 1;
  return { fy: fy, fyName: fy + '-' + ('0' + ((fy + 1) % 100)).slice(-2), q: q, label: ARCH_QUARTERS[q] + ' ' + (q === 0 ? fy : fy + 1), key: fy + '-' + q };
}
function archiveKeyParts_(key) {
  var m = /^(\d{4})-([0-3])$/.exec(String(key || ''));
  if (!m) return null;
  var fy = Number(m[1]), q = Number(m[2]);
  return { fy: fy, fyName: fy + '-' + ('0' + ((fy + 1) % 100)).slice(-2), q: q, label: ARCH_QUARTERS[q] + ' ' + (q === 0 ? fy : fy + 1), key: key };
}
function archiveKeyRank_(key) { var p = archiveKeyParts_(key); return p ? p.fy * 4 + p.q : -1; }
// The first and last moment of a quarter, for reading the archive by days.
function archiveQuarterSpan_(key) {
  var p = archiveKeyParts_(key), tz = Session.getScriptTimeZone();
  var month = [10, 1, 4, 7][p.q], year = p.q === 0 ? p.fy : p.fy + 1;
  var start = Utilities.parseDate(year + '-' + ('0' + month).slice(-2) + '-01 00:00', tz, 'yyyy-MM-dd HH:mm').getTime();
  var nm = month + 3, ny = year;
  if (nm > 12) { nm -= 12; ny++; }
  var end = Utilities.parseDate(ny + '-' + ('0' + nm).slice(-2) + '-01 00:00', tz, 'yyyy-MM-dd HH:mm').getTime();
  return { since: start, until: end };
}

/* ── The archive's Sheets and tabs ── */

function archiveLiveTab_(kind) { return kind === 'walks' ? TABS.collections : kind === 'weighings' ? TABS.stretches : TABS.rates; }
function archiveColsOf_(kind) { return kind === 'walks' ? COLLECTION_COL : kind === 'weighings' ? STRETCH_COL : RATE_COL; }
// The fiscal years with a Sheet, oldest first.
function archiveYears_() {
  return String(PropertiesService.getScriptProperties().getProperty('ARCHIVE_YEARS') || '').split(/\s+/).filter(String).map(Number).sort();
}
function archiveBook_(fy, make) {
  var props = PropertiesService.getScriptProperties(), key = 'ARCHIVE_FY_' + fy, id = props.getProperty(key), book = null;
  if (id) { try { book = SpreadsheetApp.openById(id); } catch (e) { book = null; } }
  if (!book && make) {
    var w = archiveKeyParts_(fy + '-0');
    book = SpreadsheetApp.create('HABO Litter Cold Storage: Walks ' + w.fyName);
    DriveApp.getFileById(book.getId()).moveTo(coldFolder_());
    props.setProperty(key, book.getId());
    var years = archiveYears_();
    if (years.indexOf(fy) === -1) years.push(fy);
    props.setProperty('ARCHIVE_YEARS', years.sort().join(' '));
  }
  return book;
}
// A quarter's tab for one kind of row, its headings the live tab's and Moved.
function archiveSheet_(key, kind, make) {
  var p = archiveKeyParts_(key), book = p ? archiveBook_(p.fy, make) : null;
  if (!book) return null;
  var name = p.label + ' ' + ARCH_KINDS[kind], sheet = book.getSheetByName(name);
  if (!sheet && make) {
    sheet = book.insertSheet(name);
    var first = book.getSheetByName('Sheet1');
    if (first && first.getLastRow() === 0) { try { book.deleteSheet(first); } catch (e) { /* it can stay, empty */ } }
    var head = archiveLiveTab_(kind).header.concat(['Moved']);
    sheet.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}
// Rows added at the foot, matched to its headings by name, so a live tab that
// gains a column later still lines up (as cold storage does, coldMove_).
function archiveAppend_(sheet, kind, rows, now) {
  if (!rows.length) return;
  var live = archiveLiveTab_(kind).header;
  var heads = sheet.getRange(1, 1, 1, Math.max(1, sheet.getLastColumn())).getValues()[0].map(function (h) { return String(h).trim(); });
  live.concat(['Moved']).forEach(function (h) { if (heads.indexOf(h) === -1) { heads.push(h); sheet.getRange(1, heads.length).setValue(h).setFontWeight('bold'); } });
  var out = rows.map(function (values) {
    return heads.map(function (h) { if (h === 'Moved') return new Date(now); var i = live.indexOf(h); return i === -1 || values[i] == null ? '' : values[i]; });
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, out.length, heads.length).setValues(out);
}
// A quarter's rows of one kind, read as readRows_ reads the live tab's.
function archiveRows_(key, kind) {
  var memo = 'archive ' + key + ' ' + kind;
  if (lockDepth_ === 0 && readMemo_[memo]) return readMemo_[memo];
  var sheet = archiveSheet_(key, kind, false), out = [];
  if (sheet && sheet.getLastRow() >= 2) {
    var vals = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
    var heads = vals[0].map(function (h) { return String(h).trim(); }), live = archiveLiveTab_(kind).header, cols = archiveColsOf_(kind), at = {};
    Object.keys(cols).forEach(function (k) { at[k] = heads.indexOf(live[cols[k] - 1]); });
    out = vals.slice(1).filter(function (r) { return String(r[0]).trim(); }).map(function (values) {
      return { archived: true, values: values, get: function (k) {
        var i = at[k], v = i == null || i < 0 ? '' : values[i];
        if (v instanceof Date) return v;
        v = String(v == null ? '' : v).trim();
        return (k === 'cells' || k === 'squares') && v.indexOf('~') !== -1 ? squaresUnpack_(v) : v;
      } };
    });
  }
  if (lockDepth_ === 0) readMemo_[memo] = out;
  return out;
}
// Every quarter key the archive has, newest first.
function archiveKeys_() {
  var keys = [];
  archiveYears_().forEach(function (fy) { for (var q = 0; q < 4; q++) keys.push(fy + '-' + q); });
  return keys.sort(function (a, b) { return archiveKeyRank_(b) - archiveKeyRank_(a); });
}
// The latest a walk the archive holds ended (0: it holds none). Rates and Maps
// read the archive for any days up to it (S7-P3 round 2, |Q959 (a)), so a
// raised Rate window or "Walks kept" brings walks already moved back into them.
// Kept as each run moves walks; worked out once from the archive's newest
// quarters for one made before.
function archiveReach_() {
  var props = PropertiesService.getScriptProperties(), v = Number(props.getProperty('ARCHIVE_REACH'));
  if (v > 0) return v;
  if (!archiveYears_().length) return 0;
  var reach = 0;
  archiveKeys_().filter(function (key) { return archiveRows_(key, 'walks').length; }).slice(0, 2).forEach(function (key) {
    archiveRows_(key, 'walks').forEach(function (q) { var t = archiveWalkEnd_(q); if (t > reach) reach = t; });
  });
  if (reach) props.setProperty('ARCHIVE_REACH', String(reach));
  return reach;
}
// When a walk ended, as the move reads it: ended, else its last press, else its start.
function archiveWalkEnd_(q) {
  var e = q.get('ended'), l = q.get('lastPressed'), s = q.get('started');
  return e instanceof Date ? e.getTime() : l instanceof Date ? l.getTime() : s instanceof Date ? s.getTime() : 0;
}
// What the archive has for a span of days: its walks by id, weighings and rates.
function archiveRead_(since, until) {
  var out = { cols: {}, stretches: [], rates: [] };
  archiveKeys_().forEach(function (key) {
    var span = archiveQuarterSpan_(key);
    // A walk is filed by when it started; its weighings and rates can end a little after.
    if (span.until + 2 * DAY_MS <= since || span.since >= until) return;
    archiveRows_(key, 'walks').forEach(function (q) { out.cols[q.get('id')] = q; });
    out.stretches = out.stretches.concat(archiveRows_(key, 'weighings'));
    out.rates = out.rates.concat(archiveRows_(key, 'rates'));
  });
  return out;
}

/* ── What's written down: each segment's history, each player's archived totals ── */

// Each segment's history: { n, clock, carry, known, first: [account ids], firstRate: [account ids] }.
function archiveHistory_() {
  var out = {};
  readRows_(TABS.archivedSegments, ARCH_SEG_COL).forEach(function (r) {
    var c = r.get('clock');
    out[r.get('segment')] = { row: r.row, n: Number(r.get('n')) || 0, clock: c instanceof Date ? c.getTime() : null, carry: Number(r.get('carry')) || 0,
      known: String(r.get('known')) !== 'No', first: String(r.get('first')).split(/\s+/).filter(String), firstRate: String(r.get('firstRate')).split(/\s+/).filter(String) };
  });
  return out;
}
// A player's archived totals (|Q927 (a)) and what the other badges count.
function archivedOf_(account) {
  var a = account || {}, x = {};
  try { x = a.archivedFacts ? JSON.parse(a.archivedFacts) : {}; } catch (e) { x = {}; }
  return { walks: Number(a.archivedWalks) || 0, pounds: Number(a.archivedPounds) || 0, miles: Number(a.archivedMiles) || 0, hours: Number(a.archivedHours) || 0,
    collections: Number(x.collections) || 0, seg: x.seg || {}, first: x.first || [], rate: x.rate || [], sun: x.sun || [], weeks: x.weeks || [], shift: x.shift || {},
    q: x.q || {}, any: !!(Number(a.archivedWalks) || x.collections) };
}
function archivedById_(accountId) {
  var a = readAccounts_().filter(function (x) { return x.id === accountId; })[0];
  return archivedOf_(a);
}

/* ── Which walks move ── */

// Each walk that can move now, by the rules at the top. `limit`: at most this many, oldest first.
// `why` (S7-P3 round 2, |Q960 (a)): for each real walk old enough that stays, the rule that keeps it:
// { rule: 'span', name, kind, to } | { rule: 'last', seg } | { rule: 'order', seg, after } |
// { rule: 'pieces', seg, with } | { rule: 'day', with } | { rule: 'batch' }.
function archivePick_(now, limit) {
  var cutoff = archiveCutoff_(now), editMs = minutesSetting_(SETTING_EDIT_HOURS, 48) * 3600000;
  var when = archiveWalkEnd_;
  // Running Quests, bounties and Challenges of their own (|Q928 (a)): their dates, until over and past the time to fix a walk.
  var spans = [], running = function (to) { return !to || now < to + DAY_MS + editMs; };
  questBenchAll_().forEach(function (q) { if (q.state === 'Open' && running(q.to)) spans.push([q.from || 0, q.to ? q.to + DAY_MS : Infinity, q.name, 'Quest', q.to]); });
  bountiesAll_().forEach(function (b) { if (b.state === 'Approved' && running(b.to)) spans.push([b.from || 0, b.to ? b.to + DAY_MS : Infinity, b.name, 'bounty', b.to]); });
  challengesAll_().forEach(function (c) { if (!c.quest && c.state === 'Open' && running(c.to)) spans.push([c.from || 0, c.to ? c.to + DAY_MS : Infinity, c.name, 'Challenge', c.to]); });
  var base = {}, byDay = {}, why = {}, all = {};
  readRows_(TABS.collections).forEach(function (q) {
    var id = q.get('id'), st = q.get('status'), t = when(q), real = q.get('simulated') !== 'Yes' && st !== COLLECTION_DISCARDED;
    var s = q.get('started');
    all[id] = { q: q, real: real, t: t };
    if (real && st !== 'Collecting' && s instanceof Date) (byDay[q.get('account') + '|' + dayOf_(s)] = byDay[q.get('account') + '|' + dayOf_(s)] || []).push(id);
    if (st === 'Collecting' || !t || t >= cutoff) return;
    var inSpan = real ? spans.filter(function (x) { return t >= x[0] && t < x[1]; })[0] : null;
    if (inSpan) { why[id] = { rule: 'span', name: String(inSpan[2] || ''), kind: inSpan[3], to: inSpan[4] || 0 }; return; }
    base[id] = { q: q, real: real, t: t };
  });
  var ids = Object.keys(base).sort(function (a, b) { return base[a].t - base[b].t; });
  // Nothing old enough (every night until the oldest walk passes the days): done, without working out every segment.
  if (!ids.length) return { ids: [], base: base, seqs: [], hist: {}, walks: {}, k: null, cutoff: cutoff, why: why, all: all };
  var ok = {};
  ids.forEach(function (id, i) { if (!limit || i < limit) ok[id] = true; else if (base[id].real) why[id] = { rule: 'batch' }; });
  // Each segment's cleanings, as its rates see them, to keep them in order.
  var counted = rateCollections_(false), walks = worldWalks_(counted, readRows_(TABS.stretches)), k = segmentRules_(), hist = archiveHistory_();
  var seqs = segmentsAll_().filter(function (g) { return g.accepted && g.squares.length; }).map(function (g) { return { g: g, seq: pathSequence_(g, walks, k, hist[g.id]) }; });
  // The first rule to keep a walk is the one it's told.
  var hold = function (id, w) { if (ok[id] && base[id] && base[id].real) { delete ok[id]; if (!why[id]) why[id] = w; return true; } return false; };
  for (var changed = true, guard = 0; changed && guard < 100; guard++) {
    changed = false;
    seqs.forEach(function (s) {
      var ev = s.seq.events, open = true, stop = null;
      ev.forEach(function (e, i) {
        var unit = e.pieces && e.pieces.length ? e.pieces : [e.id];
        var stays = unit.filter(function (id) { return !ok[id]; });
        if (open && i < ev.length - 1 && !stays.length) return;
        if (open) {
          open = false;
          stop = stays.length ? stays[0] : unit[unit.length - 1];
          // The last cleaning stays (the card's item 3); a collection made of pieces leaves whole.
          unit.forEach(function (id) { if (hold(id, stays.length ? { rule: 'pieces', seg: s.g, with: stays[0] } : { rule: 'last', seg: s.g })) changed = true; });
          return;
        }
        // A segment's cleanings leave in order: none after one that stays.
        unit.forEach(function (id) { if (hold(id, { rule: 'order', seg: s.g, after: stop })) changed = true; });
      });
    });
    Object.keys(byDay).forEach(function (key) {
      var list = byDay[key], stays = list.filter(function (id) { return !ok[id]; });
      if (stays.length) list.forEach(function (id) { if (hold(id, { rule: 'day', with: stays[0] })) changed = true; });
    });
  }
  return { ids: Object.keys(ok).sort(function (a, b) { return base[a].t - base[b].t; }), base: base, seqs: seqs, hist: hist, walks: walks, k: k, cutoff: cutoff, why: why, all: all };
}

/* ── Moving them ── */

// The nightly run: the timer calls it (archiveTimerSync_ makes the timer).
function archiveNightly() {
  ensureSchema_();
  return archiveRun_(Date.now());
}
// `by`: who asked, for the Changes tab: HABO for the nightly run, or the Head
// Builder who pressed Move old walks now (|Q960 (a)). Returns what moved; the
// pick it moved by is kept in archiveLastPick_, for that press to say which
// stayed and why.
var archiveLastPick_ = null;
function archiveRun_(now, limit, by) {
  return withLock_(function () {
    settingsMemo_ = null;
    var pick = archivePick_(now, limit || ARCHIVE_BATCH);
    var ids = pick.ids;
    archiveBountiesOver_(now);
    archiveLastPick_ = pick;
    if (!ids.length) return { moved: 0, ids: [] };
    var moving = {};
    ids.forEach(function (id) { moving[id] = true; });
    // Each player with walks moving, settled first, so their XP is written down.
    var players = {};
    ids.forEach(function (id) { if (pick.base[id].real) players[pick.base[id].q.get('account')] = true; });
    Object.keys(players).forEach(function (acc) { xpSettle_(acc, false); });
    forgetReads_();
    pick = archivePick_(now, limit || ARCHIVE_BATCH);   // read again after settling: the same walks, the same rules
    ids = pick.ids;
    moving = {};
    ids.forEach(function (id) { moving[id] = true; });
    archiveLastPick_ = pick;
    if (!ids.length) return { moved: 0, ids: [] };
    archiveHistoryWrite_(pick, moving, now);
    archiveFactsWrite_(pick, moving, now);
    var moved = archiveMoveRows_(moving, now, pick);
    // How far the archive now reaches, for rates and Maps (|Q959 (a)).
    var reach = archiveReach_();
    ids.forEach(function (id) { if (pick.base[id].t > reach) reach = pick.base[id].t; });
    PropertiesService.getScriptProperties().setProperty('ARCHIVE_REACH', String(reach));
    logChange_(by || 'HABO', 'Archived', ids.length + (ids.length === 1 ? ' walk' : ' walks'), 'To the archive', '', ids.join(' '));
    forgetReads_();
    dataVersion_(true);
    return { moved: ids.length, rows: moved, ids: ids };
  });
}

// Move old walks now (S7-P3 round 2, |Q960 (a)): a Head Builder runs the
// night's move at once, from Admin Mode's Settings, under "Walks kept in the
// live tabs". It says which walks moved, and which stayed though old enough,
// and why. Asked with `look`, it only says what a press would do.
function archiveNow_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (account.rank !== 'Head Builder') throw new Error('Only a Head Builder can move old walks now.');
  var now = Date.now();
  if (req.look) {
    settingsMemo_ = null;
    var days = keepDays_();
    return { keep: days, cutoff: now - days * DAY_MS, lines: archiveLookLines_(now - days * DAY_MS, days) };
  }
  var r = archiveRun_(now, ARCHIVE_BATCH, account.email);
  return archiveReport_(r, archiveLastPick_);
}
function archiveWhenSay_(ms) { return Utilities.formatDate(new Date(ms), Session.getScriptTimeZone(), 'MMM d, h:mm a'); }
function archiveLookLines_(cutoff, days) {
  return ['Walks kept in the live tabs is ' + days + (days === 1 ? ' day' : ' days') + ' now' + (days > Number(getSetting_(SETTING_KEEP_DAYS) || 0) ? ' (never fewer than the Rate window\'s days, or the time a walk can be fixed)' : '') + '.',
    'Walks that ended before ' + archiveWhenSay_(cutoff) + ' move to the archive now, with their weighings and rates, as the nightly run would move them.',
    'Some stay, though old enough: each segment\'s last cleaning, the walks in a running Quest\'s, bounty\'s or Challenge\'s dates, and the rest of a player\'s walks that day while one of them stays. You\'ll see which, and why.',
    'From the archive, a walk can be opened and shared, not changed.'];
}
// What a press did, in plain lines: { moved, title, lines }.
function archiveReport_(r, pick) {
  var all = pick.all || {}, shown = {}, segName = function (g) { return g.id + (g.name ? ' (' + g.name + ')' : ''); };
  readAccounts_().forEach(function (a) { shown[a.id] = a.handle || a.id; });
  var walkSay = function (id) {
    var w = all[id] || pick.base[id];
    if (!w) return id;
    return id + ', ' + archiveWhenSay_(w.t) + ', ' + (shown[w.q.get('account')] || w.q.get('account'));
  };
  var editH = minutesSetting_(SETTING_EDIT_HOURS, 48);
  var whySay = function (w) {
    if (w.rule === 'span') return 'in ' + (w.name ? w.name + '\'s' : 'a ' + w.kind + '\'s') + ' dates (a ' + w.kind + (w.to ? ', to ' + Utilities.formatDate(new Date(w.to), Session.getScriptTimeZone(), 'MMM d') : ', with no end') + '): its walks stay while it runs, and until the ' + editH + ' hours to fix a walk after it have passed.';
    if (w.rule === 'last') return 'the last cleaning of ' + segName(w.seg) + ': it stays, so the segment\'s clock and its left-alone bonus stay right.';
    if (w.rule === 'order') return 'on ' + segName(w.seg) + ', a cleaning before it stays (' + w.after + '), and a segment\'s cleanings leave in order.';
    if (w.rule === 'pieces') return 'a piece of one collection on ' + segName(w.seg) + ', with ' + w.with + ', which stays: a collection made of pieces leaves whole.';
    if (w.rule === 'day') return 'another walk of that player\'s that day stays (' + w.with + '): a player\'s walks of one day leave together.';
    return 'a run moves at most ' + ARCHIVE_BATCH + ' walks: it goes on the next.';
  };
  var lines = [], movedReal = r.ids.filter(function (id) { return pick.base[id] && pick.base[id].real; }), others = r.ids.length - movedReal.length;
  lines.push(r.moved ? 'Moved to the archive: ' + movedReal.length + (movedReal.length === 1 ? ' walk' : ' walks') + ', with their weighings and rates.' : 'Nothing moved: no walk ended before ' + archiveWhenSay_(pick.cutoff) + ' can move yet.');
  movedReal.forEach(function (id) {
    var q = pick.base[id].q;
    lines.push('• ' + walkSay(id) + ': ' + round_(Number(q.get('pounds')) || 0, 2) + ' lb, ' + round_(Number(q.get('miles')) || 0, 2) + ' mi.');
  });
  if (others) lines.push('Also moved: ' + others + ' simulated or discarded ' + (others === 1 ? 'walk' : 'walks') + '.');
  var stayed = Object.keys(pick.why).filter(function (id) { return all[id] && r.ids.indexOf(id) === -1; }).sort(function (a, b) { return all[a].t - all[b].t; });
  lines.push(stayed.length ? 'Stayed, though old enough: ' + stayed.length + (stayed.length === 1 ? ' walk' : ' walks') + '.' : 'Every walk old enough moved.');
  stayed.forEach(function (id) { lines.push('• ' + walkSay(id) + ': ' + whySay(pick.why[id])); });
  var young = Object.keys(all).filter(function (id) { var w = all[id]; return w.real && w.q.get('status') !== 'Collecting' && w.t >= pick.cutoff; });
  lines.push('Not old enough yet: ' + young.length + (young.length === 1 ? ' walk' : ' walks') + ', ended from ' + archiveWhenSay_(pick.cutoff) + ' on.');
  if (r.moved) lines.push('In the Changes tab: "Archived", with each walk\'s ID.');
  return { moved: movedReal.length, title: r.moved ? 'Old walks moved' : 'Nothing moved', lines: lines };
}

// Each segment whose oldest cleanings are moving: its history, carried on to just after them.
function archiveHistoryWrite_(pick, moving, now) {
  var acc = {};
  readRows_(TABS.collections).forEach(function (q) { acc[q.get('id')] = q.get('account'); });
  var sheet = getDb_().getSheetByName(TABS.archivedSegments.name);
  pick.seqs.forEach(function (s) {
    var ev = s.seq.events, n = 0;
    while (n < ev.length && (ev[n].pieces && ev[n].pieces.length ? ev[n].pieces : [ev[n].id]).every(function (id) { return moving[id]; })) n++;
    if (!n) return;
    var h = pick.hist[s.g.id] || { n: 0, first: [], firstRate: [] }, st = ev[n - 1].state;
    var who = function (e) { var out = []; (e.pieces && e.pieces.length ? e.pieces : [e.id]).forEach(function (id) { if (acc[id] && out.indexOf(acc[id]) === -1) out.push(acc[id]); }); return out; };
    var first = h.n ? h.first : who(ev[0]), firstRate = h.firstRate;
    if (!firstRate.length) for (var i = 0; i < n; i++) if (ev[i].result === 'rate') { firstRate = who(ev[i]); break; }
    var row = [s.g.id, h.n + n, st.clock == null ? '' : new Date(st.clock), round_(st.carry, 3), st.known ? 'Yes' : 'No', first.join(' '), firstRate.join(' '), new Date(now)];
    sheet.getRange(h.row || lastRowWith_(sheet, 1) + 1, 1, 1, row.length).setValues([row]);
    if (!h.row) forgetReads_();
  });
}

// Each player's archived totals, and their XP tab's last four quarters (|Q872 (a)).
function archiveFactsWrite_(pick, moving, now) {
  var per = {}, of = function (a) { return per[a] = per[a] || { walks: 0, pounds: 0, miles: 0, hours: 0, collections: 0, seg: {}, first: [], rate: [], sun: [], weeks: {}, days: {}, q: {} }; };
  var hist = pick.hist, acc = {};
  readRows_(TABS.collections).forEach(function (q) { acc[q.get('id')] = q.get('account'); });
  // The walks: as badges count them (a GPX track), and as volunteer hours do.
  ids_(moving).forEach(function (id) {
    var b = pick.base[id];
    if (!b.real) return;
    var q = b.q, a = of(q.get('account')), s = q.get('started'), started = s instanceof Date ? s.getTime() : 0;
    a.collections++;
    a.hours += Number(q.get('hours')) || 0;
    var w = archiveWhen_(started || b.t), qq = a.q[w.key] = a.q[w.key] || [0, 0, 0, 0];
    if (!String(q.get('track')).trim()) return;
    var e = q.get('ended'), pounds = Number(q.get('pounds')) || 0, miles = Number(q.get('miles')) || 0, cell = String(q.get('startCell') || '');
    a.walks++; a.pounds += pounds; a.miles += miles;
    qq[0]++; qq[1] += miles; qq[2] += pounds;
    if (started) {
      a.weeks[weekOf_(started)] = true;
      (a.days[dayOf_(new Date(started))] = a.days[dayOf_(new Date(started))] || []).push({ started: started, ended: e instanceof Date ? e.getTime() : started, cell: cell });
      if (/^-?\d+_-?\d+$/.test(cell)) {
        var off = Math.round((started - sunFor_(cell, new Date(started)).sunrise) / 60000);
        if (off >= 0 && off <= 720) a.sun.push(off);
      }
    }
  });
  // Each segment's cleanings moving: who took part, who was first, who gave its first rate.
  pick.seqs.forEach(function (s) {
    var ev = s.seq.events, h = hist[s.g.id] || { n: 0, firstRate: [] }, n = 0, rateGiven = h.firstRate.length > 0;
    while (n < ev.length && (ev[n].pieces && ev[n].pieces.length ? ev[n].pieces : [ev[n].id]).every(function (id) { return moving[id]; })) n++;
    for (var i = 0; i < n; i++) {
      var who = {};
      (ev[i].pieces && ev[i].pieces.length ? ev[i].pieces : [ev[i].id]).forEach(function (id) { if (acc[id]) who[acc[id]] = true; });
      Object.keys(who).forEach(function (a) {
        var p = of(a);
        p.seg[s.g.id] = (p.seg[s.g.id] || 0) + 1;
        if (!h.n && i === 0) p.first.push(s.g.id);
        if (!rateGiven && ev[i].result === 'rate') p.rate.push(s.g.id);
      });
      if (ev[i].result === 'rate') rateGiven = true;
    }
  });
  // XP each quarter, from the XP lines of the walks moving.
  Object.keys(per).forEach(function (a) {
    var p = per[a];
    xpRows_(a).forEach(function (r) {
      if (!r.walk || !moving[r.walk] || !pick.base[r.walk]) return;
      var s = pick.base[r.walk].q.get('started'), w = archiveWhen_(s instanceof Date ? s.getTime() : pick.base[r.walk].t);
      (p.q[w.key] = p.q[w.key] || [0, 0, 0, 0])[3] += r.xp;
    });
  });
  var minutes = ARCH_SHIFT_MINUTES.slice();
  achievementsAll_().forEach(function (x) { if (x.counts === 'Walks in one day' && x.minutes > 0 && minutes.indexOf(x.minutes) === -1) minutes.push(x.minutes); });
  readAccounts_().forEach(function (account) {
    var p = per[account.id];
    if (!p) return;
    var was = archivedOf_(account), facts = {};
    try { facts = account.archivedFacts ? JSON.parse(account.archivedFacts) : {}; } catch (e) { facts = {}; }
    Object.keys(p.seg).forEach(function (g) { was.seg[g] = (was.seg[g] || 0) + p.seg[g]; });
    p.first.forEach(function (g) { if (was.first.indexOf(g) === -1) was.first.push(g); });
    p.rate.forEach(function (g) { if (was.rate.indexOf(g) === -1) was.rate.push(g); });
    var weeks = {};
    was.weeks.forEach(function (w) { weeks[w] = true; });
    Object.keys(p.weeks).forEach(function (w) { weeks[w] = true; });
    // The most walks in one day, for each gap a badge might ask: a player's day moves whole.
    var shift = was.shift;
    Object.keys(p.days).forEach(function (d) {
      var list = p.days[d].sort(function (x, y) { return x.started - y.started; });
      minutes.forEach(function (mn) { var n = shiftsOf_(list, mn); if (n > (shift[mn] || 0)) shift[mn] = n; });
    });
    Object.keys(p.q).forEach(function (k) {
      var o = was.q[k] || [0, 0, 0, 0];
      was.q[k] = [o[0] + p.q[k][0], round_(o[1] + p.q[k][1], 2), round_(o[2] + p.q[k][2], 2), round_(o[3] + p.q[k][3], 2)];
    });
    facts.collections = was.collections + p.collections;
    facts.seg = was.seg; facts.first = was.first; facts.rate = was.rate; facts.sun = was.sun.concat(p.sun);
    facts.weeks = Object.keys(weeks).sort(); facts.shift = shift; facts.q = was.q;
    setAccountCells_(account.row, {
      archivedWalks: was.walks + p.walks, archivedPounds: round_(was.pounds + p.pounds, 2), archivedMiles: round_(was.miles + p.miles, 2),
      archivedHours: round_(was.hours + p.hours, 2), archivedFacts: JSON.stringify(facts) });
    archiveTopBlock_(account.id, was.q);
  });
  forgetReads_();
}
function ids_(set) { return Object.keys(set); }

// A cleaning that gave no rate has no row in Segment rates; its pop-up works
// out why from the walks around it. Moving, it gets a row, Not counted, in
// the pop-up's own words, so Maps for its days still says why.
function archiveNoRateRows_(pick, moving) {
  var out = [], have = {}, tz = Session.getScriptTimeZone();
  readRows_(TABS.rates).forEach(function (r) { have[r.get('segment') + '|' + r.get('collection')] = true; });
  pick.seqs.forEach(function (s) {
    var ev = s.seq.events;
    var whenOf = function (id) { var e = ev.filter(function (x) { return x.id === id; })[0]; return e ? Utilities.formatDate(new Date(e.t), tz, 'MMM d, h:mm a') : id; };
    for (var i = 0; i < ev.length; i++) {
      var e = ev[i], unit = e.pieces && e.pieces.length ? e.pieces : [e.id];
      if (!unit.every(function (id) { return moving[id]; })) break;
      if (e.result === 'rate' || have[s.g.id + '|' + e.id]) continue;
      var row = blankRow_(TABS.rates);
      row[RATE_COL.segment - 1] = s.g.id; row[RATE_COL.collection - 1] = e.id; row[RATE_COL.collected - 1] = new Date(e.t);
      row[RATE_COL.pounds - 1] = round_(e.lbs || 0, 2); row[RATE_COL.miles - 1] = round_(s.seq.miles, 3); row[RATE_COL.days - 1] = e.since == null ? '' : round_(e.since, 2);
      row[RATE_COL.covered - 1] = Math.round((e.covered || 0) * 100); row[RATE_COL.notCounted - 1] = notCountedWhy_(e, pick.k, whenOf);
      out.push({ walk: e.id, values: row });
    }
  });
  return out;
}

// The rows themselves: added to their quarter's tabs, then taken off the live ones, bottom up.
function archiveMoveRows_(moving, now, pick) {
  var extra = pick ? archiveNoRateRows_(pick, moving) : [];
  var started = {}, n = 0;
  readRows_(TABS.collections).forEach(function (q) {
    if (!moving[q.get('id')]) return;
    var s = q.get('started'), e = q.get('ended');
    started[q.get('id')] = archiveWhen_(s instanceof Date ? s.getTime() : e instanceof Date ? e.getTime() : now).key;
  });
  [['walks', TABS.collections, function (r) { return r.get('id'); }],
   ['weighings', TABS.stretches, function (r) { return r.get('collection'); }],
   ['rates', TABS.rates, function (r) { return r.get('collection'); }]].forEach(function (x) {
    var kind = x[0], tab = x[1], walkOf = x[2], byKey = {}, rows = [];
    readRows_(tab).forEach(function (r) {
      var id = walkOf(r);
      if (!moving[id]) return;
      (byKey[started[id]] = byKey[started[id]] || []).push(r.values);
      rows.push(r.row);
    });
    if (kind === 'rates') extra.forEach(function (x) { (byKey[started[x.walk]] = byKey[started[x.walk]] || []).push(x.values); });
    Object.keys(byKey).forEach(function (key) { archiveAppend_(archiveSheet_(key, kind, true), kind, byKey[key], now); });
    var sheet = getDb_().getSheetByName(tab.name);
    rows.sort(function (a, b) { return b - a; });
    for (var i = 0; i < rows.length;) {
      var end = rows[i], j = i;
      while (j + 1 < rows.length && rows[j + 1] === rows[j] - 1) j++;
      sheet.deleteRows(rows[j], end - rows[j] + 1);
      n += end - rows[j] + 1;
      i = j + 1;
    }
    forgetReads_();
  });
  return n;
}

// A bounty that's over keeps its pounds and miles on its row (its sponsor's
// view reads them), written while its walks are all still live.
function archiveBountiesOver_(now) {
  var editMs = minutesSetting_(SETTING_EDIT_HOURS, 48) * 3600000, sheet = null;
  bountiesAll_().forEach(function (b) {
    if (b.state !== 'Approved' || !b.to || now < b.to + DAY_MS + editMs || b.finalPounds !== '') return;
    var m = bountyMeasure_(b);
    sheet = sheet || getDb_().getSheetByName(TABS.bounties.name);
    sheet.getRange(b.row, BOUNTY_COL.finalPounds, 1, 2).setValues([[m.pounds, m.miles]]);
  });
  if (sheet) forgetReads_();
}

// The last four quarters archived, in the player's XP tab, above the rows'
// headings (|Q872 (a)): its rows are made the first time, then kept up.
function archiveTopBlock_(accountId, quarters) {
  var sheet = xpTab_(accountId, true), keys = Object.keys(quarters).sort(function (a, b) { return archiveKeyRank_(b) - archiveKeyRank_(a); }).slice(0, 4);
  var all = sheet.getRange(1, 1, Math.min(sheet.getLastRow(), 60), 2).getValues(), head = -1, title = -1;
  for (var i = 0; i < all.length; i++) {
    if (String(all[i][0]).trim() === 'Archived, by quarter') title = i + 1;
    if (String(all[i][0]).trim() === XP_HEAD[0] && String(all[i][1]).trim() === XP_HEAD[1]) { head = i + 1; break; }
  }
  if (head < 0) return;
  if (title < 0) { sheet.insertRowsBefore(head, 5); title = head; }
  var rows = [['Archived, by quarter', 'Walks', 'Miles', 'Pounds', 'XP']];
  for (var r = 0; r < 4; r++) {
    var k = keys[r], v = k ? quarters[k] : null;
    rows.push(v ? [archiveKeyParts_(k).label, v[0], round_(v[1], 2), round_(v[2], 2), round_(v[3], 2)] : ['', '', '', '', '']);
  }
  sheet.getRange(title, 1, 5, 5).setValues(rows);
  sheet.getRange(title, 1, 1, 5).setFontWeight('bold');
}

/* ── Its timer ── */

// One nightly timer, about 2 AM, made by the app like the digest's (it needs
// the same Google allowance, given for the digest). Made on the first
// request after Deploy, and again if it's ever gone.
function archiveTimerSync_() {
  try {
    var have = ScriptApp.getProjectTriggers().filter(function (t) { return t.getHandlerFunction() === ARCHIVE_HANDLER; });
    if (have.length === 1) return { ok: true, say: 'The archive\'s timer: 1, each night.' };
    have.forEach(function (t) { ScriptApp.deleteTrigger(t); });
    ScriptApp.newTrigger(ARCHIVE_HANDLER).timeBased().everyDays(1).atHour(2).create();
    return { ok: true, say: 'The archive\'s timer: 1, each night.' };
  } catch (e) {
    return { ok: false, say: 'The archive\'s timer couldn\'t be made: ' + String(e && e.message || e).slice(0, 160) };
  }
}
function archiveTimerOnce_() {
  var props = PropertiesService.getScriptProperties(), done = props.getProperty('ARCHIVE_TIMER');
  if (done && done.indexOf('later') !== 0) return;
  var r = archiveTimerSync_();
  props.setProperty('ARCHIVE_TIMER', r.ok ? new Date().toISOString() : 'later: ' + r.say);
}

/* ── Read from the archive ── */

// Your collections' Show older walks (|Q858 (b)): one archived quarter of
// yours at a time, newest first, as Your collections shows a walk, marked
// archived: opened and shared, not changed (|Q859 (a)).
function collectionsOlder_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var mine = archivedOf_(account), keys = Object.keys(mine.q).sort(function (a, b) { return archiveKeyRank_(b) - archiveKeyRank_(a); });
  var before = req.before ? archiveKeyRank_(req.before) : Infinity;
  var key = keys.filter(function (k) { return archiveKeyRank_(k) <= before; })[0] || '';
  if (!key) return { collections: [], next: '', label: '' };
  var byCollection = {}, xpRows = {}, pinsOf = {};
  archiveRows_(key, 'weighings').forEach(function (r) { if (r.get('account') === account.id) (byCollection[r.get('collection')] = byCollection[r.get('collection')] || []).push(r); });
  xpRows_(account.id).forEach(function (r) { if (r.walk) (xpRows[r.walk] = xpRows[r.walk] || []).push(r); });
  walkPins_(account.id, null).forEach(function (p) { (pinsOf[p.walk] = pinsOf[p.walk] || []).push(p); });
  var list = archiveRows_(key, 'walks').filter(function (q) {
    return q.get('account') === account.id && q.get('status') !== 'Collecting' && q.get('status') !== COLLECTION_DISCARDED && q.get('simulated') !== 'Yes';
  }).map(function (q) {
    var col = collectionOf_(q);
    col.editable = false;
    col.editableUntil = 0;
    col.archived = archiveKeyParts_(key).label;
    var mineXp = xpRows[col.id] || [], last = mineXp.length ? mineXp[mineXp.length - 1].detail.parts || {} : {};
    col.xpParts = { counts: mineXp.length > 0, plan: last.plan || 0, ratings: last.ratings || 0, types: last.types || 0, mult: last.mult || 1, kind: last.kind || '',
      bonus: last.bonus || 0, math: last.math || [], mathRows: last.mathRows || [], mathHow: last.mathHow || null };
    col.xp = round_(mineXp.reduce(function (t, r) { return t + r.xp; }, 0), 2);
    col.stretchList = (byCollection[col.id] || []).map(stretchOf_).sort(function (a, b) { return a.n - b.n; }).map(stretchViewOf_);
    col.pins = pinsOf[col.id] || [];
    delete col.row;
    return col;
  }).sort(function (a, b) { return b.started - a.started; });
  var next = keys.filter(function (k) { return archiveKeyRank_(k) < archiveKeyRank_(key); })[0] || '';
  return { collections: list, next: next, label: archiveKeyParts_(key).label };
}
// The newest archived quarter of a player's, for Your collections' Show older walks.
function archiveNewestOf_(account) {
  var keys = Object.keys(archivedOf_(account).q).sort(function (a, b) { return archiveKeyRank_(b) - archiveKeyRank_(a); });
  return keys[0] || '';
}
