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
  // in Admin Mode (S6-P38 item 7, |Q764 (a)).
  function lineEl(l, full) {
    var p = el('p', 'lt-rh-line ' + (l.kind === 'cmd' ? 'cmd' : l.kind === 'answer' ? 'answer' : l.who || l.kind === 'gchat' ? 'pub' : 'mine') + (l.kind === 'walk' ? ' walk' : '') + (l.kind === 'level' ? ' level' : '') + (l.kind === 'gchat' ? ' gchat' : '') + (/^(start|end|badge)$/.test(l.kind) ? ' news' : ''));
    if (l.at) p.title = when(l.at);
    if (l.who || l.kind === 'gchat') { p.appendChild(el('b', 'lt-rh-who', l.who || 'A volunteer')); p.appendChild(document.createTextNode(l.kind === 'gchat' ? ': ' + l.text : ' ' + l.text)); }
    else p.textContent = l.text;
    if (full && l.kind === 'gchat' && l.id) {
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
  // Each asks once more before it goes: "Report it to the Admins?", "Remove it for everyone?"
  function sure(b, say) { if (b.dataset.sure === '1') return true; b.dataset.sure = '1'; b.textContent = say; return false; }
  function failed(b, label, er) { b.disabled = false; b.dataset.sure = ''; b.textContent = label; printed.push({ kind: 'answer', text: (er && er.message) || 'That didn\'t go through just now. Try again.' }); paintFull(true); }
  function report(l, b) {
    if (!sure(b, 'Report it to the Admins?')) return;
    b.disabled = true;
    app.api('gchatReport', { token: app.myToken(), lineId: l.id }).then(function () { l.reported = true; b.textContent = 'Reported'; }, function (er) { failed(b, 'Report', er); });
  }
  function remove(l, b) {
    if (!sure(b, 'Remove it for everyone?')) return;
    b.disabled = true;
    app.api('gchatRemove', { token: app.myToken(), lineId: l.id }).then(function () {
      lines = lines.filter(function (x) { return !(x.kind === 'gchat' && x.id === l.id); });
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
    var box = $('rh-strip-lines'), show = pending.concat(lines.slice(-STRIP).reverse()).slice(0, STRIP).reverse();
    box.textContent = '';
    if (!show.length) box.appendChild(el('p', 'lt-rh-line mine', loaded ? 'Walks, XP, levels and gchat show here as they happen.' : 'Loading the rolling history…'));
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
    lines.forEach(function (l) {
      var d = l.at ? day(l.at) : '';
      if (d && d !== last) { box.appendChild(el('p', 'lt-rh-day', '— ' + d + ' —')); last = d; }
      box.appendChild(lineEl(l, true));
    });
    printed.forEach(function (l) { box.appendChild(lineEl(l, true)); });
    box.scrollTop = atEnd ? box.scrollHeight : top;
  }
  function poll() {
    if (polling || !app.myToken() || $('rh').hidden) return;
    polling = true;
    app.api('scroll', { token: app.myToken(), since: Math.max(0, lastNow - 60000) }).then(function (d) {
      if (d.now) lastNow = d.now;
      if (d.every && d.every !== every) { every = d.every; if (timer) { clearInterval(timer); timer = setInterval(poll, every * 1000); } }
      if (merge(d.lines)) { paintStrip(); paintFull(); }
    }, function () { /* the next ask tries again */ }).then(function () { polling = false; });
  }

  // Fresh lines from HABO, after the main page loads.
  function refresh() {
    if (!app.myToken()) return Promise.resolve();
    paintStrip();
    return app.api('scroll', { token: app.myToken() }).then(function (d) {
      lines = d.lines || [];
      if (d.commands) commands = d.commands;
      if (d.now) lastNow = d.now;
      if (d.every) every = d.every;
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
    asking = true;
    $('rh-in').value = '';
    printed.push({ kind: 'cmd', text: '> ' + typed });
    // help is answered here at once, from the commands the scroll came with (|C919).
    var c = typed.toLowerCase().replace(/\s+/g, ' ');
    if ((c === 'help' || c === '?') && commands.length) {
      ['Commands:'].concat(commands.map(function (x) { return '  ' + x[0] + ': ' + x[1]; })).forEach(function (t) { printed.push({ kind: 'answer', text: t }); });
      asking = false;
      paintFull(true);
      $('rh-in').focus();
      return;
    }
    paintFull(true);
    app.api('scroll', { token: app.myToken(), command: typed }).then(function (d) {
      (d.answer || []).forEach(function (t) { printed.push({ kind: 'answer', text: t }); });
      if (d.lines) lines = d.lines;
      // gchat: your line, in the scroll with everyone's, as they'll see it.
      if (d.line) { printed = printed.filter(function (x) { return x.text !== '> ' + typed; }); merge([d.line]); paintStrip(); }
    }, function (er) {
      printed.push({ kind: 'answer', text: er.message || 'That couldn\'t be answered just now. Try again.' });
    }).then(function () { asking = false; paintFull(true); $('rh-in').focus(); });
  }

  $('rh-strip').addEventListener('click', open);
  $('rh-close').addEventListener('click', close);
  $('rh').addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  $('rh-form').addEventListener('submit', ask);

  return {
    refresh: refresh, landed: landed, open: open,
    // Where a "+N XP" lands: the strip, while it's on the screen.
    target: function () { var s = $('rh-strip'); return s && !s.hidden && s.offsetParent !== null ? s : null; },
    signedOut: function () { if (timer) { clearInterval(timer); timer = null; } lines = []; pending = []; printed = []; loaded = false; $('rh-strip').hidden = true; }
  };
};
