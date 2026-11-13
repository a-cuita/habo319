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
 * - Your 24-hour rule (S5-P13, |M710, |Q598 (a), Nov 3): a path segment
 *   has a clock. The first walk that collects it starts it. A walk under 24
 *   hours later (a setting) is a pickup: no rate, the clock runs on, and its
 *   pounds go into the next rate. A walk from 24 hours to "Segment due
 *   until" measures a rate over the whole time since the clock started, and
 *   starts it again. Later than that is a Rate Reset: no rate, and the clock
 *   starts again. Every walk's rates were measured again by this rule once;
 *   a rate it doesn't give is kept, marked Not counted, and left out of the
 *   median. "Segment due from" now only puts a segment on the Priority list.
 *   Pieces (Q537, Q540 (a)): walks that each clean part of a path, each
 *   within 24 hours of the one before (a setting), add up to one full
 *   collection when together they cover it, at the last piece's time, with
 *   all their pounds. "Finish it" shows a piece still adding up, once it's
 *   25% of the segment (a setting).
 * - Fields as areas (S5-P13 part 2, |Q600 (a), Nov 3): a field is the ground
 *   inside its outline (corners drawn on the map), or inside its squares
 *   when it has none. Your track scans 15 m each side (a setting), and a walk
 *   collects the field when it scans 70% of it (a setting). Walking past
 *   outside scans almost none of it. Fields then go by the same clock and
 *   pieces as paths. A field's miles are the walk it takes to scan all of it:
 *   its area ÷ twice the reach.
 * - Real walks and simulated walks are two worlds (Q529): a Head Builder's
 *   simulated walks clean and measure only among themselves, their rates
 *   marked Simulated, shown only in Head Builder mode. Discarded walks never
 *   count.
 */

var SEGMENT_COL = { id: 1, name: 2, by: 3, proposed: 4, plan: 5, squares: 6, miles: 7, accepted: 8, note: 9, kind: 10, outline: 11 };
var RATE_COL = { segment: 1, collection: 2, collected: 3, pounds: 4, miles: 5, days: 6, rate: 7, covered: 8, simulated: 9, notCounted: 10 };

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
// A walk's plan with segments farther apart than this gets a notice (S5-P9, Q545, Q558).
var SETTING_APART = 'Plan segments far apart (mi)';
var SETTING_MIN_GAP = 'Shortest gap for a rate (hours)';   // S5-P13, Q598 (a)
var SETTING_PIECES = 'Pieces add up within (hours)';       // S5-P13, Q537, Q540 (a)
var SETTING_FINISH = 'Finish it shows from (% cleaned)';   // S5-P13: smaller brushes don't show
var SETTING_REACH = 'A track scans each side (m)';         // S5-P13 part 2, |Q600 (a)
var SETTING_FIELD_COVER = 'Field collected when scanned (%)';
var SEGMENT_SETTINGS = [
  [SETTING_DUE_FROM, '1'], [SETTING_DUE_TO, '4'], [SETTING_RATE_WINDOW, '60'], [SETTING_RATE_SHOWS, 'Median'],
  [SETTING_CONF_LOW, '2'], [SETTING_CONF_MODERATE, '5'], [SETTING_CONF_NAMES, 'No recent rate, Low, Moderate, Established'],
  [SETTING_RATE_TOP, '5'], [SETTING_PART_M, '10'], [SETTING_COVER, '90'], [SETTING_INSIDE, '80'], [SETTING_NEAR, '15'], [SETTING_APART, '1'], [SETTING_MIN_GAP, '24'], [SETTING_PIECES, '24'], [SETTING_FINISH, '25'],
  [SETTING_REACH, '15'], [SETTING_FIELD_COVER, '70']
];
var DAY_MS = 86400000;
var COMPASS = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];

/* ── Called from the page ── */

// Proposes one of your own plans as a segment, for HABO's staff to accept.
function segmentPropose_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  requireSkill_(account, 'submit');   // a Litter Class Skill (S5-P29)
  var plan = planById_(clean_(req.planId, 20));
  if (!plan || plan.account !== account.id) throw new Error('That plan isn\'t yours, or isn\'t here any more.');
  var name = clean_(req.name, 80) || 'From plan ' + plan.id;
  // Path or Field, asked when proposing (Oct 31, field first); HABO's staff can change it in the Sheet.
  var kind = /^\s*f/i.test(String(req.kind || '')) ? 'Field' : 'Path';
  return withLock_(function () {
    // A plan declined in a review can be submitted again (S5-P19 B).
    var had = segmentsAll_().filter(function (s) { return s.plan === plan.id && !s.declined; })[0];
    if (had) throw new Error('That plan is already proposed, as ' + had.id + '.');
    var squares = [];
    plan.stretches.forEach(function (s) { s.cells.forEach(function (c) { if (squares.indexOf(c) === -1) squares.push(c); }); });
    // A field's corners, drawn on the map (S5-P13 part 2, |Q600 (a)): its
    // ground is inside them, and its squares are the ones that ground is in.
    // A field drawn by its corners as a private segment brings them (S5-P19, |C788).
    var corners = kind === 'Field' ? fieldCorners_(Array.isArray(req.outline) && req.outline.length ? req.outline : plan.outline) : [];
    var miles;
    if (corners.length) {
      var ground = fieldGround_({ outline: corners, squares: [] }, segmentRules_());
      squares = Object.keys(ground.cells);
      miles = ground.miles;
    } else miles = LitterGeo.segmentMiles(LitterGeo.fieldPoints({ squares: squares }), segmentRules_().reach);
    var sheet = getDb_().getSheetByName(TABS.segments.name);
    var id = nextId_('SG', segmentsAll_().map(function (s) { return s.id; }));
    var row = blankRow_(TABS.segments);
    row[SEGMENT_COL.id - 1] = id;
    row[SEGMENT_COL.name - 1] = name;
    row[SEGMENT_COL.by - 1] = account.id;
    row[SEGMENT_COL.proposed - 1] = new Date();
    row[SEGMENT_COL.plan - 1] = plan.id;
    row[SEGMENT_COL.squares - 1] = squaresPack_(squares.join(' '));
    row[SEGMENT_COL.miles - 1] = round_(miles, 2);
    row[SEGMENT_COL.kind - 1] = kind;
    row[SEGMENT_COL.outline - 1] = corners.length ? outlineText_(corners) : '';
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
  // A Head Builder's action only (S5-P13, Q555), as with the Simulated walk switch.
  if (account.rank !== 'Head Builder') throw new Error('Only a Head Builder can measure a walk again.');
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
      segments: segmentSummaries_(false), simSegments: segmentSummaries_(true, account.id) };
  });
}

/* ── Reading ── */

function segmentsAll_() {
  return readRows_(TABS.segments).map(function (r) {
    var p = r.get('proposed');
    return { row: r.row, id: r.get('id'), name: r.get('name'), by: r.get('by'), proposed: p instanceof Date ? p.getTime() : 0, plan: r.get('plan'),
      squares: String(r.get('squares')).split(/\s+/).filter(function (c) { return /^-?\d+_-?\d+$/.test(c); }),
      miles: Number(r.get('miles')) || 0, accepted: /^\s*y/i.test(r.get('accepted')), declined: /^\s*d/i.test(r.get('accepted')), note: r.get('note'),
      kind: /^\s*f/i.test(r.get('kind')) ? 'Field' : 'Path', outline: parseOutline_(r.get('outline')) };
  });
}

// A field's outline, "lat,lon;lat,lon;…", as its corners in order.
function parseOutline_(v) {
  return String(v || '').split(';').map(function (p) { var a = p.split(','); return [Number(a[0]), Number(a[1])]; })
    .filter(function (p) { return isFinite(p[0]) && isFinite(p[1]) && p[0] !== 0 && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180; });
}
function outlineText_(corners) { return corners.map(function (c) { return Number(c[0]).toFixed(6) + ',' + Number(c[1]).toFixed(6); }).join(';'); }

function ratesAll_() {
  return readRows_(TABS.rates).map(function (r) {
    var t = r.get('collected');
    return { row: r.row, segment: r.get('segment'), collection: r.get('collection'), collected: t instanceof Date ? t.getTime() : 0,
      pounds: Number(r.get('pounds')) || 0, days: Number(r.get('days')) || 0, rate: Number(r.get('rate')) || 0, simulated: /^\s*y/i.test(r.get('simulated')),
      notCounted: String(r.get('notCounted') || '').trim() };
  });
}

// The collections of one world (Q529): real ones, or simulated ones; ended
// or saved, not discarded. A simulated world is one admin's own (S5-U2,
// Nov 3): their simulated walks, and any another admin shared.
function rateCollections_(sim, accountId) {
  var out = {};
  readRows_(TABS.collections).forEach(function (q) {
    if (q.get('status') === 'Collecting' || q.get('status') === COLLECTION_DISCARDED) return;
    if (!sim ? q.get('simulated') !== 'Yes' : simAllowed_(accountId, q)) out[q.get('id')] = q;
  });
  return out;
}

// When each square was last cleaned: { square: ms }, from those collections'
// weighings, leaving one collection out, and only before a time.
function cleanedTimes_(counted, except, before, rows) {
  var out = {};
  (rows || readRows_(TABS.stretches)).forEach(function (q) {
    if (!counted[q.get('collection')] || q.get('collection') === except || q.get('discarded') === 'Yes') return;
    var t = q.get('ended') instanceof Date ? q.get('ended').getTime() : 0;
    if (!t || (before && t >= before)) return;
    String(q.get('cells')).split(/\s+/).filter(String).forEach(function (c) { if (!out[c] || out[c] < t) out[c] = t; });
  });
  return out;
}

// When each of a segment's squares was last cleaned by a walk that
// collected it, for its Partial lines (S5-P10, |Q622 (a)): only a weighing
// with most of its squares inside the segment counts, so a walk that passed
// an end, or crossed at a corner, doesn't mark it cleaned. { square: ms }.
function cleanedInside_(g, walks, k) {
  var inSeg = {}, others = otherSquares_(g), out = {};
  g.squares.forEach(function (c) { inSeg[c] = true; });
  var nearSeg = function (c) { return isNear_(inSeg, c, k.near); };
  Object.keys(walks).forEach(function (id) {
    var w = walks[id];
    if (!w.t) return;
    w.weighings.forEach(function (x) {
      if (!x.cells.length) return;
      var cells = weighingCells_(w, x, nearSeg, others, k);
      if (!cells.length || cells.filter(nearSeg).length / cells.length < k.inside) return;
      cells.forEach(function (c) { if (nearSeg(c) && (!out[c] || out[c] < w.t)) out[c] = w.t; });
    });
  });
  return out;
}

// The rules, from the Settings tab.
function segmentRules_() {
  var cell = LitterGeo.CELL_M;
  return { from: minutesSetting_(SETTING_DUE_FROM, 1), to: minutesSetting_(SETTING_DUE_TO, 4), minGapH: minutesSetting_(SETTING_MIN_GAP, 24),
    piecesH: minutesSetting_(SETTING_PIECES, 24), finishFrom: Math.min(100, minutesSetting_(SETTING_FINISH, 25)) / 100,
    part: Math.max(1, Math.round(minutesSetting_(SETTING_PART_M, 10) / cell)),
    cover: Math.min(100, minutesSetting_(SETTING_COVER, 90)) / 100, inside: Math.min(100, minutesSetting_(SETTING_INSIDE, 80)) / 100,
    near: Math.max(0, Math.round(minutesSetting_(SETTING_NEAR, 15) / cell)),
    reach: Math.max(1, minutesSetting_(SETTING_REACH, 15)), fieldCover: Math.min(100, minutesSetting_(SETTING_FIELD_COVER, 70)) / 100 };
}

// A field's ground (S5-P13 part 2): its points, the squares they fall in,
// and its miles: the walk it takes to scan all of it.
function fieldGround_(g, k) {
  var pts = LitterGeo.fieldPoints({ outline: g.outline, squares: g.squares });
  var cells = {};
  pts.forEach(function (p) { cells[LitterGeo.cellOfXY(p)] = true; });
  return { pts: pts, cells: cells, miles: LitterGeo.segmentMiles(pts, k.reach) };
}

// A segment's miles, one rule for paths and fields (S6-U25 item 3, |Q723 (a)):
// the walk it takes to scan all of it, or its length down its middle,
// whichever is longer (Geo.js). Worked out once a run for each segment.
var segMilesMemo_ = {};
function segmentMiles_(g, k) {
  var key = g.id + '|' + g.squares.length + '|' + (g.outline || []).length + '|' + k.reach;
  if (segMilesMemo_[key] == null) segMilesMemo_[key] = LitterGeo.segmentMiles(LitterGeo.fieldPoints({ outline: g.outline, squares: g.squares }), k.reach);
  return segMilesMemo_[key];
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

// The walks of one world, from their weighings: { id: { id, t (its last
// weighing's end), walked: { square }, weighings: [{ cells, lbs, miles }] } }.
function worldWalks_(counted, rows) {
  var out = {};
  rows.forEach(function (s) {
    var id = s.get('collection');
    if (!counted[id] || s.get('discarded') === 'Yes') return;
    var w = out[id] = out[id] || { id: id, t: 0, walked: {}, weighings: [], track: parseTrack_(counted[id].get('track')), scans: {} };
    var cells = String(s.get('cells')).split(/\s+/).filter(String);
    cells.forEach(function (c) { w.walked[c] = true; });
    var t = s.get('ended') instanceof Date ? s.get('ended').getTime() : 0;
    if (t > w.t) w.t = t;
    w.weighings.push({ n: Number(s.get('n')) || 0, cells: cells, lbs: s.get('pounds') === '' ? null : Number(s.get('pounds')) || 0,
      miles: (Number(s.get('streetMi')) || 0) + (Number(s.get('offMi')) || 0) });
  });
  return out;
}

// A weighing's cells that count for a segment (S5-U2, |C714). A walk's first
// weighing, before anything was weighed, starts where the walk first reached
// its first segment: the bag was empty until then, so the page doesn't ask
// you to weigh there. Only when the way there touched no other segment: if it
// did, that one was first, and the weighing counts whole. Every later
// weighing counts whole.
function weighingCells_(w, x, near, others, k) {
  var first = w.weighings.reduce(function (m, y) { return y.cells.length && y.lbs != null && y.n < m ? y.n : m; }, Infinity);
  if (x.n !== first) return x.cells;
  for (var i = 0; i < x.cells.length; i++) {
    if (near(x.cells[i])) return x.cells.slice(i);
    if (isNear_(others, x.cells[i], k.near)) return x.cells;
  }
  return [];
}
// The squares of every other accepted segment, for weighingCells_.
function otherSquares_(g) {
  var out = {};
  segmentsAll_().forEach(function (o) { if (o.accepted && o.id !== g.id) o.squares.forEach(function (c) { out[c] = true; }); });
  return out;
}

// What a walk did on a path segment: collected it, when it came near enough
// to its covered share (90% to start), with the pounds of its weighings
// inside it (80% inside); `known` when those weighings cover it too. Or null.
function pathEvent_(g, w, k, inSeg, piece, others) {
  var covered = g.squares.filter(function (c) { return isNear_(w.walked, c, k.near); }).length / g.squares.length;
  if (!w.t || !covered || (covered < k.cover && !piece)) return null;
  var lbs = 0, weighed = {};
  var nearSeg = function (c) { return isNear_(inSeg, c, k.near); };
  w.weighings.forEach(function (x) {
    if (!x.cells.length || x.lbs == null) return;
    var cells = weighingCells_(w, x, nearSeg, others || {}, k);
    if (!cells.length || cells.filter(nearSeg).length / cells.length < k.inside) return;
    lbs += x.lbs;
    cells.forEach(function (c) { weighed[c] = true; });
  });
  var known = g.squares.filter(function (c) { return isNear_(weighed, c, k.near); }).length / g.squares.length >= k.cover;
  return { id: w.id, t: w.t, lbs: lbs, known: known, covered: covered, walked: w.walked, weighed: weighed };
}

// What a walk did on a field (S5-P13 part 2, |Q600 (a)): the share of its
// ground the walk's track scanned, `reach` metres each side, and the pounds of
// its weighings inside the field (80% inside, or near enough to it, as for a
// path). `known` as for a path: those
// weighings' squares, scanning the same reach, cover as much of it as
// collects it. A walk with no saved track scans from the squares it walked.
// Or null.
function fieldEvent_(g, w, k, ground, piece, others) {
  if (!w.scans[g.id]) {
    var track = w.track && w.track.length > 1 ? w.track : null;
    w.scans[g.id] = track ? LitterGeo.fieldScan(ground.pts, track, k.reach) : ground.pts.map(function (p) {
      return Object.keys(w.walked).some(function (c) { var m = LitterGeo.centerXY(c); return LitterGeo.dist(p, m) <= k.reach; }) ? 1 : 0;
    });
  }
  var scan = w.scans[g.id], covered = LitterGeo.scanShare(scan);
  if (!w.t || !covered || (covered < k.fieldCover && !piece)) return null;
  var lbs = 0, weighed = [];
  var nearField = function (c) { return isNear_(ground.cells, c, k.near); };
  w.weighings.forEach(function (x) {
    if (!x.cells.length || x.lbs == null) return;
    var cells = weighingCells_(w, x, nearField, others || {}, k);
    if (!cells.length || cells.filter(nearField).length / cells.length < k.inside) return;
    lbs += x.lbs;
    cells.forEach(function (c) { weighed.push(LitterGeo.centerXY(c)); });
  });
  // A weighed square scans from anywhere in it: its middle, plus half its diagonal.
  var r = k.reach + LitterGeo.CELL_M * 0.71;
  var wscan = ground.pts.map(function (p) { return weighed.some(function (m) { return LitterGeo.dist(p, m) <= r; }) ? 1 : 0; });
  var known = LitterGeo.scanShare(wscan) >= k.fieldCover;
  return { id: w.id, t: w.t, lbs: lbs, known: known, covered: covered, scan: scan, wscan: wscan };
}

// The walks that collected a segment, in time order: full ones, and pieces
// that add up to one (Q540 (a)): each piece within "Pieces add up within" of
// the one before, together covering it, at the last piece's time, with all
// their pounds. A path is covered square by square; a field by the share of
// its ground scanned. Also the pieces still adding up: { events, pending }.
function segmentCollections_(g, walks, k, ground) {
  var field = g.kind === 'Field', cover = field ? k.fieldCover : k.cover, inSeg = {};
  g.squares.forEach(function (c) { inSeg[c] = true; });
  var others = otherSquares_(g);
  var all = Object.keys(walks).map(function (id) { return field ? fieldEvent_(g, walks[id], k, ground, true, others) : pathEvent_(g, walks[id], k, inSeg, true, others); })
    .filter(Boolean).sort(function (a, b) { return a.t - b.t; });
  var out = [], group = [];
  var share = function (list, key) {
    if (field) return LitterGeo.scanShare(list.map(function (e) { return key === 'walked' ? e.scan : e.wscan; }));
    return g.squares.filter(function (c) { return list.some(function (e) { return isNear_(e[key], c, k.near); }); }).length / g.squares.length;
  };
  all.forEach(function (e) {
    if (e.covered >= cover) { group = []; out.push(e); return; }
    if (group.length && e.t - group[group.length - 1].t > k.piecesH * 3600000) group = [];
    group.push(e);
    var covered = share(group, 'walked');
    if (covered >= cover) {
      out.push({ id: e.id, t: e.t, lbs: group.reduce(function (s, x) { return s + x.lbs; }, 0), known: share(group, 'weighed') >= cover,
        covered: covered, pieces: group.map(function (x) { return x.id; }) });
      group = [];
    }
  });
  return { events: out, pending: group, pendingShare: group.length ? share(group, 'walked') : 0 };
}

// A segment's walks in time order, through its clock (S5-P13, |Q598): each
// marked start, pickup (into: the walk its pounds went to), rate, unknown (no
// rate: some pounds weren't weighed inside it) or reset. A field's miles are
// the walk it takes to scan all of it.
function pathSequence_(g, walks, k) {
  var ground = g.kind === 'Field' ? fieldGround_(g, k) : null;
  var miles = ground ? ground.miles : segmentMiles_(g, k);
  var found = segmentCollections_(g, walks, k, ground);
  var events = found.events;
  var clock = null, carry = 0, carryKnown = true, waiting = [];
  var settle = function (into) { waiting.forEach(function (e) { e.into = into; }); waiting = []; carry = 0; carryKnown = true; };
  events.forEach(function (e) {
    if (clock == null) { e.result = 'start'; clock = e.t; settle(null); return; }
    var days = (e.t - clock) / DAY_MS;
    e.since = days;
    if (days > k.to) { e.result = 'reset'; settle(e.id); clock = e.t; return; }
    if (days * 24 < k.minGapH) { e.result = 'pickup'; carry += e.lbs; carryKnown = carryKnown && e.known; waiting.push(e); return; }
    if (e.known && carryKnown && miles > 0) { e.result = 'rate'; e.days = days; e.pounds = carry + e.lbs; e.rate = e.pounds / miles / days; }
    else e.result = 'unknown';
    settle(e.id);
    clock = e.t;
  });
  return { events: events, clock: clock, pending: found.pending, pendingShare: found.pendingShare, miles: miles, ground: ground };
}

// Why a walk gives a path segment no rate, for the Not counted column.
function notCountedWhy_(e, k) {
  var h = Math.round(k.minGapH);
  if (e.result === 'pickup') return 'Under ' + h + ' hours after the clock started' + (e.into ? ': its pounds went into ' + e.into + '.' : ': its pounds go into the next rate.');
  if (e.result === 'start') return 'It started the clock: the first collection, with no earlier one to measure from.';
  if (e.result === 'reset') return 'Rate Reset: more than ' + k.to + ' days after the clock started, so it started the clock again.';
  if (e.result === 'unknown') return 'Not all its pounds were weighed inside the segment.';
  return 'No rate by the ' + h + '-hour rule.';
}

// Every rate in one world, measured again by the rules as they are now, and
// written to the Segment rates tab: one row for each segment and walk, and a
// walk that gives a segment no rate keeps its row, marked Not counted, with
// why. A simulated world writes only its own walks' rows. Returns the rates.
function measureWorld_(sim, owner) {
  var counted = rateCollections_(sim, owner);
  var rows = readRows_(TABS.stretches);
  var walks = worldWalks_(counted, rows);
  var k = segmentRules_();
  var made = [], why = {};
  segmentsAll_().filter(function (g) { return g.accepted && g.squares.length; }).forEach(function (g) {
    var seq = pathSequence_(g, walks, k);
    seq.events.forEach(function (e) {
      (e.pieces || []).forEach(function (pid) { if (pid !== e.id) why[g.id + '|' + pid] = 'A piece: it adds up with the others to one collection, ending with ' + e.id + ', which holds its pounds.'; });
      if (e.result === 'rate') made.push({ segment: g.id, collection: e.id, collected: e.t, pounds: round_(e.pounds, 2), miles: round_(seq.miles, 3), days: round_(e.days, 2), rate: round_(e.rate, 3), covered: Math.round(e.covered * 100) });
      else why[g.id + '|' + e.id] = notCountedWhy_(e, k);
    });
  });
  var own = function (id) { return !!counted[id] && (!sim || counted[id].get('account') === owner); };
  var sheet = getDb_().getSheetByName(TABS.rates.name);
  var had = ratesAll_().filter(function (r) { return r.simulated === !!sim && own(r.collection); });
  var key = function (seg, col) { return seg + '|' + col; };
  var given = {};
  made.filter(function (m) { return own(m.collection); }).forEach(function (m) {
    given[key(m.segment, m.collection)] = true;
    var row = blankRow_(TABS.rates);
    row[RATE_COL.segment - 1] = m.segment; row[RATE_COL.collection - 1] = m.collection; row[RATE_COL.collected - 1] = new Date(m.collected);
    row[RATE_COL.pounds - 1] = m.pounds; row[RATE_COL.miles - 1] = m.miles; row[RATE_COL.days - 1] = m.days; row[RATE_COL.rate - 1] = m.rate;
    row[RATE_COL.covered - 1] = m.covered; row[RATE_COL.simulated - 1] = sim ? 'Yes' : ''; row[RATE_COL.notCounted - 1] = '';
    var old = had.filter(function (r) { return r.segment === m.segment && r.collection === m.collection; })[0];
    sheet.getRange(old ? old.row : lastRowWith_(sheet, 1) + 1, 1, 1, row.length).setValues([row]);
  });
  had.forEach(function (r) {
    if (given[key(r.segment, r.collection)]) return;
    var text = why[key(r.segment, r.collection)] || 'No rate by the rules as they are now.';
    if (r.notCounted !== text) sheet.getRange(r.row, RATE_COL.notCounted).setValue(text);
  });
  forgetReads_();   // what it wrote is read fresh after (S6-P1)
  return made;
}

// Each accepted segment this collection collected gets its rate, if it gives
// one, by the rules as they are now, with every other walk in its world
// measured again so pickups and clocks line up. Returns this walk's rates.
function measureRates_(collectionId) {
  var q = readRows_(TABS.collections).filter(function (x) { return x.get('id') === collectionId; })[0];
  if (!q || q.get('status') === 'Collecting' || q.get('status') === COLLECTION_DISCARDED) return [];
  return measureWorld_(q.get('simulated') === 'Yes', q.get('account')).filter(function (m) { return m.collection === collectionId; });
}

// Once (S5-P13, |Q598 (a), your "(a)" Nov 3): every walk's rates measured
// again by the 24-hour rule, in the real world and each admin's simulated one.
function ratesRuleOnce_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('RATES_24H')) return;
  measureWorld_(false, '');
  var owners = {};
  readRows_(TABS.collections).forEach(function (q) { if (q.get('simulated') === 'Yes') owners[q.get('account')] = true; });
  Object.keys(owners).forEach(function (a) { measureWorld_(true, a); });
  props.setProperty('RATES_24H', new Date().toISOString());
}

// A field's corners from the page: 3 to 60 of them, making ground of at
// least one point and at most about a square mile. Throws if not.
function fieldCorners_(list) {
  var corners = (Array.isArray(list) ? list : []).filter(function (p) {
    return Array.isArray(p) && isFinite(p[0]) && isFinite(p[1]) && Math.abs(p[0]) <= 90 && Math.abs(p[1]) <= 180 && p[0] !== 0;
  }).map(function (p) { return [Number(p[0]), Number(p[1])]; });
  if (!corners.length) return [];
  if (corners.length < 3) throw new Error('A field needs at least 3 corners.');
  if (corners.length > 60) throw new Error('A field can have at most 60 corners.');
  var pts = LitterGeo.fieldPoints({ outline: corners });
  if (!pts.length) throw new Error('Those corners hold no ground: spread them out a little.');
  if (LitterGeo.fieldArea(pts) > LitterGeo.MILE_M * LitterGeo.MILE_M) throw new Error('That field is bigger than a square mile: draw a smaller one.');
  return corners;
}

// A Head Builder, in Admin Mode, draws a field's corners again (S5-P13 part
// 2): its ground, squares and miles follow, and every walk's rates are
// measured again by the new ground.
function fieldOutline_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (account.rank !== 'Head Builder') throw new Error('Only a Head Builder can draw a field again.');
  var corners = fieldCorners_(req.outline);
  if (!corners.length) throw new Error('Draw the field\'s corners first.');
  return withLock_(function () {
    var g = segmentsAll_().filter(function (x) { return x.id === clean_(req.segmentId, 20); })[0];
    if (!g || g.kind !== 'Field') throw new Error('That isn\'t a field, or isn\'t here any more.');
    var ground = fieldGround_({ outline: corners, squares: [] }, segmentRules_());
    var sheet = getDb_().getSheetByName(TABS.segments.name);
    sheet.getRange(g.row, SEGMENT_COL.squares).setNumberFormat('@').setValue(squaresPack_(Object.keys(ground.cells).join(' ')));
    sheet.getRange(g.row, SEGMENT_COL.miles).setValue(round_(ground.miles, 2));
    sheet.getRange(g.row, SEGMENT_COL.outline).setNumberFormat('@').setValue(outlineText_(corners));
    logChange_(account.email, 'Segment', g.id, 'Outline', g.outline.length ? g.outline.length + ' corners' : g.squares.length + ' squares', corners.length + ' corners');
    measureWorld_(false, '');
    return { segments: segmentSummaries_(false), simSegments: segmentSummaries_(true, account.id) };
  });
}

// Once (S5-P13 part 2): each field's miles become the walk it takes to scan
// all of it, and every walk's rates are measured again with fields as areas.
// Once (S6-U25 item 3, |Q723 (a)): every segment's miles by the one rule,
// and every walk's rates measured again with them.
function milesOneRuleOnce_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('MILES_ONE_RULE')) return;
  var k = segmentRules_(), sheet = getDb_().getSheetByName(TABS.segments.name);
  segmentsAll_().filter(function (g) { return g.squares.length; }).forEach(function (g) {
    var miles = round_(segmentMiles_(g, k), 2);
    if (miles !== g.miles) { sheet.getRange(g.row, SEGMENT_COL.miles).setValue(miles); logChange_('Miles by one rule', 'Segment', g.id, 'Miles', g.miles, miles); }
  });
  measureWorld_(false, '');
  var owners = {};
  readRows_(TABS.collections).forEach(function (q) { if (q.get('simulated') === 'Yes') owners[q.get('account')] = true; });
  Object.keys(owners).forEach(function (a) { measureWorld_(true, a); });
  props.setProperty('MILES_ONE_RULE', new Date().toISOString());
}

function fieldsAreaOnce_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('FIELDS_AREA')) return;
  var k = segmentRules_(), sheet = getDb_().getSheetByName(TABS.segments.name);
  segmentsAll_().filter(function (g) { return g.kind === 'Field' && g.squares.length; }).forEach(function (g) {
    var miles = round_(fieldGround_(g, k).miles, 2);
    if (miles !== g.miles) { sheet.getRange(g.row, SEGMENT_COL.miles).setValue(miles); logChange_('Fields as areas', 'Segment', g.id, 'Miles', g.miles, miles); }
  });
  measureWorld_(false, '');
  var owners = {};
  readRows_(TABS.collections).forEach(function (q) { if (q.get('simulated') === 'Yes') owners[q.get('account')] = true; });
  Object.keys(owners).forEach(function (a) { measureWorld_(true, a); });
  props.setProperty('FIELDS_AREA', new Date().toISOString());
}

/* ── What the page shows ── */

// Every accepted segment with its rate, confidence, whether it's due, and
// how it was partly cleaned, in one world: { id, name, kind, squares, miles,
// rate, median, average, shows, count, confidence, level, arrow, due, partly,
// days, groups: [{ pct, dir, days }] }.
// `range` (Maps, S6-U26, |Q724 (a), |Q725 (a)): the days chosen, { since, until }
// in ms; a segment's rate and the walks behind it come from those days, not
// the rate window.
function segmentSummaries_(sim, accountId, range) {
  if (sim && !accountId) return [];   // a simulated world is always someone's
  // Kept between requests until something's written (S6-P1, kept_ in Code.js).
  var key = 'segments:' + (sim ? 'sim:' + accountId : 'public') + (range ? ':' + range.since + '-' + range.until : '');
  return kept_(key, function () { return segmentSummariesWorked_(sim, accountId, range); });
}
function segmentSummariesWorked_(sim, accountId, range) {
  var now = Date.now();
  var counted = rateCollections_(sim, accountId);
  var rows = readRows_(TABS.stretches);
  var walks = worldWalks_(counted, rows);
  // Each walk's weighings with a Litter Index, oldest first, for the map's table.
  var stretchesOf = {};
  rows.filter(function (q) { return counted[q.get('collection')] && q.get('discarded') !== 'Yes' && q.get('index') !== ''; })
    .sort(function (a, b) { return (a.get('ended') instanceof Date ? a.get('ended').getTime() : 0) - (b.get('ended') instanceof Date ? b.get('ended').getTime() : 0); })
    .forEach(function (q) { (stretchesOf[q.get('collection')] = stretchesOf[q.get('collection')] || []).push(q); });
  // Rates the 24-hour rule doesn't give are kept, but not counted (S5-P13).
  var allRates = ratesAll_().filter(function (r) { return r.simulated === !!sim && (!sim || !!counted[r.collection]); });
  var rates = allRates.filter(function (r) { return !r.notCounted; });
  // Who collected each walk, as the public map shows them (S5-P10, |M650).
  var shown = {};
  readAccounts_().forEach(function (a) { shown[a.id] = a.shows === 'Name' ? (a.first + ' ' + a.last).trim() : a.shows === 'Neither' ? '' : a.handle; });
  var k = segmentRules_();
  var win = minutesSetting_(SETTING_RATE_WINDOW, 60) * DAY_MS;
  // When each square was last collected, for the left-alone bonus (S6-P3 item 4).
  var lastClean = cleanedTimes_(counted, null, null, rows);
  var low = minutesSetting_(SETTING_CONF_LOW, 2), moderate = minutesSetting_(SETTING_CONF_MODERATE, 5);
  var names = String(getSetting_(SETTING_CONF_NAMES) || '').split(',').map(function (t) { return t.trim(); });
  if (names.length !== 4 || names.some(function (t) { return !t; })) names = ['No recent rate', 'Low', 'Moderate', 'Established'];
  var shows = /^\s*a/i.test(getSetting_(SETTING_RATE_SHOWS)) ? 'Average' : /^\s*b/i.test(getSetting_(SETTING_RATE_SHOWS)) ? 'Both' : 'Median';
  var level = function (n) { return n === 0 ? 0 : n <= low ? 1 : n <= moderate ? 2 : 3; };
  return segmentsAll_().filter(function (g) { return g.accepted && g.squares.length; }).map(function (g) {
    var own = rates.filter(function (r) { return r.segment === g.id; });
    var inside = function (r) { return range ? r.collected >= range.since && r.collected < range.until : now - r.collected <= win; };
    var recentRows = own.filter(inside);
    var recent = recentRows.map(function (r) { return r.rate; });
    // The walks that gave it a rate in the window, newest first, for the map's pop-up (|M650);
    // and how many there were not counted (S5-P13).
    // With each walk's Litter Index on this segment's squares, for the same
    // table on the Litter Index layer (|Q624 (a), |Q625).
    var onSeg = {};
    g.squares.forEach(function (c) { onSeg[c] = true; });
    var walksGave = recentRows.slice().sort(function (a, b) { return b.collected - a.collected; }).map(function (r) {
      var q = counted[r.collection], who = q ? shown[q.get('account')] : '';
      var idx = {};
      (stretchesOf[r.collection] || []).forEach(function (st) {
        String(st.get('cells')).split(/\s+/).forEach(function (c) { if (onSeg[c]) idx[c] = round_(Number(st.get('index')), 1); });
      });
      return { collected: r.collected, rate: r.rate, by: who || 'a volunteer', idx: idx };
    });
    var notCountedN = allRates.filter(function (r) { return r.segment === g.id && r.notCounted && inside(r); }).length;
    // Two weeks ago, over the same length of window: the arrow's comparison.
    var then = now - 14 * DAY_MS;
    var earlier = own.filter(function (r) { return r.collected <= then && then - r.collected <= win; }).length;
    var med = median_(recent), avg = mean_(recent);
    var parts = partsOf_(g, k.part);
    var mine = cleanedInside_(g, walks, k);
    var ages = parts.map(function (p) { var t = partTime_(mine, p, k.near); return t ? (now - t) / DAY_MS : null; });
    var known = ages.filter(function (a) { return a != null; });
    var d = mean_(known);
    // Days since its clock started (S5-P13), not the parts' average, for a
    // path and, as an area, a field (part 2). Finish it: the share cleaned
    // (a field: scanned) since then by walks that didn't collect all of it.
    var finish = 0, finishLeft = null;
    var seq = pathSequence_(g, walks, k);
    d = seq.clock ? (now - seq.clock) / DAY_MS : null;
    // Walks in the window that collected it but gave it no rate, newest
    // first, each with why (S6-P34, |Q782 (a)): greyed in the pop-up, with a
    // link to the Wiki's page on why.
    var noRate = seq.events.filter(function (e) { return e.result !== 'rate' && inside({ collected: e.t }); }).sort(function (a, b) { return b.t - a.t; }).map(function (e) {
      var q = counted[e.id], who = q ? shown[q.get('account')] : '', idx = {};
      (stretchesOf[e.id] || []).forEach(function (st) {
        String(st.get('cells')).split(/\s+/).forEach(function (c) { if (onSeg[c]) idx[c] = round_(Number(st.get('index')), 1); });
      });
      return { collected: e.t, by: who || 'a volunteer', why: notCountedWhy_(e, k), idx: idx };
    });
    // Finish it: pieces still adding up, the last within "Pieces add up within" (Q540).
    var lastPiece = seq.pending.length ? seq.pending[seq.pending.length - 1].t : 0;
    if (lastPiece && now - lastPiece <= k.piecesH * 3600000 && seq.pendingShare >= k.finishFrom) {
      finish = Math.round(seq.pendingShare * 100);
      finishLeft = round_((k.piecesH * 3600000 - (now - lastPiece)) / 3600000, 1);
    }
    // Partly cleaned (Q532): the parts grouped by the day they were cleaned.
    var byDay = {};
    ages.forEach(function (a, i) { var key = a == null ? 'never' : String(Math.floor(a)); (byDay[key] = byDay[key] || []).push(parts[i]); });
    var keys = Object.keys(byDay);
    // A field is an area: its squares don't measure it, so no Partial lines (|Q623 (a)).
    var groups = keys.length < 2 || g.kind === 'Field' ? [] : keys.map(function (key) {
      var sq = [].concat.apply([], byDay[key]);
      return { pct: Math.round(byDay[key].length / parts.length * 100), dir: directionOf_(g.squares, sq), days: key === 'never' ? null : Number(key) };
    }).sort(function (a, b) { return (a.days == null ? 1e9 : a.days) - (b.days == null ? 1e9 : b.days); });
    var lv = level(recent.length);
    return { id: g.id, name: g.name, kind: g.kind, squares: g.squares, miles: round_(seq.miles, 3), outline: g.kind === 'Field' ? g.outline : [],
      rate: shows === 'Average' ? avg : med, median: med == null ? null : round_(med, 3), average: avg == null ? null : round_(avg, 3), shows: shows,
      count: recent.length, confidence: names[lv], level: lv, arrow: recent.length > earlier ? 'up' : recent.length < earlier ? 'down' : 'level',
      due: d != null && d >= k.from && d <= k.to, partly: groups.length > 0, finish: finish, finishLeft: finishLeft,
      days: d == null ? null : round_(d, 1), groups: groups,
      // For The Priority Segment List (S5-P10): days left before it's past
      // "Segment due until", and whether it's past it already.
      left: d == null ? null : round_(k.to - d, 1), past: d != null && d > k.to, walks: walksGave, noRate: noRate, notCounted: notCountedN,
      // Days since any of its squares was collected (null: never), for the left-alone bonus.
      alone: (function () { var t = g.squares.reduce(function (m, c) { return Math.max(m, lastClean[c] || 0); }, 0); return t ? round_((now - t) / DAY_MS, 1) : null; })() };
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
    // A walk's plan lists its segments (S5-P9): each private one counts it.
    String(q.get('plan')).split(/\s+/).filter(String).forEach(function (id) {
      var u = uses[id] = uses[id] || { n: 0, last: 0 };
      u.n++;
      if (t > u.last) u.last = t;
    });
  });
  return readRows_(TABS.plans).filter(function (r) { return r.get('account') === accountId && !r.get('deleted'); }).map(function (r) {
    var p = planOf_(r);
    // Its latest submission: one declined is shown until it's submitted again.
    var g = segs.filter(function (s) { return s.plan === p.id; }).pop();
    var cells = [];
    p.stretches.forEach(function (s) { s.cells.forEach(function (c) { if (cells.indexOf(c) === -1) cells.push(c); }); });
    var u = uses[p.id] || { n: 0, last: 0 };
    return { id: p.id, created: p.created, name: p.name, cells: cells, miles: p.miles, used: u.n, lastUsed: u.last, kind: p.kind, outline: p.outline,
      segment: g ? { id: g.id, name: g.name, accepted: g.accepted, proposed: g.proposed, declined: g.declined, review: reviewOutcome_(g.id) } : null };
  }).reverse().slice(0, 50);
}
