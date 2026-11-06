// Challenges (S6-P8, |Q661 (a), |M669, |M846): one task an admin builds that
// earns XP. Players see them on Your quests: an Items Challenge is sent from
// the toolbox (Use my location, a photo, a note), each item reviewed in
// Reviews; a Walk goal counts from your walks. In Admin Mode, a Challenges
// screen to build them: a Builder or above makes, changes and retires them.
window.LitterChallenges = function (app) {
  'use strict';
  var $ = app.$, G = window.LitterGeo;
  var mine = null, admin = null, editing = null;

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function day(ms) { return new Date(ms).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function when(ms) { return new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function ymd(ms) { if (!ms) return ''; var d = new Date(ms); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function dates(c) {
    if (c.from && c.to) return day(c.from) + ' to ' + day(c.to);
    if (c.from) return 'From ' + day(c.from);
    if (c.to) return 'Until ' + day(c.to);
    return 'Any time';
  }
  function rewards(c) {
    if (c.kind === 'Walk goal') return c.xpPer + ' XP for each 0.01 mi, up to ' + c.milesGoal + ' mi' + (c.mult > 1 ? '; ×' + c.mult + ' once you\'ve collected ' + c.milesGoal + ' mi' + (c.segGoal ? ' across ' + c.segGoal + ' different segments' : '') : '') + '.';
    return c.xpEach + ' XP for each one approved' + (c.xpNear && c.near ? ', or ' + c.xpNear + ' XP within ' + c.near + ' m of a public segment' : '') + '.';
  }

  /* ── Your Challenges, on Your quests ── */

  function load() {
    var box = $('challenges-list');
    $('challenges-note').textContent = 'Loading your Challenges…';
    return app.api('challengesLoad', { token: app.myToken() }).then(function (d) {
      mine = d;
      draw();
    }, function (err) {
      if (err.code === 'signed-out') return app.signedOut();
      box.textContent = '';
      $('challenges-note').textContent = err.message;
    });
  }
  function draw() {
    var box = $('challenges-list');
    box.textContent = '';
    var list = (mine && mine.challenges) || [];
    $('challenges-note').textContent = list.length ? 'Each earns XP. Open one to see what to do.' : 'No Challenges are open now.';
    list.forEach(function (c) { box.appendChild(card(c)); });
  }
  function card(c) {
    var d = el('details', 'lt-challenge' + (c.locked ? ' lt-locked' : ''));
    d.id = 'chl-' + c.id;
    var head = el('summary', 'lt-challenge-head', c.name + (c.locked ? ' · Unlocks at Level ' + c.level : c.kind === 'Walk goal' && c.goal ? ' · ' + c.goal.xp + ' XP' : ''));
    d.appendChild(head);
    d.appendChild(el('p', null, c.says));
    if (c.why) d.appendChild(el('p', 'muted small', c.why));
    d.appendChild(el('p', 'small', dates(c) + ' · ' + rewards(c)));
    if (c.state === 'Retired' || !c.live) d.appendChild(el('p', 'small lt-challenge-closed', 'Not open now.'));
    if (c.kind === 'Walk goal' && c.goal) {
      var g = c.goal;
      d.appendChild(el('p', 'lt-challenge-goal', Math.round(g.miles * 100) / 100 + ' of ' + c.milesGoal + ' mi' + (c.segGoal ? ' · ' + g.segments + ' of ' + c.segGoal + ' different segments' : '') +
        ' · ' + g.xp + ' XP' + (g.done ? ' · Done!' : '')));
      var bar = el('div', 'lt-challenge-bar'), fill = el('div', 'lt-challenge-fill');
      fill.style.width = Math.min(100, c.milesGoal ? g.miles / c.milesGoal * 100 : 0) + '%';
      bar.appendChild(fill);
      d.appendChild(bar);
    }
    if (c.kind === 'Items') {
      if (c.locked) d.appendChild(el('p', 'small lt-lock-note', 'Unlocks at Level ' + c.level + '. You\'re at Level ' + (mine ? mine.level : 0) + '.'));
      else if (c.live) d.appendChild(sendForm(c));
      if (c.mine.length) {
        d.appendChild(el('p', 'lt-challenge-sub', 'What you\'ve sent'));
        c.mine.slice().reverse().forEach(function (x) {
          d.appendChild(el('p', 'small lt-challenge-item ' + x.state.toLowerCase(), when(x.sent) + ' · ' + (x.state === 'Approved' ? 'Approved, ' + x.xp + ' XP' : x.state === 'Declined' ? 'Declined' + (x.why ? ': "' + x.why + '"' : '') : 'Waiting for a review') +
            (x.note ? ' · "' + x.note + '"' : '')));
        });
      }
    }
    return d;
  }

  // The toolbox: what this Challenge asks for, in its order: place, photo, note.
  function sendForm(c) {
    var f = el('div', 'lt-challenge-send'), got = { lat: null, lon: null, acc: null, photo: '' };
    var has = function (a) { return c.actions.indexOf(a) !== -1; };
    var err = el('p', 'err');
    err.id = 'chl-err-' + c.id;
    err.setAttribute('role', 'alert');
    if (has('Place')) {
      var where = el('p', 'small lt-challenge-where', 'Stand where it is, then press Use my location.');
      var here = el('button', 'btn btn-secondary lt-challenge-here', 'Use my location');
      here.type = 'button';
      here.addEventListener('click', function () {
        if (!navigator.geolocation) { where.textContent = 'This phone can\'t give its location here.'; return; }
        here.disabled = true;
        where.textContent = 'Finding where you are…';
        navigator.geolocation.getCurrentPosition(function (p) {
          here.disabled = false;
          got.lat = p.coords.latitude; got.lon = p.coords.longitude; got.acc = p.coords.accuracy;
          err.textContent = '';
          where.textContent = 'Here: ' + got.lat.toFixed(5) + ', ' + got.lon.toFixed(5) + ' (within ' + Math.round(got.acc) + ' m).';
        }, function () {
          here.disabled = false;
          where.textContent = 'Your location couldn\'t be found. Check that this page may use it, then try again.';
        }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
      });
      f.appendChild(here);
      f.appendChild(where);
    }
    if (has('Photo')) {
      var lab = el('label', 'btn btn-secondary lt-challenge-photo-btn', 'Take its photo');
      var file = el('input', 'lt-challenge-photo');
      file.type = 'file'; file.accept = 'image/*'; file.setAttribute('capture', 'environment'); file.id = 'chl-photo-' + c.id;
      lab.htmlFor = file.id;
      var shot = el('img', 'lt-challenge-shot');
      shot.alt = 'The photo to send';
      shot.hidden = true;
      file.addEventListener('change', function () {
        var fl = file.files && file.files[0];
        if (!fl) return;
        shrink(fl).then(function (url) { got.photo = url; shot.src = url; shot.hidden = false; lab.textContent = 'Take another photo'; err.textContent = ''; },
          function () { err.textContent = 'That photo couldn\'t be read. Take it again.'; });
      });
      f.appendChild(lab);
      f.appendChild(file);
      f.appendChild(shot);
    }
    var note = null;
    if (has('Note')) {
      var nr = el('div', 'ig'), nl = el('label', null, 'Note' + (c.actions.length > 1 ? ' (if there\'s anything to say)' : ''));
      note = el('textarea', 'lt-challenge-note');
      note.rows = 2; note.maxLength = 1000; note.id = 'chl-note-' + c.id; nl.htmlFor = note.id;
      nr.appendChild(nl); nr.appendChild(note);
      f.appendChild(nr);
    }
    var send = el('button', 'btn btn-primary lt-challenge-go', 'Send');
    send.type = 'button';
    send.addEventListener('click', function () {
      app.busy(send, err.id, function () {
        return app.api('challengeSend', { token: app.myToken(), challengeId: c.id, lat: got.lat, lon: got.lon, acc: got.acc, photo: got.photo, note: note ? note.value : '' }).then(function (d) {
          mine = d;
          draw();
          var again = $('chl-' + c.id);
          if (again) {
            again.open = true;
            // Said on the Challenge itself, not in a notice over the top bar.
            var said = el('p', 'small lt-challenge-sent', 'Sent. An admin reviews it, and its XP comes once it\'s approved.');
            var form = again.querySelector('.lt-challenge-send');
            if (form) form.parentNode.insertBefore(said, form);
          }
        });
      });
    });
    f.appendChild(send);
    f.appendChild(err);
    return f;
  }

  // A photo made small enough to send: at most 1280 px on its long side.
  function shrink(file) {
    return new Promise(function (resolve, reject) {
      var r = new FileReader();
      r.onerror = reject;
      r.onload = function () {
        var img = new Image();
        img.onerror = reject;
        img.onload = function () {
          var k = Math.min(1, 1280 / Math.max(img.width, img.height)), cv = document.createElement('canvas');
          cv.width = Math.max(1, Math.round(img.width * k)); cv.height = Math.max(1, Math.round(img.height * k));
          cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
          resolve(cv.toDataURL('image/jpeg', 0.8));
        };
        img.src = r.result;
      };
      r.readAsDataURL(file);
    });
  }

  /* ── Admin Mode: building them ── */

  function openAdmin() {
    app.show('v-challenges-admin');
    window.scrollTo(0, 0);
    editing = null;
    $('cha-form').hidden = true;
    $('cha-list').textContent = '';
    $('cha-note').textContent = 'Loading the Challenges…';
    return app.api('challengesAdmin', { token: app.myToken() }).then(useAdmin, function (err) {
      if (err.code === 'signed-out') return app.signedOut();
      $('cha-note').textContent = err.message;
    });
  }
  function useAdmin(d) {
    admin = d;
    var box = $('cha-list');
    box.textContent = '';
    $('cha-note').textContent = d.canBuild ? 'Each Challenge earns XP. Add one, or change one.' : 'A Builder or above makes and changes Challenges; here they are as they stand.';
    $('cha-add').hidden = !d.canBuild;
    d.challenges.forEach(function (c) {
      var s = el('section', 'card lt-cha-item' + (c.state === 'Retired' ? ' retired' : ''));
      s.id = 'cha-' + c.id;
      s.appendChild(el('p', 'lt-col-head', c.name));
      s.appendChild(el('p', 'small', c.state + ' · ' + c.kind + (c.kind === 'Items' ? ' · ' + c.actions.join(', ') + ' · opens at Level ' + c.level : '') + ' · ' + dates(c)));
      s.appendChild(el('p', 'small', rewards(c)));
      if (c.kind === 'Items') s.appendChild(el('p', 'muted small', c.sent + ' sent' + (c.waiting ? ', ' + c.waiting + ' waiting in Reviews' : '') + '.'));
      if (d.canBuild) {
        var row = el('div', 'lt-cha-buttons');
        var ch = el('button', 'btn btn-secondary lt-cha-change', 'Change'), rt = el('button', 'btn btn-secondary lt-cha-retire', c.state === 'Retired' ? 'Open again' : 'Retire');
        ch.type = 'button'; rt.type = 'button';
        ch.addEventListener('click', function () { edit(c); });
        rt.addEventListener('click', function () {
          rt.disabled = true;
          app.api('challengeRetire', { token: app.myToken(), challengeId: c.id, retire: c.state !== 'Retired' }).then(function (d2) {
            useAdmin(d2);
            sayOn(c.id, c.state === 'Retired' ? 'Open again.' : 'Retired. What it earned stays earned.');
          }, function (err) { rt.disabled = false; app.notice(err.message); });
        });
        row.appendChild(ch); row.appendChild(rt);
        s.appendChild(row);
      }
      box.appendChild(s);
    });
  }
  // What just happened, said on the Challenge itself (not a notice over the top bar).
  function sayOn(id, words) {
    var s = id && $('cha-' + id);
    if (!s) return;
    s.appendChild(el('p', 'small lt-cha-said', words));
    s.scrollIntoView({ block: 'nearest' });
  }
  // The form: one for both kinds; what a kind doesn't use is hidden.
  function edit(c) {
    editing = c || null;
    var v = c || { name: '', kind: 'Items', says: '', why: '', actions: ['Place', 'Photo'], near: 20, xpEach: 1, xpNear: 0, level: 0, milesGoal: '', segGoal: 0, xpPer: 0.1, mult: 1, from: 0, to: 0 };
    $('cha-form-title').textContent = c ? 'Change ' + c.name : 'Add a Challenge';
    $('cha-name').value = v.name; $('cha-kind').value = v.kind; $('cha-says').value = v.says; $('cha-why').value = v.why || '';
    $('cha-from').value = ymd(v.from); $('cha-to').value = ymd(v.to);
    Array.prototype.forEach.call(document.querySelectorAll('#cha-actions input'), function (x) { x.checked = v.actions.indexOf(x.value) !== -1; });
    $('cha-near').value = v.near; $('cha-xp-each').value = v.xpEach; $('cha-xp-near').value = v.xpNear; $('cha-level').value = v.level;
    $('cha-miles').value = v.milesGoal; $('cha-segs').value = v.segGoal; $('cha-xp-per').value = v.xpPer; $('cha-mult').value = v.mult;
    $('cha-err').textContent = '';
    kindShown();
    $('cha-form').hidden = false;
    $('cha-form').scrollIntoView({ block: 'start' });
    $('cha-name').focus();
  }
  function kindShown() {
    var items = $('cha-kind').value === 'Items';
    $('cha-items-box').hidden = !items;
    $('cha-walk-box').hidden = items;
  }
  $('cha-kind').addEventListener('change', kindShown);
  $('cha-add').addEventListener('click', function () { edit(null); });
  $('cha-cancel').addEventListener('click', function () { $('cha-form').hidden = true; editing = null; });
  $('cha-save').addEventListener('click', function () {
    var x = { id: editing ? editing.id : '', name: $('cha-name').value, kind: $('cha-kind').value, says: $('cha-says').value, why: $('cha-why').value,
      from: $('cha-from').value, to: $('cha-to').value,
      actions: Array.prototype.filter.call(document.querySelectorAll('#cha-actions input'), function (i) { return i.checked; }).map(function (i) { return i.value; }),
      near: $('cha-near').value, xpEach: $('cha-xp-each').value, xpNear: $('cha-xp-near').value, level: $('cha-level').value,
      milesGoal: $('cha-miles').value, segGoal: $('cha-segs').value, xpPer: $('cha-xp-per').value, mult: $('cha-mult').value };
    var was = editing;
    app.busy($('cha-save'), 'cha-err', function () {
      return app.api('challengeSave', { token: app.myToken(), challenge: x }).then(function (d) {
        $('cha-form').hidden = true;
        editing = null;
        useAdmin(d);
        var id = was ? was.id : (d.challenges[d.challenges.length - 1] || {}).id;
        sayOn(id, was ? 'Changed.' : 'Made, and open to players now.');
      });
    });
  });

  // The Challenges button, in the Admin Mode box while Admin Mode is on.
  function sync() { $('me-go-challenges').hidden = !$('cl-sim').checked; }
  $('cl-sim').addEventListener('change', sync);
  $('me-go-challenges').addEventListener('click', function () { if (app.closePanel) app.closePanel(); app.notice(''); openAdmin(); });
  $('cha-back').addEventListener('click', function () { if (app.back) app.back(); });

  // An item's photo in Reviews, fetched when asked for.
  function photoInto(itemId, img, button) {
    button.disabled = true;
    return app.api('challengePhoto', { token: app.myToken(), itemId: itemId }).then(function (d) {
      img.src = d.photo; img.hidden = false; button.hidden = true;
    }, function (err) { button.disabled = false; app.notice(err.message); });
  }

  return { load: load, openAdmin: openAdmin, sync: sync, photoInto: photoInto, cellOf: function (lat, lon) { return G.cellAt(lat, lon); } };
};
