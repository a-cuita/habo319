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
  var WALK_KEY = 'habo-litter-walkplan';  // the walk's plan chosen on this phone: its segments' ids (S5-P9, S5-P12)
  var SIM_KEY = 'habo-litter-sim';   // the Admin Mode switch, kept on this computer (S5-U2)
  var SIM_SAY_HEAD = document.getElementById('cl-sim-say').textContent;   // a Head Builder's words for Admin Mode
  var lastTap = null;           // where the map was last clicked
  var SIM_SAY = 'A simulated walk: the line you drew stands in for your GPX track. It sets where you walked, and the miles.';

  /* ── Kept on the phone ── */

  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function keep(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* this visit only */ } }
  // Head Builder mode draws in its own colours, from the Settings tab (S5-U2 round 3, Q528).
  // Accepted segments (S5-P3), from the last load: for the plan alert and
  // the weigh prompts.
  // In Head Builder mode, the simulated world's (Q529).
  var segments = [], simSegments = [];
  function segs() { return app.builderMode && app.builderMode() ? simSegments : segments; }
  function nearSquare(list, cell) {
    var p = String(cell).split('_'), r = Number(p[0]), k = Number(p[1]);
    for (var dr = -1; dr <= 1; dr++) for (var dk = -1; dk <= 1; dk++) if (list.indexOf((r + dr) + '_' + (k + dk)) !== -1) return true;
    return false;
  }
  function days(n) { return n == null ? 'some time' : n === 1 ? '1 day' : n + ' days'; }
  function darkColours() { return app.builderMode && app.builderMode() && settings.dark ? settings.dark : null; }
  function scale() { var k = darkColours(); return k ? k.colours : settings.colours; }
  // A practice walk (S5-P20) is never kept.
  function save() { if (c && c.practice) return; keep(KEY, c); }
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
    if (!c.practice) showWaitingSummary();
    flush();
  }

  /* ── Sending what the phone kept ── */

  // Sends the queue in order; what doesn't go waits for the next try.
  function flush() {
    if (c && c.practice) { c.queue = []; c.ckOut = []; if (c.ended) practiceDone(); return Promise.resolve(); }
    if (sending || !c) { showQueue(); return Promise.resolve(); }
    if (c.ckOut && c.ckOut.length) return sendCheckins().then(flush, function () { if (c.ended) savedLater(); showQueue(); });
    if (!c.queue.length) { showQueue(); return Promise.resolve(); }
    sending = true;
    var item = c.queue[0];
    var call = item.type === 'stretch'
      ? app.api('collectStretch', { token: app.myToken(), collectionId: c.id, stretch: item.stretch }, true)
      : app.api('collectEnd', { token: app.myToken(), collectionId: c.id, endedAt: item.endedAt }, true);
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
    return app.api('collectCheckins', { token: app.myToken(), collectionId: id, checkins: batch }, true).then(function () {
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
    if (!c.practice) { segmentPrompt(pos); drawLiveFields(); }
    if (!c.sim && !c.practice && (pos.acc || 0) < 999 && !$('v-collect').hidden) showHere(pos.lat, pos.lon, pos.acc);
  }
  // Weigh as you step onto a due segment and as you step off it, so its
  // pounds are its own (S5-P3, Q524).
  function segmentPrompt(pos) {
    if (!c || c.ended || !segs().length) return;
    var cell = G.cellAt(pos.lat, pos.lon);
    var on = segs().filter(function (s) { return s.due && nearSquare(s.squares, cell); })[0];
    var was = c.onSegment ? segs().filter(function (s) { return s.id === c.onSegment; })[0] : null;
    // Whether the walk had reached any segment before, due or not (S5-U2, |C714).
    var reachedBefore = !!c.steppedOn;
    if (!reachedBefore && segs().some(function (s) { return nearSquare(s.squares, cell); })) { c.steppedOn = true; save(); }
    if (on && (!was || was.id !== on.id)) {
      c.onSegment = on.id;
      // The walk's first segment, with nothing weighed yet: no empty bag to
      // weigh. HABO counts this first weighing from where you stepped on. Any
      // later segment asks, as before.
      if (c.n === 1 && !reachedBefore) app.notice('You\'re stepping onto ' + on.name + ', cleaned ' + days(on.days) + ' ago. No need to weigh yet, since you\'ve only just started: collect it, and weigh as you step off.');
      else app.notice('You\'re stepping onto ' + on.name + ', cleaned ' + days(on.days) + ' ago. Weigh now (Litter pulse, then Weigh), so its pounds are its own.');
    } else if (!on && was) {
      c.onSegment = '';
      app.notice('You\'re stepping off ' + was.name + '. Weigh now (Litter pulse, then Weigh), so its pounds are its own.');
    } else return;
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
  // litter pulse. Inside a field, every 15 seconds, so its shading follows
  // you closely (S5-P13 part 2).
  var ckTick = 0;
  setInterval(function () {
    ckTick++;
    if (!c || c.ended || c.sim || c.practice || $('v-collect').hidden || document.hidden || !navigator.geolocation) return;
    if (ckTick % 4 && !inField()) return;
    navigator.geolocation.getCurrentPosition(function (p) {
      if (!c || c.ended) return;
      checkin({ lat: p.coords.latitude, lon: p.coords.longitude, acc: p.coords.accuracy }, 'm');
    }, function () { /* no fix this minute */ }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  }, 15000);

  // The live dot (S5-U17, |Q541 (a)): while the collecting screen is open and
  // the phone awake, where you are, following its GPS; and the app knows the
  // moment you step onto a due segment. Off the rest of the time, to save
  // the battery.
  var dotWatch = null, dotFirst = true;
  function dotWanted() { return !!(c && !c.ended && !c.sim && !c.practice && !$('v-collect').hidden && !document.hidden && navigator.geolocation && map); }
  function syncDot() {
    if (dotWanted()) {
      if (dotWatch != null) return;
      dotFirst = true;
      dotWatch = navigator.geolocation.watchPosition(function (p) {
        if (!dotWanted()) return syncDot();
        var at = [p.coords.latitude, p.coords.longitude];
        showHere(at[0], at[1], p.coords.accuracy);
        if (dotFirst) { dotFirst = false; map.setView(at, Math.max(map.getZoom(), 17)); }
        segmentPrompt({ lat: at[0], lon: at[1], acc: p.coords.accuracy });
      }, function () { /* no fix just now */ }, { enableHighAccuracy: true, maximumAge: 5000, timeout: 30000 });
    } else if (dotWatch != null) {
      navigator.geolocation.clearWatch(dotWatch);
      dotWatch = null;
      if (layers) layers.here.clearLayers();
    }
  }
  // The dot itself, as most maps show where you are (S5-U17, |C794): a blue
  // dot with a white ring, in a faded blue circle as wide as the GPS's
  // accuracy, in a layer of its own above the rest. Every GPS fix the page
  // takes moves it, the watch's and each check-in's alike, so it shows even
  // when the phone is slow to start the watch.
  function showHere(lat, lon, acc) {
    if (!map || !layers || !isFinite(lat) || !isFinite(lon)) return;
    layers.here.clearLayers();
    if (acc > 0 && acc < 200) L.circle([lat, lon], { pane: 'ltHere', radius: acc, color: '#2563eb', weight: 1, opacity: 0.35, fillColor: '#2563eb', fillOpacity: 0.15, interactive: false, className: 'lt-here-acc' }).addTo(layers.here);
    L.circleMarker([lat, lon], { pane: 'ltHere', radius: 8, color: '#fff', weight: 3, fillColor: '#2563eb', fillOpacity: 1, interactive: false, className: 'lt-here-dot' }).addTo(layers.here);
  }
  // The last real fix, when the collecting screen opens.
  function hereFromCheckins() {
    if (!c || c.ended || c.sim || c.practice) return;
    var ks = (c.checkins || []).filter(function (k) { return (k[3] || 0) < 999; }), k = ks[ks.length - 1];
    if (k) showHere(k[1], k[2], k[3]);
  }
  setInterval(syncDot, 3000);
  document.addEventListener('visibilitychange', syncDot);

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
  // `quick`: back on the main page with nothing written since it loaded
  // (S6-P2): what it shows stays, and HABO isn't asked again.
  function onAccount(quick) {
    $('cl-account').hidden = false;
    closeStartAsks();
    if (!quick) $('cl-hours').textContent = '';
    showPlanLine();
    // Admin Mode for every rank, each named with its own (S5-P28, |Q639 (a), |Q563):
    // simulated walks and Measure again stay a Head Builder's.
    $('cl-sim-box').hidden = !adminAllowed();
    $('cl-sim-name').textContent = 'Admin Mode: ' + ((app.me && app.me() && app.me().rank) || '');
    var say = simAllowed() ? SIM_SAY_HEAD : 'While this is on, on this computer, the page turns dark, and Settings, Reviews and the Forum show here.';
    $('cl-sim-say').textContent = say;
    $('cl-sim-info').title = say;
    $('cl-sim-say').hidden = true;
    $('cl-sim-wiki').hidden = true;
    $('cl-sim-info').setAttribute('aria-expanded', 'false');
    $('cl-sim').checked = adminAllowed() && load(SIM_KEY) === true;
    if (app.syncWorkshop) app.syncWorkshop();
    if (quick) {
      paintXp(account ? account.xp : 0);
      if (app.onPlanPicked) app.onPlanPicked(walkCells());
      showSun($('cl-account-sun'), null);
      return Promise.resolve();
    }
    return app.api('collectLoad', { token: app.myToken() }).then(function (d) {
      settings = d.settings || settings; segments = d.segments || segments; simSegments = d.simSegments || simSegments;
      pace = d.pace || null;
      setTypes(d.types);
      gotXp(d.xp || 0, null);   // what's new since this phone last showed you (S6-P3)
      if (app.onEarned) app.onEarned(d);   // badges just reached, and the weekly streak (S6-P6)
      account = { plan: d.plan || null, planNeeded: !!d.planNeeded, xp: d.xp || 0, plans: d.plans || [], quest: d.quest || null,
        // Open on HABO but not on this phone, as after signing in again (Q409).
        open: d.collection && d.collection.status === 'Collecting' && !c ? d.collection : null };
      var h = d.hours || { collections: 0, hours: 0 };
      $('cl-hours').textContent = h.collections ? 'Your volunteer hours collecting litter: ' + h.hours + ' (' + h.collections + ' collection' + (h.collections === 1 ? '' : 's') + ').' : '';
      // A collection open here but ended there (left alone 12 hours, or ended
      // or discarded on another phone, C540): forget it.
      if (c && !c.ended && !c.queue.length && (!d.collection || d.collection.id !== c.id || d.collection.status !== 'Collecting')) { c = null; save(); keep(STREETS_KEY, null); }
      if (app.onQuest) app.onQuest(account.quest, d.quests);
      showPlanLine();
      if (app.onPlanPicked) app.onPlanPicked(walkCells());
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

  // The walk's plan (S5-P9, S5-P12, Q552, Q553, Q562): the segments you chose
  // with Select… on the Segments screen, your private ones and public ones,
  // kept on this phone until the walk starts, then kept with the collection.
  // Every collection starts from one (M590). A segment deleted, or no longer
  // public, drops out.
  function walkPlan() {
    var k = load(WALK_KEY), ids = k && Array.isArray(k.ids) ? k.ids : [];
    var out = [];
    ids.forEach(function (id) {
      if (/^P\d+$/.test(id)) {
        var p = (account && account.plans || []).filter(function (x) { return x.id === id; })[0];
        if (p) out.push({ id: id, name: app.planLabel(p), cells: p.cells, miles: p.miles, kind: 'private' });
      } else {
        var g = segments.filter(function (x) { return x.id === id; })[0];
        if (g) out.push({ id: id, name: g.name, cells: g.squares, miles: g.miles, kind: 'public' });
      }
    });
    return out;
  }
  function setWalkPlan(ids) { keep(WALK_KEY, ids && ids.length ? { ids: ids } : null); }
  function walkCells() {
    var out = [];
    walkPlan().forEach(function (w) { w.cells.forEach(function (x) { if (out.indexOf(x) === -1) out.push(x); }); });
    return out;
  }
  // The shortest distance between two segments of the plan, in miles, for
  // the far-apart notice (Q545, Q558).
  function farthestApart(list) {
    var worst = 0;
    for (var i = 0; i < list.length; i++) for (var j = i + 1; j < list.length; j++) {
      var best = Infinity;
      list[i].cells.forEach(function (a) { var pa = G.centerXY(a); list[j].cells.forEach(function (b) { best = Math.min(best, G.dist(pa, G.centerXY(b))); }); });
      if (best !== Infinity) worst = Math.max(worst, best);
    }
    return worst / G.MILE_M;
  }

  // A simulated walk opens only in Admin Mode (S5-U2, |C697).
  var SIM_AWAY = 'Your simulated walk is still open. Turn Admin Mode on to go back to it, or to end it.';
  function simAway() {
    var a = account || {};
    return !simOn() && (!!(c && !c.ended && c.sim) || !!(!c && a.open && a.open.simulated));
  }
  function showPlanLine() {
    var a = account || { xp: 0, plans: [] };
    var going = !!(c && !c.ended) || !!(!c && a.open);
    $('cl-start').textContent = going ? 'Back to my collection' : 'Start collecting';
    $('cl-plan-btn').hidden = going;
    $('cl-choose').hidden = going;
    $('cl-xp').hidden = !account;
    // Just your XP: how it's earned belongs in training (|C511, S3-P30).
    var lw = levelWords(a.xp);
    $('cl-xp').textContent = 'Your XP: ' + a.xp + '.' + (lw ? ' ' + lw : '');
    showSkills();
    gate($('cl-plan-btn'), 'draw');
    var w = walkPlan(), line = $('cl-plan');
    line.className = 'lt-plan-line';
    if (going) line.textContent = '';
    else if (w.length) line.textContent = 'Your plan: ' + w.map(function (x) { return x.name; }).join(', ') + ' · ' +
      round(w.reduce(function (t, x) { return t + (Number(x.miles) || 0); }, 0), 2) + ' mi. Start collecting uses it.';
    else if (account) {
      line.className = 'lt-plan-line need';
      line.textContent = 'Choose your plan first: the segments you mean to collect on this walk.';
    } else line.textContent = '';
    // The first quest first (S5-P20, Q580 (a)); Admin Mode's simulated walks don't wait.
    var q = a.quest;
    $('cl-start').disabled = (!going && !!account && !w.length) || (!going && !simOn() && !!(q && q.needed));
    if (w.length && q && !q.done && q.steps.indexOf(6) === -1 && app.questTick) app.questTick(6, true);
    if (simAway()) {
      line.className = 'lt-plan-line need';
      line.textContent = SIM_AWAY;
      $('cl-start').textContent = 'Start collecting';
      $('cl-start').disabled = true;
    }
  }

  // Your level, from your XP and the Levels tab's ranges (S5-P4, |Q595): the
  // XP each level needs adds up, level by level.
  function levelOf(xp, ranges) {
    var level = 0, need = 0;
    if (!ranges || !ranges.length) return { level: 0, next: null };
    for (var n = 1; n < 1000; n++) {
      // The range this level is in; else the nearest range below it.
      var r = null, below = null;
      ranges.forEach(function (x) { if (x[0] <= n && (x[1] == null || n <= x[1])) r = x; if (x[0] <= n) below = x; });
      r = r || below;
      if (!r) break;
      need += r[2];
      if (xp < need) return { level: level, next: need, from: need - r[2] };
      level = n;
    }
    return { level: level, next: null, from: need };
  }
  function levelWords(xp) {
    var l = levelOf(Number(xp) || 0, settings.levels);
    if (!settings.levels || !settings.levels.length) return '';
    return 'Level ' + l.level + (l.next != null ? ' (' + round(l.next - (Number(xp) || 0), 2) + ' XP to Level ' + (l.level + 1) + ')' : '') + '.';
  }

  /* ── XP that pops (S6-P3, |Q643 (a), |Q644 (a)) ── */

  // Your XP bar under your handle in the top bar, on every screen, filling
  // toward your next level; a "+N XP" that bursts up from what earned it;
  // and the whole screen at a new level, with any Litter Class Skill it
  // opens. What's new is counted from the XP this phone last showed you, so
  // XP earned elsewhere (a segment approved in a review) bursts from the bar
  // the next time the page loads. How XP is earned doesn't change.
  var XP_SEEN_KEY = 'habo-litter-xp-seen';
  function paintXp(xp) {
    var bar = $('me-xpbar'), lv = $('me-level');
    xp = Number(xp) || 0;
    if (!settings.levels || !settings.levels.length) { bar.hidden = true; lv.hidden = true; return; }
    var l = levelOf(xp, settings.levels);
    bar.hidden = false;
    lv.hidden = false;
    lv.textContent = 'Level ' + l.level;
    var pct = l.next == null ? 100 : Math.max(0, Math.min(100, (xp - l.from) / Math.max(1e-9, l.next - l.from) * 100));
    $('me-xpfill').style.width = pct + '%';
    var say = 'Your XP: ' + xp + '. ' + (l.next == null ? 'Level ' + l.level + '.' : round(l.next - xp, 2) + ' XP to Level ' + (l.level + 1) + '.');
    bar.title = say;
    bar.setAttribute('aria-label', say);
  }
  function seenKey() { var me = app.me && app.me(); return XP_SEEN_KEY + ':' + ((me && me.handle) || ''); }
  // `from`: what earned it, for the burst to rise from; else the XP bar.
  function gotXp(xp, from) {
    xp = Number(xp) || 0;
    var seen = load(seenKey());
    keep(seenKey(), xp);
    paintXp(xp);
    if (seen == null || xp <= seen) return;
    burst(xp - seen, from);
    var was = levelOf(seen, settings.levels).level, now = levelOf(xp, settings.levels).level;
    if (settings.levels && settings.levels.length && now > was) setTimeout(function () { levelUp(was, now); }, 900);
  }
  function burst(n, from) {
    var at = from && from.offsetParent !== null ? from : (!$('me-bar').hidden ? $('me-xpbar') : null);
    var r = at ? at.getBoundingClientRect() : { left: window.innerWidth / 2, width: 0, top: window.innerHeight / 3, height: 0 };
    var b = document.createElement('div');
    b.className = 'lt-xp-burst';
    b.textContent = '+' + round(n, 2) + ' XP';
    b.setAttribute('aria-hidden', 'true');
    b.style.left = Math.max(40, Math.min(window.innerWidth - 40, r.left + r.width / 2)) + 'px';
    b.style.top = Math.max(30, r.top + r.height / 2) + 'px';
    document.body.appendChild(b);
    $('xp-said').textContent = '+' + round(n, 2) + ' XP';
    setTimeout(function () { b.remove(); }, 1900);
  }
  function levelUp(was, now) {
    var opened = (settings.skills || []).filter(function (x) { return x.level > was && x.level <= now; });
    $('lu-level').textContent = 'Level ' + now + '!';
    $('lu-say').textContent = 'You reached Level ' + now + '.';
    var list = $('lu-skills');
    list.textContent = '';
    opened.forEach(function (x) { var li = document.createElement('li'); li.textContent = x.name; list.appendChild(li); });
    $('lu-skills-head').hidden = !opened.length;
    list.hidden = !opened.length;
    $('levelup').hidden = false;
    $('lu-close').focus();
  }
  $('lu-close').addEventListener('click', function () { $('levelup').hidden = true; });

  // A walk's XP, line by line (S6-P3, item 4): for planning it, its ratings,
  // and its litter types, counting up the first time they show; XP comes once
  // its GPX track is saved. Then the new XP bursts from the total.
  var shownWalkXp = {};
  function showWalkXp() {
    var box = $('sm-xp'), w = summary && summary.walk, col = summary && summary.collection;
    if (!w || !col || col.simulated) { box.hidden = true; return; }
    box.hidden = false;
    var lines = $('sm-xp-lines'), total = $('sm-xp-total');
    lines.textContent = '';
    if (!w.counts) { total.textContent = 'XP comes once your GPX track is saved.'; return; }
    var parts = [['Planning it', w.plan], ['Your ratings', w.ratings], ['Litter types', w.types]];
    // The time bonus on its ratings and litter types (S6-P3 item 5).
    if (w.mult > 1) parts.push(['Time bonus (×' + w.mult + ')', w.bonus]);
    // Badges it just earned (S6-P6): their XP, on top of the walk's.
    if (w.badges > 0) parts.push(['New badges', w.badges]);
    var animate = shownWalkXp[col.id] !== w.total && !(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
    shownWalkXp[col.id] = w.total;
    var rows = parts.map(function (p) {
      var li = document.createElement('li'), n = document.createElement('span');
      li.appendChild(document.createTextNode(p[0]));
      n.className = 'lt-walk-xp-n';
      n.textContent = animate ? '+0' : '+' + p[1];
      li.appendChild(n);
      if (animate) li.className = 'lt-walk-xp-wait';
      lines.appendChild(li);
      return { li: li, n: n, v: p[1] };
    });
    var sum = Math.round((w.total + (w.badges || 0)) * 100) / 100;
    total.textContent = animate ? '' : 'Total: ' + sum + ' XP';
    if (!animate) { gotXp(w.xp, total); return; }
    var step = 0;
    (function next() {
      if (step < rows.length) {
        var r = rows[step++];
        r.li.className = 'lt-walk-xp-in';
        countUp(r.n, r.v, '+', '', next);
      } else countUp(total, sum, 'Total: ', ' XP', function () { gotXp(w.xp, total); });
    })();
  }
  function countUp(el, to, pre, post, then) {
    var t0 = null, ms = 450;
    (function tick(t) {
      if (t0 == null) t0 = t;
      var f = Math.min(1, (t - t0) / ms);
      el.textContent = pre + (f < 1 ? Math.round(to * f) : to) + post;
      if (f < 1) requestAnimationFrame(tick); else setTimeout(then, 150);
    })(performance.now());
  }

  /* ── Litter Class Skills (S5-P29, |Q612 to |Q615, |Q631 (a)) ── */

  // Each skill opens at a level, set in Admin Mode's Settings (0: open to
  // everyone). Below it, the skill is greyed, with "Unlocks at Level N"
  // (|Q614 (a)), and HABO refuses it too.
  function myLevel() { return levelOf(Number(account && account.xp) || 0, settings.levels).level; }
  function skill(key) {
    var s = (settings.skills || []).filter(function (x) { return x.key === key; })[0];
    if (!s || !s.level) return { open: true, level: 0, name: s ? s.name : '' };
    return { open: myLevel() >= s.level, level: s.level, name: s.name };
  }
  // A skill's button: greyed, with "Unlocks at Level N" under its words, until you reach it.
  function gate(b, key) {
    var s = skill(key), note = b.querySelector('.lt-lock-note');
    b.disabled = !s.open;
    b.classList.toggle('lt-locked', !s.open);
    if (s.open) { if (note) note.remove(); return s; }
    if (!note) { note = document.createElement('small'); note.className = 'lt-lock-note'; b.appendChild(note); }
    note.textContent = 'Unlocks at Level ' + s.level;
    return s;
  }
  // Litter Class Skills: a button in the top panel (|C837), opening a sheet
  // with every skill and its level (|Q621).
  function showSkills() {
    var box = $('cl-skills'), list = settings.skills || [];
    box.textContent = '';
    $('me-go-skills').hidden = !account || !list.length;
    if (!account || !list.length) return;
    var have = myLevel(), lw = levelWords(account.xp);
    $('skills-level').textContent = 'Your XP: ' + account.xp + '.' + (lw ? ' ' + lw : '');
    var ul = document.createElement('ul');
    ul.className = 'lt-skills';
    list.forEach(function (s) {
      var li = document.createElement('li'), open = have >= s.level;
      li.className = 'lt-skill' + (open ? '' : ' lt-locked');
      var top = document.createElement('div');
      top.className = 'lt-skill-top';
      var name = document.createElement('span');
      name.className = 'lt-skill-name';
      name.textContent = s.name;
      var lv = document.createElement('span');
      lv.className = 'lt-skill-level';
      lv.textContent = open ? 'Level ' + s.level : 'Unlocks at Level ' + s.level;
      top.appendChild(name); top.appendChild(lv);
      var say = document.createElement('p');
      say.className = 'muted small lt-skill-say';
      say.textContent = s.say;
      li.appendChild(top); li.appendChild(say);
      ul.appendChild(li);
    });
    box.appendChild(ul);
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
    if (c && c.practice) { var h = G.cellCenter(c.lastCell); return Promise.resolve({ cell: c.lastCell, pos: { lat: h.lat, lon: h.lon, acc: 5 } }); }
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
    if (simAway()) { app.notice(SIM_AWAY); return; }
    if (c && !c.ended) return openCollect();
    // Your collection is open on HABO, not on this phone: pick it up from the
    // last litter pulse that reached HABO (Q409).
    if (!c && account && account.open) {
      var open = account.open;
      return app.busy(button, 'cl-start-err', function () {
        showBusy(STARTING);
        // Picking up isn't starting: no sunset rule, and a simulated walk
        // stays simulated (|C657).
        return startHere(open.startCell, null, !!open.simulated, true).then(function () { account.open = null; hideBusy(); app.notice('Picked up from your last litter pulse.'); }, function (err) { hideBusy(); throw err; });
      });
    }
    // A simulated walk starts where you click on the map (S5-U2).
    if (simOn()) {
      openCollect();
      // On your plan, drawn, so you click where you start (|C646).
      var planned = walkCells();
      drawPlan({ stretches: [{ cells: planned }] });
      fitCells(planned);
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

  function startHere(cell, pos, sim, pickingUp) {
    var s = sunAt(cell), now = Date.now();
    if (!sim && !pickingUp && (now >= s.sunset - settings.noStartMin * 60000 || now < s.sunrise)) {
      return Promise.reject(new Error('No new collection can start from ' + settings.noStartMin + ' minutes before sunset until sunrise.'));
    }
    var chosen = walkPlan();
    return app.api('collectStart', { token: app.myToken(), cell: cell, key: uid(), recordingAt: recordingAt, simulated: !!sim, planIds: chosen.map(function (x) { return x.id; }) }).then(function (d) {
      recordingAt = null;
      // The plan goes with the collection now (Q552).
      if (!d.already) setWalkPlan(null);
      // More than one segment: pause while travelling between them (Q559).
      if (!d.already && chosen.length > 1) app.notice('Pause the app whenever you travel between your plan\'s segments, unless you\'re collecting on the way. Your GPX recorder can keep recording.', { key: 'between' });
      settings = d.settings || settings; segments = d.segments || segments; simSegments = d.simSegments || simSegments;
      pace = d.pace || pace;
      var col = d.collection;
      c = { id: col.id, grid: 160, startedAt: col.started, startCell: col.startCell, n: 1, lastCell: col.startCell, queue: [], scalePrev: 0, bagReset: false,
        current: { startedAt: col.started, startCell: col.startCell, pausedMin: 0 }, totals: { pounds: 0, miles: 0, minutes: 0 }, ended: false,
        plan: d.plan || null, checkins: [], ckOut: [], sim: !!col.simulated, line: [] };
      if (d.already && col.started) c.current.startedAt = col.started;
      if (d.already && d.stretches && d.stretches.length) pickUp(d.stretches);
      // The line drawn on another device, from its check-ins (S5-U2, |C697).
      if (d.already) { c.checkins = col.checkins || []; if (c.sim) c.line = lineOf(col.checkins); }
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

  // Another phone or computer may have gone on with this walk (S5-U2,
  // |C697): its weighings, and on a simulated walk its drawn line, come back
  // here. Nothing waiting to go from this device is overwritten.
  function syncFromHabo(d) {
    if (!c || c.ended || !d || !d.collection || d.collection.id !== c.id || d.collection.status !== 'Collecting') return false;
    var changed = false;
    if (!c.queue.length && d.stretches && d.stretches.length > c.n - 1) { pickUp(d.stretches); changed = true; }
    if (c.sim && !(c.ckOut || []).length) {
      var line = lineOf(d.collection.checkins);
      if (line.length > (c.line || []).length) { c.line = line; c.checkins = d.collection.checkins; changed = true; }
    }
    if (changed) save();
    return changed;
  }
  // A walk's check-ins as a line, in time order (a simulated walk's drawn points).
  function lineOf(checkins) {
    return (checkins || []).filter(function (k) { return (k[3] || 0) < 999; }).sort(function (a, b) { return a[0] - b[0]; }).map(function (k) { return [k[1], k[2]]; });
  }
  // The map fitted to squares and points.
  function fitCells(cells, pts) {
    if (!map) return;
    var b = L.latLngBounds([]);
    (cells || []).filter(isCell).forEach(function (x) { b.extend(G.cellBounds(x)); });
    (pts || []).forEach(function (p) { b.extend(p); });
    if (b.isValid()) setTimeout(function () { map.invalidateSize(); map.fitBounds(b, { maxZoom: 17, padding: [16, 16] }); }, 0);
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
    drawLiveFields();
    hereFromCheckins();
    syncDot();
    drill();
    if (c && c.sim && !c.ended) fitCells(planCells(c.plan), c.line);
    showStatus();
    showSun($('cl-sun'), null);
    refreshTypes();
    flush();
  }

  // The litter types for a litter pulse, whenever the collecting screen
  // opens: reopening the page during a collection used to skip them, so the
  // drawer had nothing to tick (S5, Oct 29). Kept on the phone for no signal.
  function refreshTypes() {
    return app.api('collectLoad', { token: app.myToken(), collectionId: c && !c.practice ? c.id : '' }).then(function (d) {
      settings = d.settings || settings; segments = d.segments || segments; simSegments = d.simSegments || simSegments;
      if (syncFromHabo(d)) { drawSim(); showStatus(); }
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
    $('cl-since').textContent = (c.practice ? 'Practicing since ' : 'Collecting since ') + clock(c.startedAt) + (c.current.pausedAt ? ' · Paused at ' + clock(c.current.pausedAt) : '');
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
    map.createPane('ltPlan').style.zIndex = 450;   // the plan above everything else (S5-P9, |C685)
    map.createPane('ltHere').style.zIndex = 620;   // the live dot above every layer, the plan and the pins too (S5-U17, |C794)
    layers = { streets: L.layerGroup().addTo(map), plan: L.layerGroup().addTo(map), fields: L.layerGroup().addTo(map), cells: L.layerGroup().addTo(map), sim: L.layerGroup().addTo(map), here: L.layerGroup().addTo(map) };
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
    var colour = darkColours() ? darkColours().plan : (settings.planColour || '#7c3aed');
    // Around the whole plan, one square out, as a wide see-through band: its
    // general area, with the squares under it in their colours (S5-P9, |Q573, |C700).
    var cells = planCells(plan);
    if (cells.length) L.polyline(G.outline(G.grow(cells)), { color: colour, weight: 10, opacity: 0.45, interactive: false, pane: 'ltPlan', className: 'lt-plan-outline' }).addTo(layers.plan);
    (plan && plan.stretches || []).forEach(function (s) {
      (s.turns || []).filter(isCell).forEach(function (cell) { turnDot(cell, colour).addTo(layers.plan); });
    });
    // Weigh-in pins at each end of every due segment in it (S5-U17, |Q566 (a)).
    G.weighPins(segs(), cells).forEach(function (pin) {
      var at = G.cellCenter(pin.cell);
      // Taps go through it to the map, as a simulated walk draws by tapping (its words are on it).
      L.marker([at.lat, at.lon], { icon: G.pinIcon(), interactive: false, keyboard: false, title: 'Weigh-in location: ' + pin.name }).addTo(layers.plan);
    });
  }
  function isCell(x) { return /^-?\d+_-?\d+$/.test(String(x)); }

  /* ── A simulated walk (S5-U2) ── */

  // A Head Builder's walk from the desk: drawn as a line on the map, point by
  // point, as you go (Q497, Q498). Each point is a check-in; the end of the
  // line is where you are. No GPS and no recorder.
  function simAllowed() { var a = app.me && app.me(); return !!a && a.rank === 'Head Builder'; }
  function adminAllowed() { var a = app.me && app.me(); return !!a && !!a.rank; }
  function simOn() { return simAllowed() && load(SIM_KEY) === true; }
  function simDraws() { return !!(c && c.sim && !c.ended && !picking && !pulse && !$('v-collect').hidden); }
  function simEnd() {
    var l = c && c.line && c.line[c.line.length - 1];
    if (l) return { lat: l[0], lon: l[1], acc: 5 };
    var p = lastPlace();   // picked up on another computer: from the last check-in
    return p ? { lat: p.lat, lon: p.lon, acc: 5 } : null;
  }
  var simSendSoon = null;
  function simAdd(p) {
    if (!c.line.length) { var e = simEnd(); if (e) c.line.push([e.lat, e.lon]); }
    c.line.push([p.lat, p.lon]);
    checkin(p, 'm');
    // Each point reaches HABO within moments, so another device in Admin
    // Mode picks up the whole line (S5-U2, |C697).
    clearTimeout(simSendSoon);
    simSendSoon = setTimeout(flush, 1500);
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
    drill();
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
    gate($('pf-type-add'), 'type');   // a Litter Class Skill (S5-P29)
  }
  function showPicked() {
    var p = picked();
    $('pf-types-shown').textContent = p.length ? 'Ticked: ' + p.join(', ') : 'None ticked.';
    $('pf-types-open').textContent = p.length ? 'Change litter types' : 'Choose litter types';
  }

  function addType(button) {
    var name = $('pf-type-search').value.trim();
    if (!name) return;
    if (c && c.practice) { $('pf-type-err').textContent = 'While you practice, no new litter type is added.'; return; }
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
    if (c && c.practice && !discard) drillNext(kind === 'weigh' ? 0 : kind === 'newbag' ? 1 : -1);
    if (discard) app.notice('Weighing discarded. Start a new bag now, so your next weighing has only new litter.');
    else if (kind === 'newbag') app.notice('Weighed. Drop the full bag in any bin, and start an empty one.');
    else if (kind !== 'end') app.notice('Weighed. Keep filling your bag.');
    if (kind === 'end') { $('v-collect').hidden = true; if (!c.practice) showWaitingSummary(); }
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
          drillNext(2);
        } else {
          cur.pausedMin = (cur.pausedMin || 0) + (Date.now() - cur.pausedAt) / 60000;
          delete cur.pausedAt; delete cur.pauseCell;
          app.notice('Resumed.');
          drillNext(3);
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
    if (app.onEarned) app.onEarned(d);
    summary = { id: id, collection: d.collection, stretches: d.stretches || [], track: keptTrack(d.collection), walk: d.walk || null,
      // The walk's plan, to offer the ground collected off it (Q560).
      planCells: c.plan ? planCells(c.plan) : [] };
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
      (col.hoursNote ? ' (' + col.hoursNote + ')' : '');
    showWalkXp();   // its XP, line by line (S6-P3)
    // Share it as a picture (S6-P5): a walk with its GPX track, not a simulated one.
    $('sm-share').hidden = sim || !keptTrack(col) || !window.LitterShare;
    if (window.LitterShare) $('sm-share').textContent = window.LitterShare.label();
    var list = $('sm-list');
    list.textContent = '';
    summary.stretches.forEach(function (s) { list.appendChild(stretchCard(s)); });
    showOffPlan();
    drawReadings();
  }

  // Ground you collected off your plan (S5-P9, Q545, Q560), in pieces (S5-U17,
  // |C698, |Q587, |M711): from the GPX track, or the squares walked without
  // one, the ground a square or more off the plan, split where the track
  // turned around, paused, or where a weighing ended, with no set distance.
  // A piece walked back along itself is one piece. Each piece: keep it as a
  // private segment, with its own name, or ask an admin to add it to a
  // public segment it touches; or leave it. Tap Split, then the map, to split
  // one; tick two or more and Join them.
  function offPlanCells() {
    var plan = summary && summary.planCells || [];
    if (!plan.length || (summary.collection && summary.collection.simulated)) return [];
    return allCells().filter(function (x) { return !nearSquare(plan, x); });
  }
  function planCellsOf(plan) {
    var out = [];
    String(plan || '').split(/\s+/).filter(String).forEach(function (id) {
      var g = (segments || []).filter(function (x) { return x.id === id; })[0];
      var p = !g && account && (account.plans || []).filter(function (x) { return x.id === id; })[0];
      ((g && g.squares) || (p && p.cells) || []).forEach(function (x) { if (out.indexOf(x) === -1) out.push(x); });
    });
    return out;
  }
  var PIECE_COLOURS = ['#c2410c', '#0e7490', '#7c3aed', '#15803d', '#be123c', '#a16207'];
  function offPieces() {
    var plan = summary && summary.planCells || [];
    if (!plan.length || (summary.collection && summary.collection.simulated)) return [];
    var off = function (cell) { return !nearSquare(plan, cell); };
    var track = summary.track && summary.track.length > 1 ? summary.track : null;
    // No track yet: the pieces wait for it (S5-U17, |C795), since without it
    // there's nowhere to split them, and one piece of everything is wrong.
    if (!track) return [];
    var weighEnds = {};
    summary.stretches.forEach(function (st) { if (!st.discarded && st.cells.length) weighEnds[st.cells[st.cells.length - 1]] = true; });
    var pts = track.map(function (p) { return { xy: G.xy(p[0], p[1]), paused: !!p[2] }; });
    var runs = [], run = null, lastSplit = null;
    var close = function () { if (run && run.cells.length) runs.push(run); run = null; };
    var add = function (cell) { if (off(cell) && run.cells[run.cells.length - 1] !== cell && run.cells.indexOf(cell) === -1) run.cells.push(cell); };
    for (var i = 0; i < pts.length; i++) {
      var cell = G.cellOfXY(pts[i].xy);
      if (pts[i].paused || !off(cell)) { close(); continue; }
      if (run && turnsAround(pts, i) && (!lastSplit || G.dist(lastSplit, pts[i].xy) > 30)) { close(); lastSplit = pts[i].xy; }
      if (!run) run = { cells: [] };
      if (i > 0 && !pts[i - 1].paused && run.cells.length) G.lineCells(pts[i - 1].xy, pts[i].xy).forEach(add); else add(cell);
      if (weighEnds[cell] && run.cells.length > 1) close();
    }
    close();
    // A piece walked back along an earlier one (most of it within a square of it) is part of it.
    var pieces = [];
    runs.forEach(function (r) {
      var back = pieces.filter(function (q) { return r.cells.filter(function (x) { return nearSquare(q.cells, x); }).length >= 0.6 * r.cells.length; })[0];
      if (back) r.cells.forEach(function (x) { if (back.cells.indexOf(x) === -1) back.cells.push(x); });
      else pieces.push({ cells: r.cells.slice() });
    });
    return pieces.filter(function (q) { return q.cells.length >= 3; });
  }
  // Whether the track turns around at point i: its way over the 20 m before
  // and the 20 m after point the opposite way (more than 135 degrees apart).
  function turnsAround(pts, i) {
    var a = null, b = null, k;
    for (k = i - 1; k >= 0; k--) if (G.dist(pts[k].xy, pts[i].xy) >= 20) { a = pts[k].xy; break; }
    for (k = i + 1; k < pts.length; k++) if (G.dist(pts[k].xy, pts[i].xy) >= 20) { b = pts[k].xy; break; }
    if (!a || !b) return false;
    var ux = pts[i].xy.x - a.x, uy = pts[i].xy.y - a.y, vx = b.x - pts[i].xy.x, vy = b.y - pts[i].xy.y;
    var cos = (ux * vx + uy * vy) / Math.sqrt((ux * ux + uy * uy) * (vx * vx + vy * vy));
    return cos < Math.cos(135 * Math.PI / 180);
  }
  // The public segments a piece touches (a square or less from it).
  function touching(cells) {
    return (segments || []).filter(function (g) { return g.squares && g.squares.some(function (x) { return nearSquare(cells, x); }); });
  }
  function piecesNow() {
    if (summary.piecesFor !== summary.track) { summary.piecesFor = summary.track; summary.pieces = offPieces(); summary.splitting = -1; }
    return summary.pieces || [];
  }
  function showOffPlan() {
    var pieces = piecesNow();
    var open = pieces.filter(function (q) { return !q.done; });
    // Ground off the plan, and no track yet: say the pieces come with it.
    var waiting = !pieces.length && !(summary.track && summary.track.length > 1) && offPlanCells().length >= 3;
    $('sm-offplan').hidden = !pieces.length && !waiting;
    $('sm-offplan-err').textContent = '';
    $('sm-pieces').textContent = '';
    $('sm-pieces-hint').textContent = '';
    $('sm-pieces-join').hidden = true;
    $('sm-pieces-map').parentNode.hidden = !pieces.length;
    if (waiting) $('sm-offplan-say').textContent = 'You walked ground off your plan. Add your walk\'s GPX track above, and it shows here piece by piece, split where you turned around, paused or weighed, to keep as private segments.';
    if (!pieces.length) return;
    $('sm-offplan-say').textContent = pieces.length === 1 ? 'You walked 1 piece of ground off your plan. Keep it as a private segment, to put in a plan again?'
      : 'You walked ' + pieces.length + ' pieces of ground off your plan, split where your track turned around, paused, or where you weighed. Keep each as a private segment, to put in a plan again?';
    $('sm-pieces-hint').textContent = summary.splitting >= 0 ? 'Tap the map where piece ' + (summary.splitting + 1) + ' should split.' : open.length > 1 ? 'Tick two or more to join them into one.' : '';
    var list = $('sm-pieces');
    list.textContent = '';
    pieces.forEach(function (q, n) { list.appendChild(pieceCard(q, n)); });
    $('sm-pieces-join').hidden = pieces.filter(function (q) { return q.ticked && !q.done; }).length < 2;
    drawPieces();
  }
  function pieceCard(q, n) {
    var colour = PIECE_COLOURS[n % PIECE_COLOURS.length];
    var box = document.createElement('div');
    box.className = 'lt-piece' + (q.done ? ' done' : '');
    box.id = 'sm-piece-' + n;
    box.style.borderLeftColor = colour;
    var head = document.createElement('label');
    head.className = 'lt-piece-head';
    if (!q.done) {
      var tick = document.createElement('input');
      tick.type = 'checkbox'; tick.className = 'lt-piece-tick'; tick.checked = !!q.ticked;
      tick.addEventListener('change', function () { q.ticked = tick.checked; $('sm-pieces-join').hidden = piecesNow().filter(function (x) { return x.ticked && !x.done; }).length < 2; });
      head.appendChild(tick);
    }
    head.appendChild(document.createTextNode(' Piece ' + (n + 1) + ' · ' + q.cells.length + ' squares · ' + round(planMiles({ cells: q.cells }), 2) + ' mi'));
    box.appendChild(head);
    if (q.done) { var d = document.createElement('p'); d.className = 'small lt-piece-done'; d.textContent = q.done; box.appendChild(d); return box; }
    var name = document.createElement('input');
    name.className = 'lt-piece-name'; name.maxLength = 60; name.placeholder = 'Name it (optional), like the street it runs along'; name.value = q.name || '';
    name.setAttribute('aria-label', 'Name piece ' + (n + 1));
    name.addEventListener('input', function () { q.name = name.value; });
    box.appendChild(name);
    var row = document.createElement('div');
    row.className = 'lt-piece-buttons';
    var keep = button('Keep as a private segment', 'btn btn-primary lt-piece-keep', function () { keepPiece(q, keep); });
    var split = button(summary.splitting === n ? 'Cancel split' : 'Split', 'btn btn-secondary lt-piece-split', function () { summary.splitting = summary.splitting === n ? -1 : n; showOffPlan(); });
    gate(keep, 'keep');
    row.appendChild(keep); row.appendChild(split);
    box.appendChild(row);
    // A piece touching a public segment: part of it, or new (|M711)?
    touching(q.cells).forEach(function (g) {
      var t = document.createElement('p');
      t.className = 'small lt-piece-touch';
      t.textContent = 'It touches ' + g.name + '. Part of it, or new? If it\'s part of it, ask an admin to add it.';
      box.appendChild(t);
      var ask = button('Ask an admin to add it to ' + g.name, 'btn btn-secondary lt-piece-ask', function (e) { askPiece(q, g, e.currentTarget); });
      gate(ask, 'add');
      box.appendChild(ask);
    });
    return box;
  }
  function button(label, cls, go) {
    var b = document.createElement('button');
    b.type = 'button'; b.className = cls; b.textContent = label;
    b.addEventListener('click', go);
    return b;
  }
  function keepPiece(q, b) {
    app.busy(b, 'sm-offplan-err', function () {
      return app.api('planSave', { token: app.myToken(), from: 'walk', plan: { stretches: [{ cells: q.cells, turns: [], miles: planMiles({ cells: q.cells }) }], name: q.name || '' } }).then(function (d) {
        if (account && d.plans) account.plans = d.plans;
        q.done = 'Kept as a private segment' + (q.name ? ': ' + q.name : '') + '. It\'s in Segments.';
        showOffPlan();
        app.notice('Saved as a private segment. It\'s in Segments, to put in a plan again.');
      });
    });
  }
  function askPiece(q, g, b) {
    app.busy(b, 'sm-offplan-err', function () {
      return app.api('additionAsk', { token: app.myToken(), segmentId: g.id, cells: q.cells, miles: planMiles({ cells: q.cells }), note: q.name || '' }).then(function () {
        q.done = 'Asked: an admin reviews adding it to ' + g.name + '.';
        showOffPlan();
        app.notice('Asked. An admin reviews adding it to ' + g.name + '; once it\'s approved, it\'s part of it.');
      });
    });
  }
  function joinPieces() {
    var pieces = piecesNow(), picked = pieces.filter(function (q) { return q.ticked && !q.done; });
    if (picked.length < 2) return;
    var into = picked[0];
    picked.slice(1).forEach(function (q) { q.cells.forEach(function (x) { if (into.cells.indexOf(x) === -1) into.cells.push(x); }); });
    summary.pieces = pieces.filter(function (q) { return picked.indexOf(q) <= 0; });
    into.ticked = false;
    showOffPlan();
  }
  // Split piece n at the square nearest where the map was tapped.
  function splitAt(latlng) {
    var pieces = piecesNow(), n = summary.splitting, q = pieces[n];
    if (!q) return;
    var p = G.xy(latlng.lat, latlng.lng), best = 0, bd = Infinity;
    q.cells.forEach(function (x, k) { var d = G.dist(p, G.centerXY(x)); if (d < bd) { bd = d; best = k; } });
    summary.splitting = -1;
    if (best < 1 || best > q.cells.length - 2) { showOffPlan(); return app.notice('Tap nearer the middle of the piece: each part needs 2 squares or more.'); }
    pieces.splice(n, 1, { cells: q.cells.slice(0, best + 1), name: q.name }, { cells: q.cells.slice(best + 1) });
    showOffPlan();
  }
  var piecesMap = null, piecesLayer = null;
  function drawPieces() {
    if (!window.L) return;
    if (!piecesMap) {
      piecesMap = L.map('sm-pieces-map', { attributionControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '&copy; OpenStreetMap contributors' }).addTo(piecesMap);
      piecesLayer = L.layerGroup().addTo(piecesMap);
      piecesMap.on('click', function (e) { if (summary && summary.splitting >= 0) splitAt(e.latlng); });
    }
    piecesLayer.clearLayers();
    var b = L.latLngBounds([]);
    (summary.planCells || []).forEach(function (x) { L.rectangle(G.cellBounds(x), { stroke: false, fillColor: '#6b7280', fillOpacity: 0.2, interactive: false }).addTo(piecesLayer); });
    piecesNow().forEach(function (q, n) {
      var colour = PIECE_COLOURS[n % PIECE_COLOURS.length];
      q.cells.forEach(function (x) {
        L.rectangle(G.cellBounds(x), { color: colour, weight: 1, fillColor: colour, fillOpacity: q.done ? 0.2 : 0.55, interactive: false, className: 'lt-piece-square' }).addTo(piecesLayer);
        b.extend(G.cellBounds(x));
      });
      var at = G.cellCenter(q.cells[Math.floor(q.cells.length / 2)]);
      L.marker([at.lat, at.lon], { icon: L.divIcon({ className: 'lt-piece-n', html: '<span style="background:' + colour + '">' + (n + 1) + '</span>', iconSize: null }), interactive: false }).addTo(piecesLayer);
    });
    setTimeout(function () { piecesMap.invalidateSize(); if (b.isValid()) piecesMap.fitBounds(b, { maxZoom: 18, padding: [20, 20] }); }, 0);
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
    // Each field your track scanned (S5-P13 part 2): its ground, scanned and missed.
    var fields = fieldScans();
    fields.forEach(function (f) { shadeField(f, layers.cells); f.pts.forEach(function (p) { b.extend(G.stepBounds(p)); }); });
    showFieldScans(fields);
    // Your recorder's track, where you walked, over the cells (S3-P27, M465).
    if (summary.track && summary.track.length > 1) {
      drawTrack(summary.track, layers.cells, darkColours() ? darkColours().paused : settings.pausedColour);
      summary.track.forEach(function (p) { b.extend(p); });
    }
    // Closer in when there's a field to see (S5-P13 part 2).
    setTimeout(function () { map.invalidateSize(); if (b.isValid()) map.fitBounds(b, { maxZoom: fields.length ? 19 : 17, padding: [16, 16] }); }, 0);
  }

  /* ── Fields as areas (S5-P13 part 2, |Q600 (a)) ── */

  // Each accepted field a track scanned, with its ground and what was
  // scanned: your track scans "A track scans each side (m)", and the field is
  // collected once "Field collected when scanned (%)" of it is.
  function scanFields(track, segs) {
    if (!track || track.length < 2) return [];
    var reach = settings.reach || 15, cover = (settings.fieldCover || 70) / 100;
    return (segs || []).filter(function (g) { return g.kind === 'Field'; }).map(function (g) {
      var pts = G.fieldPoints({ outline: g.outline, squares: g.squares });
      var scan = G.fieldScan(pts, track, reach);
      return { g: g, pts: pts, scan: scan, share: G.scanShare(scan), cover: cover };
    }).filter(function (f) { return f.share > 0; });
  }
  // The summary's walk, worked out once for each track it has.
  function fieldScans() {
    if (!summary) return [];
    if (summary.fieldsFor !== summary.track) {
      summary.fieldsFor = summary.track;
      summary.fields = scanFields(summary.track, summary.collection && summary.collection.simulated ? simSegments : segments);
    }
    return summary.fields || [];
  }
  // Scanned ground in green, missed in pink (the squares you walk are
  // orange), a square of shading for each point.
  function shadeField(f, layer) {
    f.pts.forEach(function (p, i) {
      L.rectangle(G.stepBounds(p), { stroke: false, fillColor: f.scan[i] ? '#16a34a' : '#db2777', fillOpacity: f.scan[i] ? 0.3 : 0.35, interactive: false,
        className: f.scan[i] ? 'lt-scan-hit' : 'lt-scan-miss' }).addTo(layer);
    });
  }
  function scanLine(f) {
    var pct = Math.round(f.share * 100);
    return 'You scanned ' + pct + '% of ' + f.g.name + (f.share >= f.cover ? ': collected.' : ': ' + Math.round(f.cover * 100) + '% collects it.');
  }
  function showFieldScans(fields) {
    var box = $('sm-fields');
    box.textContent = '';
    box.hidden = !fields.length;
    fields.forEach(function (f) { var p = document.createElement('p'); p.className = 'lt-scan-line'; p.textContent = scanLine(f); box.appendChild(p); });
    if (fields.length) box.appendChild(scanKey());
  }
  function scanKey() { var k = document.createElement('p'); k.className = 'muted small'; k.textContent = 'On the map: green is the ground you scanned, pink what you missed.'; return k; }

  // While you walk: each field you've scanned part of, or that your plan
  // holds, shaded on the map as you go, from the page's own check-ins (a
  // simulated walk's drawn line). The GPX track is what counts, after.
  function liveTrack() {
    if (!c) return [];
    if (c.sim) return (c.line || []).map(function (p) { return [p[0], p[1]]; });
    var paused = false, out = [];
    (c.checkins || []).slice().sort(function (a, b) { return a[0] - b[0]; }).forEach(function (k) {
      if ((k[3] || 0) >= 999) return;   // a place guessed, not a fix
      if (k[4] === 'z') { out.push([k[1], k[2]]); paused = true; return; }
      if (k[4] === 'r') paused = false;
      out.push(paused ? [k[1], k[2], 1] : [k[1], k[2]]);
    });
    return out;
  }
  var grounds = {};
  function groundOf(g) {
    var key = g.id + '|' + (g.outline || []).map(String).join(';') + '|' + g.squares.length;
    return grounds[key] = grounds[key] || G.fieldPoints({ outline: g.outline, squares: g.squares });
  }
  function liveFields() {
    if (!c || c.practice || c.ended) return [];
    var track = liveTrack(), reach = settings.reach || 15, cover = (settings.fieldCover || 70) / 100, mine = planCells(c.plan);
    return segs().filter(function (g) { return g.kind === 'Field'; }).map(function (g) {
      var pts = groundOf(g), scan = track.length ? G.fieldScan(pts, track, reach) : pts.map(function () { return 0; });
      return { g: g, pts: pts, scan: scan, share: G.scanShare(scan), cover: cover, planned: g.squares.some(function (x) { return mine.indexOf(x) !== -1; }) };
    }).filter(function (f) { return f.share > 0 || f.planned; });
  }
  function drawLiveFields() {
    var fields = liveFields(), box = $('cl-fields');
    if (map && layers) { layers.fields.clearLayers(); fields.forEach(function (f) { shadeField(f, layers.fields); }); }
    box.textContent = '';
    box.hidden = !fields.length;
    fields.forEach(function (f) {
      var p = document.createElement('p');
      p.className = 'lt-scan-line';
      p.textContent = f.g.name + ': ' + Math.round(f.share * 100) + '% scanned' + (f.share >= f.cover ? ', collected.' : ', ' + Math.round(f.cover * 100) + '% collects it.');
      box.appendChild(p);
    });
    if (fields.length) box.appendChild(scanKey());
  }
  // Whether where you last checked in is inside a field, or within reach of one.
  function inField() {
    var k = c && c.checkins && c.checkins[c.checkins.length - 1];
    if (!k || (k[3] || 0) >= 999) return false;
    var reach = settings.reach || 15;
    return segs().some(function (g) { return g.kind === 'Field' && G.fieldScan(groundOf(g), [[k[1], k[2]]], reach).some(Boolean); });
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
        settings = d.settings || settings; segments = d.segments || segments; simSegments = d.simSegments || simSegments;
        setTypes(d.types);
        pace = d.pace || pace;
        // Its plan's squares, from the segments it lists, so ground off it is offered in pieces again (S5-U17).
        summary = { id: id, collection: d.collection, stretches: d.stretches || [], track: keptTrack(d.collection), planCells: planCellsOf(d.collection && d.collection.plan), walk: d.walk || null };
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
        if (d.walk) summary.walk = d.walk;
        if (app.onEarned) app.onEarned(d);
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
      if (d.walk) summary.walk = d.walk;
      if (app.onEarned) app.onEarned(d);
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
    if (c.practice) { discardStep = 0; $('cl-discard-box').hidden = true; $('cl-actions').hidden = false; return endPractice(); }
    app.busy(button, 'cd-err', function () {
      // What the phone kept goes first, so HABO has the whole record.
      return busyWhile('Discarding your collection, please wait...', function () {
        return flush().then(function () {
          if (c.queue.length) throw new Error('Discarding needs signal, so the litter pulses kept on this phone reach HABO first. Try again when you have signal.');
          return app.api('collectDiscard', { token: app.myToken(), collectionId: c.id, reason: collectionWhy && collectionWhy.reason() });
        });
      }).then(function () {
        discardStep = 0;
        // A discarded walk's plan comes back to this phone, to start again (S5-P9).
        if (c.plan && c.plan.id) setWalkPlan(String(c.plan.id).split(/\s+/).filter(String));
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
    if (!skill('draw').open) return;   // a Litter Class Skill (S5-P29): its button is greyed
    planning = { stretches: [{ cells: [], turns: [], from: null }], history: [], kind: 'Path', corners: [] };
    $('pl-name').value = '';
    $('pl-kind-path').checked = true;
    planHow();
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

  // Path or Field, first (S5-P19, |C788). A field is its corners, tapped in
  // order around it; its squares and miles follow from the shape, as a public
  // field's do. Switching starts the drawing again.
  var PLAN_HOW = {
    Path: 'Path: a street, sidewalk or trail. Tap the squares you mean to keep. The app fills in along the street from the square you tapped last.',
    Field: 'Field: open ground, like a lawn or a park. Tap each corner of it on the map, in order around it. The shape closes itself.'
  };
  function planHow() { $('pl-how').textContent = PLAN_HOW[$('pl-kind-field').checked ? 'Field' : 'Path']; }
  function planKind() {
    if (!planning) return;
    planning.kind = $('pl-kind-field').checked ? 'Field' : 'Path';
    planning.stretches = [{ cells: [], turns: [], from: null }];
    planning.history = [];
    planning.corners = [];
    planHow();
    drawPlanning(false);
  }
  function fieldShape() {
    var corners = planning.corners, pts = corners.length >= 3 ? G.fieldPoints({ outline: corners }) : [], cells = [];
    pts.forEach(function (p) { var x = G.cellOfXY(p); if (cells.indexOf(x) === -1) cells.push(x); });
    return { cells: cells, miles: G.fieldMiles(pts, settings.reach || 15) };
  }
  function planTap(cell) {
    if (planning.kind === 'Field') {
      if (planning.corners.length >= 60 || !lastTap) return;
      planning.corners.push([lastTap.lat, lastTap.lon]);
      planning.history.push({ corner: true });
      planning.stretches[0].cells = fieldShape().cells;
      app.notice('');
      return drawPlanning(false);
    }
    var st = planning.stretches[0];
    if (st.cells.indexOf(cell) !== -1) {
      app.notice('That square is already in it. To take squares out, press Undo.');
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
    if (step.corner) { planning.corners.pop(); planning.stretches[0].cells = fieldShape().cells; return drawPlanning(false); }
    var st = planning.stretches[0];
    st.cells = st.cells.filter(function (x) { return step.added.indexOf(x) === -1; });
    st.from = step.from;
    drawPlanning(false);
  }

  function planMiles(st) {
    if (planning && planning.kind === 'Field') return fieldShape().miles;
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
      var fc = planning.kind === 'Field' ? planning.corners : [], colour = darkColours() ? darkColours().plan : '#0e7490';
      if (fc.length >= 3) L.polygon(fc, { color: colour, weight: 3, fillOpacity: 0, interactive: false, className: 'lt-corners-shape' }).addTo(layers.cells);
      else if (fc.length === 2) L.polyline(fc, { color: colour, weight: 3, interactive: false }).addTo(layers.cells);
      fc.forEach(function (c) { L.circleMarker(c, { radius: 6, color: colour, weight: 2, fillColor: '#fff', fillOpacity: 1, interactive: false, className: 'lt-corner' }).addTo(layers.cells); });
      setTimeout(function () { map.invalidateSize(); }, 0);
    }
    if (planning.kind === 'Field') $('pl-status').textContent = !fc.length ? 'Tap the first corner of the field.' : fc.length < 3 ? plural(fc.length, 'corner', 'corners') + ': 3 or more make a field.'
      : 'Your field: ' + plural(fc.length, 'corner', 'corners') + ', ' + plural(st.cells.length, 'square', 'squares') + ', ' + round(planMiles(st), 2) + ' mi to scan it.';
    else $('pl-status').textContent = st.cells.length ? 'Your private segment: ' + plural(st.cells.length, 'square', 'squares') + ', ' + round(planMiles(st), 2) + ' mi.' : 'Tap where your walk starts, then each corner along the way: the squares between follow the streets.';
    $('pl-undo').disabled = !planning.history.length;
    planSegments(st);
  }

  // A plan that touches a segment building a rate says so, and offers to
  // take in the whole segment (S5-P3, Q524).
  // The message is a notice at the top, so it can't be missed (S5-P16, C634):
  // raised when it first applies or its words change, taken back when the
  // plan no longer touches the segment, and when you leave the screen.
  function planSegments(st) {
    var said = planning.said || (planning.said = {});
    var touched = segs().filter(function (s) { return s.due && s.squares.some(function (q) { return st.cells.indexOf(q) !== -1; }); });
    var ids = touched.map(function (s) { return s.id; });
    Object.keys(said).forEach(function (id) {
      if (ids.indexOf(id) === -1) { app.clearNotice('plan-seg-' + id); delete said[id]; }
    });
    touched.forEach(function (s) {
      var missing = s.squares.filter(function (q) { return st.cells.indexOf(q) === -1; });
      var text = 'Your private segment touches ' + s.name + ', cleaned ' + days(s.days) + ' ago: it\'s building an accumulation rate. ' +
        (missing.length ? 'It covers only part of it; collect all of it to measure the rate.' : 'It covers all of it.');
      if (said[s.id] === text) return;
      said[s.id] = text;
      app.notice(text, { key: 'plan-seg-' + s.id, buttons: missing.length ? [{ label: 'Add the whole segment', go: function () {
        if (!planning) return;
        planning.history.push({ added: missing, from: st.from });
        st.cells = st.cells.concat(missing);
        drawPlanning(false);
      } }] : [] });
    });
  }
  function planNoticesGone() {
    if (planning && planning.said) Object.keys(planning.said).forEach(function (id) { app.clearNotice('plan-seg-' + id); });
  }

  function savePlan(button) {
    var field = planning.kind === 'Field';
    if (field && planning.corners.length < 3) { $('pl-err').textContent = 'Tap at least 3 corners of the field on the map first.'; return; }
    var list = planning.stretches.filter(function (st) { return st.cells.length; }).map(function (st) {
      return { cells: st.cells.slice(), turns: [], miles: planMiles(st) };
    });
    if (!list.length) { $('pl-err').textContent = field ? 'Those corners hold no ground: spread them out a little.' : 'Tap the squares you mean to keep first.'; return; }
    var sent = { stretches: list, name: $('pl-name').value };
    if (field) { sent.kind = 'Field'; sent.outline = planning.corners.slice(); }
    app.busy(button, 'pl-err', function () {
      return busyWhile('Saving your private segment, please wait...', function () { return app.api('planSave', { token: app.myToken(), plan: sent }); }).then(function (d) {
        planNoticesGone();
        planning = null;
        account = account || { xp: 0, plans: [] };
        if (d.plans) account.plans = d.plans;
        // A private segment you just drew goes into your plan for this walk
        // (S5-P12): you drew it to collect it.
        var ids = walkPlan().map(function (x) { return x.id; });
        if (d.plan && ids.indexOf(d.plan.id) === -1) setWalkPlan(ids.concat([d.plan.id]));
        app.showAccount();
        app.notice('Saved as a private segment, and added to your plan for this walk.');
      });
    });
  }

  /* ── The first quest's practice litter pulse (S5-P20, Q581 (a)) ── */

  // The collecting screen as it is, where you are, with nothing sent to HABO
  // or kept on the phone: Weigh, New bag, Pause and End work as on a walk.
  // End finishes the practice and ticks the step; Back or Discard leaves it.
  function startPractice() {
    if (c || (account && account.open)) { app.notice('Finish the collection you have going first: the practice is for before your first one.'); return; }
    var go = function (pos) {
      hideBusy();
      var cell = pos ? G.cellAt(pos.lat, pos.lon) : HOME_CELL, now = Date.now();
      c = { id: 'practice', practice: true, drill: 0, grid: 160, startedAt: now, startCell: cell, n: 1, lastCell: cell, queue: [], scalePrev: 0, bagReset: false,
        current: { startedAt: now, startCell: cell, pausedMin: 0 }, totals: { pounds: 0, miles: 0, minutes: 0 }, ended: false, plan: null, checkins: [], ckOut: [], sim: false, line: [] };
      openCollect();
      drawCells([], cell, cell);
      drillSay();
    };
    showBusy('Opening your practice, please wait...');
    if (!navigator.geolocation) return go(null);
    navigator.geolocation.getCurrentPosition(function (p) { go({ lat: p.coords.latitude, lon: p.coords.longitude }); }, function () { go(null); },
      { enableHighAccuracy: false, timeout: 8000, maximumAge: 600000 });
  }
  function practiceDone() {
    c = null;
    app.clearNotice('practice');
    drill();
    app.showAccount();
    app.notice('Practice done, and nothing was saved. That\'s how a litter pulse goes on a walk.', { cls: 'quest' });
    if (app.questTick) app.questTick(5);
  }
  // The practice takes you through each in turn (|C719): a notice in the
  // quest's blue says what to press, and the other buttons are greyed out.
  // It's one of the stacking notices, closed with ×, never a box on the
  // screen (|C743): each step's notice takes the place of the one before.
  var DRILL = [
    ['cl-weigh', 'Practice, 1 of 5: nothing here is saved or sent. Press Litter pulse, then Weigh. Type any number a scale might show, like 1, and go through the steps.'],
    ['cl-newbag', 'Practice, 2 of 5: press Litter pulse, then New bag. Weigh the full bag (a bigger number than before); on a walk you\'d then start an empty one.'],
    ['cl-pause', 'Practice, 3 of 5: press Litter pulse, then Pause. Your time stops while you\'re paused.'],
    ['cl-pause', 'Practice, 4 of 5: press Litter pulse, then Resume.'],
    ['cl-end', 'Practice, 5 of 5: press Litter pulse, then End, and weigh your last bag. Nothing is saved.']
  ];
  var DRILL_BUTTONS = ['cl-weigh', 'cl-newbag', 'cl-pause', 'cl-end'];
  function drill() {
    if (!c || !c.practice) { DRILL_BUTTONS.forEach(function (id) { $(id).disabled = false; }); return; }
    var k = Math.min(c.drill || 0, DRILL.length - 1);
    DRILL_BUTTONS.forEach(function (id) { $(id).disabled = id !== DRILL[k][0]; });
  }
  function drillSay() {
    if (c && c.practice) app.notice(DRILL[Math.min(c.drill || 0, DRILL.length - 1)][1], { cls: 'quest', key: 'practice' });
  }
  function drillNext(from) { if (c && c.practice && (c.drill || 0) === from) { c.drill = from + 1; drill(); drillSay(); } }
  function endPractice() {
    c = null;
    app.clearNotice('practice');
    drill();
    app.showAccount();
    app.notice('Practice ended, with nothing saved. Press Practice the litter pulse to try again.');
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
  // The Litter Class Skills sheet (S5-P29, |C837): opened from the top panel, closed with ×.
  function skillsSheet(open) {
    if (open) showSkills();
    $('skills-sheet').hidden = !open;
    document.body.classList.toggle('lt-sheet-open', open);
    if (open) $('skills-close').focus();
  }
  $('me-go-skills').addEventListener('click', function () { skillsSheet(true); });
  $('skills-close').addEventListener('click', function () { skillsSheet(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('skills-sheet').hidden) skillsSheet(false); });
  $('pl-kind-path').addEventListener('change', planKind);
  $('pl-kind-field').addEventListener('change', planKind);
  $('cl-choose').addEventListener('click', function () { if (app.chooseWalkPlan) app.chooseWalkPlan(walkPlan().map(function (x) { return x.id; })); });
  $('cl-discard').addEventListener('click', function () { askDiscard(1); });
  $('cd-no').addEventListener('click', closeDiscard);
  $('cd-yes').addEventListener('click', function () { if (discardStep === 1) askDiscard(2); else if (discardStep === 2) discardCollection($('cd-yes')); });
  $('pl-undo').addEventListener('click', planUndo);
  $('pl-save').addEventListener('click', function () { savePlan($('pl-save')); });
  $('sm-pieces-join').addEventListener('click', joinPieces);
  // Back on the app during a walk, off your plan's segments (S5-P9, Q559): a
  // notice to pause while you travel, unless you're collecting on the way.
  document.addEventListener('visibilitychange', function () {
    if (document.hidden || !c || c.ended || c.sim || !c.plan || c.current.pausedAt || $('v-collect').hidden || !navigator.geolocation) return;
    var cells = planCells(c.plan);
    if (!cells.length) return;
    navigator.geolocation.getCurrentPosition(function (p) {
      if (!c || c.ended || c.current.pausedAt) return;
      if (nearSquare(cells, G.cellAt(p.coords.latitude, p.coords.longitude))) { app.clearNotice('off-plan'); return; }
      // And a new segment, weighed at each end (S5-U17, |C698): the weighings split the ground off your plan into pieces at the end.
      // Collecting here? is a Litter Class Skill (S5-P29): below its level, the notice doesn't ask.
      app.notice('You\'re off your plan\'s segments. Pause while you travel to your next one, unless you\'re collecting on the way.' +
        (skill('here').open ? ' Collecting here? Weigh now to start a new segment, and weigh again at its end.' : ''), { key: 'off-plan' });
    }, function () { /* no fix: nothing to say */ }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
  });
  $('pl-cancel').addEventListener('click', function () { planNoticesGone(); planning = null; app.showAccount(); });
  $('cl-pulse-btn').addEventListener('click', openChooser);
  $('cl-weigh').addEventListener('click', function () { beginPulse('weigh', $('cl-weigh')); });
  $('cl-newbag').addEventListener('click', function () { beginPulse('newbag', $('cl-newbag')); });
  $('cl-pause').addEventListener('click', function () { pauseOrResume($('cl-pause')); });
  $('cl-end').addEventListener('click', function () { beginPulse('end', $('cl-end')); });
  $('cl-chooser-cancel').addEventListener('click', closeChooser);
  $('cl-same-yes').addEventListener('click', function () { sameAnswer(true); });
  $('cl-same-no').addEventListener('click', function () { sameAnswer(false); });
  $('cl-back').addEventListener('click', function () { if (c && c.practice) return endPractice(); app.showAccount(); });
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
  $('cl-sim').addEventListener('change', function () { keep(SIM_KEY, this.checked || null); if (app.paintMode) app.paintMode(); showPlanLine(); if (map) drawPlan(c && c.plan); });
  $('cl-sim-info').addEventListener('click', function () {
    var open = $('cl-sim-say').hidden;
    $('cl-sim-say').hidden = !open;
    $('cl-sim-wiki').hidden = !open;
    this.setAttribute('aria-expanded', String(open));
  });
  $('sf-cells').addEventListener('click', editCells);
  $('sm-fix').addEventListener('submit', function (e) { e.preventDefault(); saveFix($('sf-save')); });
  $('sf-cancel').addEventListener('click', function () { summary.editing = false; summary.withBreak = false; summary.whereMode = false; $('sm-fix').hidden = true; $('sm-map-box').hidden = true; drawReadings(); });
  $('pf-where-tap').addEventListener('click', function () { if (pulse) { pulse.whereMode = true; $('pf-where-shown').textContent = 'Tap the cell on the map.'; fitMap(); } });
  $('pf-where-unsure').addEventListener('click', function () { if (pulse) { pulse.breakWhere = 'Not sure'; pulse.whereMode = false; $('pf-where-shown').textContent = 'Where you were: not sure.'; fitMap(); } });
  $('sf-where-tap').addEventListener('click', function () { if (summary) { summary.whereMode = true; $('sf-where-shown').textContent = 'Tap the cell on the map.'; $('sm-view-box').scrollIntoView({ block: 'start' }); } });
  $('sf-where-unsure').addEventListener('click', function () { if (summary) { summary.breakWhere = 'Not sure'; summary.whereMode = false; $('sf-where-shown').textContent = 'Where you were: not sure.'; } });
  $('sm-share').addEventListener('click', function () {
    var col = summary && summary.collection, b = $('sm-share'), me = app.me && app.me();
    if (!col) return;
    b.disabled = true;
    window.LitterShare.walkPicture({ started: col.started, pounds: col.pounds, miles: col.miles, track: summary.track, stretches: summary.stretches,
      handle: me ? me.handle : '', level: settings.levels && settings.levels.length ? myLevel() : null, colours: settings.colours })
      .then(function (how) { b.disabled = false; if (how === 'downloaded') app.notice('Your walk\'s picture is downloaded.'); },
        function (err) { b.disabled = false; app.notice(err.message || 'The picture couldn\'t be shared.'); });
  });
  $('sm-done').addEventListener('click', function () { summary = null; app.showAccount(); });
  $('sm-map-open').addEventListener('click', function () { app.openMap(allCells(), function () { app.show('v-summary'); drawReadings(); }); });
  $('pf-odd-yes').addEventListener('click', function () { $('pf-odd').hidden = true; $('pf-break').focus(); });
  $('pf-odd-no').addEventListener('click', function () { $('pf-odd').hidden = true; savePulse(false); });

  return {
    onAccount: onAccount,
    // Your level, for a walk's picture (S6-P5); none when there are no levels.
    levelNow: function () { return settings.levels && settings.levels.length ? myLevel() : null; },
    mapColours: function () { return settings.colours; },
    openPast: openPast,
    // Litter Class Skills (S5-P29), for the Segments screen's Submit as Public Segment.
    skill: skill, gate: gate,
    // Opening the page with a collection still going: back to it (Q282). One
    // left alone past its hours is ended where its last stretch did (Q303).
    resume: function () {
      if (!c) return false;
      if (c.ended) { showWaitingSummary(); flush(); return true; }
      if (simAway()) return false;   // a simulated walk opens only in Admin Mode (S5-U2)
      var last = c.queue.length ? c.queue[c.queue.length - 1].stretch.endedAt : c.current.startedAt;
      if (Date.now() - last > settings.autoEndHours * 3600000 && !c.queue.length) return false;
      openCollect();
      endedElsewhere();
      return true;
    },
    busyHere: function () { return !!(c && !c.practice && (c.queue.length || !c.ended)); },
    practice: startPractice,
    // A quest step ticked (S5-P20): the XP and Start collecting with it.
    onQuestChanged: function (d) { if (!account) return; account.quest = d.quest; account.xp = d.xp; gotXp(d.xp, $('qs-card')); showPlanLine(); },
    // The picked plan's squares, for the main page's map; and your plans after
    // one is deleted (Oct 31).
    pickedCells: walkCells,
    onPlans: function (d) {
      if (!account) return;
      account.plans = d.plans || [];
      showPlanLine();
      if (app.onPlanPicked) app.onPlanPicked(walkCells());
    },
    // The walk's plan, chosen on the Segments screen (S5-P12, Q562).
    walkIds: function () { return walkPlan().map(function (x) { return x.id; }); },
    setWalkPlan: function (ids) {
      setWalkPlan(ids);
      var w = walkPlan();
      if (w.length && app.questTick) app.questTick(6);   // the first quest's last step, a workshop run's too
      showPlanLine();
      if (app.onPlanPicked) app.onPlanPicked(walkCells());
      // Segments far apart (Q545, Q558): a loud notice while the plan can still change.
      var apart = farthestApart(w), limit = Number(settings.apartMi) || 1;
      if (w.length > 1 && apart > limit) app.notice('Your plan\'s segments are ' + round(apart, 1) + ' mi apart: plan how you\'ll travel between them.', { key: 'apart' });
      return w;
    },
    forget: function () { c = null; save(); keep(STREETS_KEY, null); }
  };
};
