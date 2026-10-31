// The map and your collections on the litter page (S3-P22, the litter
// class's step 3). The public map: every cell a saved collection covered,
// coloured by its latest Litter Index on a fixed scale (items 10, 12, 16);
// tap one for its reading, the day and who collected it, as they chose
// (Q317). Anyone can open it, with no account (Q391 (a)). Your collections:
// on the account page, each with its stretches' readings and visual
// ratings, and no means (item 15). Load geo.js and Leaflet first; litter.js
// calls LitterMap(app) with its helpers.
window.LitterMap = function (app) {
  'use strict';

  var G = window.LitterGeo;
  var $ = app.$;
  var HOME_CELL = '357940_-805900';   // downtown Montgomery
  var SHOW_FIRST = 10;              // collections listed before "Show all"
  var map = null, layer = null, planLayer = null, back = null;
  var loaded = null, loadedAt = 0;   // the last mapLoad, which the main page's map reuses for 2 minutes
  var colours = ['#2c7bb6', '#f6e8c3', '#8c510a'], dark = null;
  var mine = null, showAll = false;
  // Accepted segments and their rates (S5-P3): a layer of their own, and a
  // line in every square's pop-up (Q482).
  var realSegs = [], simSegs = [], rateTop = 5, mode = 'index', lastCells = [];
  // In Head Builder mode, the simulated world's segments (Q529).
  function segList() { return app.builderMode && app.builderMode() ? simSegs : realSegs; }
  // Head Builder mode's own colours, from the Settings tab (S5-U2 round 3, Q528).
  function darkColours() { return app.builderMode && app.builderMode() && dark ? dark : null; }
  function scale() { var k = darkColours(); return k ? k.colours : colours; }

  function round(n, p) { var f = Math.pow(10, p); return Math.round(n * f) / f; }
  function day(ymd) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(ymd || '');
    return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '';
  }
  function when(ms) {
    return new Date(ms).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' }) + ', ' +
      new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  }
  function clock(ms) { return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }

  /* ── The legend: the fixed scale, 0 to 10 ── */

  function legend(box) {
    box.textContent = '';
    var bar = el('div', 'lt-legend-bar');
    bar.style.background = 'linear-gradient(to right, ' + scale().join(', ') + ')';
    box.appendChild(bar);
    var marks = el('div', 'lt-legend-marks');
    (mode === 'rate' ? ['0', String(round(rateTop / 2, 2)), rateTop + ' or more lb per mile per day'] : ['0 · clean', '5', '10 or more · heavy'])
      .forEach(function (t) { marks.appendChild(el('span', null, t)); });
    box.appendChild(marks);
  }

  /* ── The public map ── */

  function ensureMap() {
    if (map) return;
    map = L.map('mp-map', { zoomControl: true, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    layer = L.layerGroup().addTo(map);
    planLayer = L.layerGroup().addTo(map);
    var h = G.cellCenter(HOME_CELL);
    map.setView([h.lat, h.lon], 13);
  }

  function useLoad(d) {
    loaded = d; loadedAt = Date.now();
    colours = d.colours || colours;
    dark = d.dark || dark;
    realSegs = d.segments || [];
    simSegs = d.simSegments || [];
    rateTop = d.rateTop || rateTop;
    legend($('mp-legend'));
  }

  // A plan's squares outlined, on a layer of its own, so switching layers
  // keeps it (S5-P3, Q517; Oct 31).
  function outlinePlan(cells) {
    if (!planLayer) return;
    planLayer.clearLayers();
    var pc = darkColours() ? darkColours().plan : '#7c3aed';
    (cells || []).forEach(function (cell) { L.rectangle(G.cellBounds(cell), { color: pc, weight: 2, dashArray: '5 4', fill: false, interactive: false, className: 'lt-plan-square' }).addTo(planLayer); });
  }

  // opts: { focus: [cells] to show first, back: what Back does, track: a
  // collection's kept GPX track, [[lat, lon], …], drawn as a line }.
  function open(opts) {
    opts = opts || {};
    back = opts.back || null;
    app.notice('');
    app.show('v-map');
    $('mp-slot').appendChild($('mp-body'));
    $('mp-note').textContent = 'Loading the map…';
    if (!window.L) { $('mp-note').textContent = 'The map couldn\'t load. Check your signal, then open the page again.'; return Promise.resolve(); }
    ensureMap();
    setTimeout(function () { map.invalidateSize(); }, 0);
    return app.api('mapLoad', {}).then(function (d) {
      useLoad(d);
      // A simulated walk's own squares, only when opened from that walk (S5-P1, C606).
      lastCells = (d.cells || []).concat(opts.own || []);
      draw(lastCells);
      if (opts.layer && opts.layer !== mode) setMode(opts.layer);
      // A plan, opened from Your plans: its squares outlined (S5-P3, Q517).
      outlinePlan(opts.plan || []);
      var focus = (opts.focus || []).length ? opts.focus : (d.cells || []).map(function (x) { return x[0]; });
      fit(focus);
      // The walk's own GPX track, where you walked (S3-P27, Oct 25).
      if (opts.track && opts.track.length > 1) {
        var k = darkColours();
        G.trackRuns(opts.track).forEach(function (run) {
          L.polyline(run.pts, run.paused ? { color: (k ? k.paused : d.pausedColour) || '#9ca3af', weight: 3, opacity: 0.55, interactive: false, className: 'lt-track-paused' }
            : { color: k ? k.track : '#111827', weight: 3, opacity: 0.85, interactive: false, className: 'lt-track-line' }).addTo(layer);
        });
        map.fitBounds(L.latLngBounds(opts.track), { maxZoom: 17, padding: [16, 16] });
      }
      $('mp-note').textContent = d.cells.length ? (d.cells.length === 1 ? '1 cell has' : d.cells.length.toLocaleString('en-US') + ' cells have') + ' a reading.'
        : 'No collections on the map yet. Cells show here once someone saves a collection.';
    }, function (err) { $('mp-note').textContent = err.message; });
  }

  // The same map on the main page, in the Collecting card, with your picked
  // plan outlined, in place of See the map (Oct 31, field first).
  function inline() {
    $('cl-litter-map-slot').appendChild($('mp-body'));
    if (!window.L) { $('mp-note').textContent = 'The map couldn\'t load. Check your signal, then open the page again.'; return Promise.resolve(); }
    ensureMap();
    setTimeout(function () { map.invalidateSize(); }, 0);
    var fresh = loaded && Date.now() - loadedAt < 120000;
    if (!fresh) $('mp-note').textContent = 'Loading the map…';
    return (fresh ? Promise.resolve(loaded) : app.api('mapLoad', {})).then(function (d) {
      useLoad(d);
      lastCells = d.cells || [];
      draw(lastCells);
      showPlan(app.pickedPlanCells ? app.pickedPlanCells() : []);
      $('mp-note').textContent = mode === 'rate' ? $('mp-note').textContent : '';
      if (mode === 'rate') setMode('rate');
    }, function (err) { $('mp-note').textContent = err.message; });
  }

  // The picked plan on the main page's map: outlined, and the map on it.
  function showPlan(planCells) {
    if (!map) return;
    outlinePlan(planCells || []);
    var focus = (planCells || []).length ? planCells : (loaded && loaded.cells || []).map(function (x) { return x[0]; });
    setTimeout(function () { map.invalidateSize(); fit(focus); }, 0);
  }

  // A segment's line in a pop-up: its rate, confidence and arrow, and
  // whether it's due or partly cleaned.
  var ARROWS = { up: ' ↑', down: ' ↓', level: ' →' };
  function segmentLine(g) {
    var rate = g.rate == null && g.median == null ? 'no recent rate' : g.shows === 'Both' ? 'median ' + round(g.median, 2) + ', average ' + round(g.average, 2) + ' lb per mile per day'
      : round(g.rate, 2) + ' lb per mile per day (' + g.shows.toLowerCase() + ' of ' + g.count + ')';
    return g.name + (g.kind === 'Field' ? ' (field)' : '') + ': ' + rate + ' · ' + g.confidence + (ARROWS[g.arrow] || '') +
      (g.due ? ' · Due: collect it to measure its rate' : '');
  }
  // Partly cleaned (Q532): "Partial (NE): 60% of this segment was cleaned 4 days ago".
  function partialLines(g) {
    return (g.groups || []).map(function (p) {
      return 'Partial' + (p.dir ? ' (' + p.dir + ')' : '') + ': ' + p.pct + '% of this segment ' +
        (p.days == null ? 'hasn\'t been cleaned yet' : 'was cleaned ' + (p.days === 0 ? 'less than a day ago' : p.days === 1 ? '1 day ago' : p.days + ' days ago'));
    });
  }
  function segmentsAt(cell) { return segList().filter(function (g) { return g.squares.indexOf(cell) !== -1; }); }

  function draw(cells) {
    layer.clearLayers();
    if (mode === 'rate') return drawRates();
    cells.forEach(function (x) {
      var c = G.indexColour(x[1], scale());
      var r = L.rectangle(G.cellBounds(x[0]), { color: c, weight: 1, opacity: 0.9, fillColor: c, fillOpacity: 0.7, className: 'lt-index-square' });
      r.bindPopup(function () {
        var box = el('div', 'lt-pop');
        box.appendChild(el('strong', null, 'Litter Index ' + x[1].toFixed(1)));
        box.appendChild(el('div', null, 'Collected ' + day(x[2])));
        if (x[3]) box.appendChild(el('div', null, 'By ' + x[3]));
        segmentsAt(x[0]).forEach(function (g) {
          box.appendChild(el('div', 'lt-pop-seg', segmentLine(g)));
          partialLines(g).forEach(function (t) { box.appendChild(el('div', 'lt-pop-part', t)); });
        });
        return box;
      });
      r.cellId = x[0];
      r.addTo(layer);
    });
  }

  // The accumulation rate layer: each accepted segment's squares in its
  // rate's colour, on the same scale up to the Settings tab's top; grey with
  // no recent rate.
  function drawRates() {
    segList().forEach(function (g) {
      var c = g.rate == null ? '#9ca3af' : G.indexColour(Math.min(10, g.rate / rateTop * 10), scale());
      g.squares.forEach(function (cell) {
        var r = L.rectangle(G.cellBounds(cell), { color: c, weight: 1, opacity: 0.9, fillColor: c, fillOpacity: 0.7, className: 'lt-rate-square' });
        r.bindPopup(function () {
          var box = el('div', 'lt-pop');
          box.appendChild(el('strong', null, 'Accumulation rate'));
          box.appendChild(el('div', 'lt-pop-seg', segmentLine(g)));
          partialLines(g).forEach(function (t) { box.appendChild(el('div', 'lt-pop-part', t)); });
          return box;
        });
        r.addTo(layer);
      });
    });
  }
  function setMode(m) {
    mode = m;
    if (map) map.closePopup();
    Array.prototype.forEach.call(document.querySelectorAll('#mp-layers .btn'), function (b) { b.classList.toggle('on', b.dataset.layer === m); });
    legend($('mp-legend'));
    if (layer) draw(lastCells);
    var n = segList().length;
    $('mp-note').textContent = m === 'rate' ? (n ? n + ' accepted segment' + (n === 1 ? '' : 's') + '. Tap one for its rate.' : 'No accepted segments yet.') : '';
  }

  function fit(cells) {
    if (!cells.length) return;
    var b = L.latLngBounds([]);
    cells.forEach(function (c) { b.extend(G.cellBounds(c)); });
    map.fitBounds(b, { maxZoom: 16, padding: [16, 16] });
  }

  /* ── Your collections (item 15) ── */

  function showMine() {
    return app.api('myCollections', { token: app.myToken() }).then(function (d) {
      mine = d;
      colours = d.colours || colours;
      dark = d.dark || dark;
      $('my-none').hidden = !!d.collections.length;
      drawMine();
      drawPlans(d.plans || []);
      realSegs = d.segments || realSegs;
      simSegs = d.simSegments || simSegs;
      drawSegments();
    }, function (err) {
      if (err.code === 'signed-out') return app.signedOut();
      $('my-none').hidden = false;
      $('my-none').textContent = err.message;
    });
  }

  function drawMine() {
    var list = $('my-list');
    list.textContent = '';
    var cols = mine.collections;
    (showAll ? cols : cols.slice(0, SHOW_FIRST)).forEach(function (c) { list.appendChild(collectionItem(c)); });
    $('my-more').hidden = showAll || cols.length <= SHOW_FIRST;
    $('my-more').textContent = 'Show all ' + cols.length;
  }

  function collectionItem(c) {
    var box = el('div', 'lt-col');
    box.id = 'my-' + c.id;
    box.appendChild(el('p', 'lt-col-head', when(c.started) + (c.ended ? ' to ' + clock(c.ended) : '')));
    box.appendChild(el('p', 'lt-col-facts', round(c.pounds, 2) + ' lb · ' + round(c.miles, 2) + ' mi · ' + Math.round(c.active) + ' min active · ' +
      c.hours + ' volunteer hour' + (c.hours === 1 ? '' : 's')));
    if (c.hoursNote) box.appendChild(el('p', 'muted small', c.hoursNote));
    var ul = el('ul', 'lt-col-stretches');
    c.stretchList.forEach(function (s) {
      var li = el('li');
      var sw = el('span', 'lt-swatch' + (s.index == null ? ' none' : ''));
      if (s.index != null) sw.style.background = G.indexColour(s.index, scale());
      li.appendChild(sw);
      li.appendChild(document.createTextNode('Weighing ' + s.n + ': ' + (s.discarded ? 'discarded, no reading' : s.index == null ? 'no reading' : 'Litter Index ' + round(s.index, 1)) +
        (s.rating == null ? '' : ' · Visual rating ' + s.rating)));
      ul.appendChild(li);
    });
    box.appendChild(ul);
    if (c.track && c.track.length > 1) box.appendChild(el('p', 'muted small', 'Your GPX track is saved: See it on the map shows it.'));
    if (c.hidden) box.appendChild(el('p', 'lt-col-hidden', 'HABO\'s staff have taken this collection off the public map. It\'s still kept, with your hours.'));
    var row = el('div', 'lt-col-row');
    var cells = [];
    c.stretchList.forEach(function (s) { if (!s.discarded) s.cells.forEach(function (x) { if (cells.indexOf(x) === -1) cells.push(x); }); });
    if (cells.length && !c.hidden) {
      var m = el('button', 'btn btn-secondary lt-col-map', 'See it on the map');
      m.type = 'button';
      // A simulated walk is off the public map (S5-U2), so its own squares come with it.
      var own = c.simulated ? [].concat.apply([], c.stretchList.filter(function (s) { return !s.discarded && s.index != null; })
        .map(function (s) { return s.cells.map(function (x) { return [x, s.index, '', 'Simulated walk']; }); })) : null;
      m.addEventListener('click', function () { open({ focus: cells, back: app.showCollections, track: c.track, own: own }); });
      row.appendChild(m);
    }
    if (c.editable) {
      var f = el('button', 'btn btn-secondary lt-col-fix', 'Fix it (until ' + when(c.editableUntil) + ')');
      f.type = 'button';
      f.addEventListener('click', function () { app.openSummary(c.id, f); });
      row.appendChild(f);
    }
    if (row.childNodes.length) box.appendChild(row);
    return box;
  }

  /* ── Your plans (S5-P3, Q517), each can be proposed as a segment (M565),
     picked again on the main page, or deleted (Oct 31, field first) ── */

  function drawPlans(plans) {
    var list = $('plans-list');
    list.textContent = '';
    $('plans-none').hidden = !!plans.length;
    plans.forEach(function (p) {
      var box = el('div', 'lt-plan-item');
      box.id = 'plan-' + p.id;
      box.appendChild(el('p', 'lt-col-head', app.planLabel(p)));
      box.appendChild(el('p', 'muted small', p.cells.length + ' square' + (p.cells.length === 1 ? '' : 's') + ' · ' + round(p.miles, 2) + ' mi · ' +
        (p.used ? 'collected ' + (p.used === 1 ? 'once' : p.used + ' times') + (p.lastUsed ? ', last ' + new Date(p.lastUsed).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '')
          : 'not collected yet') + ' · saved ' + (p.created ? new Date(p.created).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : '')));
      if (p.segment) box.appendChild(el('p', 'lt-plan-seg', p.segment.accepted ? 'Accepted segment ' + p.segment.id + ': ' + p.segment.name
        : 'Proposed as a segment (' + p.segment.id + ': ' + p.segment.name + '), waiting for HABO\'s staff'));
      var row = el('div', 'lt-col-row');
      var m = el('button', 'btn btn-secondary lt-plan-map', 'See it on the map');
      m.type = 'button';
      m.addEventListener('click', function () { open({ focus: p.cells, back: app.showPlans, plan: p.cells }); });
      row.appendChild(m);
      if (!p.segment) {
        var g = el('button', 'btn btn-secondary lt-plan-propose', 'Propose as a segment');
        g.type = 'button';
        g.addEventListener('click', function () {
          var name = window.prompt('Name this segment, like the street it runs along:', '');
          if (name == null) return;
          g.disabled = true;
          app.api('segmentPropose', { token: app.myToken(), planId: p.id, name: name }).then(function (d) {
            drawPlans(d.plans);
            app.notice('Proposed. Once HABO\'s staff accept it, anyone can collect it again and its accumulation rate builds.');
          }, function (err) { g.disabled = false; if (err.code === 'signed-out') return app.signedOut(); app.notice(err.message); });
        });
        row.appendChild(g);
      }
      var x = el('button', 'btn btn-secondary lt-plan-delete', 'Delete');
      x.type = 'button';
      x.addEventListener('click', function () {
        if (!window.confirm('Delete "' + app.planLabel(p) + '"? It leaves your plans and the Plan menu. Collections that used it keep their record.')) return;
        x.disabled = true;
        app.api('planDelete', { token: app.myToken(), planId: p.id }).then(function (d) {
          drawPlans(d.plans);
          app.onPlans(d);
          app.notice('Deleted.');
        }, function (err) { x.disabled = false; if (err.code === 'signed-out') return app.signedOut(); app.notice(err.message); });
      });
      row.appendChild(x);
      box.appendChild(row);
      list.appendChild(box);
    });
  }

  /* ── Segments (S5-P3, Q530): partly cleaned first, then due, then the rest ── */

  function drawSegments() {
    var list = $('segments-list');
    list.textContent = '';
    var rank = function (g) { return g.partly ? 0 : g.due ? 1 : 2; };
    var all = segList().slice().sort(function (a, b) { return rank(a) - rank(b) || String(a.name).localeCompare(String(b.name)); });
    $('my-segments').hidden = !all.length;
    all.forEach(function (g) {
      var box = el('div', 'lt-plan-item lt-seg-item' + (g.partly ? ' partly' : g.due ? ' due' : ''));
      box.id = 'seg-' + g.id;
      box.appendChild(el('p', 'lt-col-head', g.name + (g.kind === 'Field' ? ' (field)' : '') + ' · ' + round(g.miles, 2) + ' mi'));
      box.appendChild(el('p', 'small', segmentLine(g).replace(/^[^:]*: /, '')));
      partialLines(g).forEach(function (t) { box.appendChild(el('p', 'lt-plan-seg', t)); });
      if (!g.partly) box.appendChild(el('p', 'muted small', g.days == null ? 'Not cleaned yet.' : 'Last cleaned ' + (g.days < 1 ? 'less than a day' : round(g.days, 1) + ' days') + ' ago.'));
      var m = el('button', 'btn btn-secondary lt-seg-map', 'See it on the map');
      m.type = 'button';
      m.addEventListener('click', function () { open({ focus: g.squares, back: app.showAccount, layer: 'rate' }); });
      box.appendChild(m);
      list.appendChild(box);
    });
  }

  /* ── Wiring ── */

  $('mp-back').addEventListener('click', function () { if (back) back(); else app.showStart(); });
  $('my-more').addEventListener('click', function () { showAll = true; drawMine(); });
  Array.prototype.forEach.call(document.querySelectorAll('#mp-layers .btn'), function (b) { b.addEventListener('click', function () { setMode(b.dataset.layer); }); });

  return { open: open, showMine: showMine, inline: inline, showPlan: showPlan };
};
