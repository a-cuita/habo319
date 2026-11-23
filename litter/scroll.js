// The rolling history (S6-P3 item 3, |Q705 (a), |Q706, |Q707, |Q712 (a),
// |Q713 (a)): a scroll like MORDORMUD.net's. On the main page, a strip under
// the top bar with its newest lines; tapped, it opens full screen, with the
// prompt under it. Public lines start with the player's name, like a chat
// room; your own lines are indented, in a quieter colour, with no name.
// A command typed at the prompt prints its answer in the scroll. Only the
// full screen has the prompt, so the keyboard never covers the map.
window.LitterScroll = function (app) {
  'use strict';
  var $ = app.$;
  var lines = [], pending = [], printed = [], loaded = false, asking = false, commands = [];
  var STRIP = 3;
  // Everyone's lines while it's open (S6-P38, |Q765 (a)): asked for every few
  // seconds, the gap from Settings, Rolling history; not at all while shut.
  var every = 15, lastNow = 0, timer = null, polling = false;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function day(ms) { return new Date(ms).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function when(ms) { return new Date(ms).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }

  // One line: a public one with its name first; your own indented, no name.
  // A gchat line, in the full screen: Report on someone else's, and Remove
  // in Admin Mode (S6-P38 item 7, |Q764 (a)). A tell (S7-P10): Report on one
  // sent to you; a reported one, for an admin in Admin Mode, with Remove.
  // A board topic or note, printed by board and its number: the same as gchat's.
  function lineEl(l, full) {
    if (l.kind === 'tell') return tellEl(l, full);
    if (l.kind === 'qm' || l.qm || (l.actions && l.actions.length)) return qmEl(l, full);
    var p = el('p', 'lt-rh-line ' + (l.kind === 'cmd' ? 'cmd' : l.kind === 'answer' ? 'answer' : l.who || l.kind === 'gchat' ? 'pub' : 'mine') + (l.kind === 'walk' ? ' walk' : '') + (l.kind === 'level' ? ' level' : '') + (l.kind === 'gchat' ? ' gchat' : '') + (/^(start|end|badge)$/.test(l.kind) ? ' news' : ''));
    if (l.at) p.title = when(l.at);
    if (l.who || l.kind === 'gchat') { p.appendChild(el('b', 'lt-rh-who', l.who || 'A volunteer')); p.appendChild(document.createTextNode(l.kind === 'gchat' ? ': ' + l.text : ' ' + l.text)); }
    // A board topic or note: its head in bold, with a break above it (S7-P10, |M1442).
    else if (l.head) noteEl(p, l, full);
    // A way to the screen to change it, like Change my details from privacy (|Q917).
    else if (l.open) {
      if (!full) p.textContent = l.text;
      else { var go = el('button', 'lt-rh-go', l.text); go.type = 'button'; go.addEventListener('click', function () { openScreen(l.open); }); p.appendChild(go); }
    }
    // HABO's own words: a command in them in its own style (|Q923 (a)).
    else if (l.kind === 'answer') marked(p, l.text, full);
    else p.textContent = l.text;
    if (full && ((l.kind === 'gchat' && l.id) || (l.kind === 'answer' && l.note))) {
      var acts = el('span', 'lt-rh-acts');
      if (!l.mine) {
        var rep = el('button', 'lt-rh-act', l.reported ? 'Reported' : 'Report');
        rep.type = 'button';
        rep.disabled = !!l.reported;
        rep.addEventListener('click', function () { report(l, rep); });
        acts.appendChild(rep);
      }
      if (app.adminMode && app.adminMode()) {
        var rm = el('button', 'lt-rh-act', 'Remove');
        rm.type = 'button';
        rm.addEventListener('click', function () { remove(l, rm); });
        acts.appendChild(rm);
      }
      if (acts.childNodes.length) p.appendChild(acts);
    }
    return p;
  }
  // A command in HABO's words, in `backticks`: shown in its own style, and in
  // the full screen tapping it types it at the prompt for you (|Q923 (a)).
  function marked(p, text, full) {
    String(text).split(/`([^`]+)`/).forEach(function (part, i) {
      if (!(i % 2)) { if (part) p.appendChild(document.createTextNode(part)); return; }
      if (!full) { p.appendChild(el('code', 'lt-rh-cmdchip', part)); return; }
      var b = el('button', 'lt-rh-cmdchip', part);
      b.type = 'button';
      b.title = 'Type it at the prompt';
      b.addEventListener('click', function () { typeIt(part); });
      p.appendChild(b);
    });
  }
  function typeIt(cmd) {
    var i = $('rh-in');
    i.value = cmd + ' ';
    i.focus();
    try { i.setSelectionRange(i.value.length, i.value.length); } catch (e) { /* some inputs can't */ }
  }
  // A note's name, T1N3, or a topic's, T1: the command that reads it.
  function readCmd(name) { var m = /^T(\d+)$/i.exec(name); return m ? 'board ' + m[1] : 'board ' + String(name).toUpperCase(); }
  // A note's words as written in the drafting box (|Q920 (a)): **bold**,
  // *italic*, __underline__ and line breaks; |T1N3 a link that opens it (|Q922 (a)).
  var RICH = /(\*\*[^*\n]+\*\*|__[^_\n]+__|\*[^*\s][^*\n]*\*|\|T\d+(?:N\d+)?\b)/i;
  function rich(box, text, full) {
    String(text).split('\n').forEach(function (line, k) {
      if (k) box.appendChild(document.createElement('br'));
      line.split(RICH).forEach(function (part, i) {
        if (!part) return;
        if (!(i % 2)) { box.appendChild(document.createTextNode(part)); return; }
        if (part.charAt(0) === '|') {
          var name = part.slice(1).toUpperCase();
          if (!full) { box.appendChild(document.createTextNode(name)); return; }
          var a = el('button', 'lt-rh-link', name);
          a.type = 'button';
          a.addEventListener('click', function () { run(readCmd(name), true); });
          box.appendChild(a);
        } else if (part.slice(0, 2) === '**') box.appendChild(el('b', '', part.slice(2, -2)));
        else if (part.slice(0, 2) === '__') box.appendChild(el('u', '', part.slice(2, -2)));
        else box.appendChild(el('i', '', part.slice(1, -1)));
      });
    });
  }
  // A topic or a note: its name, a link that opens it, and its subject, in
  // bold; who and when; then its words, whole when read, its first words in a
  // list. A note answering another is indented under it (|Q918).
  function noteEl(p, l, full) {
    p.classList.add('lt-rh-note');
    if (!l.meta) { p.appendChild(el('b', 'lt-rh-note-head', l.head + ':')); p.appendChild(document.createTextNode(' ' + l.body)); return; }
    if (l.depth) p.classList.add('lt-rh-depth', 'lt-rh-depth-' + Math.min(3, l.depth));
    var h = el('b', 'lt-rh-note-head');
    if (full && l.name) {
      var a = el('button', 'lt-rh-link', l.name);
      a.type = 'button';
      a.addEventListener('click', function () { run(readCmd(l.name), true); });
      h.appendChild(a);
      h.appendChild(document.createTextNode(l.head.slice(l.name.length)));
    } else h.textContent = l.head;
    p.appendChild(h);
    p.appendChild(el('span', 'lt-rh-note-meta', l.meta));
    if (l.body) {
      var b = el('span', 'lt-rh-note-body' + (l.whole ? ' whole' : ''));
      if (l.whole) rich(b, l.body, full); else b.textContent = l.body;
      p.appendChild(b);
    }
  }
  function openScreen(which) {
    if (which === 'details' && app.openDetails) { close(); app.openDetails(); }
  }
  function tellEl(l, full) {
    var p = el('p', 'lt-rh-line pub tell');
    if (l.at) p.title = when(l.at);
    if (l.flagged) { p.appendChild(el('b', 'lt-rh-who', l.who)); p.appendChild(document.createTextNode(' told ' + l.to + ', reported: ' + l.text)); }
    else if (l.mine) { p.appendChild(el('b', 'lt-rh-who', 'You')); p.appendChild(document.createTextNode(' tell ' + l.to + ': ' + l.text)); }
    else { p.appendChild(el('b', 'lt-rh-who', l.who)); p.appendChild(document.createTextNode(' tells you: ' + l.text)); }
    if (full) {
      var acts = el('span', 'lt-rh-acts');
      if (l.toMe) {
        var rep = el('button', 'lt-rh-act', l.reported ? 'Reported' : 'Report');
        rep.type = 'button';
        rep.disabled = !!l.reported;
        rep.addEventListener('click', function () { report(l, rep); });
        acts.appendChild(rep);
      }
      if (l.flagged && app.adminMode && app.adminMode()) {
        var rm = el('button', 'lt-rh-act', 'Remove');
        rm.type = 'button';
        rm.addEventListener('click', function () { remove(l, rm); });
        acts.appendChild(rm);
      }
      if (acts.childNodes.length) p.appendChild(acts);
    }
    return p;
  }
  // The Questmaster (S7-P4 items 16, 17, |Q869 (b)): its name, tapped, asks
  // for the Quests; its buttons, like Tell me more and Accept, run their
  // command as if typed. A line of its list has the same buttons.
  function qmEl(l, full) {
    var p = el('p', 'lt-rh-line ' + (l.qm || l.kind === 'qm' ? 'qm' : 'answer') + (l.kind === 'qm' ? ' pub' : ''));
    if (l.at && !l.typed) p.title = when(l.at);
    if (l.who) {
      var name = el(full ? 'button' : 'b', 'lt-rh-who lt-rh-qm-name', l.who);
      if (full) { name.type = 'button'; name.addEventListener('click', function () { run('quests', true); }); }
      p.appendChild(name);
      marked(p, l.kind === 'qm' ? ' ' + l.text : ': ' + l.text, full);
    } else marked(p, l.text, full);
    if (full && l.actions && l.actions.length) {
      var acts = el('span', 'lt-rh-acts');
      l.actions.forEach(function (a) {
        var b = el('button', 'lt-rh-act', a.label);
        b.type = 'button';
        b.addEventListener('click', function () { run(a.command, true); });
        acts.appendChild(b);
      });
      p.appendChild(acts);
    }
    return p;
  }
  // Each asks once more before it goes: "Report it to the Admins?", "Remove it for everyone?"
  function sure(b, say) { if (b.dataset.sure === '1') return true; b.dataset.sure = '1'; b.textContent = say; return false; }
  function failed(b, label, er) { b.disabled = false; b.dataset.sure = ''; b.textContent = label; printed.push({ kind: 'answer', typed: true, at: Date.now(), text: (er && er.message) || 'That didn\'t go through just now. Try again.' }); paintFull(true); }
  // Which call reports or removes a line: gchat's, a tell's, or the board's.
  function calls(l) {
    if (l.kind === 'tell') return { report: 'tellReport', remove: 'tellRemove', arg: { lineId: l.id } };
    if (l.kind === 'answer') return { report: 'boardReport', remove: 'boardRemove', arg: { noteId: l.note } };
    return { report: 'gchatReport', remove: 'gchatRemove', arg: { lineId: l.id } };
  }
  function report(l, b) {
    if (!sure(b, 'Report it to the Admins?')) return;
    b.disabled = true;
    var c = calls(l);
    app.api(c.report, Object.assign({ token: app.myToken() }, c.arg)).then(function () { l.reported = true; b.textContent = 'Reported'; }, function (er) { failed(b, 'Report', er); });
  }
  function remove(l, b) {
    if (!sure(b, 'Remove it for everyone?')) return;
    b.disabled = true;
    var c = calls(l);
    app.api(c.remove, Object.assign({ token: app.myToken() }, c.arg)).then(function () {
      if (l.kind === 'answer') {
        // Gone from the board: the printed line says so.
        printed = printed.filter(function (x) { return x !== l; });
        printed.push({ kind: 'answer', typed: true, at: Date.now(), text: 'Removed from the board.' });
      } else lines = lines.filter(function (x) { return !(x.kind === l.kind && x.id === l.id); });
      paintStrip();
      paintFull();
    }, function (er) { failed(b, 'Remove', er); });
  }
  function key(l) { return [l.kind, l.id || '', l.at, l.who || '', l.text].join('|'); }
  function merge(news) {
    var have = {};
    lines.forEach(function (l) { have[key(l)] = true; });
    var added = (news || []).filter(function (l) { return !have[key(l)]; });
    if (!added.length) return false;
    lines = lines.concat(added).sort(function (a, b) { return a.at - b.at; }).slice(-300);
    return true;
  }

  function paintStrip() {
    // A reported tell is an admin's to see in the full screen only.
    var box = $('rh-strip-lines'), show = pending.concat(lines.filter(function (l) { return !l.flagged; }).slice(-STRIP).reverse()).slice(0, STRIP).reverse();
    box.textContent = '';
    if (!show.length) box.appendChild(el('p', 'lt-rh-line mine', loaded ? 'Walks, XP, levels and gchat show here as they happen.' : 'Loading Street Talk…'));
    show.forEach(function (l) { box.appendChild(lineEl(l)); });
    $('rh-strip').hidden = false;
  }

  // The whole scroll, oldest first, a line between days, then what was typed.
  // `end`: to its newest line; otherwise where you were, unless you were at the end already.
  function paintFull(end) {
    var box = $('rh-lines'), last = '';
    var atEnd = end || box.scrollHeight - box.scrollTop - box.clientHeight < 40, top = box.scrollTop;
    box.textContent = '';
    // HABO's lines only: a landed "+N XP" is the strip's, until they come.
    if (!lines.length) box.appendChild(el('p', 'lt-rh-line mine', 'Nothing here yet. Your walks, XP and levels show here as they happen.'));
    // What you typed and its answers take their place in time, so a line
    // that comes after them shows under them (|C989), not above.
    lines.filter(function (l) { return !l.flagged || admin(); }).concat(printed).map(function (l, i) { return [l, i]; })
      .sort(function (a, b) { return (a[0].at || 0) - (b[0].at || 0) || a[1] - b[1]; })
      .forEach(function (x) {
        var l = x[0], d = l.at && !l.typed ? day(l.at) : '';
        if (d && d !== last) { box.appendChild(el('p', 'lt-rh-day', '— ' + d + ' —')); last = d; }
        box.appendChild(lineEl(l, true));
      });
    box.scrollTop = atEnd ? box.scrollHeight : top;
  }
  function poll() {
    if (polling || !app.myToken() || $('rh').hidden) return;
    polling = true;
    app.api('scroll', { token: app.myToken(), since: Math.max(0, lastNow - 60000), admin: admin() }, true).then(function (d) {
      if (d.now) lastNow = d.now;
      if (d.every && d.every !== every) { every = d.every; if (timer) { clearInterval(timer); timer = setInterval(poll, every * 1000); } }
      if (merge(d.lines)) { paintStrip(); paintFull(); }
    }, function () { /* the next ask tries again */ }).then(function () { polling = false; });
  }

  // Reported tells come only in Admin Mode (S7-P10).
  function admin() { return !!(app.adminMode && app.adminMode()); }
  // Fresh lines from HABO, after the main page loads.
  // A gchat line stops at the setting as you type or paste, not a few
  // characters over it (S7-P10, |C1025): the box's own limit leaves room for
  // the word gchat, so the line after it is cut here. The same for a tell
  // and a board note, after their words.
  var gchatMax = 1000;
  $('rh-in').addEventListener('input', function () {
    var v = this.value, m = /^\s*(?:gchat|tell\s+@?\S+|board(?:\s+\d+)?\s+write)\s+/i.exec(v);
    if (m && v.length - m[0].length > gchatMax) this.value = v.slice(0, m[0].length + gchatMax);
  });
  function refresh() {
    if (!app.myToken()) return Promise.resolve();
    paintStrip();
    return app.api('scroll', { token: app.myToken(), admin: admin() }).then(function (d) {
      lines = d.lines || [];
      if (d.commands) commands = d.commands;
      if (d.now) lastNow = d.now;
      if (d.every) every = d.every;
      // Room for gchat, its word and its line (S6-P38, |M1174).
      // tell's handle is up to 40 characters, and board 12 write is 14.
      if (d.gchatMax) { gchatMax = d.gchatMax; $('rh-in').maxLength = d.gchatMax + 50; }
      pending = [];
      loaded = true;
      paintStrip();
      if (!$('rh').hidden) paintFull(true);
    }, function () { loaded = true; paintStrip(); });
  }

  // A "+N XP" landed in the scroll: its line, until HABO's lines replace it.
  function landed(n) {
    pending.unshift({ at: Date.now(), text: '+' + n + ' XP', kind: 'xp' });
    pending = pending.slice(0, STRIP);
    paintStrip();
    var s = $('rh-strip');
    s.classList.remove('lt-rh-got');
    void s.offsetWidth;
    s.classList.add('lt-rh-got');
  }

  function open() {
    $('rh').hidden = false;
    document.body.classList.add('lt-rh-open');
    paintFull(true);
    $('rh-close').focus();
    if (timer) clearInterval(timer);
    timer = setInterval(poll, every * 1000);
    poll();
  }
  function close() {
    if (draft) shutDraft(true);
    if (timer) { clearInterval(timer); timer = null; }
    $('rh').hidden = true;
    document.body.classList.remove('lt-rh-open');
    $('rh-strip').focus();
  }

  // A command: what was typed, then its answer, a line each.
  function ask(e) {
    e.preventDefault();
    var typed = $('rh-in').value.trim();
    if (!typed || asking) return;
    $('rh-in').value = '';
    run(typed);
  }
  // `tapped`: from a button, so the keyboard stays down on a phone.
  function run(typed, tapped) {
    if (asking) return;
    // board write, board 1 write and board re T1N3 open the drafting box (|Q920 (a)).
    var d = draftFor(typed);
    if (d) { openDraft(d, typed); return; }
    asking = true;
    var at = Date.now();
    printed.push({ kind: 'cmd', typed: true, at: at, text: '> ' + typed });
    // help is answered here at once, from the commands the scroll came with (|C919).
    var c = typed.toLowerCase().replace(/\s+/g, ' ');
    if ((c === 'help' || c === '?') && commands.length) {
      ['Commands:'].concat(commands.map(function (x) { return '  ' + x[0] + ': ' + x[1]; })).forEach(function (t) { printed.push({ kind: 'answer', typed: true, at: at, text: t }); });
      asking = false;
      paintFull(true);
      if (!tapped) $('rh-in').focus();
      return;
    }
    paintFull(true);
    app.api('scroll', { token: app.myToken(), command: typed, admin: admin() }).then(function (d) {
      // A board topic or note comes with its id, for Report and Remove.
      (d.answer || []).forEach(function (t) {
        printed.push(typeof t === 'string' ? { kind: 'answer', typed: true, at: at, text: t }
          : { kind: 'answer', typed: true, at: at, text: t.text, note: t.note, head: t.head || '', body: t.body || '', meta: t.meta || '', name: t.name || '', whole: !!t.whole, depth: t.depth || 0, open: t.open || '',
            mine: !!t.mine, reported: !!t.reported, qm: !!t.qm, who: t.qm ? t.who : '', actions: t.actions || null });
      });
      // title and privacy change your account: the page keeps it (|Q916, |Q917).
      if (d.account && app.account) app.account(d.account);
      if (d.lines) lines = d.lines;
      // gchat or tell: your line, in the scroll, as it'll be seen.
      if (d.line) { printed = printed.filter(function (x) { return x.text !== '> ' + typed; }); merge([d.line]); paintStrip(); }
    }, function (er) {
      printed.push({ kind: 'answer', typed: true, at: at, text: er.message || 'That couldn\'t be answered just now. Try again.' });
    }).then(function () { asking = false; paintFull(true); if (!tapped) $('rh-in').focus(); });
  }

  /* ── The drafting box (S7-P10, |Q920 (a)): over Street Talk, a subject, the
     words with Bold, Italic and Underline, then Post or Cancel. Cancel keeps
     the draft until it's posted, for as long as the page is open. ── */
  var drafts = {}, draft = null;
  function draftFor(typed) {
    var t = String(typed).trim(), m;
    if ((m = /^board\s+write(?:\s+([\s\S]*))?$/i.exec(t))) return { topic: '', re: '', subject: (m[1] || '').trim(), text: '' };
    if ((m = /^board\s+T?(\d+)\s+write(?:\s+([\s\S]*))?$/i.exec(t))) return { topic: m[1], re: '', subject: '', text: (m[2] || '').trim() };
    if ((m = /^board\s+(?:re\s+(T\d+N\d+)|(T\d+N\d+)\s+re|(\d+)\s+re\s+(\d+))(?:\s+([\s\S]*))?$/i.exec(t))) return { topic: '', re: (m[1] || m[2] || ('T' + m[3] + 'N' + m[4])).toUpperCase(), subject: '', text: (m[5] || '').trim() };
    return null;
  }
  function draftKey(d) { return d.re ? 're ' + d.re : d.topic ? 'topic ' + d.topic : 'new'; }
  function openDraft(d, typed) {
    var kept = drafts[draftKey(d)];
    draft = { topic: d.topic, re: d.re, typed: typed };
    $('rh-draft-title').textContent = d.re ? 'Answering ' + d.re : d.topic ? 'A note on topic ' + d.topic : 'A new topic';
    $('rh-draft-subject-label').textContent = d.re ? 'Subject (leave it empty for "re:" and its subject)' : d.topic ? 'Subject' : 'Its subject';
    $('rh-draft-text-label').textContent = d.topic || d.re ? 'Your note' : 'Its first words (if you want any)';
    $('rh-draft-subject').value = d.subject || (kept ? kept.subject : '');
    $('rh-draft-text').value = d.text || (kept ? kept.text : '');
    $('rh-draft-text').maxLength = gchatMax;
    $('rh-draft-err').textContent = '';
    count();
    $('rh-draft').hidden = false;
    (d.re || (d.topic && $('rh-draft-subject').value) ? $('rh-draft-text') : $('rh-draft-subject')).focus();
  }
  function keepDraft() {
    if (!draft) return;
    var s = $('rh-draft-subject').value, t = $('rh-draft-text').value;
    if (s.trim() || t.trim()) drafts[draftKey(draft)] = { subject: s, text: t };
    else delete drafts[draftKey(draft)];
  }
  function shutDraft(keep) {
    if (keep) keepDraft();
    draft = null;
    $('rh-draft').hidden = true;
  }
  function count() { $('rh-draft-count').textContent = $('rh-draft-text').value.length + ' of ' + gchatMax + ' characters'; }
  // Bold, Italic or Underline: around what's chosen, or a pair to type between.
  function wrap(mark) {
    var t = $('rh-draft-text'), a = t.selectionStart, b = t.selectionEnd, v = t.value;
    if (v.length + 2 * mark.length > gchatMax) return;
    t.value = v.slice(0, a) + mark + v.slice(a, b) + mark + v.slice(b);
    t.focus();
    t.setSelectionRange(a + mark.length, b + mark.length);
    count();
  }
  function postDraft(e) {
    e.preventDefault();
    if (!draft || asking) return;
    var d = draft, go = $('rh-draft-post'), at = Date.now();
    go.disabled = true;
    $('rh-draft-err').textContent = '';
    app.api('boardPost', { token: app.myToken(), topic: d.topic, re: d.re, subject: $('rh-draft-subject').value, text: $('rh-draft-text').value }).then(function (r) {
      delete drafts[draftKey(d)];
      shutDraft(false);
      printed.push({ kind: 'cmd', typed: true, at: at, text: '> ' + d.typed });
      (r.answer || []).forEach(function (t) { printed.push({ kind: 'answer', typed: true, at: at, text: t }); });
      paintFull(true);
    }, function (er) {
      $('rh-draft-err').textContent = String((er && er.message) || 'That didn\'t go through just now. Try again.').replace(/`/g, '');
    }).then(function () { go.disabled = false; });
  }
  $('rh-draft').addEventListener('submit', postDraft);
  $('rh-draft-cancel').addEventListener('click', function () { shutDraft(true); $('rh-in').focus(); });
  $('rh-draft-text').addEventListener('input', count);
  [['rh-draft-b', '**'], ['rh-draft-i', '*'], ['rh-draft-u', '__']].forEach(function (x) {
    // Pressed without taking the focus from the words, so what's chosen stays chosen.
    $(x[0]).addEventListener('mousedown', function (e) { e.preventDefault(); });
    $(x[0]).addEventListener('click', function () { wrap(x[1]); });
  });

  $('rh-strip').addEventListener('click', open);
  $('rh-close').addEventListener('click', close);
  $('rh').addEventListener('keydown', function (e) { if (e.key === 'Escape') { if (draft) shutDraft(true); else close(); } });
  $('rh-form').addEventListener('submit', ask);

  return {
    refresh: refresh, landed: landed, open: open,
    // Your quests' "Talk to the Questmaster": Street Talk, open, asking for the Quests.
    questmaster: function () { open(); run('quests', true); },
    // Where a "+N XP" lands: the strip, while it's on the screen.
    target: function () { var s = $('rh-strip'); return s && !s.hidden && s.offsetParent !== null ? s : null; },
    signedOut: function () { if (timer) { clearInterval(timer); timer = null; } lines = []; pending = []; printed = []; loaded = false; $('rh-strip').hidden = true; }
  };
};
