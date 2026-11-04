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

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }

  function open() {
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
    $('settings-note').textContent = groups.length ? 'Open a section, change what you need, and press its Save.' : 'Your rank has no settings to change yet.';
    groups.forEach(function (g) { box.appendChild(section(g)); });
  }

  function section(g) {
    var d = el('details', 'card lt-set-group');
    d.id = 'set-' + g.key;
    d.open = g.key === openKey;
    d.appendChild(el('summary', 'lt-set-head', g.title));
    d.appendChild(el('p', 'muted small', 'Changed by a ' + g.rank + (g.rank === 'Head Builder' ? '.' : ' or above.')));
    // One section open at a time.
    d.addEventListener('toggle', function () {
      if (!d.open) { if (openKey === g.key) openKey = ''; return; }
      openKey = g.key;
      Array.prototype.forEach.call(document.querySelectorAll('.lt-set-group'), function (o) { if (o !== d) o.open = false; });
    });
    var rows = g.items.map(function (it) { var r = item(g, it); d.appendChild(r.box); return r; });
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
          draw();
          app.notice(res.changed ? g.title + ': ' + (res.changed === 1 ? '1 setting' : res.changed + ' settings') + ' saved. The page uses ' + (res.changed === 1 ? 'it' : 'them') + ' from when you go back.' : g.title + ': nothing had changed.');
        });
      });
    });
    d.appendChild(save);
    d.appendChild(err);
    return d;
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

  // The Settings button, in the Admin Mode box while Admin Mode is on.
  function sync() { $('me-go-settings').hidden = !$('cl-sim').checked; }
  $('cl-sim').addEventListener('change', sync);
  $('me-go-settings').addEventListener('click', function () { if (app.closePanel) app.closePanel(); app.notice(''); open(); });
  $('settings-back').addEventListener('click', function () { if (app.back) app.back(); });

  return { open: open, sync: sync };
};
