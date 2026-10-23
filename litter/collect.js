// Collecting on the litter page (S3-P21, the litter class's step 2): Start,
// litter pulses, Pause and Resume, Discard this stretch, End, and the summary
// with its fixes and a recorder's GPX file. The phone keeps the collection as
// it goes, so a litter pulse works with no signal; each stretch waits in a
// queue until it reaches HABO (Q242, Q255), and closing the page doesn't end
// a collection (Q282). Step 3 (S3-P22): the summary's map of its readings,
// and the break question after 10 collections (item 7). Load geo.js and
// Leaflet first; litter.js calls LitterCollect(app) with its helpers.
window.LitterCollect = function (app) {
  'use strict';

  var G = window.LitterGeo;
  var $ = app.$;
  var KEY = 'habo-litter-collect';
  var STREETS_KEY = 'habo-litter-streets';
  var OVERPASS = 'https://overpass-api.de/api/interpreter';
  var ROUGH_M = G.CELL_M / 2;   // a location rougher than half a cell is asked to be tapped (Q313)
  var HOME_CELL = '22371_-50369';   // downtown Montgomery: where sunset is reckoned with no collection going

  var c = load(KEY);            // the collection on this phone, or null
  var streets = null, streetsBox = null;
  var map = null, layers = null;
  var pulse = null;             // the litter pulse being filled in
  var summary = null;           // the summary after End
  var types = [];
  var settings = { sunsetWarnMin: 60, noStartMin: 15, autoEndHours: 12, editHours: 48, breakAfter: 10, colours: ['#2c7bb6', '#f6e8c3', '#8c510a'] };
  var pace = null;              // your usual pace, from your own stretches (item 7)
  var sending = false;

  /* ── Kept on the phone ── */

  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function keep(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* this visit only */ } }
  function save() { keep(KEY, c); }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 10); }

  function loadStreets() {
    var s = load(STREETS_KEY);
    if (s && s.ways) { streets = new G.Streets(s.ways); streetsBox = s.box; }
  }

  // The streets a mile around a place, from OpenStreetMap (Q385), kept for
  // the collection. Outside the box, more are fetched when there's signal.
  function fetchStreets(cell) {
    var p = G.cellCenter(cell);
    if (streetsBox && p.lat > streetsBox.south + 0.004 && p.lat < streetsBox.north - 0.004 && p.lon > streetsBox.west + 0.005 && p.lon < streetsBox.east - 0.005) {
      return Promise.resolve();
    }
    var box = G.boxAround(p.lat, p.lon, 1);
    return fetch(OVERPASS, { method: 'POST', body: 'data=' + encodeURIComponent(G.overpassQuery(box.south, box.west, box.north, box.east)),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' } })
      .then(function (res) { if (!res.ok) throw new Error('streets ' + res.status); return res.json(); })
      .then(function (json) {
        var old = load(STREETS_KEY);
        var ways = G.compactWays(json);
        if (old && old.ways) ways = old.ways.concat(ways);
        if (streetsBox) box = { south: Math.min(box.south, streetsBox.south), west: Math.min(box.west, streetsBox.west), north: Math.max(box.north, streetsBox.north), east: Math.max(box.east, streetsBox.east) };
        keep(STREETS_KEY, { ways: ways, box: box });
        streets = new G.Streets(ways);
        streetsBox = box;
        drawStreets();
      });
  }

  /* ── Sending what the phone kept ── */

  // Sends the queue in order; what doesn't go waits for the next try.
  function flush() {
    if (sending || !c || !c.queue.length) { showQueue(); return Promise.resolve(); }
    sending = true;
    var item = c.queue[0];
    var call = item.type === 'stretch'
      ? app.api('collectStretch', { token: app.myToken(), collectionId: c.id, stretch: item.stretch })
      : app.api('collectEnd', { token: app.myToken(), collectionId: c.id, endedAt: item.endedAt });
    return call.then(function (d) {
      sending = false;
      c.queue.shift();
      if (d.collection) c.server = d.collection;
      save();
      if (item.type === 'end') return finish(d);
      return flush();
    }, function (err) {
      sending = false;
      if (err.code === 'signed-out') return app.signedOut();
      // A refusal that isn't about signal is kept, and shown.
      if (!/couldn't reach HABO/.test(err.message)) c.lastError = err.message;
      save();
      showQueue();
    });
  }

  function showQueue() {
    var n = c ? c.queue.filter(function (q) { return q.type === 'stretch'; }).length : 0;
    $('cl-queue').textContent = n ? (n === 1 ? '1 litter pulse is' : n + ' litter pulses are') + ' kept on this phone, waiting for signal.' : '';
    $('cl-queue').hidden = !n;
    $('cl-error').textContent = c && c.lastError ? 'HABO couldn\'t take a litter pulse: ' + c.lastError : '';
  }

  window.addEventListener('online', function () { flush(); });

  /* ── The account page ── */

  // Under the account: hours collecting, and Start (or Back to my collection).
  function onAccount() {
    $('cl-account').hidden = false;
    $('cl-hours').textContent = '';
    $('cl-start').textContent = c && !c.ended ? 'Back to my collection' : 'Start collecting';
    return app.api('collectLoad', { token: app.myToken() }).then(function (d) {
      settings = d.settings || settings;
      types = d.types || [];
      pace = d.pace || null;
      var h = d.hours || { collections: 0, hours: 0 };
      $('cl-hours').textContent = h.collections ? 'Your volunteer hours collecting litter: ' + h.hours + ' (' + h.collections + ' collection' + (h.collections === 1 ? '' : 's') + ').' : '';
      // A collection open here but ended there (left alone 12 hours): forget it.
      if (c && !c.ended && !c.queue.length && (!d.collection || d.collection.id !== c.id)) { c = null; save(); keep(STREETS_KEY, null); }
      $('cl-start').textContent = c && !c.ended ? 'Back to my collection' : 'Start collecting';
      showSun($('cl-account-sun'), null);
    }, function () { /* the account page shows without it */ });
  }

  /* ── Sunset (item 20) ── */

  function sunAt(cell) {
    var p = G.cellCenter(cell), d = new Date();
    var noon = new Date(d.getFullYear(), d.getMonth(), d.getDate(), 12).getTime();
    return G.sunTimes(noon, p.lat, p.lon);
  }
  function clock(ms) { return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }

  // From an hour before sunset, loudly, whenever the page is open (Q375, Q377).
  function showSun(box, cell) {
    var where = cell || (c && c.lastCell) || HOME_CELL;
    var s = sunAt(where), now = Date.now();
    box.hidden = !(now >= s.sunset - settings.sunsetWarnMin * 60000 || now < s.sunrise);
    box.textContent = now >= s.sunset ? 'The sun has set (' + clock(s.sunset) + '). No XP is earned after sunset, and a stretch that goes past it earns no volunteer hours.'
      : 'Sunset is at ' + clock(s.sunset) + '. After it, no XP is earned, and a stretch that goes past it earns no volunteer hours.';
  }
  setInterval(function () { if (!$('v-collect').hidden) showSun($('cl-sun'), null); }, 60000);

  /* ── Where the phone is ── */

  // The phone's location, once (the page doesn't track you, Q168): its cell,
  // or null when it's rough or turned off, so the cell is tapped (Q313, Q314).
  function locate() {
    return new Promise(function (resolve) {
      if (!navigator.geolocation) return resolve({ cell: null, why: 'off' });
      navigator.geolocation.getCurrentPosition(function (p) {
        var cell = G.cellAt(p.coords.latitude, p.coords.longitude);
        resolve(p.coords.accuracy > ROUGH_M ? { cell: null, near: cell, why: 'rough' } : { cell: cell });
      }, function () { resolve({ cell: null, why: 'off' }); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    });
  }

  /* ── Start ── */

  function start(button) {
    if (c && !c.ended) return openCollect();
    app.busy(button, 'cl-start-err', function () {
      return locate().then(function (loc) {
        if (!loc.cell) {
          // No location: pick the cell on the map, then Start.
          openCollect();
          beginPick(loc.near, loc.why, function (cell) { return startAt(cell); });
          return;
        }
        return startAt(loc.cell);
      });
    });
  }

  function startAt(cell) {
    var s = sunAt(cell), now = Date.now();
    if (now >= s.sunset - settings.noStartMin * 60000 || now < s.sunrise) {
      return Promise.reject(new Error('No new collection can start from ' + settings.noStartMin + ' minutes before sunset until sunrise.'));
    }
    return app.api('collectStart', { token: app.myToken(), cell: cell, key: uid() }).then(function (d) {
      settings = d.settings || settings;
      pace = d.pace || pace;
      var col = d.collection;
      c = { id: col.id, startedAt: col.started, startCell: col.startCell, n: 1, lastCell: col.startCell, way: null, queue: [], scalePrev: 0, bagReset: false,
        current: { startedAt: col.started, startCell: col.startCell, pausedMin: 0 }, totals: { pounds: 0, miles: 0, minutes: 0 }, ended: false };
      if (d.already && col.started) c.current.startedAt = col.started;
      save();
      return fetchStreets(cell).catch(function () {
        app.notice('The streets around you couldn\'t load just now; your stretches are measured straight until they do.');
      }).then(function () { openCollect(); });
    });
  }

  /* ── The collecting screen ── */

  function openCollect() {
    $('cl-map-box').appendChild($('cl-map'));
    loadStreets();
    app.show('v-collect');
    ensureMap();
    showStatus();
    showSun($('cl-sun'), null);
    flush();
  }

  function showStatus() {
    if (!c) return;
    var t = c.totals;
    $('cl-since').textContent = 'Collecting since ' + clock(c.startedAt) + (c.current.pausedAt ? ' · Paused at ' + clock(c.current.pausedAt) : '');
    $('cl-totals').textContent = round(t.pounds, 2) + ' lb · ' + round(t.miles, 2) + ' mi · ' + Math.round(t.minutes) + ' min active';
    $('cl-pause').textContent = c.current.pausedAt ? 'Resume' : 'Pause';
    $('cl-pulse-btn').disabled = !!c.current.pausedAt;
    showQueue();
  }

  function round(n, p) { var f = Math.pow(10, p); return Math.round(n * f) / f; }

  /* ── The map (Q386) ── */

  function ensureMap() {
    if (map || !window.L) { if (!window.L) $('cl-map-note').textContent = 'The map couldn\'t load. Check your signal, then open the page again.'; return; }
    map = L.map('cl-map', { zoomControl: true, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    layers = { streets: L.layerGroup().addTo(map), cells: L.layerGroup().addTo(map) };
    map.on('click', function (e) { tapCell(G.cellAt(e.latlng.lat, e.latlng.lng)); });
    var p = G.cellCenter((c && c.lastCell) || HOME_CELL);
    map.setView([p.lat, p.lon], 16);
    drawStreets();
  }

  function drawStreets() {
    if (!map || !streets) return;
    layers.streets.clearLayers();
    var s = load(STREETS_KEY);
    (s && s.ways || []).forEach(function (w) {
      var pts = [];
      for (var k = 1; k + 1 < w.length; k += 2) pts.push([w[k], w[k + 1]]);
      L.polyline(pts, { color: '#555', weight: 3, opacity: 0.7, interactive: false }).addTo(layers.streets);
    });
  }

  // Draws the cells: the stretch (orange), the cell you're in (outlined).
  function drawCells(list, here, center) {
    if (!map) return;
    layers.cells.clearLayers();
    (list || []).forEach(function (cell) {
      L.rectangle(G.cellBounds(cell), { color: '#c2410c', weight: 1, fillColor: '#f97316', fillOpacity: 0.35, interactive: false }).addTo(layers.cells);
    });
    if (here) L.rectangle(G.cellBounds(here), { color: '#1d4ed8', weight: 3, fill: false, interactive: false }).addTo(layers.cells);
    if (center) { var p = G.cellCenter(center); map.setView([p.lat, p.lon], map.getZoom()); }
    setTimeout(function () { map.invalidateSize(); }, 0);
  }

  var picking = null;   // { done(cell) } while a cell is being picked
  function beginPick(near, why, done) {
    picking = { done: done };
    $('cl-pick').hidden = false;
    $('cl-pick').textContent = why === 'rough' ? 'Your phone\'s location is rough just now. Tap the cell you\'re in on the map.'
      : 'Your phone\'s location is off. Tap the cell you\'re in on the map.';
    if (near) drawCells([], near, near);
  }

  function tapCell(cell) {
    if (picking) {
      var p = picking;
      picking = null;
      $('cl-pick').hidden = true;
      Promise.resolve(p.done(cell)).catch(function (err) { app.notice(err.message); });
      return;
    }
    if (pulse && pulse.whereMode) {
      pulse.breakWhere = cell;
      pulse.whereMode = false;
      $('pf-where-shown').textContent = 'Where you were: the cell you tapped.';
      return;
    }
    if (summary && summary.whereMode) {
      summary.breakWhere = cell;
      summary.whereMode = false;
      $('sf-where-shown').textContent = 'Where you were: the cell you tapped.';
      return;
    }
    if (summary && summary.editing) return summaryTap(cell);
    if (!pulse) return;
    // Tapping a cell adds it to the stretch, or takes it out (Q286).
    var i = pulse.cells.indexOf(cell);
    if (i === -1) pulse.cells.push(cell); else if (pulse.cells.length > 1) pulse.cells.splice(i, 1);
    showStretch();
  }

  /* ── The litter pulse (item 2) ── */

  // kind: 'pulse', 'end', or 'pause' (the stretch that ended where you paused).
  function beginPulse(kind, button) {
    if (!c) return;
    var pressedAt = Date.now();
    var go = function (cell) {
      var from = c.lastCell || c.current.startCell;
      return fetchStreets(cell).catch(function () { /* measured straight until the streets load */ }).then(function () {
        var suggested = streets ? streets.suggest(from, cell, c.way) : G.lineCells(G.centerXY(from), G.centerXY(cell));
        pulse = { kind: kind, pressedAt: kind === 'pause' || (kind === 'end' && c.current.pausedAt) ? c.current.pausedAt : pressedAt, cell: cell,
          cells: suggested.slice(), suggested: suggested, breakWhere: '' };
        openPulse();
      });
    };
    if (kind === 'pause' || (kind === 'end' && c.current.pausedAt)) return go(c.current.pauseCell);
    app.busy(button, 'cl-err', function () {
      return locate().then(function (loc) {
        if (loc.cell) return go(loc.cell);
        beginPick(loc.near, loc.why, go);
      });
    });
  }

  function openPulse() {
    $('cl-actions').hidden = true;
    $('cl-pulse').hidden = false;
    $('pf-title').textContent = pulse.kind === 'end' ? 'End: your last litter pulse' : pulse.kind === 'pause' ? 'Weigh the stretch that ended where you paused' : 'Litter pulse';
    $('pf-scale').value = '';
    $('pf-newbag').checked = false;
    $('pf-rating').value = '';
    $('pf-break').value = '';
    $('pf-where-shown').textContent = '';
    $('pf-err').textContent = '';
    $('pf-odd').hidden = true;
    $('pf-bag-hint').textContent = c.bagReset ? 'You started a new bag after the stretch you discarded: weigh only the new bag.' : 'Include the bag. The app does the subtracting.';
    $('pf-end-row').hidden = pulse.kind !== 'end';
    if (pulse.kind === 'end') $('pf-end').value = toTimeInput(pulse.pressedAt);
    $('pf-save').textContent = pulse.kind === 'end' ? 'Save and end' : 'Save litter pulse';
    showTypes();
    showStretch();
    // The map stays in view: the stretch is changed by tapping it.
    $('cl-map-box').scrollIntoView({ block: 'start' });
  }

  function showStretch() {
    var m = streets ? streets.measure(pulse.cells) : { street: 0, off: G.CELL_M * pulse.cells.length };
    pulse.m = m;
    $('pf-stretch').textContent = 'Your stretch: ' + pulse.cells.length + ' cell' + (pulse.cells.length === 1 ? '' : 's') + ', ' +
      round((m.street + m.off) / G.MILE_M, 2) + ' mi. Tap cells on the map to add or take them out.';
    drawCells(pulse.cells, pulse.cell, pulse.cell);
  }

  function showTypes() {
    var box = $('pf-types');
    box.textContent = '';
    types.forEach(function (t) {
      var l = document.createElement('label');
      l.className = 'lt-type';
      var i = document.createElement('input');
      i.type = 'checkbox';
      i.value = t;
      l.appendChild(i);
      l.appendChild(document.createTextNode(' ' + t));
      box.appendChild(l);
    });
  }

  function addType(button) {
    var name = $('pf-newtype').value.trim();
    if (!name) return;
    app.busy(button, 'pf-err', function () {
      return app.api('addLitterType', { token: app.myToken(), type: name }).then(function (d) {
        var ticked = picked();
        types = d.types;
        showTypes();
        ticked.concat([d.added]).forEach(function (t) {
          var i = document.querySelector('#pf-types input[value="' + t.replace(/"/g, '\\"') + '"]');
          if (i) i.checked = true;
        });
        $('pf-newtype').value = '';
      });
    });
  }

  function picked() {
    return Array.prototype.map.call(document.querySelectorAll('#pf-types input:checked'), function (i) { return i.value; });
  }

  function toTimeInput(ms) { var d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function fromTimeInput(v, near) {
    var m = /^(\d{2}):(\d{2})$/.exec(v || '');
    if (!m) return near;
    var d = new Date(near);
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    if (d.getTime() > near + 60000) d.setDate(d.getDate() - 1);
    return d.getTime();
  }

  // Saves the litter pulse on the phone, then sends it. `discard`: Discard
  // this stretch (item 6, Q284, Q301).
  function savePulse(discard) {
    var err = $('pf-err');
    var endedAt = pulse.kind === 'end' ? fromTimeInput($('pf-end').value, pulse.pressedAt) : pulse.pressedAt;
    var lastEnd = c.current.startedAt;
    if (endedAt < lastEnd) { err.textContent = 'The clock can\'t stop before your last litter pulse (' + clock(lastEnd) + ').'; return; }
    var scale = $('pf-scale').value.trim();
    var lbs = Number(scale.replace(/[^\d.]/g, ''));
    if (!discard) {
      if (scale === '' || !(lbs >= 0)) { err.textContent = 'Type what the scale shows, in pounds, like 3.25. With no weight, press Discard this stretch.'; return; }
      var before = c.bagReset ? 0 : c.scalePrev;
      if (lbs < before) { err.textContent = 'The scale shows less than at your last litter pulse (' + before + ' lb). If you started a new bag then, the app needed to know: tick New bag at a pulse when you start one.'; return; }
    }
    var breakMin = Number($('pf-break').value) || 0;
    var cur = c.current;
    var pausedMin = cur.pausedMin || 0;
    // The break question (item 7): once you have enough collections, a
    // stretch much slower than your usual pace asks; it never takes time off.
    if (!discard && !pulse.askedBreak) {
      var odd = oddTime(Math.max(0, (endedAt - cur.startedAt) / 60000 - pausedMin - breakMin), (pulse.m.street + pulse.m.off) / G.MILE_M);
      if (odd) {
        pulse.askedBreak = true;
        $('pf-odd-why').textContent = oddWords(odd);
        $('pf-odd').hidden = false;
        $('pf-odd').scrollIntoView({ block: 'center' });
        return;
      }
    }
    var stretch = {
      key: uid(), n: c.n, startedAt: cur.startedAt, endedAt: endedAt, cells: pulse.cells.slice(),
      streetMi: pulse.m.street / G.MILE_M, offMi: pulse.m.off / G.MILE_M, pausedMin: pausedMin, breakMin: breakMin,
      breakWhere: breakMin ? (pulse.breakWhere || 'Not sure') : '', discarded: !!discard,
      scale: discard ? '' : scale, newBag: !discard && $('pf-newbag').checked,
      types: discard ? [] : picked(), rating: discard ? '' : $('pf-rating').value, breakAsked: !!pulse.askedBreak
    };
    c.queue.push({ type: 'stretch', stretch: stretch });
    // What the collection so far shows (Q260).
    var minutes = Math.max(0, (endedAt - cur.startedAt) / 60000 - pausedMin - breakMin);
    c.totals.minutes += minutes;
    if (!discard) {
      c.totals.pounds += lbs - (c.bagReset ? 0 : c.scalePrev);
      c.totals.miles += (pulse.m.street + pulse.m.off) / G.MILE_M;
      c.scalePrev = stretch.newBag ? 0 : lbs;
      c.bagReset = false;
    } else {
      // Discard starts a new bag, so the next weighing has only the next stretch's litter (Q389).
      c.scalePrev = 0;
      c.bagReset = true;
    }
    c.n += 1;
    c.lastCell = pulse.cell;
    c.way = null;
    var kind = pulse.kind;
    if (kind === 'end') {
      c.queue.push({ type: 'end', endedAt: endedAt });
      c.ended = true;
    } else if (kind === 'pause') {
      // The new stretch starts where and when you resumed.
      c.current = { startedAt: c.resumeAt, startCell: c.resumeCell, pausedMin: 0 };
      c.lastCell = c.resumeCell;
    } else {
      c.current = { startedAt: endedAt, startCell: pulse.cell, pausedMin: 0 };
    }
    save();
    pulse = null;
    $('cl-pulse').hidden = true;
    $('cl-actions').hidden = false;
    drawCells([], c.lastCell, c.lastCell);
    showStatus();
    if (discard) app.notice('Stretch discarded. Start a new bag now, so your next weighing has only the next stretch\'s litter.');
    else if (kind !== 'end') app.notice('Litter pulse saved.');
    if (kind === 'end') { $('v-collect').hidden = true; showWaitingSummary(); }
    flush();
  }

  // A stretch's time much longer than your usual pace says (item 7): more
  // than twice it, and at least 10 minutes more. Only once you have as many
  // collections as the setting says (10 to start, Q392 (a)).
  function oddTime(minutes, miles) {
    if (!pace || pace.minPerMile == null || pace.collections < (settings.breakAfter || pace.after || 10) || !(miles > 0)) return null;
    var usual = pace.minPerMile * miles;
    return minutes > Math.max(2 * usual, usual + 10) ? { minutes: minutes, usual: usual } : null;
  }
  function oddWords(odd) {
    return 'This stretch took ' + Math.round(odd.minutes) + ' minutes. At your usual pace, it would take about ' + Math.max(1, Math.round(odd.usual)) + '.';
  }

  /* ── Pause and Resume (item 6) ── */

  function pauseOrResume(button) {
    if (!c) return;
    if (!c.current.pausedAt) {
      // Pause asks you to weigh, strongly, but doesn't require it (Q283).
      app.busy(button, 'cl-err', function () {
        return locate().then(function (loc) {
          c.current.pausedAt = Date.now();
          c.current.pauseCell = loc.cell || loc.near || c.lastCell;
          save();
          showStatus();
          button.dataset.after = 'Resume';
          app.notice('Paused. If you can, weigh your bag now: press Resume, then it asks for the weight.');
        });
      });
      return;
    }
    app.busy(button, 'cl-err', function () {
      return locate().then(function (loc) {
        var cell = loc.cell || loc.near || c.current.pauseCell;
        var cur = c.current;
        if (cell === cur.pauseCell) {
          // In the same cell, the stretch goes on, less the pause.
          cur.pausedMin = (cur.pausedMin || 0) + (Date.now() - cur.pausedAt) / 60000;
          delete cur.pausedAt; delete cur.pauseCell;
          save();
          showStatus();
          button.dataset.after = 'Pause';
          return;
        }
        // In a different cell: weigh the stretch that ended where you paused first.
        c.resumeAt = Date.now();
        c.resumeCell = cell;
        save();
        return beginPulse('pause');
      });
    });
  }

  /* ── After End: the summary ── */

  function showWaitingSummary() {
    app.notice('');
    app.show('v-summary');
    $('sm-list').textContent = '';
    $('sm-wait').hidden = false;
    $('sm-wait').textContent = 'Saving your collection…';
    if (c && c.queue.length) $('sm-wait').textContent = 'Your collection is kept on this phone and saves when there\'s signal.' + (c.lastError ? ' HABO couldn\'t take it: ' + c.lastError : '');
  }

  function finish(d) {
    var id = c.id;
    summary = { id: id, collection: d.collection, stretches: d.stretches || [] };
    c = null;
    save();
    keep(STREETS_KEY, null);
    showSummary();
  }

  function showSummary() {
    app.show('v-summary');
    $('sm-wait').hidden = true;
    var col = summary.collection;
    $('sm-totals').textContent = round(col.pounds, 2) + ' lb · ' + round(col.miles, 2) + ' mi · ' + Math.round(col.active) + ' min active · ' + col.hours + ' volunteer hours' +
      (col.hoursNote ? ' (' + col.hoursNote + ')' : '');
    var list = $('sm-list');
    list.textContent = '';
    summary.stretches.forEach(function (s) { list.appendChild(stretchCard(s)); });
    drawReadings();
  }

  // After you save, your stretches on the map with their readings (Q245),
  // in the map's colours; a cell the track points to is outlined (item 7).
  function drawReadings() {
    $('sm-view-box').hidden = false;
    $('sm-view-box').appendChild($('cl-map'));
    ensureMap();
    if (!map) return;
    layers.cells.clearLayers();
    var b = L.latLngBounds([]);
    summary.stretches.forEach(function (s) {
      if (s.discarded) return;
      var colour = s.index == null ? '#9ca3af' : G.indexColour(s.index, settings.colours);
      s.cells.forEach(function (cell) {
        var r = L.rectangle(G.cellBounds(cell), { color: colour, weight: 1, fillColor: colour, fillOpacity: 0.7 });
        r.bindPopup('Stretch ' + s.n + ': ' + (s.index == null ? 'no reading' : 'Litter Index ' + round(s.index, 1)));
        r.addTo(layers.cells);
        b.extend(G.cellBounds(cell));
      });
    });
    Object.keys(summary.stops || {}).forEach(function (id) {
      L.rectangle(G.cellBounds(summary.stops[id].cell), { color: '#1d4ed8', weight: 3, fill: false, interactive: false }).addTo(layers.cells);
    });
    setTimeout(function () { map.invalidateSize(); if (b.isValid()) map.fitBounds(b, { maxZoom: 17, padding: [16, 16] }); }, 0);
  }

  function allCells() {
    var out = [];
    summary.stretches.forEach(function (s) { if (!s.discarded) s.cells.forEach(function (x) { if (out.indexOf(x) === -1) out.push(x); }); });
    return out;
  }

  // A saved collection's summary, from the account page, for its fixes.
  function openPast(id, button) {
    app.busy(button, 'cl-start-err', function () {
      return app.api('collectLoad', { token: app.myToken(), collectionId: id }).then(function (d) {
        settings = d.settings || settings;
        types = d.types || types;
        pace = d.pace || pace;
        summary = { id: id, collection: d.collection, stretches: d.stretches || [] };
        showSummary();
      });
    });
  }

  function stretchCard(s) {
    var box = document.createElement('div');
    box.className = 'card lt-stretch';
    box.id = 'sm-' + s.id;
    var h = document.createElement('h3');
    h.textContent = 'Stretch ' + s.n + ' · ' + clock(s.started) + ' to ' + clock(s.ended);
    box.appendChild(h);
    var p = document.createElement('p');
    p.className = 'lt-stretch-facts';
    p.textContent = s.discarded ? 'Discarded: no reading. Its time still counts.' :
      round(s.streetMi + s.offMi, 2) + ' mi · ' + Math.round(s.activeMin) + ' min · ' + (s.pounds == null ? '?' : s.pounds) + ' lb · ' +
      (s.index == null ? 'no reading' : 'Litter Index ' + round(s.index, 2)) + (s.rating == null ? '' : ' · Visual rating ' + s.rating) + (s.pastSunset ? ' · Past sunset: no hours' : '');
    box.appendChild(p);
    if (s.types.length) { var t = document.createElement('p'); t.className = 'muted small'; t.textContent = s.types.join(', '); box.appendChild(t); }
    if (s.track) { var tr = document.createElement('p'); tr.className = 'muted small'; tr.textContent = 'Its cells are from your GPX track.'; box.appendChild(tr); }
    if (summary.gpx && summary.gpx[s.id]) box.appendChild(trackChoice(s, summary.gpx[s.id]));
    var odd = !s.discarded && !s.asked ? oddTime(s.activeMin, s.streetMi + s.offMi) : null;
    if (odd) box.appendChild(oddQuestion(s, odd));
    if (!s.discarded) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-secondary lt-fix';
      b.textContent = 'Fix this stretch';
      b.addEventListener('click', function () { openFix(s); });
      box.appendChild(b);
    }
    return box;
  }

  // The break question on the summary (item 7), for a stretch saved without
  // it: Yes opens the fix with a break; No keeps the stretch as it is. With
  // a recorder's track, it points to the cell where the track stopped longest.
  function oddQuestion(s, odd) {
    var box = document.createElement('div');
    box.className = 'lt-odd';
    var q = document.createElement('p');
    q.className = 'lt-odd-q';
    q.textContent = 'Did you take a break, or get distracted?';
    box.appendChild(q);
    var p = document.createElement('p');
    var stop = summary.stops && summary.stops[s.id];
    p.textContent = oddWords(odd) + (stop ? ' Your track stayed about ' + Math.round(stop.minutes) + ' minutes in one cell, outlined on the map.' : '');
    box.appendChild(p);
    var yes = document.createElement('button');
    yes.type = 'button'; yes.className = 'btn btn-primary lt-odd-yes'; yes.textContent = 'Yes: add a break';
    yes.addEventListener('click', function () { openFix(s, true); });
    var no = document.createElement('button');
    no.type = 'button'; no.className = 'btn btn-secondary lt-odd-no'; no.textContent = 'No: it\'s right as it is';
    no.addEventListener('click', function () { sendFix(no, s, { breakAsked: true }); });
    box.appendChild(yes);
    box.appendChild(no);
    return box;
  }

  // The summary's fixes (Q252, Q253): weight, litter types, visual rating,
  // cells; and a break, when the break question asked (item 7).
  function openFix(s, withBreak) {
    summary.fixing = s;
    summary.withBreak = !!withBreak;
    $('sm-fix').hidden = false;
    $('sf-break-row').hidden = !withBreak;
    $('sf-break').value = s.breakMin ? String(s.breakMin) : '';
    var stop = summary.stops && summary.stops[s.id];
    summary.breakWhere = stop ? stop.cell : '';
    summary.whereMode = false;
    $('sf-where-shown').textContent = stop ? 'Where you were: the cell your track points to.' : '';
    $('sf-title').textContent = 'Fix stretch ' + s.n;
    $('sf-pounds').value = s.pounds == null ? '' : s.pounds;
    $('sf-rating').value = s.rating == null ? '' : String(s.rating);
    var box = $('sf-types');
    box.textContent = '';
    types.forEach(function (t) {
      var l = document.createElement('label');
      l.className = 'lt-type';
      var i = document.createElement('input');
      i.type = 'checkbox';
      i.value = t;
      i.checked = s.types.indexOf(t) !== -1;
      l.appendChild(i);
      l.appendChild(document.createTextNode(' ' + t));
      box.appendChild(l);
    });
    summary.cells = s.cells.slice();
    summary.editing = false;
    $('sf-cells-note').textContent = s.cells.length + ' cells. To change them, press Change its cells, then tap cells on the map.';
    $('sf-err').textContent = '';
    $('sm-fix').scrollIntoView({ block: 'start' });
  }

  function editCells() {
    summary.editing = true;
    $('sm-view-box').hidden = true;
    $('sm-map-box').hidden = false;
    $('sm-map-box').appendChild($('cl-map'));
    ensureMap();
    loadStreets();
    drawCells(summary.cells, null, summary.cells[0]);
    $('sf-cells-note').textContent = summary.cells.length + ' cells. Tap a cell to add it or take it out.';
  }

  function summaryTap(cell) {
    var i = summary.cells.indexOf(cell);
    if (i === -1) summary.cells.push(cell); else if (summary.cells.length > 1) summary.cells.splice(i, 1);
    drawCells(summary.cells, null, null);
    $('sf-cells-note').textContent = summary.cells.length + ' cells. Tap a cell to add it or take it out.';
  }

  function saveFix(button) {
    var s = summary.fixing;
    var fix = { pounds: $('sf-pounds').value, rating: $('sf-rating').value,
      types: Array.prototype.map.call(document.querySelectorAll('#sf-types input:checked'), function (i) { return i.value; }) };
    if (summary.editing) {
      var m = streets ? streets.measure(summary.cells) : { street: 0, off: G.CELL_M * summary.cells.length };
      fix.cells = summary.cells; fix.streetMi = m.street / G.MILE_M; fix.offMi = m.off / G.MILE_M;
    }
    if (summary.withBreak) {
      fix.breakMin = Number($('sf-break').value) || 0;
      fix.breakWhere = fix.breakMin ? (summary.breakWhere || 'Not sure') : '';
      fix.breakAsked = true;
    }
    sendFix(button, s, fix);
  }

  function sendFix(button, s, fix) {
    app.busy(button, 'sf-err', function () {
      return app.api('collectFix', { token: app.myToken(), stretchId: s.id, fix: fix }).then(function (d) {
        summary.collection = d.collection;
        summary.stretches = summary.stretches.map(function (x) { return x.id === d.stretch.id ? d.stretch : x; });
        if (summary.gpx) delete summary.gpx[s.id];
        summary.editing = false;
        summary.withBreak = false;
        summary.whereMode = false;
        $('sm-fix').hidden = true;
        $('sm-map-box').hidden = true;
        showSummary();
        app.notice(fix.breakAsked && fix.breakMin == null ? 'Kept as it is.' : 'Stretch ' + s.n + ' fixed.');
      });
    });
  }

  // A recorder's GPX file (Q227): each stretch's cells from the track points
  // in its time; when they differ from the stretch you confirmed, both show
  // and you choose. It never changes a stretch by itself (Q228).
  function readGpx(file) {
    var reader = new FileReader();
    reader.onload = function () {
      var doc = new DOMParser().parseFromString(String(reader.result), 'application/xml');
      var pts = Array.prototype.map.call(doc.getElementsByTagName('trkpt'), function (p) {
        var t = p.getElementsByTagName('time')[0];
        return { lat: Number(p.getAttribute('lat')), lon: Number(p.getAttribute('lon')), t: t ? Date.parse(t.textContent) : NaN };
      }).filter(function (p) { return isFinite(p.lat) && isFinite(p.lon) && isFinite(p.t); });
      if (!pts.length) { app.notice('That file has no track points with times.'); return; }
      pts.sort(function (a, b) { return a.t - b.t; });
      summary.gpx = {};
      summary.stops = {};
      var n = 0;
      summary.stretches.forEach(function (s) {
        if (s.discarded) return;
        var stop = longestStop(pts, s);
        if (stop && !s.asked && oddTime(s.activeMin, s.streetMi + s.offMi)) summary.stops[s.id] = stop;
        var cells = [];
        pts.filter(function (p) { return p.t >= s.started && p.t <= s.ended; }).forEach(function (p) {
          var cell = G.cellAt(p.lat, p.lon);
          if (cells[cells.length - 1] !== cell) cells.push(cell);
        });
        if (!cells.length) return;
        var same = cells.length === s.cells.length && cells.every(function (x, i) { return x === s.cells[i]; });
        if (!same) { summary.gpx[s.id] = cells; n++; }
      });
      showSummary();
      app.notice(n ? 'Your track shows a different stretch for ' + n + ' of them. Choose for each.' : 'Your track matches the stretches you confirmed.');
    };
    reader.readAsText(file);
  }

  // Where the track stayed longest in one cell during a stretch (item 7):
  // { cell, minutes }, or null for under 5 minutes.
  function longestStop(pts, s) {
    var best = null, run = null;
    pts.forEach(function (p) {
      if (p.t < s.started || p.t > s.ended) return;
      var cell = G.cellAt(p.lat, p.lon);
      if (run && run.cell === cell) run.last = p.t; else run = { cell: cell, first: p.t, last: p.t };
      if (!best || run.last - run.first > best.last - best.first) best = { cell: run.cell, first: run.first, last: run.last };
    });
    return best && best.last - best.first >= 5 * 60000 ? { cell: best.cell, minutes: (best.last - best.first) / 60000 } : null;
  }

  function trackChoice(s, cells) {
    var box = document.createElement('div');
    box.className = 'lt-track';
    var m = streets ? streets.measure(cells) : { street: 0, off: G.CELL_M * cells.length };
    var p = document.createElement('p');
    p.textContent = 'Your track shows ' + cells.length + ' cells, ' + round((m.street + m.off) / G.MILE_M, 2) + ' mi; you confirmed ' + s.cells.length + ' cells, ' + round(s.streetMi + s.offMi, 2) + ' mi.';
    box.appendChild(p);
    var use = document.createElement('button');
    use.type = 'button'; use.className = 'btn btn-primary lt-use-track'; use.textContent = 'Use the track\'s';
    use.addEventListener('click', function () { sendFix(use, s, { cells: cells, streetMi: m.street / G.MILE_M, offMi: m.off / G.MILE_M, fromTrack: true }); });
    var keepMine = document.createElement('button');
    keepMine.type = 'button'; keepMine.className = 'btn btn-secondary lt-keep-mine'; keepMine.textContent = 'Keep mine';
    keepMine.addEventListener('click', function () { delete summary.gpx[s.id]; showSummary(); });
    box.appendChild(use);
    box.appendChild(keepMine);
    return box;
  }

  /* ── Wiring ── */

  $('cl-start').addEventListener('click', function () { start($('cl-start')); });
  $('cl-pulse-btn').addEventListener('click', function () { beginPulse('pulse', $('cl-pulse-btn')); });
  $('cl-pause').addEventListener('click', function () { pauseOrResume($('cl-pause')); });
  $('cl-end').addEventListener('click', function () { beginPulse('end', $('cl-end')); });
  $('cl-back').addEventListener('click', function () { app.showAccount(); });
  $('cl-pulse').addEventListener('submit', function (e) { e.preventDefault(); savePulse(false); });
  $('pf-discard').addEventListener('click', function () { savePulse(true); });
  $('pf-cancel').addEventListener('click', function () {
    if (pulse && pulse.kind === 'pause') { app.notice('Weigh it, or press Discard this stretch.'); return; }
    pulse = null; $('cl-pulse').hidden = true; $('cl-actions').hidden = false; drawCells([], c && c.lastCell, null);
  });
  $('pf-suggested').addEventListener('click', function () { if (pulse) { pulse.cells = pulse.suggested.slice(); showStretch(); } });
  $('pf-addtype').addEventListener('click', function () { addType($('pf-addtype')); });
  $('pf-where-tap').addEventListener('click', function () { if (pulse) { pulse.whereMode = true; $('pf-where-shown').textContent = 'Tap the cell on the map.'; } });
  $('pf-where-unsure').addEventListener('click', function () { if (pulse) { pulse.breakWhere = 'Not sure'; pulse.whereMode = false; $('pf-where-shown').textContent = 'Where you were: not sure.'; } });
  $('sm-gpx').addEventListener('change', function () { if (this.files[0]) readGpx(this.files[0]); this.value = ''; });
  $('sf-cells').addEventListener('click', editCells);
  $('sm-fix').addEventListener('submit', function (e) { e.preventDefault(); saveFix($('sf-save')); });
  $('sf-cancel').addEventListener('click', function () { summary.editing = false; summary.withBreak = false; summary.whereMode = false; $('sm-fix').hidden = true; $('sm-map-box').hidden = true; drawReadings(); });
  $('sf-where-tap').addEventListener('click', function () { if (summary) { summary.whereMode = true; $('sf-where-shown').textContent = 'Tap the cell on the map.'; $('sm-view-box').scrollIntoView({ block: 'start' }); } });
  $('sf-where-unsure').addEventListener('click', function () { if (summary) { summary.breakWhere = 'Not sure'; summary.whereMode = false; $('sf-where-shown').textContent = 'Where you were: not sure.'; } });
  $('sm-done').addEventListener('click', function () { summary = null; app.showAccount(); });
  $('sm-map-open').addEventListener('click', function () { app.openMap(allCells(), function () { app.show('v-summary'); drawReadings(); }); });
  $('pf-odd-yes').addEventListener('click', function () { $('pf-odd').hidden = true; $('pf-break').focus(); $('pf-break').scrollIntoView({ block: 'center' }); });
  $('pf-odd-no').addEventListener('click', function () { $('pf-odd').hidden = true; savePulse(false); });

  return {
    onAccount: onAccount,
    openPast: openPast,
    // Opening the page with a collection still going: back to it (Q282). One
    // left alone past its hours is ended where its last stretch did (Q303).
    resume: function () {
      if (!c) return false;
      if (c.ended) { showWaitingSummary(); flush(); return true; }
      var last = c.queue.length ? c.queue[c.queue.length - 1].stretch.endedAt : c.current.startedAt;
      if (Date.now() - last > settings.autoEndHours * 3600000 && !c.queue.length) return false;
      openCollect();
      return true;
    },
    busyHere: function () { return !!(c && (c.queue.length || !c.ended)); },
    forget: function () { c = null; save(); keep(STREETS_KEY, null); }
  };
};
