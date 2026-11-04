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
 */

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

// The XP an account's approved segments earned.
function reviewXp_(accountId) {
  var mine = {};
  segmentsAll_().forEach(function (g) { if (g.by === accountId && g.accepted) mine[g.id] = true; });
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
