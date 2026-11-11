// Skills built from the toolbox, and Quests built from them (S6-P8, |Q661 (a),
// |M669, |M846, |M895; reworked from Jeremy's answers in chat, Nov 6: "the
// trash receptacle thing should be a litter skill, not a challenge. the
// challenges are supposed to be built out of existing skills.").
// - A skill like Trash receptacles: in the Skills sheet, a quick menu (|Q668):
//   search it, press Use, and its steps come one at a time in a card low on
//   the screen, the map behind it: stand by it and Capture the place (a
//   pending pin on the map), step back and take its photo, a note, Send.
// - Your quests: each Quest open now, with its Challenges as its list
//   (|M895), each with its progress, and the Quest's finishing bonus.
// - Admin Mode: the Quest Drafting Bench (a Quest's name, dates, bonus and
//   segments picked on the map, then its Challenges), and the Skills screen.
window.LitterChallenges = function (app) {
  'use strict';
  var $ = app.$, G = window.LitterGeo;
  var mine = null, skills = null, admin = null, editing = null, mode = 'quests', quest = null, picked = [], qbMap = null, qbLayers = {};

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function button(cls, text, fn) { var b = el('button', cls, text); b.type = 'button'; if (fn) b.addEventListener('click', fn); return b; }
  function day(ms) { return new Date(ms).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }); }
  function when(ms) { return new Date(ms).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function ymd(ms) { if (!ms) return ''; var d = new Date(ms); return d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2) + '-' + ('0' + d.getDate()).slice(-2); }
  function dates(c) {
    if (c.from && c.to) return day(c.from) + ' to ' + day(c.to);
    if (c.from) return 'From ' + day(c.from);
    if (c.to) return 'Until ' + day(c.to);
    return 'Any time';
  }
  function round(n) { return Math.round(n * 100) / 100; }
  // A Challenge's condition and its XP, in words.
  function condition(c) {
    if (c.kind === 'Walk goal') {
      var parts = [];
      if (c.milesGoal) parts.push(c.milesGoal + ' mi');
      if (c.segGoal) parts.push(c.segGoal + ' different segments');
      return 'Collecting: ' + (parts.join(', across ') || 'any miles');
    }
    return (c.skillName || c.skill) + ': ' + c.goal + ' approved';
  }
  function rewards(c) {
    var mult = c.mult > 1 ? '; ×' + c.mult + ' once it\'s done' : '';
    if (c.kind === 'Walk goal') {
      var r = [];
      if (c.xpPer) r.push(c.xpPer + ' XP for each 0.01 mi' + (c.milesGoal ? ', up to ' + c.milesGoal + ' mi' : ''));
      if (c.xpOne) r.push(c.xpOne + ' XP for each segment' + (c.segGoal ? ', up to ' + c.segGoal : ''));
      return (r.join('; ') || 'No XP of its own') + mult + '.';
    }
    return c.xpOne + ' XP for each one approved with ' + (c.skillName || c.skill) + ', up to ' + c.goal + mult + '.';
  }
  function skillRewards(s) {
    return s.xpEach + ' XP for each one approved' + (s.xpNear && s.near ? ', or ' + s.xpNear + ' XP within ' + s.near + ' m of a public segment' : '') + '.';
  }
  function allCells(segs) { var out = []; (segs || []).forEach(function (g) { out = out.concat(g.squares || []); }); return out; }

  /* ── Your quests: each Quest, with its Challenges as its list ── */

  function load() {
    var box = $('challenges-list');
    $('challenges-note').textContent = 'Loading your Quests…';
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
    var list = (mine && mine.quests) || [];
    $('challenges-note').textContent = list.length ? 'Each Quest is a list of Challenges. Finish them all for its bonus.' : 'No Quests are open now.';
    list.forEach(function (q) { box.appendChild(questCard(q)); });
  }
  function questCard(q) {
    var d = el('details', 'lt-quest-card');
    d.id = 'qst-' + q.id;
    d.open = list1();
    d.appendChild(el('summary', 'lt-challenge-head', q.name + ' · ' + q.xp + ' XP' + (q.done ? ' · Done!' : '') + (q.test ? ' · a test' : '')));
    if (q.says) d.appendChild(el('p', null, q.says));
    if (q.test) d.appendChild(el('p', 'small lt-challenge-closed', 'A test: only admins see it, and its XP isn\'t counted.'));
    d.appendChild(el('p', 'small', dates(q) + (q.bonus ? ' · ' + q.bonus + ' XP more once every Challenge is done' : '')));
    if (!q.live) d.appendChild(el('p', 'small lt-challenge-closed', 'Not open now.'));
    if (q.segments.length) {
      var segs = el('p', 'small lt-quest-segs', 'On ' + q.segments.map(function (g) { return g.name; }).join(', ') + '. ');
      if (app.openMap) segs.appendChild(button('link-btn', 'Show them on the map', function () { app.openMap(allCells(q.segments)); }));
      d.appendChild(segs);
    }
    var ul = el('ul', 'lt-quest-chs');
    q.challenges.forEach(function (c) { ul.appendChild(challengeItem(c)); });
    d.appendChild(ul);
    return d;
  }
  function list1() { return ((mine && mine.quests) || []).length === 1; }
  function challengeItem(c) {
    var li = el('li', 'lt-challenge' + (c.progress.done ? ' done' : ''));
    li.id = 'chl-' + c.id;
    var g = c.progress || {};
    li.appendChild(el('p', 'lt-challenge-name', (g.done ? '✓ ' : '') + c.name + ' · ' + (g.xp || 0) + ' XP'));
    if (c.says) li.appendChild(el('p', 'small', c.says));
    if (c.why) li.appendChild(el('p', 'muted small', c.why));
    var have, goal, line;
    if (c.kind === 'Walk goal') {
      have = c.milesGoal ? g.miles || 0 : g.segments || 0; goal = c.milesGoal || c.segGoal;
      line = (c.milesGoal ? round(g.miles || 0) + ' of ' + c.milesGoal + ' mi' : '') + (c.milesGoal && c.segGoal ? ' · ' : '') + (c.segGoal ? (g.segments || 0) + ' of ' + c.segGoal + ' segments' : '');
    } else {
      have = g.count || 0; goal = c.goal;
      line = have + ' of ' + goal + ' approved';
    }
    li.appendChild(el('p', 'lt-challenge-goal', line));
    var bar = el('div', 'lt-challenge-bar'), fill = el('div', 'lt-challenge-fill');
    fill.style.width = Math.min(100, goal ? have / goal * 100 : 0) + '%';
    bar.appendChild(fill);
    li.appendChild(bar);
    li.appendChild(el('p', 'muted small', rewards(c)));
    if (c.kind === 'Skill goal' && app.openSkills) li.appendChild(button('btn btn-secondary lt-quest-use', 'Use ' + (c.skillName || 'the skill') + ' from Skills', function () { app.openSkills(c.skillName); }));
    return li;
  }

  /* ── Skills built from the toolbox: the quick menu ── */

  // The sheet was drawn: fill each skill from what's loaded, and (when it opens) load it fresh.
  function skillsShown(fresh) {
    fillSkills();
    if (!fresh) return;
    app.api('toolSkillsLoad', { token: app.myToken() }).then(function (d) { skills = d; fillSkills(); }, function (err) {
      if (err.code === 'signed-out') return app.signedOut();
    });
  }
  function fillSkills() {
    ((skills && skills.skills) || []).forEach(function (s) {
      var row = document.getElementById('skl-' + s.id), box = row && row.querySelector('.lt-skill-tool');
      if (!box) return;
      box.textContent = '';
      // Usable now: Use first, at the top of the sheet.
      if (!s.locked && s.state === 'Open') {
        box.appendChild(button('btn btn-primary lt-skill-use', 'Use', function () { run(s); }));
        row.classList.add('lt-skill-usable');
        if (row.parentNode && row.parentNode.firstChild !== row) row.parentNode.insertBefore(row, row.parentNode.firstChild);
      }
      if (s.why) box.appendChild(el('p', 'muted small', s.why));
      box.appendChild(el('p', 'small', skillRewards(s)));
      if (s.mine.length) {
        var past = el('details', 'lt-skill-sent');
        past.appendChild(el('summary', 'small', 'What you\'ve sent (' + s.mine.length + ')'));
        s.mine.slice().reverse().forEach(function (x) {
          past.appendChild(el('p', 'small lt-challenge-item ' + x.state.toLowerCase(), when(x.sent) + ' · ' + (x.state === 'Approved' ? 'Approved, ' + x.xp + ' XP' : x.state === 'Declined' ? 'Declined' + (x.why ? ': "' + x.why + '"' : '') : 'Waiting for a review') +
            (x.note ? ' · "' + x.note + '"' : '')));
        });
        box.appendChild(past);
      }
    });
    filterSkills();
  }
  // Search: each skill whose name or words match.
  function filterSkills() {
    var q = ($('skills-search').value || '').trim().toLowerCase();
    Array.prototype.forEach.call(document.querySelectorAll('#cl-skills .lt-skill'), function (li) {
      li.hidden = !!q && li.textContent.toLowerCase().indexOf(q) === -1;
    });
  }
  $('skills-search').addEventListener('input', filterSkills);

  // Using a skill, its steps one at a time (|Q668), in a card low on the
  // screen: the map stays in view behind it, with the place's pending pin.
  var got = null, using = null;
  function run(s) {
    using = s;
    got = { lat: null, lon: null, acc: null, photo: '', note: '' };
    if (app.closeSkills) app.closeSkills();
    $('sk-run-title').textContent = s.name;
    $('sk-run-err').textContent = '';
    $('sk-run').hidden = false;
    step(0);
  }
  function steps() {
    var has = function (a) { return using.actions.indexOf(a) !== -1; }, out = [];
    if (has('Place')) out.push('place');
    if (has('Photo')) out.push('photo');
    out.push('send');
    return out;
  }
  function step(i) {
    var list = steps(), k = list[i], body = $('sk-run-body');
    body.textContent = '';
    $('sk-run-err').textContent = '';
    body.appendChild(el('p', 'muted small lt-skill-step-n', 'Step ' + (i + 1) + ' of ' + list.length));
    var next = function () { step(i + 1); };
    if (k === 'place') {
      body.appendChild(el('p', 'lt-skill-step', 'Stand close to it, right beside it. Then press Capture the place.'));
      var say = el('p', 'small lt-skill-where');
      var cap = button('btn btn-primary lt-skill-capture', got.lat != null ? 'Capture it again' : 'Capture the place', function () {
        if (!navigator.geolocation) { say.textContent = 'This phone can\'t give its location here.'; return; }
        cap.disabled = true;
        say.textContent = 'Finding where you are…';
        navigator.geolocation.getCurrentPosition(function (p) {
          cap.disabled = false;
          got.lat = p.coords.latitude; got.lon = p.coords.longitude; got.acc = p.coords.accuracy;
          say.textContent = 'Captured, within ' + Math.round(got.acc) + ' m. Its pin is on the map, waiting until it\'s sent.';
          if (app.pendingPin) app.pendingPin(got.lat, got.lon, using.name);
          cap.textContent = 'Capture it again';
          go.disabled = false;
        }, function () {
          cap.disabled = false;
          say.textContent = 'Your location couldn\'t be found. Check that this page may use it, then try again.';
        }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
      });
      var go = button('btn btn-secondary lt-skill-next', 'Next', next);
      go.disabled = got.lat == null;
      if (got.lat != null) say.textContent = 'Captured, within ' + Math.round(got.acc) + ' m.';
      body.appendChild(cap); body.appendChild(say); body.appendChild(go);
    } else if (k === 'photo') {
      body.appendChild(el('p', 'lt-skill-step', 'Now take a few steps back. Take its photo with the landmarks around it in view, so others can find it.'));
      body.appendChild(el('p', 'small lt-skill-warn', 'Keep people out of the photo, and anything that shows who they are.'));
      var lab = el('label', 'btn btn-primary lt-challenge-photo-btn', got.photo ? 'Take another photo' : 'Take its photo');
      var file = el('input', 'lt-challenge-photo');
      file.type = 'file'; file.accept = 'image/*'; file.setAttribute('capture', 'environment'); file.id = 'sk-run-photo';
      lab.htmlFor = file.id;
      var shot = el('img', 'lt-challenge-shot');
      shot.alt = 'The photo to send';
      shot.hidden = !got.photo;
      if (got.photo) shot.src = got.photo;
      var go2 = button('btn btn-secondary lt-skill-next', 'Next', next);
      go2.disabled = !got.photo;
      file.addEventListener('change', function () {
        var fl = file.files && file.files[0];
        if (!fl) return;
        shrink(fl).then(function (url) { got.photo = url; shot.src = url; shot.hidden = false; lab.textContent = 'Take another photo'; go2.disabled = false; $('sk-run-err').textContent = ''; },
          function () { $('sk-run-err').textContent = 'That photo couldn\'t be read. Take it again.'; });
      });
      body.appendChild(lab); body.appendChild(file); body.appendChild(shot); body.appendChild(go2);
    } else {
      var note = null;
      if (using.actions.indexOf('Note') !== -1) {
        var nr = el('div', 'ig'), nl = el('label', null, 'A note' + (list.length > 1 ? ' (if there\'s anything to say)' : ''));
        note = el('textarea', 'lt-challenge-note');
        note.rows = 2; note.maxLength = 1000; note.id = 'sk-run-note'; nl.htmlFor = note.id; note.value = got.note;
        nr.appendChild(nl); nr.appendChild(note);
        body.appendChild(nr);
      } else body.appendChild(el('p', 'lt-skill-step', 'Ready to send it.'));
      var send = button('btn btn-primary lt-challenge-go', 'Send', function () {
        if (note) got.note = note.value;
        app.busy(send, 'sk-run-err', function () {
          return app.api('toolSkillSend', { token: app.myToken(), skillId: using.id, lat: got.lat, lon: got.lon, acc: got.acc, photo: got.photo, note: got.note }).then(function (d) {
            skills = d;
            if (app.pendingPin) app.pendingPin(null);
            body.textContent = '';
            body.appendChild(el('p', 'lt-challenge-sent', 'Sent. An admin reviews it, and its XP comes once it\'s approved.'));
            body.appendChild(button('btn btn-secondary', 'Done', close));
          });
        });
      });
      body.appendChild(send);
    }
    if (i > 0) body.appendChild(button('link-btn lt-skill-back', 'Back a step', function () { if (note) got.note = note.value; step(i - 1); }));
  }
  function close() {
    $('sk-run').hidden = true;
    if (app.pendingPin) app.pendingPin(null);
    using = null;
  }
  $('sk-run-close').addEventListener('click', close);

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

  /* ── Admin Mode: the Quest Drafting Bench, and the Skills screen ── */

  function openAdmin(which) {
    mode = which === 'skills' ? 'skills' : 'quests';
    app.show('v-challenges-admin');
    window.scrollTo(0, 0);
    editing = null; quest = null;
    $('cha-form').hidden = true;
    $('qb-form').hidden = true;
    $('cha-list').textContent = '';
    $('cha-title').textContent = mode === 'skills' ? 'Skill Builder' : 'Quest Drafting Bench';
    $('cha-add').textContent = mode === 'skills' ? 'Add a skill' : 'Draft a Quest';
    $('cha-note').textContent = 'Loading…';
    return app.api(mode === 'skills' ? 'toolSkillsAdmin' : 'challengesAdmin', { token: app.myToken() }).then(useAdmin, function (err) {
      if (err.code === 'signed-out') return app.signedOut();
      $('cha-note').textContent = err.message;
    });
  }
  function useAdmin(d) {
    admin = d;
    var box = $('cha-list'), sk = mode === 'skills';
    box.textContent = '';
    $('cha-note').textContent = d.canBuild
      ? (sk ? 'Each skill is built from the toolbox: what players send, its XP, and the level it opens at. Players use it from Skills.'
        : 'A Quest: its dates, its segments, and its Challenges, each a skill used on those segments with its condition. It\'s a Draft until you open it to players.')
      : 'A Builder or above makes and changes these; here they are as they stand.';
    $('cha-add').hidden = !d.canBuild;
    if (sk) d.skills.forEach(function (c) { box.appendChild(skillCard(c, d.canBuild)); });
    else (d.quests || []).forEach(function (q) { box.appendChild(benchCard(q, d.canBuild)); });
  }
  function skillCard(c, canBuild) {
    var s = el('section', 'card lt-cha-item' + (c.state === 'Retired' ? ' retired' : ''));
    s.id = 'cha-' + c.id;
    s.appendChild(el('p', 'lt-col-head', c.name));
    s.appendChild(el('p', 'small', c.state + ' · ' + c.actions.join(', ') + ' · ' + (c.level ? 'opens at Level ' + c.level : 'open to everyone')));
    s.appendChild(el('p', 'small', skillRewards(c)));
    s.appendChild(el('p', 'muted small', c.sent + ' sent' + (c.waiting ? ', ' + c.waiting + ' waiting in Reviews' : '') + '.'));
    if (canBuild) {
      var row = el('div', 'lt-cha-buttons');
      row.appendChild(button('btn btn-secondary lt-cha-change', 'Change', function () { edit(c); }));
      row.appendChild(retireButton(c, 'toolSkillRetire', 'skillId'));
      s.appendChild(row);
    }
    return s;
  }
  function retireButton(c, action, key) {
    var rt = button('btn btn-secondary lt-cha-retire', c.state === 'Retired' ? 'Open again' : 'Retire');
    rt.addEventListener('click', function () {
      rt.disabled = true;
      var body = { token: app.myToken(), retire: c.state !== 'Retired' };
      body[key] = c.id;
      app.api(action, body).then(function (d2) {
        useAdmin(d2);
        sayOn(c.id, c.state === 'Retired' ? 'Open again.' : 'Retired. What it earned stays earned.');
      }, function (err) { rt.disabled = false; app.notice(err.message); });
    });
    return rt;
  }
  // A Quest on the Bench: its state, dates, segments and bonus, then its Challenges as its list.
  function benchCard(q, canBuild) {
    var s = el('section', 'card lt-cha-item lt-qb-item' + (q.state === 'Retired' ? ' retired' : ''));
    s.id = 'cha-' + q.id;
    s.appendChild(el('p', 'lt-col-head', q.name));
    s.appendChild(el('p', 'small', q.state + (q.test ? ' · a test: only admins see it' : '') + ' · ' + dates(q) + (q.bonus ? ' · ' + q.bonus + ' XP to finish' : '')));
    var names = q.segments.map(function (id) { var g = segById(id); return g ? g.name : id; });
    s.appendChild(el('p', 'small', names.length ? 'Its segments: ' + names.join(', ') : 'No segments: anywhere counts.'));
    var ul = el('ul', 'lt-qb-chs');
    if (!q.challenges.length) ul.appendChild(el('li', 'muted small', 'No Challenges yet. Add one: a Quest is its list of Challenges.'));
    q.challenges.forEach(function (c) {
      var li = el('li', 'lt-qb-ch' + (c.state === 'Retired' ? ' retired' : ''));
      li.id = 'cha-' + c.id;
      li.appendChild(el('p', 'lt-qb-ch-name', c.name + (c.state === 'Retired' ? ' (retired)' : '')));
      li.appendChild(el('p', 'small', condition(c) + ' · ' + rewards(c)));
      if (canBuild) {
        var row = el('div', 'lt-cha-buttons');
        row.appendChild(button('btn btn-secondary lt-cha-change', 'Change', function () { editChallenge(q, c); }));
        row.appendChild(retireButton(c, 'challengeRetire', 'challengeId'));
        li.appendChild(row);
      }
      ul.appendChild(li);
    });
    s.appendChild(ul);
    if (canBuild) {
      var b = el('div', 'lt-cha-buttons');
      b.appendChild(button('btn btn-primary lt-qb-add-ch', 'Add a Challenge', function () { editChallenge(q, null); }));
      b.appendChild(button('btn btn-secondary lt-qb-change', 'Change the Quest', function () { editQuest(q); }));
      var to = q.state === 'Open' ? 'Retired' : 'Open';
      var st = button('btn btn-secondary lt-qb-state', q.state === 'Draft' ? 'Open it to players' : q.state === 'Open' ? 'Retire' : 'Open again');
      st.addEventListener('click', function () {
        st.disabled = true;
        app.api('questState', { token: app.myToken(), questId: q.id, state: to }).then(function (d2) {
          useAdmin(d2);
          sayOn(q.id, to === 'Open' ? (q.test ? 'Open: admins see it on Your quests.' : 'Open: players see it on Your quests.') : 'Retired. What it earned stays earned.');
        }, function (err) { st.disabled = false; sayOn(q.id, err.message); });
      });
      b.appendChild(st);
      s.appendChild(b);
    }
    return s;
  }
  function segById(id) { return ((admin && admin.segments) || []).filter(function (g) { return g.id === id; })[0]; }
  // What just happened, said on the item itself (not a notice over the top bar).
  function sayOn(id, words) {
    var s = id && $('cha-' + id);
    if (!s) return;
    s.appendChild(el('p', 'small lt-cha-said', words));
    s.scrollIntoView({ block: 'nearest' });
  }

  // A Quest's form: its segments picked on the map, and in a list under it.
  function editQuest(q) {
    quest = q || null;
    $('cha-form').hidden = true;
    var v = q || { name: '', says: '', from: 0, to: 0, bonus: 0, segments: [], test: false };
    $('qb-form-title').textContent = q ? 'Change ' + q.name : 'Draft a Quest';
    $('qb-name').value = v.name; $('qb-says').value = v.says; $('qb-from').value = ymd(v.from); $('qb-to').value = ymd(v.to);
    $('qb-bonus').value = v.bonus; $('qb-test').checked = !!v.test; $('qb-err').textContent = '';
    picked = v.segments.slice();
    $('qb-form').hidden = false;
    drawPicker();
    $('qb-form').scrollIntoView({ block: 'start' });
    $('qb-name').focus();
  }
  function drawPicker() {
    var segs = (admin && admin.segments) || [];
    if (window.L && !qbMap) {
      qbMap = L.map('qb-map', { zoomControl: true, attributionControl: true });
      L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap contributors' }).addTo(qbMap);
    }
    if (qbMap) {
      Object.keys(qbLayers).forEach(function (k) { qbMap.removeLayer(qbLayers[k]); });
      qbLayers = {};
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
        shape.addTo(qbMap);
        qbLayers[g.id] = shape;
      });
      setTimeout(function () {
        qbMap.invalidateSize();
        if (all.length) qbMap.fitBounds(all, { padding: [16, 16], maxZoom: 17 });
        else qbMap.setView([32.3668, -86.3000], 13);
      }, 0);
    }
    var box = $('qb-segs');
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
  $('qb-cancel').addEventListener('click', function () { $('qb-form').hidden = true; quest = null; });
  $('qb-save').addEventListener('click', function () {
    var was = quest;
    var x = { id: was ? was.id : '', name: $('qb-name').value, says: $('qb-says').value, from: $('qb-from').value, to: $('qb-to').value,
      bonus: $('qb-bonus').value, segments: picked.slice(), test: $('qb-test').checked };
    app.busy($('qb-save'), 'qb-err', function () {
      return app.api('questSave', { token: app.myToken(), quest: x }).then(function (d) {
        $('qb-form').hidden = true;
        quest = null;
        useAdmin(d);
        sayOn(d.saved, was ? 'Changed.' : 'Drafted. Now Add a Challenge: a Quest is its list of Challenges.');
      });
    });
  });

  // A Challenge's form, under its Quest: built from Collecting or a skill from the toolbox.
  function editChallenge(q, c) {
    quest = q; editing = c || null;
    $('qb-form').hidden = true;
    var v = c || { name: '', kind: 'Walk goal', says: '', why: '', milesGoal: '', segGoal: 0, xpPer: 0.1, skill: '', goal: '', xpOne: 1, mult: 1 };
    var sel = $('cha-kind');
    sel.textContent = '';
    var o = el('option', null, 'Collecting: miles and segments, from their walks');
    o.value = 'Walk goal';
    sel.appendChild(o);
    ((admin && admin.skills) || []).forEach(function (s) { var x = el('option', null, s.name + ': so many approved'); x.value = 'skill:' + s.id; sel.appendChild(x); });
    sel.value = v.kind === 'Skill goal' ? 'skill:' + v.skill : 'Walk goal';
    $('cha-form-title').textContent = c ? 'Change ' + c.name : 'Add a Challenge';
    $('cha-form-quest').textContent = 'Under the Quest ' + q.name + (q.segments.length ? ', on its ' + q.segments.length + ' segments' : '') + '. Its dates are the Quest\'s.';
    $('cha-form-quest').hidden = false;
    $('cha-name-label').textContent = 'Name (blank: from its condition)';
    $('cha-says-label').textContent = 'What it says to players (blank: from its condition)';
    $('cha-name').value = v.name; $('cha-says').value = v.says; $('cha-why').value = v.why || '';
    $('cha-miles').value = v.milesGoal; $('cha-segs').value = v.segGoal; $('cha-xp-per').value = v.xpPer; $('cha-xp-seg').value = v.kind === 'Walk goal' ? v.xpOne || 0 : 0;
    $('cha-goal').value = v.goal; $('cha-xp-one').value = v.kind === 'Skill goal' ? v.xpOne : 1; $('cha-mult').value = v.mult;
    $('cha-err').textContent = '';
    kindShown();
    $('cha-form').hidden = false;
    $('cha-form').scrollIntoView({ block: 'start' });
    sel.focus();
  }
  // The Skills screen's form.
  function edit(c) {
    editing = c || null;
    $('qb-form').hidden = true;
    var v = c || { name: '', says: '', why: '', actions: ['Place', 'Photo'], near: 20, xpEach: 1, xpNear: 0, level: 0 };
    $('cha-form-title').textContent = c ? 'Change ' + c.name : 'Add a skill';
    $('cha-form-quest').hidden = true;
    $('cha-name-label').textContent = 'Name';
    $('cha-says-label').textContent = 'What the screen says: what to do';
    $('cha-name').value = v.name; $('cha-says').value = v.says; $('cha-why').value = v.why || '';
    Array.prototype.forEach.call(document.querySelectorAll('#cha-actions input'), function (x) { x.checked = v.actions.indexOf(x.value) !== -1; });
    $('cha-near').value = v.near; $('cha-xp-each').value = v.xpEach; $('cha-xp-near').value = v.xpNear; $('cha-level').value = v.level;
    $('cha-err').textContent = '';
    kindShown();
    $('cha-form').hidden = false;
    $('cha-form').scrollIntoView({ block: 'start' });
    $('cha-name').focus();
  }
  function kindShown() {
    var sk = mode === 'skills', walk = $('cha-kind').value === 'Walk goal';
    $('cha-items-box').hidden = !sk;
    $('cha-kind-row').hidden = sk; $('cha-mult-row').hidden = sk;
    $('cha-walk-box').hidden = sk || !walk;
    $('cha-skill-box').hidden = sk || walk;
  }
  $('cha-kind').addEventListener('change', kindShown);
  $('cha-add').addEventListener('click', function () { if (mode === 'skills') edit(null); else editQuest(null); });
  $('cha-cancel').addEventListener('click', function () { $('cha-form').hidden = true; editing = null; });
  $('cha-save').addEventListener('click', function () {
    var sk = mode === 'skills', x;
    if (sk) {
      x = { id: editing ? editing.id : '', name: $('cha-name').value, says: $('cha-says').value, why: $('cha-why').value,
        actions: Array.prototype.filter.call(document.querySelectorAll('#cha-actions input'), function (i) { return i.checked; }).map(function (i) { return i.value; }),
        near: $('cha-near').value, xpEach: $('cha-xp-each').value, xpNear: $('cha-xp-near').value, level: $('cha-level').value };
    } else {
      var k = $('cha-kind').value, walk = k === 'Walk goal';
      x = { id: editing ? editing.id : '', quest: quest ? quest.id : '', name: $('cha-name').value, kind: walk ? 'Walk goal' : 'Skill goal', says: $('cha-says').value, why: $('cha-why').value,
        milesGoal: walk ? $('cha-miles').value : '', segGoal: walk ? $('cha-segs').value : '', xpPer: walk ? $('cha-xp-per').value : '',
        skill: walk ? '' : k.slice(6), goal: walk ? '' : $('cha-goal').value, xpOne: walk ? $('cha-xp-seg').value : $('cha-xp-one').value, mult: $('cha-mult').value };
    }
    var was = editing, under = quest;
    app.busy($('cha-save'), 'cha-err', function () {
      return app.api(sk ? 'toolSkillSave' : 'challengeSave', sk ? { token: app.myToken(), skill: x } : { token: app.myToken(), challenge: x }).then(function (d) {
        $('cha-form').hidden = true;
        editing = null;
        useAdmin(d);
        if (sk) { var list = d.skills; sayOn(was ? was.id : (list[list.length - 1] || {}).id, was ? 'Changed.' : 'Made: players find it in Skills.'); }
        else sayOn(under && under.id, was ? 'Challenge changed.' : 'Challenge added.');
      });
    });
  });

  // The Bench and the Skills screen, in the Admin Mode box while Admin Mode is on.
  function sync() { $('me-go-challenges').hidden = !$('cl-sim').checked; $('me-go-skills-admin').hidden = !$('cl-sim').checked; }
  $('cl-sim').addEventListener('change', sync);
  $('me-go-challenges').addEventListener('click', function () { if (app.closePanel) app.closePanel(); app.notice(''); openAdmin('quests'); });
  $('me-go-skills-admin').addEventListener('click', function () { if (app.closePanel) app.closePanel(); app.notice(''); openAdmin('skills'); });
  $('cha-back').addEventListener('click', function () { if (app.back) app.back(); });

  // An item's photo in Reviews, fetched when asked for.
  function photoInto(itemId, img, btn) {
    btn.disabled = true;
    return app.api('challengePhoto', { token: app.myToken(), itemId: itemId }).then(function (d) {
      img.src = d.photo; img.hidden = false; btn.hidden = true;
    }, function (err) { btn.disabled = false; app.notice(err.message); });
  }

  return { load: load, openAdmin: openAdmin, sync: sync, skillsShown: skillsShown, photoInto: photoInto, cellOf: function (lat, lon) { return G.cellAt(lat, lon); } };
};
