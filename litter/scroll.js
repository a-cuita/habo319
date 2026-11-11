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
  var lines = [], pending = [], printed = [], loaded = false, asking = false;
  var STRIP = 3;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function day(ms) { return new Date(ms).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function when(ms) { return new Date(ms).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }

  // One line: a public one with its name first; your own indented, no name.
  function lineEl(l) {
    var p = el('p', 'lt-rh-line ' + (l.kind === 'cmd' ? 'cmd' : l.kind === 'answer' ? 'answer' : l.who ? 'pub' : 'mine') + (l.kind === 'walk' ? ' walk' : '') + (l.kind === 'level' ? ' level' : ''));
    if (l.at) p.title = when(l.at);
    if (l.who) { p.appendChild(el('b', 'lt-rh-who', l.who)); p.appendChild(document.createTextNode(' ' + l.text)); }
    else p.textContent = l.text;
    return p;
  }

  function paintStrip() {
    var box = $('rh-strip-lines'), show = pending.concat(lines.slice(-STRIP).reverse()).slice(0, STRIP).reverse();
    box.textContent = '';
    if (!show.length) box.appendChild(el('p', 'lt-rh-line mine', loaded ? 'Your walks, XP and levels show here as they happen.' : 'Loading the rolling history…'));
    show.forEach(function (l) { box.appendChild(lineEl(l)); });
    $('rh-strip').hidden = false;
  }

  // The whole scroll, oldest first, a line between days, then what was typed.
  function paintFull() {
    var box = $('rh-lines'), last = '';
    box.textContent = '';
    // HABO's lines only: a landed "+N XP" is the strip's, until they come.
    if (!lines.length) box.appendChild(el('p', 'lt-rh-line mine', 'Nothing here yet. Your walks, XP and levels show here as they happen.'));
    lines.forEach(function (l) {
      var d = l.at ? day(l.at) : '';
      if (d && d !== last) { box.appendChild(el('p', 'lt-rh-day', '— ' + d + ' —')); last = d; }
      box.appendChild(lineEl(l));
    });
    printed.forEach(function (l) { box.appendChild(lineEl(l)); });
    box.scrollTop = box.scrollHeight;
  }

  // Fresh lines from HABO, after the main page loads.
  function refresh() {
    if (!app.myToken()) return Promise.resolve();
    paintStrip();
    return app.api('scroll', { token: app.myToken() }).then(function (d) {
      lines = d.lines || [];
      pending = [];
      loaded = true;
      paintStrip();
      if (!$('rh').hidden) paintFull();
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
    paintFull();
    $('rh-close').focus();
  }
  function close() {
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
    paintFull();
    app.api('scroll', { token: app.myToken(), command: typed }).then(function (d) {
      (d.answer || []).forEach(function (t) { printed.push({ kind: 'answer', text: t }); });
      if (d.lines) lines = d.lines;
    }, function (er) {
      printed.push({ kind: 'answer', text: er.message || 'That couldn\'t be answered just now. Try again.' });
    }).then(function () { asking = false; paintFull(); $('rh-in').focus(); });
  }

  $('rh-strip').addEventListener('click', open);
  $('rh-close').addEventListener('click', close);
  $('rh').addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
  $('rh-form').addEventListener('submit', ask);

  return {
    refresh: refresh, landed: landed, open: open,
    // Where a "+N XP" lands: the strip, while it's on the screen.
    target: function () { var s = $('rh-strip'); return s && !s.hidden && s.offsetParent !== null ? s : null; },
    signedOut: function () { lines = []; pending = []; printed = []; loaded = false; $('rh-strip').hidden = true; }
  };
};
