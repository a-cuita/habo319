/**
 * Quests a player takes on, and the Questmaster (S7-P4 items 16 to 24,
 * |Q849, |Q850, |Q851, |Q866 to |Q869, |Q884, |Q885).
 *
 * A player takes on any number of Quests from the Questmaster, in Street
 * Talk, and has one active Quest at a time, like the board's one active
 * slice (|Q851). Walks and skills count toward the active Quest only; a
 * waiting Quest keeps its progress until it's made active again. A player
 * can have no active Quest (|Q866's addendum): then walks count toward none.
 * A skill's own XP is earned as before, whichever Quest is active.
 *
 * Kept in each player's own XP tab (item 24, |S7-P1): a "Quest log" row for
 * each move (taken on, made active, no active Quest, finished), with no XP.
 * Accounts' "Quests taken" lists each one taken and finished, with when, for
 * the lines everyone sees in Street Talk (|Q884 (a)).
 *
 * Before this, every Open Quest counted for every player (|Q750 (a)). What
 * was earned then stays: up to the moment this first ran, every Quest counts
 * for everyone as it did; from then on, only the active one.
 */
var QUEST_LOG = 'Quest log';
var SETTING_QM_NAME = 'Street Talk: Questmaster name';
var SETTING_RH_QUEST = 'Street Talk: announce a Quest taken or finished';
var QM_DEFAULT = 'The Questmaster';

function qmName_() { return String(getSetting_(SETTING_QM_NAME) || '').trim() || QM_DEFAULT; }
// A Quest's number, as players type it: QB003 is 3.
function questNum_(id) { return Number(String(id || '').replace(/\D/g, '')) || 0; }
// Until when every Quest counted for everyone (|Q750 (a)): the first request after the Deploy.
function questsLegacyEnd_() { return Number(PropertiesService.getScriptProperties().getProperty('QUESTS_TAKEN_FROM')) || 0; }
function questsTakenOnce_() {
  var props = PropertiesService.getScriptProperties();
  if (!props.getProperty('QUESTS_TAKEN_FROM')) props.setProperty('QUESTS_TAKEN_FROM', String(Date.now()));
}
function inSpans_(at, spans) {
  for (var i = 0; i < spans.length; i++) if (at >= spans[i][0] && at < spans[i][1]) return true;
  return false;
}

// The Quest log rows that hold, in time order. A finish taken back (S7-P4,
// |Q913 (a)): when a change to a Quest means a player's finish no longer
// holds, an undone row is written, and the finish before it is as if it never
// was: the Quest stays their active one through that time, so a walk then counts.
function questLogLive_(rows) {
  var log = rows.filter(function (r) { return r.kind === QUEST_LOG && r.detail && r.detail.move; }).sort(function (a, b) { return a.at - b.at; });
  var undone = {};
  log.forEach(function (r) { if (r.detail.move === 'undone') (undone[r.detail.quest] = undone[r.detail.quest] || []).push(r.at); });
  return log.filter(function (r) {
    if (r.detail.move === 'undone') return false;
    return r.detail.move !== 'done' || !(undone[r.detail.quest] || []).some(function (t) { return t >= r.at; });
  });
}
// One player's Quests, from the Quest log rows in their tab: { taken: {id: at},
// finished: {id: at}, active: id or '', spans: {id: [[from, to]]}, order: [ids] }.
function questsOf_(accountId, rows) {
  rows = rows || xpRows_(accountId);
  var out = { taken: {}, finished: {}, active: '', since: 0, spans: {}, order: [] };
  var close = function (at) {
    if (out.active) (out.spans[out.active] = out.spans[out.active] || []).push([out.since, at]);
    out.active = ''; out.since = 0;
  };
  questLogLive_(rows).forEach(function (r) {
    var q = r.detail.quest || '', m = r.detail.move;
    if (m === 'take' && q && !out.taken[q]) { out.taken[q] = r.at; out.order.push(q); }
    else if (m === 'active' && q && out.active !== q) { close(r.at); out.active = q; out.since = r.at; }
    else if (m === 'none') close(r.at);
    else if (m === 'done' && q) { out.finished[q] = r.at; if (out.active === q) close(r.at); }
  });
  if (out.active) (out.spans[out.active] = out.spans[out.active] || []).push([out.since, Infinity]);
  return out;
}
// When a Quest's walks and skills count for this player: before the
// Questmaster, for everyone; then while it's their active Quest.
function questSpans_(st, questId) {
  var legacy = questsLegacyEnd_();
  return (legacy ? [[0, legacy]] : []).concat((st && st.spans[questId]) || []);
}

// Open to this player now: opened, between its dates, with a Challenge, a
// test only for admins, and its Opens after finished (item 15, |Q848 (a)).
function questOpenTo_(q, account, st, now, live) {
  if (!questLive_(q, now) || (q.test && !account.rank)) return false;
  if (!live[q.id]) return false;
  if (q.after && !st.finished[q.after]) return false;
  return true;
}
// When a Quest opened to this player: its dates began, it was opened, or they
// finished the one it opens after; never before the Questmaster came.
function questOpenedAt_(q, st) {
  return Math.max(q.from || 0, q.opened || q.made || 0, q.after ? st.finished[q.after] || 0 : 0, questsLegacyEnd_());
}
function questsWithChallenges_() {
  var live = {};
  challengesAll_().forEach(function (c) { if (c.quest && c.state === 'Open') live[c.quest] = (live[c.quest] || 0) + 1; });
  return live;
}

/* ── Moves: written to the player's tab ── */

function questLog_(account, move, q, say) {
  xpWrite_(account.id, [{ at: Date.now(), kind: QUEST_LOG, say: say, xp: 0, key: 'quest-log:' + (q ? q.id : 'none') + ':' + move + ':' + Date.now(), detail: { quest: q ? q.id : '', move: move } }]);
  questsAccount_(account.id);
}
// Accounts' "Quests taken": "QB003 taken 2026-11-21 14:05; QB003 finished 2026-11-25 09:00".
function questsAccount_(accountId, rows) {
  var a = readAccounts_().filter(function (x) { return x.id === accountId; })[0];
  if (!a) return;
  var tz = Session.getScriptTimeZone(), parts = [];
  questLogLive_(rows || xpRows_(accountId)).filter(function (r) { return r.detail.move === 'take' || r.detail.move === 'done'; }).forEach(function (r) {
      parts.push(r.detail.quest + ' ' + (r.detail.move === 'take' ? 'taken' : 'finished') + ' ' + Utilities.formatDate(new Date(r.at), tz, 'yyyy-MM-dd HH:mm'));
    });
  var text = parts.join('; ');
  if (a.quests === text) return;
  setAccountCells_(a.row, { quests: text });
  forgetReads_();
}
function questsTakenText_(text) {
  var out = [], re = /(QB\d+) (taken|finished) (\d{4}-\d{2}-\d{2} \d{2}:\d{2})/g, m, tz = Session.getScriptTimeZone();
  while ((m = re.exec(String(text || '')))) out.push({ quest: m[1], move: m[2], at: Utilities.parseDate(m[3], tz, 'yyyy-MM-dd HH:mm').getTime() });
  return out;
}
// Finished: written when a settle finds every Challenge of a Quest done, for
// a Quest the player took on. It's no longer their active Quest then.
function questsFinishedRows_(accountId, rows, dues) {
  var st = questsOf_(accountId, rows), names = {}, add = [], now = Date.now();
  questBenchAll_().forEach(function (q) { names[q.id] = q.name; });
  var again = {};   // finished before, then taken back: a new key for each finish
  rows.forEach(function (r) { if (r.kind === QUEST_LOG && r.detail && r.detail.move === 'undone') again[r.detail.quest] = true; });
  dues.forEach(function (d) {
    if (d.kind !== 'Quest' || !d.quest || !st.taken[d.quest]) return;
    if (d.done && !st.finished[d.quest])
      add.push({ at: now, kind: QUEST_LOG, say: 'Finished the Quest ' + (names[d.quest] || d.quest), xp: 0, key: 'quest-log:' + d.quest + ':done' + (again[d.quest] ? ':' + now : ''), detail: { quest: d.quest, move: 'done' } });
    // A change to the Quest means its finish no longer holds (|Q913 (a)).
    else if (!d.done && st.finished[d.quest])
      add.push({ at: now, kind: QUEST_LOG, say: 'The Quest ' + (names[d.quest] || d.quest) + ' isn\'t finished any more: it was changed', xp: 0, key: 'quest-log:' + d.quest + ':undone:' + now, detail: { quest: d.quest, move: 'undone' } });
  });
  // Unfinished, it's their active Quest again, unless another is.
  var back = add.filter(function (r) { return r.detail.move === 'undone'; });
  if (back.length && !questsOf_(accountId, rows.concat(add)).active) {
    var q = back[0].detail.quest;
    add.push({ at: now, kind: QUEST_LOG, say: 'Made ' + (names[q] || q) + ' your active Quest again', xp: 0, key: 'quest-log:' + q + ':active:' + now, detail: { quest: q, move: 'active' } });
  }
  return add;
}

/* ── What a player sees ── */

// Street Talk's lines about everyone: a Quest taken on, or finished (|Q884 (a)). Not a test Quest.
function questAnnounceLines_(shown) {
  if (!rhOn_(SETTING_RH_QUEST)) return [];
  var quests = {}, lines = [];
  questBenchAll_().forEach(function (q) { quests[q.id] = q; });
  readAccounts_().forEach(function (a) {
    questsTakenText_(a.quests).forEach(function (e) {
      var q = quests[e.quest];
      if (!q || q.test) return;
      lines.push({ at: e.at, who: shown[a.id] || 'A volunteer', account: a.id, kind: 'quest',
        text: e.move === 'taken' ? 'took on the Quest ' + q.name + '.' : 'finished the Quest ' + q.name + '!' });
    });
  });
  return lines;
}
// The Questmaster's word to one player when a Quest opens to them (|Q885 (a)),
// and still there for quests (|M1390).
function qmTells_(account) {
  var st = questsOf_(account.id), now = Date.now(), live = questsWithChallenges_(), name = qmName_();
  return questBenchAll_().filter(function (q) { return !st.taken[q.id] && questOpenTo_(q, account, st, now, live); }).map(function (q) {
    var n = questNum_(q.id);
    return { at: questOpenedAt_(q, st), kind: 'qm', who: name, id: 'qm-' + q.id, mine: false,
      text: 'tells you, "' + q.name + ' is open to you now. Type about ' + n + ' to hear of it."', actions: [{ label: 'Tell me more', command: 'about ' + n }] };
  }).filter(function (l) { return l.at; });
}

// The Questmaster's answers, a line each: { qm: true, who, text, actions }.
function qmLine_(text, actions) { return { qm: true, who: qmName_(), text: text, actions: actions || [] }; }
function questCommand_(account, typed) {
  var c = String(typed || '').trim().toLowerCase().replace(/\s+/g, ' '), m;
  if (c === 'quests' || c === 'questmaster') return qmQuests_(account);
  if ((m = /^about (\d+)$/.exec(c))) return qmAbout_(account, Number(m[1]));
  if ((m = /^accept (\d+)$/.exec(c))) return qmAccept_(account, Number(m[1]));
  if ((m = /^active(?: (\d+|none))?$/.exec(c))) return qmActive_(account, m[1] == null ? '' : m[1]);
  return null;
}
function questState_word_(st, id) { return st.finished[id] ? 'finished' : st.active === id ? 'your active Quest' : st.taken[id] ? 'waiting' : ''; }
function qmQuests_(account) {
  var st = questsOf_(account.id), now = Date.now(), live = questsWithChallenges_();
  var list = questBenchAll_().filter(function (q) { return questOpenTo_(q, account, st, now, live) || (st.taken[q.id] && questLive_(q, now)); })
    .sort(function (p, q) { return questNum_(p.id) - questNum_(q.id); });
  if (!list.length) return [qmLine_('"Nothing\'s open to you just now, ' + (account.handle || 'friend') + '. Come back soon."')];
  return [qmLine_('"Here\'s what\'s open to you, ' + (account.handle || 'friend') + '. Tell me more, or accept one."')].concat(list.map(function (q) {
    var n = questNum_(q.id), s = questState_word_(st, q.id), k = live[q.id] || 0;
    var acts = [{ label: 'Tell me more', command: 'about ' + n }];
    if (!st.taken[q.id]) acts.push({ label: 'Accept', command: 'accept ' + n });
    return { text: '  ' + n + '. ' + q.name + ' · ' + questDates_(q) + ' · ' + k + (k === 1 ? ' Challenge' : ' Challenges') + (q.bonus ? ' · +' + q.bonus + ' XP to finish' : '') + (s ? ' · ' + s : '') + (q.test ? ' · a test' : ''), actions: acts };
  }));
}
function questDates_(q) {
  var f = function (ms) { return Utilities.formatDate(new Date(ms), Session.getScriptTimeZone(), 'MMM d'); };
  return q.from && q.to ? f(q.from) + ' to ' + f(q.to) : q.to ? 'until ' + f(q.to) : q.from ? 'from ' + f(q.from) : 'any time';
}
function qmFind_(account, n) {
  var q = questBenchAll_().filter(function (x) { return questNum_(x.id) === n && x.state !== 'Draft' && (!x.test || account.rank); })[0];
  return q || null;
}
function qmAbout_(account, n) {
  var q = qmFind_(account, n), st = questsOf_(account.id), now = Date.now(), live = questsWithChallenges_();
  if (!q || (!st.taken[q.id] && !questOpenTo_(q, account, st, now, live))) return [qmLine_('"I know of no Quest ' + n + ' for you. Type quests for the ones open to you."')];
  var names = {}, skills = {};
  segmentsAll_().forEach(function (g) { names[g.id] = g.name; });
  toolSkillsAll_().forEach(function (s) { skills[s.id] = s.name; });
  var chs = challengesAll_().filter(function (c) { return c.quest === q.id && c.state === 'Open'; });
  var after = q.after ? questBenchAll_().filter(function (x) { return x.id === q.after; })[0] : null;
  var out = [qmLine_('"' + q.name + '. ' + (q.says || 'A Quest of ' + chs.length + (chs.length === 1 ? ' Challenge.' : ' Challenges.')) + '"')];
  out.push({ text: '  ' + questDates_(q) + (q.bonus ? ' · +' + q.bonus + ' XP once every Challenge is done' : '') + (after ? ' · opened by finishing ' + after.name : '') });
  if (q.segments.length) out.push({ text: '  On ' + andList_(q.segments.map(function (id) { return names[id] || id; })) + '.' });
  chs.forEach(function (c, i) {
    var cond = c.kind === 'Walk goal' ? 'collect ' + [c.milesGoal ? c.milesGoal + ' mi' : '', c.segGoal ? c.segGoal + ' different segments' : ''].filter(String).join(', across ')
      : c.goal + ' ' + (skills[c.skill] || 'a skill') + ' approved';
    out.push({ text: '  Challenge ' + (i + 1) + ': ' + c.name + ' (' + cond + ')' });
  });
  var s = questState_word_(st, q.id), acts = [];
  if (!st.taken[q.id]) acts.push({ label: 'Accept', command: 'accept ' + n });
  else if (!st.finished[q.id] && st.active !== q.id) acts.push({ label: 'Make it active', command: 'active ' + n });
  out.push(qmLine_(s ? '"You\'ve taken it on: it\'s ' + s + '."' : '"Will you take it on?"', acts));
  return out;
}
function qmAccept_(account, n) {
  var q = qmFind_(account, n);
  return withLock_(function () {
    var st = questsOf_(account.id), now = Date.now(), live = questsWithChallenges_();
    if (!q || (!st.taken[q.id] && !questOpenTo_(q, account, st, now, live))) return [qmLine_('"I know of no Quest ' + n + ' for you. Type quests for the ones open to you."')];
    if (st.taken[q.id]) return [qmLine_('"You\'ve taken on ' + q.name + ' already: it\'s ' + questState_word_(st, q.id) + '."')];
    questLog_(account, 'take', q, 'Took on the Quest ' + q.name);
    if (!st.active) {
      questLog_(account, 'active', q, 'Made ' + q.name + ' your active Quest');
      return [qmLine_('"Then it\'s yours. ' + q.name + ' is your active Quest now: your walks and skills count toward it."')];
    }
    var cur = questBenchAll_().filter(function (x) { return x.id === st.active; })[0];
    // |Q867 (a), with Jeremy's addendum: it waits, and the Questmaster asks.
    return [qmLine_('"Then it\'s yours. It waits: ' + (cur ? cur.name : 'your active Quest') + ' is still your active Quest. Make ' + q.name + ' your active Quest?"',
      [{ label: 'Make it active', command: 'active ' + n }])];
  });
}
// active 3, active none, or active alone: what's active now.
function qmActive_(account, which) {
  return withLock_(function () {
    var st = questsOf_(account.id), all = questBenchAll_(), name = function (id) { var q = all.filter(function (x) { return x.id === id; })[0]; return q ? q.name : id; };
    if (!which) return [qmLine_(st.active ? '"Your active Quest is ' + name(st.active) + '."' : '"You have no active Quest: your walks count toward none. Type active and a number to pick one."')];
    if (which === 'none') {
      if (!st.active) return [qmLine_('"You have no active Quest already."')];
      questLog_(account, 'none', null, 'Stopped counting on ' + name(st.active));
      return [qmLine_('"So be it: no active Quest. ' + name(st.active) + ' waits, its progress kept, and your walks count toward none until you pick one."')];
    }
    var q = qmFind_(account, Number(which));
    if (!q || !st.taken[q.id]) return [qmLine_('"You haven\'t taken on Quest ' + which + '. Type quests to see what\'s open."')];
    if (st.finished[q.id]) return [qmLine_('"You\'ve finished ' + q.name + ' already."')];
    if (st.active === q.id) return [qmLine_('"' + q.name + ' is your active Quest already."')];
    var was = st.active;
    questLog_(account, 'active', q, 'Made ' + q.name + ' your active Quest');
    return [qmLine_('"' + q.name + ' is your active Quest now.' + (was ? ' ' + name(was) + ' waits, its progress kept.' : '') + '"')];
  });
}

// Your quests' buttons: Make active, and Stop counting (items 21, 22).
function questActive_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var id = String(req.questId || '');
  var lines = qmActive_(account, id === 'none' ? 'none' : String(questNum_(id)));
  var out = challengesFor_(account);
  out.said = lines.map(function (l) { return l.text.replace(/^"|"$/g, ''); }).join(' ');
  return out;
}
