/**
 * Accepted segments and litter accumulation rates (S5-P3, authorized Oct 30,
 * with your M565, Q525 to Q527, and Q529 to Q534).
 *
 * - A player proposes one of their own plans as a segment; HABO's staff
 *   accept it by typing Yes in its Accepted column in the Segments tab (Q526,
 *   Q527). Only accepted segments build rates. Its Kind is Path, or Field for
 *   ground searched back and forth (Q533).
 * - A segment is cut into parts along its length, the part's size a setting
 *   (Q531). Each part remembers when it was last cleaned: the end of the
 *   latest weighing that came near every square of it. "Near" is a setting
 *   too (Q534).
 * - A walk collects a path segment when it comes near enough to the covered
 *   share of its squares, 90% to start (Q503, Q534), while the segment is
 *   due: its parts cleaned 1 to 4 days before on average, a day being 24
 *   hours (Q495, M529), each part's days counting for its length. Its rate
 *   is the pounds of the weighings inside it (80% inside to start) ÷ its
 *   miles ÷ those days (Q480, Q491, Q524).
 * - A field gives a rate from the ground searched both times, with no
 *   covered share: pounds ÷ miles walked there ÷ days (Q533).
 * - A segment's rate is the median of its rates in the window by default,
 *   or their average, or both (Q518). Its confidence comes from how many
 *   rates are in the window, with an arrow for which way that count is going
 *   (Q519, Q523).
 * - Partly cleaned (Q532): its parts grouped by the day they were cleaned,
 *   each group's share, its direction from the segment's middle, and days.
 * - Real walks and simulated walks are two worlds (Q529): a Head Builder's
 *   simulated walks clean and measure only among themselves, their rates
 *   marked Simulated, shown only in Head Builder mode. Discarded walks never
 *   count.
 */

var SEGMENT_COL = { id: 1, name: 2, by: 3, proposed: 4, plan: 5, squares: 6, miles: 7, accepted: 8, note: 9, kind: 10 };
var RATE_COL = { segment: 1, collection: 2, collected: 3, pounds: 4, miles: 5, days: 6, rate: 7, covered: 8, simulated: 9 };

var SETTING_DUE_FROM = 'Segment due from (days since cleaned)';
var SETTING_DUE_TO = 'Segment due until (days since cleaned)';
var SETTING_RATE_WINDOW = 'Rate window (days)';
var SETTING_RATE_SHOWS = 'Segment rate shows (Median, Average or Both)';
var SETTING_CONF_LOW = 'Confidence Low up to (rates in the window)';
var SETTING_CONF_MODERATE = 'Confidence Moderate up to (rates in the window)';
var SETTING_CONF_NAMES = 'Confidence names';
var SETTING_RATE_TOP = 'Rate map top (lb per mile per day)';
var SETTING_PART_M = 'Part of a segment (m)';
var SETTING_COVER = 'Segment collected when covered (%)';
var SETTING_INSIDE = 'A weighing counts for a segment when inside (%)';
var SETTING_NEAR = 'Near enough to a segment (m)';
var SEGMENT_SETTINGS = [
  [SETTING_DUE_FROM, '1'], [SETTING_DUE_TO, '4'], [SETTING_RATE_WINDOW, '60'], [SETTING_RATE_SHOWS, 'Median'],
  [SETTING_CONF_LOW, '2'], [SETTING_CONF_MODERATE, '5'], [SETTING_CONF_NAMES, 'No recent rate, Low, Moderate, Established'],
  [SETTING_RATE_TOP, '5'], [SETTING_PART_M, '10'], [SETTING_COVER, '90'], [SETTING_INSIDE, '80'], [SETTING_NEAR, '15']
];
var DAY_MS = 86400000;
var COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/* ── Called from the page ── */

// Proposes one of your own plans as a segment, for HABO's staff to accept.
function segmentPropose_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var plan = planById_(clean_(req.planId, 20));
  if (!plan || plan.account !== account.id) throw new Error('That plan isn\'t yours, or isn\'t here any more.');
  var name = clean_(req.name, 80) || 'From plan ' + plan.id;
  // Path or Field, asked when proposing (Oct 31, field first); HABO's staff can change it in the Sheet.
  var kind = /^\s*f/i.test(String(req.kind || '')) ? 'Field' : 'Path';
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
    row[SEGMENT_COL.kind - 1] = kind;
    sheet.getRange(lastRowWith_(sheet, 1) + 1, 1, 1, row.length).setValues([row]);
    logChange_(account.email, 'Segment', id, 'Proposed', '', name + ' (from ' + plan.id + ', ' + kind + ')');
    return { plans: myPlans_(account.id) };
  });
}

// Measure again (Oct 31, field first): a saved walk's segment rates worked
// out again, with the Settings and each segment's Kind as they are now. Each
// segment it gives a rate replaces that segment's row for this walk.
function measureAgain_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var id = clean_(req.collectionId, 20);
  return withLock_(function () {
    var col = readCollection_(id);
    if (!col || col.account !== account.id) throw new Error('That collection isn\'t yours, or isn\'t here any more.');
    if (col.status === 'Collecting' || col.status === COLLECTION_DISCARDED) throw new Error('Only an ended collection can be measured again.');
    if (!(col.track && col.track.length > 1)) throw new Error('Its GPX track isn\'t saved, and a rate is measured from it.');
    var made = measureRates_(col.id);
    var names = {};
    segmentsAll_().forEach(function (g) { names[g.id] = g.name; });
    logChange_(account.email, 'Segment rates', col.id, 'Measured again', '', made.map(function (m) { return m.segment + ' ' + m.rate; }).join(', ') || 'none');
    return { measured: made.map(function (m) { return { segment: m.segment, name: names[m.segment] || m.segment, rate: m.rate }; }),
      segments: segmentSummaries_(false), simSegments: segmentSummaries_(true) };
  });
}

/* ── Reading ── */

function segmentsAll_() {
  return readRows_(TABS.segments).map(function (r) {
    var p = r.get('proposed');
    return { row: r.row, id: r.get('id'), name: r.get('name'), by: r.get('by'), proposed: p instanceof Date ? p.getTime() : 0, plan: r.get('plan'),
      squares: String(r.get('squares')).split(/\s+/).filter(function (c) { return /^-?\d+_-?\d+$/.test(c); }),
      miles: Number(r.get('miles')) || 0, accepted: /^\s*y/i.test(r.get('accepted')), note: r.get('note'),
      kind: /^\s*f/i.test(r.get('kind')) ? 'Field' : 'Path' };
  });
}

function ratesAll_() {
  return readRows_(TABS.rates).map(function (r) {
    var t = r.get('collected');
    return { row: r.row, segment: r.get('segment'), collection: r.get('collection'), collected: t instanceof Date ? t.getTime() : 0,
      pounds: Number(r.get('pounds')) || 0, days: Number(r.get('days')) || 0, rate: Number(r.get('rate')) || 0, simulated: /^\s*y/i.test(r.get('simulated')) };
  });
}

// The collections of one world (Q529): real ones, or simulated ones; ended
// or saved, not discarded.
function rateCollections_(sim) {
  var out = {};
  readRows_(TABS.collections).forEach(function (q) {
    if (q.get('status') !== 'Collecting' && q.get('status') !== COLLECTION_DISCARDED && (q.get('simulated') === 'Yes') === !!sim) out[q.get('id')] = q;
  });
  return out;
}

// When each square was last cleaned: { square: ms }, from those collections'
// weighings, leaving one collection out, and only before a time.
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

// The rules, from the Settings tab.
function segmentRules_() {
  var cell = LitterGeo.CELL_M;
  return { from: minutesSetting_(SETTING_DUE_FROM, 1), to: minutesSetting_(SETTING_DUE_TO, 4),
    part: Math.max(1, Math.round(minutesSetting_(SETTING_PART_M, 10) / cell)),
    cover: Math.min(100, minutesSetting_(SETTING_COVER, 90)) / 100, inside: Math.min(100, minutesSetting_(SETTING_INSIDE, 80)) / 100,
    near: Math.max(0, Math.round(minutesSetting_(SETTING_NEAR, 15) / cell)) };
}

// A square and those within `r` squares of it.
function nearSquares_(sq, r) {
  var p = String(sq).split('_'), row = Number(p[0]), col = Number(p[1]), out = [];
  for (var dr = -r; dr <= r; dr++) for (var dc = -r; dc <= r; dc++) out.push((row + dr) + '_' + (col + dc));
  return out;
}
function isNear_(set, sq, r) { return nearSquares_(sq, r).some(function (x) { return !!set[x]; }); }
// The latest time a square, or one near it, was cleaned.
function nearTime_(times, sq, r) { return nearSquares_(sq, r).reduce(function (m, x) { return times[x] > m ? times[x] : m; }, 0); }

// A segment's parts, in order along it.
function partsOf_(g, size) {
  var out = [];
  for (var i = 0; i < g.squares.length; i += size) out.push(g.squares.slice(i, i + size));
  return out;
}
// When a part was last cleaned: when every square of it last was (0: never).
function partTime_(times, part, r) {
  return part.reduce(function (m, sq) { var t = nearTime_(times, sq, r); return Math.min(m, t); }, Infinity) || 0;
}

function mean_(list) { return list.length ? list.reduce(function (a, b) { return a + b; }, 0) / list.length : null; }
function median_(list) {
  if (!list.length) return null;
  var s = list.slice().sort(function (a, b) { return a - b; }), m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

// The compass point from the middle of `all` to the middle of `some` (Q532).
function directionOf_(all, some) {
  var mid = function (list) {
    var r = 0, c = 0;
    list.forEach(function (sq) { var p = sq.split('_'); r += Number(p[0]); c += Number(p[1]); });
    return { r: r / list.length, c: c / list.length };
  };
  var a = mid(all), b = mid(some);
  if (Math.abs(b.r - a.r) < 0.5 && Math.abs(b.c - a.c) < 0.5) return '';
  var deg = Math.atan2(b.c - a.c, b.r - a.r) * 180 / Math.PI;
  return COMPASS[Math.round(((deg + 360) % 360) / 45) % 8];
}

/* ── Measuring a rate, once a walk's GPX track is saved ── */

// Each accepted segment this collection collected while it was due gets a
// rate from it (or the one it had, measured again), in its own world.
function measureRates_(collectionId) {
  var q = readRows_(TABS.collections).filter(function (x) { return x.get('id') === collectionId; })[0];
  if (!q || q.get('status') === 'Collecting' || q.get('status') === COLLECTION_DISCARDED) return [];
  var sim = q.get('simulated') === 'Yes';
  var counted = rateCollections_(sim);
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
  var k = segmentRules_();
  var made = [];
  segmentsAll_().filter(function (g) { return g.accepted && g.squares.length; }).forEach(function (g) {
    var inSeg = {};
    g.squares.forEach(function (c) { inSeg[c] = true; });
    // The weighings inside the segment: its own pounds (Q524).
    var lbs = 0, miles = 0, weighed = {}, any = false;
    mine.forEach(function (s) {
      var cells = String(s.get('cells')).split(/\s+/).filter(String);
      if (!cells.length || s.get('pounds') === '') return;
      if (cells.filter(function (c) { return isNear_(inSeg, c, k.near); }).length / cells.length < k.inside) return;
      lbs += Number(s.get('pounds')) || 0;
      miles += (Number(s.get('streetMi')) || 0) + (Number(s.get('offMi')) || 0);
      any = true;
      cells.forEach(function (c) { weighed[c] = true; });
    });
    if (!any) return;
    var parts = partsOf_(g, k.part);
    var nearWalk = function (part) { return part.every(function (c) { return isNear_(walked, c, k.near); }); };
    var days = [], covered, rate;
    if (g.kind === 'Field') {
      // The ground searched both times (Q533): this walk's parts of the field
      // that were cleaned 1 to 4 days before.
      parts.forEach(function (p) {
        var t = partTime_(before, p, k.near), age = (collected - t) / DAY_MS;
        if (t && nearWalk(p) && age >= k.from && age <= k.to) days.push(age);
      });
      if (!days.length || !(miles > 0)) return;
      covered = days.length / parts.length;
    } else {
      covered = g.squares.filter(function (c) { return isNear_(walked, c, k.near); }).length / g.squares.length;
      if (covered < k.cover || !(g.miles > 0)) return;
      if (g.squares.filter(function (c) { return isNear_(weighed, c, k.near); }).length / g.squares.length < k.cover) return;
      parts.forEach(function (p) { var t = partTime_(before, p, k.near); if (t) days.push((collected - t) / DAY_MS); });
      if (days.length < k.cover * parts.length) return;
    }
    var d = mean_(days);
    if (d < k.from || d > k.to) return;
    rate = lbs / (g.kind === 'Field' ? miles : g.miles) / d;
    made.push({ segment: g.id, pounds: round_(lbs, 2), miles: round_(g.kind === 'Field' ? miles : g.miles, 3), days: round_(d, 2), rate: round_(rate, 3),
      covered: Math.round(covered * 100) });
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
    row[RATE_COL.simulated - 1] = sim ? 'Yes' : '';
    var old = had.filter(function (r) { return r.segment === m.segment && r.collection === collectionId; })[0];
    sheet.getRange(old ? old.row : lastRowWith_(sheet, 1) + 1, 1, 1, row.length).setValues([row]);
  });
  return made;
}

/* ── What the page shows ── */

// Every accepted segment with its rate, confidence, whether it's due, and
// how it was partly cleaned, in one world: { id, name, kind, squares, miles,
// rate, median, average, shows, count, confidence, level, arrow, due, partly,
// days, groups: [{ pct, dir, days }] }.
function segmentSummaries_(sim) {
  var now = Date.now();
  var cleaned = cleanedTimes_(rateCollections_(sim), '', 0);
  var rates = ratesAll_().filter(function (r) { return r.simulated === !!sim; });
  var k = segmentRules_();
  var win = minutesSetting_(SETTING_RATE_WINDOW, 60) * DAY_MS;
  var low = minutesSetting_(SETTING_CONF_LOW, 2), moderate = minutesSetting_(SETTING_CONF_MODERATE, 5);
  var names = String(getSetting_(SETTING_CONF_NAMES) || '').split(',').map(function (t) { return t.trim(); });
  if (names.length !== 4 || names.some(function (t) { return !t; })) names = ['No recent rate', 'Low', 'Moderate', 'Established'];
  var shows = /^\s*a/i.test(getSetting_(SETTING_RATE_SHOWS)) ? 'Average' : /^\s*b/i.test(getSetting_(SETTING_RATE_SHOWS)) ? 'Both' : 'Median';
  var level = function (n) { return n === 0 ? 0 : n <= low ? 1 : n <= moderate ? 2 : 3; };
  return segmentsAll_().filter(function (g) { return g.accepted && g.squares.length; }).map(function (g) {
    var own = rates.filter(function (r) { return r.segment === g.id; });
    var recent = own.filter(function (r) { return now - r.collected <= win; }).map(function (r) { return r.rate; });
    // Two weeks ago, over the same length of window: the arrow's comparison.
    var then = now - 14 * DAY_MS;
    var earlier = own.filter(function (r) { return r.collected <= then && then - r.collected <= win; }).length;
    var med = median_(recent), avg = mean_(recent);
    var parts = partsOf_(g, k.part);
    var ages = parts.map(function (p) { var t = partTime_(cleaned, p, k.near); return t ? (now - t) / DAY_MS : null; });
    var known = ages.filter(function (a) { return a != null; });
    var d = mean_(known);
    // Partly cleaned (Q532): the parts grouped by the day they were cleaned.
    var byDay = {};
    ages.forEach(function (a, i) { var key = a == null ? 'never' : String(Math.floor(a)); (byDay[key] = byDay[key] || []).push(parts[i]); });
    var keys = Object.keys(byDay);
    var groups = keys.length < 2 ? [] : keys.map(function (key) {
      var sq = [].concat.apply([], byDay[key]);
      return { pct: Math.round(byDay[key].length / parts.length * 100), dir: directionOf_(g.squares, sq), days: key === 'never' ? null : Number(key) };
    }).sort(function (a, b) { return (a.days == null ? 1e9 : a.days) - (b.days == null ? 1e9 : b.days); });
    var lv = level(recent.length);
    return { id: g.id, name: g.name, kind: g.kind, squares: g.squares, miles: g.miles,
      rate: shows === 'Average' ? avg : med, median: med == null ? null : round_(med, 3), average: avg == null ? null : round_(avg, 3), shows: shows,
      count: recent.length, confidence: names[lv], level: lv, arrow: recent.length > earlier ? 'up' : recent.length < earlier ? 'down' : 'level',
      due: d != null && known.length >= k.cover * parts.length && d >= k.from && d <= k.to, partly: groups.length > 0,
      days: d == null ? null : round_(d, 1), groups: groups };
  });
}

// Your plans (Q517), newest first, each with the segment proposed from it,
// its name (Oct 31), and how many collections it started and when last.
// Deleted plans leave the list.
function myPlans_(accountId) {
  var segs = segmentsAll_();
  var uses = {};
  readRows_(TABS.collections).forEach(function (q) {
    if (q.get('account') !== accountId || q.get('status') === 'Collecting' || q.get('status') === COLLECTION_DISCARDED || !q.get('plan')) return;
    var t = q.get('started') instanceof Date ? q.get('started').getTime() : 0;
    var u = uses[q.get('plan')] = uses[q.get('plan')] || { n: 0, last: 0 };
    u.n++;
    if (t > u.last) u.last = t;
  });
  return readRows_(TABS.plans).filter(function (r) { return r.get('account') === accountId && !r.get('deleted'); }).map(function (r) {
    var p = planOf_(r);
    var g = segs.filter(function (s) { return s.plan === p.id; })[0];
    var cells = [];
    p.stretches.forEach(function (s) { s.cells.forEach(function (c) { if (cells.indexOf(c) === -1) cells.push(c); }); });
    var u = uses[p.id] || { n: 0, last: 0 };
    return { id: p.id, created: p.created, name: p.name, cells: cells, miles: p.miles, used: u.n, lastUsed: u.last,
      segment: g ? { id: g.id, name: g.name, accepted: g.accepted } : null };
  }).reverse().slice(0, 50);
}
