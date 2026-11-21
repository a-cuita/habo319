/**
 * XP written down when it's earned, in each player's own tab (S7-P1, from
 * |M1050, |Q730 (a), |Q731, and |Q744 to |Q761).
 *
 * Each player has a tab of their own in the litter Sheet, named by their
 * account ID, like "XP A001" (|Q755 (b), |Q756 (a), |Q761 (a)). Its top rows
 * say who they are and their running totals, as Sheet formulas over the rows
 * below (|Q753 (c), |Q758 (b)); below them, a row each time XP is earned:
 * when, what for, how much, and which walk, with no limit.
 *
 * XP is written once, when it's earned, and every place that shows XP reads
 * it (item 6). A change to an XP setting counts from then on (|Q730 (a)):
 * what earned XP keeps the settings it was earned under, kept on its first
 * row. A walk fixed afterwards gets a row for the difference (|Q744 (a)). A
 * level once reached is kept, even if the level table changes (|Q745 (a)).
 *
 * How: xpSettle_ works out what each thing a player did has earned (a walk,
 * a step of the first quest, a segment made public, a skill approved, a
 * Challenge, a Quest finished, a badge), each by a key of its own, and
 * writes a row for any difference from what their tab already has. So it's
 * called after anything that can earn XP, and writes nothing twice.
 *
 * Accounts keeps each player's total and level too, for anything about
 * everyone at once (item 7, |Q754).
 */

var XP_TAB_PREFIX = 'XP ';
var XP_HEAD = ['When', 'Kind', 'What for', 'XP', 'Walk', 'Pounds', 'Miles', 'Level', 'Key', 'Detail'];
var XP_COL = { at: 1, kind: 2, say: 3, xp: 4, walk: 5, lb: 6, mi: 7, level: 8, key: 9, detail: 10 };
var XP_TOP = 11;   // the top block, its last row the headings of the rows below
var XP_WIDTHS = [140, 110, 460, 70, 70, 70, 70, 60, 150, 300];

function xpTabName_(accountId) { return XP_TAB_PREFIX + accountId; }
function colLetter_(n) {
  var s = '';
  while (n > 0) { var m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

// The top block: who they are, looked up in Accounts by their ID, and their
// totals, added up from the rows below.
function xpTopBlock_(accountId) {
  var id = colLetter_(ACCOUNT_COL.id);
  var acc = function (k) { var L = colLetter_(ACCOUNT_COL[k]); return 'INDEX(Accounts!' + L + ':' + L + ', MATCH($B$1, Accounts!' + id + ':' + id + ', 0))'; };
  var below = function (k) { var L = colLetter_(XP_COL[k]); return L + (XP_TOP + 1) + ':' + L; };
  return [
    ['Account ID', accountId],
    ['Name', '=IFERROR(' + acc('first') + ' & " " & ' + acc('last') + ', "")'],
    ['Handle', '=IFERROR(' + acc('handle') + ', "")'],
    ['Status or rank', '=IFERROR(' + acc('status') + ', "")'],
    ['XP', '=ROUND(SUM(' + below('xp') + '), 2)'],
    ['Level', '=MAX(0, MAX(' + below('level') + '))'],
    ['Pounds', '=ROUND(SUM(' + below('lb') + '), 2)'],
    ['Miles', '=ROUND(SUM(' + below('mi') + '), 2)'],
    ['Walks', '=COUNTIF(' + below('kind') + ', "Walk")'],
    ['Badges', '=COUNTIF(' + below('kind') + ', "Badge")'],
    XP_HEAD.slice()
  ].map(function (r) { while (r.length < XP_HEAD.length) r.push(''); return r; });
}

// A player's tab, made the first time they earn XP.
function xpTab_(accountId, make) {
  var ss = getDb_(), name = xpTabName_(accountId), sheet = ss.getSheetByName(name);
  if (sheet || !make) return sheet;
  readAccounts_();   // Accounts' columns, for the top block's lookups
  sheet = ss.insertSheet(name, ss.getSheets().length);
  sheet.getRange(1, 1, XP_TOP, XP_HEAD.length).setValues(xpTopBlock_(accountId));
  sheet.getRange(1, 1, XP_TOP - 1, 1).setFontWeight('bold');
  sheet.getRange(XP_TOP, 1, 1, XP_HEAD.length).setFontWeight('bold');
  XP_WIDTHS.forEach(function (w, i) { sheet.setColumnWidth(i + 1, w); });
  sheet.getRange(XP_TOP + 1, XP_COL.at, sheet.getMaxRows() - XP_TOP, 1).setNumberFormat('yyyy-mm-dd h:mm');
  sheet.setTabColor('#7c3aed');
  return sheet;
}

// A player's rows, oldest first, read once per request. The rows start under
// the row of headings, wherever it is, so rows added to the top block later
// (|S7-P3's archived quarters, |Q872 (a)) move nothing.
function xpRows_(accountId) {
  var keep = lockDepth_ === 0, key = 'XP rows ' + accountId;
  if (keep && readMemo_[key]) return readMemo_[key];
  var sheet = getDb_().getSheetByName(xpTabName_(accountId)), out = [];
  if (sheet && sheet.getLastRow() > 0) {
    var all = sheet.getDataRange().getValues(), start = -1;
    for (var i = 0; i < Math.min(all.length, 60); i++) {
      if (String(all[i][0]).trim() === XP_HEAD[0] && String(all[i][1]).trim() === XP_HEAD[1]) { start = i + 1; break; }
    }
    if (start >= 0) out = all.slice(start).map(xpRowOf_).filter(function (r) { return r.kind; });
  }
  if (keep) readMemo_[key] = out;
  return out;
}
function xpRowOf_(v) {
  var c = function (k) { var x = v[XP_COL[k] - 1]; return x == null ? '' : x; };
  var detail = {};
  try { detail = String(c('detail')).trim() ? JSON.parse(String(c('detail'))) : {}; } catch (err) { detail = {}; }
  var at = c('at');
  return { at: at instanceof Date ? at.getTime() : Number(at) || 0, kind: String(c('kind')).trim(), say: String(c('say')), xp: Number(c('xp')) || 0,
    walk: String(c('walk')).trim(), lb: Number(c('lb')) || 0, mi: Number(c('mi')) || 0, level: c('level') === '' ? null : Number(c('level')) || null,
    key: String(c('key')).trim(), detail: detail };
}
// What's written for each key: its sums, and its first and latest rows.
function xpByKey_(rows) {
  var by = {};
  rows.forEach(function (r) {
    if (!r.key) return;
    var b = by[r.key] = by[r.key] || { xp: 0, lb: 0, mi: 0, first: r, last: r };
    b.xp += r.xp; b.lb += r.lb; b.mi += r.mi; b.last = r;
  });
  return by;
}

// The two bonuses' names (|Q880 (a), |Q881 (a)).
function bonusName_(kind) { return kind === 'alone' ? 'Rescue bonus' : 'Recollection bonus'; }

// One walk's XP, as earned: planning it, and once Ended each weighing's
// rating and litter types, times its bonus; only with its GPX track saved,
// never a simulated one (Jeremy, Oct 29). `sn`: the settings it was first
// written under (|Q730 (a)); else today's, and its bonus as it is now.
function xpWalkDue_(q, list, sn, bonusOf, counts) {
  var id = q.get('id'), x = sn && sn.x ? sn.x : xpSettings_();
  var b = sn ? { mult: sn.mult || 1, kind: sn.kind || '' } : (bonusOf()[id] || { mult: 1, kind: '' });
  var p = { plan: counts ? Number(q.get('xp')) || 0 : 0, ratings: 0, types: 0, mult: b.mult, kind: b.kind, bonus: 0, math: [], mathRows: [],
    mathHow: { r1: x.r1, r2: x.r2, r3: x.r3, bonus: x.bonus } };
  if (counts && q.get('status') === 'Ended') list.forEach(function (st) {
    var all = stretchXp_(st, x), t = st.discarded ? 0 : (st.types.length || st.pounds === 0 ? x.types : 0);
    p.ratings += all - t; p.types += t;
    var row = ratingMath_(st, x, all - t);
    if (row) { p.mathRows.push(row); p.math.push(ratingMathLine_(row, x)); }
  });
  p.bonus = round_((p.ratings + p.types) * (p.mult - 1), 2);
  var xp = counts ? round_(p.plan + p.ratings + p.types + p.bonus, 2) : 0;
  var lb = counts ? round_(Number(q.get('pounds')) || 0, 2) : 0, mi = counts ? round_(Number(q.get('miles')) || 0, 2) : 0;
  var e = q.get('ended'), parts = [];
  if (p.plan) parts.push('planning +' + p.plan);
  if (p.ratings) parts.push('ratings +' + p.ratings);
  if (p.types) parts.push('litter types +' + p.types);
  if (p.bonus) parts.push(bonusName_(p.kind) + ' ×' + p.mult + ' +' + p.bonus);
  return { key: 'walk:' + id, walk: id, kind: 'Walk', fixKind: 'Walk fixed', xp: xp, lb: lb, mi: mi, at: e instanceof Date ? e.getTime() : 0,
    say: 'Walk ' + id + ': ' + lb + ' lb, ' + mi + ' mi' + (parts.length ? '. ' + parts.join(', ') : ''),
    sayFix: 'Walk ' + id + ' changed: now ' + xp + ' XP, ' + lb + ' lb, ' + mi + ' mi',
    detail: { parts: p }, snap: { x: x, mult: p.mult, kind: p.kind } };
}

// Everything this player has earned, by key, as it stands now. `by`: what
// their tab has, for the settings each was first written under.
function xpDues_(accountId, by) {
  var out = [], ms = function (v) { return v instanceof Date ? v.getTime() : 0; };
  var snapOf = function (key) { var b = by[key]; return b && b.first.detail && b.first.detail.snap || null; };
  // Walks, their weighings read once.
  var sts = {};
  readRows_(TABS.stretches).forEach(function (r) { (sts[r.get('collection')] = sts[r.get('collection')] || []).push(stretchOf_(r)); });
  var bonuses = null, bonusOf = function () { return bonuses || (bonuses = walkBonuses_()); };
  readRows_(TABS.collections).forEach(function (q) {
    if (q.get('account') !== accountId || q.get('simulated') === 'Yes' || q.get('status') === 'Collecting') return;
    var key = 'walk:' + q.get('id'), counts = !!String(q.get('track')).trim() && q.get('status') !== COLLECTION_DISCARDED;
    if (!counts && !by[key]) return;
    var list = (sts[q.get('id')] || []).sort(function (a, b) { return a.n - b.n; });
    out.push(xpWalkDue_(q, list, snapOf(key), bonusOf, counts));
  });
  // The first quest: each step, and finishing it (S5-P20).
  var qr = questRow_(accountId);
  if (qr) {
    var steps = stepsOf_(qr.steps), started = ms(qr.started), fin = ms(qr.finished);
    var stepXp = minutesSetting_(SETTING_QUEST_STEP_XP, 1), doneXp = minutesSetting_(SETTING_QUEST_DONE_XP, 5);
    for (var n = 1; n <= QUEST_STEPS; n++) {
      var k = 'first:' + n, has = steps.indexOf(n) !== -1, s = snapOf(k);
      if (has || by[k]) out.push({ key: k, kind: 'First quest', xp: has ? (s ? s.xp : stepXp) : 0, at: started, say: 'Your first quest, step ' + n, snap: { xp: stepXp } });
    }
    var dk = 'first:done', done = steps.length === QUEST_STEPS, ds = snapOf(dk);
    if (done || by[dk]) out.push({ key: dk, kind: 'First quest', xp: done ? (ds ? ds.xp : doneXp) : 0, at: fin || started, say: 'Your first quest, finished', snap: { xp: doneXp } });
  }
  // Segments of theirs made public, and ground they asked to add, approved in a review.
  var mine = {}, given = {};
  segmentsAll_().forEach(function (g) { if (g.by === accountId && g.accepted) mine[g.id] = 'Your segment "' + g.name + '" made public'; });
  additionsAll_().forEach(function (a) { if (a.by === accountId && a.state === 'Added') mine[a.id] = 'Your ground added to ' + a.segment; });
  reviewRows_().forEach(function (r) { if (mine[r.segment] && r.move === REVIEW_DECIDE.approve) given[r.segment] = r; });
  Object.keys(given).forEach(function (id) { out.push({ key: 'segment:' + id, kind: 'Segment', xp: given[id].xp || 0, at: given[id].time, say: mine[id] }); });
  // Skills sent and approved (S6-P8), and Challenges and Quests.
  var items = challengeItemsAll_(), names = {};
  toolSkillsAll_().forEach(function (t) { names[t.id] = t.name; });
  items.forEach(function (it) {
    if (it.account === accountId && it.state === 'Approved') out.push({ key: 'item:' + it.id, kind: 'Skill', xp: it.xp, at: it.sent, say: (names[it.skill] || 'A skill') + ', sent and approved' });
  });
  if (challengesAll_().length) challengeGains_(accountId, items, snapOf).forEach(function (g) {
    if (!g.xp && !by[g.key] && !g.done) return;
    var end = Math.min(Date.now(), g.to ? g.to + DAY_MS - 1 : Date.now());
    out.push({ key: g.key, kind: g.kind, xp: g.xp, at: end, say: g.say, snap: g.snap, done: g.done, quest: g.quest });
  });
  // Badges (S6-P6), with the XP they had when earned.
  badgesAll_().forEach(function (b) {
    if (b.account === accountId) out.push({ key: 'badge:' + b.achievement, kind: 'Badge', xp: b.xp, at: b.earned, say: 'The badge ' + (b.badge ? b.badge + ' ' : '') + '"' + b.name + '"' });
  });
  return out;
}

function xpLevelRow_(n, at) {
  return { at: at, kind: 'Level', say: 'Reached Level ' + n, xp: 0, walk: '', lb: 0, mi: 0, level: n, key: 'level:' + n, detail: {} };
}

// Under the lock: a row for each difference between what this player has
// earned and what their tab has; a row for each level reached (kept, |Q745
// (a)); and their total and level on Accounts. `moving`: the once-only
// move-in (item 8, |Q731), each row at the time it was earned, and each
// level when it was reached. Returns { total, level, added }.
function xpSettle_(accountId, moving) {
  var rows = xpRows_(accountId), by = xpByKey_(rows), now = Date.now(), add = [];
  var dues = xpDues_(accountId, by);
  dues.forEach(function (d) {
    var w = by[d.key];
    var dx = round_(d.xp - (w ? w.xp : 0), 2), dl = round_((d.lb || 0) - (w ? w.lb : 0), 2), dm = round_((d.mi || 0) - (w ? w.mi : 0), 2);
    if (!dx && !dl && !dm) return;
    var detail = {};
    Object.keys(d.detail || {}).forEach(function (k) { detail[k] = d.detail[k]; });
    if (!w && d.snap) detail.snap = d.snap;
    if (moving) detail.moved = true;
    add.push({ at: moving ? (d.at || now) : now, kind: w ? (d.fixKind || d.kind + ' changed') : d.kind, say: w ? (d.sayFix || d.say + ' (changed)') : d.say,
      xp: dx, walk: d.walk || '', lb: dl, mi: dm, level: null, key: d.key, detail: detail });
  });
  if (moving) add.sort(function (a, b) { return a.at - b.at; });
  var ranges = levelRanges_(), reached = rows.reduce(function (m, r) { return r.level != null && r.level > m ? r.level : m; }, 0);
  var total = round_(rows.concat(add).reduce(function (t, r) { return t + r.xp; }, 0), 2);
  if (ranges.length) {
    if (moving) {
      // Each level at the row that reached it.
      var run = 0, lv = reached, ups = [];
      add.forEach(function (r) {
        run += r.xp;
        var n = levelOf_(round_(run, 2), ranges);
        for (var k = lv + 1; k <= n; k++) ups.push({ before: r, row: xpLevelRow_(k, r.at) });
        if (n > lv) lv = n;
      });
      ups.reverse().forEach(function (u) { add.splice(add.indexOf(u.before) + 1, 0, u.row); });
    } else {
      for (var k = reached + 1, top = levelOf_(total, ranges); k <= top; k++) add.push(xpLevelRow_(k, now));
    }
  }
  // A Quest taken on and now finished (S7-P4): its log row; it's no longer active.
  var finished = moving ? [] : questsFinishedRows_(accountId, rows, dues);
  add = add.concat(finished);
  if (add.length) xpWrite_(accountId, add);
  var all = rows.concat(add);
  if (finished.length) questsAccount_(accountId, all);
  var level = all.reduce(function (m, r) { return r.level != null && r.level > m ? r.level : m; }, 0);
  xpAccount_(accountId, total, level, all.filter(function (r) { return r.kind === 'Level'; }));
  return { total: total, level: level, added: add.length };
}

function xpWrite_(accountId, add) {
  var sheet = xpTab_(accountId, true), at = Math.max(sheet.getLastRow(), XP_TOP) + 1;
  var rows = add.map(function (r) {
    var v = XP_HEAD.map(function () { return ''; });
    v[XP_COL.at - 1] = new Date(r.at); v[XP_COL.kind - 1] = r.kind; v[XP_COL.say - 1] = safeCell_(String(r.say));
    v[XP_COL.xp - 1] = r.xp; v[XP_COL.walk - 1] = r.walk || ''; v[XP_COL.lb - 1] = r.lb || 0; v[XP_COL.mi - 1] = r.mi || 0;
    v[XP_COL.level - 1] = r.level == null ? '' : r.level; v[XP_COL.key - 1] = r.key;
    v[XP_COL.detail - 1] = Object.keys(r.detail || {}).length ? JSON.stringify(r.detail) : '';
    return v;
  });
  sheet.getRange(at, 1, rows.length, XP_HEAD.length).setValues(rows);
  forgetReads_();
}

// Each player's total and level on Accounts, and the levels with when each
// was reached, for Street Talk's lines about everyone (S6-P38).
function xpAccount_(accountId, total, level, levelRows) {
  var a = readAccounts_().filter(function (x) { return x.id === accountId; })[0];
  if (!a) return;
  var tz = Session.getScriptTimeZone();
  var levels = levelRows.slice().sort(function (p, q) { return p.level - q.level; })
    .map(function (r) { return 'Level ' + r.level + ': ' + Utilities.formatDate(new Date(r.at), tz, 'yyyy-MM-dd HH:mm'); }).join('; ');
  if (a.xp === total && a.level === level && a.levels === levels) return;
  setAccountCells_(a.row, { xp: total, level: level, levels: levels });
  forgetReads_();
}
// Accounts' "Levels reached", read back: [{ level, at }].
function levelsReached_(text) {
  var out = [], re = /Level (\d+): (\d{4}-\d{2}-\d{2} \d{2}:\d{2})/g, m, tz = Session.getScriptTimeZone();
  while ((m = re.exec(String(text || '')))) out.push({ level: Number(m[1]), at: Utilities.parseDate(m[2], tz, 'yyyy-MM-dd HH:mm').getTime() });
  return out;
}

// For anything that can earn XP: settles each player named, under the lock.
function xpSettleAll_(ids) {
  var seen = {};
  (ids || []).forEach(function (id) { if (id && !seen[id]) { seen[id] = true; xpSettle_(id, false); } });
}

// Your quests, opened: a Challenge made or changed by an admin since this
// player last earned XP shows its progress there, so its XP is written now,
// if it differs from their tab; the lock is taken only then.
function xpCatchUpQuests_(accountId) {
  if (!challengesAll_().length) return;
  var by = xpByKey_(xpRows_(accountId));
  var snapOf = function (key) { var b = by[key]; return b && b.first.detail && b.first.detail.snap || null; };
  var differs = challengeGains_(accountId, null, snapOf).some(function (g) { return Math.abs(g.xp - (by[g.key] ? by[g.key].xp : 0)) >= 0.005; });
  if (differs) withLock_(function () { xpSettle_(accountId, false); });
}

/* ── What the page and Street Talk read ── */

// A player's XP: one cell on Accounts.
function xpOf_(accountId) {
  var a = readAccounts_().filter(function (x) { return x.id === accountId; })[0];
  return a ? a.xp : 0;
}
// Their level: the one reached and kept (|Q745 (a)), or higher if the
// level table has come down since.
function levelFor_(accountId) {
  var a = readAccounts_().filter(function (x) { return x.id === accountId; })[0];
  return a ? Math.max(a.level, levelOf_(a.xp, levelRanges_())) : 0;
}

// One walk's XP lines, from its rows (S6-P3): planning it, its ratings with
// their math, its litter types, and its bonus. `xp`: the player's whole XP,
// for the page to see what's new; `level`: their level.
function walkXp_(collectionId, accountId) {
  var out = { plan: 0, ratings: 0, types: 0, mult: 1, bonus: 0, total: 0, counts: false, xp: xpOf_(accountId), level: levelFor_(accountId), math: [], mathRows: [] };
  var mine = xpRows_(accountId).filter(function (r) { return r.key === 'walk:' + collectionId; });
  if (!mine.length) {
    var q = readRows_(TABS.collections).filter(function (r) { return r.get('id') === collectionId; })[0];
    out.counts = !!q && !!String(q.get('track')).trim() && q.get('simulated') !== 'Yes';
    return out;
  }
  var p = mine[mine.length - 1].detail.parts || {};
  out.counts = true;
  ['plan', 'ratings', 'types', 'mult', 'kind', 'bonus', 'math', 'mathRows', 'mathHow'].forEach(function (k) { if (p[k] !== undefined) out[k] = p[k]; });
  out.total = round_(mine.reduce(function (t, r) { return t + r.xp; }, 0), 2);
  return out;
}

// A player's rows as XP lines, oldest first: { at, xp, say, walk }.
function xpLines_(accountId) {
  return xpRows_(accountId).filter(function (r) { return r.xp && r.kind !== 'Level'; })
    .map(function (r) { return { at: r.at, xp: round_(r.xp, 2), say: r.say, walk: r.walk }; });
}

/* ── Moving in, once (item 8, |Q731) ── */

// Everyone's XP as it stands today, written into their tab, the 117.01 from
// Nov 11 included; and an "XP check" tab with each player's total the old
// way (worked out fresh) beside their tab's, for you to see they match.
function xpTabsOnce_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('XP_TABS_MOVED')) return;
  var accounts = readAccounts_(), check = [];
  walkBonusesKept_ = walkBonuses_();   // every walk's bonus, worked out once for everyone
  try {
    accounts.forEach(function (a) {
      var old = xpOldOf_(a.id), got = xpSettle_(a.id, true);
      check.push([a.id, a.handle, old, got.total, round_(got.total - old, 2), got.level]);
    });
  } finally { walkBonusesKept_ = null; }
  if (check.length) {
    var ss = getDb_(), sheet = ss.getSheetByName('XP check') || ss.insertSheet('XP check', ss.getSheets().length);
    sheet.getRange(1, 1, 1, 6).setValues([['Account ID', 'Handle', 'XP the old way', 'XP in their tab', 'Difference', 'Level']]).setFontWeight('bold');
    sheet.getRange(2, 1, check.length, 6).setValues(check);
    sheet.getRange(check.length + 3, 1).setValue('Moved in ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'MMM d, yyyy h:mm a') + ' (S7-P1). The old way is worked out fresh from every walk and today\'s settings.');
  }
  props.setProperty('XP_TABS_MOVED', new Date().toISOString());
}
