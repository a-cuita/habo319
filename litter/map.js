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
    layersMenu(false);
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
    layersMenu(false);
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
    Array.prototype.forEach.call(document.querySelectorAll('#mp-layers .lt-layer-opt'), function (b) {
      b.classList.toggle('on', b.dataset.layer === m);
      b.setAttribute('aria-pressed', b.dataset.layer === m ? 'true' : 'false');
    });
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
      realSegs = d.segments || realSegs;
      simSegs = d.simSegments || simSegs;
      drawPlans(d.plans || []);
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
    // Measure again (Oct 31, field first): its segment rates worked out again,
    // with the Settings and each segment's Kind as they are now. A Head
    // Builder's, only while Admin Mode is on (S5-P13, Q555, Q564).
    if (c.track && c.track.length > 1 && app.builderMode && app.builderMode()) {
      var ma = el('button', 'btn btn-secondary lt-col-measure', 'Measure again');
      ma.type = 'button';
      ma.addEventListener('click', function () {
        ma.disabled = true;
        app.api('measureAgain', { token: app.myToken(), collectionId: c.id }).then(function (d) {
          ma.disabled = false;
          realSegs = d.segments || realSegs;
          simSegs = d.simSegments || simSegs;
          drawSegments();
          app.notice(d.measured.length ? 'Measured again: ' + d.measured.map(function (x) { return x.name + ' ' + round(x.rate, 2); }).join(', ') + ' lb per mile per day.'
            : 'Measured again: no segment rate from this walk.');
        }, function (err) { ma.disabled = false; if (err.code === 'signed-out') return app.signedOut(); app.notice(err.message); });
      });
      row.appendChild(ma);
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

  /* ── Segments (S5-P9, S5-P12, M590, Q544, Q545, Q550-Q554, Q562): your
     private segments, then the public ones, each list folding away. Each card
     has a small map to tap for a larger one, the streets it runs along when
     they can be found, its squares and miles, and when it was last collected;
     a private one's ⋯ menu has Submit as Public Segment and Delete. Select…
     chooses the segments for your walk's plan. ── */

  var TILES = 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', OVERPASS = 'https://overpass-api.de/api/interpreter';
  var myPlansList = [], selecting = false, picked = [], fromChoose = false;
  var thumbs = [], streetWords = {}, streetsAsked = '';
  var modalMap = null, modalLayer = null;

  function drawPlans(plans) { myPlansList = plans || []; drawSegScreen(); }
  function dayWords(ms) { return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }); }

  function drawSegScreen() {
    thumbs.forEach(function (m) { m.remove(); });
    thumbs = [];
    var mineBox = $('plans-list'), pubBox = $('public-list'), pubs = segList();
    mineBox.textContent = '';
    pubBox.textContent = '';
    $('plans-none').hidden = !!myPlansList.length;
    $('plans-count').textContent = '(' + myPlansList.length + ')';
    $('public-none').hidden = !!pubs.length;
    $('public-count').textContent = '(' + pubs.length + ')';
    myPlansList.forEach(function (p) {
      var facts = p.cells.length + ' square' + (p.cells.length === 1 ? '' : 's') + ' · ' + round(p.miles, 2) + ' mi · ' +
        (p.used ? 'collected ' + (p.used === 1 ? 'once' : p.used + ' times') + (p.lastUsed ? ', last ' + dayWords(p.lastUsed) : '') : 'not collected yet');
      var box = segCard({ id: p.id, kind: 'private', name: app.planLabel(p), cells: p.cells, facts: facts, plan: p });
      if (p.segment) box.appendChild(el('p', 'lt-plan-seg', p.segment.accepted ? 'Public segment ' + p.segment.id + ': ' + p.segment.name
        : 'Submitted as a public segment (' + p.segment.id + ': ' + p.segment.name + '), waiting for HABO\'s staff'));
      mineBox.appendChild(box);
    });
    pubs.forEach(function (g) {
      var facts = (g.kind === 'Field' ? 'Field' : 'Path') + ' · ' + g.squares.length + ' squares · ' + round(g.miles, 2) + ' mi · ' +
        (g.days == null ? 'not cleaned yet' : 'last cleaned ' + (g.days < 1 ? 'less than a day ago' : round(g.days, 1) + ' days ago'));
      pubBox.appendChild(segCard({ id: g.id, kind: 'public', name: g.name, cells: g.squares, facts: facts }));
    });
    $('my-plans').classList.toggle('selecting', selecting);
    $('seg-select').hidden = selecting;
    $('seg-select-say').hidden = !selecting;
    showBar();
    // The small maps and the street names only while the screen is open.
    if (!$('v-plans').hidden) { setTimeout(drawThumbs, 0); describeStreets(); }
  }

  function segCard(x) {
    var box = el('div', 'lt-plan-item lt-seg-card ' + x.kind + (picked.indexOf(x.id) !== -1 ? ' picked' : ''));
    box.id = (x.kind === 'private' ? 'plan-' : 'pub-') + x.id;
    box.dataset.id = x.id;
    box._cells = x.cells;
    var top = el('div', 'lt-seg-card-top');
    var tick = el('span', 'lt-seg-tick', '✓');
    tick.setAttribute('aria-hidden', 'true');
    top.appendChild(tick);
    top.appendChild(el('p', 'lt-col-head', x.name));
    if (x.kind === 'private') top.appendChild(moreMenu(x.plan, box));
    box.appendChild(top);
    var thumb = el('div', 'lt-seg-thumb');
    thumb.setAttribute('role', 'button');
    thumb.setAttribute('aria-label', 'See ' + x.name + ' on a larger map');
    thumb.tabIndex = 0;
    // While selecting, a tap anywhere on the card picks it; else its small map opens larger.
    thumb.addEventListener('click', function (e) { if (selecting) return; e.stopPropagation(); openModal(x.name, x.cells, x.kind); });
    thumb.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openModal(x.name, x.cells, x.kind); } });
    box.appendChild(thumb);
    var st = el('p', 'small lt-seg-streets', streetWords[x.id] || '');
    st.hidden = !streetWords[x.id];
    box.appendChild(st);
    box.appendChild(el('p', 'muted small lt-seg-facts', x.facts));
    box.addEventListener('click', function (e) {
      if (!selecting || (e.target.closest && e.target.closest('.lt-seg-more-wrap, .lt-propose'))) return;
      var i = picked.indexOf(x.id);
      if (i === -1) picked.push(x.id); else picked.splice(i, 1);
      box.classList.toggle('picked', i === -1);
      showBar();
    });
    return box;
  }

  // A private segment's ⋯ menu: Submit as Public Segment and Delete (M590).
  function moreMenu(p, box) {
    var wrap = el('div', 'lt-seg-more-wrap');
    var b = el('button', 'lt-seg-more', '⋯');
    b.type = 'button';
    b.setAttribute('aria-label', 'More for ' + app.planLabel(p));
    b.setAttribute('aria-expanded', 'false');
    var menu = el('div', 'lt-seg-menu');
    menu.hidden = true;
    if (!p.segment) {
      var s = el('button', 'lt-seg-menu-item lt-plan-propose', 'Submit as Public Segment');
      s.type = 'button';
      s.addEventListener('click', function () { closeMenus(); submitForm(p, box); });
      menu.appendChild(s);
    }
    var d = el('button', 'lt-seg-menu-item lt-plan-delete', 'Delete');
    d.type = 'button';
    d.addEventListener('click', function () {
      closeMenus();
      if (!window.confirm('Delete "' + app.planLabel(p) + '"? It leaves your private segments. Collections that used it keep their record.')) return;
      app.api('planDelete', { token: app.myToken(), planId: p.id }).then(function (r) {
        drawPlans(r.plans);
        app.onPlans(r);
        app.notice('Deleted.');
      }, function (err) { if (err.code === 'signed-out') return app.signedOut(); app.notice(err.message); });
    });
    menu.appendChild(d);
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = menu.hidden;
      closeMenus();
      menu.hidden = !open;
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    wrap.appendChild(b);
    wrap.appendChild(menu);
    return wrap;
  }
  function closeMenus() {
    Array.prototype.forEach.call(document.querySelectorAll('.lt-seg-menu'), function (m) { m.hidden = true; });
    Array.prototype.forEach.call(document.querySelectorAll('.lt-seg-more'), function (m) { m.setAttribute('aria-expanded', 'false'); });
  }

  // Submit as Public Segment: its name, and Path or Field (Oct 31, field first).
  function submitForm(p, box) {
    if (box.querySelector('.lt-propose')) return;
    var f = el('div', 'lt-propose');
    var n1 = el('div', 'ig'), l1 = el('label', null, 'Segment name'), inp = el('input', 'lt-propose-name');
    inp.id = 'pp-name-' + p.id; l1.htmlFor = inp.id; inp.maxLength = 80; inp.placeholder = 'Like the street it runs along'; inp.value = p.name || '';
    n1.appendChild(l1); n1.appendChild(inp); f.appendChild(n1);
    var n2 = el('div', 'ig'), l2 = el('label', null, 'Kind'), sel = el('select', 'lt-propose-kind');
    sel.id = 'pp-kind-' + p.id; l2.htmlFor = sel.id;
    ['Path', 'Field'].forEach(function (k) { var o = el('option', null, k); o.value = k; sel.appendChild(o); });
    n2.appendChild(l2); n2.appendChild(sel); f.appendChild(n2);
    f.appendChild(el('p', 'muted small', 'Path: a street, sidewalk or trail. Field: open ground, like a lawn or a park.'));
    var go = el('button', 'btn btn-primary lt-propose-go', 'Submit'), no = el('button', 'btn btn-secondary lt-propose-cancel', 'Cancel');
    go.type = 'button'; no.type = 'button';
    no.addEventListener('click', function () { f.parentNode.removeChild(f); });
    go.addEventListener('click', function () {
      go.disabled = true;
      app.api('segmentPropose', { token: app.myToken(), planId: p.id, name: inp.value, kind: sel.value }).then(function (d) {
        drawPlans(d.plans);
        app.notice('Submitted. Once HABO\'s staff accept it, it\'s a public segment: anyone can collect it again, and its accumulation rate builds.');
      }, function (err) { go.disabled = false; if (err.code === 'signed-out') return app.signedOut(); app.notice(err.message); });
    });
    f.appendChild(go); f.appendChild(no);
    box.appendChild(f);
    inp.focus();
  }

  // Each card's small map, once the cards are on the screen (Leaflet needs their size).
  function drawThumbs() {
    if (!window.L) return;
    Array.prototype.forEach.call(document.querySelectorAll('#my-plans .lt-seg-thumb'), function (div) {
      if (div._map || !div.offsetWidth) return;
      var cells = div.parentNode._cells || [];
      if (!cells.length) return;
      var m = L.map(div, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
        boxZoom: false, keyboard: false, touchZoom: false, tap: false });
      L.control.attribution({ prefix: false }).addAttribution('&copy; OpenStreetMap').addTo(m);
      L.tileLayer(TILES, { maxZoom: 19 }).addTo(m);
      var colour = div.parentNode.classList.contains('public') ? '#0e7490' : (darkColours() ? darkColours().plan : '#7c3aed');
      var b = L.latLngBounds([]);
      cells.forEach(function (c) { L.rectangle(G.cellBounds(c), { color: colour, weight: 1, fillColor: colour, fillOpacity: 0.45, interactive: false }).addTo(m); b.extend(G.cellBounds(c)); });
      m.fitBounds(b, { maxZoom: 17, padding: [8, 8] });
      div._map = m;
      thumbs.push(m);
    });
  }

  // A segment's map, larger, over the page.
  function openModal(title, cells, kind) {
    $('seg-modal-title').textContent = title;
    $('seg-modal').hidden = false;
    if (!window.L) return;
    if (!modalMap) {
      modalMap = L.map('seg-modal-map', { zoomControl: true, attributionControl: true });
      L.tileLayer(TILES, { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(modalMap);
      modalLayer = L.layerGroup().addTo(modalMap);
    }
    modalLayer.clearLayers();
    var colour = kind === 'public' ? '#0e7490' : (darkColours() ? darkColours().plan : '#7c3aed');
    var b = L.latLngBounds([]);
    cells.forEach(function (c) { L.rectangle(G.cellBounds(c), { color: colour, weight: 2, fillColor: colour, fillOpacity: 0.35, className: 'lt-modal-square' }).addTo(modalLayer); b.extend(G.cellBounds(c)); });
    setTimeout(function () { modalMap.invalidateSize(); if (b.isValid()) modalMap.fitBounds(b, { maxZoom: 18, padding: [20, 20] }); }, 0);
  }
  function closeModal() { $('seg-modal').hidden = true; }

  // The streets each segment runs along, from OpenStreetMap, once for all
  // the cards on the screen; without them, the cards go on without.
  function describeStreets() {
    var cards = myPlansList.map(function (p) { return { id: p.id, cells: p.cells }; })
      .concat(segList().map(function (g) { return { id: g.id, cells: g.squares }; }))
      .filter(function (x) { return streetWords[x.id] == null && x.cells.length; });
    if (!cards.length) return;
    var s = 90, w = 180, n = -90, e = -180;
    cards.forEach(function (x) { x.cells.forEach(function (c) { var bb = G.cellBounds(c); s = Math.min(s, bb[0][0]); w = Math.min(w, bb[0][1]); n = Math.max(n, bb[1][0]); e = Math.max(e, bb[1][1]); }); });
    s -= 0.002; w -= 0.002; n += 0.002; e += 0.002;
    var key = [s, w, n, e].map(function (v) { return v.toFixed(3); }).join(',') + ':' + cards.map(function (x) { return x.id; }).join(' ');
    if (streetsAsked === key) return;
    streetsAsked = key;
    fetch(OVERPASS, { method: 'POST', body: 'data=' + encodeURIComponent(G.overpassQuery(s, w, n, e)), headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
      .then(function (res) { if (!res.ok) throw new Error('streets ' + res.status); return res.json(); })
      .then(function (json) {
        var st = new G.Streets(G.compactWays(json));
        cards.forEach(function (x) { streetWords[x.id] = st.describe(x.cells); });
        Array.prototype.forEach.call(document.querySelectorAll('#my-plans .lt-seg-card'), function (box) {
          var p = box.querySelector('.lt-seg-streets'), t = streetWords[box.dataset.id] || '';
          p.textContent = t;
          p.hidden = !t;
        });
      }, function () { streetsAsked = ''; });
  }

  // Select… (Q553, Q562): tap the segments for your walk's plan; the bar shows
  // how many and their miles, with Use as my plan and Cancel.
  function pickedSegs() {
    return picked.map(function (id) {
      var p = myPlansList.filter(function (x) { return x.id === id; })[0];
      if (p) return { id: id, miles: p.miles };
      var g = segList().filter(function (x) { return x.id === id; })[0];
      return g ? { id: id, miles: g.miles } : null;
    }).filter(Boolean);
  }
  function showBar() {
    $('seg-bar').hidden = !selecting;
    if (!selecting) return;
    var list = pickedSegs(), mi = list.reduce(function (t, x) { return t + (Number(x.miles) || 0); }, 0);
    $('seg-bar-say').textContent = list.length ? list.length + (list.length === 1 ? ' segment' : ' segments') + ' · ' + round(mi, 2) + ' mi' : 'None picked yet';
    $('seg-use').disabled = !list.length;
  }
  function startSelect(ids, viaChoose) {
    selecting = true;
    picked = (ids || []).slice();
    fromChoose = !!viaChoose;
    drawSegScreen();
  }
  function stopSelect() {
    if (!selecting) return;
    selecting = false;
    picked = [];
    drawSegScreen();
  }
  function showSegments(selectIds, viaChoose) {
    if (selectIds) startSelect(selectIds, viaChoose);
    else drawSegScreen();
    setTimeout(drawThumbs, 0);
  }

  /* ── The Priority Segment List (S5-P10, M592, Q546-Q548, Q561): only the
     public segments that need collecting. Greatest need: the least time left
     before it's past due first, a partly covered one among them marked Finish
     it; then past due, the longest first; then never cleaned. A segment fully
     cleaned too recently to be due needs nothing yet, so it's left off.
     Nearest to me: by distance from where the phone is. ── */

  var sortBy = 'need', here = null;
  function needOf(g) {
    if (g.days == null) return 'never';
    if (g.past) return 'past';
    if (g.partly) return 'finish';
    if (g.due) return 'due';
    return '';
  }
  function leftWords(g) { return g.left < 1 ? 'less than a day left' : round(g.left, 1) + ' days left'; }
  function needLine(g, need) {
    return need === 'finish' ? 'Finish it · ' + leftWords(g) + ' to collect it for its rate'
      : need === 'due' ? leftWords(g) + ' to collect it for its rate'
      : need === 'past' ? 'Past due: last cleaned ' + round(g.days, 1) + ' days ago' : '';
  }
  // Metres from where the phone is to the segment's nearest square.
  function awayOf(g) {
    var me = G.xy(here.lat, here.lon);
    return g.squares.reduce(function (m, sq) { return Math.min(m, G.dist(me, G.centerXY(sq))); }, Infinity);
  }
  function drawSegments() {
    var list = $('segments-list');
    list.textContent = '';
    var rank = { due: 0, finish: 0, past: 1, never: 2 };
    var all = segList().filter(function (g) { return needOf(g); });
    if (sortBy === 'near' && here) {
      all.forEach(function (g) { g.away = awayOf(g); });
      all.sort(function (a, b) { return a.away - b.away; });
    } else {
      all.sort(function (a, b) {
        var ra = rank[needOf(a)], rb = rank[needOf(b)];
        return ra - rb || (ra === 0 ? a.left - b.left : ra === 1 ? b.days - a.days : 0) || String(a.name).localeCompare(String(b.name));
      });
    }
    $('my-segments').hidden = !segList().length;
    $('segments-none').hidden = !!all.length;
    all.forEach(function (g) {
      var need = needOf(g);
      var box = el('div', 'lt-plan-item lt-seg-item' + (need === 'finish' ? ' partly' : need === 'due' ? ' due' : need === 'past' ? ' past' : ''));
      box.id = 'seg-' + g.id;
      // Its kind, Path or Field (Oct 31, field first).
      box.appendChild(el('p', 'lt-col-head', g.name + ' · ' + (g.kind === 'Field' ? 'Field' : 'Path') + ' · ' + round(g.miles, 2) + ' mi'));
      if (needLine(g, need)) box.appendChild(el('p', 'lt-seg-need', needLine(g, need)));
      if (sortBy === 'near' && here) box.appendChild(el('p', 'muted small lt-seg-away', round(g.away / G.MILE_M, 2) + ' mi away'));
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
  // Sort (S5-P10, Q561): Nearest to me asks the phone where it is.
  $('seg-sort').addEventListener('change', function () {
    var pick = this.value;
    if (pick === 'need') { sortBy = 'need'; return drawSegments(); }
    if (!navigator.geolocation) { this.value = 'need'; return app.notice('This phone can\'t give its location, so the list stays by greatest need.'); }
    var sel = this;
    navigator.geolocation.getCurrentPosition(function (p) {
      here = { lat: p.coords.latitude, lon: p.coords.longitude };
      sortBy = 'near';
      drawSegments();
    }, function () {
      sel.value = 'need';
      sortBy = 'need';
      drawSegments();
      app.notice('Your phone didn\'t give its location, so the list stays by greatest need.');
    }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 60000 });
  });
  // The layer choice (S5-P11, Q549): the small button opens its menu; picking
  // a layer, a tap elsewhere or Escape closes it.
  function layersMenu(show) {
    $('mp-layers-menu').hidden = !show;
    $('mp-layers-btn').setAttribute('aria-expanded', show ? 'true' : 'false');
  }
  $('mp-layers-btn').addEventListener('click', function () { layersMenu($('mp-layers-menu').hidden); });
  Array.prototype.forEach.call(document.querySelectorAll('#mp-layers .lt-layer-opt'), function (b) {
    b.addEventListener('click', function () { setMode(b.dataset.layer); layersMenu(false); });
  });
  document.addEventListener('click', function (e) { if (!$('mp-layers').contains(e.target)) layersMenu(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') layersMenu(false); });
  // The square size, behind its ℹ️ (S5-P11, M593): a tap shows or hides the words.
  $('mp-info').addEventListener('click', function () {
    var show = $('mp-info-say').hidden;
    $('mp-info-say').hidden = !show;
    this.setAttribute('aria-expanded', show ? 'true' : 'false');
  });

  // Admin Mode turned on or off (S5-P13): Your collections (Measure again)
  // and the Segments list drawn again for it, at once.
  function redraw() { if (mine) drawMine(); drawSegments(); drawSegScreen(); }

  $('seg-select').addEventListener('click', function () { startSelect(app.walkIds ? app.walkIds() : [], false); });
  $('seg-use').addEventListener('click', function () {
    var ids = picked.slice();
    stopSelect();
    if (app.useWalkPlan) app.useWalkPlan(ids);
    app.showAccount();
  });
  $('seg-cancel').addEventListener('click', function () { var back = fromChoose; stopSelect(); if (back) app.showAccount(); });
  $('plans-back').addEventListener('click', stopSelect);
  $('seg-modal-close').addEventListener('click', closeModal);
  $('seg-modal').addEventListener('click', function (e) { if (e.target === $('seg-modal')) closeModal(); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape') { closeModal(); closeMenus(); } });
  document.addEventListener('click', function (e) { if (!(e.target.closest && e.target.closest('.lt-seg-more-wrap'))) closeMenus(); });

  return { open: open, showMine: showMine, inline: inline, showPlan: showPlan, redraw: redraw, showSegments: showSegments };
};
