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
var BOARD_COL = { id: 1, topic: 2, account: 3, written: 4, text: 5, removedBy: 6, removed: 7, reportedBy: 8, reported: 9, subject: 10, re: 11 };
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
  var walking = whoWalking_();
  accounts.forEach(function (a) {
    var at = Number(got['here:' + a.id]) || (a.id === account.id ? now : 0);
    if (!at || now - at > HERE_SECONDS * 1000) return;
    if (!shown[a.id]) { unnamed++; return; }
    // Their title after their name (|Q916 (a)), then, for a name, its handle,
    // so who tells you how to tell someone (|Q898 (a)): "Pat Eng the Litter
    // Warrior (pat.e)". A handle shown alone is already one.
    var name = shown[a.id] + (a.title ? ' ' + a.title : '') + (a.shows === 'Name' && a.handle ? ' (' + a.handle + ')' : '');
    // Their level after it (|C1098): "Lothrandir the First Builder (you) | 7";
    // and <COLLECTING> while their walk is going, if they've chosen to show it (|Q917 (a)).
    named.push(name + (a.id === account.id ? ' (you)' : '') + (a.level ? ' | ' + a.level : '') + (a.showCollecting && walking[a.id] ? ' <COLLECTING>' : ''));
  });
  named.sort(function (p, q) { return p.toLowerCase() < q.toLowerCase() ? -1 : 1; });
  var n = named.length + unnamed;
  return ['On the litter page in the last 10 minutes: ' + n + (n === 1 ? ' player.' : ' players.')]
    .concat(named.map(function (s) { return '  ' + s; }))
    .concat(unnamed ? ['  …and ' + unnamed + ' more, not shown by name.'] : []);
}
// Who has a walk going now: a real one, not a simulation.
function whoWalking_() {
  var on = {};
  readRows_(TABS.collections).forEach(function (q) { if (q.get('status') === 'Collecting' && q.get('simulated') !== 'Yes') on[q.get('account')] = true; });
  return on;
}

/* ── title and privacy (|Q916, |Q917) ── */

var TITLE_MAX = 30;
// A title as kept: one line, no < or > (who's <COLLECTING> is the app's).
function titleClean_(words) {
  var t = String(words || '').replace(/[\u0000-\u001f<>]/g, '').replace(/\s+/g, ' ').trim();
  if (t.length > TITLE_MAX) throw new Error('Keep a title to ' + TITLE_MAX + ' characters: that was ' + t.length + '.');
  return t;
}
function titleSet_(account, title) {
  return withLock_(function () {
    var now = readAccounts_().filter(function (x) { return x.id === account.id; })[0];
    if (now.title === title) return now;
    setAccountCells_(now.row, { title: safeCell_(title) });
    getDb_().getSheetByName(TABS.accounts.name).getRange(now.row, ACCOUNT_COL.updated).setValue(new Date());
    logChange_(now.first + ' ' + now.last, 'Changed', now.id + ' ' + now.handle, 'Title', now.title, title);
    forgetReads_();
    return readAccounts_().filter(function (x) { return x.id === account.id; })[0];
  });
}
// title: yours, and how to change it; title and words sets it; title none takes it off.
function titleCommand_(account, rest) {
  rest = String(rest || '').trim();
  var name = shownNames_()[account.id];
  if (!rest) return account.title
    ? ['Your title: ' + account.title + '. who shows "' + (name ? name + ' ' : '') + account.title + '".', 'Type `title` and new words to change it, or `title none` to take it off; or in Change my details.']
    : ['You have no title. Type `title` and words, like `title the Litter Warrior`, up to ' + TITLE_MAX + ' characters: who shows it after your name.'];
  if (/^(none|off|clear|remove)$/i.test(rest)) { titleSet_(account, ''); return ['Title taken off.']; }
  var title = titleClean_(rest);
  if (!title) return ['Type `title` and words, like `title the Litter Warrior`.'];
  titleSet_(account, title);
  return ['Title set: ' + (name ? name + ' ' : '') + title + (name ? '' : '. Your map setting shows neither your handle nor your name, so who counts you without them; change it in Change my details.'),
    { text: 'Change my details', open: 'details' }].slice(0, name ? 1 : 2);
}
// privacy: what others see of you, how to change it, and the screen to change it on (|Q917).
function privacyCommand_(account, rest) {
  var m = /^collecting\s+(on|off|yes|no|show|hide)$/i.exec(String(rest || '').trim());
  if (m) {
    var on = /^(on|yes|show)$/i.test(m[1]);
    withLock_(function () {
      var now = readAccounts_().filter(function (x) { return x.id === account.id; })[0];
      if (now.showCollecting !== on) {
        setAccountCells_(now.row, { collecting: on ? 'Yes' : '' });
        logChange_(now.first + ' ' + now.last, 'Changed', now.id + ' ' + now.handle, 'Who shows collecting', now.showCollecting ? 'Yes' : '', on ? 'Yes' : '');
      }
      forgetReads_();
    });
    return [on ? 'who now shows <COLLECTING> after your name while you\'re on a walk.' : 'who no longer shows when you\'re on a walk.'];
  }
  if (String(rest || '').trim()) return ['Type `privacy` for yours, or `privacy collecting on` or `privacy collecting off`.'];
  var shows = { Handle: 'your handle', Name: 'your name', Neither: 'neither your handle nor your name' }[account.shows] || 'your handle';
  return ['Your privacy:',
    '  The public map, gchat and who show ' + shows + '.',
    // Your words (|C1155): the flag, ON or OFF, and how to change it.
    '  Your <COLLECTING> flag: ' + (account.showCollecting ? 'ON' : 'OFF') + '. To change it, enter `privacy collecting on` or `privacy collecting off`.',
    'Both are in Change my details, too:',
    { text: 'Change my details', open: 'details' }];
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
// tell, a handle and your words: "tell pat.e good morning", the @ optional.
function tellSay_(account, rest) {
  if (!rhOn_(SETTING_TELL)) throw new Error('tell is off just now.');
  var m = /^@?(\S+)(?:\s+([\s\S]*))?$/.exec(String(rest || '').trim());
  if (!m) throw new Error('Type `tell`, a handle, then your words, like `tell pat.e good morning!`');
  var to = readAccounts_().filter(function (a) { return a.active && a.handle.toLowerCase() === m[1].toLowerCase(); })[0];
  if (!to) throw new Error('Nobody has the handle "' + m[1].slice(0, 40) + '". Check its spelling; `who` shows who\'s here.');
  if (to.id === account.id) throw new Error('That\'s your own handle.');
  var text = talkWords_(m[2], 'Type `tell ' + to.handle + '`, then your words.');
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

// The board's notes, named like T1N3, topic 1's note 3 (|Q921 (a)), each with
// a subject (|Q919 (a)) and, answering another, the note it answers, shown
// indented under it (|Q918). Topics are T1, T2: board 1 and board T1 read one.
var BOARD_SUBJECT_MAX = 80;
function boardSubject_(b) {
  if (b.subject) return b.subject;
  return boardShort_(boardPlain_(b.text).split('\n')[0], 50) || '(no subject)';
}
// A note's words with their Bold, Italic and Underline marks taken out, for
// the list's first words: **bold**, *italic*, __underline__.
function boardPlain_(text) {
  return String(text || '').replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/__([^_\n]+)__/g, '$1').replace(/\*([^*\n]+)\*/g, '$1');
}
// Each topic, numbered in the order they were started, with its notes.
function boardTopics_() {
  var rows = readRows_(TABS.board, BOARD_COL).map(function (r) {
    return { row: r.row, id: String(r.get('id')).trim(), topic: String(r.get('topic')).trim(), account: String(r.get('account')).trim(), at: talkTime_(r.get('written')),
      text: talkText_(r.get('text')), removed: !!String(r.get('removedBy')).trim(), reported: String(r.get('reportedBy') || '').trim(),
      subject: talkText_(r.get('subject')).trim(), re: String(r.get('re') || '').trim() };
  }).filter(function (b) { return b.id && b.at; });
  var topics = rows.filter(function (b) { return !b.topic; }).sort(function (p, q) { return p.at - q.at || (p.id < q.id ? -1 : 1); });
  var byId = {};
  topics.forEach(function (t, i) { t.n = i + 1; t.name = 'T' + t.n; t.notes = []; byId[t.id] = t; });
  rows.forEach(function (b) { if (b.topic && byId[b.topic]) byId[b.topic].notes.push(b); });
  topics.forEach(function (t) {
    t.notes.sort(function (p, q) { return p.at - q.at || (p.id < q.id ? -1 : 1); });
    t.notes.forEach(function (b, i) { b.n = i + 1; b.name = t.name + 'N' + b.n; b.t = t; });
    t.last = t.notes.filter(function (b) { return !b.removed; }).reduce(function (m, b) { return Math.max(m, b.at); }, t.at);
  });
  return { all: rows, topics: topics };
}
function boardShort_(text, n) { return text.length > n ? text.slice(0, n - 1).replace(/\s+\S*$/, '') + '…' : text; }
// A topic by its number, 1 or T1; a note by its name, T1N3. Removed ones aren't found.
function boardTopicOf_(b, n) { var t = b.topics.filter(function (x) { return x.n === Number(n); })[0]; return t && !t.removed ? t : null; }
function boardNoteOf_(b, name) {
  var m = /^T(\d+)N(\d+)$/i.exec(String(name || '').trim()), t = m && boardTopicOf_(b, m[1]);
  var note = t && t.notes.filter(function (x) { return x.n === Number(m[2]); })[0];
  return note && !note.removed ? note : null;
}
// A topic's or a note's line, as the page shows it: its name and subject in
// bold with a break above (|M1442), who and when, and its words, whole when
// read, its first words in a list; Report on someone else's, Remove in Admin
// Mode. `depth`: how far it's indented under the note it answers (|Q918).
function boardLine_(b, account, shown, whole, depth) {
  var who = shown[b.account] || 'A volunteer', subject = b.topic ? boardSubject_(b) : (b.subject || boardPlain_(b.text));
  var body = b.topic || b.subject ? b.text : '';
  // A note written before subjects: its first words are its subject, and aren't said twice.
  if (b.topic && !b.subject && boardPlain_(body).replace(/\s+/g, ' ').trim() === subject) body = '';
  var re = b.re && b.reNote ? b.reNote.name : '';
  var meta = 'by ' + who + ', ' + scrollWhen_(b.at) + (re && !depth ? ' · re: ' + re : '');
  var shortBody = boardShort_(boardPlain_(body).replace(/\s+/g, ' ').trim(), 90);
  var out = { text: (depth ? new Array(depth + 1).join('  ') : '') + b.name + ' · ' + subject + ' · ' + meta + (whole ? (body ? ': ' + body : '') : (shortBody ? ': ' + shortBody : '')),
    note: b.id, name: b.name, head: b.name + ' · ' + subject, meta: meta, body: whole ? body : shortBody, whole: !!whole, depth: depth || 0,
    mine: b.account === account.id, reported: b.reported.split(/\s+/).indexOf(account.id) !== -1 };
  if (re) out.re = re;
  return out;
}
// A topic's notes as a tree: each note, then the notes answering it, under it.
function boardTree_(notes, under, depth, out) {
  notes.filter(function (b) { return (b.reNote ? b.reNote.id : '') === under; }).forEach(function (b) {
    out.push([b, Math.min(depth, 3)]);
    boardTree_(notes, b.id, depth + 1, out);
  });
  return out;
}
function boardLive_(topic) {
  var notes = topic.notes.filter(function (b) { return !b.removed; }), byId = {};
  notes.forEach(function (b) { byId[b.id] = b; });
  // A note answering one that was removed stands on its own.
  notes.forEach(function (b) { b.reNote = b.re && byId[b.re] ? byId[b.re] : null; });
  return notes;
}
function boardCommand_(account, rest) {
  if (!rhOn_(SETTING_BOARD)) return ['The board is off just now.'];
  rest = String(rest || '').trim();
  var shown = shownNames_(), who = function (id) { return shown[id] || 'A volunteer'; };
  var m, b;
  if (!rest) {
    var live = boardTopics_().topics.filter(function (t) { return !t.removed; }).sort(function (p, q) { return q.last - p.last; });
    if (!live.length) return ['The board is empty. Type `board write` to start a topic.'];
    return ['The board, newest first. Tap a topic\'s `board` and its number to read it:'].concat(live.slice(0, 20).map(function (t) {
      var k = t.notes.filter(function (x) { return !x.removed; }).length;
      return '  `board ' + t.n + '` ' + boardShort_(boardSubject_(t), 70) + ' · ' + who(t.account) + ' · ' + k + (k === 1 ? ' note' : ' notes') + ' · ' + scrollWhen_(t.last);
    })).concat(live.length > 20 ? ['  …and ' + (live.length - 20) + ' older topics.'] : []);
  }
  // board write: a topic; board 1 write: a note; board re T1N3: a note answering T1N3.
  // The page opens its drafting box for these (|Q920 (a)); typed whole, they're posted as they are.
  if ((m = /^write(?:\s+([\s\S]*))?$/i.exec(rest))) {
    var text = talkWords_(m[1], 'Type `board write`, then your topic, like `board write Bags left at the Elm St dumpster`.');
    var made = boardWrite_(account, '', text, '', '');
    return ['T' + made.n + ' is on the board. `board ' + made.n + '` reads it.'];
  }
  if ((m = /^(?:re\s+(T\d+N\d+)|(T\d+N\d+)\s+re|(\d+)\s+re\s+(\d+))(?:\s+([\s\S]*))?$/i.exec(rest))) {
    var name = (m[1] || m[2] || ('T' + m[3] + 'N' + m[4])).toUpperCase();
    var to = boardNoteOf_(boardTopics_(), name);
    if (!to) return ['There\'s no note ' + name + ' on the board. Type `board` for the topics.'];
    var words = talkWords_(m[5], 'Type `board re ' + name + '`, then your words.');
    var reply = boardWrite_(account, to.t.id, words, ('re: ' + boardSubject_(to)).slice(0, BOARD_SUBJECT_MAX), to.id);
    return [reply.name + ' is on topic ' + to.t.n + ', under ' + name + '. `board ' + reply.name + '` reads it.'];
  }
  if ((m = /^(T\d+N\d+)$/i.exec(rest))) return boardRead_(account, m[1].toUpperCase(), shown);
  if ((m = /^T?(\d+)(?:\s+([\s\S]*))?$/i.exec(rest))) {
    var n = Number(m[1]);
    b = boardTopics_();
    var topic = boardTopicOf_(b, n);
    if (!topic) return ['There\'s no topic ' + n + ' on the board. Type `board` for the list.'];
    var w = /^write(?:\s+([\s\S]*))?$/i.exec(String(m[2] || '').trim());
    if (m[2] && !w) return ['Type `board ' + n + '` to read it, or `board ' + n + ' write` to add a note.'];
    if (w) {
      var note = talkWords_(w[1], 'Type `board ' + n + ' write`, then your words.');
      var added = boardWrite_(account, topic.id, note, '', '');
      return [added.name + ' is on topic ' + n + '. `board ' + added.name + '` reads it.'];
    }
    var notes = boardLive_(topic);
    return [boardLine_(topic, account, shown, true, 0)]
      .concat(boardTree_(notes, '', 0, []).map(function (x) { return boardLine_(x[0], account, shown, false, x[1]); }))
      .concat([notes.length ? '`board T' + n + 'N1` reads a note whole; `board re T' + n + 'N1` answers one; `board ' + n + ' write` adds one.' : 'No notes yet. `board ' + n + ' write` adds one.']);
  }
  return ['Type `board` for the topics, `board 1` to read one, `board T1N3` for a note, or `board write` to start a topic.'];
}
// board T1N3: the note whole, then the notes answering it, under it.
function boardRead_(account, name, shown) {
  var b = boardTopics_(), m = /^T(\d+)N(\d+)$/.exec(name), topic = boardTopicOf_(b, m[1]);
  var notes = topic ? boardLive_(topic) : [], note = notes.filter(function (x) { return x.n === Number(m[2]); })[0];
  if (!note) return ['There\'s no note ' + name + ' on the board. ' + (topic ? '`board ' + topic.n + '` lists its notes.' : 'Type `board` for the topics.')];
  return [boardLine_(note, account, shown, true, 0)]
    .concat(boardTree_(notes, note.id, 1, []).map(function (x) { return boardLine_(x[0], account, shown, false, x[1]); }))
    .concat(['`board re ' + name + '` answers it; `board ' + topic.n + '` for its topic.']);
}
function boardWrite_(account, topicId, text, subject, re) {
  return forumLock_(function () {
    var b = boardTopics_(), now = Date.now();
    if (b.all.some(function (x) { return x.account === account.id && now - x.at < 3000; })) throw new Error('One line at a time: try again in a moment.');
    var id = talkNextId_('N', b.all.map(function (x) { return x.id; }));
    var sheet = getDb_().getSheetByName(TABS.board.name), row = lastRowWith_(sheet, 1) + 1;
    sheet.getRange(row, 1, 1, 5).setValues([[id, topicId, account.id, new Date(now), safeCell_(text)]]);
    if (subject || re) sheet.getRange(row, BOARD_COL.subject, 1, 2).setValues([[safeCell_(subject || ''), re || '']]);
    forgetReads_();
    var after = boardTopics_();
    if (!topicId) return { n: after.topics.filter(function (t) { return t.id === id; })[0].n };
    var note = after.topics.filter(function (t) { return t.id === topicId; })[0].notes.filter(function (x) { return x.id === id; })[0];
    return { n: note.n, name: note.name };
  });
}
// Posted from the page's drafting box (|Q920 (a)): a subject, the words with
// their Bold, Italic and Underline, and line breaks kept. A topic needs its
// subject; a note its subject and words; a note answering another, its words,
// its subject "re:" the other's if left empty.
function boardPost_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  markHere_(account.id);
  if (!rhOn_(SETTING_BOARD)) throw new Error('The board is off just now.');
  var subject = String(req.subject || '').replace(/\s+/g, ' ').trim();
  var text = String(req.text || '').replace(/\r\n?/g, '\n').split('\n').map(function (l) { return l.replace(/\s+$/, ''); }).join('\n').replace(/\n{3,}/g, '\n\n').trim();
  var max = gchatMax_();
  if (subject.length > BOARD_SUBJECT_MAX) throw new Error('Keep the subject to ' + BOARD_SUBJECT_MAX + ' characters: that was ' + subject.length + '.');
  if (text.length > max) throw new Error('Keep it to ' + max + ' characters: that was ' + text.length + '.');
  var b = boardTopics_();
  if (req.re) {
    var to = boardNoteOf_(b, req.re);
    if (!to) throw new Error('There\'s no note ' + String(req.re).toUpperCase().slice(0, 12) + ' on the board any more.');
    if (!text) throw new Error('Write your note first.');
    var reply = boardWrite_(account, to.t.id, text, subject || ('re: ' + boardSubject_(to)).slice(0, BOARD_SUBJECT_MAX), to.id);
    return { answer: [reply.name + ' is on topic ' + to.t.n + ', under ' + to.name + '. `board ' + reply.name + '` reads it.'], name: reply.name };
  }
  if (!subject) throw new Error('Give it a subject.');
  if (req.topic) {
    var topic = boardTopicOf_(b, String(req.topic).replace(/^T/i, ''));
    if (!topic) throw new Error('There\'s no topic ' + String(req.topic).slice(0, 12) + ' on the board any more.');
    if (!text) throw new Error('Write your note first.');
    var added = boardWrite_(account, topic.id, text, subject, '');
    return { answer: [added.name + ' is on topic ' + topic.n + '. `board ' + added.name + '` reads it.'], name: added.name };
  }
  var made = boardWrite_(account, '', text, subject, '');
  return { answer: ['T' + made.n + ' is on the board. `board ' + made.n + '` reads it.'], name: 'T' + made.n };
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
    var name = b.topic ? topic.notes.filter(function (x) { return x.id === b.id; })[0].name : topic.name;
    var where = b.topic ? 'note ' + name : 'topic ' + topic.n;
    var said = (b.subject ? b.subject + (b.text ? ': ' : '') : '') + b.text;
    topicNew_(account, 'Report', 'board ' + where + ' reported', 'On Street Talk\'s board, ' + where + ', reported by ' + (shown[account.id] || account.handle) + ':\n"' + said + '"\n'
      + 'Written by ' + (shown[b.account] || b.account) + ', ' + scrollWhen_(b.at) + ' (' + b.id + ').\nTo remove it: in Admin Mode, open Street Talk, type board ' + (b.topic ? name : topic.n) + ' and press Remove on it.', 'New', 'Issue');
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
