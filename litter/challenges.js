// Skills built from the toolbox, and Challenges built from them (S6-P8,
// |Q661 (a), |M669, |M846; reworked from Jeremy's answers in chat, Nov 6:
// "the trash receptacle thing should be a litter skill, not a challenge. the
// challenges are supposed to be built out of existing skills.").
// - A skill like Trash receptacles: in the Litter Class Skills sheet (from the
//   top panel, or the Skills button while collecting), once it's unlocked, with
//   its Send form: Use my location, a photo, a note. Each one is reviewed.
// - A Challenge, on Your quests: a skill and a goal, with dates, XP for each
//   one and a finishing multiplier. A Walk goal's skill is collecting.
// - Admin Mode: Skills and Challenges, one screen each; a Builder or above
//   makes, changes and retires them.
window.LitterChallenges = function (app) {
  'use strict';
  var $ = app.$, G = window.LitterGeo;
  var mine = null, skills = null, admin = null, editing = null, mode = 'challenges';

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
    var mult = c.mult > 1 ? '; ×' + c.mult + ' once it\'s done' : '';
    if (c.kind === 'Walk goal') return c.xpPer + ' XP for each 0.01 mi, up to ' + c.milesGoal + ' mi' + (c.segGoal ? ' across ' + c.segGoal + ' different segments' : '') + mult + '.';
    return c.xpOne + ' XP for each one approved with ' + (c.skillName || c.skill) + ', up to ' + c.goal + mult + '.';
  }
  function skillRewards(s) {
    return s.xpEach + ' XP for each one approved' + (s.xpNear && s.near ? ', or ' + s.xpNear + ' XP within ' + s.near + ' m of a public segment' : '') + '.';
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
    var d = el('details', 'lt-challenge');
    d.id = 'chl-' + c.id;
    var g = c.progress || {};
    d.appendChild(el('summary', 'lt-challenge-head', c.name + ' · ' + (g.xp || 0) + ' XP' + (g.done ? ' · Done!' : '')));
    d.appendChild(el('p', null, c.says));
    if (c.why) d.appendChild(el('p', 'muted small', c.why));
    d.appendChild(el('p', 'small', dates(c) + ' · ' + rewards(c)));
    if (c.state === 'Retired' || !c.live) d.appendChild(el('p', 'small lt-challenge-closed', 'Not open now.'));
    var have = c.kind === 'Walk goal' ? g.miles || 0 : g.count || 0, goal = c.kind === 'Walk goal' ? c.milesGoal : c.goal;
    d.appendChild(el('p', 'lt-challenge-goal', c.kind === 'Walk goal'
      ? Math.round(have * 100) / 100 + ' of ' + goal + ' mi' + (c.segGoal ? ' · ' + (g.segments || 0) + ' of ' + c.segGoal + ' different segments' : '')
      : have + ' of ' + goal + ' approved · use ' + (c.skillName || c.skill) + ' from Litter Class Skills'));
    var bar = el('div', 'lt-challenge-bar'), fill = el('div', 'lt-challenge-fill');
    fill.style.width = Math.min(100, goal ? have / goal * 100 : 0) + '%';
    bar.appendChild(fill);
    d.appendChild(bar);
    return d;
  }

  /* ── Skills built from the toolbox, in the Litter Class Skills sheet ── */

  // The sheet was drawn: fill each skill's Send form from what's loaded, and
  // (when the sheet opens) load it fresh.
  function skillsShown(fresh) {
    fillSkills();
    if (!fresh) return;
    app.api('toolSkillsLoad', { token: app.myToken() }).then(function (d) { skills = d; fillSkills(); }, function (err) {
      if (err.code === 'signed-out') return app.signedOut();
    });
  }
  function fillSkills() {
    ((skills && skills.skills) || []).forEach(function (s) {
      var box = document.querySelector('#skl-' + s.id + ' .lt-skill-tool');
      if (!box) return;
      box.textContent = '';
      if (s.why) box.appendChild(el('p', 'muted small', s.why));
      box.appendChild(el('p', 'small', skillRewards(s)));
      if (!s.locked && s.state === 'Open') box.appendChild(sendForm(s));
      if (s.mine.length) {
        box.appendChild(el('p', 'lt-challenge-sub', 'What you\'ve sent'));
        s.mine.slice().reverse().forEach(function (x) {
          box.appendChild(el('p', 'small lt-challenge-item ' + x.state.toLowerCase(), when(x.sent) + ' · ' + (x.state === 'Approved' ? 'Approved, ' + x.xp + ' XP' : x.state === 'Declined' ? 'Declined' + (x.why ? ': "' + x.why + '"' : '') : 'Waiting for a review') +
            (x.note ? ' · "' + x.note + '"' : '')));
        });
      }
    });
  }

  // The toolbox: what this skill asks for, in its order: place, photo, note.
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
        return app.api('toolSkillSend', { token: app.myToken(), skillId: c.id, lat: got.lat, lon: got.lon, acc: got.acc, photo: got.photo, note: note ? note.value : '' }).then(function (d) {
          skills = d;
          fillSkills();
          // Said on the skill itself, not in a notice over the top bar.
          var box = document.querySelector('#skl-' + c.id + ' .lt-skill-tool');
          if (box) box.insertBefore(el('p', 'small lt-challenge-sent', 'Sent. An admin reviews it, and its XP comes once it\'s approved.'), box.firstChild);
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

  /* ── Admin Mode: the Skills screen and the Challenges screen ── */

  function openAdmin(which) {
    mode = which || 'challenges';
    app.show('v-challenges-admin');
    window.scrollTo(0, 0);
    editing = null;
    $('cha-form').hidden = true;
    $('cha-list').textContent = '';
    $('cha-title').textContent = mode === 'skills' ? 'Skills' : 'Challenges';
    $('cha-add').textContent = mode === 'skills' ? 'Add a skill' : 'Add a Challenge';
    $('cha-note').textContent = 'Loading…';
    return app.api(mode === 'skills' ? 'toolSkillsAdmin' : 'challengesAdmin', { token: app.myToken() }).then(useAdmin, function (err) {
      if (err.code === 'signed-out') return app.signedOut();
      $('cha-note').textContent = err.message;
    });
  }
  function useAdmin(d) {
    admin = d;
    var box = $('cha-list'), sk = mode === 'skills', list = sk ? d.skills : d.challenges;
    box.textContent = '';
    $('cha-note').textContent = d.canBuild
      ? (sk ? 'Each skill is built from the toolbox: what players send, its XP, and the level it opens at. Players use it from Litter Class Skills.'
        : 'Each Challenge is built from a skill and a goal, and earns XP. A Walk goal\'s skill is collecting.')
      : 'A Builder or above makes and changes these; here they are as they stand.';
    $('cha-add').hidden = !d.canBuild;
    if (!sk) {
      var sel = $('cha-skill');
      sel.textContent = '';
      (d.skills || []).forEach(function (s) { var o = el('option', null, s.name); o.value = s.id; sel.appendChild(o); });
    }
    list.forEach(function (c) {
      var s = el('section', 'card lt-cha-item' + (c.state === 'Retired' ? ' retired' : ''));
      s.id = 'cha-' + c.id;
      s.appendChild(el('p', 'lt-col-head', c.name));
      if (sk) {
        s.appendChild(el('p', 'small', c.state + ' · ' + c.actions.join(', ') + ' · ' + (c.level ? 'opens at Level ' + c.level : 'open to everyone')));
        s.appendChild(el('p', 'small', skillRewards(c)));
        s.appendChild(el('p', 'muted small', c.sent + ' sent' + (c.waiting ? ', ' + c.waiting + ' waiting in Reviews' : '') + '.'));
      } else {
        s.appendChild(el('p', 'small', c.state + ' · ' + c.kind + (c.kind === 'Skill goal' ? ' · ' + c.skillName : '') + ' · ' + dates(c)));
        s.appendChild(el('p', 'small', rewards(c)));
      }
      if (d.canBuild) {
        var row = el('div', 'lt-cha-buttons');
        var ch = el('button', 'btn btn-secondary lt-cha-change', 'Change'), rt = el('button', 'btn btn-secondary lt-cha-retire', c.state === 'Retired' ? 'Open again' : 'Retire');
        ch.type = 'button'; rt.type = 'button';
        ch.addEventListener('click', function () { edit(c); });
        rt.addEventListener('click', function () {
          rt.disabled = true;
          var body = { token: app.myToken(), retire: c.state !== 'Retired' };
          body[sk ? 'skillId' : 'challengeId'] = c.id;
          app.api(sk ? 'toolSkillRetire' : 'challengeRetire', body).then(function (d2) {
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
  // What just happened, said on the item itself (not a notice over the top bar).
  function sayOn(id, words) {
    var s = id && $('cha-' + id);
    if (!s) return;
    s.appendChild(el('p', 'small lt-cha-said', words));
    s.scrollIntoView({ block: 'nearest' });
  }
  // The form: one for skills and both kinds of Challenge; what isn't used is hidden.
  function edit(c) {
    editing = c || null;
    var sk = mode === 'skills';
    var v = c || (sk ? { name: '', says: '', why: '', actions: ['Place', 'Photo'], near: 20, xpEach: 1, xpNear: 0, level: 0 }
      : { name: '', kind: 'Walk goal', says: '', why: '', milesGoal: '', segGoal: 0, xpPer: 0.1, skill: '', goal: '', xpOne: 1, mult: 1, from: 0, to: 0 });
    $('cha-form-title').textContent = c ? 'Change ' + c.name : sk ? 'Add a skill' : 'Add a Challenge';
    $('cha-name').value = v.name; $('cha-says').value = v.says; $('cha-why').value = v.why || '';
    if (sk) {
      Array.prototype.forEach.call(document.querySelectorAll('#cha-actions input'), function (x) { x.checked = v.actions.indexOf(x.value) !== -1; });
      $('cha-near').value = v.near; $('cha-xp-each').value = v.xpEach; $('cha-xp-near').value = v.xpNear; $('cha-level').value = v.level;
    } else {
      $('cha-kind').value = v.kind; $('cha-from').value = ymd(v.from); $('cha-to').value = ymd(v.to);
      $('cha-miles').value = v.milesGoal; $('cha-segs').value = v.segGoal; $('cha-xp-per').value = v.xpPer;
      if (v.skill) $('cha-skill').value = v.skill;
      $('cha-goal').value = v.goal; $('cha-xp-one').value = v.xpOne; $('cha-mult').value = v.mult;
    }
    $('cha-err').textContent = '';
    kindShown();
    $('cha-form').hidden = false;
    $('cha-form').scrollIntoView({ block: 'start' });
    $('cha-name').focus();
  }
  function kindShown() {
    var sk = mode === 'skills', walk = $('cha-kind').value === 'Walk goal';
    $('cha-items-box').hidden = !sk;
    $('cha-kind-row').hidden = sk; $('cha-dates').hidden = sk; $('cha-mult-row').hidden = sk;
    $('cha-walk-box').hidden = sk || !walk;
    $('cha-skill-box').hidden = sk || walk;
  }
  $('cha-kind').addEventListener('change', kindShown);
  $('cha-add').addEventListener('click', function () { edit(null); });
  $('cha-cancel').addEventListener('click', function () { $('cha-form').hidden = true; editing = null; });
  $('cha-save').addEventListener('click', function () {
    var sk = mode === 'skills', x;
    if (sk) {
      x = { id: editing ? editing.id : '', name: $('cha-name').value, says: $('cha-says').value, why: $('cha-why').value,
        actions: Array.prototype.filter.call(document.querySelectorAll('#cha-actions input'), function (i) { return i.checked; }).map(function (i) { return i.value; }),
        near: $('cha-near').value, xpEach: $('cha-xp-each').value, xpNear: $('cha-xp-near').value, level: $('cha-level').value };
    } else {
      x = { id: editing ? editing.id : '', name: $('cha-name').value, kind: $('cha-kind').value, says: $('cha-says').value, why: $('cha-why').value,
        from: $('cha-from').value, to: $('cha-to').value, milesGoal: $('cha-miles').value, segGoal: $('cha-segs').value, xpPer: $('cha-xp-per').value,
        skill: $('cha-skill').value, goal: $('cha-goal').value, xpOne: $('cha-xp-one').value, mult: $('cha-mult').value };
    }
    var was = editing;
    app.busy($('cha-save'), 'cha-err', function () {
      return app.api(sk ? 'toolSkillSave' : 'challengeSave', sk ? { token: app.myToken(), skill: x } : { token: app.myToken(), challenge: x }).then(function (d) {
        $('cha-form').hidden = true;
        editing = null;
        useAdmin(d);
        var list = sk ? d.skills : d.challenges;
        var id = was ? was.id : (list[list.length - 1] || {}).id;
        sayOn(id, was ? 'Changed.' : sk ? 'Made: players find it in Litter Class Skills.' : 'Made, and open to players now.');
      });
    });
  });

  // The Skills and Challenges buttons, in the Admin Mode box while Admin Mode is on.
  function sync() { $('me-go-challenges').hidden = !$('cl-sim').checked; $('me-go-skills-admin').hidden = !$('cl-sim').checked; }
  $('cl-sim').addEventListener('change', sync);
  $('me-go-challenges').addEventListener('click', function () { if (app.closePanel) app.closePanel(); app.notice(''); openAdmin('challenges'); });
  $('me-go-skills-admin').addEventListener('click', function () { if (app.closePanel) app.closePanel(); app.notice(''); openAdmin('skills'); });
  $('cha-back').addEventListener('click', function () { if (app.back) app.back(); });

  // An item's photo in Reviews, fetched when asked for.
  function photoInto(itemId, img, button) {
    button.disabled = true;
    return app.api('challengePhoto', { token: app.myToken(), itemId: itemId }).then(function (d) {
      img.src = d.photo; img.hidden = false; button.hidden = true;
    }, function (err) { button.disabled = false; app.notice(err.message); });
  }

  return { load: load, openAdmin: openAdmin, sync: sync, skillsShown: skillsShown, photoInto: photoInto, cellOf: function (lat, lon) { return G.cellAt(lat, lon); } };
};
