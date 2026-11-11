// Settings in Admin Mode (S5-P19 A, |Q577 (a), |Q578 (a), |M676): the
// Settings tab's groups your rank may change, each a section opened one at a
// time. Each setting in plain words, with a line on what it does: a number in
// a box with its unit, a colour with a colour picker, a choice, names, or the
// sayings as a list to add to and remove from. Save on each section; HABO
// checks each value and records every change in the Changes tab.
window.LitterSettings = function (app) {
  'use strict';
  var $ = app.$;
  var groups = [], openKey = '';
  // The lock (S6-P7, |Q649 (a)): Settings opens locked, so a mis-tap can't
  // change anything. The floating 🔓 Unlock opens every box; Save, or
  // leaving Settings, locks it again.
  var locked = true;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function open() {
    locked = true;
    openKey = '';
    app.show('v-settings');
    window.scrollTo(0, 0);
    $('settings-list').textContent = '';
    $('settings-note').textContent = 'Loading your settings…';
    return app.api('settingsLoad', { token: app.myToken() }).then(function (d) {
      groups = d.groups || [];
      draw();
    }, function (err) {
      if (err.code === 'signed-out') return app.signedOut();
      $('settings-note').textContent = err.message;
    });
  }

  function draw() {
    var box = $('settings-list');
    box.textContent = '';
    $('settings-note').textContent = groups.length ? 'Choose a category.' : 'Your rank has no settings to change yet.';
    groups.forEach(function (g) { box.appendChild(section(g)); });
    lock(locked);
    screenFor(groups.some(function (g) { return g.key === openKey; }) ? openKey : '', true);
  }

  // The categories as screens (S6-P32, |Q727): the list, or one category on
  // its own with "← All settings" above it.
  function screenFor(key, keepScroll) {
    openKey = key;
    Array.prototype.forEach.call(document.querySelectorAll('#settings-list .lt-set-group'), function (o) {
      var mine = !!key && o.id === 'set-' + key;
      o.hidden = !!key && !mine;
      if (mine && !o.open) o.open = true;
      if (!key && o.open) o.open = false;
    });
    $('settings-all').hidden = !key;
    $('settings-note').hidden = !!key;
    var g = groups.filter(function (x) { return x.key === key; })[0];
    $('settings-title').textContent = g ? g.title : 'Settings';
    if (!keepScroll) window.scrollTo(0, 0);
  }

  // Locked: every box shows its value, and nothing in a section (its boxes,
  // Add, Remove, Save) can be pressed; a section still opens to be read.
  function lock(on) {
    locked = on;
    var box = $('settings-list'), btn = $('settings-lock');
    box.classList.toggle('lt-set-locked', on);
    Array.prototype.forEach.call(box.querySelectorAll('input, select, textarea, button'), function (x) { x.disabled = on; });
    // The bar shows the state it's in (S6-P7, |M892): blue "🔒locked", or red
    // "🔓UNLOCKED"; a press changes it. The words under the heading are gone.
    btn.hidden = !groups.length;
    document.body.classList.toggle('lt-has-lockbar', !!groups.length);
    // The page behind Settings shows the lock's state (S6-P7, |M894, |Q684 (a)):
    // near-black navy while locked, maroon while unlocked.
    document.body.classList.toggle('lt-set-bg-locked', !!groups.length && on);
    document.body.classList.toggle('lt-set-bg-open', !!groups.length && !on);
    btn.textContent = on ? '🔒locked' : '🔓UNLOCKED';
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.setAttribute('aria-label', on ? 'Settings are locked. Press to unlock them.' : 'Settings are unlocked. Press to lock them.');
    btn.classList.toggle('lt-lockbar-open', !on);
    // Unlocked, the "Locked…" notice no longer applies: it goes.
    if (!on) Array.prototype.forEach.call(document.querySelectorAll('#notice .lt-nt[data-key="settings-locked"]'), function (n) { n.remove(); });
  }
  var LOCKED_SAY = 'Locked, so nothing changes by mistake. Press 🔒locked at the bottom to unlock.';

  function section(g) {
    var d = el('details', 'card lt-set-group');
    d.id = 'set-' + g.key;
    d.open = g.key === openKey;
    // A category in the list: its name, and a line on what's in it (S6-P32, |Q727).
    var head = el('summary', 'lt-set-head');
    head.appendChild(el('span', 'lt-set-title', g.title));
    if (g.says) head.appendChild(el('span', 'lt-set-says', g.says));
    d.appendChild(head);
    d.appendChild(el('p', 'muted small', 'Changed by ' + (/^[AEIOU]/.test(g.rank) ? 'an ' : 'a ') + g.rank + (g.rank === 'Head Builder' ? '.' : ' or above.')));
    // A line the backend adds, like the digest's timer on Forum (S6-P16).
    if (g.note) { var nt = el('p', 'small lt-set-note' + (g.noteWarn ? ' lt-set-warn' : ''), g.note); nt.id = 'set-note-' + g.key; d.appendChild(nt); }
    // Opened, a category is a screen of its own; closed, the list again.
    d.addEventListener('toggle', function () {
      if (d.open) { if (openKey !== g.key) screenFor(g.key); }
      else if (openKey === g.key) screenFor('');
    });
    var rows = g.custom ? skillsSection(g, d) : g.items.map(function (it) { var r = item(g, it); d.appendChild(r.box); return r; });
    var err = el('p', 'err');
    err.id = 'set-err-' + g.key;
    err.setAttribute('role', 'alert');
    var save = el('button', 'btn btn-primary lt-set-save', 'Save');
    save.type = 'button';
    save.addEventListener('click', function () {
      var values = {};
      rows.forEach(function (r) { values[r.name] = r.value(); });
      app.busy(save, err.id, function () {
        return app.api('settingsSave', { token: app.myToken(), group: g.key, values: values }).then(function (res) {
          groups = res.groups || groups;
          openKey = g.key;
          locked = true;   // Save locks it again (S6-P7)
          draw();
          app.notice(res.changed ? g.title + ': ' + (res.changed === 1 ? '1 setting' : res.changed + ' settings') + ' saved. The page uses ' + (res.changed === 1 ? 'it' : 'them') + ' from when you go back.' : g.title + ': nothing had changed.');
        });
      });
    });
    if (g.preview) sharePreview(g, d, rows, save);
    else d.appendChild(save);
    d.appendChild(err);
    return d;
  }

  // The share picture's preview (S6-P5, |C914): drawn from the boxes as they
  // are, before Save, on a sample walk with your handle, and drawn again the
  // moment a box changes.
  function sharePreview(g, d, rows, save) {
    var p = g.preview, box = el('div', 'lt-set-preview');
    box.id = 'set-share-preview';
    box.appendChild(el('p', 'lt-set-label', 'Preview'));
    box.appendChild(el('p', 'small muted', 'A sample walk, with your handle, a level reached and a badge earned, as the picture would be with the boxes above. Save to use it.'));
    var canvas = el('canvas', 'lt-set-preview-pic');
    canvas.id = 'set-share-canvas';
    box.appendChild(canvas);
    d.appendChild(save);
    d.appendChild(box);
    var me = app.me ? app.me() || {} : {}, now = Date.now();
    var walk = { started: now - 50 * 60000, ended: now - 15 * 60000, pounds: 3.4, miles: 1.2, handle: me.handle || 'your.handle', level: 3,
      track: [[32.36985, -86.29055], [32.37005, -86.28985], [32.37030, -86.28905], [32.37075, -86.28845], [32.37120, -86.28780]],
      stretches: [{ index: 4.2, streetMi: 1.2, offMi: 0, cells: [] }], segRates: [{ cells: [], rate: 1.4 }],
      extras: { level: 3, badges: [{ badge: '💯', name: 'The 100 lb Club' }] } };
    var look = function () {
      var v = {}; rows.forEach(function (r) { v[r.name] = r.value(); });
      var layout = p.layouts[v[p.layoutSetting]] ? v[p.layoutSetting] : 'Full', out = { appName: String(v[p.nameSetting] || '').trim() || p.defaultName,
        mapShows: v[p.showsSetting] === 'Accumulation rate' ? 'Accumulation rate' : 'Litter Index', rateTop: p.rateTop || 5 };
      p.parts.forEach(function (x) { var c = v[x.setting]; out[x.key] = c === 'On' ? true : c === 'Off' ? false : p.layouts[layout].indexOf(x.key) !== -1; });
      return out;
    };
    var timer = null, n = 0;
    var redraw = function () {
      var mine = ++n, l = look();
      canvas.dataset.look = JSON.stringify(l);
      if (!window.LitterShare || !window.LitterShare.drawOn) return;
      window.LitterShare.drawOn(canvas, walk, l).then(function () { if (mine === n) canvas.dataset.drawn = String(mine); }, function () {});
    };
    d.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(redraw, 150); });
    d.addEventListener('change', function () { clearTimeout(timer); timer = setTimeout(redraw, 150); });
    redraw();
  }

  // One setting: its words and its box. Returns { box, name, value() }.
  function item(g, it) {
    var box = el('div', 'lt-set-item');
    var id = 'set-' + g.key + '-' + String(it.name).replace(/[^a-z0-9]+/gi, '-').toLowerCase();
    var label = el('label', 'lt-set-label', it.label);
    label.htmlFor = id;
    box.appendChild(label);
    box.appendChild(el('p', 'muted small lt-set-say', it.say));
    var row = el('div', 'lt-set-row'), value;
    if (it.kind === 'number') {
      var n = el('input', 'lt-set-number');
      n.type = 'number'; n.inputMode = 'decimal'; n.step = 'any'; n.id = id; n.value = it.value;
      if (it.min != null) n.min = it.min;
      if (it.max != null) n.max = it.max;
      row.appendChild(n);
      if (it.unit) row.appendChild(el('span', 'lt-set-unit', it.unit));
      value = function () { return n.value; };
    } else if (it.kind === 'colour') {
      var c = el('input', 'lt-set-colour'), hex = el('span', 'lt-set-unit lt-set-hex');
      c.type = 'color'; c.id = id;
      c.value = /^#[0-9a-f]{6}$/i.test(it.value) ? it.value.toLowerCase() : '#000000';
      hex.textContent = c.value;
      c.addEventListener('input', function () { hex.textContent = c.value; });
      row.appendChild(c); row.appendChild(hex);
      value = function () { return c.value; };
    } else if (it.kind === 'choice') {
      var s = el('select', 'lt-set-choice');
      s.id = id;
      (it.choices || []).forEach(function (o) { var opt = el('option', null, o); opt.value = o; s.appendChild(opt); });
      s.value = it.value;
      row.appendChild(s);
      value = function () { return s.value; };
    } else if (it.kind === 'text') {
      // A line of words, like the app's name (S6-P5 round 2).
      var tx = el('input', 'lt-set-text');
      tx.id = id; tx.value = it.value; tx.autocomplete = 'off'; tx.maxLength = it.max || 60;
      row.appendChild(tx);
      value = function () { return tx.value; };
    } else if (it.kind === 'names') {
      var t = el('input', 'lt-set-names');
      t.id = id; t.value = it.value; t.autocomplete = 'off';
      row.appendChild(t);
      value = function () { return t.value; };
    } else {
      // The sayings: a list to add to and remove from.
      var list = el('div', 'lt-set-lines');
      var add = function (text) {
        var line = el('div', 'lt-set-line');
        var inp = el('input', 'lt-set-line-text');
        inp.value = text || ''; inp.maxLength = 300; inp.setAttribute('aria-label', 'A saying');
        var rm = el('button', 'btn btn-secondary lt-set-remove', 'Remove');
        rm.type = 'button';
        rm.addEventListener('click', function () { line.remove(); });
        line.appendChild(inp); line.appendChild(rm);
        list.appendChild(line);
        return inp;
      };
      (it.value || []).forEach(function (x) { add(x); });
      var more = el('button', 'btn btn-secondary lt-set-add', 'Add a saying');
      more.type = 'button';
      more.id = id;
      more.addEventListener('click', function () { add('').focus(); });
      box.appendChild(list);
      row.appendChild(more);
      value = function () { return Array.prototype.map.call(list.querySelectorAll('.lt-set-line-text'), function (x) { return x.value; }).filter(function (x) { return x.trim(); }); };
    }
    box.appendChild(row);
    return { box: box, name: it.name, value: value };
  }

  // Levels and class skills (S5-P29, |Q612 to |Q615): the level ranges, each
  // with its XP for each level, to add to and remove from; then each Litter
  // Class Skill with the level it opens at. Returns its rows, as item() does.
  function skillsSection(g, d) {
    var lv = el('div', 'lt-set-item');
    lv.appendChild(el('p', 'lt-set-label', 'Levels'));
    lv.appendChild(el('p', 'muted small lt-set-say', 'Each level costs its range\'s XP, on top of the levels before it. Below Level 1 is Level 0. Leave To level blank for "and up".'));
    var table = el('div', 'lt-set-ranges');
    var head = el('div', 'lt-set-range lt-set-range-head');
    ['From level', 'To level', 'XP per level', ''].forEach(function (t) { head.appendChild(el('span', null, t)); });
    table.appendChild(head);
    var addRange = function (r) {
      var line = el('div', 'lt-set-range');
      ['From level', 'To level', 'XP per level'].forEach(function (t, i) {
        var n = el('input', 'lt-set-number lt-set-range-' + ['from', 'to', 'xp'][i]);
        n.type = 'number'; n.inputMode = 'numeric'; n.step = i === 2 ? 'any' : '1'; n.min = i === 2 ? '0' : '1';
        n.value = r && r[i] != null ? r[i] : '';
        n.setAttribute('aria-label', t);
        line.appendChild(n);
      });
      var rm = el('button', 'btn btn-secondary lt-set-remove', 'Remove');
      rm.type = 'button';
      rm.addEventListener('click', function () { line.remove(); });
      line.appendChild(rm);
      table.appendChild(line);
      return line;
    };
    (g.levels || []).forEach(addRange);
    lv.appendChild(table);
    var more = el('button', 'btn btn-secondary lt-set-add', 'Add a level range');
    more.type = 'button';
    more.id = 'set-skills-add-range';
    more.addEventListener('click', function () { addRange(null).querySelector('input').focus(); });
    lv.appendChild(more);
    d.appendChild(lv);
    var sk = el('div', 'lt-set-item');
    sk.appendChild(el('p', 'lt-set-label', 'Litter Class Skills'));
    sk.appendChild(el('p', 'muted small lt-set-say', 'The level each opens at. 0 is open to everyone. A player below it sees it greyed in their top panel, with "Unlocks at Level 2".'));
    d.appendChild(sk);
    var boxes = (g.skills || []).map(function (s) {
      var r = item(g, { name: s.key, label: s.name, say: s.say, kind: 'number', unit: 'level', min: 0, max: 999, value: s.level });
      r.box.querySelector('input').step = '1';
      d.appendChild(r.box);
      return r;
    });
    return [
      { name: 'levels', value: function () {
        return Array.prototype.map.call(table.querySelectorAll('.lt-set-range:not(.lt-set-range-head)'), function (line) {
          return Array.prototype.map.call(line.querySelectorAll('input'), function (x) { return x.value; });
        }).filter(function (r) { return r.some(function (x) { return String(x).trim(); }); });
      } },
      { name: 'skills', value: function () { var o = {}; boxes.forEach(function (b) { o[b.name] = b.value(); }); return o; } }
    ];
  }

  // The Settings button, in the Admin Mode box while Admin Mode is on.
  function sync() { $('me-go-settings').hidden = !$('cl-sim').checked; }
  $('cl-sim').addEventListener('change', sync);
  $('me-go-settings').addEventListener('click', function () { if (app.closePanel) app.closePanel(); app.notice(''); open(); });
  $('settings-back').addEventListener('click', function () { if (app.back) app.back(); });
  $('settings-all').addEventListener('click', function () { screenFor(''); });
  $('settings-lock').addEventListener('click', function () { lock(!locked); });
  // A tap on a locked box says why it won't change (S6-P7, |M892).
  $('settings-list').addEventListener('click', function (e) {
    if (!locked || e.target.closest('summary')) return;
    if (e.target.closest('.lt-set-group') && !e.target.closest('summary')) app.notice(LOCKED_SAY, { key: 'settings-locked' });
  });

  return { open: open, sync: sync };
};
