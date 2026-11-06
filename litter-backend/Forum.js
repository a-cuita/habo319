/**
 * The admins' forum (S5-P28, |M664, |Q617 to |Q620, |Q626 to |Q630, Nov 5):
 * a Forum screen in Admin Mode, with topics and replies, seen by every admin,
 * Apprentice and up (|Q618 (a)). Four kinds of topic (|Q626 (a)), each with
 * its states, like cards on the Build Board:
 *   Discussion: Open, then Done.
 *   Decision: Discussing, then Voting until a set date, then Passed, Failed
 *     or Withdrawn.
 *   Report: a player's Report an Issue or Submit an Idea, from the top menu
 *     (|Q593): New, Seen, Planned, then Done or Won't do, moved by a Builder
 *     or above (|Q630 (a)). An Idea can become a Decision.
 *   Review: a segment submitted to be public, or a piece to add to one, from
 *     Reviews (S5-P19 B), linked both ways; its state is the review's.
 * Votes, as in MoCiSN (|M151 on S3-U2): Approve, Reject or Abstain, one for
 * each Builder or above (|Q627 (a)), changeable until the vote closes: on its
 * date, or once everyone who may vote has (|Q628 (a)). More Approve than
 * Reject passes it, Abstain not counting (|Q629 (a)).
 * Every topic keeps its history: who opened it, who moved it, and when. A
 * reply by someone else in a topic you opened or replied in is a notice in
 * Admin Mode (|Q620). The email digest waits for its questions' answers.
 */
var FORUM_KINDS = ['Discussion', 'Decision', 'Report', 'Review'];
var FORUM_STATES = {
  Discussion: ['Open', 'Done'],
  Decision: ['Discussing', 'Voting', 'Passed', 'Failed', 'Withdrawn'],
  Report: ['New', 'Seen', 'Planned', 'Done', 'Won\'t do']
};
var FORUM_VOTES = ['Approve', 'Reject', 'Abstain'];
var REPORT_OF = { Issue: 'Report an Issue', Idea: 'Submit an Idea' };
var TOPIC_COL = { id: 1, kind: 2, title: 3, state: 4, by: 5, opened: 6, updated: 7, text: 8, of: 9, link: 10, closes: 11 };
var FREPLY_COL = { id: 1, topic: 2, by: 3, written: 4, text: 5 };
var FVOTE_COL = { topic: 1, by: 2, vote: 3, voted: 4 };
var FHIST_COL = { time: 1, topic: 2, by: 3, move: 4, from: 5, to: 6, note: 7 };
var FREAD_COL = { by: 1, topic: 2, read: 3 };
var FORUM_TEXT_MAX = 4000, FORUM_TITLE_MAX = 100;

/* ── Reading ── */

function ms_(v) { return v instanceof Date ? v.getTime() : 0; }
function forumTopics_() {
  return readRows_(TABS.forumTopics, TOPIC_COL).map(function (r) {
    return { row: r.row, id: r.get('id'), kind: r.get('kind'), title: r.get('title'), state: r.get('state'), by: r.get('by'), opened: ms_(r.get('opened')),
      updated: ms_(r.get('updated')), text: r.get('text'), of: r.get('of'), link: r.get('link'), closes: String(r.get('closes') instanceof Date ? dayOf_(r.get('closes')) : r.get('closes')) };
  });
}
function forumReplies_() {
  return readRows_(TABS.forumReplies, FREPLY_COL).map(function (r) {
    return { id: r.get('id'), topic: r.get('topic'), by: r.get('by'), written: ms_(r.get('written')), text: r.get('text') };
  });
}
function forumVotes_() {
  return readRows_(TABS.forumVotes, FVOTE_COL).map(function (r) {
    return { row: r.row, topic: r.get('topic'), by: r.get('by'), vote: r.get('vote'), voted: ms_(r.get('voted')) };
  });
}
function forumHistory_() {
  return readRows_(TABS.forumHistory, FHIST_COL).map(function (r) {
    return { time: ms_(r.get('time')), topic: r.get('topic'), by: r.get('by'), move: r.get('move'), from: r.get('from'), to: r.get('to'), note: r.get('note') };
  });
}
function forumReads_(accountId) {
  var out = {};
  readRows_(TABS.forumReads, FREAD_COL).forEach(function (r) { if (r.get('by') === accountId) out[r.get('topic')] = { row: r.row, read: ms_(r.get('read')) }; });
  return out;
}

// A date as the day it falls on here, like 2026-11-12.
function dayOf_(d) { return Utilities.formatDate(d, Session.getScriptTimeZone(), 'yyyy-MM-dd'); }

// Who may vote: every Builder or above (|Q627 (a)).
function voters_() { return readAccounts_().filter(function (a) { return rankAtLeast_(a.rank, 'Builder'); }); }

function requireAdmin_(account) { if (!account.rank) throw new Error('The Forum is for HABO\'s admins.'); }

/* ── Writing ── */

function forumHistoryAdd_(topic, account, move, from, to, note) {
  var sheet = getDb_().getSheetByName(TABS.forumHistory.name), row = blankRow_(TABS.forumHistory);
  row[FHIST_COL.time - 1] = new Date(); row[FHIST_COL.topic - 1] = topic; row[FHIST_COL.by - 1] = account ? account.id : '';
  row[FHIST_COL.move - 1] = move; row[FHIST_COL.from - 1] = from || ''; row[FHIST_COL.to - 1] = to || ''; row[FHIST_COL.note - 1] = safeCell_(note || '');
  sheet.getRange(lastRowWith_(sheet, 1) + 1, 1, 1, row.length).setValues([row]);
}
function topicSet_(t, fields) {
  var sheet = getDb_().getSheetByName(TABS.forumTopics.name);
  Object.keys(fields).forEach(function (k) { sheet.getRange(t.row, TOPIC_COL[k]).setValue(fields[k]); t[k] = fields[k] instanceof Date ? fields[k].getTime() : fields[k]; });
}
function topicNew_(account, kind, title, text, state, of, link) {
  var sheet = getDb_().getSheetByName(TABS.forumTopics.name), now = new Date();
  var id = nextId_('T', forumTopics_().map(function (t) { return t.id; }));
  var row = blankRow_(TABS.forumTopics);
  row[TOPIC_COL.id - 1] = id; row[TOPIC_COL.kind - 1] = kind; row[TOPIC_COL.title - 1] = safeCell_(title); row[TOPIC_COL.state - 1] = state;
  row[TOPIC_COL.by - 1] = account.id; row[TOPIC_COL.opened - 1] = now; row[TOPIC_COL.updated - 1] = now; row[TOPIC_COL.text - 1] = safeCell_(text);
  row[TOPIC_COL.of - 1] = of || ''; row[TOPIC_COL.link - 1] = link || '';
  sheet.getRange(lastRowWith_(sheet, 1) + 1, 1, 1, row.length).setValues([row]);
  forumHistoryAdd_(id, account, 'Opened', '', state, kind === 'Report' ? REPORT_OF[of] : '');
  markRead_(account.id, id);
  return id;
}
// You've read a topic up to now: set when you open it, reply in it, or start it.
function markRead_(accountId, topicId) {
  var sheet = getDb_().getSheetByName(TABS.forumReads.name), had = forumReads_(accountId)[topicId];
  if (had) sheet.getRange(had.row, FREAD_COL.read).setValue(new Date());
  else sheet.getRange(lastRowWith_(sheet, 1) + 1, 1, 1, 3).setValues([[accountId, topicId, new Date()]]);
}
function textOf_(v, what) {
  var t = clean_(v, FORUM_TEXT_MAX);
  if (t.length < 2) throw new Error('Write ' + what + ' first.');
  return t;
}

// A vote closes on its date, or sooner once everyone who may vote has. Run
// whenever the forum is read, so no trigger is needed.
function closeVotes_() {
  var open = forumTopics_().filter(function (t) { return t.kind === 'Decision' && t.state === 'Voting'; });
  if (!open.length) return;
  var votes = forumVotes_(), who = voters_().map(function (a) { return a.id; }), today = dayOf_(new Date());
  open.forEach(function (t) {
    var mine = votes.filter(function (v) { return v.topic === t.id; });
    var all = who.length && who.every(function (id) { return mine.some(function (v) { return v.by === id; }); });
    if (!(t.closes && today > t.closes) && !all) return;
    var n = countVotes_(mine), to = n.Approve > n.Reject ? 'Passed' : 'Failed';
    topicSet_(t, { state: to, updated: new Date() });
    forumHistoryAdd_(t.id, null, 'Vote closed', 'Voting', to, (all ? 'Everyone who may vote has voted. ' : 'Its date passed. ') + voteWords_(n));
  });
}
function countVotes_(list) {
  var n = { Approve: 0, Reject: 0, Abstain: 0 };
  list.forEach(function (v) { if (n.hasOwnProperty(v.vote)) n[v.vote]++; });
  return n;
}
function voteWords_(n) { return 'Approve ' + n.Approve + ', Reject ' + n.Reject + ', Abstain ' + n.Abstain + '.'; }

/* ── What the page gets ── */

// A Review topic's state is its review's: New, Recommended, Approved, Declined.
function reviewStates_() {
  var out = {};
  reviewsView_({ rank: 'Apprentice' }).reviews.forEach(function (r) { out[r.id] = { state: r.state, name: r.name }; });
  segmentsAll_().forEach(function (g) { if (!out[g.id] && g.by) out[g.id] = { state: g.accepted ? 'Approved' : g.declined ? 'Declined' : 'New', name: g.name }; });
  return out;
}

function forumView_(account) {
  closeVotes_();
  var people = {}, reads = forumReads_(account.id), replies = forumReplies_(), reviews = null;
  readAccounts_().forEach(function (a) { people[a.id] = a; });
  var list = forumTopics_().map(function (t) {
    var mine = replies.filter(function (r) { return r.topic === t.id; });
    var last = mine.reduce(function (m, r) { return Math.max(m, r.written); }, t.updated);
    var read = reads[t.id] ? reads[t.id].read : 0;
    var state = t.state;
    if (t.kind === 'Review') { reviews = reviews || reviewStates_(); state = (reviews[t.link] || {}).state || 'Closed'; }
    return { id: t.id, kind: t.kind, title: t.title, state: state, by: handleOf_(people[t.by], t.by), opened: t.opened, active: last, of: t.of, link: t.link,
      closes: t.closes, replies: mine.length, unread: mine.filter(function (r) { return r.by !== account.id && r.written > read; }).length, seen: !!reads[t.id] };
  });
  list.sort(function (a, b) { return b.active - a.active; });
  return { topics: list, rank: account.rank, canVote: rankAtLeast_(account.rank, 'Builder'), canMove: rankAtLeast_(account.rank, 'Builder'), states: FORUM_STATES,
    digest: digestView_(account.id) };
}
function handleOf_(a, id) { return a ? (a.handle || a.first) : id; }

function topicView_(account, id) {
  var t = forumTopics_().filter(function (x) { return x.id === id; })[0];
  if (!t) throw new Error('That topic isn\'t here any more.');
  var people = {};
  readAccounts_().forEach(function (a) { people[a.id] = a; });
  var who = function (aid) { var a = people[aid]; return { name: handleOf_(a, aid), rank: a ? a.rank : '' }; };
  var out = { id: t.id, kind: t.kind, title: t.title, state: t.state, by: who(t.by).name, byRank: who(t.by).rank, mine: t.by === account.id,
    opened: t.opened, text: t.text, of: t.of, ofWords: REPORT_OF[t.of] || '', link: t.link, closes: t.closes,
    replies: forumReplies_().filter(function (r) { return r.topic === t.id; }).map(function (r) { var p = who(r.by); return { by: p.name, rank: p.rank, written: r.written, text: r.text }; }),
    history: forumHistory_().filter(function (h) { return h.topic === t.id; }).map(function (h) { return { time: h.time, by: h.by ? who(h.by).name : 'HABO', move: h.move, from: h.from, to: h.to, note: h.note }; }),
    canVote: rankAtLeast_(account.rank, 'Builder'), canMove: rankAtLeast_(account.rank, 'Builder') };
  if (t.kind === 'Review') {
    var rv = reviewStates_()[t.link] || { state: 'Closed', name: t.link };
    out.state = rv.state; out.linkName = rv.name;
  }
  if (t.kind === 'Decision') {
    var votes = forumVotes_().filter(function (v) { return v.topic === t.id; }), mineV = votes.filter(function (v) { return v.by === account.id; })[0];
    out.votes = countVotes_(votes);
    out.myVote = mineV ? mineV.vote : '';
    out.voters = voters_().length;
    out.voted = votes.length;
    if (t.link) { var from = forumTopics_().filter(function (x) { return x.id === t.link; })[0]; if (from) out.linkName = from.title; }
  }
  // An Idea made a Decision: its Decision.
  if (t.kind === 'Report') {
    var d = forumTopics_().filter(function (x) { return x.kind === 'Decision' && x.link === t.id; })[0];
    if (d) { out.decision = d.id; out.decisionName = d.title; }
  }
  // What this admin may do with it now.
  var opener = t.by === account.id, builder = rankAtLeast_(account.rank, 'Builder');
  out.can = [];
  if (t.kind === 'Discussion' && (opener || builder)) out.can.push(t.state === 'Done' ? 'Open' : 'Done');
  if (t.kind === 'Decision' && t.state === 'Discussing' && (opener || builder)) out.can.push('Voting');
  if (t.kind === 'Decision' && opener && (t.state === 'Discussing' || t.state === 'Voting')) out.can.push('Withdrawn');
  if (t.kind === 'Report' && builder) FORUM_STATES.Report.forEach(function (s) { if (s !== t.state) out.can.push(s); });
  if (t.kind === 'Report' && builder && t.of === 'Idea' && !out.decision) out.can.push('Decision');
  return out;
}

/* ── Called from the page ── */

function forumLoad_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  requireAdmin_(account);
  return forumLock_(function () { return forumView_(account); });
}

// One topic, in full; reading it marks it read.
function forumTopic_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  requireAdmin_(account);
  var id = clean_(req.topicId, 20);
  return forumLock_(function () {
    closeVotes_();
    var out = topicView_(account, id);
    markRead_(account.id, id);
    return { topic: out };
  });
}

// A new Discussion or Decision, by any admin.
function forumOpen_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  requireAdmin_(account);
  var kind = String(req.kind || '');
  if (kind !== 'Discussion' && kind !== 'Decision') throw new Error('Choose Discussion or Decision.');
  var title = clean_(req.title, FORUM_TITLE_MAX);
  if (title.length < 2) throw new Error('Give it a title.');
  var text = textOf_(req.text, kind === 'Decision' ? 'what you propose' : 'what it\'s about');
  return forumLock_(function () {
    var id = topicNew_(account, kind, title, text, FORUM_STATES[kind][0]);
    return { topic: topicView_(account, id) };
  });
}

// A reply, by any admin, on any topic.
function forumReply_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  requireAdmin_(account);
  var text = textOf_(req.text, 'your reply');
  var id = clean_(req.topicId, 20);
  return forumLock_(function () {
    var t = forumTopics_().filter(function (x) { return x.id === id; })[0];
    if (!t) throw new Error('That topic isn\'t here any more.');
    var sheet = getDb_().getSheetByName(TABS.forumReplies.name), now = new Date();
    var rid = nextId_('FR', forumReplies_().map(function (r) { return r.id; }));
    sheet.getRange(lastRowWith_(sheet, 1) + 1, 1, 1, 5).setValues([[rid, t.id, account.id, now, safeCell_(text)]]);
    topicSet_(t, { updated: now });
    markRead_(account.id, t.id);
    return { topic: topicView_(account, t.id) };
  });
}

// A topic moved to another state, by whoever may (see topicView_'s `can`).
function forumMove_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  requireAdmin_(account);
  var id = clean_(req.topicId, 20), to = String(req.to || ''), note = clean_(req.note, 500);
  return forumLock_(function () {
    closeVotes_();
    var view = topicView_(account, id);
    if (view.can.indexOf(to) === -1) throw new Error(moveRefusal_(view, to));
    var t = forumTopics_().filter(function (x) { return x.id === id; })[0], from = t.state;
    if (to === 'Decision') {
      // An Idea made a Decision: a new Decision topic, linked to the Idea.
      var did = topicNew_(account, 'Decision', clean_('Idea: ' + t.title, FORUM_TITLE_MAX), t.text, 'Discussing', '', t.id);
      forumHistoryAdd_(t.id, account, 'Made a Decision', '', '', did);
      return { topic: topicView_(account, did) };
    }
    var fields = { state: to, updated: new Date() };
    if (to === 'Voting') {
      var day = String(req.closes || '').trim();
      if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Choose the day the vote closes.');
      if (day < dayOf_(new Date())) throw new Error('The vote can\'t close before today.');
      fields.closes = day;
      note = (note ? note + ' ' : '') + 'Closes at the end of ' + day + '.';
    }
    topicSet_(t, fields);
    forumHistoryAdd_(t.id, account, 'Moved', from, to, note);
    closeVotes_();
    return { topic: topicView_(account, t.id) };
  });
}
function moveRefusal_(view, to) {
  if (view.kind === 'Report') return 'A Builder or above moves a player\'s report.';
  if (view.kind === 'Decision' && to === 'Withdrawn') return 'Only the admin who opened it can withdraw it, before the vote closes.';
  if (view.kind === 'Decision' && to === 'Voting') return view.state === 'Discussing' ? 'The admin who opened it, or a Builder or above, puts it to a vote.' : 'It isn\'t being discussed any more.';
  if (view.kind === 'Review') return 'A review moves in Reviews.';
  return 'The admin who opened it, or a Builder or above, can do that.';
}

// A vote on a Decision, by a Builder or above, changeable until it closes.
function forumVote_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  requireAdmin_(account);
  if (!rankAtLeast_(account.rank, 'Builder')) throw new Error('A Builder or above votes; an Apprentice reads and replies.');
  var vote = String(req.vote || '');
  if (FORUM_VOTES.indexOf(vote) === -1) throw new Error('Vote Approve, Reject or Abstain.');
  var id = clean_(req.topicId, 20);
  return forumLock_(function () {
    closeVotes_();
    var t = forumTopics_().filter(function (x) { return x.id === id; })[0];
    if (!t || t.kind !== 'Decision') throw new Error('That isn\'t a Decision.');
    if (t.state !== 'Voting') throw new Error('Its vote isn\'t open.');
    var sheet = getDb_().getSheetByName(TABS.forumVotes.name);
    var had = forumVotes_().filter(function (v) { return v.topic === id && v.by === account.id; })[0];
    if (had) sheet.getRange(had.row, FVOTE_COL.vote, 1, 2).setValues([[vote, new Date()]]);
    else sheet.getRange(lastRowWith_(sheet, 1) + 1, 1, 1, 4).setValues([[id, account.id, vote, new Date()]]);
    topicSet_(t, { updated: new Date() });
    closeVotes_();
    return { topic: topicView_(account, id) };
  });
}

// The Forum topic for a review, made the first time it's asked for.
function forumReview_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  requireAdmin_(account);
  var rid = clean_(req.reviewId, 20);
  return forumLock_(function () {
    var had = forumTopics_().filter(function (t) { return t.kind === 'Review' && t.link === rid; })[0];
    if (had) return { topic: topicView_(account, had.id) };
    var rv = reviewStates_()[rid];
    if (!rv) throw new Error('That review isn\'t here any more.');
    var id = topicNew_(account, 'Review', clean_(rv.name, FORUM_TITLE_MAX), '', '', '', rid);
    return { topic: topicView_(account, id) };
  });
}

// A player's report, from the top menu: Report an Issue or Submit an Idea.
function reportSend_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var of = String(req.of || '');
  if (!REPORT_OF[of]) throw new Error('Choose Report an Issue or Submit an Idea.');
  var text = textOf_(req.text, of === 'Idea' ? 'your idea' : 'what happened');
  return forumLock_(function () {
    // At most 10 an hour from one account.
    var hour = Date.now() - 3600000;
    if (forumTopics_().filter(function (t) { return t.kind === 'Report' && t.by === account.id && t.opened > hour; }).length >= 10) throw new Error('That\'s 10 this hour. Try again later.');
    var first = text.split(/\r?\n/)[0];
    var title = first.length > 80 ? first.slice(0, 79).replace(/\s+\S*$/, '') + '…' : first;
    var id = topicNew_(account, 'Report', title, text, 'New', of);
    return { id: id };
  });
}

// New replies by others in the topics you opened or replied in, since you
// last read each: for the notice in Admin Mode.
function forumUnread_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!account.rank) return { replies: 0, topics: 0 };
  var reads = forumReads_(account.id), replies = forumReplies_(), mine = {};
  forumTopics_().forEach(function (t) { if (t.by === account.id) mine[t.id] = true; });
  replies.forEach(function (r) { if (r.by === account.id) mine[r.topic] = true; });
  var news = replies.filter(function (r) { return mine[r.topic] && r.by !== account.id && r.written > (reads[r.topic] ? reads[r.topic].read : 0); });
  var topics = {};
  news.forEach(function (r) { topics[r.topic] = true; });
  return { replies: news.length, topics: Object.keys(topics).length };
}

/* ── The email digest (S5-P28 round 2, |Q634 to |Q638, all (a)) ──
 * Each admin's digest is Off, Daily or Weekly, asked the first time they
 * open the Forum, and changed there (no link in the email changes it, since
 * mail scanners open links). It holds the new replies by others, in topics
 * the admin hasn't read since, grouped by topic with a link to each. It goes
 * at one hour of the day, set in Settings (Monday at that hour for Weekly),
 * from an hourly trigger you add once in the Apps Script editor. Coalition
 * Builder's advice (|M817): the cutoff moves only after a send that worked,
 * or a check that found nothing new; a missed hour catches up later that day.
 */
var DIGEST_COL = { by: 1, cadence: 2, asked: 3, since: 4, sent: 5, result: 6 };
var DIGEST_CADENCES = ['Off', 'Daily', 'Weekly'];
var SETTING_DIGEST_HOUR = 'Forum digest hour';

function digestRows_() {
  return readRows_(TABS.forumDigest, DIGEST_COL).map(function (r) {
    return { row: r.row, by: r.get('by'), cadence: DIGEST_CADENCES.indexOf(r.get('cadence')) >= 0 ? r.get('cadence') : 'Off', asked: ms_(r.get('asked')),
      since: ms_(r.get('since')), sent: ms_(r.get('sent')), result: r.get('result') };
  });
}
function digestOf_(accountId) { return digestRows_().filter(function (d) { return d.by === accountId; })[0] || null; }
function digestView_(accountId) {
  var d = digestOf_(accountId);
  return { cadence: d ? d.cadence : 'Off', asked: !!(d && d.asked), hour: digestHour_(), result: d ? d.result : '' };
}
function digestHour_() {
  var n = Number(getSetting_(SETTING_DIGEST_HOUR));
  return getSetting_(SETTING_DIGEST_HOUR).trim() !== '' && n >= 0 && n <= 23 ? Math.floor(n) : 7;
}
function digestWrite_(d, fields) {
  // Under the lock, so what was read before it is read again after (S6-P1).
  forumLock_(function () {
    var sheet = getDb_().getSheetByName(TABS.forumDigest.name);
    Object.keys(fields).forEach(function (k) { sheet.getRange(d.row, DIGEST_COL[k]).setValue(fields[k]); });
  });
}

// An admin's choice, from the Forum: Off, Daily or Weekly.
function forumDigestSave_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  requireAdmin_(account);
  var cadence = String(req.cadence || '');
  if (DIGEST_CADENCES.indexOf(cadence) === -1) throw new Error('Choose Off, Daily or Weekly.');
  return forumLock_(function () {
    var d = digestOf_(account.id), now = new Date();
    if (!d) {
      var sheet = getDb_().getSheetByName(TABS.forumDigest.name);
      // Last sent counts as now, so the first one goes at the next time it's due, not at once.
      sheet.getRange(lastRowWith_(sheet, 1) + 1, 1, 1, 6).setValues([[account.id, cadence, now, now, now, '']]);
    } else {
      var fields = { cadence: cadence, asked: d.asked ? new Date(d.asked) : now };
      // Changed: it goes at its next time, not at once. Turned on from Off:
      // only replies from now on. Daily to Weekly keeps what's waiting.
      if (d.cadence !== cadence) fields.sent = now;
      if (d.cadence === 'Off' && cadence !== 'Off') fields.since = now;
      digestWrite_(d, fields);
    }
    logChange_(account.email, 'Forum digest', account.id, 'Cadence', d ? d.cadence : '', cadence);
    return { digest: digestView_(account.id) };
  });
}

// When this admin's digest was last due: today at the hour (Daily), or this
// week's Monday at the hour (Weekly). Null for Off.
function digestDueAt_(cadence, now, hour) {
  if (cadence !== 'Daily' && cadence !== 'Weekly') return null;
  var tz = Session.getScriptTimeZone();
  var day = Utilities.formatDate(now, tz, 'yyyy-MM-dd');
  if (cadence === 'Weekly') {
    // Back to this week's Monday, by the calendar date alone.
    var p = day.split('-').map(Number), d = new Date(Date.UTC(p[0], p[1] - 1, p[2]));
    d = new Date(d.getTime() - ((d.getUTCDay() + 6) % 7) * DAY_MS);
    day = d.getUTCFullYear() + '-' + ('0' + (d.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + d.getUTCDate()).slice(-2);
  }
  return Utilities.parseDate(day + ' ' + ('0' + hour).slice(-2) + ':00', tz, 'yyyy-MM-dd HH:mm');
}

// What one admin's digest holds now: new replies by others, newer than both
// the cutoff and when the admin last read each topic, grouped by topic,
// the most recently active first.
function digestItems_(account, since, topics, replies, people) {
  var reads = forumReads_(account.id), byTopic = {};
  replies.forEach(function (r) {
    var read = reads[r.topic] ? reads[r.topic].read : 0;
    if (r.by === account.id || r.written <= since || r.written <= read) return;
    (byTopic[r.topic] = byTopic[r.topic] || []).push(r);
  });
  return Object.keys(byTopic).map(function (id) {
    var t = topics.filter(function (x) { return x.id === id; })[0] || { id: id, title: id, kind: '' };
    var list = byTopic[id].sort(function (a, b) { return a.written - b.written; });
    return { id: id, title: t.title, kind: t.kind, last: list[list.length - 1].written,
      replies: list.map(function (r) { var p = people[r.by]; return { by: p ? (p.handle || p.first) : r.by, written: r.written, text: r.text.length > 300 ? r.text.slice(0, 299) + '…' : r.text }; }) };
  }).sort(function (a, b) { return b.last - a.last; });
}

function digestMail_(account, groups) {
  var n = groups.reduce(function (t, g) { return t + g.replies.length; }, 0);
  var url = String(getSetting_(SETTING_PUBLIC_URL) || DEFAULT_PUBLIC_URL).trim();
  var tz = Session.getScriptTimeZone();
  var when = function (ms) { return Utilities.formatDate(new Date(ms), tz, 'MMM d, h:mm a'); };
  var link = function (g) { return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'forum=' + encodeURIComponent(g.id); };
  var subject = 'HABO Forum: ' + (n === 1 ? '1 new reply' : n + ' new replies') + ' in ' + (groups.length === 1 ? '1 topic' : groups.length + ' topics');
  var foot = 'To change this email or turn it off, open the Forum in Admin Mode: Your email digest. Replying to this email doesn\'t post in the Forum.';
  var plain = ['New replies in the HABO Forum, by others, in topics you haven\'t read since.', '']
    .concat([].concat.apply([], groups.map(function (g) {
      return [g.title + ' (' + (g.replies.length === 1 ? '1 new' : g.replies.length + ' new') + ')', link(g)]
        .concat(g.replies.map(function (r) { return '  ' + r.by + ', ' + when(r.written) + ': ' + r.text; })).concat(['']);
    }))).concat([foot]).join('\n');
  var html = '<p>New replies in the HABO Forum, by others, in topics you haven\'t read since.</p>' + groups.map(function (g) {
    return '<h3 style="margin:16px 0 4px"><a href="' + htmlEscape_(link(g)) + '">' + htmlEscape_(g.title) + '</a> <span style="color:#666;font-weight:normal">(' + (g.replies.length === 1 ? '1 new' : g.replies.length + ' new') + ')</span></h3>' +
      g.replies.map(function (r) { return '<p style="margin:4px 0 8px"><b>' + htmlEscape_(r.by) + '</b>, ' + htmlEscape_(when(r.written)) + '<br>' + htmlEscape_(r.text).replace(/\n/g, '<br>') + '</p>'; }).join('');
  }).join('') + '<p style="color:#666;font-size:13px;margin-top:20px">' + htmlEscape_(foot) + '</p>';
  // sendMail_ answers { ok, why } rather than throwing: a failure keeps the cutoff.
  var r = sendMail_(account.email, subject, plain, html);
  if (!r.ok) throw new Error(r.why || 'the email didn\'t go');
  return n;
}

// Each hour, from the trigger you add once in the Apps Script editor
// (Triggers, Add Trigger, forumDigestTick, Time-driven, Hour timer, Every
// hour): each admin whose digest is due gets it, or nothing if nothing's new.
// The Forum's own writes, under the lock: they touch nothing kept_ keeps,
// so what's kept stays kept (S6-P1).
function forumLock_(fn) { return withLock_(fn, true); }

function forumDigestTick() {
  // A trigger starts here, not through dispatch_, so nothing kept is carried in (S6-P1).
  forgetReads_();
  ensureSchema_();
  var now = new Date(), hour = digestHour_();
  var due = digestRows_().filter(function (d) {
    var at = digestDueAt_(d.cadence, now, hour);
    return at && now.getTime() >= at.getTime() && d.sent < at.getTime();
  });
  if (!due.length) return 0;
  var people = {};
  readAccounts_().forEach(function (a) { people[a.id] = a; });
  var topics = forumTopics_(), replies = forumReplies_(), sent = 0;
  due.forEach(function (d) {
    var account = people[d.by];
    if (!account || !account.rank || !account.email) { digestWrite_(d, { sent: now, result: 'Not an admin now: nothing sent.' }); return; }
    var groups = digestItems_(account, d.since, topics, replies, people);
    if (!groups.length) { digestWrite_(d, { sent: now, since: now, result: 'Nothing new: no email.' }); return; }
    try {
      var n = digestMail_(account, groups);
      digestWrite_(d, { sent: now, since: now, result: 'Sent ' + Utilities.formatDate(now, Session.getScriptTimeZone(), 'MMM d, h:mm a') + ': ' + n + (n === 1 ? ' reply.' : ' replies.') });
      sent++;
    } catch (e) {
      // The cutoff stays, so these replies go in the next digest.
      digestWrite_(d, { result: 'Not sent: ' + String(e && e.message || e).slice(0, 200) });
    }
  });
  return sent;
}
