/**
 * Team mode (S6-P27, |Q667, |M962, |Q721 (a), |M1002): Cleanups in the top
 * panel. In Admin Mode, an admin makes one: its name, day and times, until
 * when teams can register, and its segments, tapped on a map. Players see
 * the upcoming ones; open one for its map, its teams, Register a team (its
 * name and two leaders by handle) and Join a team, or Place me. A leader taps
 * a member, then a segment, to assign them. On the day, the main page shows
 * your segment with Check in (your segment's members, all ticked; untick who
 * isn't there), then Check out with the team's pounds. After: pounds by
 * segment and team, and each member's hours.
 */
window.LitterCleanups = function (app) {
  var $ = app.$, G = window.LitterGeo;
  var data = null, openId = '', editing = null, picked = [], pick = '';
  var maps = {}, layers = {};

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function button(cls, text, fn) { var b = el('button', cls, text); b.type = 'button'; b.addEventListener('click', fn); return b; }
  function day(s) { return s ? new Date(s + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) : ''; }
  function time(hm) {
    var m = /^(\d{1,2}):(\d{2})$/.exec(hm || '');
    if (!m) return hm || '';
    var h = Number(m[1]);
    return (h % 12 || 12) + ':' + m[2] + ' ' + (h < 12 ? 'AM' : 'PM');
  }
  function when(c) { return day(c.day) + ', ' + time(c.starts) + ' to ' + time(c.ends); }
  function clock(ms) { return new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }); }
  // Admin Mode on, for a Builder or above: making cleanups shows.
  function admin() { var a = app.me && app.me(); return !!(a && a.rank && $('cl-sim').checked && data && data.admin); }
  function seg(id) { return ((data && data.segments) || []).filter(function (g) { return g.id === id; })[0] || null; }
  function segName(id) { var g = seg(id); return g ? g.name : id; }
  function failed(err, box) {
    if (err.code === 'signed-out') return app.signedOut();
    $(box).textContent = err.message;
  }
  function load() { return app.api('cleanupsLoad', { token: app.myToken() }).then(function (d) { data = d; return d; }); }
  // A request; `after` runs only when it worked (busy shows the error otherwise).
  function send(action, body, btn, errBox, after) {
    $(errBox).textContent = '';
    return app.busy(btn, errBox, function () {
      return app.api(action, Object.assign({ token: app.myToken() }, body)).then(function (d) {
        data = d;
        if (after) after(d);
        if (!$('v-cleanups').hidden) draw();
        today(d);
      });
    });
  }

  /* ── A map of segments ── */

  function drawMap(key, boxId, ids, style, onTap) {
    if (!window.L) return;
    if (!maps[key]) {
      maps[key] = L.map(boxId, { zoomControl: true, attributionControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(maps[key]);
      layers[key] = [];
    }
    var m = maps[key];
    layers[key].forEach(function (l) { m.removeLayer(l); });
    layers[key] = [];
    var all = [];
    ids.forEach(function (id) {
      var g = seg(id);
      if (!g) return;
      var pts = g.squares.map(function (x) { var p = G.cellCenter(x); return [p.lat, p.lon]; });
      all = all.concat(pts);
      var s = style(g);
      var shape = g.kind === 'Field' && g.outline && g.outline.length > 2
        ? L.polygon(g.outline, { color: s.color, weight: s.on ? 5 : 3, fillOpacity: s.on ? 0.35 : 0.12 })
        : L.polyline(pts, { color: s.color, weight: s.on ? 10 : 7, opacity: s.on ? 0.9 : 0.55 });
      shape.bindTooltip(g.name);
      if (onTap) shape.on('click', function () { onTap(g.id); });
      shape.addTo(m);
      layers[key].push(shape);
    });
    setTimeout(function () {
      m.invalidateSize();
      if (all.length) m.fitBounds(all, { padding: [16, 16], maxZoom: 17 });
      else m.setView([32.3668, -86.3000], 13);
    }, 0);
  }

  /* ── The list ── */

  function open() {
    if (app.closePanel) app.closePanel();
    openId = '';
    app.show('v-cleanups');
    $('cu-note').textContent = 'Loading…';
    $('cu-list').textContent = '';
    $('cu-one').hidden = true;
    $('cu-form').hidden = true;
    return load().then(draw, function (err) { failed(err, 'cu-note'); });
  }
  function draw() {
    if (!data) return;
    $('cu-new').hidden = !admin();
    if (openId) return drawOne();
    $('cu-one').hidden = true;
    $('cu-top').hidden = false;
    var list = $('cu-list');
    minis.forEach(function (m) { m.remove(); });
    minis = [];
    list.textContent = '';
    $('cu-note').textContent = data.cleanups.length ? 'Open one for its map and its teams.' : 'No cleanups coming up.';
    data.cleanups.forEach(function (c) {
      var b = button('lt-cu-item', null, function () { openId = c.id; drawOne(); window.scrollTo(0, 0); });
      b.id = 'cu-go-' + c.id;
      b.appendChild(el('span', 'lt-cu-name', c.name));
      b.appendChild(el('span', 'lt-cu-when', when(c) + (c.past ? ' · done' : '')));
      var mine = c.teams.filter(function (t) { return t.mine; })[0];
      if (mine) b.appendChild(el('span', 'lt-cu-mine', 'Your team: ' + mine.name + (c.mySegment ? ', on ' + segName(c.mySegment) : '')));
      else if (c.placeMe) b.appendChild(el('span', 'lt-cu-mine', 'You asked to be placed in a team.'));
      // A small map of its area (item 2): its segments, not to be moved.
      var mini = el('div', 'lt-cu-mini');
      mini.id = 'cu-mini-' + c.id;
      b.appendChild(mini);
      list.appendChild(b);
      miniMap(mini, c.segments);
    });
  }
  var minis = [];
  function miniMap(box, ids) {
    if (!window.L) return;
    var m = L.map(box, { zoomControl: false, attributionControl: false, dragging: false, scrollWheelZoom: false, doubleClickZoom: false, boxZoom: false, keyboard: false, touchZoom: false });
    L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(m);
    var all = [];
    ids.forEach(function (id) {
      var g = seg(id);
      if (!g) return;
      var pts = g.squares.map(function (x) { var p = G.cellCenter(x); return [p.lat, p.lon]; });
      all = all.concat(pts);
      (g.kind === 'Field' && g.outline && g.outline.length > 2 ? L.polygon(g.outline, { color: '#15803d', weight: 3, fillOpacity: 0.25, interactive: false })
        : L.polyline(pts, { color: '#15803d', weight: 6, opacity: 0.85, interactive: false })).addTo(m);
    });
    minis.push(m);
    setTimeout(function () { m.invalidateSize(); if (all.length) m.fitBounds(all, { padding: [8, 8], maxZoom: 16 }); else m.setView([32.3668, -86.3000], 12); }, 0);
  }

  /* ── One cleanup ── */

  function current() { return data && data.cleanups.filter(function (c) { return c.id === openId; })[0]; }
  function drawOne() {
    var c = current();
    if (!c) { openId = ''; return draw(); }
    $('cu-top').hidden = true;
    $('cu-form').hidden = true;
    $('cu-one').hidden = false;
    $('cu-one-name').textContent = c.name;
    $('cu-one-when').textContent = when(c) + (c.registerOpen && c.until ? '. Teams register until ' + new Date(c.until).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) + '.' : '');
    $('cu-one-err').textContent = '';
    var mine = c.teams.filter(function (t) { return t.mine; })[0];
    var leadOf = c.teams.filter(function (t) { return t.lead; })[0];
    // Its map: your segment, and the one you're assigning, stand out.
    var assigned = {};
    c.teams.forEach(function (t) { t.members.forEach(function (m) { if (m.segment) assigned[m.segment] = true; }); });
    drawMap('one', 'cu-one-map', c.segments, function (g) {
      var on = g.id === c.mySegment || (pick && assigned[g.id]);
      return { color: g.id === c.mySegment ? '#b45309' : assigned[g.id] ? '#15803d' : '#64748b', on: on };
    }, pick ? function (id) { assign(pick, id); } : null);
    // The teams, each with its members and their segments.
    var box = $('cu-teams');
    box.textContent = '';
    if (!c.teams.length) box.appendChild(el('p', 'muted small', 'No teams yet.'));
    c.teams.forEach(function (t) {
      var card = el('div', 'lt-cu-team' + (t.mine ? ' mine' : ''));
      card.appendChild(el('p', 'lt-cu-team-name', t.name + (t.mine ? ' (your team)' : '')));
      card.appendChild(el('p', 'muted small', 'Leaders: ' + t.leaders.map(function (l) { return l.handle; }).join(', ')));
      var ul = el('ul', 'lt-cu-members');
      t.members.forEach(function (m) {
        var li = el('li');
        var label = m.handle + (m.leader ? ' ★' : '') + ': ' + (m.segment ? m.segmentName : 'no segment yet');
        if (t.lead && !c.past) {
          var b = button('lt-cu-member' + (pick === m.id ? ' on' : ''), label, function () { pick = pick === m.id ? '' : m.id; drawOne(); });
          b.id = 'cu-member-' + m.id;
          li.appendChild(b);
        } else li.textContent = label;
        // An admin moves someone to another team (S6-P27 item 1, |Q781 (a)).
        if (admin() && !c.past && c.teams.length > 1) li.appendChild(moveSelect(c, m.id, t.id));
        ul.appendChild(li);
      });
      card.appendChild(ul);
      box.appendChild(card);
    });
    // A leader assigning: tap a member, then a segment (on the map, or here).
    $('cu-assign').hidden = !pick;
    if (pick) {
      var who = c.teams.reduce(function (f, t) { return f || t.members.filter(function (m) { return m.id === pick; })[0]; }, null);
      $('cu-assign-say').textContent = 'Now tap a segment for ' + (who ? who.handle : 'them') + ', on the map or here.';
      var segs = $('cu-assign-segs');
      segs.textContent = '';
      c.segments.forEach(function (id) { var b = button('btn btn-secondary', segName(id), function () { assign(pick, id); }); b.id = 'cu-seg-' + id; segs.appendChild(b); });
      segs.appendChild(button('btn btn-secondary', 'No segment', function () { assign(pick, ''); }));
    }
    // Players asking to be placed: a leader places them in their team.
    $('cu-unplaced').hidden = !c.unplaced.length;
    var up = $('cu-unplaced-list');
    up.textContent = '';
    c.unplaced.forEach(function (p) {
      var li = el('li');
      li.appendChild(el('span', null, p.handle + ' '));
      if (leadOf && !c.past) { var b = button('btn btn-secondary', 'Place in ' + leadOf.name, function () { place(p.id, leadOf.id, b); }); b.id = 'cu-place-' + p.id; li.appendChild(b); }
      else if (admin() && !c.past && c.teams.length) li.appendChild(moveSelect(c, p.id, ''));
      up.appendChild(li);
    });
    // Register a team, or join one (both open until the cleanup ends; registering until its time).
    // In Admin Mode, an admin's tools instead of a player's (|C968).
    $('cu-register').hidden = !c.registerOpen || !!leadOf || admin();
    var me = app.me && app.me();
    if (me && !$('cu-reg-l1').value) $('cu-reg-l1').value = me.handle || '';   // you, to start
    $('cu-join').hidden = !c.joinOpen || !!leadOf || admin();
    var sel = $('cu-join-team');
    sel.textContent = '';
    c.teams.forEach(function (t) { var o = el('option', null, t.name); o.value = t.id; if (t.mine) o.selected = true; sel.appendChild(o); });
    $('cu-join-go').hidden = !c.teams.length;
    $('cu-join-say').textContent = mine ? 'You\'re in ' + mine.name + '. You can move to another team.' : c.placeMe ? 'You asked to be placed: a team\'s leaders will place you.' : 'Join a team, or ask to be placed in one.';
    // After: pounds by segment and by team, and each member's hours.
    var r = c.results, res = $('cu-results');
    res.hidden = !r.bySegment.length;
    $('cu-res-segs').textContent = r.bySegment.map(function (x) { return x.name + ': ' + x.pounds + ' lb'; }).join(' · ');
    $('cu-res-teams').textContent = r.byTeam.map(function (x) { return x.name + ': ' + x.pounds + ' lb'; }).join(' · ');
    $('cu-res-hours').textContent = r.hours.map(function (x) { return x.handle + ': ' + x.hours + ' h'; }).join(' · ') + (r.hours.length ? ' (' + r.personHours + ' person-hours in all)' : '');
    // An admin's: change or retire it, at the top; and the tools below.
    $('cu-admin').hidden = !admin();
    drawAdmin(c);
  }

  /* ── An admin's tools for one cleanup (S6-P27, |Q781 (a)): moving people,
     checking a team in or out for them, pounds after the day, results. ── */

  function moveSelect(c, accountId, fromTeam) {
    var sel = el('select', 'lt-select lt-cu-move');
    sel.id = 'cu-move-' + accountId;
    sel.setAttribute('aria-label', fromTeam ? 'Move to another team' : 'Place in a team');
    var first = el('option', null, fromTeam ? 'Move to…' : 'Place in…');
    first.value = '';
    sel.appendChild(first);
    c.teams.forEach(function (t) { if (t.id !== fromTeam) { var o = el('option', null, t.name); o.value = t.id; sel.appendChild(o); } });
    sel.addEventListener('change', function () {
      if (!sel.value) return;
      send('cleanupAssign', { cleanupId: c.id, accountId: accountId, teamId: sel.value, segmentId: '' }, sel, 'cu-one-err');
    });
    return sel;
  }
  function stamp(ms) { return ms ? new Date(ms).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }) : ''; }
  function drawAdmin(c) {
    var box = $('cu-adm');
    box.textContent = '';
    box.hidden = !admin();
    if (!admin()) return;
    box.appendChild(el('h3', null, 'Admin'));
    // Check a team in for them, on the day (item 3): its members who are there, on one of the segments.
    if (c.today && !c.past && c.teams.length) {
      var ci = el('div', 'lt-cu-adm-part');
      ci.appendChild(el('p', 'lt-label', 'Check a team in for them'));
      var team = el('select', 'lt-select'); team.id = 'cu-adm-team';
      c.teams.forEach(function (t) { var o = el('option', null, t.name); o.value = t.id; team.appendChild(o); });
      var seg = el('select', 'lt-select'); seg.id = 'cu-adm-seg';
      c.segments.forEach(function (id) { var o = el('option', null, segName(id)); o.value = id; seg.appendChild(o); });
      var ticks = el('div', 'lt-cu-ticks'); ticks.id = 'cu-adm-there';
      var fill = function () {
        ticks.textContent = '';
        var t = c.teams.filter(function (x) { return x.id === team.value; })[0];
        (t ? t.members : []).forEach(function (m) {
          var l = el('label', 'choice-row'), cb = el('input');
          cb.type = 'checkbox'; cb.value = m.id; cb.checked = true;
          l.appendChild(cb); l.appendChild(document.createTextNode(' ' + m.handle));
          ticks.appendChild(l);
        });
        if (!t || !t.members.length) ticks.appendChild(el('p', 'muted small', 'Nobody in this team yet.'));
      };
      team.addEventListener('change', fill);
      fill();
      ci.appendChild(team); ci.appendChild(seg); ci.appendChild(ticks);
      var go = button('btn btn-primary', 'Check in for them', function () {
        var there = Array.prototype.map.call(ticks.querySelectorAll('input:checked'), function (x) { return x.value; });
        send('cleanupCheckIn', { cleanupId: c.id, teamId: team.value, segmentId: seg.value, there: there }, go, 'cu-one-err');
      });
      go.id = 'cu-adm-in';
      ci.appendChild(go);
      box.appendChild(ci);
    }
    // Check-ins: open ones checked out for them, with the team's pounds (item 3); done ones' pounds fixed after (item 4).
    if (c.checkins.length) {
      var list = el('div', 'lt-cu-adm-part');
      list.appendChild(el('p', 'lt-label', 'Check-ins'));
      c.checkins.forEach(function (k) {
        var t = c.teams.filter(function (x) { return x.id === k.team; })[0];
        var row = el('div', 'lt-cu-adm-row');
        row.id = 'cu-adm-k-' + k.id;
        row.appendChild(el('p', null, (t ? t.name : k.team) + ' · ' + k.segmentName + ' · in ' + stamp(k.inAt) + (k.outAt ? ', out ' + stamp(k.outAt) : '') + ' · ' + k.there.length + ' there'));
        var lb = el('input'); lb.inputMode = 'decimal'; lb.placeholder = 'Pounds'; lb.value = k.pounds != null ? String(k.pounds) : '';
        lb.setAttribute('aria-label', 'The team\'s pounds');
        row.appendChild(lb);
        var b = k.outAt
          ? button('btn btn-secondary', 'Save pounds', function () { send('cleanupPounds', { checkinId: k.id, pounds: lb.value }, b, 'cu-one-err'); })
          : button('btn btn-primary', 'Check out for them', function () { send('cleanupCheckOut', { checkinId: k.id, pounds: lb.value }, b, 'cu-one-err'); });
        row.appendChild(b);
        list.appendChild(row);
      });
      box.appendChild(list);
    }
    // Results for the grant (item 8): a file to download.
    if (c.checkins.length) {
      var dl = button('btn btn-secondary', 'Download results', function () { download(c); });
      dl.id = 'cu-adm-csv';
      box.appendChild(dl);
    }
  }
  function csvCell(v) { var t = String(v == null ? '' : v); return /[",\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; }
  function resultsCsv(c) {
    var name = function (id) { var t = c.teams.filter(function (x) { return x.id === id; })[0]; return t ? t.name : id; };
    var rows = [['Cleanup', 'Day', 'Team', 'Segment', 'Checked in', 'Checked out', 'People there', 'Hours', 'Person-hours', 'Pounds']];
    c.checkins.forEach(function (k) {
      var h = k.outAt ? Math.max(0, k.outAt - k.inAt) / 3600000 : 0;
      rows.push([c.name, c.day, name(k.team), k.segmentName, stamp(k.inAt), stamp(k.outAt), k.there.map(function (p) { return p.handle; }).join('; '),
        k.outAt ? h.toFixed(2) : '', k.outAt ? (h * k.there.length).toFixed(2) : '', k.pounds != null ? k.pounds : '']);
    });
    rows.push([]);
    rows.push(['Person', 'Hours']);
    c.results.hours.forEach(function (x) { rows.push([x.handle, x.hours]); });
    return rows.map(function (r) { return r.map(csvCell).join(','); }).join('\r\n') + '\r\n';
  }
  function download(c) {
    var url = URL.createObjectURL(new Blob([resultsCsv(c)], { type: 'text/csv' }));
    var a = el('a');
    a.href = url;
    a.download = 'cleanup-' + c.day + '-' + c.name.replace(/[^\w-]+/g, '-').toLowerCase() + '.csv';
    document.body.appendChild(a);
    a.click();
    setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1000);
  }
  function assign(accountId, segmentId) {
    var c = current();
    pick = '';
    return send('cleanupAssign', { cleanupId: c.id, accountId: accountId, segmentId: segmentId }, $('cu-assign-segs').firstChild, 'cu-one-err');
  }
  function place(accountId, teamId, b) {
    var c = current();
    return send('cleanupAssign', { cleanupId: c.id, accountId: accountId, teamId: teamId, segmentId: '' }, b, 'cu-one-err');
  }
  $('cu-reg-go').addEventListener('click', function () {
    var c = current();
    return send('cleanupRegister', { cleanupId: c.id, name: $('cu-reg-name').value, leaders: [$('cu-reg-l1').value, $('cu-reg-l2').value] }, $('cu-reg-go'), 'cu-one-err',
      function () { $('cu-reg-name').value = ''; $('cu-reg-l2').value = ''; });
  });
  $('cu-join-go').addEventListener('click', function () { var c = current(); return send('cleanupJoin', { cleanupId: c.id, teamId: $('cu-join-team').value }, $('cu-join-go'), 'cu-one-err'); });
  $('cu-place-me').addEventListener('click', function () { var c = current(); return send('cleanupJoin', { cleanupId: c.id, teamId: '' }, $('cu-place-me'), 'cu-one-err'); });
  $('cu-one-back').addEventListener('click', function () { openId = ''; pick = ''; draw(); window.scrollTo(0, 0); });

  /* ── An admin's: New cleanup, Change, Retire ── */

  function edit(c) {
    editing = c || null;
    $('cu-top').hidden = true;
    $('cu-one').hidden = true;
    $('cu-form').hidden = false;
    $('cu-form-title').textContent = c ? 'Change ' + c.name : 'New cleanup';
    $('cu-f-name').value = c ? c.name : ''; $('cu-f-day').value = c ? c.day : '';
    $('cu-f-starts').value = c ? c.starts : '09:00'; $('cu-f-ends').value = c ? c.ends : '11:00';
    var u = c && c.until ? new Date(c.until) : null, two = function (n) { return (n < 10 ? '0' : '') + n; };
    $('cu-f-until').value = u ? u.getFullYear() + '-' + two(u.getMonth() + 1) + '-' + two(u.getDate()) + 'T' + two(u.getHours()) + ':' + two(u.getMinutes()) : '';
    $('cu-f-err').textContent = '';
    picked = c ? c.segments.slice() : [];
    drawPicker();
    $('cu-f-name').focus();
  }
  function drawPicker() {
    var all = data.segments.map(function (g) { return g.id; });
    drawMap('pick', 'cu-f-map', all, function (g) { var on = picked.indexOf(g.id) !== -1; return { color: on ? '#b45309' : '#64748b', on: on }; }, toggle);
    var box = $('cu-f-segs');
    box.textContent = '';
    data.segments.forEach(function (g) {
      var lab = el('label', 'choice-row'), cb = el('input');
      cb.type = 'checkbox'; cb.checked = picked.indexOf(g.id) !== -1; cb.value = g.id;
      cb.addEventListener('change', function () { toggle(g.id); });
      lab.appendChild(cb); lab.appendChild(document.createTextNode(' ' + g.name));
      box.appendChild(lab);
    });
  }
  function toggle(id) { var i = picked.indexOf(id); if (i === -1) picked.push(id); else picked.splice(i, 1); drawPicker(); }
  $('cu-new').addEventListener('click', function () { edit(null); });
  $('cu-change').addEventListener('click', function () { edit(current()); });
  $('cu-retire').addEventListener('click', function () {
    var c = current();
    if (!window.confirm('Retire ' + c.name + '? It leaves the list for everyone.')) return;
    return send('cleanupRetire', { id: c.id }, $('cu-retire'), 'cu-one-err', function () { openId = ''; });
  });
  $('cu-f-cancel').addEventListener('click', function () { $('cu-form').hidden = true; if (editing) drawOne(); else draw(); });
  $('cu-f-save').addEventListener('click', function () {
    var was = editing;
    return send('cleanupSave', { cleanup: { id: was ? was.id : '', name: $('cu-f-name').value, day: $('cu-f-day').value, starts: $('cu-f-starts').value,
      ends: $('cu-f-ends').value, until: $('cu-f-until').value, segments: picked } }, $('cu-f-save'), 'cu-f-err', function () {
      editing = null;
      $('cu-form').hidden = true;
      if (was) openId = was.id;
    });
  });
  $('cu-back').addEventListener('click', function () { openId = ''; app.back(); });

  /* ── On the day, on the main page ── */

  var day0 = null;
  function today(d) {
    day0 = d && d.today;
    var t = day0, box = $('cu-today');
    box.hidden = !t;
    if (!t) return;
    $('cu-today-title').textContent = 'Your cleanup: ' + t.segmentName;
    $('cu-today-say').textContent = t.done ? 'Checked out. Thank you: your team\'s pounds are in.'
      : t.checkin ? 'Checked in at ' + clock(t.inAt) + '. Check out at its end, with the team\'s pounds.'
      : t.name + '. Check in when your team starts on ' + t.segmentName + '.';
    $('cu-today-in').hidden = !!t.checkin || t.done;
    $('cu-today-out').hidden = !t.checkin;
  }
  function onAccount() {
    if (!app.myToken()) return;
    load().then(today, function () { $('cu-today').hidden = true; });
  }
  $('cu-today-in').addEventListener('click', function () {
    var t = day0;
    if (!t) return;
    $('cu-in-title').textContent = 'Check in: ' + t.segmentName;
    var list = $('cu-in-list');
    list.textContent = '';
    t.members.forEach(function (m) {
      var lab = el('label', 'choice-row'), cb = el('input');
      cb.type = 'checkbox'; cb.checked = true; cb.value = m.id;
      lab.appendChild(cb); lab.appendChild(document.createTextNode(' ' + m.handle));
      list.appendChild(lab);
    });
    $('cu-in-err').textContent = '';
    $('cu-in').hidden = false;
  });
  $('cu-in-cancel').addEventListener('click', function () { $('cu-in').hidden = true; });
  $('cu-in-go').addEventListener('click', function () {
    var t = day0, there = Array.prototype.map.call($('cu-in-list').querySelectorAll('input:checked'), function (i) { return i.value; });
    return send('cleanupCheckIn', { cleanupId: t.cleanup, segmentId: t.segment, there: there }, $('cu-in-go'), 'cu-in-err', function () {
      $('cu-in').hidden = true;
    });
  });
  $('cu-today-out').addEventListener('click', function () {
    var t = day0;
    if (!t) return;
    $('cu-out-title').textContent = 'Check out: ' + t.segmentName;
    $('cu-out-lbs').value = '';
    $('cu-out-err').textContent = '';
    $('cu-out').hidden = false;
    $('cu-out-lbs').focus();
  });
  $('cu-out-cancel').addEventListener('click', function () { $('cu-out').hidden = true; });
  $('cu-out-go').addEventListener('click', function () {
    var t = day0;
    return send('cleanupCheckOut', { checkinId: t.checkin, pounds: $('cu-out-lbs').value }, $('cu-out-go'), 'cu-out-err', function () {
      $('cu-out').hidden = true;
    });
  });

  $('me-go-cleanups').addEventListener('click', open);
  return { open: open, onAccount: onAccount };
};
