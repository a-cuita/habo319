/**
 * The rolling history (S6-P3 item 3, |Q705 (a), |Q706, |Q707, |Q712 (a),
 * |Q713 (a)): a scroll like MORDORMUD.net's, starting with what the app has.
 * Public lines start with the player's name as the public map shows it, like
 * a chat room: "bio.browning has gained a level! ---> Level 3!". Your own
 * lines have no name: each XP you earned, with what earned it, and each walk's
 * summary as it ended. Your XP lines are the rows of your XP tab (S7-P1),
 * written as it was earned; a level reached, from Accounts' Levels reached.
 * Commands typed at its prompt print their answers in it: help, xp history,
 * level, walks and due. Since S6-P38 it's everyone's too: announcements
 * (a walk started or ended, a level, a badge), worked out the same way, and
 * gchat, the one thing kept for it, in the Gchat tab. tell, board and who
 * (S7-P10) are in Talk.js.
 */

var SCROLL_LINES = 150;
var SCROLL_COMMANDS = [
  ['help', 'these commands'],
  ['gchat and your words', 'a line to everyone signed in, like "gchat good morning!"'],
  ['tell, a handle and your words', 'a line only that player sees, like "tell pat.e see you Saturday"'],
  ['board', 'the message board\'s topics; board and a number reads one, like "board 2"'],
  ['board write and your words', 'starts a topic; board, a number, write and your words adds a note to one'],
  ['who', 'who\'s been on the litter page in the last 10 minutes'],
  ['quests', 'the Questmaster, with the Quests open to you; or tap the Questmaster\'s name'],
  ['about and a number', 'the Questmaster tells you of that Quest, like "about 3"'],
  ['accept and a number', 'take that Quest on'],
  ['active and a number', 'make a Quest you\'ve taken on your active one; active none for no active Quest'],
  ['xp history', 'each XP you\'ve earned, newest first'],
  ['level', 'your level, and the XP to the next'],
  ['walks', 'your last walks, a line each'],
  ['due', 'segments due now, from The Priority Segment List, with their bonus']
];

/* ── The rolling history for everyone (S6-P38, |Q762 to |Q766) ── */

// Named Street Talk (S6-P51, |Q796 (b)); the rows are renamed in place, values kept.
var SETTING_RH_START = 'Street Talk: announce a walk started';
var SETTING_RH_END = 'Street Talk: announce a walk ended';
var SETTING_RH_LEVEL = 'Street Talk: announce a level reached';
var SETTING_RH_BADGE = 'Street Talk: announce a badge earned';
var SETTING_GCHAT = 'Street Talk: gchat';
var SETTING_RH_EVERY = 'Street Talk: new lines every (seconds)';
var STREET_TALK_RENAMES = [SETTING_RH_START, SETTING_RH_END, SETTING_RH_LEVEL, SETTING_RH_BADGE, SETTING_GCHAT, SETTING_RH_EVERY];
// Gchat's old lines to cold storage (S6-P50, |C992, |Q795): past this many
// lines, the oldest move out, keeping the newest GCHAT_KEEP.
var SETTING_GCHAT_COLD = 'Street Talk: cold storage after (lines)';
var SETTING_COLD_FOLDER = 'Cold storage folder';
var GCHAT_KEEP = 1000;
var RH_ONOFF = ['On', 'Off'];
var GCHAT_COL = { id: 1, account: 2, written: 3, text: 4, removedBy: 5, removed: 6, reportedBy: 7, reported: 8 };
// How long a gchat line can be (S6-P38, |M1174): a setting, 1,000 to start.
var SETTING_GCHAT_MAX = 'Street Talk: gchat line length (characters)';
function gchatMax_() { var n = Math.round(Number(getSetting_(SETTING_GCHAT_MAX))); return n >= 50 && n <= 5000 ? n : 1000; }
function rhOn_(name) { return String(getSetting_(name) || 'On').trim() !== 'Off'; }
function rhEvery_() { var n = Number(getSetting_(SETTING_RH_EVERY)); return n >= 5 && n <= 300 ? n : 15; }
// Each player as the public map shows them: handle, name, or nothing.
function shownNames_() {
  var shown = {};
  readAccounts_().forEach(function (a) { shown[a.id] = a.shows === 'Name' ? (a.first + ' ' + a.last).trim() : a.shows === 'Neither' ? '' : a.handle; });
  return shown;
}
function andList_(xs) { return xs.length < 2 ? xs.join('') : xs.slice(0, -1).join(', ') + ' and ' + xs[xs.length - 1]; }

// Announcements everyone sees (item 1), worked out from the litter Sheet like
// the rest of the scroll: a walk started, with no place (|Q762 (b): saying
// live where someone walks tells everyone where to find them); a walk ended,
// with its pounds and the segments it planned; a badge earned.
function announceLines_(shown) {
  var lines = [], start = rhOn_(SETTING_RH_START), end = rhOn_(SETTING_RH_END);
  if (start || end) {
    var names = {};
    segmentsAll_().forEach(function (g) { names[g.id] = g.name; });
    readRows_(TABS.collections).forEach(function (q) {
      if (q.get('simulated') === 'Yes' || q.get('status') === COLLECTION_DISCARDED) return;
      var acc = q.get('account'), who = shown[acc] || 'A volunteer', s = q.get('started'), e = q.get('ended');
      if (start && s instanceof Date) lines.push({ at: s.getTime(), who: who, text: 'started collecting.', kind: 'start', account: acc });
      if (end && q.get('status') === 'Ended' && e instanceof Date) {
        var segs = String(q.get('plan') || '').split(/\s+/).filter(String).map(function (id) { return names[id]; }).filter(Boolean);
        lines.push({ at: e.getTime(), who: who, text: 'ended a walk: ' + round_(Number(q.get('pounds')) || 0, 2) + ' lb' + (segs.length ? ' on ' + andList_(segs) : '') + '.', kind: 'end', account: acc });
      }
    });
  }
  if (rhOn_(SETTING_RH_BADGE)) badgesAll_().forEach(function (b) {
    if (b.earned) lines.push({ at: b.earned, who: shown[b.account] || 'A volunteer', text: 'earned the badge ' + (b.badge ? b.badge + ' ' : '') + '"' + b.name + '"!', kind: 'badge', account: b.account });
  });
  return lines.concat(questAnnounceLines_(shown));   // a Quest taken on or finished (S7-P4, |Q884 (a))
}

// gchat (items 2 and 7, |Q764 (a)): a line each, to everyone signed in.
function gchatRows_() {
  return readRows_(TABS.gchat, GCHAT_COL).map(function (r) {
    var w = r.get('written');
    // safeCell_'s ' before a line like "=1+1" is the Sheet's, not the player's.
    return { row: r.row, id: r.get('id'), account: r.get('account'), at: w instanceof Date ? w.getTime() : 0, text: String(r.get('text')).replace(/^'(?=[=+\-@])/, ''),
      removed: !!String(r.get('removedBy')).trim(), reportedBy: String(r.get('reportedBy') || '').trim() };
  });
}
function gchatLines_(shown, viewer) {
  if (!rhOn_(SETTING_GCHAT)) return [];
  return gchatRows_().filter(function (g) { return !g.removed && g.at; }).map(function (g) {
    return { at: g.at, who: shown[g.account] || 'A volunteer', text: g.text, kind: 'gchat', account: g.account, id: g.id,
      reported: !!viewer && g.reportedBy.split(/\s+/).indexOf(viewer) !== -1 };
  });
}
// Everyone's lines, as the page gets them; your own end-of-walk line is your
// walk's summary instead, which says more.
// Your tells, sent and received, come with them (S7-P10); an admin in Admin
// Mode also gets every reported tell, to remove.
function sharedLines_(account, shown, admin) {
  return announceLines_(shown).concat(gchatLines_(shown, account.id)).filter(function (l) { return !(l.kind === 'end' && l.account === account.id); }).map(function (l) {
    var o = { at: l.at, who: l.who, text: l.text, mine: l.account === account.id, kind: l.kind };
    if (l.kind === 'gchat') { o.id = l.id; o.reported = l.reported; }
    return o;
  }).concat(tellLines_(account, admin)).concat(qmTells_(account));   // the Questmaster's word when a Quest opens to you (|Q885 (a))
}
// A line as the page gets it.
function scrollOut_(l) {
  var o = { at: l.at, who: l.who || '', text: l.text, mine: !!l.mine, kind: l.kind };
  if (l.kind === 'gchat') { o.id = l.id; o.reported = !!l.reported; }
  if (l.kind === 'tell') { o.id = l.id; o.to = l.to; o.toMe = !!l.toMe; o.reported = !!l.reported; if (l.flagged) o.flagged = true; }
  if (l.kind === 'qm') { o.id = l.id; o.actions = l.actions || []; }
  return o;
}

// gchat and your words, typed at the prompt.
function gchatSay_(account, words) {
  if (!rhOn_(SETTING_GCHAT)) throw new Error('gchat is off just now.');
  var text = String(words || '').replace(/\s+/g, ' ').trim();
  if (!text) throw new Error('Type gchat, then what you want to say to everyone, like "gchat good morning!"');
  var max = gchatMax_();
  if (text.length > max) throw new Error('Keep it to ' + max + ' characters: that was ' + text.length + '.');
  return forumLock_(function () {
    var rows = gchatRows_(), now = Date.now();
    if (rows.some(function (g) { return g.account === account.id && now - g.at < 3000; })) throw new Error('One line at a time: try again in a moment.');
    var n = rows.reduce(function (m, g) { return Math.max(m, Number(String(g.id).replace(/\D/g, '')) || 0); }, 0) + 1;
    var id = 'G' + ('0000' + n).slice(-Math.max(4, String(n).length));
    var sheet = getDb_().getSheetByName(TABS.gchat.name);
    sheet.getRange(lastRowWith_(sheet, 1) + 1, 1, 1, 4).setValues([[id, account.id, new Date(now), safeCell_(text)]]);
    try { gchatColdMove_(); } catch (e) { /* a line is never lost for want of cold storage; it moves next time */ }
    forgetReads_();
    return { at: now, who: shownNames_()[account.id] || 'A volunteer', text: text, mine: true, kind: 'gchat', id: id, reported: false };
  });
}
function gchatFind_(id) {
  var g = gchatRows_().filter(function (x) { return x.id === String(id || ''); })[0];
  if (!g || g.removed) throw new Error('That line is gone already.');
  return g;
}
// Report: marked on its row, and a Report in the Forum, so the admins are told.
function gchatReport_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  return forumLock_(function () {
    var g = gchatFind_(req.lineId);
    if (g.account === account.id) throw new Error('That\'s your own line.');
    var by = g.reportedBy.split(/\s+/).filter(String);
    if (by.indexOf(account.id) !== -1) return { reported: true };
    by.push(account.id);
    getDb_().getSheetByName(TABS.gchat.name).getRange(g.row, GCHAT_COL.reportedBy, 1, 2).setValues([[by.join(' '), new Date()]]);
    var shown = shownNames_();
    topicNew_(account, 'Report', 'gchat line ' + g.id + ' reported', 'A gchat line in Street Talk, reported by ' + (shown[account.id] || account.handle) + ':\n"' + g.text + '"\n'
      + 'Written by ' + (shown[g.account] || g.account) + ', ' + scrollWhen_(g.at) + ' (' + g.id + ').\nTo remove it: in Admin Mode, open Street Talk and press Remove on it.', 'New', 'Issue');
    forgetReads_();
    return { reported: true };
  });
}
// Remove: an admin's, kept on its row with who and when.
function gchatRemove_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!account.rank) throw new Error('Removing a line is for HABO\'s admins.');
  return forumLock_(function () {
    var g = gchatFind_(req.lineId);
    getDb_().getSheetByName(TABS.gchat.name).getRange(g.row, GCHAT_COL.removedBy, 1, 2).setValues([[account.id, new Date()]]);
    logChange_(account.email, 'Gchat', g.id, 'Removed', '', g.text);
    forgetReads_();
    return { removed: g.id };
  });
}

// Public lines: each level any player reached, when they reached it, from
// Accounts' "Levels reached" (S7-P1): one row each, not every player's tab.
function levelLines_(shown) {
  var lines = [];
  if (!rhOn_(SETTING_RH_LEVEL)) return lines;
  shown = shown || shownNames_();
  readAccounts_().forEach(function (a) {
    levelsReached_(a.levels).forEach(function (l) {
      lines.push({ at: l.at, who: shown[a.id] || 'A volunteer', text: 'has gained a level! ---> Level ' + l.level + '!', account: a.id, kind: 'level' });
    });
  });
  return lines;
}

// Your walks' summaries: pounds, miles, and each weighing's Litter Index.
function walkLines_(accountId) {
  var byWalk = {};
  readRows_(TABS.stretches).forEach(function (r) {
    if (r.get('discarded') === 'Yes') return;
    (byWalk[r.get('collection')] = byWalk[r.get('collection')] || []).push(stretchOf_(r));
  });
  return readRows_(TABS.collections).filter(function (q) {
    return q.get('account') === accountId && q.get('status') === 'Ended' && q.get('simulated') !== 'Yes';
  }).map(function (q) {
    var id = q.get('id'), e = q.get('ended'), sts = (byWalk[id] || []).sort(function (a, b) { return a.n - b.n; });
    var idx = sts.filter(function (s) { return s.index != null; }).map(function (s) { return round_(s.index, 1); });
    return { at: e instanceof Date ? e.getTime() : 0, mine: true, kind: 'walk', walk: id,
      text: 'Walk ' + id + ' ended: ' + round_(Number(q.get('pounds')) || 0, 2) + ' lb · ' + round_(Number(q.get('miles')) || 0, 2) + ' mi · '
        + sts.length + (sts.length === 1 ? ' weighing' : ' weighings') + (idx.length ? ' · Litter Index ' + idx.join(', ') : '') };
  });
}

// The scroll for one player: public lines and their own, oldest first, the newest SCROLL_LINES.
function scrollLines_(account, admin) {
  var mine = xpLines_(account.id), shown = shownNames_();
  var lines = levelLines_(shown).map(function (l) { return { at: l.at, who: l.who, text: l.text, mine: l.account === account.id, kind: 'level' }; });
  lines = lines.concat(walkLines_(account.id)).concat(sharedLines_(account, shown, admin));
  mine.forEach(function (e, i) {
    lines.push({ at: e.at, mine: true, kind: 'xp', walk: e.walk, text: (e.xp < 0 ? '' : '+') + e.xp + ' XP: ' + e.say, seq: i });
  });
  // At the same moment: a walk's summary, then its XP, then any level it reached.
  var rank = { start: 0, gchat: 0, tell: 0, qm: 0, quest: 0, end: 0, walk: 0, xp: 1, level: 2, badge: 3 };
  lines.sort(function (a, b) { return a.at - b.at || rank[a.kind] - rank[b.kind] || (a.seq || 0) - (b.seq || 0); });
  return { lines: lines.slice(-SCROLL_LINES).map(scrollOut_), events: mine };
}

function scrollWhen_(ms) { return Utilities.formatDate(new Date(ms), Session.getScriptTimeZone(), 'EEE, MMM d, h:mm a'); }

// A command typed at the prompt, and its answer, a line each.
function scrollCommand_(account, typed) {
  var c = String(typed || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (c === 'help' || c === '?') return ['Commands:'].concat(SCROLL_COMMANDS.map(function (x) { return '  ' + x[0] + ': ' + x[1]; }));
  if (c === 'xp history' || c === 'xp') {
    var ev = xpLines_(account.id).slice().reverse();   // from your XP tab (S7-P1)
    if (!ev.length) return ['No XP yet. A walk with your GPX track saved earns your first.'];
    var total = round_(ev.reduce(function (t, e) { return t + e.xp; }, 0), 2);
    return ['Your XP, newest first (' + total + ' XP in all):'].concat(ev.slice(0, 100).map(function (e) { return '  ' + (e.xp < 0 ? '' : '+') + e.xp + ' XP · ' + scrollWhen_(e.at) + ' · ' + e.say; }))
      .concat(ev.length > 100 ? ['  …and ' + (ev.length - 100) + ' more before these.'] : []);
  }
  if (c === 'who') return whoLines_(account);
  if (c === 'board' || c.indexOf('board ') === 0) return boardCommand_(account, String(typed).trim().slice(5));
  if (c === 'level') {
    var ranges = levelRanges_(), xp = xpOf_(account.id);
    if (!ranges.length) return ['Levels aren\'t set up yet. You have ' + xp + ' XP.'];
    var level = levelFor_(account.id), need = 0;   // kept once reached (S7-P1, |Q745 (a))
    for (var n = 1; n <= level + 1 && n < 1000; n++) {
      var r = null, below = null;
      ranges.forEach(function (x) { if (x[0] <= n && (x[1] == null || n <= x[1])) r = x; if (x[0] <= n) below = x; });
      r = r || below;
      if (!r) { need = null; break; }
      need += r[2];
    }
    return ['Level ' + level + ', with ' + xp + ' XP.' + (need != null && need > xp ? ' ' + round_(need - xp, 2) + ' XP to Level ' + (level + 1) + '.' : '')];
  }
  if (c === 'walks') {
    // Each walk's XP from your tab (S7-P1).
    var walkXp = {};
    xpRows_(account.id).forEach(function (r) { if (r.walk) walkXp[r.walk] = (walkXp[r.walk] || 0) + r.xp; });
    var walks = readRows_(TABS.collections).filter(function (q) {
      return q.get('account') === account.id && q.get('simulated') !== 'Yes' && q.get('status') !== COLLECTION_DISCARDED && q.get('status') !== 'Collecting';
    }).sort(function (p, q) { return (q.get('started') instanceof Date ? q.get('started').getTime() : 0) - (p.get('started') instanceof Date ? p.get('started').getTime() : 0); }).slice(0, 10);
    if (!walks.length) return ['No walks yet. Press Start collecting on the main page for your first.'];
    return ['Your last ' + (walks.length === 1 ? 'walk' : walks.length + ' walks') + ', newest first:'].concat(walks.map(function (q) {
      var id = q.get('id'), counts = !!String(q.get('track')).trim();
      var xp = round_(walkXp[id] || 0, 2);
      return '  ' + id + ' · ' + scrollWhen_(q.get('started') instanceof Date ? q.get('started').getTime() : 0) + ' · ' + round_(Number(q.get('pounds')) || 0, 2) + ' lb · '
        + round_(Number(q.get('miles')) || 0, 2) + ' mi · ' + (counts ? '+' + xp + ' XP' : 'no XP until its GPX track is saved');
    }));
  }
  if (c === 'due') {
    var t = timeBonus_(), a = aloneBonus_(), segs = segmentSummaries_(false);
    var due = segs.filter(function (g) { return g.due; }).sort(function (p, q) { return p.left - q.left; });
    var alone = a.days > 0 && a.mult > 1 ? segs.filter(function (g) { return !g.due && (g.alone == null || g.alone >= a.days); }) : [];
    var out = [];
    if (due.length) {
      out.push('Due now, soonest first:');
      due.forEach(function (g) {
        var m = timeMult_(g.days, t);
        out.push('  ' + g.name + ' · ' + (g.left < 1 ? 'less than a day left' : round_(g.left, 1) + ' days left') + (m > 1 ? ' · ×' + m + ' XP now' : ''));
      });
    }
    if (alone.length) {
      out.push('Rescue bonus, ×' + a.mult + ' XP now:');   // named so on |Q881 (a)
      alone.slice(0, 15).forEach(function (g) { out.push('  ' + g.name + ' · ' + (g.alone == null ? 'never collected' : 'not collected in ' + Math.floor(g.alone) + ' days')); });
      if (alone.length > 15) out.push('  …and ' + (alone.length - 15) + ' more.');
    }
    return out.length ? out : ['Nothing\'s due right now.'];
  }
  return ['"' + String(typed).trim().slice(0, 40) + '" isn\'t a command. Type help for the commands.'];
}

// Called from the page: the scroll, and a command's answer when one was typed.
function scroll_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  // Reported tells are an admin's in Admin Mode only (S7-P10).
  var admin = !!req.admin && !!account.rank;
  // A command answers with only what it needs, not the whole scroll again
  // (S6-P3, |C919); the page keeps the scroll it has.
  if (req.command != null && String(req.command).trim()) {
    var typed = String(req.command).trim();
    var g = /^gchat(?:\s+([\s\S]*))?$/i.exec(typed);
    if (g) return { answer: [], line: gchatSay_(account, g[1]) };
    var t = /^tell(?:\s+([\s\S]*))?$/i.exec(typed);
    if (t) return { answer: [], line: tellSay_(account, t[1]) };
    var qa = questCommand_(account, typed);   // the Questmaster (S7-P4)
    if (qa) return { answer: qa };
    return { answer: scrollCommand_(account, req.command) };
  }
  // While it's open, the page asks every few seconds (item 6, |Q765 (a)):
  // only everyone's lines since, which is quick; levels come with a full load.
  if (req.since != null) {
    var since = Number(req.since) || 0;
    return { lines: sharedLines_(account, shownNames_(), admin).filter(function (l) { return l.at > since; }).map(scrollOut_), now: Date.now(), every: rhEvery_(), gchatMax: gchatMax_() };
  }
  return { lines: scrollLines_(account, admin).lines, commands: SCROLL_COMMANDS, now: Date.now(), every: rhEvery_(), gchatMax: gchatMax_() };
}

/* ── Cold storage (S6-P50, |Q795): a folder, HABO Litter Cold Storage,
   beside the litter Sheet, with a Google Sheet in it for each kind of old
   record, Gchat first. Moved, never thrown away. ── */
function coldFolder_() {
  var link = getSetting_(SETTING_COLD_FOLDER).trim();
  if (link) return DriveApp.getFolderById(driveId_(link));
  var parents = DriveApp.getFileById(getDb_().getId()).getParents();
  var folder = (parents.hasNext() ? parents.next() : DriveApp.getRootFolder()).createFolder('HABO Litter Cold Storage');
  setSetting_(SETTING_COLD_FOLDER, folder.getUrl());
  return folder;
}
// The cold storage Sheet for one kind of record, made the first time, with its header.
function coldSheet_(kind, header) {
  var props = PropertiesService.getScriptProperties(), key = 'COLD_' + kind.toUpperCase(), id = props.getProperty(key), book = null;
  if (id) { try { book = SpreadsheetApp.openById(id); } catch (e) { book = null; } }
  if (!book) {
    var folder = coldFolder_();
    book = SpreadsheetApp.create('HABO Litter Cold Storage: ' + kind);
    DriveApp.getFileById(book.getId()).moveTo(folder);
    props.setProperty(key, book.getId());
  }
  var sheet = book.getSheetByName(kind);
  if (!sheet) {
    sheet = book.insertSheet(kind);
    // A new Sheet's empty Sheet1 goes, once its own tab is there.
    var first = book.getSheetByName('Sheet1');
    if (first && first.getLastRow() === 0) { try { book.deleteSheet(first); } catch (e) { /* it can stay, empty */ } }
  }
  if (sheet.getLastRow() < 1) sheet.getRange(1, 1, 1, header.length).setValues([header]).setFontWeight('bold');
  return sheet;
}
// Past the setting's lines, the oldest move to cold storage, the newest
// GCHAT_KEEP staying. Returns how many moved.
function gchatColdMove_() { return coldMove_(TABS.gchat, 'Gchat'); }   // in Talk.js, for Tells too

// Made on the first request after Deploy, not when the first lines move
// (|C1022): the folder, and its Gchat Sheet. If Drive won't, it's made when
// lines first move instead.
function coldFolderOnce_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('COLD_FOLDER_MADE')) return;
  try {
    settingsMemo_ = null;
    coldSheet_('Gchat', TABS.gchat.header.concat(['Moved']));
    props.setProperty('COLD_FOLDER_MADE', 'yes');
  } catch (e) {
    props.setProperty('COLD_FOLDER_MADE', 'later: ' + String(e && e.message || e).slice(0, 200));
  }
}
