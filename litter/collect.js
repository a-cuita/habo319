// Collecting on the litter page (S3-P21, the litter class's step 2): Start,
// litter pulses, Pause and Resume, Discard this stretch, End, and the summary
// with its fixes and a recorder's GPX file. The phone keeps the collection as
// it goes, so a litter pulse works with no signal; each stretch waits in a
// queue until it reaches HABO (Q242, Q255), and closing the page doesn't end
// a collection (Q282). Step 3 (S3-P22): the summary's map of its readings,
// and the break question after 10 collections (item 7). Oct 24, in chat:
// planning a collection before you start (needed until you have as many
// collections as the break question waits for), XP for a planned one, Mark
// turnaround, and Discard this collection. S5 (Oct 29, in chat): one Litter
// pulse button for everything (Weigh, New bag, Pause, Resume, End), GPS
// check-ins, no stretches or turnarounds, and your GPX track as the path.
// Load geo.js and Leaflet first; litter.js calls LitterCollect(app) with its
// helpers.
window.LitterCollect = function (app) {
  'use strict';

  var G = window.LitterGeo;
  var $ = app.$;
  var KEY = 'habo-litter-collect';
  var STREETS_KEY = 'habo-litter-streets';
  var TYPES_KEY = 'habo-litter-types';
  var OVERPASS = 'https://overpass-api.de/api/interpreter';
  var ROUGH_M = 80;             // a location rougher than 80 m is asked to be tapped (Q313)
  var HOME_CELL = '357940_-805900';   // downtown Montgomery: where sunset is reckoned with no collection going

  var c = load(KEY);            // the collection on this phone, or null
  // A copy kept before the cells were halved (S5) has the old cells: it's let
  // go, unless it holds litter pulses that haven't reached HABO.
  if (c && c.grid !== 160 && !(c.queue && c.queue.length)) { c = null; keep(KEY, null); }
  var streets = null, streetsBox = null;
  var map = null, layers = null;
  var pulse = null;             // the litter pulse being filled in
  var summary = null;           // the summary after End
  var GPX_SAY = $('sm-gpx-say').textContent;
  var planning = null;          // the plan being made, before a collection
  var account = null;           // what the account page last loaded: plan, planNeeded, xp
  var types = load(TYPES_KEY) || [];   // kept on the phone too, for no signal (S5)
  var settings = { sunsetWarnMin: 60, noStartMin: 15, autoEndHours: 12, editHours: 48, breakAfter: 10, planXp: 1, colours: ['#2c7bb6', '#f6e8c3', '#8c510a'] };
  var pace = null;              // your usual pace, from your own stretches (item 7)
  var sending = false;
  var SIM_KEY = 'habo-litter-sim';   // the Simulated walk switch, kept on this computer (S5-U2)
  var lastTap = null;           // where the map was last clicked
  var SIM_SAY = 'A simulated walk: the line you drew stands in for your GPX track. It sets where you walked, and the miles.';

  /* ── Kept on the phone ── */

  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function keep(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* this visit only */ } }
  // Head Builder mode draws in its own colours, from the Settings tab (S5-U2 round 3, Q528).
  function darkColours() { return app.builderMode && app.builderMode() && settings.dark ? settings.dark : null; }
  function scale() { var k = darkColours(); return k ? k.colours : settings.colours; }
  function save() { keep(KEY, c); }
  function setTypes(list) {
    if (!list || !list.length) return;
    types = list;
    keep(TYPES_KEY, types);
  }
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

  // The question for End in the same cell (Q398).
  var sameYes = null;
  function sameCell(yes) {
    sameYes = yes;
    $('cl-actions').hidden = true;
    $('cl-same').hidden = false;
    $('cl-same').scrollIntoView({ block: 'center' });
    return Promise.resolve();
  }
  function sameAnswer(collected) {
    $('cl-same').hidden = true;
    if (collected) { var y = sameYes; sameYes = null; return y && y(); }
    sameYes = null;
    // It ends when your last litter pulse was, with no new stretch.
    c.queue.push({ type: 'end', endedAt: c.current.startedAt });
    c.ended = true;
    save();
    $('cl-actions').hidden = false;
    $('v-collect').hidden = true;
    showWaitingSummary();
    flush();
  }

  /* ── Sending what the phone kept ── */

  // Sends the queue in order; what doesn't go waits for the next try.
  function flush() {
    if (sending || !c) { showQueue(); return Promise.resolve(); }
    if (c.ckOut && c.ckOut.length) return sendCheckins().then(flush, function () { if (c.ended) savedLater(); showQueue(); });
    if (!c.queue.length) { showQueue(); return Promise.resolve(); }
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
      if (c.ended) savedLater();
      showQueue();
    });
  }

  // GPS check-ins go ahead of the queue, in batches.
  function sendCheckins() {
    sending = true;
    var id = c.id, batch = c.ckOut.slice(0, 500);
    return app.api('collectCheckins', { token: app.myToken(), collectionId: id, checkins: batch }).then(function () {
      sending = false;
      if (c && c.id === id) { c.ckOut = c.ckOut.slice(batch.length); save(); }
    }, function (err) {
      sending = false;
      if (err.code === 'signed-out') app.signedOut();
      throw err;
    });
  }

  // A GPS check-in (S5, Oct 29, in chat): where the phone was, and when, so
  // a GPX track can be lined up with the walk. kind: s (Start), w (Weigh),
  // n (New bag), z (Pause), r (Resume), e (End) or m (once a minute).
  function checkin(pos, kind) {
    if (!c || !pos) return;
    var k = [Date.now(), Math.round(pos.lat * 1e5) / 1e5, Math.round(pos.lon * 1e5) / 1e5, Math.round(pos.acc || 0), kind];
    c.checkins = (c.checkins || []).concat([k]).slice(-1500);
    c.ckOut = (c.ckOut || []).concat([k]);
    save();
  }
  // Where the phone was last: its last check-in, or the middle of the last
  // cell, marked rough.
  function lastPlace() {
    var k = c && c.checkins && c.checkins[c.checkins.length - 1];
    if (k) return { lat: k[1], lon: k[2], acc: 999 };
    var p = c && c.lastCell ? G.cellCenter(c.lastCell) : null;
    return p ? { lat: p.lat, lon: p.lon, acc: 999 } : null;
  }
  // About once a minute while the collecting screen is open and the phone
  // awake, paused or not (paused time doesn't count); they go with the next
  // litter pulse.
  setInterval(function () {
    if (!c || c.ended || c.sim || $('v-collect').hidden || document.hidden || !navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(function (p) {
      if (!c || c.ended) return;
      checkin({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }, 'm');
    }, function () { /* no fix this minute */ }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }, 60000);

  function showQueue() {
    var n = c ? c.queue.filter(function (q) { return q.type === 'stretch'; }).length : 0;
    $('cl-queue').textContent = n ? (n === 1 ? '1 litter pulse is' : n + ' litter pulses are') + ' kept on this phone, waiting for signal.' : '';
    $('cl-queue').hidden = !n;
    $('cl-error').textContent = c && c.lastError ? 'HABO couldn\'t take a litter pulse: ' + c.lastError : '';
  }

  window.addEventListener('online', function () { flush(); });

  /* ── The account page ── */

  // Under the account: hours collecting, XP, the plan, and Start (or Back to
  // my collection). Start waits for a plan until you have as many
  // collections as the break question waits for.
  function onAccount() {
    $('cl-account').hidden = false;
    closeStartAsks();
    $('cl-hours').textContent = '';
    showPlanLine();
    $('cl-sim-box').hidden = !simAllowed();
    $('cl-sim-say').hidden = true;
    $('cl-sim-info').setAttribute('aria-expanded', 'false');
    $('cl-sim').checked = simOn();
    return app.api('collectLoad', { token: app.myToken() }).then(function (d) {
      settings = d.settings || settings;
      pace = d.pace || null;
      setTypes(d.types);
      account = { plan: d.plan || null, planNeeded: !!d.planNeeded, xp: d.xp || 0,
        // Open on HABO but not on this phone, as after signing in again (Q409).
        open: d.collection && d.collection.status === 'Collecting' && !c ? d.collection : null };
      var h = d.hours || { collections: 0, hours: 0 };
      $('cl-hours').textContent = h.collections ? 'Your volunteer hours collecting litter: ' + h.hours + ' (' + h.collections + ' collection' + (h.collections === 1 ? '' : 's') + ').' : '';
      // A collection open here but ended there (left alone 12 hours, or ended
      // or discarded on another phone, C540): forget it.
      if (c && !c.ended && !c.queue.length && (!d.collection || d.collection.id !== c.id || d.collection.status !== 'Collecting')) { c = null; save(); keep(STREETS_KEY, null); }
      showPlanLine();
      showSun($('cl-account-sun'), null);
    }, function () { /* the account page shows without it */ });
  }

  // Opening the page with a collection going here that was ended or
  // discarded on another phone or browser (S3-P27, C540): this phone's copy
  // is forgotten, and the account page shows.
  function endedElsewhere() {
    if (!c || c.ended || c.queue.length) return;
    var id = c.id;
    app.api('collectLoad', { token: app.myToken(), collectionId: id }).then(function (d) {
      if (!c || c.id !== id || c.ended || c.queue.length || !d.collection || d.collection.id !== id || d.collection.status === 'Collecting') return;
      c = null; save(); keep(STREETS_KEY, null);
      app.showAccount();
      app.notice('That collection was ended on another phone or browser.');
    }, function () { /* no signal: it stays as it is */ });
  }

  function showPlanLine() {
    var a = account || { plan: null, planNeeded: false, xp: 0 };
    var going = !!(c && !c.ended) || !!(!c && a.open);
    $('cl-start').textContent = going ? 'Back to my collection' : 'Start collecting';
    $('cl-plan-btn').hidden = going;
    $('cl-xp').hidden = !account;
    // Just your XP: how it's earned belongs in training (|C511, S3-P30).
    $('cl-xp').textContent = 'Your XP: ' + a.xp + '.';
    var line = $('cl-plan');
    line.className = 'lt-plan-line';
    if (going) line.textContent = '';
    else if (a.plan) line.textContent = 'Your plan: ' + plural(planCells(a.plan).length, 'cell', 'cells') + ', ' + round(a.plan.miles, 2) + ' mi. Start collecting uses it.';
    else if (a.planNeeded) {
      line.className = 'lt-plan-line need';
      line.textContent = 'Plan your collection first. Until you have ' + settings.breakAfter + ' collections, each one starts from a plan, so the app learns your usual pace.';
    } else line.textContent = account ? 'A plan is up to you now; a planned collection still earns XP.' : '';
    $('cl-start').disabled = !going && !!account && a.planNeeded && !a.plan;
  }

  function plural(n, one, many) { return n + ' ' + (n === 1 ? one : many); }

  // A plan's cells, each once (S5: a plan is just cells).
  function planCells(plan) {
    var out = [];
    (plan && plan.stretches || []).forEach(function (s) { (s.cells || []).forEach(function (x) { if (isCell(x) && out.indexOf(x) === -1) out.push(x); }); });
    return out;
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
    box.textContent = now >= s.sunset ? 'The sun has set (' + clock(s.sunset) + '). No XP is earned after sunset, and a weighing that goes past it earns no volunteer hours.'
      : 'Sunset is at ' + clock(s.sunset) + '. After it, no XP is earned, and a weighing that goes past it earns no volunteer hours.';
  }
  setInterval(function () { if (!$('v-collect').hidden) showSun($('cl-sun'), null); }, 60000);

  /* ── Where the phone is ── */

  // The phone's location, once: its cell, or null when it's rough or turned
  // off, so the cell is tapped (Q313, Q314); and where exactly, for a GPS
  // check-in. (Q168 had the page not track you; S5 keeps check-ins while a
  // collection is going and the page is open.)
  function locate() {
    // On a simulated walk, where you are is the end of your line (S5-U2).
    if (c && c.sim && !c.ended) {
      var e = simEnd();
      return Promise.resolve(e ? { cell: G.cellAt(e.lat, e.lon), pos: e } : { cell: null, why: 'sim' });
    }
    return new Promise(function (resolve) {
      if (!navigator.geolocation) return resolve({ cell: null, why: 'off' });
      navigator.geolocation.getCurrentPosition(function (p) {
        var pos = { lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy };
        var cell = G.cellAt(pos.lat, pos.lon);
        resolve(p.coords.accuracy > ROUGH_M ? { cell: null, near: cell, why: 'rough', pos: pos } : { cell: cell, pos: pos });
      }, function () { resolve({ cell: null, why: 'off' }); }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 });
    });
  }

  /* ── Start ── */

  // While you wait on HABO (Jeremy, on C477; any time, M479): a screen over
  // the page, so nothing can be pressed twice, with staff's sayings shown in
  // turn, 8 seconds each, long enough to read (S5, round 2). `tag` says what
  // it's for, so only that can take it down.
  var sayingTimer = null, busyFor = null;
  var STARTING = 'Starting your collection, please wait...';
  function showBusy(title, tag) {
    $('cl-starting').querySelector('.lt-scrim-title').textContent = title || STARTING;
    busyFor = tag || null;
    if (!$('cl-starting').hidden) return;
    $('cl-starting').hidden = false;
    var list = (settings.sayings || []).slice();
    var k = list.length ? Math.floor(Math.random() * list.length) : 0;
    var next = function () { $('cl-saying').textContent = list.length ? list[k++ % list.length] : ''; };
    next();
    clearInterval(sayingTimer);
    if (list.length > 1) sayingTimer = setInterval(next, 8000);
  }
  function hideBusy() {
    clearInterval(sayingTimer);
    sayingTimer = null;
    busyFor = null;
    $('cl-starting').hidden = true;
  }
  function busyWhile(title, work) {
    showBusy(title);
    return Promise.resolve().then(work).then(function (v) { hideBusy(); return v; }, function (e) { hideBusy(); throw e; });
  }

  function start(button) {
    if (c && !c.ended) return openCollect();
    // Your collection is open on HABO, not on this phone: pick it up from the
    // last litter pulse that reached HABO (Q409).
    if (!c && account && account.open) {
      var open = account.open;
      return app.busy(button, 'cl-start-err', function () {
        showBusy(STARTING);
        return startHere(open.startCell).then(function () { account.open = null; hideBusy(); app.notice('Picked up from your last litter pulse.'); }, function (err) { hideBusy(); throw err; });
      });
    }
    // A simulated walk starts where you click on the map (S5-U2).
    if (simOn()) {
      openCollect();
      beginPick(null, 'sim', function (cell) { return startAt(cell, lastTap, true); });
      return;
    }
    showBusy(STARTING);
    app.busy(button, 'cl-start-err', function () {
      return locate().then(function (loc) {
        if (!loc.cell) {
          // No location: pick the cell on the map, then Start.
          hideBusy();
          openCollect();
          beginPick(loc.near, loc.why, function (cell) { return startAt(cell); });
          return;
        }
        return startAt(loc.cell, loc.pos);
      });
    }).then(hideBusy);
  }

  // Your GPX recording first (S5, round 2, C551): before a new collection
  // starts, a pop-up to start the recording in your GPX app, then one to
  // start collecting. Your GPX track is required: no track, no Litter Index
  // and no XP (Jeremy, Oct 29). When you confirmed the recording is kept, and
  // the track before it is cut; the time between the two is a safety buffer.
  var recordingAt = null;
  function closeStartAsks() { $('cl-rec').hidden = true; $('cl-ready').hidden = true; }

  function startAt(cell, pos, sim) {
    showBusy(STARTING);
    return startHere(cell, pos, sim).then(hideBusy, function (err) { hideBusy(); throw err; });
  }

  function startHere(cell, pos, sim) {
    var s = sunAt(cell), now = Date.now();
    if (!sim && (now >= s.sunset - settings.noStartMin * 60000 || now < s.sunrise)) {
      return Promise.reject(new Error('No new collection can start from ' + settings.noStartMin + ' minutes before sunset until sunrise.'));
    }
    return app.api('collectStart', { token: app.myToken(), cell: cell, key: uid(), recordingAt: recordingAt, simulated: !!sim }).then(function (d) {
      recordingAt = null;
      settings = d.settings || settings;
      pace = d.pace || pace;
      var col = d.collection;
      c = { id: col.id, grid: 160, startedAt: col.started, startCell: col.startCell, n: 1, lastCell: col.startCell, queue: [], scalePrev: 0, bagReset: false,
        current: { startedAt: col.started, startCell: col.startCell, pausedMin: 0 }, totals: { pounds: 0, miles: 0, minutes: 0 }, ended: false,
        plan: d.plan || null, checkins: [], ckOut: [], sim: !!col.simulated, line: [] };
      if (account) account.plan = null;
      if (d.already && col.started) c.current.startedAt = col.started;
      if (d.already && d.stretches && d.stretches.length) pickUp(d.stretches);
      save();
      if (pos && !d.already) checkin(pos, 's');
      if (c.sim && pos && !d.already) { c.line.push([pos.lat, pos.lon]); save(); }
      return fetchStreets(cell).catch(function () {
        app.notice('The streets around you couldn\'t load just now. The map shows them once they do.');
      }).then(function () { openCollect(); });
    });
  }

  // Picking a collection up after signing in again (S3-P27, Q409): from the
  // last litter pulse that reached HABO, so nothing counts twice.
  function pickUp(list) {
    var last = list[list.length - 1];
    c.n = last.n + 1;
    c.lastCell = last.pulseCell || last.cells[last.cells.length - 1];
    c.current = { startedAt: last.ended, startCell: c.lastCell, pausedMin: 0 };
    c.totals = { pounds: 0, miles: 0, minutes: 0 };
    list.forEach(function (s) {
      c.totals.minutes += s.activeMin || 0;
      if (s.discarded) return;
      c.totals.pounds += s.pounds || 0;
      c.totals.miles += (s.streetMi || 0) + (s.offMi || 0);
    });
    c.bagReset = !!last.discarded;
    c.scalePrev = last.discarded || last.newBag || last.scale == null ? 0 : last.scale;
    c.checkins = c.checkins || [];
    c.ckOut = c.ckOut || [];
  }

  /* ── The collecting screen ── */

  function openCollect() {
    $('cl-map-box').appendChild($('cl-map'));
    loadStreets();
    app.show('v-collect');
    $('cl-discard-box').hidden = true;
    $('cl-actions').hidden = !!pulse;
    ensureMap();
    drawPlan(c && c.plan);
    drawCells([], c && c.lastCell, null);
    drawSim();
    showStatus();
    showSun($('cl-sun'), null);
    refreshTypes();
    flush();
  }

  // The litter types for a litter pulse, whenever the collecting screen
  // opens: reopening the page during a collection used to skip them, so the
  // drawer had nothing to tick (S5, Oct 29). Kept on the phone for no signal.
  function refreshTypes() {
    return app.api('collectLoad', { token: app.myToken(), collectionId: c && c.id }).then(function (d) {
      settings = d.settings || settings;
      if (!d.types || !d.types.length) return;
      var ticked = pulse ? picked() : [];
      setTypes(d.types);
      if (!pulse) return;
      showTypes();
      ticked.forEach(function (t) { var i = document.querySelector('#pf-types input[value="' + t.replace(/"/g, '\\"') + '"]'); if (i) i.checked = true; });
      showPicked();
    }, function () { /* no signal: the kept list stands */ });
  }

  function showStatus() {
    if (!c) return;
    var t = c.totals;
    $('cl-since').textContent = 'Collecting since ' + clock(c.startedAt) + (c.current.pausedAt ? ' · Paused at ' + clock(c.current.pausedAt) : '');
    $('cl-totals').textContent = round(t.pounds, 2) + ' lb · ' + round(t.miles, 2) + ' mi · ' + Math.round(t.minutes) + ' min active';
    // Paused, a litter pulse offers Resume and End.
    $('cl-pause').textContent = c.current.pausedAt ? 'Resume' : 'Pause';
    ['cl-weigh', 'cl-newbag'].forEach(function (id) { $(id).hidden = !!c.current.pausedAt; });
    showQueue();
  }

  function round(n, p) { var f = Math.pow(10, p); return Math.round(n * f) / f; }

  /* ── The map (Q386) ── */

  function ensureMap() {
    if (map || !window.L) { if (!window.L) $('cl-map-note').textContent = 'The map couldn\'t load. Check your signal, then open the page again.'; return; }
    map = L.map('cl-map', { zoomControl: true, attributionControl: true });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(map);
    layers = { streets: L.layerGroup().addTo(map), plan: L.layerGroup().addTo(map), cells: L.layerGroup().addTo(map), sim: L.layerGroup().addTo(map) };
    map.on('click', function (e) {
      lastTap = { lat: e.latlng.lat, lon: e.latlng.lng, acc: 5 };
      if (simDraws()) return simAdd(lastTap);
      tapCell(G.cellAt(e.latlng.lat, e.latlng.lng));
    });
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
      L.polyline(pts, { color: darkColours() ? darkColours().streets : '#555', weight: 3, opacity: 0.7, interactive: false }).addTo(layers.streets);
    });
  }

  // Draws the cells: the stretch (orange), the cell you're in (outlined),
  // and the stretch's turnarounds (dots).
  function drawCells(list, here, center, turns) {
    if (!map) return;
    layers.cells.clearLayers();
    (list || []).forEach(function (cell) {
      L.rectangle(G.cellBounds(cell), { color: '#c2410c', weight: 1, fillColor: '#f97316', fillOpacity: 0.35, interactive: false }).addTo(layers.cells);
    });
    if (here) L.rectangle(G.cellBounds(here), { color: '#1d4ed8', weight: 3, fill: false, interactive: false }).addTo(layers.cells);
    (turns || []).forEach(function (cell) { turnDot(cell, '#1d4ed8').addTo(layers.cells); });
    if (center) { var p = G.cellCenter(center); map.setView([p.lat, p.lon], map.getZoom()); }
    setTimeout(function () { map.invalidateSize(); }, 0);
  }

  function turnDot(cell, colour) {
    var p = G.cellCenter(cell);
    return L.circleMarker([p.lat, p.lon], { radius: 7, color: '#fff', weight: 2, fillColor: colour, fillOpacity: 1, interactive: false });
  }

  // Your plan, as a guide while you collect: dashed outlines, its
  // turnarounds as dots. It never changes a stretch (Q228).
  // Only cells are drawn: a plan read before C540's fix can hold a bare "/".
  function drawPlan(plan) {
    if (!map) return;
    layers.plan.clearLayers();
    var colour = darkColours() ? darkColours().plan : '#7c3aed';
    (plan && plan.stretches || []).forEach(function (s) {
      (s.cells || []).filter(isCell).forEach(function (cell) {
        L.rectangle(G.cellBounds(cell), { color: colour, weight: 2, dashArray: '5 4', fill: false, interactive: false }).addTo(layers.plan);
      });
      (s.turns || []).filter(isCell).forEach(function (cell) { turnDot(cell, colour).addTo(layers.plan); });
    });
  }
  function isCell(x) { return /^-?\d+_-?\d+$/.test(String(x)); }

  /* ── A simulated walk (S5-U2) ── */

  // A Head Builder's walk from the desk: drawn as a line on the map, point by
  // point, as you go (Q497, Q498). Each point is a check-in; the end of the
  // line is where you are. No GPS and no recorder.
  function simAllowed() { var a = app.me && app.me(); return !!a && a.rank === 'Head Builder'; }
  function simOn() { return simAllowed() && load(SIM_KEY) === true; }
  function simDraws() { return !!(c && c.sim && !c.ended && !picking && !pulse && !$('v-collect').hidden); }
  function simEnd() {
    var l = c && c.line && c.line[c.line.length - 1];
    if (l) return { lat: l[0], lon: l[1], acc: 5 };
    var p = lastPlace();   // picked up on another computer: from the last check-in
    return p ? { lat: p.lat, lon: p.lon, acc: 5 } : null;
  }
  function simAdd(p) {
    if (!c.line.length) { var e = simEnd(); if (e) c.line.push([e.lat, e.lon]); }
    c.line.push([p.lat, p.lon]);
    checkin(p, 'm');
    drawSim();
    drawCells([], G.cellAt(p.lat, p.lon), null);
  }
  function drawSim() {
    $('cl-sim-note').hidden = !(c && c.sim && !c.ended);
    if (!map) return;
    layers.sim.clearLayers();
    if (!(c && c.sim && c.line && c.line.length)) return;
    var colour = darkColours() ? darkColours().sim : '#15803d';
    L.polyline(c.line, { color: colour, weight: 4, interactive: false }).addTo(layers.sim);
    L.circleMarker(c.line[c.line.length - 1], { radius: 6, color: '#fff', weight: 2, fillColor: colour, fillOpacity: 1, interactive: false }).addTo(layers.sim);
  }

  // On the summary, the line stands in for the GPX track (Q499): its points
  // are the walk's check-ins, with where the line was at each weighing's
  // start and end, so each weighing gets the part drawn in it.
  function useLine() {
    if (!summary || !summary.collection) return;
    var ks = (summary.collection.checkins || []).filter(function (k) { return (k[3] || 0) < 999; }).sort(function (a, b) { return a[0] - b[0]; });
    if (!ks.length) { app.notice('This walk has no drawn line.'); return; }
    var at = function (t) { var p = ks[0]; ks.forEach(function (k) { if (k[0] <= t) p = k; }); return p; };
    var pts = ks.map(function (k) { return { lat: k[1], lon: k[2], t: k[0] }; });
    summary.stretches.forEach(function (s) {
      [Number(s.started), Number(s.ended)].forEach(function (t) { if (isFinite(t)) { var k = at(t); pts.push({ lat: k[1], lon: k[2], t: t }); } });
    });
    showBusy('Reading your drawn line, please wait...');
    useGpx('<gpx><trk><trkseg>' + pts.map(function (p) {
      return '<trkpt lat="' + p.lat + '" lon="' + p.lon + '"><time>' + new Date(p.t).toISOString() + '</time></trkpt>';
    }).join('') + '</trkseg></trk></gpx>');
  }

  var picking = null;   // { done(cell) } while a cell is being picked
  function beginPick(near, why, done) {
    picking = { done: done };
    $('cl-pick').hidden = false;
    $('cl-pick').textContent = why === 'sim' ? 'Simulated walk: click the map where your walk starts.'
      : why === 'rough' ? 'Your phone\'s location is rough just now. Tap the cell you\'re in on the map.'
      : 'Your phone\'s location is off. Tap the cell you\'re in on the map.';
    if (near) drawCells([], near, near);
  }

  function tapCell(cell) {
    if (planning && !$('v-plan').hidden) return planTap(cell);
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
      fitMap();
      return;
    }
    if (summary && summary.whereMode) {
      summary.breakWhere = cell;
      summary.whereMode = false;
      $('sf-where-shown').textContent = 'Where you were: the cell you tapped.';
      return;
    }
    if (summary && summary.editing) return summaryTap(cell);
  }

  /* ── The litter pulse (item 2) ── */

  // The Litter pulse button (S5, Oct 29, in chat): Weigh, New bag, Pause or
  // Resume, and End, each a GPS check-in.
  function openChooser() {
    if (!c) return;
    showStatus();
    $('cl-chooser').hidden = !$('cl-chooser').hidden;
  }
  function closeChooser() { $('cl-chooser').hidden = true; }

  // kind: 'weigh' (the bag so far), 'newbag' (this full bag, then an empty
  // one) or 'end'. The litter since your last weighing goes on the path you
  // walked since then.
  function beginPulse(kind, button) {
    if (!c) return;
    var pressedAt = Date.now();
    var askedSame = false;
    var go = function (cell, pos) {
      // End asks first whenever there was a weighing before it (S5-P1,
      // Q506: a place test missed it at the greenhouse, C572): No ends the
      // collection where your last weighing was, with no new weighing.
      if (kind === 'end' && !askedSame && !c.current.pausedAt && c.n > 1) {
        askedSame = true;
        closeChooser();
        return sameCell(function () { go(cell, pos); });
      }
      var at = kind === 'end' && c.current.pausedAt ? c.current.pausedAt : pressedAt;
      if (pos && at === pressedAt) checkin(pos, kind === 'newbag' ? 'n' : kind === 'end' ? 'e' : 'w');
      var est = estimate(c.current.startedAt, at, cell);
      pulse = { kind: kind, pressedAt: at, cell: cell, cells: est.cells, m: { street: est.meters, off: 0 }, breakWhere: '' };
      closeChooser();
      openPulse();
    };
    if (kind === 'end' && c.current.pausedAt) return go(c.current.pauseCell, null);
    app.busy(button, 'cl-err', function () {
      return locate().then(function (loc) {
        if (loc.cell) return go(loc.cell, loc.pos);
        beginPick(loc.near, loc.why, function (cell) { return go(cell, loc.pos); });
      });
    });
  }

  // Where you walked since your last weighing, from your check-ins (S5): the
  // cells they're in and between them, and the miles walked, leaving out
  // paused time and moves smaller than a check-in's accuracy. An estimate,
  // until your GPX track replaces it.
  function estimate(from, to, cell) {
    var pts = (c.checkins || []).filter(function (p) { return p[0] >= from - 2000 && p[0] <= to + 2000; });
    var cells = [], meters = 0, last = null, paused = false;
    var add = function (x) { if (cells.indexOf(x) === -1) cells.push(x); };
    pts.forEach(function (p) {
      if (paused && p[4] !== 'r') return;
      var here = G.xy(p[1], p[2]);
      if (paused) { paused = false; last = here; add(G.cellAt(p[1], p[2])); return; }
      if (!last) last = here;
      else if (G.dist(last, here) > Math.max(10, p[3] || 0)) { meters += G.dist(last, here); G.lineCells(last, here).forEach(add); last = here; }
      add(G.cellAt(p[1], p[2]));
      if (p[4] === 'z') paused = true;
    });
    if (cell) add(cell);
    if (!cells.length && c.current.startCell) add(c.current.startCell);
    return { cells: cells, meters: meters };
  }

  function openPulse() {
    $('cl-actions').hidden = true;
    $('cl-pulse').hidden = false;
    document.body.classList.add('lt-has-bar');
    $('pf-title').textContent = pulse.kind === 'end' ? 'End: weigh your last bag' : pulse.kind === 'newbag' ? 'New bag: weigh this full bag' : 'Weigh the bag so far';
    $('pf-scale').value = '';
    setRating('', 'auto');
    $('pf-break').value = '';
    $('pf-where-shown').textContent = '';
    $('pf-err').textContent = '';
    $('pf-odd').hidden = true;
    $('pf-bag-hint').textContent = pulse.kind === 'newbag' ? 'Include the bag. Then drop it in any bin, and start an empty one.'
      : c.bagReset ? 'You started a new bag after the weighing you discarded: weigh only the new bag.' : 'Include the bag. The app does the subtracting.';
    stepsFor(pulse.kind);
    $('pf-end-row').hidden = pulse.kind !== 'end';
    if (pulse.kind === 'end') $('pf-end').value = toTimeInput(pulse.pressedAt);
    $('pf-save').textContent = pulse.kind === 'end' ? 'Save and end' : 'Save litter pulse';
    showTypes();
    pulse.step = 0;
    showStep();
  }

  function closePulse() {
    pulse = null;
    $('cl-pulse').hidden = true;
    $('pf-drawer').hidden = true;
    $('cl-map-box').classList.remove('strip');
    document.body.classList.remove('lt-has-bar');
    $('cl-actions').hidden = false;
  }

  // The map full size on step 1, where the stretch is changed by tapping it,
  // and while you tap where your break was; a strip at the top on the other
  // steps, so each fits on the screen (S3-P27, Q455). Each step starts with the
  // map at the top of the screen.
  function fitMap() {
    if (!pulse) return;
    $('cl-map-box').classList.toggle('strip', STEPS[pulse.step] !== 'stretch' && !pulse.whereMode);
    $('cl-map-box').scrollIntoView({ block: 'start' });
    if (!map) return;
    map.invalidateSize();
    var p = G.cellCenter(pulse.cell);
    map.setView([p.lat, p.lon], map.getZoom(), { animate: false });
  }

  // One thing per screen (S3-P27, Q397): the scale, litter types, the visual
  // rating since your last weighing, and a break, with Next and Back; the
  // stretch step went with stretches (S5). Litter types and a break can be
  // skipped; the rating can't, as no Litter Index comes without one (Q403, S5).
  // No break step (S5-P1, C606: Pause covers breaks); the last step stays
  // only for End, with Stop the clock at.
  var STEPS = ['scale', 'types', 'rating', 'break'];
  function stepsFor(kind) { STEPS = kind === 'end' ? ['scale', 'types', 'rating', 'break'] : ['scale', 'types', 'rating']; }
  function showStep() {
    var i = pulse.step;
    Array.prototype.forEach.call(document.querySelectorAll('#cl-pulse .pf-step'), function (d) { d.hidden = d.dataset.step !== STEPS[i]; });
    $('pf-step-n').textContent = 'Step ' + (i + 1) + ' of ' + STEPS.length;
    $('pf-back').hidden = i === 0;
    $('pf-next').hidden = i === STEPS.length - 1;
    $('pf-save').hidden = i !== STEPS.length - 1;
    $('pf-err').textContent = '';
    var why = $('pf-why');
    if (why) why.remove();
    $('pf-discard').hidden = false;
    pulse.whereMode = false;
    fitMap();
    if (STEPS[i] === 'rating') setRating($('pf-rating').value, 'auto');
  }
  function stepCheck(i) {
    if (STEPS[i] === 'scale') return scaleError();
    if (STEPS[i] === 'rating' && $('pf-rating').value === '') return 'Pick a visual rating: how littered it looked since your last weighing, from 0 to 10.';
    return '';
  }
  function nextStep() {
    var e = stepCheck(pulse.step);
    if (e) { $('pf-err').textContent = e; return; }
    pulse.step += 1;
    showStep();
  }
  function goStep(name, why) {
    pulse.step = STEPS.indexOf(name);
    showStep();
    if (why) $('pf-err').textContent = why;
  }
  function scaleError() {
    var scale = $('pf-scale').value.trim();
    var lbs = Number(scale.replace(/[^\d.]/g, ''));
    if (scale === '' || !(lbs >= 0)) return 'Type what the scale shows, in pounds, like 3.25. With no weight, press Discard this weighing.';
    var before = c.bagReset ? 0 : c.scalePrev;
    if (lbs < before) return 'The scale shows less than at your last weighing (' + before + ' lb). If you started a new bag then, the app needed to know: use New bag when you start one.';
    return '';
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
    $('pf-type-search').value = '';
    filterTypes();
    showPicked();
  }

  // Litter types in a drawer you can search (S3-P27, Q457). What you type
  // narrows the list; when nothing matches, it can be added from the same box,
  // so a near twin of a type already there isn't added by mistake.
  function openTypes() {
    $('pf-drawer').hidden = false;
    $('pf-type-err').textContent = '';
    filterTypes();
    // No keyboard until you tap the search box: it covered the list (S5).
    $('pf-types-done').focus();
  }
  function closeTypes() {
    $('pf-drawer').hidden = true;
    $('pf-type-search').value = '';
    filterTypes();
    showPicked();
    $('pf-types-open').focus();
  }
  function filterTypes() {
    var q = $('pf-type-search').value.trim().toLowerCase();
    var shown = 0;
    Array.prototype.forEach.call(document.querySelectorAll('#pf-types .lt-type'), function (l) {
      var hit = !q || l.querySelector('input').value.toLowerCase().indexOf(q) !== -1;
      l.hidden = !hit;
      if (hit) shown++;
    });
    $('pf-types-none').hidden = (!q && types.length > 0) || shown > 0;
    $('pf-types-none').textContent = !types.length && !q ? 'The litter types haven\'t loaded yet: they need signal once. Try again in a moment.' : 'No litter type has "' + $('pf-type-search').value.trim() + '" in it.';
    $('pf-type-add').hidden = !q || shown > 0;
    $('pf-type-add').textContent = 'Add "' + $('pf-type-search').value.trim() + '" as a new type';
  }
  function showPicked() {
    var p = picked();
    $('pf-types-shown').textContent = p.length ? 'Ticked: ' + p.join(', ') : 'None ticked.';
    $('pf-types-open').textContent = p.length ? 'Change litter types' : 'Choose litter types';
  }

  function addType(button) {
    var name = $('pf-type-search').value.trim();
    if (!name) return;
    app.busy(button, 'pf-type-err', function () {
      return app.api('addLitterType', { token: app.myToken(), type: name }).then(function (d) {
        var ticked = picked();
        setTypes(d.types);
        showTypes();
        ticked.concat([d.added]).forEach(function (t) {
          var i = document.querySelector('#pf-types input[value="' + t.replace(/"/g, '\\"') + '"]');
          if (i) i.checked = true;
        });
        showPicked();
      });
    });
  }

  // The visual rating as a wheel you swipe or tap (S3-P27, Q458). It starts
  // on "–", not rated, so Next waits for a rating you chose (Q403).
  var RATINGS = [''].concat([0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map(String));
  var wheelTimer = null;
  function buildWheel() {
    var w = $('pf-wheel');
    var pad = function () { var d = document.createElement('div'); d.className = 'lt-wheel-pad'; w.appendChild(d); };
    pad();
    RATINGS.forEach(function (v) {
      var d = document.createElement('div');
      d.className = 'lt-wheel-n';
      d.setAttribute('role', 'option');
      d.dataset.v = v;
      d.textContent = v === '' ? '–' : v;
      d.setAttribute('aria-label', v === '' ? 'Not rated' : v);
      d.addEventListener('click', function () { setRating(v, 'smooth'); });
      w.appendChild(d);
    });
    pad();
    w.addEventListener('scroll', function () {
      clearTimeout(wheelTimer);
      wheelTimer = setTimeout(nearestRating, 90);
    });
    w.addEventListener('keydown', function (e) {
      var k = RATINGS.indexOf($('pf-rating').value);
      if (e.key === 'ArrowRight' && k < RATINGS.length - 1) { e.preventDefault(); setRating(RATINGS[k + 1], 'smooth'); }
      if (e.key === 'ArrowLeft' && k > 0) { e.preventDefault(); setRating(RATINGS[k - 1], 'smooth'); }
    });
  }
  function wheelItem(v) { return $('pf-wheel').querySelector('.lt-wheel-n[data-v="' + v + '"]'); }
  function markRating(v) {
    $('pf-rating').value = v;
    Array.prototype.forEach.call(document.querySelectorAll('#pf-wheel .lt-wheel-n'), function (d) {
      d.classList.toggle('on', d.dataset.v === v);
      d.setAttribute('aria-selected', d.dataset.v === v ? 'true' : 'false');
    });
    $('pf-rating-shown').textContent = v === '' ? 'Not rated yet.' : 'Your rating: ' + v;
    if (v !== '' && pulse && STEPS[pulse.step] === 'rating') $('pf-err').textContent = '';
  }
  function setRating(v, how) {
    markRating(v);
    var w = $('pf-wheel'), d = wheelItem(v);
    if (!d || !w.clientWidth) return;
    w.scrollTo({ left: d.offsetLeft - (w.clientWidth - d.offsetWidth) / 2, behavior: how || 'auto' });
  }
  // The number in the middle once the wheel stops. Not while the step is
  // hidden, when every number sits at 0.
  function nearestRating() {
    var w = $('pf-wheel');
    if (!w.clientWidth || $('cl-pulse').hidden) return;
    var mid = w.scrollLeft + w.clientWidth / 2, best = null, gap = Infinity;
    Array.prototype.forEach.call(w.querySelectorAll('.lt-wheel-n'), function (d) {
      var g = Math.abs(d.offsetLeft + d.offsetWidth / 2 - mid);
      if (g < gap) { gap = g; best = d; }
    });
    if (best && best.dataset.v !== $('pf-rating').value) markRating(best.dataset.v);
  }

  function picked() {
    return Array.prototype.map.call(document.querySelectorAll('#pf-types input:checked'), function (i) { return i.value; });
  }

  function toTimeInput(ms) { var d = new Date(ms); return ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2); }
  function fromTimeInput(v, near) {
    // Left as shown, it's the moment pressed, seconds and all: cut to the
    // minute, a walk's last minute of track was lost (S5-P1, C605).
    if (v === toTimeInput(near)) return near;
    var m = /^(\d{2}):(\d{2})$/.exec(v || '');
    if (!m) return near;
    var d = new Date(near);
    d.setHours(Number(m[1]), Number(m[2]), 0, 0);
    if (d.getTime() > near + 60000) d.setDate(d.getDate() - 1);
    return d.getTime();
  }

  // Saves the litter pulse on the phone, then sends it. `discard`: Discard
  // this stretch (item 6, Q284, Q301).
  function savePulse(discard, why) {
    var err = $('pf-err');
    // Every step's check before saving: with the break step gone, the rating
    // can be the last step, and it still can't be skipped (Q403, C606).
    if (!discard) {
      for (var k = 0; k < STEPS.length; k++) {
        var stepErr = stepCheck(k);
        if (stepErr) { pulse.step = k; showStep(); err.textContent = stepErr; return; }
      }
    }
    var endedAt = pulse.kind === 'end' ? fromTimeInput($('pf-end').value, pulse.pressedAt) : pulse.pressedAt;
    var lastEnd = c.current.startedAt;
    if (endedAt < lastEnd) { err.textContent = 'The clock can\'t stop before your last litter pulse (' + clock(lastEnd) + ').'; return; }
    var scale = $('pf-scale').value.trim();
    var lbs = Number(scale.replace(/[^\d.]/g, ''));
    if (!discard) {
      var se = scaleError();
      if (se) return goStep('scale', se);
      if ($('pf-rating').value === '') return goStep('rating', 'Pick a visual rating: how littered it looked since your last weighing, from 0 to 10.');
    }
    var breakMin = Number($('pf-break').value) || 0;
    var cur = c.current;
    var pausedMin = cur.pausedMin || 0;
    // The break question (item 7) went with the break step: Pause covers a
    // break (S5-P1, C606).
    var stretch = {
      key: uid(), n: c.n, startedAt: cur.startedAt, endedAt: endedAt, cells: pulse.cells.slice(),
      streetMi: pulse.m.street / G.MILE_M, offMi: pulse.m.off / G.MILE_M, pausedMin: pausedMin, breakMin: breakMin,
      breakWhere: breakMin ? (pulse.breakWhere || 'Not sure') : '', discarded: !!discard,
      scale: discard ? '' : scale, newBag: !discard && pulse.kind === 'newbag',
      types: discard ? [] : picked(), rating: discard ? '' : $('pf-rating').value, breakAsked: !!pulse.askedBreak, reason: discard ? why || null : null, pulseCell: pulse.cell,
      turns: []
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
    var kind = pulse.kind;
    if (kind === 'end') {
      c.queue.push({ type: 'end', endedAt: endedAt });
      c.ended = true;
    } else {
      c.current = { startedAt: endedAt, startCell: pulse.cell, pausedMin: 0 };
    }
    save();
    closePulse();
    drawCells([], c.lastCell, c.lastCell);
    showStatus();
    if (discard) app.notice('Weighing discarded. Start a new bag now, so your next weighing has only new litter.');
    else if (kind === 'newbag') app.notice('Weighed. Drop the full bag in any bin, and start an empty one.');
    else if (kind !== 'end') app.notice('Weighed. Keep filling your bag.');
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
    return 'This weighing took ' + Math.round(odd.minutes) + ' minutes. At your usual pace, it would take about ' + Math.max(1, Math.round(odd.usual)) + '.';
  }

  /* ── Pause and Resume (item 6) ── */

  // Pause and Resume are check-ins, with no weighing (S5): paused time
  // doesn't count, and neither does where you went while paused.
  function pauseOrResume(button) {
    if (!c) return;
    var pausing = !c.current.pausedAt;
    app.busy(button, 'cl-err', function () {
      return locate().then(function (loc) {
        // With no location just now, where you were last, so a GPX track
        // still leaves the paused time out.
        checkin(loc.pos || lastPlace(), pausing ? 'z' : 'r');
        var cur = c.current;
        if (pausing) {
          cur.pausedAt = Date.now();
          cur.pauseCell = loc.cell || loc.near || c.lastCell;
          app.notice('Paused. Your time stops until you press Litter pulse, then Resume.');
        } else {
          cur.pausedMin = (cur.pausedMin || 0) + (Date.now() - cur.pausedAt) / 60000;
          delete cur.pausedAt; delete cur.pauseCell;
          app.notice('Resumed.');
        }
        save();
        closeChooser();
        showStatus();
        flush();
      });
    });
  }

  /* ── After End: the summary ── */

  function showWaitingSummary() {
    app.notice('');
    app.show('v-summary');
    $('sm-list').textContent = '';
    $('sm-view-box').hidden = true;
    // A GPX file waits until the collection is saved (C563: picked before, it was lost).
    $('sm-gpx').disabled = $('sm-sim-line').disabled = true;
    $('sm-gpx-say').textContent = 'You can pick your GPX file once your collection is saved.';
    $('sm-wait').hidden = false;
    $('sm-wait').textContent = 'Saving your collection…';
    showBusy('Saving your collection, please wait...', 'end');
  }
  // Saving at End didn't go: it's kept on the phone, and says so.
  function savedLater() {
    if (busyFor === 'end') hideBusy();
    $('sm-wait').textContent = 'Your collection is kept on this phone and saves when there\'s signal.' + (c && c.lastError ? ' HABO couldn\'t take it: ' + c.lastError : '');
  }

  function finish(d) {
    var id = c.id;
    summary = { id: id, collection: d.collection, stretches: d.stretches || [], track: keptTrack(d.collection) };
    c = null;
    save();
    keep(STREETS_KEY, null);
    if (busyFor === 'end') hideBusy();
    showSummary();
    if (!summary.track) gpxPop(true);
  }

  // The GPX section in a pop-up over the summary, right after End (S5-P1,
  // C575); Later, or the track saved, puts it back in the summary.
  var gpxHome = null;
  function gpxPop(open) {
    var box = $('sm-gpx-box');
    if (!gpxHome) gpxHome = { parent: box.parentNode, next: box.nextSibling };
    if (open) $('sm-gpx-slot').appendChild(box);
    else if (box.parentNode !== gpxHome.parent) gpxHome.parent.insertBefore(box, gpxHome.next);
    $('sm-gpx-pop').hidden = !open;
  }

  function showSummary() {
    if (gpxHome) gpxPop(false);
    app.show('v-summary');
    var col = summary.collection, sim = !!(col && col.simulated);
    $('sm-gpx').disabled = $('sm-sim-line').disabled = false;
    $('sm-gpx').hidden = sim;
    $('sm-sim-line').hidden = !sim;
    $('sm-gpx-say').textContent = sim ? SIM_SAY : GPX_SAY;
    $('sm-wait').hidden = true;
    $('sm-totals').textContent = round(col.pounds, 2) + ' lb · ' + round(col.miles, 2) + ' mi · ' + Math.round(col.active) + ' min active · ' + col.hours + ' volunteer hours' +
      (col.hoursNote ? ' (' + col.hoursNote + ')' : '') + (col.xp ? ' · ' + col.xp + ' XP for planning it' : '');
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
    layers.plan.clearLayers();
    var b = L.latLngBounds([]);
    summary.stretches.forEach(function (s) {
      if (s.discarded) return;
      var colour = s.index == null ? '#9ca3af' : G.indexColour(s.index, scale());
      s.cells.forEach(function (cell) {
        var r = L.rectangle(G.cellBounds(cell), { color: colour, weight: 1, fillColor: colour, fillOpacity: 0.7 });
        r.bindPopup('Weighing ' + s.n + ': ' + (s.index == null ? 'no reading' : 'Litter Index ' + round(s.index, 1)));
        r.addTo(layers.cells);
        b.extend(G.cellBounds(cell));
      });
    });
    Object.keys(summary.stops || {}).forEach(function (id) {
      L.rectangle(G.cellBounds(summary.stops[id].cell), { color: '#1d4ed8', weight: 3, fill: false, interactive: false }).addTo(layers.cells);
    });
    // Your recorder's track, where you walked, over the cells (S3-P27, M465).
    if (summary.track && summary.track.length > 1) {
      drawTrack(summary.track, layers.cells, darkColours() ? darkColours().paused : settings.pausedColour);
      summary.track.forEach(function (p) { b.extend(p); });
    }
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
      return busyWhile('Opening your collection, please wait...', function () { return app.api('collectLoad', { token: app.myToken(), collectionId: id }); }).then(function (d) {
        settings = d.settings || settings;
        setTypes(d.types);
        pace = d.pace || pace;
        summary = { id: id, collection: d.collection, stretches: d.stretches || [], track: keptTrack(d.collection) };
        showSummary();
      });
    });
  }

  function stretchCard(s) {
    var box = document.createElement('div');
    box.className = 'card lt-stretch';
    box.id = 'sm-' + s.id;
    var h = document.createElement('h3');
    h.textContent = 'Weighing ' + s.n + ' · ' + clock(s.started) + ' to ' + clock(s.ended);
    box.appendChild(h);
    var p = document.createElement('p');
    p.className = 'lt-stretch-facts';
    p.textContent = s.discarded ? 'Discarded' + (s.reason ? ' (' + s.reason + ')' : '') + ': no reading. Its time still counts.' :
      round(s.streetMi + s.offMi, 2) + ' mi · ' + Math.round(s.activeMin) + ' min · ' + (s.pounds == null ? '?' : s.pounds) + ' lb · ' +
      (s.index == null ? 'no reading yet' : 'Litter Index ' + round(s.index, 2)) + (s.rating == null ? '' : ' · Visual rating ' + s.rating) + (s.pastSunset ? ' · Past sunset: no hours' : '');
    box.appendChild(p);
    if (s.types.length) { var t = document.createElement('p'); t.className = 'muted small'; t.textContent = s.types.join(', '); box.appendChild(t); }
    if (!s.discarded) {
      var tr = document.createElement('p');
      tr.className = 'muted small lt-path-say';
      var cks = summary.collection && summary.collection.checkins;
      // A walk from before check-ins (S5) has the street miles you confirmed.
      tr.textContent = s.track ? 'Where you walked is from your GPX track.' : cks && cks.length || s.index == null ? 'No Litter Index until you save your GPX track.'
        : 'From the street miles you confirmed: save your GPX track for the miles you walked.';
      box.appendChild(tr);
    }
    // Asked once.
    var odd = !s.discarded && !s.breakMin && (!s.asked || (summary.stops && summary.stops[s.id])) ? oddTime(s.activeMin, s.streetMi + s.offMi) : null;
    // No break question on the summary either: Pause covers a break (S5-P1, C606).
    if (!s.discarded) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-secondary lt-fix';
      b.textContent = 'Fix this weighing';
      b.addEventListener('click', function () { openFix(s); });
      box.appendChild(b);
      var d = document.createElement('button');
      d.type = 'button';
      d.className = 'btn btn-secondary lt-discard-stretch';
      d.textContent = 'Discard this weighing';
      d.addEventListener('click', function () { d.hidden = true; box.appendChild(discardWhy(s)); });
      box.appendChild(d);
    }
    return box;
  }

  // Why a stretch or a collection is discarded (S3-P27, Q411, Q412, Q422,
  // Q423): one tap on a reason. For a stretch, two choices aren't reasons,
  // and say what to do instead: a clean stretch is real data, and a wrong
  // place is fixed, not discarded.
  var DISCARD_WHY = ['Entered in error', 'I wasn\'t looking for litter', 'I couldn\'t weigh it right', 'Litter from somewhere else is in the bag', 'Other'];
  function whyBox(o) {
    var box = document.createElement('div');
    box.className = 'lt-odd lt-discard-why';
    var chosen = '';
    var q = document.createElement('p');
    q.className = 'lt-odd-q';
    q.textContent = o.title;
    box.appendChild(q);
    var say = document.createElement('p');
    say.className = 'lt-discard-say';
    var other = document.createElement('input');
    other.type = 'text';
    other.className = 'lt-discard-other';
    other.maxLength = 200;
    other.placeholder = 'In a few words';
    other.hidden = true;
    var err = document.createElement('p');
    err.className = 'err';
    err.setAttribute('role', 'alert');
    err.id = o.errId;
    var go = document.createElement('button');
    go.type = 'button';
    go.className = 'btn lt-danger lt-discard-go';
    go.textContent = o.goLabel || '';
    go.hidden = true;
    var pick = function (why, b) {
      chosen = why;
      Array.prototype.forEach.call(box.querySelectorAll('.lt-why'), function (x) { x.classList.toggle('btn-primary', x === b); x.classList.toggle('btn-secondary', x !== b); });
      other.hidden = why !== 'Other';
      say.textContent = '';
      go.hidden = !why || !o.goLabel;
      if (o.onPick) o.onPick(why);
    };
    var choice = function (label, fn) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'btn btn-secondary lt-why';
      b.textContent = label;
      b.addEventListener('click', function () { fn(b); });
      box.appendChild(b);
      return b;
    };
    DISCARD_WHY.forEach(function (why) { choice(why, function (b) { pick(why, b); }); });
    if (o.redirects) {
      choice('Nothing to pick up', function (b) {
        pick('', b);
        say.textContent = 'Were you looking for litter the whole way?';
        var yes = document.createElement('button');
        yes.type = 'button'; yes.className = 'btn btn-primary lt-clean-yes'; yes.textContent = 'Yes';
        yes.addEventListener('click', function () { say.textContent = o.cleanYes; });
        var no = document.createElement('button');
        no.type = 'button'; no.className = 'btn btn-secondary lt-clean-no'; no.textContent = 'No';
        no.addEventListener('click', function () {
          var w = Array.prototype.filter.call(box.querySelectorAll('.lt-why'), function (x) { return x.textContent === DISCARD_WHY[1]; })[0];
          pick(DISCARD_WHY[1], w);
          say.textContent = 'Then it\'s discarded as "' + DISCARD_WHY[1] + '".';
        });
        say.appendChild(document.createElement('br'));
        say.appendChild(yes);
        say.appendChild(no);
      });
      choice('The map shows the wrong place', function (b) {
        pick('', b);
        say.textContent = o.wrongPlace;
      });
    }
    box.appendChild(say);
    box.appendChild(other);
    box.appendChild(go);
    if (o.onKeep) {
      var keep = document.createElement('button');
      keep.type = 'button';
      keep.className = 'btn btn-secondary lt-discard-keep';
      keep.textContent = 'Keep it';
      keep.addEventListener('click', o.onKeep);
      box.appendChild(keep);
    }
    box.appendChild(err);
    box.reason = function () { return { reason: chosen, other: other.value }; };
    go.addEventListener('click', function () {
      if (chosen === 'Other' && other.value.trim().length < 2) { err.textContent = 'Say in a few words why you\'re discarding it.'; return; }
      o.onGo(box.reason(), go, err.id);
    });
    return box;
  }

  // Discard this stretch on the summary (S3-P27, Q399).
  function discardWhy(s) {
    return whyBox({ title: 'Why are you discarding weighing ' + s.n + '?', redirects: true, errId: 'sd-err-' + s.id,
      cleanYes: 'Then keep it: a clean street is real data, and it counts. If its weight isn\'t 0, press Fix this weighing.',
      wrongPlace: 'No need to discard it: save your GPX track above, or press Fix this weighing, then Change its cells.',
      goLabel: 'Discard weighing ' + s.n,
      onGo: function (r, go, errId) { sendFix(go, s, { discard: r }, errId); },
      onKeep: function () { showSummary(); } });
  }

  // The break question on the summary (item 7), for a stretch saved without
  // it: Yes opens the fix with a break; No keeps the stretch as it is. With
  // a recorder's track, it points to the cell where the track stopped
  // longest, and asks even if the litter pulse asked.
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
    $('sf-title').textContent = 'Fix weighing ' + s.n;
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
    if (layers) layers.plan.clearLayers();
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

  function sendFix(button, s, fix, errBox) {
    app.busy(button, errBox || 'sf-err', function () {
      return busyWhile('Saving, please wait...', function () { return app.api('collectFix', { token: app.myToken(), stretchId: s.id, fix: fix }); }).then(function (d) {
        summary.collection = d.collection;
        summary.stretches = summary.stretches.map(function (x) { return x.id === d.stretch.id ? d.stretch : x; });
        if (summary.stops) delete summary.stops[s.id];
        summary.editing = false;
        summary.withBreak = false;
        summary.whereMode = false;
        $('sm-fix').hidden = true;
        $('sm-map-box').hidden = true;
        showSummary();
        app.notice(fix.discard ? 'Weighing ' + s.n + ' discarded. Its time still counts, and it\'s off the map.' : fix.breakAsked && fix.breakMin == null ? 'Kept as it is.' : 'Weighing ' + s.n + ' fixed.');
      });
    });
  }

  // Your GPX track is the path (S5, Oct 29, in chat): lined up with the
  // walk's check-ins by time, it sets each weighing's cells and miles walked,
  // and its reading; it's kept on the collection as a line. A track that
  // doesn't pass near the check-ins isn't this walk's, and is refused.
  function readGpx(file) {
    if (!summary || !summary.collection) { app.notice('You can pick your GPX file once your collection is saved.'); return; }
    var reader = new FileReader();
    reader.onerror = function () { app.notice('That file couldn\'t be read. Choose the .gpx file your GPX app saved.'); };
    reader.onload = function () {
      try { useGpx(String(reader.result)); } catch (e) { hideBusy(); app.notice('That file couldn\'t be read: ' + e.message); }
    };
    showBusy('Reading your GPX track, please wait...');
    reader.readAsText(file);
  }

  function useGpx(text) {
    var doc = new DOMParser().parseFromString(text, 'application/xml');
    var pts = Array.prototype.map.call(doc.getElementsByTagName('trkpt'), function (p) {
      var t = p.getElementsByTagName('time')[0];
      return { lat: Number(p.getAttribute('lat')), lon: Number(p.getAttribute('lon')), t: t ? Date.parse(t.textContent) : NaN };
    }).filter(function (p) { return isFinite(p.lat) && isFinite(p.lon) && isFinite(p.t); });
    if (!pts.length) { hideBusy(); app.notice('That file isn\'t a GPX track with times. Choose the .gpx file your GPX app saved.'); return; }
    pts.sort(function (a, b) { return a.t - b.t; });
    var checkins = summary.collection && summary.collection.checkins || [];
    var lined = lineUp(pts, checkins);
    if (!lined.matched) { hideBusy(); app.notice('That track doesn\'t pass where this walk\'s check-ins were. Is it the file for this walk?'); return; }
    pts.forEach(function (p) { p.t -= lined.offset; });
    // Only from when you confirmed your recording had started to End (S5,
    // round 2, C551): before and after aren't this walk.
    var col = summary.collection, from = col.recordingAt || -Infinity, to = Number(col.ended) || Infinity;
    pts = pts.filter(function (p) { return p.t >= from && p.t <= to; });
    if (pts.length < 2) { hideBusy(); app.notice('That track has nothing between when you started recording and End. Is it the file for this walk?'); return; }
    var pauses = pausesOf(checkins);
    var weighings = [], short = [];
    summary.stretches.forEach(function (s) {
      if (s.discarded) return;
      // Only a weighing the track covers from start to end; any other has
      // no Litter Index (no GPX track, no CPUE, Jeremy, Oct 29).
      var path = covers(pts, s) ? trackPath(pts, s.started, s.ended, pauses.concat(oldPause(pts, s, pauses))) : { cells: [] };
      if (path.cells.length) weighings.push({ id: s.id, cells: path.cells, miles: path.meters / G.MILE_M });
      else short.push(s.n);
    });
    pts.forEach(function (p) { p.paused = pauses.some(function (w) { return p.t > w[0] && p.t < w[1]; }); });
    summary.track = thinTrack(pts);
    showBusy('Saving your GPX track, please wait...');
    app.api('collectTrack', { token: app.myToken(), collectionId: summary.id, track: summary.track, weighings: weighings }).then(function (d) {
      hideBusy();
      gpxPop(false);
      if (d.collection) summary.collection = d.collection;
      if (d.stretches) summary.stretches = d.stretches;
      summary.stops = {};
      summary.stretches.forEach(function (s) {
        if (s.discarded) return;
        var stop = longestStop(pts, s, pauses.concat(oldPause(pts, s, pauses)));
        if (stop && !s.breakMin && oddTime(s.activeMin, s.streetMi + s.offMi)) summary.stops[s.id] = stop;
      });
      showSummary();
      $('sm-view-box').scrollIntoView({ block: 'start' });
      app.notice('Your track is saved on this collection. Where you walked, and the miles, are from it now' +
        (lined.offset ? ' (your recorder\'s clock was ' + howLong(Math.abs(lined.offset)) + ' ' + (lined.offset > 0 ? 'ahead' : 'behind') + ')' : '') + '.' +
        (short.length ? ' ' + (short.length === 1 ? 'Weighing ' + short[0] + ' has' : 'Weighings ' + short.join(', ') + ' have') + ' no Litter Index: the track doesn\'t cover all of ' + (short.length === 1 ? 'its' : 'their') + ' time.' : ''));
    }, function (err) {
      hideBusy();
      showSummary();
      app.notice('Your track is drawn on the map, but it wasn\'t saved: ' + err.message);
    });
  }

  // How far the recorder's clock is off from the phone's: the offset that
  // puts the track nearest the walk's check-ins, tried in whole hours (a
  // recorder set to another time zone), then to the minute, then to 5
  // seconds; under a minute counts as none. A track that, at every offset,
  // passes within 60 m of fewer than a third of the check-ins in its time
  // isn't this walk's. With no check-ins (a walk from before them), the
  // track's times are taken as they are.
  function lineUp(pts, checkins) {
    var ks = checkins.filter(function (k) { return (k[3] || 0) < 999; });   // not the rough ones from lastPlace
    if (!ks.length) return { matched: true, offset: 0 };
    var txy = pts.map(function (p) { return G.xy(p.lat, p.lon); });
    var kxy = ks.map(function (k) { return G.xy(k[1], k[2]); });
    var place = function (t) {
      if (t < pts[0].t || t > pts[pts.length - 1].t) return null;
      var lo = 0, hi = pts.length - 1;
      while (hi - lo > 1) { var mid = (lo + hi) >> 1; if (pts[mid].t <= t) lo = mid; else hi = mid; }
      var f = pts[hi].t > pts[lo].t ? (t - pts[lo].t) / (pts[hi].t - pts[lo].t) : 0;
      return { x: txy[lo].x + f * (txy[hi].x - txy[lo].x), y: txy[lo].y + f * (txy[hi].y - txy[lo].y) };
    };
    var score = function (o) {
      var near = 0, ds = [];
      ks.forEach(function (k, i) {
        var p = place(k[0] + o);
        if (!p) return;
        var d = G.dist(p, kxy[i]);
        ds.push(d);
        if (d <= 60 + Math.min(k[3] || 0, 60)) near++;
      });
      ds.sort(function (a, b) { return a - b; });
      return { o: o, near: near, seen: ds.length, mid: ds.length ? ds[Math.floor(ds.length / 2)] : Infinity };
    };
    var best = null;
    var tryAt = function (o) { var x = score(o); if (!best || x.near > best.near || (x.near === best.near && x.mid < best.mid)) best = x; };
    for (var h = 0; h <= 14; h++) { tryAt(h * 3600000); if (h) tryAt(-h * 3600000); }
    var base = best.o;
    for (var m = -30; m <= 30; m++) tryAt(base + m * 60000);
    base = best.o;
    for (var q = -12; q <= 12; q++) tryAt(base + q * 5000);
    if (!best.near || best.near < Math.ceil(best.seen / 3)) return { matched: false };
    return { matched: true, offset: Math.abs(best.o) >= 60000 ? best.o : 0 };
  }

  // A pause in a weighing from before check-ins (S5): its minutes were kept,
  // but not when. Resuming in another cell ended a weighing then, so the
  // pause ended where it began: it's taken as the stillest part of the track
  // that long, in the weighing, and left out (Jeremy, Oct 29: "compensate
  // for the pauses"). None when check-ins mark the weighing's pauses.
  function oldPause(pts, s, pauses) {
    var len = (s.pausedMin || 0) * 60000;
    if (!(len > 0) || len >= s.ended - s.started) return [];
    if (pauses.some(function (w) { return w[0] < s.ended && w[1] > s.started; })) return [];
    var w = pts.filter(function (p) { return p.t >= s.started && p.t <= s.ended; });
    if (w.length < 2) return [];
    var walked = [0];
    for (var k = 1; k < w.length; k++) walked.push(walked[k - 1] + G.dist(G.xy(w[k - 1].lat, w[k - 1].lon), G.xy(w[k].lat, w[k].lon)));
    // Each stretch of that length starting at a point: how far the track went in it.
    var best = null, j = 0;
    for (var i = 0; i < w.length && w[i].t <= s.ended - len; i++) {
      j = Math.max(j, i);
      while (j < w.length - 1 && w[j + 1].t <= w[i].t + len) j++;
      if (!best || walked[j] - walked[i] < best.moved) best = { moved: walked[j] - walked[i], from: w[i].t };
    }
    return best ? [[best.from, best.from + len]] : [];
  }

  // Whether the track runs from a weighing's start to its end, give or take
  // 2 minutes.
  function covers(pts, s) {
    return pts.length > 1 && pts[0].t <= s.started + 120000 && pts[pts.length - 1].t >= s.ended - 120000;
  }

  function howLong(ms) {
    var m = Math.round(ms / 60000), h = Math.floor(m / 60);
    m -= h * 60;
    return (h ? h + (h === 1 ? ' hour' : ' hours') : '') + (h && m ? ' ' : '') + (m || !h ? m + (m === 1 ? ' minute' : ' minutes') : '');
  }

  // Paused times, from the check-ins: [from, to] for each Pause to its Resume.
  function pausesOf(checkins) {
    var out = [], at = null;
    checkins.forEach(function (k) {
      if (k[4] === 'z' && at == null) at = k[0];
      else if (k[4] === 'r' && at != null) { out.push([at, k[0]]); at = null; }
    });
    if (at != null) out.push([at, Infinity]);
    return out;
  }

  // A weighing's part of the track: the cells it passes through, and the
  // miles walked, counting moves of 5 m or more, and nothing while paused,
  // even where the recorder was paused too and has no points then.
  function trackPath(pts, from, to, pauses) {
    var cells = [], meters = 0, last = null, lastT = null;
    var add = function (x) { if (cells.indexOf(x) === -1) cells.push(x); };
    pts.forEach(function (p) {
      if (p.t < from || p.t > to) return;
      if (pauses.some(function (w) { return p.t > w[0] && p.t < w[1]; })) { last = null; return; }
      var here = G.xy(p.lat, p.lon);
      add(G.cellAt(p.lat, p.lon));
      if (last && pauses.some(function (w) { return w[0] >= lastT && w[0] < p.t; })) last = null;
      lastT = p.t;
      if (!last) { last = here; return; }
      var d = G.dist(last, here);
      if (d >= 5) { meters += d; G.lineCells(last, here).forEach(add); last = here; }
    });
    return { cells: cells, meters: meters };
  }

  // Where the track stayed longest in one cell during a weighing (item 7),
  // not counting paused time: { cell, minutes }, or null for under 5 minutes.
  function longestStop(pts, s, pauses) {
    var best = null, run = null;
    pts.forEach(function (p) {
      if (p.t < s.started || p.t > s.ended) return;
      if (pauses.some(function (w) { return p.t > w[0] && p.t < w[1]; })) { run = null; return; }
      var cell = G.cellAt(p.lat, p.lon);
      if (run && run.cell === cell) run.last = p.t; else run = { cell: cell, first: p.t, last: p.t };
      if (!best || run.last - run.first > best.last - best.first) best = { cell: run.cell, first: run.first, last: run.last };
    });
    return best && best.last - best.first >= 5 * 60000 ? { cell: best.cell, minutes: (best.last - best.first) / 60000 } : null;
  }

  // A track to keep: points about 5 m apart or more, at most 2,000.
  function thinTrack(pts) {
    var out = [];
    pts.forEach(function (p) {
      var last = out[out.length - 1];
      var mark = p.paused ? 1 : 0;
      if (!last || (last[2] || 0) !== mark || Math.abs(p.lat - last[0]) > 0.00005 || Math.abs(p.lon - last[1]) > 0.00005) out.push(mark ? [p.lat, p.lon, 1] : [p.lat, p.lon]);
    });
    if (out.length > 2000) { var k = Math.ceil(out.length / 2000), all = out; out = all.filter(function (x, i) { return i % k === 0; }); }
    return out;
  }
  // A track, the paused parts faded in their own colour, solid (S5-P1, Q507).
  function drawTrack(track, layer, paused) {
    var line = darkColours() ? darkColours().track : '#111827';
    G.trackRuns(track).forEach(function (run) {
      L.polyline(run.pts, run.paused ? { color: paused || '#9ca3af', weight: 3, opacity: 0.55, interactive: false, className: 'lt-track-paused' }
        : { color: line, weight: 3, opacity: 0.85, interactive: false, className: 'lt-track-line' }).addTo(layer);
    });
  }
  function keptTrack(col) { return col && col.track && col.track.length > 1 ? col.track : null; }

  /* ── Discard this collection (Oct 24, in chat) ── */

  // Asked twice, and each time its button waits a moment before it can be
  // pressed, so a quick tap can't discard it by accident.
  var discardStep = 0;
  var collectionWhy = null;
  function askDiscard(step) {
    discardStep = step;
    var old = $('cd-why');
    if (old) old.remove();
    var shown = Date.now();
    $('cl-actions').hidden = true;
    $('cl-discard-box').hidden = false;
    $('cd-err').textContent = '';
    $('cd-title').textContent = step === 1 ? 'Discard this collection?' : 'Are you sure?';
    $('cd-text').textContent = step === 1
      ? 'It stays on HABO\'s record, but it gets no volunteer hours and no XP, and nothing from it goes on the map.'
      : 'Once it\'s discarded, you can\'t go back to it. To keep collecting, press Keep collecting.';
    var yes = $('cd-yes');
    yes.textContent = step === 1 ? 'Continue' : 'Confirm discard';
    yes.disabled = true;
    if (step === 1) {
      // Why, one tap, with the same choices as a stretch (Q412).
      collectionWhy = whyBox({ title: 'Why are you discarding it?', errId: 'cd-why-err',
        onPick: function (why) { if (discardStep === 1 && why && Date.now() - shown >= 1500) yes.disabled = false; } });
      collectionWhy.id = 'cd-why';
      $('cl-discard-box').insertBefore(collectionWhy, $('cd-no'));
    }
    setTimeout(function () { if (discardStep === step && (step === 2 || collectionWhy.reason().reason)) yes.disabled = false; }, 1500);
    $('cl-discard-box').scrollIntoView({ block: 'center' });
  }
  function closeDiscard() {
    discardStep = 0;
    var old = $('cd-why');
    if (old) old.remove();
    $('cl-discard-box').hidden = true;
    $('cl-actions').hidden = false;
  }
  function discardCollection(button) {
    if (!c) return;
    app.busy(button, 'cd-err', function () {
      // What the phone kept goes first, so HABO has the whole record.
      return busyWhile('Discarding your collection, please wait...', function () {
        return flush().then(function () {
          if (c.queue.length) throw new Error('Discarding needs signal, so the litter pulses kept on this phone reach HABO first. Try again when you have signal.');
          return app.api('collectDiscard', { token: app.myToken(), collectionId: c.id, reason: collectionWhy && collectionWhy.reason() });
        });
      }).then(function () {
        discardStep = 0;
        c = null;
        save();
        keep(STREETS_KEY, null);
        $('cl-discard-box').hidden = true;
        $('cl-actions').hidden = false;
        app.showAccount();
        app.notice('Your collection is discarded: no volunteer hours, no XP, and nothing on the map.');
      });
    });
  }

  /* ── Planning a collection (Oct 24, in chat) ── */

  // The cells you mean to cover, with no stretches or turnarounds (S5), and
  // the cell last tapped, which the next tap fills in from along the street.
  // Undo takes back the last tap.
  function openPlan() {
    planning = { stretches: [{ cells: [], turns: [], from: null }], history: [] };
    // The planning map is the collecting map: a simulated walk's line stays off it (C606).
    if (layers) layers.sim.clearLayers();
    $('cl-sim-note').hidden = true;
    app.notice('');
    app.show('v-plan');
    $('pl-err').textContent = '';
    $('pl-map-box').appendChild($('cl-map'));
    loadStreets();
    ensureMap();
    if (layers) layers.plan.clearLayers();
    drawPlanning(true);
    $('pl-pick').hidden = false;
    $('pl-pick').textContent = 'Finding where you are…';
    locate().then(function (loc) {
      var cell = loc.cell || loc.near;
      $('pl-pick').hidden = true;
      if (!cell) return;
      if (map) { var p = G.cellCenter(cell); map.setView([p.lat, p.lon], 16); }
      return fetchStreets(cell).catch(function () {
        app.notice('The streets around you couldn\'t load just now; the plan fills in straight between your taps until they do.');
      });
    }).then(function () { drawPlanning(false); });
  }

  function planTap(cell) {
    var st = planning.stretches[0];
    if (st.cells.indexOf(cell) !== -1) {
      app.notice('That cell is already in your plan. To take cells out, press Undo.');
      return;
    }
    var path = !st.from ? [cell] : streets ? streets.suggest(st.from, cell, null) : G.lineCells(G.centerXY(st.from), G.centerXY(cell));
    var added = path.filter(function (x, i) { return st.cells.indexOf(x) === -1 && path.indexOf(x) === i; });
    var step = { added: added, from: st.from };
    st.cells = st.cells.concat(added);
    st.from = cell;
    planning.history.push(step);
    app.notice('');
    drawPlanning(false);
  }

  function planUndo() {
    var step = planning.history.pop();
    if (!step) return;
    var st = planning.stretches[0];
    st.cells = st.cells.filter(function (x) { return step.added.indexOf(x) === -1; });
    st.from = step.from;
    drawPlanning(false);
  }

  function planMiles(st) {
    var m = streets ? streets.measure(st.cells) : { street: 0, off: G.CELL_M * st.cells.length };
    return (m.street + m.off) / G.MILE_M;
  }

  // The plan on the map, and its cells and miles.
  function drawPlanning(center) {
    var st = planning.stretches[0];
    if (map) {
      layers.cells.clearLayers();
      st.cells.forEach(function (cell) {
        L.rectangle(G.cellBounds(cell), { color: '#c2410c', weight: 1, fillColor: '#f97316', fillOpacity: 0.4, interactive: false }).addTo(layers.cells);
      });
      setTimeout(function () { map.invalidateSize(); }, 0);
    }
    $('pl-status').textContent = st.cells.length ? 'Your plan: ' + plural(st.cells.length, 'cell', 'cells') + ', ' + round(planMiles(st), 2) + ' mi.' : 'Tap where your walk starts, then each corner along the way: the squares between follow the streets.';
    $('pl-undo').disabled = !planning.history.length;
  }

  function savePlan(button) {
    var list = planning.stretches.filter(function (st) { return st.cells.length; }).map(function (st) {
      return { cells: st.cells.slice(), turns: [], miles: planMiles(st) };
    });
    if (!list.length) { $('pl-err').textContent = 'Tap the cells you mean to cover first.'; return; }
    app.busy(button, 'pl-err', function () {
      return busyWhile('Saving your plan, please wait...', function () { return app.api('planSave', { token: app.myToken(), plan: { stretches: list } }); }).then(function (d) {
        planning = null;
        account = account || { plan: null, planNeeded: false, xp: 0 };
        account.plan = d.plan;
        app.showAccount();
        app.notice('Your plan is saved. Start collecting uses it.');
      });
    });
  }

  /* ── Wiring ── */

  // A new collection asks for your GPX recording first; going back to one doesn't.
  $('cl-start').addEventListener('click', function () {
    if ((c && !c.ended) || (!c && account && account.open)) return start($('cl-start'));
    $('cl-start-err').textContent = '';
    $('cl-rec').hidden = false;
  });
  $('cl-rec-yes').addEventListener('click', function () { recordingAt = Date.now(); $('cl-rec').hidden = true; $('cl-ready').hidden = false; });
  $('cl-rec-cancel').addEventListener('click', function () { recordingAt = null; closeStartAsks(); });
  $('cl-ready-go').addEventListener('click', function () { closeStartAsks(); start($('cl-start')); });
  $('cl-ready-cancel').addEventListener('click', function () { recordingAt = null; closeStartAsks(); });
  $('cl-chooser').addEventListener('click', function (e) { if (e.target === $('cl-chooser')) closeChooser(); });
  $('cl-plan-btn').addEventListener('click', openPlan);
  $('cl-discard').addEventListener('click', function () { askDiscard(1); });
  $('cd-no').addEventListener('click', closeDiscard);
  $('cd-yes').addEventListener('click', function () { if (discardStep === 1) askDiscard(2); else if (discardStep === 2) discardCollection($('cd-yes')); });
  $('pl-undo').addEventListener('click', planUndo);
  $('pl-save').addEventListener('click', function () { savePlan($('pl-save')); });
  $('pl-cancel').addEventListener('click', function () { planning = null; app.showAccount(); });
  $('cl-pulse-btn').addEventListener('click', openChooser);
  $('cl-weigh').addEventListener('click', function () { beginPulse('weigh', $('cl-weigh')); });
  $('cl-newbag').addEventListener('click', function () { beginPulse('newbag', $('cl-newbag')); });
  $('cl-pause').addEventListener('click', function () { pauseOrResume($('cl-pause')); });
  $('cl-end').addEventListener('click', function () { beginPulse('end', $('cl-end')); });
  $('cl-chooser-cancel').addEventListener('click', closeChooser);
  $('cl-same-yes').addEventListener('click', function () { sameAnswer(true); });
  $('cl-same-no').addEventListener('click', function () { sameAnswer(false); });
  $('cl-back').addEventListener('click', function () { app.showAccount(); });
  $('cl-pulse').addEventListener('submit', function (e) { e.preventDefault(); savePulse(false); });
  $('pf-next').addEventListener('click', nextStep);
  $('pf-back').addEventListener('click', function () { if (pulse && pulse.step > 0) { pulse.step -= 1; showStep(); } });
  $('pf-discard').addEventListener('click', function () {
    if ($('pf-why')) return;
    var b = whyBox({ title: 'Why are you discarding this weighing?', redirects: true, errId: 'pf-why-err',
      cleanYes: 'Then don\'t discard it: type what the scale shows now, the same as at your last weighing, and go on.',
      wrongPlace: 'No need to discard it: where you walked comes from your GPX track after you end.',
      goLabel: 'Discard this weighing',
      onGo: function (r) { savePulse(true, r); },
      onKeep: function () { b.remove(); $('pf-discard').hidden = false; } });
    b.id = 'pf-why';
    $('pf-discard').hidden = true;
    $('pf-discard').parentNode.appendChild(b);
  });
  $('pf-cancel').addEventListener('click', function () { closePulse(); drawCells([], c && c.lastCell, null); });
  $('pf-types-open').addEventListener('click', openTypes);
  $('pf-types-done').addEventListener('click', closeTypes);
  $('pf-drawer').addEventListener('click', function (e) { if (e.target === $('pf-drawer')) closeTypes(); });
  $('pf-drawer').addEventListener('keydown', function (e) { if (e.key === 'Escape') closeTypes(); });
  $('pf-type-search').addEventListener('input', filterTypes);
  $('pf-type-add').addEventListener('click', function () { addType($('pf-type-add')); });
  buildWheel();
  $('sm-gpx').addEventListener('change', function () { if (this.files[0]) readGpx(this.files[0]); this.value = ''; });
  $('sm-sim-line').addEventListener('click', useLine);
  $('sm-gpx-later').addEventListener('click', function () { gpxPop(false); });
  $('cl-sim').addEventListener('change', function () { keep(SIM_KEY, this.checked || null); if (app.paintMode) app.paintMode(); });
  $('cl-sim-info').addEventListener('click', function () {
    var open = $('cl-sim-say').hidden;
    $('cl-sim-say').hidden = !open;
    this.setAttribute('aria-expanded', String(open));
  });
  $('sf-cells').addEventListener('click', editCells);
  $('sm-fix').addEventListener('submit', function (e) { e.preventDefault(); saveFix($('sf-save')); });
  $('sf-cancel').addEventListener('click', function () { summary.editing = false; summary.withBreak = false; summary.whereMode = false; $('sm-fix').hidden = true; $('sm-map-box').hidden = true; drawReadings(); });
  $('pf-where-tap').addEventListener('click', function () { if (pulse) { pulse.whereMode = true; $('pf-where-shown').textContent = 'Tap the cell on the map.'; fitMap(); } });
  $('pf-where-unsure').addEventListener('click', function () { if (pulse) { pulse.breakWhere = 'Not sure'; pulse.whereMode = false; $('pf-where-shown').textContent = 'Where you were: not sure.'; fitMap(); } });
  $('sf-where-tap').addEventListener('click', function () { if (summary) { summary.whereMode = true; $('sf-where-shown').textContent = 'Tap the cell on the map.'; $('sm-view-box').scrollIntoView({ block: 'start' }); } });
  $('sf-where-unsure').addEventListener('click', function () { if (summary) { summary.breakWhere = 'Not sure'; summary.whereMode = false; $('sf-where-shown').textContent = 'Where you were: not sure.'; } });
  $('sm-done').addEventListener('click', function () { summary = null; app.showAccount(); });
  $('sm-map-open').addEventListener('click', function () { app.openMap(allCells(), function () { app.show('v-summary'); drawReadings(); }); });
  $('pf-odd-yes').addEventListener('click', function () { $('pf-odd').hidden = true; $('pf-break').focus(); });
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
      endedElsewhere();
      return true;
    },
    busyHere: function () { return !!(c && (c.queue.length || !c.ended)); },
    forget: function () { c = null; save(); keep(STREETS_KEY, null); }
  };
};
