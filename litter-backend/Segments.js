/**
 * Accepted segments and litter accumulation rates (S5-P3, authorized Oct 30,
 * with your M565 and Q525 to Q527).
 *
 * - A player proposes one of their own plans as a segment; HABO's staff
 *   accept it by typing Yes in its Accepted column in the Segments tab (Q526,
 *   Q527). Only accepted segments build rates.
 * - Each square of a segment remembers when it was last cleaned: the end of
 *   the latest weighing whose squares came within a square of it (Q514).
 * - A walk collects a segment when its squares come within 15 m (the square
 *   next door) of 90% of the segment's squares (Q503). It measures a rate
 *   when the segment was due, cleaned 1 to 4 days before, a day being 24
 *   hours (Q495, M529), and its weighings line up with the segment: the
 *   pounds of the weighings inside it, divided by its miles and the days
 *   since it was cleaned (Q480, Q491, Q524).
 * - A segment's rate is the median of its rates in the window by default,
 *   or their average, or both (Q518). Its confidence comes from how many
 *   rates are in the window, with an arrow for which way that count is going
 *   (Q519, Q523). The window, the counts and the names are settings.
 * - No collection is left out (Q512); simulated and discarded walks never
 *   count (S5-U2).
 */

var SEGMENT_COL = { id: 1, name: 2, by: 3, proposed: 4, plan: 5, squares: 6, miles: 7, accepted: 8, note: 9 };
var RATE_COL = { segment: 1, collection: 2, collected: 3, pounds: 4, miles: 5, days: 6, rate: 7, covered: 8 };

var SETTING_DUE_FROM = 'Segment due from (days since cleaned)';
var SETTING_DUE_TO = 'Segment due until (days since cleaned)';
var SETTING_RATE_WINDOW = 'Rate window (days)';
var SETTING_RATE_SHOWS = 'Segment rate shows (Median, Average or Both)';
var SETTING_CONF_LOW = 'Confidence Low up to (rates in the window)';
var SETTING_CONF_MODERATE = 'Confidence Moderate up to (rates in the window)';
var SETTING_CONF_NAMES = 'Confidence names';
var SETTING_RATE_TOP = 'Rate map top (lb per mile per day)';
var SEGMENT_SETTINGS = [
  [SETTING_DUE_FROM, '1'], [SETTING_DUE_TO, '4'], [SETTING_RATE_WINDOW, '60'], [SETTING_RATE_SHOWS, 'Median'],
  [SETTING_CONF_LOW, '2'], [SETTING_CONF_MODERATE, '5'], [SETTING_CONF_NAMES, 'No recent rate, Low, Moderate, Established'],
  [SETTING_RATE_TOP, '5']
];
var SEGMENT_COVER = 0.9;    // 90% of the segment (Q503)
var DAY_MS = 86400000;

/* ── Called from the page ── */

// Proposes one of your own plans as a segment, for HABO's staff to accept.
function segmentPropose_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var plan = planById_(clean_(req.planId, 20));
  if (!plan || plan.account !== account.id) throw new Error('That plan isn\'t yours, or isn\'t here any more.');
  var name = clean_(req.name, 80) || 'From plan ' + plan.id;
  return withLock_(function () {
    var had = segmentsAll_().filter(function (s) { return s.plan === plan.id; })[0];
    if (had) throw new Error('That plan is already proposed, as ' + had.id + '.');
    var squares = [];
    plan.stretches.forEach(function (s) { s.cells.forEach(function (c) { if (squares.indexOf(c) === -1) squares.push(c); }); });
    var sheet = getDb_().getSheetByName(TABS.segments.name);
    var id = nextId_('SG', segmentsAll_().map(function (s) { return s.id; }));
    var row = blankRow_(TABS.segments);
    row[SEGMENT_COL.id - 1] = id;
    row[SEGMENT_COL.name - 1] = name;
    row[SEGMENT_COL.by - 1] = account.id;
    row[SEGMENT_COL.proposed - 1] = new Date();
    row[SEGMENT_COL.plan - 1] = plan.id;
    row[SEGMENT_COL.squares - 1] = squares.join(' ');
    row[SEGMENT_COL.miles - 1] = round_(plan.miles, 2);
    sheet.getRange(lastRowWith_(sheet, 1) + 1, 1, 1, row.length).setValues([row]);
    logChange_(account.email, 'Segment', id, 'Proposed', '', name + ' (from ' + plan.id + ')');
    return { plans: myPlans_(account.id) };
  });
}

/* ── Reading ── */

function segmentsAll_() {
  return readRows_(TABS.segments).map(function (r) {
    var p = r.get('proposed');
    return { row: r.row, id: r.get('id'), name: r.get('name'), by: r.get('by'), proposed: p instanceof Date ? p.getTime() : 0, plan: r.get('plan'),
      squares: String(r.get('squares')).split(/\s+/).filter(function (c) { return /^-?\d+_-?\d+$/.test(c); }),
      miles: Number(r.get('miles')) || 0, accepted: /^\s*y/i.test(r.get('accepted')), note: r.get('note') };
  });
}

function ratesAll_() {
  return readRows_(TABS.rates).map(function (r) {
    var t = r.get('collected');
    return { row: r.row, segment: r.get('segment'), collection: r.get('collection'), collected: t instanceof Date ? t.getTime() : 0,
      pounds: Number(r.get('pounds')) || 0, days: Number(r.get('days')) || 0, rate: Number(r.get('rate')) || 0 };
  });
}

// The collections that count: ended or saved, not discarded, not simulated.
function rateCollections_() {
  var out = {};
  readRows_(TABS.collections).forEach(function (q) {
    if (q.get('status') !== 'Collecting' && q.get('status') !== COLLECTION_DISCARDED && q.get('simulated') !== 'Yes') out[q.get('id')] = q;
  });
  return out;
}

// When each square was last cleaned: { square: ms }, from the counted
// collections' weighings, leaving one collection out, and only before a time.
function cleanedTimes_(counted, except, before) {
  var out = {};
  readRows_(TABS.stretches).forEach(function (q) {
    if (!counted[q.get('collection')] || q.get('collection') === except || q.get('discarded') === 'Yes') return;
    var t = q.get('ended') instanceof Date ? q.get('ended').getTime() : 0;
    if (!t || (before && t >= before)) return;
    String(q.get('cells')).split(/\s+/).filter(String).forEach(function (c) { if (!out[c] || out[c] < t) out[c] = t; });
  });
  return out;
}

// A square, or one next to it, in a set { square: anything }.
function nearSquares_(sq) {
  var p = String(sq).split('_'), r = Number(p[0]), c = Number(p[1]), out = [];
  for (var dr = -1; dr <= 1; dr++) for (var dc = -1; dc <= 1; dc++) out.push((r + dr) + '_' + (c + dc));
  return out;
}
function isNear_(set, sq) { return nearSquares_(sq).some(function (x) { return !!set[x]; }); }
// The latest time a square, or one next to it, was cleaned.
function nearTime_(times, sq) { return nearSquares_(sq).reduce(function (m, x) { return times[x] > m ? times[x] : m; }, 0); }

function mean_(list) { return list.length ? list.reduce(function (a, b) { return a + b; }, 0) / list.length : null; }
function median_(list) {
  if (!list.length) return null;
  var s = list.slice().sort(function (a, b) { return a - b; }), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/* ── Measuring a rate, once a walk's GPX track is saved ── */

// Each accepted segment this collection collected while it was due gets a
// rate from it (or the one it had, measured again).
function measureRates_(collectionId) {
  var counted = rateCollections_();
  var q = counted[collectionId];
  if (!q) return [];
  var started = q.get('started') instanceof Date ? q.get('started').getTime() : 0;
  var mine = readRows_(TABS.stretches).filter(function (s) { return s.get('collection') === collectionId && s.get('discarded') !== 'Yes'; });
  var walked = {}, collected = 0;
  mine.forEach(function (s) {
    String(s.get('cells')).split(/\s+/).filter(String).forEach(function (c) { walked[c] = true; });
    var t = s.get('ended') instanceof Date ? s.get('ended').getTime() : 0;
    if (t > collected) collected = t;
  });
  if (!collected) return [];
  var before = cleanedTimes_(counted, collectionId, started);
  var from = minutesSetting_(SETTING_DUE_FROM, 1), to = minutesSetting_(SETTING_DUE_TO, 4);
  var made = [];
  segmentsAll_().filter(function (g) { return g.accepted && g.squares.length && g.miles > 0; }).forEach(function (g) {
    var inSeg = {};
    g.squares.forEach(function (c) { inSeg[c] = true; });
    var covered = g.squares.filter(function (c) { return isNear_(walked, c); }).length / g.squares.length;
    if (covered < SEGMENT_COVER) return;
    // The weighings inside the segment: its own pounds (Q524).
    var lbs = 0, weighed = {}, any = false;
    mine.forEach(function (s) {
      var cells = String(s.get('cells')).split(/\s+/).filter(String);
      if (!cells.length || s.get('pounds') === '') return;
      var inside = cells.filter(function (c) { return isNear_(inSeg, c); }).length;
      if (inside / cells.length < 0.8) return;
      lbs += Number(s.get('pounds')) || 0;
      any = true;
      cells.forEach(function (c) { weighed[c] = true; });
    });
    if (!any || g.squares.filter(function (c) { return isNear_(weighed, c); }).length / g.squares.length < SEGMENT_COVER) return;
    // The days since each part was cleaned, a day being 24 hours.
    var days = [];
    g.squares.forEach(function (c) { var t = nearTime_(before, c); if (t) days.push((collected - t) / DAY_MS); });
    if (days.length < SEGMENT_COVER * g.squares.length) return;
    var d = mean_(days);
    if (d < from || d > to) return;
    made.push({ segment: g.id, pounds: round_(lbs, 2), miles: g.miles, days: round_(d, 2), rate: round_(lbs / g.miles / d, 3), covered: Math.round(covered * 100) });
  });
  var sheet = getDb_().getSheetByName(TABS.rates.name);
  var had = ratesAll_();
  made.forEach(function (m) {
    var row = blankRow_(TABS.rates);
    row[RATE_COL.segment - 1] = m.segment;
    row[RATE_COL.collection - 1] = collectionId;
    row[RATE_COL.collected - 1] = new Date(collected);
    row[RATE_COL.pounds - 1] = m.pounds;
    row[RATE_COL.miles - 1] = m.miles;
    row[RATE_COL.days - 1] = m.days;
    row[RATE_COL.rate - 1] = m.rate;
    row[RATE_COL.covered - 1] = m.covered;
    var old = had.filter(function (r) { return r.segment === m.segment && r.collection === collectionId; })[0];
    sheet.getRange(old ? old.row : lastRowWith_(sheet, 1) + 1, 1, 1, row.length).setValues([row]);
  });
  return made;
}

/* ── What the page shows ── */

// Every accepted segment with its rate, confidence and whether it's due:
// { id, name, squares, miles, rate, median, average, shows, count,
//   confidence, level, arrow, due, partly, days }.
function segmentSummaries_() {
  var now = Date.now();
  var counted = rateCollections_();
  var cleaned = cleanedTimes_(counted, '', 0);
  var rates = ratesAll_();
  var win = minutesSetting_(SETTING_RATE_WINDOW, 60) * DAY_MS;
  var low = minutesSetting_(SETTING_CONF_LOW, 2), moderate = minutesSetting_(SETTING_CONF_MODERATE, 5);
  var names = String(getSetting_(SETTING_CONF_NAMES) || '').split(',').map(function (t) { return t.trim(); });
  if (names.length !== 4 || names.some(function (t) { return !t; })) names = ['No recent rate', 'Low', 'Moderate', 'Established'];
  var shows = /^\s*a/i.test(getSetting_(SETTING_RATE_SHOWS)) ? 'Average' : /^\s*b/i.test(getSetting_(SETTING_RATE_SHOWS)) ? 'Both' : 'Median';
  var from = minutesSetting_(SETTING_DUE_FROM, 1), to = minutesSetting_(SETTING_DUE_TO, 4);
  var level = function (n) { return n === 0 ? 0 : n <= low ? 1 : n <= moderate ? 2 : 3; };
  return segmentsAll_().filter(function (g) { return g.accepted && g.squares.length; }).map(function (g) {
    var own = rates.filter(function (r) { return r.segment === g.id; });
    var recent = own.filter(function (r) { return now - r.collected <= win; }).map(function (r) { return r.rate; });
    // Two weeks ago, over the same length of window: the arrow's comparison.
    var then = now - 14 * DAY_MS;
    var earlier = own.filter(function (r) { return r.collected <= then && then - r.collected <= win; }).length;
    var med = median_(recent), avg = mean_(recent);
    var ages = g.squares.map(function (c) { var t = nearTime_(cleaned, c); return t ? (now - t) / DAY_MS : null; });
    var dueParts = ages.filter(function (a) { return a != null && a >= from && a <= to; }).length;
    var known = ages.filter(function (a) { return a != null; });
    var lv = level(recent.length);
    return { id: g.id, name: g.name, squares: g.squares, miles: g.miles,
      rate: shows === 'Average' ? avg : med, median: med == null ? null : round_(med, 3), average: avg == null ? null : round_(avg, 3), shows: shows,
      count: recent.length, confidence: names[lv], level: lv, arrow: recent.length > earlier ? 'up' : recent.length < earlier ? 'down' : 'level',
      due: dueParts >= SEGMENT_COVER * g.squares.length, partly: dueParts > 0 && dueParts < SEGMENT_COVER * g.squares.length,
      days: known.length ? round_(mean_(known), 1) : null };
  });
}

// Your plans (Q517), newest first, each with the segment proposed from it.
function myPlans_(accountId) {
  var segs = segmentsAll_();
  return readRows_(TABS.plans).filter(function (r) { return r.get('account') === accountId; }).map(function (r) {
    var p = planOf_(r);
    var g = segs.filter(function (s) { return s.plan === p.id; })[0];
    var cells = [];
    p.stretches.forEach(function (s) { s.cells.forEach(function (c) { if (cells.indexOf(c) === -1) cells.push(c); }); });
    return { id: p.id, created: p.created, cells: cells, miles: p.miles, used: p.collection && p.collection !== PLAN_REPLACED ? p.collection : '',
      replaced: p.collection === PLAN_REPLACED, segment: g ? { id: g.id, name: g.name, accepted: g.accepted } : null };
  }).reverse().slice(0, 50);
}
