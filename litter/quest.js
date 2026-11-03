// The first quest (S5-P20, Q579 to Q581, Nov 3): six steps from setting up
// an account to the first collection, ticked as they're done, on the main
// page until they all are. Each step ticked is kept on the account by HABO
// (Quest.js); Start collecting waits for them (collect.js). litter.js calls
// LitterQuest(app) with its helpers.
window.LitterQuest = function (app) {
  'use strict';

  var $ = app.$;
  var GEAR_KEY = 'habo-litter-gear';   // the gear ticked, kept on this phone until step 3 is done
  var quest = null;
  var pending = {};
  // Gloves, bags, a vest and a scale are needed; a grabber helps (the waiver:
  // "use a grabber when I have one").
  var GEAR = [['gloves', 'Gloves', true], ['bags', 'Bags', true], ['vest', 'A bright safety vest', true],
    ['scale', 'A hanging luggage scale', true], ['grabber', 'A grabber, if you have one', false]];
  var STEPS = [
    { n: 1, title: 'Set up your account', say: 'Your name, email, handle, how you show on the public map, and the waiver signed.' },
    { n: 2, title: 'The safety rules', say: 'Your waiver\'s safety rules, one screen at a time.', button: 'Read the safety rules', go: openSafety },
    { n: 3, title: 'Your gear', say: 'Tick each one you have. Gloves, bags, a vest and a scale are needed before your first walk.', gear: true },
    { n: 4, title: 'Your GPX recorder', say: 'Install a GPX recorder app on your phone: any app that saves a .gpx file. Record a minute or two of walking around, save it, then choose the file here. Nothing in it is kept: the page only checks that it reads.', file: true },
    { n: 5, title: 'The litter pulse', say: 'Press the real buttons once at home: Litter pulse, then Weigh, New bag, Pause and End, typing what a scale might show. It\'s practice: nothing is saved.',
      button: 'Practice the litter pulse', go: function () { app.practice(); } },
    { n: 6, title: 'Choose your plan', say: 'A public segment near you, or a private segment you draw: press Choose your plan or Draw a private segment below.' }
  ];

  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function keep(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* this visit only */ } }
  function has(n) { return !!quest && quest.steps.indexOf(n) !== -1; }

  /* ── The card on the main page ── */

  function show(q) {
    quest = q || null;
    render();
  }

  function render() {
    var card = $('qs-card');
    card.hidden = !quest || quest.done;
    if (card.hidden) return;
    $('qs-say').textContent = 'Six steps before your first collection, each ticked as you do it. Each one earns ' + quest.stepXp + ' XP, and finishing earns ' + quest.doneXp + ' more.';
    $('qs-gate').hidden = !quest.needed;
    var list = $('qs-steps');
    list.textContent = '';
    STEPS.forEach(function (s) {
      var done = has(s.n);
      var li = document.createElement('li');
      li.id = 'qs-step-' + s.n;
      li.className = done ? 'done' : '';
      var head = document.createElement('p');
      head.className = 'lt-quest-head';
      var badge = document.createElement('span');
      badge.className = 'lt-quest-n';
      badge.setAttribute('aria-hidden', 'true');
      badge.textContent = done ? '✓' : String(s.n);
      head.appendChild(badge);
      head.appendChild(document.createTextNode(s.title + (done ? ': done' : '')));
      li.appendChild(head);
      if (!done) {
        var say = document.createElement('p');
        say.className = 'lt-quest-say';
        say.textContent = s.say;
        li.appendChild(say);
        var body = document.createElement('div');
        body.className = 'lt-quest-body';
        if (s.button) {
          var b = document.createElement('button');
          b.type = 'button';
          b.className = 'btn btn-secondary';
          b.textContent = s.button;
          b.addEventListener('click', s.go);
          body.appendChild(b);
        }
        if (s.gear) body.appendChild(gearList());
        if (s.file) body.appendChild(gpxPicker());
        if (body.childNodes.length) li.appendChild(body);
      }
      list.appendChild(li);
    });
  }

  // A step done on the page: HABO keeps it, and the XP comes with it.
  function tick(n) {
    if (!quest || has(n) || pending[n]) return Promise.resolve();
    pending[n] = true;
    return app.api('questTick', { token: app.myToken(), step: n }).then(function (d) {
      pending[n] = false;
      var was = quest && quest.done;
      quest = d.quest;
      if (n === 3) keep(GEAR_KEY, null);
      if (app.onQuestChanged) app.onQuestChanged(d);
      render();
      if (quest.done && !was) app.notice('Your first quest is done: ' + quest.doneXp + ' more XP. Ready: start your first collection.');
    }, function (err) {
      pending[n] = false;
      if (err.code === 'signed-out') return app.signedOut();
      app.notice('That step couldn\'t be ticked just now: ' + err.message);
    });
  }

  /* ── Step 2: the safety rules ── */

  // The waiver's safety rules (its part 2, a rule to a line), so they're
  // always the words signed. A waiver without that part shows each of its
  // paragraphs instead.
  var rules = [], at = 0;
  function safetyRules() {
    var text = String((app.waiver() || {}).text || '').replace(/\r\n?/g, '\n');
    var lines = text.split('\n'), out = [], inside = false;
    lines.forEach(function (l) {
      var t = l.trim();
      if (/^\d+\.\s/.test(t)) { inside = /^2\.\s/.test(t); return; }
      if (inside && /^[-•]\s*/.test(t) && t.replace(/^[-•]\s*/, '')) out.push(t.replace(/^[-•]\s*/, ''));
    });
    if (out.length) return out;
    return text.split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(String);
  }
  function openSafety() {
    rules = safetyRules();
    if (!rules.length) { app.notice('The waiver hasn\'t loaded yet. Open the page again with signal.'); return; }
    at = 0;
    $('qs-safety').hidden = false;
    showRule();
  }
  function showRule() {
    $('qs-safety-n').textContent = 'Rule ' + (at + 1) + ' of ' + rules.length;
    $('qs-safety-rule').textContent = rules[at];
    $('qs-safety-back').hidden = at === 0;
    $('qs-safety-next').textContent = at === rules.length - 1 ? 'I\'ll follow these rules' : 'Next';
    $('qs-safety-next').focus();
  }
  $('qs-safety-next').addEventListener('click', function () {
    if (at < rules.length - 1) { at += 1; showRule(); return; }
    $('qs-safety').hidden = true;
    tick(2);
  });
  $('qs-safety-back').addEventListener('click', function () { if (at > 0) { at -= 1; showRule(); } });
  $('qs-safety-close').addEventListener('click', function () { $('qs-safety').hidden = true; });

  /* ── Step 3: your gear ── */

  function gearList() {
    var box = document.createElement('div');
    box.className = 'lt-quest-gear';
    var had = load(GEAR_KEY) || {};
    GEAR.forEach(function (g) {
      var l = document.createElement('label');
      var i = document.createElement('input');
      i.type = 'checkbox';
      i.value = g[0];
      i.checked = !!had[g[0]];
      i.addEventListener('change', function () {
        var now = load(GEAR_KEY) || {};
        now[g[0]] = i.checked;
        keep(GEAR_KEY, now);
        if (GEAR.every(function (x) { return !x[2] || now[x[0]]; })) tick(3);
      });
      l.appendChild(i);
      l.appendChild(document.createTextNode(' ' + g[1]));
      box.appendChild(l);
    });
    return box;
  }

  /* ── Step 4: your GPX recorder ── */

  // The practice recording is read here, on the phone, and nothing in it is
  // sent: a track with at least two points, each with its time, is enough.
  function gpxPicker() {
    var box = document.createElement('div');
    var label = document.createElement('label');
    label.className = 'lt-label';
    label.htmlFor = 'qs-gpx';
    label.textContent = 'Your practice GPX file';
    var input = document.createElement('input');
    input.type = 'file';
    input.id = 'qs-gpx';
    input.addEventListener('change', function () {
      var file = this.files[0];
      this.value = '';
      if (!file) return;
      var reader = new FileReader();
      reader.onerror = function () { app.notice('That file couldn\'t be read. Choose the .gpx file your GPX app saved.'); };
      reader.onload = function () {
        var n = timedPoints(String(reader.result));
        if (n >= 2) { tick(4); return; }
        app.notice(n === 1 ? 'That recording has only one point. Record a minute or two of walking around, then choose the new file.'
          : 'That file isn\'t a GPX track with times. Choose the .gpx file your GPX app saved.');
      };
      reader.readAsText(file);
    });
    box.appendChild(label);
    box.appendChild(input);
    return box;
  }
  function timedPoints(text) {
    var doc;
    try { doc = new DOMParser().parseFromString(text, 'application/xml'); } catch (e) { return 0; }
    return Array.prototype.filter.call(doc.getElementsByTagName('trkpt'), function (p) {
      var t = p.getElementsByTagName('time')[0];
      return isFinite(Number(p.getAttribute('lat'))) && isFinite(Number(p.getAttribute('lon'))) && p.getAttribute('lat') !== null && t && isFinite(Date.parse(t.textContent));
    }).length;
  }

  return {
    show: show,
    tick: tick,
    has: function (n) { return has(n); }
  };
};
