// The admins' forum in Admin Mode (S5-P28, |Q617 to |Q620, |Q626 to |Q630):
// topics of four kinds, newest activity first, each with its states, its
// replies and its history; votes on a Decision; a player's reports, from
// Report an Issue and Submit an Idea in the top menu; and a notice when
// someone replies in a topic you opened or replied in.
window.LitterForum = function (app) {
  'use strict';
  var $ = app.$;
  var list = null, topic = null, told = false;
  var CLOSED = ['Done', 'Passed', 'Failed', 'Withdrawn', 'Won\'t do', 'Approved', 'Declined', 'Closed'];
  var MOVE_WORDS = { Open: 'Reopen', Done: 'Mark Done', Voting: 'Put to a vote', Withdrawn: 'Withdraw', New: 'Mark New', Seen: 'Mark Seen',
    Planned: 'Mark Planned', 'Won\'t do': 'Mark Won\'t do', Decision: 'Make it a Decision' };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function button(label, cls, go) {
    var b = el('button', cls, label);
    b.type = 'button';
    b.addEventListener('click', go);
    return b;
  }
  function when(ms) {
    return new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
  }
  function failed(err, where) {
    if (err.code === 'signed-out') return app.signedOut();
    $(where).textContent = err.message;
  }
  function kindWords(t) { return t.kind === 'Report' ? (t.of === 'Idea' ? 'Idea' : 'Issue') : t.kind; }

  /* ── The list ── */

  function open() {
    app.show('v-forum');
    $('forum-form').hidden = true;
    $('forum-list').textContent = '';
    $('forum-note').textContent = 'Loading the Forum…';
    return app.api('forumLoad', { token: app.myToken() }).then(function (d) { list = d; drawList(); }, function (err) { failed(err, 'forum-note'); });
  }
  function drawList() {
    var box = $('forum-list'), kind = $('forum-kind').value, closed = $('forum-closed').checked;
    box.textContent = '';
    var shown = list.topics.filter(function (t) { return (!kind || t.kind === kind) && (closed || CLOSED.indexOf(t.state) === -1); });
    var open = list.topics.filter(function (t) { return CLOSED.indexOf(t.state) === -1; }).length;
    $('forum-note').textContent = (open === 1 ? '1 topic is' : open + ' topics are') + ' still open. ' +
      (list.canVote ? 'As a ' + list.rank + ', you vote on Decisions and move players\' reports.' : 'As an ' + list.rank + ', you read and reply; a Builder or above votes and moves reports.');
    if (!shown.length) box.appendChild(el('p', 'card muted small', list.topics.length ? 'None to show: change what\'s shown above.' : 'No topics yet. Start one above.'));
    // The email digest (|Q635 (a)): asked the first time you open the Forum,
    // then changed here, under the topics (|Q638 (a)).
    var dg = digestBox();
    if (!list.digest || !list.digest.asked) box.appendChild(dg);
    shown.forEach(function (t) {
      var b = el('button', 'card lt-forum-row' + (t.unread || !t.seen ? ' lt-forum-new' : ''));
      b.type = 'button';
      b.dataset.id = t.id;
      var top = el('div', 'lt-forum-top');
      top.appendChild(el('span', 'lt-forum-kind lt-forum-kind-' + t.kind.toLowerCase(), kindWords(t)));
      top.appendChild(el('span', 'lt-forum-state', t.state));
      b.appendChild(top);
      b.appendChild(el('p', 'lt-forum-title', t.title));
      b.appendChild(el('p', 'muted small', 'By ' + t.by + ' · ' + (t.replies === 1 ? '1 reply' : t.replies + ' replies') + (t.unread ? ' · ' + t.unread + ' new' : !t.seen ? ' · new to you' : '') + ' · ' + when(t.active)));
      b.addEventListener('click', function () { openTopic(t.id); });
      box.appendChild(b);
    });
    if (list.digest && list.digest.asked) box.appendChild(dg);
  }
  function hourWords(h) { return h === 0 ? '12 AM' : h < 12 ? h + ' AM' : h === 12 ? '12 PM' : (h - 12) + ' PM'; }
  function digestBox() {
    var d = list.digest || { cadence: 'Off', asked: false, hour: 7 };
    var c = el('section', 'card lt-forum-digest' + (d.asked ? '' : ' lt-forum-ask'));
    c.id = 'forum-digest';
    c.appendChild(el('h3', 'lt-ft-sub', d.asked ? 'Your email digest' : 'Email you new replies in the Forum?'));
    c.appendChild(el('p', 'muted small', 'The new replies by others, in topics you haven\'t read since, grouped by topic with a link to each. Daily goes at ' + hourWords(d.hour) +
      '; Weekly, on Monday at ' + hourWords(d.hour) + '. Nothing new, no email.'));
    var row = el('div', 'lt-forum-cadence');
    ['Off', 'Daily', 'Weekly'].forEach(function (k) {
      var l = el('label');
      var r = el('input');
      r.type = 'radio'; r.name = 'forum-cadence'; r.value = k; r.checked = d.asked ? d.cadence === k : false;
      l.appendChild(r); l.appendChild(document.createTextNode(' ' + k));
      row.appendChild(l);
    });
    c.appendChild(row);
    if (d.asked && d.result) c.appendChild(el('p', 'muted small', 'Last: ' + d.result));
    var err = el('p', 'err');
    err.id = 'forum-digest-err';
    var save = el('button', 'btn btn-primary lt-forum-digest-save', 'Save');
    save.type = 'button';
    save.addEventListener('click', function () {
      var pick = c.querySelector('input[name="forum-cadence"]:checked');
      if (!pick) { err.textContent = 'Choose Off, Daily or Weekly.'; return; }
      app.busy(save, err.id, function () {
        return app.api('forumDigestSave', { token: app.myToken(), cadence: pick.value }).then(function (r) {
          list.digest = r.digest;
          drawList();
          app.notice(pick.value === 'Off' ? 'Your Forum digest is off.' : 'Your Forum digest: ' + pick.value + ', at ' + hourWords(r.digest.hour) + (pick.value === 'Weekly' ? ' on Mondays.' : '.'));
        });
      });
    });
    c.appendChild(save);
    c.appendChild(err);
    return c;
  }
  function newForm(show) {
    $('forum-form').hidden = !show;
    $('forum-new').hidden = show;
    $('forum-err').textContent = '';
    if (show) { $('forum-title').value = ''; $('forum-text').value = ''; newKind(); $('forum-title').focus(); }
  }
  function newKind() {
    var k = document.querySelector('input[name="forum-new-kind"]:checked').value;
    $('forum-text-label').textContent = k === 'Decision' ? 'What you propose' : 'What it\'s about';
  }
  function create(e) {
    e.preventDefault();
    var k = document.querySelector('input[name="forum-new-kind"]:checked').value;
    app.busy($('forum-open'), 'forum-err', function () {
      return app.api('forumOpen', { token: app.myToken(), kind: k, title: $('forum-title').value, text: $('forum-text').value }).then(function (d) {
        newForm(false);
        drawTopic(d.topic);
      });
    });
  }

  /* ── A topic ── */

  function openTopic(id) {
    app.show('v-forum-topic');
    $('ft-head').textContent = 'Loading…';
    ['ft-vote', 'ft-moves'].forEach(function (x) { $(x).hidden = true; });
    $('ft-replies').textContent = '';
    return app.api('forumTopic', { token: app.myToken(), topicId: id }).then(function (d) { drawTopic(d.topic); }, function (err) { failed(err, 'ft-head'); });
  }
  function drawTopic(t) {
    topic = t;
    app.show('v-forum-topic');
    var head = $('ft-head');
    head.textContent = '';
    var top = el('div', 'lt-forum-top');
    top.appendChild(el('span', 'lt-forum-kind lt-forum-kind-' + t.kind.toLowerCase(), t.kind === 'Report' ? t.ofWords : t.kind));
    top.appendChild(el('span', 'lt-forum-state', t.state));
    head.appendChild(top);
    head.appendChild(el('h2', 'lt-ft-title', t.title));
    head.appendChild(el('p', 'muted small', 'Opened by ' + t.by + (t.byRank ? ' (' + t.byRank + ')' : '') + ' · ' + when(t.opened)));
    if (t.text) head.appendChild(el('p', 'lt-ft-text', t.text));
    // Linked both ways: a review, the idea a Decision came from, the Decision an idea became.
    if (t.kind === 'Review') {
      head.appendChild(el('p', 'small', 'A review in Reviews: ' + (t.linkName || t.link) + '. It moves there; talk it through here.'));
      head.appendChild(button('Open in Reviews', 'btn btn-secondary lt-ft-link', function () { if (app.openReviews) app.openReviews(); }));
    }
    if (t.kind === 'Decision' && t.link) head.appendChild(button('From an idea: ' + (t.linkName || t.link), 'btn btn-secondary lt-ft-link', function () { openTopic(t.link); }));
    if (t.kind === 'Report' && t.decision) head.appendChild(button('Its Decision: ' + t.decisionName, 'btn btn-secondary lt-ft-link', function () { openTopic(t.decision); }));
    drawVote(t);
    drawMoves(t);
    var box = $('ft-replies');
    box.textContent = '';
    t.replies.forEach(function (r) {
      var c = el('section', 'card lt-ft-reply');
      c.appendChild(el('p', 'muted small', r.by + (r.rank ? ' (' + r.rank + ')' : '') + ' · ' + when(r.written)));
      c.appendChild(el('p', 'lt-ft-text', r.text));
      box.appendChild(c);
    });
    $('ft-text').value = '';
    $('ft-err').textContent = '';
    var h = $('ft-history-list');
    h.textContent = '';
    t.history.forEach(function (x) {
      h.appendChild(el('p', 'small lt-ft-move', when(x.time) + ' · ' + x.by + ': ' + x.move + (x.from || x.to ? ' (' + (x.from ? x.from + ' to ' : '') + x.to + ')' : '') + (x.note ? '. ' + x.note : '')));
    });
  }
  // A Decision's vote: the count as it goes, and your vote if you may vote.
  function drawVote(t) {
    var box = $('ft-vote');
    box.textContent = '';
    box.hidden = t.kind !== 'Decision' || t.state === 'Discussing' || t.state === 'Withdrawn';
    if (box.hidden) return;
    var n = t.votes;
    box.appendChild(el('h3', 'lt-ft-sub', t.state === 'Voting' ? 'Voting until the end of ' + niceDay(t.closes) : 'The vote: ' + t.state));
    box.appendChild(el('p', 'lt-ft-count', 'Approve ' + n.Approve + ' · Reject ' + n.Reject + ' · Abstain ' + n.Abstain));
    box.appendChild(el('p', 'muted small', t.voted + ' of the ' + t.voters + ' who may vote ' + (t.voted === 1 ? 'has' : 'have') + ' voted. More Approve than Reject passes it; Abstain doesn\'t count.' +
      (t.state === 'Voting' ? ' It closes at the end of its day, or once everyone who may vote has.' : '')));
    if (t.state !== 'Voting') return;
    if (!t.canVote) { box.appendChild(el('p', 'small', 'A Builder or above votes; you read and reply.')); return; }
    box.appendChild(el('p', 'small lt-ft-mine', t.myVote ? 'Your vote: ' + t.myVote + '. You can change it until the vote closes.' : 'You haven\'t voted yet.'));
    var row = el('div', 'lt-ft-votes');
    ['Approve', 'Reject', 'Abstain'].forEach(function (v) {
      var b = button(v, 'btn ' + (t.myVote === v ? 'btn-primary' : 'btn-secondary') + ' lt-ft-vote', function () {
        app.busy(b, 'ft-err', function () {
          // The screen shows it: your vote, the count, and the result once it closes.
          return app.api('forumVote', { token: app.myToken(), topicId: t.id, vote: v }).then(function (d) { drawTopic(d.topic); });
        });
      });
      row.appendChild(b);
    });
    box.appendChild(row);
  }
  function niceDay(day) {
    var p = String(day || '').split('-');
    return p.length === 3 ? new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + '.' : day + '.';
  }
  function today(plus) {
    var d = new Date(Date.now() + (plus || 0) * 864e5);
    return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2);
  }
  // What you may do with it now: each a button, with a note if you like.
  function drawMoves(t) {
    var box = $('ft-moves');
    box.textContent = '';
    box.hidden = !t.can.length;
    if (box.hidden) return;
    var note = null, day = null;
    if (t.can.indexOf('Voting') !== -1) {
      var d = el('div', 'ig');
      var l = el('label', null, 'The vote closes at the end of');
      l.htmlFor = 'ft-closes';
      day = el('input');
      day.type = 'date'; day.id = 'ft-closes'; day.min = today(0); day.value = today(7);
      d.appendChild(l); d.appendChild(day);
      box.appendChild(d);
    }
    if (t.kind === 'Report' || t.kind === 'Discussion' || t.can.indexOf('Withdrawn') !== -1) {
      var n = el('div', 'ig');
      var nl = el('label', null, 'A note with it (optional)');
      nl.htmlFor = 'ft-note';
      note = el('input');
      note.id = 'ft-note'; note.maxLength = 500; note.autocomplete = 'off';
      n.appendChild(nl); n.appendChild(note);
      box.appendChild(n);
    }
    var row = el('div', 'lt-ft-movebtns');
    t.can.forEach(function (to) {
      var b = button(MOVE_WORDS[to] || to, 'btn btn-secondary lt-ft-moveto', function () {
        if (to === 'Withdrawn' && !window.confirm('Withdraw "' + t.title + '"? Its vote, if open, closes with it.')) return;
        app.busy(b, 'ft-err', function () {
          return app.api('forumMove', { token: app.myToken(), topicId: t.id, to: to, note: note ? note.value : '', closes: day ? day.value : '' }).then(function (d) { drawTopic(d.topic); });
        });
      });
      b.dataset.to = to;
      row.appendChild(b);
    });
    box.appendChild(row);
  }
  function reply() {
    var b = $('ft-send');
    app.busy(b, 'ft-err', function () {
      return app.api('forumReply', { token: app.myToken(), topicId: topic.id, text: $('ft-text').value }).then(function (d) { drawTopic(d.topic); });
    });
  }

  // A review's topic, from Reviews: made the first time it's asked for.
  function openReview(id, b) {
    return app.api('forumReview', { token: app.myToken(), reviewId: id }).then(function (d) { drawTopic(d.topic); }, function (err) {
      if (err.code === 'signed-out') return app.signedOut();
      app.notice(err.message);
    });
  }

  /* ── A player's report (|Q593) ── */

  var reportOf = 'Issue';
  function openReport(of) {
    reportOf = of;
    if (app.closePanel) app.closePanel();
    app.notice('');
    app.show('v-report');
    $('rp-title').textContent = of === 'Idea' ? 'Submit an Idea' : 'Report an Issue';
    $('rp-say').textContent = of === 'Idea' ? 'Your idea goes to HABO\'s admins, who talk it through.' : 'What went wrong goes to HABO\'s admins, who look into it.';
    $('rp-label').textContent = of === 'Idea' ? 'Your idea' : 'What happened? Say which screen you were on, and what you pressed.';
    $('rp-text').value = '';
    $('rp-err').textContent = '';
  }
  function sendReport(e) {
    e.preventDefault();
    app.busy($('rp-send'), 'rp-err', function () {
      return app.api('reportSend', { token: app.myToken(), of: reportOf, text: $('rp-text').value }).then(function () {
        if (app.back) app.back();
        app.notice(reportOf === 'Idea' ? 'Sent to HABO\'s admins. Thank you for the idea.' : 'Sent to HABO\'s admins. Thank you for telling us.');
      });
    });
  }

  /* ── In Admin Mode: the Forum button, and new replies as a notice (|Q620) ── */

  // A topic from the digest's link (?forum=T001): opened once you're signed in.
  var linked = (function () { try { return new URLSearchParams(location.search).get('forum') || ''; } catch (e) { return ''; } })();
  function fromLink() {
    var a = app.me && app.me();
    if (!linked || !a || !a.rank) return;
    var id = linked;
    linked = '';
    try { history.replaceState(null, '', location.pathname); } catch (e) { /* the link stays in the bar */ }
    openTopic(id);
  }
  function adminOn() { var a = app.me && app.me(); return !!(a && a.rank) && $('cl-sim').checked; }
  function sync() {
    fromLink();
    $('me-go-forum').hidden = !adminOn();
    if (!adminOn() || told) return;
    told = true;
    app.api('forumUnread', { token: app.myToken() }).then(function (d) {
      if (!d.replies) return;
      app.notice('Forum: ' + (d.replies === 1 ? '1 new reply' : d.replies + ' new replies') + ' in ' + (d.topics === 1 ? 'a topic' : d.topics + ' topics') + ' you opened or replied in.',
        { key: 'forum', buttons: [{ label: 'Open the Forum', go: open }] });
    }, function () { told = false; });
  }

  $('cl-sim').addEventListener('change', sync);
  $('me-go-forum').addEventListener('click', function () { if (app.closePanel) app.closePanel(); app.notice(''); open(); });
  $('forum-back').addEventListener('click', function () { if (app.back) app.back(); });
  $('ft-back').addEventListener('click', function () { open(); });
  $('forum-new').addEventListener('click', function () { newForm(true); });
  $('forum-cancel').addEventListener('click', function () { newForm(false); });
  $('forum-form').addEventListener('submit', create);
  Array.prototype.forEach.call(document.querySelectorAll('input[name="forum-new-kind"]'), function (r) { r.addEventListener('change', newKind); });
  $('forum-kind').addEventListener('change', function () { if (list) drawList(); });
  $('forum-closed').addEventListener('change', function () { if (list) drawList(); });
  $('ft-send').addEventListener('click', reply);
  $('me-report-issue').addEventListener('click', function () { openReport('Issue'); });
  $('me-report-idea').addEventListener('click', function () { openReport('Idea'); });
  $('v-report').addEventListener('submit', sendReport);
  $('rp-cancel').addEventListener('click', function () { if (app.back) app.back(); });

  return { open: open, sync: sync, openReview: openReview, signedOut: function () { told = false; } };
};
