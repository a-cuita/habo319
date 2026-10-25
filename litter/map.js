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
  var HOME_CELL = '22371_-50369';   // downtown Montgomery
  var SHOW_FIRST = 10;              // collections listed before "Show all"
  var map = null, layer = null, back = null;
  var colours = ['#2c7bb6', '#f6e8c3', '#8c510a'];
  var mine = null, showAll = false;

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
    bar.style.background = 'linear-gradient(to right, ' + colours.join(', ') + ')';
    box.appendChild(bar);
    var marks = el('div', 'lt-legend-marks');
    ['0 · clean', '5', '10 or more · heavy'].forEach(function (t) { marks.appendChild(el('span', null, t)); });
    box.appendChild(marks);
  }

  /* ── The public map ── */

  // opts: { focus: [cells] to show first, back: what Back does, track: a
  // collection's kept GPX track, [[lat, lon], …], drawn as a line }.
  function open(opts) {
    opts = opts || {};
    back = opts.back || null;
    app.notice('');
    app.show('v-map');
    $('mp-note').textContent = 'Loading the map…';
    if (!window.L) { $('mp-note').textContent = 'The map couldn\'t load. Check your signal, then open the page again.'; return Promise.resolve(); }
    if (!map) {
      map = L.map('mp-map', { zoomControl: true, attributionControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
      layer = L.layerGroup().addTo(map);
      var h = G.cellCenter(HOME_CELL);
      map.setView([h.lat, h.lon], 13);
    }
    setTimeout(function () { map.invalidateSize(); }, 0);
    return app.api('mapLoad', {}).then(function (d) {
      colours = d.colours || colours;
      legend($('mp-legend'));
      draw(d.cells || []);
      var focus = (opts.focus || []).length ? opts.focus : (d.cells || []).map(function (x) { return x[0]; });
      fit(focus);
      // The walk's own GPX track, where you walked (S3-P27, Oct 25).
      if (opts.track && opts.track.length > 1) {
        L.polyline(opts.track, { color: '#111827', weight: 3, opacity: 0.85, interactive: false, className: 'lt-track-line' }).addTo(layer);
        map.fitBounds(L.latLngBounds(opts.track), { maxZoom: 17, padding: [16, 16] });
      }
      $('mp-note').textContent = d.cells.length ? (d.cells.length === 1 ? '1 cell has' : d.cells.length.toLocaleString('en-US') + ' cells have') + ' a reading.'
        : 'No collections on the map yet. Cells show here once someone saves a collection.';
    }, function (err) { $('mp-note').textContent = err.message; });
  }

  function draw(cells) {
    layer.clearLayers();
    cells.forEach(function (x) {
      var c = G.indexColour(x[1], colours);
      var r = L.rectangle(G.cellBounds(x[0]), { color: c, weight: 1, opacity: 0.9, fillColor: c, fillOpacity: 0.7 });
      r.bindPopup(function () {
        var box = el('div', 'lt-pop');
        box.appendChild(el('strong', null, 'Litter Index ' + x[1].toFixed(1)));
        box.appendChild(el('div', null, 'Collected ' + day(x[2])));
        if (x[3]) box.appendChild(el('div', null, 'By ' + x[3]));
        return box;
      });
      r.cellId = x[0];
      r.addTo(layer);
    });
  }

  function fit(cells) {
    if (!cells.length) return;
    var b = L.latLngBounds([]);
    cells.forEach(function (c) { b.extend(G.cellBounds(c)); });
    map.fitBounds(b, { maxZoom: 16, padding: [16, 16] });
  }

  /* ── Your collections (item 15) ── */

  function showMine() {
    var box = $('my-collections');
    return app.api('myCollections', { token: app.myToken() }).then(function (d) {
      mine = d;
      colours = d.colours || colours;
      box.hidden = !d.collections.length;
      drawMine();
    }, function (err) {
      if (err.code === 'signed-out') return app.signedOut();
      box.hidden = true;
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
      if (s.index != null) sw.style.background = G.indexColour(s.index, colours);
      li.appendChild(sw);
      li.appendChild(document.createTextNode('Stretch ' + s.n + ': ' + (s.discarded ? 'discarded, no reading' : s.index == null ? 'no reading' : 'Litter Index ' + round(s.index, 1)) +
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
      m.addEventListener('click', function () { open({ focus: cells, back: app.showAccount, track: c.track }); });
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

  /* ── Wiring ── */

  $('mp-back').addEventListener('click', function () { if (back) back(); else app.showStart(); });
  $('my-more').addEventListener('click', function () { showAll = true; drawMine(); });

  return { open: open, showMine: showMine };
};
