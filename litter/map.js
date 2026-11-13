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
  var planColour = '#7c3aed';
  var realSegs = [], simSegs = [], rateTop = 5, mode = 'index', lastCells = [];
  // Visual ratings (S6-U26): everyone's average by square, yours, and the
  // bands for your rating against the Litter Index (settings).
  var ratingsAll = [], ratingsMine = null, bands = { mark: 0.5, slight: 1.5 }, chosen = false;
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
    if (mode === 'diff') {
      // Critical to lenient, on the mark in the middle (|Q702 (b)).
      bar.style.background = 'linear-gradient(to right, ' + DIFF_COLOURS.join(', ') + ')';
      ['Critical', 'On the mark', 'Lenient'].forEach(function (t) { marks.appendChild(el('span', null, t)); });
      box.appendChild(marks);
      return;
    }
    (mode === 'rate' ? ['0', String(round(rateTop / 2, 2)), rateTop + ' or more lb/mi·day⁻¹'] : /^rating/.test(mode) ? ['0 · spotless', '5', '10 · the worst'] : ['0 · clean', '5', '10 or more · heavy'])
      .forEach(function (t) { marks.appendChild(el('span', null, t)); });
    box.appendChild(marks);
  }

  /* ── The public map ── */

  function ensureMap() {
    if (map) return;
    map = L.map('mp-map', { zoomControl: true, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    layer = L.layerGroup().addTo(map);
    // A chosen plan sits above the colour layers (S5-P9, |C685).
    map.createPane('ltPlan').style.zIndex = 450;
    planLayer = L.layerGroup().addTo(map);
    var h = G.cellCenter(HOME_CELL);
    map.setView([h.lat, h.lon], 13);
  }

  function useLoad(d) {
    loaded = d; loadedAt = Date.now();
    if (d.fadeDays) fadeDays = d.fadeDays;
    colours = d.colours || colours;
    dark = d.dark || dark;
    planColour = d.planColour || planColour;
    realSegs = d.segments || [];
    simSegs = d.simSegments || [];
    rateTop = d.rateTop || rateTop;
    ratingsAll = d.ratings || [];
    ratingsMine = d.mine || null;
    bands = d.diffBands || bands;
    chosen = !!d.chosen;
    showRange(d);
    legend($('mp-legend'));
  }

  // A plan's squares outlined, on a layer of its own, so switching layers
  // keeps it (S5-P3, Q517; Oct 31).
  function outlinePlan(cells) {
    if (!planLayer) return;
    planLayer.clearLayers();
    // Around the whole plan, one square out, as a wide see-through band (S5-P9,
    // |Q573, |C700), in the Settings tab's plan colour (|C684).
    var pc = darkColours() ? darkColours().plan : (planColour || '#7c3aed');
    if ((cells || []).length) L.polyline(G.outline(G.grow(cells)), { color: pc, weight: 10, opacity: 0.45, interactive: false, pane: 'ltPlan', className: 'lt-plan-outline' }).addTo(planLayer);
    // Weigh-in pins at each end of every due segment in it (S5-U17, |Q566 (a)).
    G.weighPins(segList(), cells).forEach(function (pin) {
      var at = G.cellCenter(pin.cell);
      L.marker([at.lat, at.lon], { icon: G.pinIcon(), interactive: false, keyboard: false, title: 'Weigh-in location: ' + pin.name }).addTo(planLayer);
    });
  }

  // opts: { focus: [cells] to show first, back: what Back does, track: a
  // collection's kept GPX track, [[lat, lon], …], drawn as a line }.
  function open(opts) {
    opts = opts || {};
    back = opts.back || null;
    app.notice('');
    app.show('v-map');
    onMain = false;
    drawnOnMain = false;   // it draws its own squares, track or plan here (S6-P2)
    planButton();
    $('mp-slot').appendChild($('mp-body'));
    layersMenu(false);
    $('mp-note').textContent = 'Loading the map…';
    if (!window.L) { $('mp-note').textContent = 'The map couldn\'t load. Check your signal, then open the page again.'; return Promise.resolve(); }
    ensureMap();
    setTimeout(function () { map.invalidateSize(); }, 0);
    return app.api('mapLoad', { token: app.myToken ? app.myToken() : '' }).then(function (d) {
      useLoad(d);
      mapsLayers();
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
  // `quick` (S6-P2): back on the main page with nothing written since it
  // loaded: the map as it was, not asked for again or redrawn.
  var drawnOnMain = false;
  function inline(quick) {
    onMain = true;
    if (!quick) setTimeout(function () { drawSmallMaps($('segments-list')); }, 0);
    $('cl-litter-map-slot').appendChild($('mp-body'));
    layersMenu(false);
    if (!window.L) { $('mp-note').textContent = 'The map couldn\'t load. Check your signal, then open the page again.'; return Promise.resolve(); }
    ensureMap();
    setTimeout(function () { map.invalidateSize(); }, 0);
    if (quick && drawnOnMain && loaded) {
      showPlan(app.pickedPlanCells ? app.pickedPlanCells() : []);
      return Promise.resolve();
    }
    // Not the Maps screen's chosen days (S6-U26): the main page keeps to its own range.
    var fresh = loaded && !loaded.chosen && Date.now() - loadedAt < 120000;
    if (!fresh) $('mp-note').textContent = 'Loading the map…';
    return (fresh ? Promise.resolve(loaded) : app.api('mapLoad', { token: app.myToken ? app.myToken() : '' })).then(function (d) {
      useLoad(d);
      mapsLayers();
      lastCells = d.cells || [];
      draw(lastCells);
      drawnOnMain = true;
      showPlan(app.pickedPlanCells ? app.pickedPlanCells() : []);
      $('mp-note').textContent = mode === 'rate' ? $('mp-note').textContent : '';
      if (mode === 'rate') setMode('rate');
    }, function (err) { $('mp-note').textContent = err.message; });
  }

  // The picked plan on the main page's map: outlined, and the map on it.
  // Clear plan from map takes the outline off, to see the squares under it;
  // the plan stays chosen, and a newly chosen plan shows again (|M623).
  var shownPlan = [], planCleared = false, onMain = false;
  function showPlan(planCells) {
    if (!map) return;
    var cells = planCells || [];
    if (cells.join(' ') !== shownPlan.join(' ')) planCleared = false;
    shownPlan = cells.slice();
    outlinePlan(planCleared ? [] : cells);
    planButton();
    var focus = cells.length ? cells : (loaded && loaded.cells || []).map(function (x) { return x[0]; });
    setTimeout(function () { map.invalidateSize(); fit(focus); }, 0);
  }
  function planButton() {
    var b = $('mp-plan-btn');
    b.hidden = !onMain || !shownPlan.length;
    b.textContent = planCleared ? 'Show plan on map' : 'Clear plan from map';
  }

  // A segment's line in a pop-up: its rate, confidence and arrow, and
  // whether it's due or partly cleaned.
  var ARROWS = { up: ' ↑', down: ' ↓', level: ' →' };
  function segmentLine(g) {
    // Fewer words (S5-P10, |C850): the walks behind the rate are in the table under it.
    var rate = g.rate == null && g.median == null ? 'no rate yet' : g.shows === 'Both' ? 'median ' + round(g.median, 2) + ', average ' + round(g.average, 2) + ' lb/mi·day⁻¹'
      : round(g.rate, 2) + ' lb/mi·day⁻¹ ' + g.shows.toLowerCase();
    // Its confidence goes on a line of its own (S6-P34, |C963): confidenceLine.
    return g.name + (g.kind === 'Field' ? ' (field)' : '') + ': ' + rate + (g.due ? ' · Due' : '');
  }
  // "Temporal confidence: Moderate ↑", its words a link to their Wiki page (|C963).
  function confidenceLine(g, cls) {
    var d = el('div', cls || 'lt-pop-conf');
    if (app.wikiLink) d.appendChild(app.wikiLink('confidence', 'Temporal confidence'));
    else d.appendChild(document.createTextNode('Temporal confidence'));
    d.appendChild(document.createTextNode(': ' + g.confidence + (ARROWS[g.arrow] || '')));
    return d;
  }
  // Partly cleaned (Q532): "Partial (NE): 60% of this segment was cleaned 4 days ago".
  function partialLines(g) {
    return (g.groups || []).map(function (p) {
      return 'Partial' + (p.dir ? ' (' + p.dir + ')' : '') + ': ' + p.pct + '% ' +
        (p.days == null ? 'not cleaned yet' : 'cleaned ' + (p.days === 0 ? 'today' : p.days === 1 ? '1 day ago' : p.days + ' days ago'));
    });
  }
  function segmentsAt(cell) { return segList().filter(function (g) { return g.squares.indexOf(cell) !== -1; }); }
  // The walks behind a segment's rate, as a table (S5-P10, |Q624 (a)): Day,
  // By, and the layer's number: each walk's rate on Accumulation rate, or its
  // Litter Index on this square on the Litter Index layer, the same walks on
  // both (|Q625).
  // A square's latest reading, as the same table, one row.
  function latestTable(x) {
    var t = el('table', 'lt-pop-table');
    var head = el('tr');
    ['Day', 'By', 'Litter Index'].forEach(function (h) { head.appendChild(el('th', null, h)); });
    t.appendChild(head);
    var tr = el('tr', 'lt-pop-walk');
    [day(x[2]).replace(/, \d{4}$/, ''), x[3] || '—', Number(x[1]).toFixed(1)].forEach(function (v) { tr.appendChild(el('td', null, v)); });
    t.appendChild(tr);
    return t;
  }
  // A walk that collected a segment gives all of it its reading, whether or
  // not its track crossed the square tapped (S6-P15, |M998): a square it
  // missed reads as the rest of the segment did on that walk.
  function segReading(w, g) {
    var v = g.squares.map(function (c) { return w.idx ? w.idx[c] : null; }).filter(function (n) { return n != null; });
    return v.length ? v.reduce(function (a, b) { return a + Number(b); }, 0) / v.length : null;
  }
  function walksTable(g, cell) {
    var index = cell != null, walks = (g.walks || []).concat((g.noRate || []).map(function (w) { return Object.assign({ none: true }, w); }))
      .sort(function (a, b) { return b.collected - a.collected; });
    if (!walks.length) return null;
    var t = el('table', 'lt-pop-table');
    var head = el('tr');
    ['Day', 'By', index ? 'Litter Index' : 'lb/mi·day⁻¹'].forEach(function (h) { head.appendChild(el('th', null, h)); });
    t.appendChild(head);
    walks.forEach(function (w) {
      var tr = el('tr', 'lt-pop-walk' + (w.none ? ' none' : ''));
      var own = index && w.idx ? w.idx[cell] : null, seg = index && own == null ? segReading(w, g) : null;
      var v = index ? (own != null ? Number(own).toFixed(1) : seg != null ? seg.toFixed(1) : '—') : w.none ? '' : String(round(w.rate, 2));
      [dayWords(w.collected), w.by].forEach(function (x) { tr.appendChild(el('td', null, x)); });
      var last = el('td', null, v);
      // A walk that gave no rate (S6-P34, |Q782 (a)): greyed, "No rate" and
      // a link to the Wiki's page on why, in its line; its reason under it.
      if (w.none) {
        if (v) last.appendChild(document.createTextNode(' · '));
        last.appendChild(document.createTextNode('No rate · '));
        last.appendChild(app.wikiLink ? app.wikiLink('norate', 'Why?') : document.createTextNode('Why?'));
      }
      tr.appendChild(last);
      t.appendChild(tr);
      if (w.none) {
        var why = el('tr', 'lt-pop-why'), td = el('td', null, w.why);
        td.colSpan = 3;
        why.appendChild(td);
        t.appendChild(why);
      }
    });
    return t;
  }

  // A reading fades as it ages, gone after the map's fade days (S6-P1,
  // |Q678): 1 on its day, down evenly to none. A simulated walk's own
  // squares, opened from it, don't fade.
  var fadeDays = 30;
  function fadeOf(x) {
    if (chosen || !x[2] || !/^\d{4}-\d{2}-\d{2}$/.test(String(x[2]))) return 1;   // the days you chose: none fade
    var p = String(x[2]).split('-'), day = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getTime();
    var age = Math.max(0, (Date.now() - day) / 86400000 - 0.5);
    return Math.max(0, 1 - age / fadeDays);
  }
  function draw(cells) {
    layer.clearLayers();
    if (mode === 'rate') return drawRates();
    if (/^rating/.test(mode)) return drawRatings();
    if (mode === 'diff') return drawDiff();
    cells.forEach(function (x) {
      var c = G.indexColour(x[1], scale()), f = fadeOf(x);
      if (!(f > 0)) return;
      var r = L.rectangle(G.cellBounds(x[0]), { color: c, weight: 1, opacity: 0.9 * f, fillColor: c, fillOpacity: 0.7 * f, className: 'lt-index-square' });
      r.bindPopup(function () {
        // One table on every square (S5-P10, |C849): the walks behind its
        // segment's rate, or, with none, the square's latest reading.
        var box = el('div', 'lt-pop'), tables = 0;
        box.appendChild(el('strong', null, 'Litter Index'));
        segmentsAt(x[0]).forEach(function (g) {
          box.appendChild(el('div', 'lt-pop-seg', segmentLine(g)));
          box.appendChild(confidenceLine(g));
          partialLines(g).forEach(function (t) { box.appendChild(el('div', 'lt-pop-part', t)); });
          var tb = walksTable(g, x[0]);
          if (tb) { box.appendChild(tb); tables++; }
        });
        if (!tables) box.appendChild(latestTable(x));
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
          box.appendChild(confidenceLine(g));
          partialLines(g).forEach(function (t) { box.appendChild(el('div', 'lt-pop-part', t)); });
          // The walks that gave its rate, newest first (S5-P10, |M650): who, the day, and that walk's rate.
          var tb = walksTable(g, null);
          if (tb) box.appendChild(tb);
          return box;
        });
        r.addTo(layer);
      });
    });
  }
  // A visual rating layer (S6-U26 item 2): yours, each square your latest
  // rating there; or everyone's average, never by handle (|Q703 (a)).
  function drawRatings() {
    var mineOnly = mode === 'rating-mine', list = mineOnly ? (ratingsMine || []) : ratingsAll;
    list.forEach(function (x) {
      var v = Number(x[1]), c = G.indexColour(v, scale());
      var r = L.rectangle(G.cellBounds(x[0]), { color: c, weight: 1, opacity: 0.9, fillColor: c, fillOpacity: 0.7, className: 'lt-rating-square' });
      r.bindPopup(function () {
        var box = el('div', 'lt-pop');
        box.appendChild(el('strong', null, mineOnly ? 'Your visual rating' : 'Visual rating: everyone\'s average'));
        box.appendChild(el('div', null, mineOnly ? v + ' on ' + day(x[3]) + (x[2] != null ? '; its Litter Index ' + x[2] : '') : v + ', from ' + x[2] + (x[2] === 1 ? ' rating' : ' ratings')));
        return box;
      });
      r.addTo(layer);
    });
    $('mp-note').textContent = list.length ? '' : mineOnly ? 'None of your ratings in these days.' : 'No ratings in these days.';
  }
  // Your rating against the Litter Index (S6-U26 item 3): each square's
  // latest Litter Index minus your rating there, in words. Lenient: you
  // rated it cleaner than it measured; critical: dirtier.
  var DIFF_COLOURS = ['#b91c1c', '#f97316', '#16a34a', '#38bdf8', '#1d4ed8'];
  function diffWords(d) {
    var a = Math.abs(d), side = d > 0 ? 'lenient' : 'critical';
    if (a <= bands.mark) return { words: 'on the mark', colour: DIFF_COLOURS[2] };
    if (a <= bands.slight) return { words: 'slightly ' + side, colour: d > 0 ? DIFF_COLOURS[3] : DIFF_COLOURS[1] };
    return { words: side, colour: d > 0 ? DIFF_COLOURS[4] : DIFF_COLOURS[0] };
  }
  function drawDiff() {
    var list = (ratingsMine || []).filter(function (x) { return x[2] != null; }), sum = 0;
    list.forEach(function (x) {
      var d = round(Number(x[2]) - Number(x[1]), 1), w = diffWords(d);
      sum += d;
      var r = L.rectangle(G.cellBounds(x[0]), { color: w.colour, weight: 1, opacity: 0.9, fillColor: w.colour, fillOpacity: 0.7, className: 'lt-diff-square' });
      r.bindPopup(function () {
        var box = el('div', 'lt-pop');
        box.appendChild(el('strong', null, 'Your rating against the Litter Index'));
        box.appendChild(el('div', null, 'Litter Index ' + x[2] + ', your rating ' + x[1] + ' (' + day(x[3]) + '): ' + (d > 0 ? '+' : '') + d + ', ' + w.words + '.'));
        return box;
      });
      r.addTo(layer);
    });
    if (!list.length) { $('mp-note').textContent = 'None of your rated weighings with a Litter Index in these days.'; return; }
    var avg = round(sum / list.length, 2);
    $('mp-note').textContent = 'On average, over ' + list.length + (list.length === 1 ? ' square' : ' squares') + ': ' + (avg > 0 ? '+' : '') + avg + ', ' + diffWords(avg).words + '.';
  }
  // The days shown, on the Maps screen.
  function showRange(d) {
    if (!$('mp-from')) return;
    $('mp-from').value = d.from || '';
    $('mp-to').value = d.to || '';
    $('mp-range').textContent = d.chosen ? (d.from || d.to ? 'Showing ' + (d.from ? day(d.from) : 'the start') + ' to ' + (d.to ? day(d.to) : 'today') + '.' : 'Showing every day.')
      : 'Showing the last ' + d.fadeDays + ' days, as on the main page, older readings fading.';
  }
  function loadRange(range) {
    $('mp-note').textContent = 'Loading the map…';
    return app.api('mapLoad', Object.assign({ token: app.myToken ? app.myToken() : '' }, range)).then(function (d) {
      useLoad(d);
      lastCells = d.cells || [];
      draw(lastCells);
      if (mode === 'index') $('mp-note').textContent = lastCells.length ? lastCells.length.toLocaleString('en-US') + (lastCells.length === 1 ? ' cell has' : ' cells have') + ' a reading in these days.' : 'No readings in these days.';
    }, function (err) { $('mp-note').textContent = err.message; });
  }
  function ymdOf(ms) { var d = new Date(ms); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  if ($('mp-dates')) {
    var rangeNow = function () { return loadRange({ from: $('mp-from').value, to: $('mp-to').value, all: !$('mp-from').value && !$('mp-to').value }); };
    $('mp-from').addEventListener('change', rangeNow);
    $('mp-to').addEventListener('change', rangeNow);
    Array.prototype.forEach.call(document.querySelectorAll('#mp-dates [data-days]'), function (b) {
      b.addEventListener('click', function () {
        var n = b.dataset.days;
        loadRange(n === 'all' ? { all: true } : { from: ymdOf(Date.now() - (Number(n) - 1) * 86400000), to: ymdOf(Date.now()) });
      });
    });
  }
  // The Maps screen's own layers: not on the main page's map; yours only when signed in.
  function mapsLayers() {
    Array.prototype.forEach.call(document.querySelectorAll('#mp-layers .lt-layer-maps'), function (b) {
      b.hidden = onMain || (b.dataset.layer !== 'rating-all' && !ratingsMine);
    });
    if ((onMain && (/^rating/.test(mode) || mode === 'diff')) || ((mode === 'rating-mine' || mode === 'diff') && !ratingsMine)) setMode('index');
  }

  function setMode(m) {
    mode = m;
    if (map) map.closePopup();
    Array.prototype.forEach.call(document.querySelectorAll('#mp-layers .lt-layer-opt'), function (b) {
      b.classList.toggle('on', b.dataset.layer === m);
      b.setAttribute('aria-pressed', b.dataset.layer === m ? 'true' : 'false');
    });
    legend($('mp-legend'));
    infoWords();
    if (layer) draw(lastCells);
    var n = segList().length;
    // The rating layers say their own (S6-U26).
    if (m === 'rate') $('mp-note').textContent = n ? n + ' accepted segment' + (n === 1 ? '' : 's') + '. Tap one for its rate.' : 'No accepted segments yet.';
    else if (m === 'index') $('mp-note').textContent = '';
  }

  // The ℹ️'s words for the layer showing (|C671): what a square's colour means.
  var SQUARE_SIZE = 'Each square is 1/160 of a mile (about 33 ft) on a side.';
  var COLOUR_WORDS = {
    'rating-mine': 'A square\'s colour is your latest visual rating there, in the days shown: 0 spotless to 10 the worst you\'ve seen. Only you see yours.',
    'rating-all': 'A square\'s colour is everyone\'s visual ratings there, averaged, in the days shown. No one\'s rating shows by name.',
    diff: 'A square\'s colour is its Litter Index minus your visual rating there. Green: on the mark. Blue: lenient, you rated it cleaner than it measured. Orange and red: critical, you rated it dirtier. Tap a square for its numbers.',
    index: 'A square\'s colour is its latest Litter Index: the pounds collected there, for the miles walked and the time it took. Tap a square for its reading, the day it was collected, and who collected it.',
    rate: 'Only public segments are coloured. A square\'s colour is its segment\'s accumulation rate: the pounds of litter that build up on each mile of it each day. A field\'s miles are the walk it takes to scan all of it. Some of it may be litter that was hidden last time, under leaves or in the grass. Grey: no recent rate. Tap a square for its segment\'s rate and the walks that gave it.'
  };
  function infoWords() {
    var t = COLOUR_WORDS[mode] || COLOUR_WORDS.index;
    $('mp-info-colour').textContent = t;
    $('mp-info').title = SQUARE_SIZE + ' ' + t;
  }

  function fit(cells) {
    if (!cells.length) return;
    var b = L.latLngBounds([]);
    cells.forEach(function (c) { b.extend(G.cellBounds(c)); });
    map.fitBounds(b, { maxZoom: 16, padding: [16, 16] });
  }

  /* ── Your collections (item 15) ── */

  // Turning Admin Mode on or off redraws the list (S5-P10, |M798).
  $('cl-sim').addEventListener('change', function () { setTimeout(drawMine, 0); });

  function showMine() {
    return app.api('myCollections', { token: app.myToken() }).then(function (d) {
      mine = d;
      timeBonus = d.timeBonus || timeBonus;
      aloneBonus = d.aloneBonus || aloneBonus;
      colours = d.colours || colours;
      dark = d.dark || dark;
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

  // Simulated walks only in Admin Mode (S5-P10, |M798): never alongside
  // real ones in Player mode.
  function drawMine() {
    if (!mine) return;
    var list = $('my-list');
    list.textContent = '';
    var admin = !!(app.builderMode && app.builderMode());
    var cols = mine.collections.filter(function (c) { return admin || !c.simulated; });
    $('my-none').hidden = !!cols.length;
    if (!cols.length) $('my-none').textContent = 'No collections yet.';
    (showAll ? cols : cols.slice(0, SHOW_FIRST)).forEach(function (c) { list.appendChild(collectionItem(c)); });
    setTimeout(function () { drawSmallMaps(list); }, 0);
    $('my-more').hidden = showAll || cols.length <= SHOW_FIRST;
    $('my-more').textContent = 'Show all ' + cols.length;
  }

  // Compact (S6-P28, |M963, |Q715 (a)): a walk is two short lines, its day,
  // times and XP, then its pounds, miles and a dot for each weighing, with
  // its small map beside them; its actions are in its ⋯. Tap its lines and
  // everything else opens in place under them; tap again to close.
  function collectionItem(c) {
    // A simulated walk is striped like the Build Board's test cards (S5-U2, |C697).
    var box = el('div', 'lt-col lt-col-compact' + (c.simulated ? ' lt-sim-walk' : ''));
    box.id = 'my-' + c.id;
    if (c.simulated) box.appendChild(el('p', 'lt-sim-label', 'Simulated walk'));
    var top = el('div', 'lt-col-top');
    var lines = el('div', 'lt-col-lines');
    lines.setAttribute('role', 'button');
    lines.tabIndex = 0;
    lines.setAttribute('aria-expanded', 'false');
    lines.title = 'Show everything about this walk';
    lines.appendChild(el('p', 'lt-col-head', shortWhen(c.started, c.ended) + (c.xp ? ' · +' + round(c.xp, 2) + ' XP' : '')));
    var short = el('p', 'lt-col-facts lt-col-short', round(c.pounds, 2) + ' lb · ' + round(c.miles, 2) + ' mi');
    var dots = el('span', 'lt-col-dots');
    c.stretchList.forEach(function (s) {
      var sw = el('span', 'lt-swatch lt-col-dot' + (s.index == null ? ' none' : ''));
      if (s.index != null) sw.style.background = G.indexColour(s.index, scale());
      sw.title = 'Weighing ' + s.n + ': ' + (s.discarded ? 'discarded' : s.index == null ? 'no reading' : 'Litter Index ' + round(s.index, 1));
      dots.appendChild(sw);
    });
    short.appendChild(dots);
    lines.appendChild(short);
    top.appendChild(lines);
    var cells = [];
    c.stretchList.forEach(function (s) { if (!s.discarded) s.cells.forEach(function (x) { if (cells.indexOf(x) === -1) cells.push(x); }); });
    if (cells.length) {
      // Its small map, smaller, at the right; tapped, it opens large, as before (S5-P11, |C691).
      var colourOf = {};
      c.stretchList.forEach(function (s) { if (!s.discarded) s.cells.forEach(function (x) { colourOf[x] = s.index == null ? '#9ca3af' : G.indexColour(s.index, scale()); }); });
      top.appendChild(smallMap(when(c.started), cells, { kind: 'walk', track: c.track, colourOf: colourOf }));
    }
    var actions = walkActions(c);
    if (actions.length) top.appendChild(walkMenu(c, actions));
    box.appendChild(top);
    // Everything else, folded away until its lines are tapped (|Q715 (a)).
    var more = el('div', 'lt-col-more');
    more.hidden = true;
    more.appendChild(el('p', 'lt-col-facts', Math.round(c.active) + ' min active · ' + c.hours + ' volunteer hour' + (c.hours === 1 ? '' : 's')));
    if (c.hoursNote) more.appendChild(el('p', 'muted small', c.hoursNote));
    // Its XP, line by line (S6-U25 item 4, |M904): here, not behind Fix it.
    var xp = c.xpParts;
    if (xp && !c.simulated) {
      var xb = el('div', 'lt-walk-xp lt-col-xp');
      xb.appendChild(el('p', 'lt-walk-xp-head', 'Its XP'));
      if (!xp.counts) xb.appendChild(el('p', 'small', 'XP comes once your GPX track is saved.'));
      else {
        var xl = el('ul', 'lt-walk-xp-lines');
        [['Planning it', xp.plan], ['Your ratings', xp.ratings], ['Litter types', xp.types]].concat(xp.mult > 1 ? [[(xp.kind === 'alone' ? 'Left-alone bonus' : 'Time bonus') + ' (×' + xp.mult + ')', xp.bonus]] : [])
          .forEach(function (r) { var li = el('li'); li.appendChild(document.createTextNode(r[0])); li.appendChild(el('span', 'lt-walk-xp-n', '+' + round(r[1], 2))); xl.appendChild(li); });
        xb.appendChild(xl);
        xb.appendChild(el('p', 'lt-walk-xp-total', 'Total: ' + round(c.xp, 2) + ' XP'));
      }
      more.appendChild(xb);
    }
    var ul = el('ul', 'lt-col-stretches');
    c.stretchList.forEach(function (s) {
      var li = el('li');
      var sw = el('span', 'lt-swatch' + (s.index == null ? ' none' : ''));
      if (s.index != null) sw.style.background = G.indexColour(s.index, scale());
      li.appendChild(sw);
      li.appendChild(document.createTextNode('Weighing ' + s.n + ': ' + (s.discarded ? 'discarded, no reading' : s.index == null ? (s.noReading ? 'No Litter Index: ' + s.noReading : 'no reading') : 'Litter Index ' + round(s.index, 1)) +
        (s.rating == null ? '' : ' · Visual rating ' + s.rating)));
      ul.appendChild(li);
    });
    more.appendChild(ul);
    if (c.track && c.track.length > 1) more.appendChild(el('p', 'muted small', 'Your GPX track is saved: its small map shows it.'));
    box.appendChild(more);
    var flip = function () {
      more.hidden = !more.hidden;
      lines.setAttribute('aria-expanded', more.hidden ? 'false' : 'true');
      box.classList.toggle('lt-col-open', !more.hidden);
    };
    lines.addEventListener('click', flip);
    lines.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); flip(); } });
    // A walk staff took off the public map still says so, unfolded.
    if (c.hidden) box.appendChild(el('p', 'lt-col-hidden', 'HABO\'s staff have taken this collection off the public map. It\'s still kept, with your hours.'));
    return box;
  }

  // "Fri, Nov 6 · 10:02 to 10:19 AM" (S6-P28 line 1): the year only when it isn't this one.
  function shortWhen(a, b) {
    var d = new Date(a), thisYear = new Date().getFullYear() === d.getFullYear();
    var day = d.toLocaleDateString('en-US', thisYear ? { weekday: 'short', month: 'short', day: 'numeric' } : { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' });
    var t = function (ms) { return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); };
    if (!b) return day + ' · ' + t(a);
    var ta = t(a), tb = t(b), ma = ta.slice(-2), mb = tb.slice(-2);
    return day + ' · ' + (ma === mb ? ta.slice(0, -3) : ta) + ' to ' + tb;
  }

  // A walk's actions, for its ⋯ (S6-P28 item 4): Share and Fix it, and in
  // Admin Mode Measure again and, on a simulated walk, Share with the other admins.
  function walkActions(c) {
    var out = [];
    // Measure again (Oct 31, field first): its segment rates worked out again,
    // with the Settings and each segment's Kind as they are now. A Head
    // Builder's, only while Admin Mode is on (S5-P13, Q555, Q564).
    if (c.track && c.track.length > 1 && app.builderMode && app.builderMode()) {
      var ma = el('button', 'lt-seg-menu-item lt-col-measure', 'Measure again');
      ma.type = 'button';
      ma.addEventListener('click', function () {
        closeMenus();
        ma.disabled = true;
        app.api('measureAgain', { token: app.myToken(), collectionId: c.id }).then(function (d) {
          ma.disabled = false;
          realSegs = d.segments || realSegs;
          simSegs = d.simSegments || simSegs;
          drawSegments();
          app.notice(d.measured.length ? 'Measured again: ' + d.measured.map(function (x) { return x.name + ' ' + round(x.rate, 2); }).join(', ') + ' lb/mi·day⁻¹.'
            : 'Measured again: no segment rate from this walk.');
        }, function (err) { ma.disabled = false; if (err.code === 'signed-out') return app.signedOut(); app.notice(err.message); });
      });
      out.push(ma);
    }
    // Share the walk as a picture (S6-P5): one with its GPX track, not a simulated one.
    if (window.LitterShare && c.track && c.track.length > 1 && !c.simulated) {
      var sh = el('button', 'lt-seg-menu-item lt-col-share', window.LitterShare.label());
      sh.type = 'button';
      sh.addEventListener('click', function () {
        closeMenus();
        var me = app.me && app.me();
        sh.disabled = true;
        // Each segment it collected, with its rate, for the picture's rate colours (S6-P5, |M1048).
        var on = {};
        (c.stretchList || []).forEach(function (st) { if (!st.discarded) (st.cells || []).forEach(function (x) { on[x] = true; }); });
        var segRates = realSegs.filter(function (g) { return g.squares.some(function (x) { return on[x]; }); }).map(function (g) { return { cells: g.squares, rate: g.rate == null ? null : g.rate }; });
        window.LitterShare.walkPicture({ started: c.started, ended: c.ended, pounds: c.pounds, miles: c.miles, track: c.track, stretches: c.stretchList || [],
          handle: me ? me.handle : '', level: app.levelNow ? app.levelNow() : null, colours: colours, segRates: segRates })
          .then(function (how) { sh.disabled = false; if (how === 'downloaded') app.notice('Your walk\'s picture is downloaded.'); },
            function (err) { sh.disabled = false; app.notice(err.message || 'The picture couldn\'t be shared.'); });
      });
      out.push(sh);
    }
    if (c.editable) {
      var f = el('button', 'lt-seg-menu-item lt-col-fix', 'Fix it (until ' + when(c.editableUntil) + ')');
      f.type = 'button';
      f.addEventListener('click', function () { closeMenus(); app.openSummary(c.id, f); });
      out.push(f);
    }
    // Your simulated walks are your own until you share them (S5-U2, |M665).
    if (c.simulated) {
      var share = el('label', 'lt-seg-menu-item lt-sim-share');
      var cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = !!c.shared;
      share.appendChild(cb);
      share.appendChild(document.createTextNode(' Share with the other admins'));
      cb.addEventListener('change', function () {
        cb.disabled = true;
        app.api('simShare', { token: app.myToken(), collectionId: c.id, shared: cb.checked }).then(function () {
          cb.disabled = false;
          c.shared = cb.checked;
          app.notice(cb.checked ? 'Shared with the other admins.' : 'No longer shared: only you see it.');
        }, function (err) { cb.disabled = false; cb.checked = !cb.checked; if (err.code === 'signed-out') return app.signedOut(); app.notice(err.message); });
      });
      out.push(share);
    }
    return out;
  }
  function walkMenu(c, actions) {
    var wrap = el('div', 'lt-seg-more-wrap lt-col-more-wrap');
    var b = el('button', 'lt-seg-more lt-col-more-btn', '⋯');
    b.type = 'button';
    b.setAttribute('aria-label', 'More for the walk of ' + when(c.started));
    b.setAttribute('aria-expanded', 'false');
    var menu = el('div', 'lt-seg-menu lt-col-menu');
    menu.hidden = true;
    actions.forEach(function (a) { menu.appendChild(a); });
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = menu.hidden;
      closeMenus();
      menu.hidden = !open;
      b.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    menu.addEventListener('click', function (e) { e.stopPropagation(); });
    wrap.appendChild(b);
    wrap.appendChild(menu);
    return wrap;
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
    // A private segment HABO's staff accepted is listed once, as a public
    // segment, marked as yours (|C660).
    var privates = myPlansList.filter(function (p) { return !(p.segment && p.segment.accepted); });
    var submitted = {};
    myPlansList.forEach(function (p) { if (p.segment && p.segment.accepted) submitted[p.segment.id] = p.segment; });
    $('plans-none').hidden = !!privates.length;
    $('plans-count').textContent = '(' + privates.length + ')';
    $('public-none').hidden = !!pubs.length;
    $('public-count').textContent = '(' + pubs.length + ')';
    privates.forEach(function (p) {
      var facts = p.cells.length + ' square' + (p.cells.length === 1 ? '' : 's') + ' · ' + round(p.miles, 2) + ' mi · ' +
        (p.used ? 'collected ' + (p.used === 1 ? 'once' : p.used + ' times') + (p.lastUsed ? ', last ' + dayWords(p.lastUsed) : '') : 'not collected yet');
      var box = segCard({ id: p.id, kind: 'private', name: app.planLabel(p), cells: p.cells, facts: facts, plan: p });
      if (p.segment) box.appendChild(el('p', 'lt-plan-seg', p.segment.accepted ? 'Public segment ' + p.segment.id + ': ' + p.segment.name
        : p.segment.declined ? 'Not made public (' + p.segment.id + ')' + (p.segment.review && p.segment.review.note ? ': ' + p.segment.review.note.replace(/[.!?]+\s*$/, '') : '') + '. You can submit it again.'
        : 'Submitted as a public segment (' + p.segment.id + ': ' + p.segment.name + '), waiting for HABO\'s staff'));
      mineBox.appendChild(box);
    });
    pubs.forEach(function (g) {
      var facts = (g.kind === 'Field' ? 'Field' : 'Path') + ' · ' + g.squares.length + ' squares · ' + round(g.miles, 2) + ' mi · ' +
        (g.days == null ? 'not cleaned yet' : 'last cleaned ' + (g.days < 1 ? 'less than a day ago' : round(g.days, 1) + ' days ago'));
      var box = segCard({ id: g.id, kind: 'public', name: g.name, cells: g.squares, facts: facts });
      var mine = submitted[g.id];
      if (mine) box.appendChild(el('p', 'lt-plan-seg', 'Submitted by you' + (mine.proposed ? ' on ' + new Date(mine.proposed).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '')));
      // A field's corners drawn again, by a Head Builder in Admin Mode (S5-P13 part 2).
      if (g.kind === 'Field' && app.builderMode && app.builderMode() && !selecting) box.appendChild(redrawButton(g, box));
      pubBox.appendChild(box);
    });
    $('my-plans').classList.toggle('selecting', selecting);
    $('seg-select').hidden = selecting;
    $('seg-select-say').hidden = !selecting;
    showBar();
    // The small maps and the street names only while the screen is open.
    if (!$('v-plans').hidden) { setTimeout(drawThumbs, 0); describeStreets(); }
  }

  function redrawButton(g, box) {
    var b = el('button', 'btn btn-secondary lt-field-redraw', 'Draw this field again');
    b.type = 'button';
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      if (box.querySelector('.lt-redraw')) return;
      var f = el('div', 'lt-redraw lt-propose');
      var drawer = cornerDrawer(g.squares, g.outline || []);
      f.appendChild(drawer.box);
      var save = el('button', 'btn btn-primary lt-redraw-save', 'Save'), no = el('button', 'btn btn-secondary lt-redraw-cancel', 'Cancel');
      save.type = 'button'; no.type = 'button';
      no.addEventListener('click', function () { f.parentNode.removeChild(f); b.hidden = false; });
      save.addEventListener('click', function () {
        var corners = drawer.corners();
        if (corners.length < 3) return app.notice('Tap at least 3 corners of the field on the map first.');
        save.disabled = true;
        app.api('fieldOutline', { token: app.myToken(), segmentId: g.id, outline: corners }).then(function (d) {
          realSegs = d.segments || realSegs;
          simSegs = d.simSegments || simSegs;
          drawSegScreen();
          drawSegments();
          app.notice(g.name + ' is drawn again, with ' + corners.length + ' corners. Every walk\'s rates were measured again on its new ground.');
        }, function (err) { save.disabled = false; if (err.code === 'signed-out') return app.signedOut(); app.notice(err.message); });
      });
      f.appendChild(save); f.appendChild(no);
      b.hidden = true;
      box.appendChild(f);
      drawer.open();
    });
    return b;
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
    if (!p.segment || p.segment.declined) {
      var s = el('button', 'lt-seg-menu-item lt-plan-propose', 'Submit as Public Segment');
      s.type = 'button';
      s.addEventListener('click', function () { closeMenus(); submitForm(p, box); });
      if (app.gate) app.gate(s, 'submit');   // a Litter Class Skill (S5-P29)
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

  /* ── A field's corners (S5-P13 part 2, |Q600 (a)) ── */

  // A map to tap a field's corners on, in order around it; the shape closes
  // itself. `guide`: squares shown faintly to draw around; `start`: corners
  // already drawn. Returns { box, open, corners }.
  function cornerDrawer(guide, start) {
    var box = el('div', 'lt-corners');
    box.appendChild(el('p', 'small', 'Tap each corner of the field on the map, in order around it. The shape closes itself.'));
    var div = el('div', 'lt-corners-map');
    box.appendChild(div);
    var row = el('div', 'lt-corners-row');
    var undo = el('button', 'btn btn-secondary lt-corners-undo', 'Undo corner'), clear = el('button', 'btn btn-secondary lt-corners-clear', 'Clear');
    undo.type = 'button'; clear.type = 'button';
    row.appendChild(undo); row.appendChild(clear);
    box.appendChild(row);
    var count = el('p', 'muted small lt-corners-count', '');
    box.appendChild(count);
    var corners = (start || []).map(function (c) { return [c[0], c[1]]; }), m = null, shape = null, dots = null;
    var colour = darkColours() ? darkColours().plan : '#0e7490';
    function redraw() {
      count.textContent = !corners.length ? 'No corners yet.' : corners.length + (corners.length === 1 ? ' corner' : ' corners') + (corners.length < 3 ? ': 3 or more make a field.' : '.');
      undo.disabled = clear.disabled = !corners.length;
      if (!m) return;
      dots.clearLayers();
      if (shape) { shape.remove(); shape = null; }
      if (corners.length >= 3) shape = L.polygon(corners, { color: colour, weight: 3, fillColor: colour, fillOpacity: 0.25, interactive: false, className: 'lt-corners-shape' }).addTo(m);
      else if (corners.length === 2) shape = L.polyline(corners, { color: colour, weight: 3, interactive: false }).addTo(m);
      corners.forEach(function (c) { L.circleMarker(c, { radius: 6, color: colour, weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false, className: 'lt-corner' }).addTo(dots); });
    }
    function open() {
      if (m || !window.L || !div.offsetWidth) return;
      m = L.map(div, { attributionControl: false });
      L.tileLayer(TILES, { maxZoom: 19 }).addTo(m);
      var b = L.latLngBounds([]);
      (guide || []).forEach(function (c) {
        L.rectangle(G.cellBounds(c), { stroke: false, fillColor: '#6b7280', fillOpacity: 0.25, interactive: false, className: 'lt-corners-guide' }).addTo(m);
        b.extend(G.cellBounds(c));
      });
      corners.forEach(function (c) { b.extend(c); });
      dots = L.layerGroup().addTo(m);
      if (b.isValid()) m.fitBounds(b, { maxZoom: 19, padding: [20, 20] }); else m.setView([32.3668, -86.3], 16);
      m.on('click', function (e) { if (corners.length >= 60) return; corners.push([e.latlng.lat, e.latlng.lng]); redraw(); });
      redraw();
    }
    undo.addEventListener('click', function () { corners.pop(); redraw(); });
    clear.addEventListener('click', function () { corners = []; redraw(); });
    redraw();
    return { box: box, open: function () { setTimeout(open, 0); }, corners: function () { return corners.slice(); } };
  }

  // Submit as Public Segment: its name, and Path or Field (Oct 31, field
  // first); a field's corners drawn on a map (S5-P13 part 2).
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
    // A private segment drawn as a field brings its corners: Field is chosen,
    // and its shape is there to submit as it is (S5-P19, |C788).
    var drawn = p.kind === 'Field' && (p.outline || []).length >= 3;
    var drawer = cornerDrawer(p.cells, drawn ? p.outline : []);
    if (drawn) sel.value = 'Field';
    drawer.box.hidden = !drawn;
    f.appendChild(drawer.box);
    if (drawn) drawer.open();
    sel.addEventListener('change', function () { drawer.box.hidden = sel.value !== 'Field'; if (sel.value === 'Field') drawer.open(); });
    var go = el('button', 'btn btn-primary lt-propose-go', 'Submit'), no = el('button', 'btn btn-secondary lt-propose-cancel', 'Cancel');
    go.type = 'button'; no.type = 'button';
    no.addEventListener('click', function () { f.parentNode.removeChild(f); });
    go.addEventListener('click', function () {
      var corners = sel.value === 'Field' ? drawer.corners() : [];
      if (sel.value === 'Field' && corners.length < 3) return app.notice('Tap at least 3 corners of the field on the map first.');
      go.disabled = true;
      app.api('segmentPropose', { token: app.myToken(), planId: p.id, name: inp.value, kind: sel.value, outline: corners }).then(function (d) {
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

  // A small map, tapped to open larger (S5-P11, |C691): The Priority Segment
  // List and Your collections, as on the Segments screen. opts: { kind:
  // 'public' | 'walk', track: [[lat, lon], …], colourOf: { square: colour } }.
  function smallMap(title, cells, opts) {
    var div = el('div', 'lt-seg-thumb lt-small-map');
    div.setAttribute('role', 'button');
    div.setAttribute('aria-label', 'See ' + title + ' on a larger map');
    div.tabIndex = 0;
    div._cells = cells;
    div._opts = opts || {};
    var go = function () { openModal(title, cells, div._opts.kind, div._opts); };
    div.addEventListener('click', function (e) { e.stopPropagation(); go(); });
    div.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); go(); } });
    return div;
  }
  function squaresOn(m, cells, opts, weight) {
    var b = L.latLngBounds([]);
    var base = opts.kind === 'public' ? '#0e7490' : opts.kind === 'walk' ? '#c2410c' : (darkColours() ? darkColours().plan : '#7c3aed');
    cells.forEach(function (c) {
      var col = (opts.colourOf && opts.colourOf[c]) || base;
      L.rectangle(G.cellBounds(c), { color: col, weight: weight, fillColor: col, fillOpacity: 0.45, interactive: false, className: 'lt-modal-square' }).addTo(m);
      b.extend(G.cellBounds(c));
    });
    if (opts.track && opts.track.length > 1) {
      G.trackRuns(opts.track).forEach(function (run) { L.polyline(run.pts, { color: '#111827', weight: 2, opacity: run.paused ? 0.4 : 0.85, interactive: false, className: 'lt-modal-track' }).addTo(m); });
      opts.track.forEach(function (p) { b.extend([p[0], p[1]]); });
    }
    return b;
  }
  function drawSmallMaps(root) {
    if (!window.L || !root) return;
    Array.prototype.forEach.call(root.querySelectorAll('.lt-small-map'), function (div) {
      if (div._map || !div.offsetWidth) return;
      var m = L.map(div, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false,
        boxZoom: false, keyboard: false, touchZoom: false, tap: false });
      L.control.attribution({ prefix: false }).addAttribution('&copy; OpenStreetMap').addTo(m);
      L.tileLayer(TILES, { maxZoom: 19 }).addTo(m);
      var b = squaresOn(m, div._cells || [], div._opts || {}, 1);
      if (b.isValid()) m.fitBounds(b, { maxZoom: 17, padding: [8, 8] });
      div._map = m;
    });
  }

  // A segment's map, larger, over the page.
  function openModal(title, cells, kind, opts) {
    $('seg-modal-title').textContent = title;
    $('seg-modal').hidden = false;
    if (!window.L) return;
    if (!modalMap) {
      modalMap = L.map('seg-modal-map', { zoomControl: true, attributionControl: true });
      L.tileLayer(TILES, { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(modalMap);
      modalLayer = L.layerGroup().addTo(modalMap);
    }
    modalLayer.clearLayers();
    var b = squaresOn(modalLayer, cells, Object.assign({ kind: kind }, opts || {}), 2);
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
    // A private segment since accepted is ticked as its public one (|C660).
    picked = [];
    (ids || []).forEach(function (id) {
      var p = myPlansList.filter(function (x) { return x.id === id; })[0];
      var to = p && p.segment && p.segment.accepted ? p.segment.id : id;
      if (picked.indexOf(to) === -1) picked.push(to);
    });
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

  // One short line each (S5-P13, |Q599 (a)), with the longer words behind its ℹ️.
  var sortBy = 'need', here = null;
  function needOf(g) {
    if (g.finish) return 'finish';
    if (g.days == null) return 'never';
    if (g.past) return 'reset';
    if (g.due) return 'due';
    return '';
  }
  function leftWords(g) { return g.left < 1 ? 'less than a day left' : round(g.left, 1) + ' days left'; }
  // The time bonus if it's collected now (S6-P3 item 5, |Q679): from a day
  // after its clock started, the most, coming down to none by its last day.
  var timeBonus = null, aloneBonus = null;
  // The left-alone bonus (S6-P3 item 4, |Q690 (a)): none of its squares
  // collected by anyone for the setting's days, or ever.
  function aloneMult(g) {
    var a = aloneBonus;
    if (!a || !(a.days > 0) || !(a.mult > 1)) return 1;
    return g.alone == null || g.alone >= a.days ? a.mult : 1;
  }
  function timeMult(g) {
    var t = timeBonus, d = g.days;
    if (!t || d == null || !(d >= 1) || !(t.ends > 1) || d >= t.ends) return 1;
    return Math.round((t.peak - (t.peak - 1) * (d - 1) / (t.ends - 1)) * 100) / 100;
  }
  function needLine(g, need) {
    var m = Math.max(need === 'due' ? timeMult(g) : 1, aloneMult(g)), now = m > 1 ? ' · ×' + m + ' XP now' : '';
    return need === 'finish' ? 'Finish it · ' + g.finish + '% cleaned · ' + Math.max(1, Math.round(g.finishLeft || 0)) + ' h left' + now
      : need === 'due' ? 'Due · ' + leftWords(g) + now
      : need === 'reset' ? 'Rate Reset · collect to restart' + now
      : need === 'never' ? 'Not cleaned yet' + now : '';
  }
  function needWhy(g, need) {
    return need === 'finish' ? 'Part of it was cleaned in the last day. Collect the rest within ' + Math.max(1, Math.round(g.finishLeft || 0)) + ' hours and the pieces add up to one full collection.'
      : need === 'due' ? 'Collect all of it in the next ' + leftWords(g).replace(' left', '') + ', and your walk measures its rate: the pounds since its clock started, for its miles, over those days. A walk under 24 hours after the clock started adds its pounds to the next rate instead.'
      : need === 'reset' ? 'More than a week since its clock started, so collecting it now starts the clock again, with no rate. The walk after that measures one.'
      : need === 'never' ? 'No walk has collected all of it yet. The first one starts its clock.' : '';
  }
  // Metres from where the phone is to the segment's nearest square.
  function awayOf(g) {
    var me = G.xy(here.lat, here.lon);
    return g.squares.reduce(function (m, sq) { return Math.min(m, G.dist(me, G.centerXY(sq))); }, Infinity);
  }
  function drawSegments() {
    var list = $('segments-list');
    list.textContent = '';
    var rank = { due: 0, finish: 0, reset: 1, never: 2 };
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
    // In Admin Mode, the list is your simulated world (S5-P10, |Q570 (a); S5-U2).
    $('segments-admin').hidden = !(app.builderMode && app.builderMode());
    $('segments-none').hidden = !!all.length;
    all.forEach(function (g) {
      var need = needOf(g);
      var box = el('div', 'lt-plan-item lt-seg-item' + (need === 'finish' ? ' partly' : need === 'due' ? ' due' : need === 'reset' ? ' past' : ''));
      box.id = 'seg-' + g.id;
      // Its kind, Path or Field (Oct 31, field first).
      box.appendChild(el('p', 'lt-col-head', g.name + ' · ' + (g.kind === 'Field' ? 'Field' : 'Path') + ' · ' + round(g.miles, 2) + ' mi'));
      var line = el('div', 'lt-seg-need-row');
      line.appendChild(el('p', 'lt-seg-need', needLine(g, need)));
      var info = el('button', 'lt-info', 'ℹ️');
      info.type = 'button';
      info.setAttribute('aria-label', 'About ' + g.name);
      info.setAttribute('aria-expanded', 'false');
      line.appendChild(info);
      box.appendChild(line);
      if (sortBy === 'near' && here) box.appendChild(el('p', 'muted small lt-seg-away', round(g.away / G.MILE_M, 2) + ' mi away'));
      // Behind the ℹ️: what the line means, its rate, when it was last fully collected, and its parts.
      var more = el('div', 'lt-seg-more');
      more.hidden = true;
      more.appendChild(el('p', 'small', needWhy(g, need)));
      if (aloneMult(g) > 1 && !(need === 'due' && timeMult(g) >= aloneMult(g))) more.appendChild(el('p', 'small', (g.alone == null ? 'Nobody has collected any of it yet' : 'Nobody has collected any of it in ' + Math.floor(g.alone) + ' days')
        + ', so a walk that collects it now earns the left-alone bonus: ×' + aloneMult(g) + ' on its rating and litter-type XP.'));
      more.appendChild(el('p', 'small', segmentLine(g).replace(/^[^:]*: /, '')));
      more.appendChild(confidenceLine(g, 'small lt-pop-conf'));
      if (g.days != null) more.appendChild(el('p', 'muted small', 'Its clock started ' + (g.days < 1 ? 'less than a day' : round(g.days, 1) + ' days') + ' ago.'));
      partialLines(g).forEach(function (t) { more.appendChild(el('p', 'lt-plan-seg', t)); });
      // How the rate is worked out, in the Wiki (S6-P9, |Q665 (a)).
      if (app.wikiLink) more.appendChild(app.wikiLink('rate'));
      box.appendChild(more);
      info.addEventListener('click', function (e) { e.stopPropagation(); more.hidden = !more.hidden; info.setAttribute('aria-expanded', String(!more.hidden)); });
      // Its small map, tapped to open larger (S5-P11, |C691), in place of See it on the map.
      box.appendChild(smallMap(g.name, g.squares, { kind: 'public' }));
      list.appendChild(box);
    });
    setTimeout(function () { drawSmallMaps(list); }, 0);
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
  $('mp-plan-btn').addEventListener('click', function () {
    planCleared = !planCleared;
    outlinePlan(planCleared ? [] : shownPlan);
    planButton();
  });
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
  function redraw() { if (mine) drawMine(); drawSegments(); drawSegScreen(); outlinePlan(planCleared ? [] : shownPlan); }

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

  // A skill's place, captured and waiting to be sent (S6-P8, |Q668): a pending pin on this map, when it's the one in view.
  var pending = null;
  function pendingPin(lat, lon, label) {
    if (pending) { pending.remove(); pending = null; }
    if (lat == null || !map || !map.getContainer().offsetParent) return false;
    pending = L.marker([lat, lon], { icon: L.divIcon({ className: 'lt-pending-pin', html: '<span>📍</span>', iconSize: [30, 30], iconAnchor: [15, 28] }), title: (label || 'A place') + ', waiting to be sent' }).addTo(map);
    map.panTo([lat, lon]);
    return true;
  }

  return { open: open, showMine: showMine, inline: inline, showPlan: showPlan, redraw: redraw, showSegments: showSegments, smallMap: smallMap, drawSmallMaps: drawSmallMaps, pendingPin: pendingPin };
};
