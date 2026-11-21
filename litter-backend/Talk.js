/**
 * Street Talk's last three commands (S7-P10 items 3 to 5, |Q893): tell, a
 * line one player writes to one other; board, the message board's topics and
 * notes; and who, the players on the litter page in the last ten minutes.
 * gchat and the announcements are in Scroll.js.
 *
 * tell waited for Report and an admin able to read a reported line (|Q763
 * (b)): the player it was sent to can report it, and an admin in Admin Mode
 * sees it in Street Talk once reported, with Remove. Every account is 18 or
 * older (sign-up refuses otherwise), so a tell is between adults.
 */

var SETTING_TELL = 'Street Talk: tell';
var SETTING_BOARD = 'Street Talk: board';
var TELL_COL = { id: 1, from: 2, to: 3, written: 4, text: 5, removedBy: 6, removed: 7, reportedBy: 8, reported: 9 };
var BOARD_COL = { id: 1, topic: 2, account: 3, written: 4, text: 5, removedBy: 6, removed: 7, reportedBy: 8, reported: 9 };
// who: the players seen in the last ten minutes, kept in the script's cache.
var HERE_SECONDS = 600;

function talkTime_(v) { return v instanceof Date ? v.getTime() : 0; }
// safeCell_'s ' before a line like "=1+1" is the Sheet's, not the player's.
function talkText_(v) { return String(v == null ? '' : v).replace(/^'(?=[=+\-@])/, ''); }
// What a player typed, in one line, held to the line length (Settings, Street Talk).
function talkWords_(words, say) {
  var text = String(words || '').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error(say);
  var max = gchatMax_();
  if (text.length > max) throw new Error('Keep it to ' + max + ' characters: that was ' + text.length + '.');
  return text;
}
function talkNextId_(prefix, ids) {
  var n = ids.reduce(function (m, id) { return String(id).indexOf(prefix) === 0 ? Math.max(m, Number(String(id).slice(prefix.length)) || 0) : m; }, 0) + 1;
  return prefix + ('0000' + n).slice(-Math.max(4, String(n).length));
}
function handlesById_() {
  var h = {};
  readAccounts_().forEach(function (a) { h[a.id] = a.handle; });
  return h;
}

/* ── who (item 5) ── */

// Each request a player makes marks them here for ten minutes.
function markHere_(accountId) {
  try { CacheService.getScriptCache().put('here:' + accountId, String(Date.now()), HERE_SECONDS); } catch (e) { /* who is a nicety; a request never fails for it */ }
}
function whoLines_(account) {
  var accounts = readAccounts_().filter(function (a) { return a.active; });
  var got = {};
  try { got = CacheService.getScriptCache().getAll(accounts.map(function (a) { return 'here:' + a.id; })) || {}; } catch (e) { got = {}; }
  var now = Date.now(), shown = shownNames_(), named = [], unnamed = 0;
  accounts.forEach(function (a) {
    var at = Number(got['here:' + a.id]) || (a.id === account.id ? now : 0);
    if (!at || now - at > HERE_SECONDS * 1000) return;
    if (shown[a.id]) named.push(shown[a.id] + (a.id === account.id ? ' (you)' : ''));
    else unnamed++;
  });
  named.sort(function (p, q) { return p.toLowerCase() < q.toLowerCase() ? -1 : 1; });
  var n = named.length + unnamed;
  return ['On the litter page in the last 10 minutes: ' + n + (n === 1 ? ' player.' : ' players.')]
    .concat(named.map(function (s) { return '  ' + s; }))
    .concat(unnamed ? ['  …and ' + unnamed + ' more, not shown by name.'] : []);
}

/* ── tell (item 3) ── */

function tellRows_() {
  return readRows_(TABS.tells, TELL_COL).map(function (r) {
    return { row: r.row, id: String(r.get('id')), from: String(r.get('from')).trim(), to: String(r.get('to')).trim(), at: talkTime_(r.get('written')),
      text: talkText_(r.get('text')), removed: !!String(r.get('removedBy')).trim(), reported: !!String(r.get('reportedBy')).trim(), reportedAt: talkTime_(r.get('reported')) };
  }).filter(function (t) { return t.id && t.at; });
}
// Your tells, sent and received; for an admin in Admin Mode, also every
// reported one, at the time it was reported, to remove.
function tellLines_(account, admin) {
  if (!rhOn_(SETTING_TELL)) return [];
  var handle = handlesById_(), out = [];
  tellRows_().forEach(function (t) {
    if (t.removed) return;
    var base = { kind: 'tell', id: t.id, who: handle[t.from] || 'A volunteer', to: handle[t.to] || 'a volunteer', text: t.text, reported: t.reported };
    if (t.from === account.id || t.to === account.id) out.push(Object.assign({ at: t.at, mine: t.from === account.id, toMe: t.to === account.id }, base));
    else if (admin && t.reported) out.push(Object.assign({ at: t.reportedAt || t.at, mine: false, toMe: false, flagged: true }, base));
  });
  return out;
}
// tell, a handle and your words: "tell carmen good morning", the @ optional.
function tellSay_(account, rest) {
  if (!rhOn_(SETTING_TELL)) throw new Error('tell is off just now.');
  var m = /^@?(\S+)(?:\s+([\s\S]*))?$/.exec(String(rest || '').trim());
  if (!m) throw new Error('Type tell, a handle, then your words, like "tell carmen good morning!"');
  var to = readAccounts_().filter(function (a) { return a.active && a.handle.toLowerCase() === m[1].toLowerCase(); })[0];
  if (!to) throw new Error('Nobody has the handle "' + m[1].slice(0, 40) + '". Check its spelling; who shows who\'s here.');
  if (to.id === account.id) throw new Error('That\'s your own handle.');
  var text = talkWords_(m[2], 'Type tell ' + to.handle + ', then your words.');
  return forumLock_(function () {
    var rows = tellRows_(), now = Date.now();
    if (rows.some(function (t) { return t.from === account.id && now - t.at < 3000; })) throw new Error('One line at a time: try again in a moment.');
    var id = talkNextId_('L', rows.map(function (t) { return t.id; }));
    var sheet = getDb_().getSheetByName(TABS.tells.name);
    sheet.getRange(lastRowWith_(sheet, 1) + 1, 1, 1, 5).setValues([[id, account.id, to.id, new Date(now), safeCell_(text)]]);
    try { coldMove_(TABS.tells, 'Tells'); } catch (e) { /* a line is never lost for want of cold storage; it moves next time */ }
    forgetReads_();
    return { at: now, kind: 'tell', id: id, who: account.handle, to: to.handle, text: text, mine: true, toMe: false, reported: false };
  });
}
function tellFind_(id) {
  var t = tellRows_().filter(function (x) { return x.id === String(id || ''); })[0];
  if (!t || t.removed) throw new Error('That line is gone already.');
  return t;
}
// Report: only the player it was sent to; marked on its row, and a Report in
// the Forum, as gchat's is, so the admins are told.
function tellReport_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  return forumLock_(function () {
    var t = tellFind_(req.lineId);
    if (t.to !== account.id) throw new Error('Only the player it was sent to can report it.');
    if (t.reported) return { reported: true };
    getDb_().getSheetByName(TABS.tells.name).getRange(t.row, TELL_COL.reportedBy, 1, 2).setValues([[account.id, new Date()]]);
    var handle = handlesById_();
    topicNew_(account, 'Report', 'tell ' + t.id + ' reported', 'A tell in Street Talk, reported by ' + (handle[account.id] || account.id) + ', who it was sent to:\n"' + t.text + '"\n'
      + 'From ' + (handle[t.from] || t.from) + ', ' + scrollWhen_(t.at) + ' (' + t.id + ').\nTo remove it: in Admin Mode, open Street Talk and press Remove on it.', 'New', 'Issue');
    forgetReads_();
    return { reported: true };
  });
}
// Remove: an admin's, on a reported tell, kept on its row with who and when.
function tellRemove_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!account.rank) throw new Error('Removing a line is for HABO\'s admins.');
  return forumLock_(function () {
    var t = tellFind_(req.lineId);
    getDb_().getSheetByName(TABS.tells.name).getRange(t.row, TELL_COL.removedBy, 1, 2).setValues([[account.id, new Date()]]);
    logChange_(account.email, 'Tells', t.id, 'Removed', '', t.text);
    forgetReads_();
    return { removed: t.id };
  });
}

/* ── board (item 4) ── */

// Each topic, numbered in the order they were started, with its notes.
function boardTopics_() {
  var rows = readRows_(TABS.board, BOARD_COL).map(function (r) {
    return { row: r.row, id: String(r.get('id')).trim(), topic: String(r.get('topic')).trim(), account: String(r.get('account')).trim(), at: talkTime_(r.get('written')),
      text: talkText_(r.get('text')), removed: !!String(r.get('removedBy')).trim(), reported: String(r.get('reportedBy') || '').trim() };
  }).filter(function (b) { return b.id && b.at; });
  var topics = rows.filter(function (b) { return !b.topic; }).sort(function (p, q) { return p.at - q.at || (p.id < q.id ? -1 : 1); });
  var byId = {};
  topics.forEach(function (t, i) { t.n = i + 1; t.notes = []; byId[t.id] = t; });
  rows.forEach(function (b) { if (b.topic && byId[b.topic]) byId[b.topic].notes.push(b); });
  topics.forEach(function (t) {
    t.notes.sort(function (p, q) { return p.at - q.at || (p.id < q.id ? -1 : 1); });
    t.notes.forEach(function (b, i) { b.n = i + 1; });
    t.last = t.notes.filter(function (b) { return !b.removed; }).reduce(function (m, b) { return Math.max(m, b.at); }, t.at);
  });
  return { all: rows, topics: topics };
}
function boardShort_(text, n) { return text.length > n ? text.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : text; }
// A topic's or a note's line, as the page shows it: Report on someone
// else's, Remove in Admin Mode.
function boardLine_(b, text, account, shown) {
  return { text: text, note: b.id, mine: b.account === account.id, reported: b.reported.split(/\s+/).indexOf(account.id) !== -1 };
}
function boardCommand_(account, rest) {
  if (!rhOn_(SETTING_BOARD)) return ['The board is off just now.'];
  rest = String(rest || '').trim();
  var shown = shownNames_(), who = function (id) { return shown[id] || 'A volunteer'; };
  var m;
  if (!rest) {
    var live = boardTopics_().topics.filter(function (t) { return !t.removed; }).sort(function (p, q) { return q.last - p.last; });
    if (!live.length) return ['The board is empty. Type board write and your words to start a topic.'];
    return ['The board, newest first. Type board and a number to read one:'].concat(live.slice(0, 20).map(function (t) {
      var k = t.notes.filter(function (b) { return !b.removed; }).length;
      return '  ' + t.n + '. ' + boardShort_(t.text, 70) + ' · ' + who(t.account) + ' · ' + k + (k === 1 ? ' note' : ' notes') + ' · ' + scrollWhen_(t.last);
    })).concat(live.length > 20 ? ['  …and ' + (live.length - 20) + ' older topics.'] : []);
  }
  if ((m = /^write(?:\s+([\s\S]*))?$/i.exec(rest))) {
    var text = talkWords_(m[1], 'Type board write, then your words, like "board write Bags left at the Elm St dumpster".');
    var made = boardWrite_(account, '', text);
    return ['Topic ' + made.n + ' is on the board. Type board ' + made.n + ' to read it.'];
  }
  if ((m = /^(\d+)(?:\s+([\s\S]*))?$/.exec(rest))) {
    var n = Number(m[1]), topic = boardTopics_().topics.filter(function (t) { return t.n === n; })[0];
    if (!topic || topic.removed) return ['There\'s no topic ' + n + ' on the board. Type board for the list.'];
    var w = /^write(?:\s+([\s\S]*))?$/i.exec(String(m[2] || '').trim());
    if (m[2] && !w) return ['Type board ' + n + ' to read it, or board ' + n + ' write and your words to add a note.'];
    if (w) {
      var note = talkWords_(w[1], 'Type board ' + n + ' write, then your words.');
      var added = boardWrite_(account, topic.id, note);
      return ['Note ' + added.n + ' is on topic ' + n + '. Type board ' + n + ' to read it.'];
    }
    var notes = topic.notes.filter(function (b) { return !b.removed; });
    return [boardLine_(topic, 'Topic ' + n + ', by ' + who(topic.account) + ', ' + scrollWhen_(topic.at) + ': ' + topic.text, account, shown)]
      .concat(notes.map(function (b) { return boardLine_(b, '  Note ' + b.n + ', ' + who(b.account) + ', ' + scrollWhen_(b.at) + ': ' + b.text, account, shown); }))
      .concat([notes.length ? 'Type board ' + n + ' write and your words to add a note.' : 'No notes yet. Type board ' + n + ' write and your words to add one.']);
  }
  return ['Type board for the topics, board and a number to read one, or board write and your words to start one.'];
}
function boardWrite_(account, topicId, text) {
  return forumLock_(function () {
    var b = boardTopics_(), now = Date.now();
    if (b.all.some(function (x) { return x.account === account.id && now - x.at < 3000; })) throw new Error('One line at a time: try again in a moment.');
    var id = talkNextId_('N', b.all.map(function (x) { return x.id; }));
    var sheet = getDb_().getSheetByName(TABS.board.name);
    sheet.getRange(lastRowWith_(sheet, 1) + 1, 1, 1, 5).setValues([[id, topicId, account.id, new Date(now), safeCell_(text)]]);
    forgetReads_();
    var after = boardTopics_();
    if (!topicId) return { n: after.topics.filter(function (t) { return t.id === id; })[0].n };
    return { n: after.topics.filter(function (t) { return t.id === topicId; })[0].notes.filter(function (x) { return x.id === id; })[0].n };
  });
}
function boardFind_(id) {
  var b = boardTopics_().all.filter(function (x) { return x.id === String(id || ''); })[0];
  if (!b || b.removed) throw new Error('That\'s gone from the board already.');
  return b;
}
function boardReport_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  return forumLock_(function () {
    var b = boardFind_(req.noteId);
    if (b.account === account.id) throw new Error('That\'s your own.');
    var by = b.reported.split(/\s+/).filter(String);
    if (by.indexOf(account.id) !== -1) return { reported: true };
    by.push(account.id);
    getDb_().getSheetByName(TABS.board.name).getRange(b.row, BOARD_COL.reportedBy, 1, 2).setValues([[by.join(' '), new Date()]]);
    var shown = shownNames_(), topics = boardTopics_().topics;
    var topic = topics.filter(function (t) { return t.id === (b.topic || b.id); })[0];
    var where = b.topic ? 'note ' + topic.notes.filter(function (x) { return x.id === b.id; })[0].n + ' on topic ' + topic.n : 'topic ' + topic.n;
    topicNew_(account, 'Report', 'board ' + where + ' reported', 'On Street Talk\'s board, ' + where + ', reported by ' + (shown[account.id] || account.handle) + ':\n"' + b.text + '"\n'
      + 'Written by ' + (shown[b.account] || b.account) + ', ' + scrollWhen_(b.at) + ' (' + b.id + ').\nTo remove it: in Admin Mode, open Street Talk, type board ' + topic.n + ' and press Remove on it.', 'New', 'Issue');
    forgetReads_();
    return { reported: true };
  });
}
// Remove: an admin's. A topic removed takes its notes off the board with it.
function boardRemove_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!account.rank) throw new Error('Removing from the board is for HABO\'s admins.');
  return forumLock_(function () {
    var b = boardFind_(req.noteId);
    getDb_().getSheetByName(TABS.board.name).getRange(b.row, BOARD_COL.removedBy, 1, 2).setValues([[account.id, new Date()]]);
    logChange_(account.email, 'Board', b.id, 'Removed', '', b.text);
    forgetReads_();
    return { removed: b.id };
  });
}

/* ── Cold storage for any of Street Talk's tabs (S6-P50): past the setting's
   lines, the oldest move out, the newest GCHAT_KEEP staying. Columns are
   matched by heading, so a tab that gains one later still lines up. ── */
function coldMove_(tab, kind) {
  var limit = Number(getSetting_(SETTING_GCHAT_COLD)) || 2000;
  var sheet = getDb_().getSheetByName(tab.name), n = sheet ? lastRowWith_(sheet, 1) - 1 : 0;
  if (n <= Math.max(limit, GCHAT_KEEP)) return 0;
  var move = n - GCHAT_KEEP, width = tab.header.length, now = new Date();
  var cold = coldSheet_(kind, tab.header.concat(['Moved']));
  var heads = cold.getRange(1, 1, 1, Math.max(1, cold.getLastColumn())).getValues()[0].map(function (h) { return String(h).trim(); });
  tab.header.concat(['Moved']).forEach(function (h) {
    if (heads.indexOf(h) === -1) { heads.push(h); cold.getRange(1, heads.length).setValue(h).setFontWeight('bold'); }
  });
  var rows = sheet.getRange(2, 1, move, width).getValues().map(function (r) {
    return heads.map(function (h) { var i = tab.header.indexOf(h); return h === 'Moved' ? now : i === -1 ? '' : r[i]; });
  });
  cold.getRange(cold.getLastRow() + 1, 1, move, heads.length).setValues(rows);
  sheet.deleteRows(2, move);
  forgetReads_();
  return move;
}
