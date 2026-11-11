/**
 * Challenges (S6-P8, |Q661 (a), |M669, |M846): one task an admin builds in
 * Admin Mode that earns XP, built from a skill and a goal (S6-P8's rework,
 * Jeremy in chat, Nov 6: "the challenges are supposed to be built out of
 * existing skills"; his "(a)" to building one from a skill and a goal, with
 * dates, XP for each one and a finishing multiplier). Two kinds:
 * - Walk goal: collecting is the skill. Miles collected across different
 *   segments, between its dates, from walks with their GPX track: XP per
 *   0.01 mi up to the goal, times the finishing multiplier once the miles
 *   and the segments are both met.
 * - Skill goal: a skill built from the toolbox (ToolSkills.js), like Trash
 *   receptacles: so many approved between its dates, XP for each one (on top
 *   of the skill's own), times the finishing multiplier once the goal is met.
 * A Quest groups Challenges (|Q661 (a)). Players see them on Your quests.
 * What players send with a skill is kept in the Challenge items tab.
 */
var CHALLENGE_COL = { id: 1, name: 2, says: 3, why: 4, kind: 5, actions: 6, near: 7, xpEach: 8, xpNear: 9, milesGoal: 10, segGoal: 11, xpPer: 12, mult: 13,
  from: 14, to: 15, level: 16, state: 17, by: 18, made: 19, skill: 20, goal: 21, xpOne: 22, quest: 23 };
var ITEM_COL = { id: 1, skill: 2, account: 3, sent: 4, lat: 5, lon: 6, acc: 7, photo: 8, note: 9, state: 10, near: 11, xp: 12 };
var CHALLENGE_KINDS = ['Walk goal', 'Skill goal'];
var SETTING_CHALLENGE_PHOTOS = 'Challenge photos folder';
var CHALLENGE_PHOTO_MAX = 2500000;   // characters of a photo sent, about 1.8 MB

/* ── Reading ── */

function challengesAll_() {
  return readRows_(TABS.challenges, CHALLENGE_COL).map(function (r) {
    var d = function (k) { var v = r.get(k); return v instanceof Date ? v.getTime() : 0; };
    var n = function (k) { var v = Number(r.get(k)); return r.get(k) === '' || !isFinite(v) ? 0 : v; };
    var kind = String(r.get('kind')).trim();
    return { row: r.row, id: r.get('id'), name: r.get('name'), says: r.get('says'), why: r.get('why'), kind: CHALLENGE_KINDS.indexOf(kind) !== -1 ? kind : 'Items',
      milesGoal: n('milesGoal'), segGoal: Math.floor(n('segGoal')), xpPer: n('xpPer'), mult: n('mult') || 1, skill: r.get('skill'), goal: Math.floor(n('goal')), xpOne: n('xpOne'),
      from: d('from'), to: d('to'), state: /^\s*r/i.test(r.get('state')) ? 'Retired' : 'Open', moved: /^\s*moved/i.test(r.get('state')), by: r.get('by'), made: d('made'),
      quest: r.get('quest') };
  }).filter(function (c) { return c.id && !c.moved && c.kind !== 'Items'; });
}

function challengeItemsAll_() {
  return readRows_(TABS.challengeItems, ITEM_COL).map(function (r) {
    var t = r.get('sent');
    return { row: r.row, id: r.get('id'), skill: r.get('skill'), account: r.get('account'), sent: t instanceof Date ? t.getTime() : 0,
      lat: r.get('lat') === '' ? null : Number(r.get('lat')), lon: r.get('lon') === '' ? null : Number(r.get('lon')), acc: r.get('acc') === '' ? null : Number(r.get('acc')),
      photo: r.get('photo'), note: r.get('note'), state: r.get('state') || 'Waiting', near: r.get('near'), xp: Number(r.get('xp')) || 0 };
  }).filter(function (x) { return x.id; });
}

// Between its dates: From's day from its start, To's day to its end.
function challengeLive_(c, at) {
  return c.state === 'Open' && (!c.from || at >= c.from) && (!c.to || at < c.to + DAY_MS);
}

// The public segment nearest a place, within `metres` of one of its squares.
function nearSegment_(lat, lon, metres) {
  if (!(metres > 0) || lat == null || lon == null) return '';
  var p = LitterGeo.xy(lat, lon), best = null;
  segmentsAll_().forEach(function (g) {
    if (!g.accepted) return;
    g.squares.forEach(function (cell) {
      var c = LitterGeo.cellCenter(cell), d = LitterGeo.dist(p, LitterGeo.xy(c.lat, c.lon)) - LitterGeo.CELL_M / 2;
      if (d <= metres && (!best || d < best.d)) best = { id: g.id, d: d };
    });
  });
  return best ? best.id : '';
}

// A collecting Challenge's progress for one player (Q694 (a)): miles and
// different segments, from their walks with a GPX track, ended in its dates.
// Under a Quest with segments (S6-P8's Bench), only those count: each
// weighing's miles for its share of squares on them, and a segment once their
// walks have covered most of its squares (the rate's share, 90% to start).
// XP for each 0.01 mi up to the miles, and for each segment up to the
// number, times the finishing multiplier once both are met.
function walkGoal_(c, accountId, scope) {
  scope = scope || { from: c.from, to: c.to, segments: [] };
  var from = scope.from || 0, to = scope.to ? scope.to + DAY_MS : Infinity, ids = {}, miles = 0;
  readRows_(TABS.collections).forEach(function (q) {
    if (q.get('account') !== accountId || q.get('simulated') === 'Yes' || !String(q.get('track')).trim() || q.get('status') !== 'Ended') return;
    var e = q.get('ended'), at = e instanceof Date ? e.getTime() : 0;
    if (at < from || at >= to) return;
    ids[q.get('id')] = true;
    if (!scope.segments.length) miles += Number(q.get('miles')) || 0;
  });
  var only = scope.segments.length ? squaresOf_(scope.segments) : null, walked = {};
  readRows_(TABS.stretches).forEach(function (r) {
    if (!ids[r.get('collection')] || r.get('discarded') === 'Yes') return;
    var cells = String(r.get('cells')).split(/\s+/).filter(String), on = 0;
    cells.forEach(function (x) { walked[x] = true; if (only && only[x]) on++; });
    if (only && cells.length) miles += (Number(r.get('streetMi')) || 0) * on / cells.length;
  });
  var cover = segmentRules_().cover, n = 0;
  segmentsAll_().forEach(function (g) {
    if (!g.accepted || !g.squares.length || (scope.segments.length && scope.segments.indexOf(g.id) === -1)) return;
    if (g.squares.filter(function (x) { return walked[x]; }).length / g.squares.length >= cover) n++;
  });
  var wantMiles = c.milesGoal > 0, wantSegs = c.segGoal > 0;
  var done = (wantMiles || wantSegs) && (!wantMiles || miles >= c.milesGoal - 1e-9) && (!wantSegs || n >= c.segGoal);
  var counted = wantMiles ? Math.min(miles, c.milesGoal) : miles;
  var xp = (Math.floor(counted / 0.01 + 1e-9) * c.xpPer + (wantSegs ? Math.min(n, c.segGoal) : n) * (c.xpOne || 0)) * (done ? c.mult : 1);
  return { miles: round_(miles, 3), segments: n, done: done, xp: round_(xp, 2) };
}

// A skill goal's progress for one player: approved ones sent in its dates.
// A skill's Challenge: so many approved in its dates; under a Quest with
// segments, only those sent near them (the skill's own distance, or 30 m).
function skillGoal_(c, accountId, items, scope) {
  scope = scope || { from: c.from, to: c.to, segments: [] };
  var from = scope.from || 0, to = scope.to ? scope.to + DAY_MS : Infinity;
  var near = null;
  if (scope.segments.length) {
    var sk = toolSkillsAll_().filter(function (s) { return s.id === c.skill; })[0], metres = (sk && sk.near) || 30;
    var pts = Object.keys(squaresOf_(scope.segments)).map(function (x) { var p = LitterGeo.cellCenter(x); return LitterGeo.xy(p.lat, p.lon); });
    near = function (x) {
      if (x.lat == null || x.lon == null) return false;
      var p = LitterGeo.xy(x.lat, x.lon);
      return pts.some(function (q) { return LitterGeo.dist(p, q) - LitterGeo.CELL_M / 2 <= metres; });
    };
  }
  var n = (items || challengeItemsAll_()).filter(function (x) {
    return x.skill === c.skill && x.account === accountId && x.state === 'Approved' && x.sent >= from && x.sent < to && (!near || near(x));
  }).length;
  var done = c.goal > 0 && n >= c.goal, counted = c.goal > 0 ? Math.min(n, c.goal) : n;
  return { count: n, done: done, xp: round_(counted * c.xpOne * (done ? c.mult : 1), 2) };
}

// What one player has earned from Challenges and Quests: each Challenge's
// XP, and each Quest's finishing bonus once all its Challenges are done. A
// Draft earns nothing, nor a Quest marked as a test. [{ say, xp, from, to }]
function challengeGains_(accountId, items) {
  items = items || challengeItemsAll_();
  var quests = {}, out = [], list = challengesAll_();
  questBenchAll_().forEach(function (q) { quests[q.id] = q; });
  var byQuest = {};
  list.forEach(function (c) {
    var sc = challengeScope_(c, quests), q = sc.quest;
    if (c.quest && (!q || q.state === 'Draft' || q.test)) return;
    var got = c.kind === 'Walk goal' ? walkGoal_(c, accountId, sc) : skillGoal_(c, accountId, items, sc);
    if (q && c.state === 'Open') (byQuest[q.id] = byQuest[q.id] || []).push(got.done);
    if (got.xp) out.push({ say: 'the Challenge "' + c.name + '"' + (q ? ' of ' + q.name : ''), xp: got.xp, from: sc.from, to: sc.to });
  });
  Object.keys(byQuest).forEach(function (id) {
    var q = quests[id];
    if (q.bonus && byQuest[id].length && byQuest[id].every(Boolean)) out.push({ say: 'finishing the Quest ' + q.name, xp: q.bonus, from: q.from, to: q.to });
  });
  return out;
}

// The XP from skills and Challenges: approved items (their skill's XP), and
// Challenges and Quests.
function challengeXp_(accountId) {
  var xp = 0, items = challengeItemsAll_();
  items.forEach(function (x) { if (x.account === accountId && x.state === 'Approved') xp += x.xp; });
  challengeGains_(accountId, items).forEach(function (g) { xp += g.xp; });
  return round_(xp, 2);
}

// What an approved item earns, by its skill's fields.
function itemXp_(s, item) { return item.near && s.xpNear ? s.xpNear : s.xpEach; }

// Each open skill built from the toolbox, listed with the Litter Class
// Skills, and named on the level-up screen when it opens at a level.
function challengeSkills_() {
  return toolSkillsAll_().filter(function (s) { return s.state === 'Open'; }).map(function (s) {
    return { key: 'skill:' + s.id, name: s.name, say: s.says, level: s.level };
  });
}

/* ── The player's side: Your quests ── */

function challengeView_(c, account, items, now, skills, quests) {
  var sk = skills[c.skill], sc = challengeScope_(c, quests || {});
  return { id: c.id, name: c.name, says: c.says, why: c.why, kind: c.kind, milesGoal: c.milesGoal, segGoal: c.segGoal, xpPer: c.xpPer, mult: c.mult, quest: c.quest,
    skill: c.skill, skillName: sk ? sk.name : c.skill, goal: c.goal, xpOne: c.xpOne, from: sc.from, to: sc.to, live: challengeLive_({ state: c.state, from: sc.from, to: sc.to }, now), state: c.state,
    progress: c.kind === 'Walk goal' ? walkGoal_(c, account.id, sc) : skillGoal_(c, account.id, items, sc) };
}

// Your quests (S6-P8's Bench): each Quest open now, with its Challenges as
// its list, and any you've earned XP from. A test Quest only for admins.
function challengesLoad_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  return challengesFor_(account);
}
function challengesFor_(account) {
  var now = Date.now(), items = challengeItemsAll_(), skills = {}, quests = {};
  toolSkillsAll_().forEach(function (s) { skills[s.id] = s; });
  var all = questBenchAll_();
  all.forEach(function (q) { quests[q.id] = q; });
  var list = challengesAll_().map(function (c) { return challengeView_(c, account, items, now, skills, quests); });
  var out = all.filter(function (q) { return q.state !== 'Draft' && (!q.test || !!account.rank); }).map(function (q) {
    var mine = list.filter(function (v) { return v.quest === q.id && v.state === 'Open'; });
    var done = mine.length > 0 && mine.every(function (v) { return v.progress.done; });
    var xp = mine.reduce(function (t, v) { return t + v.progress.xp; }, 0) + (done ? q.bonus : 0);
    var segs = segmentsAll_().filter(function (g) { return q.segments.indexOf(g.id) !== -1; });
    return { id: q.id, name: q.name, says: q.says, from: q.from, to: q.to, live: questLive_(q, now), state: q.state, test: q.test, bonus: q.bonus,
      segments: segs.map(function (g) { return { id: g.id, name: g.name, squares: g.squares }; }), challenges: mine, done: done, xp: round_(xp, 2) };
  }).filter(function (v) { return (v.live && v.challenges.length) || (v.xp > 0 && !v.test); });
  return { quests: out, canBuild: !!account.rank && rankAtLeast_(account.rank, 'Builder') };
}

// Where the photos go: a folder beside the litter Sheet, made the first time.
function challengePhotosFolder_() {
  var link = getSetting_(SETTING_CHALLENGE_PHOTOS).trim();
  if (link) {
    try { return DriveApp.getFolderById(driveId_(link)); }
    catch (err) { throw new Error('The "' + SETTING_CHALLENGE_PHOTOS + '" link in Settings can\'t be opened. Fix or clear it, then try again.'); }
  }
  return withLock_(function () {
    settingsMemo_ = null;
    var again = getSetting_(SETTING_CHALLENGE_PHOTOS).trim();
    if (again) return DriveApp.getFolderById(driveId_(again));
    var parents = DriveApp.getFileById(getDb_().getId()).getParents();
    var folder = (parents.hasNext() ? parents.next() : DriveApp.getRootFolder()).createFolder('Litter challenge photos');
    setSetting_(SETTING_CHALLENGE_PHOTOS, folder.getUrl());
    return folder;
  });
}

// An item's photo, for its review or for the player who sent it.
function challengePhoto_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var x = challengeItemsAll_().filter(function (i) { return i.id === clean_(req.itemId, 20); })[0];
  if (!x || !x.photo) throw new Error('That photo isn\'t here.');
  if (x.account !== account.id && !account.rank) throw new Error('That photo isn\'t yours to see.');
  var blob = DriveApp.getFileById(x.photo).getBlob();
  return { photo: 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(blob.getBytes()) };
}

/* ── Admin Mode: building them ── */

function challengesAdmin_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!account.rank) throw new Error('Challenges are built by HABO\'s admins.');
  return challengesAdminView_(account);
}
function challengesAdminView_(account) {
  var skills = toolSkillsAll_();
  var challenges = challengesAll_().map(function (c) {
    var out = {};
    Object.keys(c).forEach(function (k) { if (k !== 'row') out[k] = c[k]; });
    var sk = skills.filter(function (x) { return x.id === c.skill; })[0];
    out.skillName = sk ? sk.name : c.skill;
    return out;
  });
  // The Bench: each Quest with its Challenges, and the public segments to pick from.
  var quests = questBenchAll_().map(function (q) {
    var out = {};
    Object.keys(q).forEach(function (k) { if (k !== 'row') out[k] = q[k]; });
    out.challenges = challenges.filter(function (c) { return c.quest === q.id; });
    return out;
  });
  return { quests: quests, challenges: challenges, canBuild: rankAtLeast_(account.rank, 'Builder'), kinds: CHALLENGE_KINDS,
    segments: segmentsAll_().filter(function (g) { return g.accepted && g.squares.length; }).map(function (g) { return { id: g.id, name: g.name, kind: g.kind, squares: g.squares, outline: g.outline || [] }; }),
    skills: skills.filter(function (s) { return s.state === 'Open'; }).map(function (s) { return { id: s.id, name: s.name, near: s.near }; }) };
}

// A Challenge made or changed, by a Builder or above.
function challengeSave_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!account.rank || !rankAtLeast_(account.rank, 'Builder')) throw new Error('A Builder or above builds Challenges.');
  var x = req.challenge || {};
  var name = clean_(x.name, 80), says = clean_(x.says, 1000), why = clean_(x.why, 1000), kind = CHALLENGE_KINDS.indexOf(x.kind) !== -1 ? x.kind : '';
  // A Challenge is a list item under its Quest (|M895): its dates are the Quest's.
  var quest = questBenchAll_().filter(function (q) { return q.id === clean_(x.quest, 20); })[0];
  if (!quest) throw new Error('A Challenge goes under a Quest: open the Quest, then Add a Challenge.');
  if (!kind) throw new Error('Choose the skill it\'s built from: Collecting, or a skill from the toolbox.');
  var num = function (k, label, max, whole) {
    var v = x[k] === '' || x[k] == null ? 0 : Number(x[k]);
    if (!isFinite(v) || v < 0 || v > max || (whole && Math.floor(v) !== v)) throw new Error(label + ' is ' + (whole ? 'a whole number ' : '') + 'from 0 to ' + max + '.');
    return v;
  };
  var skill = kind === 'Skill goal' ? toolSkillsAll_().filter(function (s) { return s.id === clean_(x.skill, 20) && s.state === 'Open'; })[0] : null;
  if (kind === 'Skill goal' && !skill) throw new Error('Choose the skill it\'s built from.');
  var walk = kind === 'Walk goal';
  var fields = {
    name: name, says: says, why: why, kind: kind, milesGoal: walk ? num('milesGoal', 'Miles', 1000, false) : '',
    segGoal: walk ? num('segGoal', 'Different segments', 100, true) : '', xpPer: walk ? num('xpPer', 'XP per 0.01 mi', 100, false) : '',
    skill: walk ? '' : skill.id, goal: walk ? '' : num('goal', 'The goal', 10000, true), xpOne: num('xpOne', walk ? 'XP for each segment' : 'XP for each one', 100, false),
    mult: num('mult', 'Finishing multiplier', 10, false) || 1, from: '', to: '', quest: quest.id
  };
  if (walk && !(fields.milesGoal > 0) && !(fields.segGoal > 0)) throw new Error('Say its condition: the miles, or how many different segments, or both.');
  if (!walk && !(fields.goal > 0)) throw new Error('Say its condition: how many approved.');
  if (walk && fields.segGoal > 0 && quest.segments.length && fields.segGoal > quest.segments.length) throw new Error('Its Quest has ' + quest.segments.length + ' segments: ' + fields.segGoal + ' different ones can\'t be collected.');
  // Its name and words, from its condition, when they're left blank.
  var on = quest.segments.length ? ' of its segments' : ' segments';
  if (!fields.name) fields.name = walk ? 'Collect ' + (fields.milesGoal > 0 ? fields.milesGoal + ' mi' + (quest.segments.length ? ' on its segments' : '') : '') + (fields.milesGoal > 0 && fields.segGoal > 0 ? ', across ' : '') + (fields.segGoal > 0 ? (fields.milesGoal > 0 ? '' : 'all of ') + fields.segGoal + on : '')
    : fields.goal + ' ' + skill.name + (quest.segments.length ? ' near its segments' : '');
  if (!fields.says) fields.says = walk ? 'Collect litter' + (quest.segments.length ? ' along this Quest\'s segments' : '') + ': ' + fields.name.replace(/^Collect /, '') + '.'
    : 'Use ' + skill.name + ' from Skills' + (quest.segments.length ? ' near this Quest\'s segments' : '') + ': ' + fields.goal + ' approved.';
  fields.name = clean_(fields.name, 80);
  return withLock_(function () {
    var sheet = getDb_().getSheetByName(TABS.challenges.name), all = challengesAll_();
    var id = clean_(x.id, 20), had = id ? all.filter(function (c) { return c.id === id; })[0] : null;
    if (id && !had) throw new Error('That Challenge isn\'t here any more.');
    var row = had ? sheet.getRange(had.row, 1, 1, TABS.challenges.header.length).getValues()[0] : blankRow_(TABS.challenges);
    Object.keys(fields).forEach(function (k) { row[CHALLENGE_COL[k] - 1] = typeof fields[k] === 'string' ? safeCell_(fields[k]) : fields[k]; });
    if (!had) {
      row[CHALLENGE_COL.id - 1] = nextId_('CH', readRows_(TABS.challenges, CHALLENGE_COL).map(function (r) { return r.get('id'); }));   // moved rows keep their ids
      row[CHALLENGE_COL.state - 1] = 'Open'; row[CHALLENGE_COL.by - 1] = account.handle || account.email; row[CHALLENGE_COL.made - 1] = new Date();
    }
    var at = had ? had.row : lastRowWith_(sheet, CHALLENGE_COL.id) + 1;
    sheet.getRange(at, 1, 1, row.length).setValues([row]);
    logChange_(account.email, 'Challenge', row[CHALLENGE_COL.id - 1], had ? 'Changed' : 'Made', had ? had.name : '', name);
    return challengesAdminView_(account);
  });
}

// Retire a Challenge, or open it again. What it earned stays earned.
function challengeRetire_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!account.rank || !rankAtLeast_(account.rank, 'Builder')) throw new Error('A Builder or above builds Challenges.');
  return withLock_(function () {
    var c = challengesAll_().filter(function (x) { return x.id === clean_(req.challengeId, 20); })[0];
    if (!c) throw new Error('That Challenge isn\'t here any more.');
    var to = req.retire === false ? 'Open' : 'Retired';
    getDb_().getSheetByName(TABS.challenges.name).getRange(c.row, CHALLENGE_COL.state).setValue(to);
    logChange_(account.email, 'Challenge', c.id, 'State', c.state, to);
    return challengesAdminView_(account);
  });
}

/* ── Reviews: each item sent ── */

function challengeReviewItems_(handles, rows, now) {
  var byId = {};
  toolSkillsAll_().forEach(function (s) { byId[s.id] = s; });
  return challengeItemsAll_().map(function (x) {
    var c = byId[x.skill] || { id: x.skill, name: x.skill, xpEach: 0, xpNear: 0 };
    var moves = rows.filter(function (m) { return m.segment === x.id; });
    var decided = moves.filter(function (m) { return m.move === REVIEW_DECIDE.approve || m.move === REVIEW_DECIDE.decline; }).pop();
    var rec = moves.filter(function (m) { return m.move === REVIEW_RECOMMEND.Approve || m.move === REVIEW_RECOMMEND.Decline; }).pop();
    var open = x.state === 'Waiting';
    return { id: x.id, challengeItem: true, name: c.name + ': ' + x.id, challenge: c.id, kind: 'Item', squares: [], outline: [], miles: 0,
      by: handles[x.account] || x.account, proposed: x.sent, askNote: x.note, lat: x.lat, lon: x.lon, acc: x.acc, hasPhoto: !!x.photo, near: x.near,
      xpIf: itemXp_(c, x), state: open ? (rec ? 'Recommended' : 'New') : x.state, recommendedXp: rec ? rec.xp : null,
      decidedAt: decided ? decided.time : 0, open: open, moves: moves.map(function (m) { return { time: m.time, by: m.by, rank: m.rank, move: m.move, xp: m.xp, note: m.note }; }) };
  }).filter(function (r) { return r.open || (r.decidedAt && now - r.decidedAt <= REVIEW_SHOWN_DAYS * DAY_MS); });
}

// A move on an item: its XP is its skill's, not typed in.
function challengeItemMove_(account, id, kind, move, note) {
  return withLock_(function () {
    var x = challengeItemsAll_().filter(function (i) { return i.id === id; })[0];
    if (!x) throw new Error('That item isn\'t here any more.');
    if (x.state !== 'Waiting') throw new Error('That item was ' + x.state.toLowerCase() + ' already. Reload the screen.');
    var c = toolSkillsAll_().filter(function (i) { return i.id === x.skill; })[0] || { xpEach: 0, xpNear: 0 };
    var xp = itemXp_(c, x);
    var sheet = getDb_().getSheetByName(TABS.reviews.name);
    var row = blankRow_(TABS.reviews);
    row[REVIEW_COL.time - 1] = new Date(); row[REVIEW_COL.segment - 1] = x.id; row[REVIEW_COL.by - 1] = account.handle || account.email;
    row[REVIEW_COL.rank - 1] = account.rank; row[REVIEW_COL.move - 1] = move; row[REVIEW_COL.xp - 1] = kind === 'decline' || (kind === 'recommend' && move === REVIEW_RECOMMEND.Decline) ? '' : xp; row[REVIEW_COL.note - 1] = note;
    sheet.getRange(lastRowWith_(sheet, REVIEW_COL.segment) + 1, 1, 1, row.length).setValues([row]);
    if (kind === 'approve' || kind === 'decline') {
      var items = getDb_().getSheetByName(TABS.challengeItems.name);
      items.getRange(x.row, ITEM_COL.state).setValue(kind === 'approve' ? 'Approved' : 'Declined');
      items.getRange(x.row, ITEM_COL.xp).setValue(kind === 'approve' ? xp : '');
      logChange_(account.email, 'Challenge item', x.id, 'State', 'Waiting', (kind === 'approve' ? 'Approved (' + xp + ' XP)' : 'Declined') + ', in a review');
    }
    return reviewsView_(account);
  });
}

/* ── Once: Trash receptacles was seeded here as a Challenge; it's a skill
   now, moved or seeded by toolSkillsOnce_ (ToolSkills.js) ── */

function challengesOnce_() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('CHALLENGES_SEEDED')) props.setProperty('CHALLENGES_SEEDED', new Date().toISOString());
}
