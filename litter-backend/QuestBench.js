/**
 * The Quest Drafting Bench (S6-P8, |M895, |Q661 (a), |Q693 (a), |Q694 (a),
 * |M978): in Admin Mode, a Builder or above drafts a Quest: its name, its
 * dates and its finishing bonus; its segments, picked on the map; then its
 * Challenges, each a skill used on those segments with its condition:
 * collecting (miles on them, or so many different ones of them), or a skill
 * from the toolbox (so many approved, near them). Challenges are a list under
 * their Quest, not a menu of their own (|M895). A Quest is a Draft until it's
 * opened to players; then players see it on Your quests, with its Challenges
 * as its list. A Quest marked as a test shows only to admins, and its XP
 * isn't counted. The first quest stays as it is (Quest.js).
 */
var QB_COL = { id: 1, name: 2, says: 3, from: 4, to: 5, segments: 6, bonus: 7, state: 8, test: 9, by: 10, made: 11 };
var QUEST_STATES = ['Draft', 'Open', 'Retired'];

function questBenchAll_() {
  return readRows_(TABS.questBench, QB_COL).map(function (r) {
    var d = function (k) { var v = r.get(k); return v instanceof Date ? v.getTime() : 0; };
    var st = String(r.get('state')).trim();
    return { row: r.row, id: r.get('id'), name: r.get('name'), says: r.get('says'), from: d('from'), to: d('to'),
      segments: String(r.get('segments')).split(/[\s,]+/).filter(String), bonus: Number(r.get('bonus')) || 0,
      state: QUEST_STATES.indexOf(st) !== -1 ? st : 'Draft', test: /^\s*y/i.test(r.get('test')), by: r.get('by'), made: d('made') };
  }).filter(function (q) { return q.id; });
}

// Open to players now: opened, and between its dates.
function questLive_(q, at) { return q.state === 'Open' && (!q.from || at >= q.from) && (!q.to || at < q.to + DAY_MS); }

// A Challenge's window and ground: its Quest's, or its own for one made before Quests.
function challengeScope_(c, quests) {
  var q = c.quest ? quests[c.quest] : null;
  return { from: q ? q.from : c.from, to: q ? q.to : c.to, segments: q ? q.segments : [], quest: q };
}

// The squares of some segments, as a set.
function squaresOf_(ids) {
  var want = {}, out = {};
  ids.forEach(function (id) { want[id] = true; });
  segmentsAll_().forEach(function (g) { if (want[g.id]) g.squares.forEach(function (c) { out[c] = true; }); });
  return out;
}

// One player's Quest: each Challenge's progress, whether all are done, and its XP.
function questProgress_(q, accountId, list, items, skills, now) {
  var mine = list.filter(function (c) { return c.quest === q.id; });
  var views = mine.map(function (c) { return challengeView_(c, { id: accountId }, items, now, skills); });
  var done = views.length > 0 && views.every(function (v) { return v.progress.done; });
  var xp = views.reduce(function (t, v) { return t + v.progress.xp; }, 0) + (done ? q.bonus : 0);
  return { challenges: views, done: done, xp: round_(xp, 2) };
}

// What a player sees of a Quest.
function benchQuestView_(q, account, list, items, skills, now, names) {
  var p = questProgress_(q, account.id, list, items, skills, now);
  var squares = segmentsAll_().filter(function (g) { return q.segments.indexOf(g.id) !== -1; });
  return { id: q.id, name: q.name, says: q.says, from: q.from, to: q.to, live: questLive_(q, now), state: q.state, test: q.test, bonus: q.bonus,
    segments: squares.map(function (g) { return { id: g.id, name: g.name, squares: g.squares }; }),
    challenges: p.challenges, done: p.done, xp: p.xp };
}

/* ── Admin Mode: the Bench ── */

function questSave_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!account.rank || !rankAtLeast_(account.rank, 'Builder')) throw new Error('A Builder or above drafts Quests.');
  var x = req.quest || {};
  var name = clean_(x.name, 80), says = clean_(x.says, 1000);
  if (!name) throw new Error('Give the Quest a name.');
  var day = function (k, label) {
    var v = String(x[k] || '').trim();
    if (!v) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(label + ' is a date, like 2026-11-30.');
    return Utilities.parseDate(v + ' 00:00', Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  };
  var from = day('from', 'From'), to = day('to', 'To');
  if (from && to && to.getTime() < from.getTime()) throw new Error('To comes after From.');
  var bonus = x.bonus === '' || x.bonus == null ? 0 : Number(x.bonus);
  if (!isFinite(bonus) || bonus < 0 || bonus > 1000) throw new Error('The finishing bonus is from 0 to 1000 XP.');
  var accepted = {};
  segmentsAll_().forEach(function (g) { if (g.accepted) accepted[g.id] = true; });
  var segs = (Array.isArray(x.segments) ? x.segments : []).map(function (s) { return clean_(s, 20); }).filter(function (s, i, a) { return accepted[s] && a.indexOf(s) === i; });
  return withLock_(function () {
    var sheet = getDb_().getSheetByName(TABS.questBench.name), all = questBenchAll_();
    var id = clean_(x.id, 20), had = id ? all.filter(function (q) { return q.id === id; })[0] : null;
    if (id && !had) throw new Error('That Quest isn\'t here any more.');
    var row = had ? sheet.getRange(had.row, 1, 1, TABS.questBench.header.length).getValues()[0] : blankRow_(TABS.questBench);
    row[QB_COL.name - 1] = safeCell_(name); row[QB_COL.says - 1] = safeCell_(says); row[QB_COL.from - 1] = from; row[QB_COL.to - 1] = to;
    row[QB_COL.segments - 1] = segs.join(' '); row[QB_COL.bonus - 1] = bonus; row[QB_COL.test - 1] = x.test ? 'Yes' : '';
    if (!had) {
      row[QB_COL.id - 1] = nextId_('QB', all.map(function (q) { return q.id; }));
      row[QB_COL.state - 1] = 'Draft'; row[QB_COL.by - 1] = account.handle || account.email; row[QB_COL.made - 1] = new Date();
    }
    sheet.getRange(had ? had.row : lastRowWith_(sheet, QB_COL.id) + 1, 1, 1, row.length).setValues([row]);
    logChange_(account.email, 'Quest', row[QB_COL.id - 1], had ? 'Changed' : 'Drafted', had ? had.name : '', name);
    var out = challengesAdminView_(account);
    out.saved = row[QB_COL.id - 1];
    return out;
  });
}

// Open a Draft to players, retire it, or open it again. Opening needs a Challenge.
function questState_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!account.rank || !rankAtLeast_(account.rank, 'Builder')) throw new Error('A Builder or above drafts Quests.');
  var to = QUEST_STATES.indexOf(req.state) !== -1 ? req.state : '';
  if (!to || to === 'Draft') throw new Error('A Quest can be opened or retired.');
  return withLock_(function () {
    var q = questBenchAll_().filter(function (x) { return x.id === clean_(req.questId, 20); })[0];
    if (!q) throw new Error('That Quest isn\'t here any more.');
    if (to === 'Open' && !challengesAll_().some(function (c) { return c.quest === q.id && c.state === 'Open'; })) throw new Error('Add a Challenge to it first: a Quest is its list of Challenges.');
    getDb_().getSheetByName(TABS.questBench.name).getRange(q.row, QB_COL.state).setValue(to);
    logChange_(account.email, 'Quest', q.id, 'State', q.state, to);
    return challengesAdminView_(account);
  });
}

/* ── Once: a Quest marked as a test, for Jeremy to try the Bench with (|M978) ── */

function questBenchOnce_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('QUEST_BENCH_SEEDED')) return;
  var sheet = getDb_().getSheetByName(TABS.questBench.name);
  if (lastRowWith_(sheet, QB_COL.id) < 2) {
    var segs = segmentsAll_().filter(function (g) { return g.accepted && g.kind !== 'Field'; }).slice(0, 3).map(function (g) { return g.id; });
    var now = new Date(), tz = Session.getScriptTimeZone();
    var from = Utilities.parseDate(Utilities.formatDate(now, tz, 'yyyy-MM-dd') + ' 00:00', tz, 'yyyy-MM-dd HH:mm');
    var to = new Date(from.getTime() + 30 * DAY_MS);
    var row = blankRow_(TABS.questBench);
    row[QB_COL.id - 1] = 'QB001'; row[QB_COL.name - 1] = 'A test Quest'; row[QB_COL.from - 1] = from; row[QB_COL.to - 1] = to;
    row[QB_COL.says - 1] = 'A Quest marked as a test, to try the Quest Drafting Bench with: only admins see it, and its XP isn\'t counted. Change it, or retire it.';
    row[QB_COL.segments - 1] = segs.join(' '); row[QB_COL.bonus - 1] = 10; row[QB_COL.state - 1] = 'Open'; row[QB_COL.test - 1] = 'Yes';
    row[QB_COL.by - 1] = 'HABO'; row[QB_COL.made - 1] = now;
    sheet.getRange(2, 1, 1, row.length).setValues([row]);
    var cs = getDb_().getSheetByName(TABS.challenges.name), ids = readRows_(TABS.challenges, CHALLENGE_COL).map(function (r) { return r.get('id'); });
    var trash = toolSkillsAll_().filter(function (s) { return s.state === 'Open'; })[0];
    var add = function (put) {
      var c = blankRow_(TABS.challenges), id = nextId_('CH', ids);
      ids.push(id);
      put.id = id; put.quest = 'QB001'; put.state = 'Open'; put.by = 'HABO'; put.made = now; put.mult = 1;
      Object.keys(put).forEach(function (k) { c[CHALLENGE_COL[k] - 1] = put[k]; });
      cs.getRange(lastRowWith_(cs, CHALLENGE_COL.id) + 1, 1, 1, c.length).setValues([c]);
    };
    var two = segs.length >= 2, on = segs.length ? ' near its segments' : '';
    add(two ? { name: 'Collect 0.5 mi on its segments, across 2 of them', says: 'Collect along its segments: half a mile in all, on at least 2 of them.', kind: 'Walk goal', milesGoal: 0.5, segGoal: 2, xpPer: 0.1, xpOne: 1 }
      : { name: 'Collect 0.5 mi' + (segs.length ? ' on its segment' : ''), says: 'Collect litter' + (segs.length ? ' along its segment' : '') + ': half a mile in all.', kind: 'Walk goal', milesGoal: 0.5, segGoal: '', xpPer: 0.1, xpOne: '' });
    if (trash) add({ name: '3 ' + trash.name + on, says: 'Use ' + trash.name + ' from Skills' + on + ': 3 approved.', kind: 'Skill goal', skill: trash.id, goal: 3, xpOne: 1 });
    forgetReads_();
  }
  props.setProperty('QUEST_BENCH_SEEDED', new Date().toISOString());
}
