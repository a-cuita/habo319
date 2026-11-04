/**
 * Reviews (S5-P19 B, |Q584, |Q593 (a), Nov 3): the admin board's first part.
 * In Admin Mode, a Reviews screen lists each segment submitted to be public.
 * An Apprentice recommends Approve or Decline, with a note and the XP it
 * should earn: up to 15 (|Q578), a setting. A Builder or above approves or
 * declines it. Approve makes it public, in place of typing Yes under Accepted
 * in the Segments tab, and gives whoever submitted it that XP. Decline writes
 * Declined there, with its note for the player, who can submit it again.
 * Every move is a row in the Reviews tab: when, which segment, who and their
 * rank, the move, the XP and the note, like History on the Build Board.
 *
 * Additions (S5-U17, |M711): ground a player walked off their plan, asked to
 * be added to a public segment it touches. Each is a row in the Segment
 * additions tab, reviewed the same way; Approve adds its squares to the
 * segment, at the end they join, and its miles, and gives the player the XP.
 */
var ADDITION_COL = { id: 1, segment: 2, by: 3, asked: 4, squares: 5, miles: 6, note: 7, state: 8 };

function additionsAll_() {
  return readRows_(TABS.additions, ADDITION_COL).map(function (r) {
    var t = r.get('asked');
    return { row: r.row, id: r.get('id'), segment: r.get('segment'), by: r.get('by'), asked: t instanceof Date ? t.getTime() : 0,
      squares: String(r.get('squares')).split(/\s+/).filter(function (c) { return /^-?\d+_-?\d+$/.test(c); }), miles: Number(r.get('miles')) || 0,
      note: r.get('note'), state: r.get('state') || 'Waiting' };
  }).filter(function (a) { return a.id; });
}

// A player asks for a piece of ground to be added to a public segment.
function additionAsk_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var cells = cleanCells_(req.cells);
  if (cells.length < 2) throw new Error('That piece is too small to add.');
  var miles = round_(milesValue_(req.miles || 0), 3), note = clean_(req.note, 500);
  return withLock_(function () {
    var g = segmentsAll_().filter(function (x) { return x.id === clean_(req.segmentId, 20) && x.accepted; })[0];
    if (!g) throw new Error('That isn\'t a public segment, or isn\'t here any more.');
    if (!cells.some(function (c) { return isNear_(arraySet_(g.squares), c, 2); })) throw new Error('That piece doesn\'t touch ' + g.name + '.');
    var sheet = getDb_().getSheetByName(TABS.additions.name);
    var id = nextId_('AD', additionsAll_().map(function (a) { return a.id; }));
    var row = blankRow_(TABS.additions);
    row[ADDITION_COL.id - 1] = id; row[ADDITION_COL.segment - 1] = g.id; row[ADDITION_COL.by - 1] = account.id; row[ADDITION_COL.asked - 1] = new Date();
    row[ADDITION_COL.squares - 1] = cells.join(' '); row[ADDITION_COL.miles - 1] = miles; row[ADDITION_COL.note - 1] = note; row[ADDITION_COL.state - 1] = 'Waiting';
    sheet.getRange(lastRowWith_(sheet, 1) + 1, 1, 1, row.length).setValues([row]);
    logChange_(account.email, 'Segment addition', id, 'Asked', '', cells.length + ' squares for ' + g.id);
    return { id: id, segment: g.name };
  });
}
function arraySet_(list) { var o = {}; list.forEach(function (x) { o[x] = true; }); return o; }

// A segment's squares with an addition's: at the end they join, in order.
function addedSquares_(g, cells) {
  var have = arraySet_(g.squares), add = cells.filter(function (c) { return !have[c]; });
  if (!add.length) return g.squares.slice();
  var first = g.squares[0], last = g.squares[g.squares.length - 1];
  var d = function (a, b) { return LitterGeo.dist(LitterGeo.centerXY(a), LitterGeo.centerXY(b)); };
  // Its end nearest the segment's first square goes next to it.
  var toFirst = Math.min(d(add[0], first), d(add[add.length - 1], first)), toLast = Math.min(d(add[0], last), d(add[add.length - 1], last));
  if (toFirst < toLast) {
    if (d(add[0], first) < d(add[add.length - 1], first)) add.reverse();
    return add.concat(g.squares);
  }
  if (d(add[add.length - 1], last) < d(add[0], last)) add.reverse();
  return g.squares.concat(add);
}

var SETTING_REVIEW_XP = 'Most XP for a segment approved to be public';
var REVIEW_COL = { time: 1, segment: 2, by: 3, rank: 4, move: 5, xp: 6, note: 7 };
var REVIEW_RECOMMEND = { Approve: 'Recommends Approve', Decline: 'Recommends Decline' };
var REVIEW_DECIDE = { approve: 'Approved', decline: 'Declined' };
var REVIEW_SHOWN_DAYS = 30;   // decided reviews stay on the screen this long

function reviewRows_() {
  return readRows_(TABS.reviews, REVIEW_COL).map(function (r) {
    var t = r.get('time');
    return { time: t instanceof Date ? t.getTime() : 0, segment: String(r.get('segment')).trim(), by: String(r.get('by')).trim(), rank: String(r.get('rank')).trim(),
      move: String(r.get('move')).trim(), xp: r.get('xp') === '' ? null : Number(r.get('xp')) || 0, note: String(r.get('note') || '') };
  }).filter(function (x) { return x.segment; });
}

// What a player sees of their segment's review: approved with its XP, or
// declined with its note; or null while it waits.
function reviewOutcome_(segmentId) {
  var last = reviewRows_().filter(function (x) { return x.segment === segmentId && (x.move === REVIEW_DECIDE.approve || x.move === REVIEW_DECIDE.decline); }).pop();
  return last ? { move: last.move, xp: last.xp || 0, note: last.note, time: last.time } : null;
}

// The XP an account's approved segments and additions earned.
function reviewXp_(accountId) {
  var mine = {};
  segmentsAll_().forEach(function (g) { if (g.by === accountId && g.accepted) mine[g.id] = true; });
  additionsAll_().forEach(function (a) { if (a.by === accountId && a.state === 'Added') mine[a.id] = true; });
  var given = {};
  reviewRows_().forEach(function (x) { if (mine[x.segment] && x.move === REVIEW_DECIDE.approve) given[x.segment] = x.xp || 0; });
  return Object.keys(given).reduce(function (t, k) { return t + given[k]; }, 0);
}

function reviewMaxXp_() { return minutesSetting_(SETTING_REVIEW_XP, 15); }

// The Reviews screen: each segment waiting, then each decided in the last
// 30 days, with every move on it.
function reviewsLoad_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!account.rank) throw new Error('Reviews are for HABO\'s admins.');
  return reviewsView_(account);
}

function reviewsView_(account) {
  var handles = {};
  readAccounts_().forEach(function (a) { handles[a.id] = a.handle || a.first; });
  var rows = reviewRows_(), now = Date.now();
  var list = segmentsAll_().filter(function (g) { return g.by; }).map(function (g) {
    var moves = rows.filter(function (x) { return x.segment === g.id; });
    var decided = moves.filter(function (x) { return x.move === REVIEW_DECIDE.approve || x.move === REVIEW_DECIDE.decline; }).pop();
    var rec = moves.filter(function (x) { return x.move === REVIEW_RECOMMEND.Approve || x.move === REVIEW_RECOMMEND.Decline; }).pop();
    var state = g.accepted ? 'Approved' : g.declined ? 'Declined' : rec ? 'Recommended' : 'New';
    return { id: g.id, name: g.name, kind: g.kind, squares: g.squares, outline: g.outline, miles: g.miles, by: handles[g.by] || g.by, proposed: g.proposed,
      state: state, recommendedXp: rec ? rec.xp : null, decidedAt: decided ? decided.time : 0, open: !g.accepted && !g.declined,
      moves: moves.map(function (x) { return { time: x.time, by: x.by, rank: x.rank, move: x.move, xp: x.xp, note: x.note }; }) };
  }).filter(function (r) { return r.open || (r.decidedAt && now - r.decidedAt <= REVIEW_SHOWN_DAYS * DAY_MS); });
  var segs = {};
  segmentsAll_().forEach(function (g) { segs[g.id] = g; });
  additionsAll_().forEach(function (a) {
    var g = segs[a.segment] || { name: a.segment, squares: [], kind: 'Path' };
    var moves = rows.filter(function (x) { return x.segment === a.id; });
    var decided = moves.filter(function (x) { return x.move === REVIEW_DECIDE.approve || x.move === REVIEW_DECIDE.decline; }).pop();
    var rec = moves.filter(function (x) { return x.move === REVIEW_RECOMMEND.Approve || x.move === REVIEW_RECOMMEND.Decline; }).pop();
    var open = a.state === 'Waiting';
    var item = { id: a.id, addition: true, name: 'Add to ' + g.name, target: g.id, targetSquares: g.squares, kind: g.kind, squares: a.squares, outline: [], miles: a.miles,
      by: handles[a.by] || a.by, proposed: a.asked, askNote: a.note, state: open ? (rec ? 'Recommended' : 'New') : a.state, recommendedXp: rec ? rec.xp : null,
      decidedAt: decided ? decided.time : 0, open: open, moves: moves.map(function (x) { return { time: x.time, by: x.by, rank: x.rank, move: x.move, xp: x.xp, note: x.note }; }) };
    if (open || (item.decidedAt && now - item.decidedAt <= REVIEW_SHOWN_DAYS * DAY_MS)) list.push(item);
  });
  list.sort(function (a, b) { return (b.open - a.open) || (a.open ? a.proposed - b.proposed : b.decidedAt - a.decidedAt); });
  return { reviews: list, rank: account.rank, maxXp: reviewMaxXp_(), canDecide: rankAtLeast_(account.rank, 'Builder') };
}

// A move on a review: an Apprentice's recommendation, or a Builder or
// above's Approve or Decline.
function reviewMove_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!account.rank) throw new Error('Reviews are for HABO\'s admins.');
  var kind = String(req.move || ''), note = clean_(req.note, 1000), max = reviewMaxXp_();
  var xp = req.xp === '' || req.xp == null ? null : Number(req.xp);
  if (xp != null && (!isFinite(xp) || xp < 0 || xp > max)) throw new Error('The XP is from 0 to ' + max + '.');
  var move;
  if (kind === 'recommend') {
    move = REVIEW_RECOMMEND[String(req.recommend || '')];
    if (!move) throw new Error('Recommend Approve or Decline.');
    if (move === REVIEW_RECOMMEND.Approve && xp == null) throw new Error('Say the XP it should earn, from 0 to ' + max + '.');
  } else if (kind === 'approve' || kind === 'decline') {
    if (!rankAtLeast_(account.rank, 'Builder')) throw new Error('A Builder or above approves or declines; an Apprentice recommends.');
    move = REVIEW_DECIDE[kind];
    if (kind === 'approve' && xp == null) throw new Error('Say the XP it earns, from 0 to ' + max + '.');
    if (kind === 'decline' && !note) throw new Error('Say why in the note: the player sees it.');
  } else throw new Error('That isn\'t a move on a review.');
  if (/^AD\d+$/.test(String(req.segmentId || ''))) return additionMove_(account, String(req.segmentId), kind, move, xp, note);
  return withLock_(function () {
    var g = segmentsAll_().filter(function (x) { return x.id === clean_(req.segmentId, 20); })[0];
    if (!g) throw new Error('That segment isn\'t here any more.');
    if (g.accepted || g.declined) throw new Error(g.name + ' was ' + (g.accepted ? 'approved' : 'declined') + ' already. Reload the screen.');
    var sheet = getDb_().getSheetByName(TABS.reviews.name);
    var row = blankRow_(TABS.reviews);
    row[REVIEW_COL.time - 1] = new Date(); row[REVIEW_COL.segment - 1] = g.id; row[REVIEW_COL.by - 1] = account.handle || account.email;
    row[REVIEW_COL.rank - 1] = account.rank; row[REVIEW_COL.move - 1] = move; row[REVIEW_COL.xp - 1] = xp == null || kind === 'decline' ? '' : xp; row[REVIEW_COL.note - 1] = note;
    sheet.getRange(lastRowWith_(sheet, REVIEW_COL.segment) + 1, 1, 1, row.length).setValues([row]);
    if (kind === 'approve' || kind === 'decline') {
      var segs = getDb_().getSheetByName(TABS.segments.name);
      var before = String(segs.getRange(g.row, SEGMENT_COL.accepted).getValue());
      var after = kind === 'approve' ? 'Yes' : 'Declined';
      segs.getRange(g.row, SEGMENT_COL.accepted).setValue(after);
      logChange_(account.email, 'Segment', g.id, 'Accepted', before, after + (kind === 'approve' ? ' (' + xp + ' XP)' : '') + ', in a review');
      // An approved segment builds rates from every walk already on it.
      if (kind === 'approve') measureWorld_(false, '');
    }
    return reviewsView_(account);
  });
}

function additionMove_(account, id, kind, move, xp, note) {
  return withLock_(function () {
    var a = additionsAll_().filter(function (x) { return x.id === id; })[0];
    if (!a) throw new Error('That addition isn\'t here any more.');
    if (a.state !== 'Waiting') throw new Error('That addition was ' + a.state.toLowerCase() + ' already. Reload the screen.');
    var sheet = getDb_().getSheetByName(TABS.reviews.name);
    var row = blankRow_(TABS.reviews);
    row[REVIEW_COL.time - 1] = new Date(); row[REVIEW_COL.segment - 1] = a.id; row[REVIEW_COL.by - 1] = account.handle || account.email;
    row[REVIEW_COL.rank - 1] = account.rank; row[REVIEW_COL.move - 1] = move; row[REVIEW_COL.xp - 1] = xp == null || kind === 'decline' ? '' : xp; row[REVIEW_COL.note - 1] = note;
    sheet.getRange(lastRowWith_(sheet, REVIEW_COL.segment) + 1, 1, 1, row.length).setValues([row]);
    if (kind === 'approve' || kind === 'decline') {
      var adds = getDb_().getSheetByName(TABS.additions.name);
      adds.getRange(a.row, ADDITION_COL.state).setValue(kind === 'approve' ? 'Added' : 'Declined');
      if (kind === 'approve') {
        var g = segmentsAll_().filter(function (x) { return x.id === a.segment; })[0];
        if (!g) throw new Error('Its segment isn\'t here any more.');
        var squares = addedSquares_(g, a.squares), segs = getDb_().getSheetByName(TABS.segments.name);
        segs.getRange(g.row, SEGMENT_COL.squares).setNumberFormat('@').setValue(squares.join(' '));
        segs.getRange(g.row, SEGMENT_COL.miles).setValue(round_(g.miles + a.miles, 2));
        logChange_(account.email, 'Segment', g.id, 'Squares', g.squares.length + ' squares, ' + g.miles + ' mi', squares.length + ' squares, ' + round_(g.miles + a.miles, 2) + ' mi, with ' + a.id + ' (' + xp + ' XP)');
        measureWorld_(false, '');
      } else logChange_(account.email, 'Segment addition', a.id, 'State', 'Waiting', 'Declined');
    }
    return reviewsView_(account);
  });
}
