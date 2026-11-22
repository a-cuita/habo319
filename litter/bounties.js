// Bounties from businesses (S7-P11). A sponsor is a player whose account has
// the Business/Organization flag: asked for at the foot of Change my details
// (|M1138), approved by an admin in Reviews. A sponsor's Sponsorship part of
// the top panel (|Q792): Your bounties, with what came of each, and Sponsor a
// bounty: its name, segments picked on the map, dates, how many players can
// earn it, the reward, its bonus XP, and "Free for now" where a donation will
// go (|Q770). In Admin Mode, Bounty rewards: who earned which, to hand out.
window.LitterBounties = function (app) {
  'use strict';
  var $ = app.$, G = window.LitterGeo;
  var mine = null, picked = [], spMap = null, spLayers = {}, rewards = null;

  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function button(cls, text, fn) { var b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
  function day(ms) { return new Date(ms).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function when(ms) { return new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function ymd(ms) { var d = new Date(ms); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }

  /* ── The flag, from Change my details (items 1 to 3) ── */

  function fillAsk(a) {
    var st = a.sponsorState || '';
    $('ed-sponsor-row').hidden = st === 'Yes' || st === 'Asked';
    $('ed-sponsor-ask').hidden = st === 'Yes' || st === 'Asked';
    $('ed-sponsor-err').textContent = '';
    $('ed-sponsor-say').textContent = st === 'Yes' ? 'Your account has the Business/Organization flag, for ' + a.sponsorName + '. Its Sponsorship part is in the top panel.'
      : st === 'Asked' ? 'Asked, for ' + a.sponsorName + ': an admin approves it, and then Sponsorship shows in the top panel.'
      : (st === 'Declined' ? 'Asked before, for ' + a.sponsorName + ', and not approved. You can ask again. ' : '')
        + 'A business or organization can sponsor bounties: segments for players to collect while it runs, with a reward. Ask for the account here; an admin approves it.';
    $('ed-sponsor-name').value = st === 'Declined' ? a.sponsorName || '' : '';
  }
  $('ed-sponsor-ask').addEventListener('click', function () {
    var b = this;
    app.busy(b, 'ed-sponsor-err', function () {
      return app.api('sponsorAsk', { token: app.myToken(), name: $('ed-sponsor-name').value }).then(function (d) {
        var a = app.me();
        a.sponsorName = d.sponsorName; a.sponsorState = d.sponsorState;
        fillAsk(a);
        app.notice('Asked: an admin approves it in Reviews.');
      });
    });
  });
  // The Sponsorship part of the top panel, set apart, in the same look (|Q792).
  function onAccount(a) {
    var yes = !!a && a.sponsorState === 'Yes';
    $('sp-box').hidden = !yes;
    if (yes) $('sp-name').textContent = a.sponsorName;
  }

  /* ── Your bounties (item 5) ── */

  function open(andNew) {
    app.show('v-sponsor');
    window.scrollTo(0, 0);
    $('sp-list').textContent = '';
    $('sp-note').textContent = 'Loading…';
    return app.api('sponsorLoad', { token: app.myToken() }).then(function (d) {
      mine = d;
      draw();
      if (andNew) edit();
    }, function (err) {
      if (err.code === 'signed-out') return app.signedOut();
      $('sp-note').textContent = err.message;
    });
  }
  function draw() {
    var box = $('sp-list');
    box.textContent = '';
    var list = (mine && mine.bounties) || [];
    $('sp-note').textContent = list.length ? 'Each bounty, what came of it, and how many players earned it.' : 'No bounties yet. Sponsor a bounty: segments for players to collect, and a reward.';
    list.forEach(function (b) {
      var s = el('section', 'card lt-bounty-mine');
      s.id = 'sp-' + b.id;
      s.appendChild(el('p', 'lt-col-head', '🎯 ' + b.name));
      s.appendChild(el('p', 'small', (b.state === 'Waiting' ? 'Waiting for an admin to approve it' : b.state === 'Approved' ? (b.live ? 'Running' : 'Approved') : b.state) + ' · ' + day(b.from) + ' to ' + day(b.to)));
      s.appendChild(el('p', 'small', b.reward + ' · +' + b.xp + ' XP · for ' + b.players + (b.players === 1 ? ' player' : ' players') + ' · donation: ' + (b.donation || 'Free for now')));
      s.appendChild(el('p', 'small', 'On ' + b.segments.map(segName).join(', ') + '.'));
      if (b.state === 'Approved') s.appendChild(el('p', 'small lt-bounty-results', 'So far: ' + b.pounds + ' lb and ' + b.miles + ' mi collected on its segments; earned by ' + b.earnedBy + ' of ' + b.players + '.'));
      if (b.state === 'Declined' && b.note) s.appendChild(el('p', 'small', 'Why: "' + b.note + '"'));
      if (b.state === 'Waiting') s.appendChild(button('btn btn-secondary lt-bounty-change', 'Change', function () { edit(b); }));
      box.appendChild(s);
    });
  }
  function segName(id) { var g = ((mine && mine.segments) || []).filter(function (x) { return x.id === id; })[0]; return g ? g.name : id; }

  /* ── Sponsor a bounty (item 4) ── */

  var editing = null;
  function edit(b) {
    editing = b || null;
    var r = (mine && mine.xpRange) || { min: 5, max: 50 };
    var v = b || { name: '', segments: [], from: Date.now(), to: Date.now() + 14 * 86400000, players: 5, reward: '', xp: r.min };
    $('sp-form-title').textContent = b ? 'Change ' + b.name : 'Sponsor a bounty';
    $('sp-f-name').value = v.name; $('sp-f-from').value = ymd(v.from); $('sp-f-to').value = ymd(v.to);
    $('sp-f-players').value = v.players; $('sp-f-reward').value = v.reward; $('sp-f-xp').value = v.xp;
    $('sp-f-xp').min = r.min; $('sp-f-xp').max = r.max;
    $('sp-f-xp-say').textContent = 'From ' + r.min + ' to ' + r.max + ' XP.';
    $('sp-f-donation').textContent = 'Donation: ' + ((mine && mine.donation) || 'Free for now') + '. Later, a small donation by how long a bounty runs, for supplies.';
    $('sp-f-err').textContent = '';
    picked = v.segments.slice();
    $('sp-form').hidden = false;
    drawPicker();
    $('sp-f-name').focus();
  }
  function drawPicker() {
    var segs = (mine && mine.segments) || [];
    if (window.L && !spMap) {
      spMap = L.map('sp-map', { zoomControl: true, attributionControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(spMap);
    }
    if (spMap) {
      Object.keys(spLayers).forEach(function (k) { spMap.removeLayer(spLayers[k]); });
      spLayers = {};
      var all = [];
      segs.forEach(function (g) {
        var pts = g.squares.map(function (x) { var p = G.cellCenter(x); return [p.lat, p.lon]; });
        all = all.concat(pts);
        var on = picked.indexOf(g.id) !== -1;
        var shape = g.kind === 'Field' && g.outline && g.outline.length > 2
          ? L.polygon(g.outline, { color: on ? '#b45309' : '#64748b', weight: on ? 5 : 3, fillOpacity: on ? 0.35 : 0.12, className: 'lt-qb-seg' + (on ? ' on' : '') })
          : L.polyline(pts, { color: on ? '#b45309' : '#64748b', weight: on ? 10 : 7, opacity: on ? 0.9 : 0.55, className: 'lt-qb-seg' + (on ? ' on' : '') });
        shape.bindTooltip(g.name);
        shape.on('click', function () { toggle(g.id); });
        shape.addTo(spMap);
        spLayers[g.id] = shape;
      });
      setTimeout(function () {
        spMap.invalidateSize();
        if (all.length) spMap.fitBounds(all, { padding: [16, 16], maxZoom: 17 });
        else spMap.setView([32.3668, -86.3000], 13);
      }, 0);
    }
    var box = $('sp-segs');
    box.textContent = '';
    if (!segs.length) box.appendChild(el('p', 'muted small', 'No public segments yet.'));
    segs.forEach(function (g) {
      var lab = el('label', 'choice-row lt-qb-seg-row'), cb = el('input');
      cb.type = 'checkbox'; cb.checked = picked.indexOf(g.id) !== -1; cb.value = g.id;
      cb.addEventListener('change', function () { toggle(g.id); });
      lab.appendChild(cb); lab.appendChild(document.createTextNode(' ' + g.name));
      box.appendChild(lab);
    });
  }
  function toggle(id) {
    var i = picked.indexOf(id);
    if (i === -1) picked.push(id); else picked.splice(i, 1);
    drawPicker();
  }
  $('sp-f-cancel').addEventListener('click', function () { $('sp-form').hidden = true; editing = null; });
  $('sp-f-save').addEventListener('click', function () {
    var x = { id: editing ? editing.id : '', name: $('sp-f-name').value, from: $('sp-f-from').value, to: $('sp-f-to').value, players: $('sp-f-players').value,
      reward: $('sp-f-reward').value, xp: $('sp-f-xp').value, segments: picked.slice() };
    app.busy($('sp-f-save'), 'sp-f-err', function () {
      return app.api('bountySave', { token: app.myToken(), bounty: x }).then(function (d) {
        mine.bounties = d.bounties;
        $('sp-form').hidden = true;
        editing = null;
        draw();
        app.notice('Sent: an admin approves it in Reviews, and then players see it on The Priority Segment List.');
      });
    });
  });
  $('sp-new').addEventListener('click', function () { edit(null); });
  $('me-go-sponsor').addEventListener('click', function () { if (app.closePanel) app.closePanel(); app.notice(''); open(false); });
  $('me-go-sponsor-new').addEventListener('click', function () { if (app.closePanel) app.closePanel(); app.notice(''); open(true); });
  $('sp-back').addEventListener('click', function () { if (app.back) app.back(); });

  /* ── Admin Mode: Bounty rewards (item 7) ── */

  function openRewards() {
    app.show('v-rewards');
    window.scrollTo(0, 0);
    $('br-note').textContent = 'Loading…';
    return app.api('bountyRewards', { token: app.myToken() }).then(useRewards, function (err) {
      if (err.code === 'signed-out') return app.signedOut();
      $('br-note').textContent = err.message;
    });
  }
  function useRewards(d) {
    rewards = d;
    var box = $('br-list');
    box.textContent = '';
    $('br-note').textContent = d.rewards.length ? 'Who earned which reward, to hand out; handed out ones last.' : 'No bounty has been earned yet.';
    d.rewards.forEach(function (r) {
      var s = el('section', 'card lt-reward' + (r.handed ? ' handed' : ''));
      s.id = 'br-' + r.bounty + '-' + r.account;
      s.appendChild(el('p', 'lt-col-head', r.who + ': ' + r.reward));
      s.appendChild(el('p', 'small', '🎯 ' + r.name + ', from ' + r.sponsor + ' · earned ' + when(r.earned) + ' · +' + r.xp + ' XP'));
      if (r.handed) s.appendChild(el('p', 'small', 'Handed out ' + when(r.handed) + (r.handedBy ? ' by ' + r.handedBy : '') + '.'));
      s.appendChild(button('btn btn-secondary lt-reward-hand', r.handed ? 'Not handed out yet' : 'Handed out', function () {
        var b = this;
        b.disabled = true;
        app.api('bountyHanded', { token: app.myToken(), bounty: r.bounty, account: r.account, undo: !!r.handed }).then(useRewards, function (err) { b.disabled = false; app.notice(err.message); });
      }));
      box.appendChild(s);
    });
  }
  function sync() { $('me-go-rewards').hidden = !$('cl-sim').checked; }
  $('cl-sim').addEventListener('change', sync);
  $('me-go-rewards').addEventListener('click', function () { if (app.closePanel) app.closePanel(); app.notice(''); openRewards(); });
  $('br-back').addEventListener('click', function () { if (app.back) app.back(); });

  return { fillAsk: fillAsk, onAccount: onAccount, open: open, sync: sync };
};
