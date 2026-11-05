// The first quest (S5-P20, Q579 to Q581, Nov 3): six steps from setting up
// an account to the first collection, ticked as they're done, on the main
// page until they all are. Each step ticked is kept by HABO (Quest.js, the
// Quests tab); Start collecting waits for them (collect.js). litter.js calls
// LitterQuest(app) with its helpers.
// Round 2 (|C717 to |C722): every piece of gear counts; the GPX step's app
// buttons; an Admin Mode workshop run that saves nothing; quest notices in
// the check marks' blue; Your quests; and an older answer from HABO never
// takes a step back.
window.LitterQuest = function (app) {
  'use strict';

  var $ = app.$;
  var GEAR_KEY = 'habo-litter-gear';   // the gear ticked, kept on this phone until step 3 is done
  var quest = null;      // the player's quest, as HABO last said
  var list = [];         // the player's quests, for Your quests
  var workshop = null;   // a run that saves nothing: { steps, gear, again }. A workshop run in Admin Mode, or a player going through it again (again: true)
  var pending = {};
  var GEAR = [['gloves', 'Gloves'], ['bags', 'Bags'], ['vest', 'A bright safety vest'], ['scale', 'A hanging luggage scale'], ['grabber', 'A grabber']];
  var STEPS = [
    { n: 1, title: 'Set up your account', say: 'Your name, email, handle, how you show on the public map, and the waiver signed.' },
    { n: 2, title: 'The safety rules', say: 'Your waiver\'s safety rules, one screen at a time.', button: 'Read the safety rules', go: openSafety },
    { n: 3, title: 'Your gear', say: 'Tick each one you have. All five are needed before your first walk.', gear: true },
    { n: 4, title: 'Your GPX recorder', say: 'Install a GPX recorder app on your phone. Record a minute or two of walking around, save it, then choose the file here. Nothing in it is kept: the page only checks that it reads.', file: true },
    { n: 5, title: 'The litter pulse', say: 'Press the real buttons once at home: Weigh, New bag, Pause, Resume and End, in turn, typing what a scale might show. It\'s practice: nothing is saved.',
      button: 'Practice the litter pulse', go: function () { app.practice(); } },
    { n: 6, title: 'Choose your plan', say: 'A public segment near you, or a private segment you draw: press Choose your plan or Draw a private segment below.' }
  ];

  function load(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } }
  function keep(k, v) { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (e) { /* this visit only */ } }
  function shown() { return workshop || quest; }
  function has(n) { var q = shown(); return !!q && q.steps.indexOf(n) !== -1; }
  function blue(text, key) { app.notice(text, { cls: 'quest', key: key }); }

  /* ── HABO's answers ── */

  // A step once ticked stays ticked: an answer read before a save (the main
  // page reloading while a step was being saved) never takes it back (|C719).
  function merge(old, q) {
    if (!q || !old || old.account !== q.account) return q || null;
    var steps = old.steps.slice();
    q.steps.forEach(function (n) { if (steps.indexOf(n) === -1) steps.push(n); });
    steps.sort(function (a, b) { return a - b; });
    var out = Object.assign({}, q, { steps: steps, done: q.done || old.done || steps.length === STEPS.length, xp: Math.max(q.xp, old.xp), finished: q.finished || old.finished });
    if (out.done) out.needed = false;
    return out;
  }

  function show(q, quests) {
    quest = merge(quest, q);
    if (quests) list = quests.map(function (x) { return x.name === (quest && quest.name) && x.account === quest.account ? quest : x; });
    render();
  }

  /* ── The card on the main page ── */

  function render() {
    var card = $('qs-card'), q = shown();
    card.hidden = !q || (q.done && !workshop);
    card.classList.toggle('workshop', !!workshop);
    $('qs-workshop-end').hidden = !workshop;
    $('qs-workshop-end').textContent = workshop && workshop.again ? 'End this run' : 'End the workshop run';
    if (card.hidden) return;
    $('qs-title').textContent = workshop ? (workshop.again ? 'Your first quest · again' : 'Your first quest · workshop run') : 'Your first quest';
    $('qs-say').textContent = workshop ? (workshop.again ? 'From the start, to remind yourself how it works. Nothing is saved, and no XP.' : 'A run for a room to follow, from the start. Nothing is saved, and no XP.')
      : 'Six steps before your first collection, each ticked as you do it. Each one earns ' + q.stepXp + ' XP, and finishing earns ' + q.doneXp + ' more.';
    $('qs-gate').hidden = !!workshop || !q.needed;
    var box = $('qs-steps');
    box.textContent = '';
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
        if (s.button) body.appendChild(button(s.button, s.go));
        if (s.gear) body.appendChild(gearList());
        if (s.file) { body.appendChild(gpxApps()); body.appendChild(gpxPicker()); }
        if (s.n === 6 && workshop) body.appendChild(button('Choose your plan', function () { app.chooseWalkPlan(); }));
        if (body.childNodes.length) li.appendChild(body);
      }
      box.appendChild(li);
    });
  }
  function button(label, go) {
    var b = document.createElement('button');
    b.type = 'button';
    b.className = 'btn btn-secondary';
    b.textContent = label;
    b.addEventListener('click', go);
    return b;
  }

  // A step done on the page. `auto`: ticked by the page itself (a plan
  // already chosen), which a workshop run waits to see done.
  function tick(n, auto) {
    if (workshop) {
      if (auto || has(n)) return Promise.resolve();
      workshop.steps.push(n);
      workshop.steps.sort(function (a, b) { return a - b; });
      render();
      if (workshop.steps.length === STEPS.length) blue(workshop.again ? 'Done again: every step ticked. Nothing was saved. Press End this run at the bottom of the card.'
        : 'Workshop run done: every step ticked. Nothing was saved. Press End the workshop run to put your own quest back.', 'workshop');
      return Promise.resolve();
    }
    if (!quest || has(n) || pending[n]) return Promise.resolve();
    pending[n] = true;
    return app.api('questTick', { token: app.myToken(), step: n }).then(function (d) {
      pending[n] = false;
      var was = quest && quest.done;
      quest = merge(quest, d.quest);
      list = [quest];
      if (n === 3) keep(GEAR_KEY, null);
      if (app.onQuestChanged) app.onQuestChanged({ quest: quest, xp: d.xp });
      render();
      if (quest.done && !was) blue('Your first quest is done: ' + quest.doneXp + ' more XP. Ready: start your first collection.');
    }, function (err) {
      pending[n] = false;
      if (err.code === 'signed-out') return app.signedOut();
      app.notice('That step couldn\'t be ticked just now: ' + err.message);
    });
  }

  /* ── A workshop run (|C717): Admin Mode, nothing saved ── */

  function startWorkshop() {
    workshop = { steps: [1], gear: {} };
    if (app.closePanel) app.closePanel();
    render();
    $('qs-card').scrollIntoView({ block: 'start' });
    blue('Workshop run: the first quest from the start, for a room to follow. Nothing is saved, and no XP.', 'workshop');
  }
  function endWorkshop() {
    if (!workshop) return;
    var again = workshop.again;
    workshop = null;
    render();
    app.clearNotice('workshop');
    app.notice(again ? 'Run ended. Your first quest stays done.' : 'Workshop run ended. Your own quest is as it was.');
  }
  function syncWorkshopButton() {
    var on = !!$('cl-sim').checked;
    $('qs-workshop').hidden = !on;
    if (!on && workshop && !workshop.again) endWorkshop();
  }

  /* ── Going through it again (S5-P20, |M763): after it's done, any time ── */

  // The first quest from the start, for the player to refresh themselves on
  // how it works: as a workshop run, with nothing saved and no XP.
  function startAgain() {
    workshop = { steps: [1], gear: {}, again: true };
    if (app.showAccount) app.showAccount();
    render();
    $('qs-card').scrollIntoView({ block: 'start' });
    blue('Going through your first quest again, from the start, to remind yourself how it works. Nothing is saved, and no XP.', 'workshop');
  }
  $('qs-workshop').addEventListener('click', startWorkshop);
  $('qs-workshop-end').addEventListener('click', endWorkshop);
  $('cl-sim').addEventListener('change', syncWorkshopButton);

  /* ── Step 2: the safety rules ── */

  // The waiver's safety rules (its part 2, a rule to a line), so they're
  // always the words signed. A waiver without that part shows each of its
  // paragraphs instead.
  var rules = [], at = 0;
  function safetyRules() {
    var text = String((app.waiver() || {}).text || '').replace(/\r\n?/g, '\n');
    var out = [], inside = false;
    text.split('\n').forEach(function (l) {
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

  /* ── Step 3: your gear (all five, |C717) ── */

  function gearList() {
    var box = document.createElement('div');
    box.className = 'lt-quest-gear';
    var had = workshop ? workshop.gear : (load(GEAR_KEY) || {});
    GEAR.forEach(function (g) {
      var l = document.createElement('label');
      var i = document.createElement('input');
      i.type = 'checkbox';
      i.value = g[0];
      i.checked = !!had[g[0]];
      i.addEventListener('change', function () {
        var now = workshop ? workshop.gear : (load(GEAR_KEY) || {});
        now[g[0]] = i.checked;
        if (!workshop) keep(GEAR_KEY, now);
        if (GEAR.every(function (x) { return now[x[0]]; })) tick(3);
      });
      l.appendChild(i);
      l.appendChild(document.createTextNode(' ' + g[1]));
      box.appendChild(l);
    });
    return box;
  }

  /* ── Step 4: your GPX recorder ── */

  // The apps (|C718): on an iPhone, Open GPX Tracker, by its App Store page,
  // where Open starts it, or Get installs it (as at Start before S5); on
  // Android, Garmin Connect, with a Garmin watch. More to come.
  function gpxApps() {
    var box = document.createElement('div');
    box.className = 'lt-quest-apps';
    var add = function (label, href, say) {
      var a = document.createElement('a');
      a.className = 'btn btn-primary';
      a.href = href;
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = label;
      box.appendChild(a);
      var p = document.createElement('p');
      p.className = 'muted small';
      p.textContent = say;
      box.appendChild(p);
    };
    add('iPhone: Open GPX Tracker', 'https://apps.apple.com/us/app/open-gpx-tracker/id984503772', 'It opens the App Store: press Open there, or Get if you don\'t have it yet.');
    add('Android: Garmin Connect', 'https://play.google.com/store/apps/details?id=com.garmin.android.apps.connectmobile', 'With a Garmin watch. It opens Google Play: press Open, or Install.');
    return box;
  }

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
      return p.getAttribute('lat') !== null && isFinite(Number(p.getAttribute('lat'))) && isFinite(Number(p.getAttribute('lon'))) && t && isFinite(Date.parse(t.textContent));
    }).length;
  }

  /* ── Your quests (|C719): each quest done, with its XP; tap for more ── */

  function when(ms) { return new Date(ms).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' }); }
  function took(ms) {
    var m = Math.max(1, Math.round(ms / 60000));
    if (m < 60) return m + ' minute' + (m === 1 ? '' : 's');
    var h = Math.round(m / 6) / 10;
    if (h < 48) return h + ' hours';
    return Math.round(h / 24) + ' days';
  }
  function showQuests() {
    var box = $('quests-list');
    box.textContent = '';
    var done = list.filter(function (q) { return q.done; });
    $('quests-none').hidden = done.length > 0;
    done.forEach(function (q) {
      var item = document.createElement('div');
      item.className = 'lt-quest-item';
      var head = document.createElement('button');
      head.type = 'button';
      head.className = 'lt-quest-row';
      head.setAttribute('aria-expanded', 'false');
      head.textContent = q.name + ' · ' + q.xp + ' XP';
      var more = document.createElement('div');
      more.className = 'lt-quest-more';
      more.hidden = true;
      var line = function (t) { var p = document.createElement('p'); p.textContent = t; more.appendChild(p); };
      if (q.finished) line('Finished ' + when(q.finished) + '.');
      if (q.started) line('Started ' + when(q.started) + '.');
      if (q.started && q.finished) line('It took ' + took(q.finished - q.started) + '.');
      line('Rewards: ' + q.xp + ' XP (' + q.stepXp + ' for each of its ' + q.steps.length + ' steps, and ' + q.doneXp + ' for finishing).');
      if (q.name === 'First quest') {
        var again = document.createElement('button');
        again.type = 'button';
        again.className = 'btn btn-secondary lt-quest-again';
        again.textContent = 'Go through it again';
        again.addEventListener('click', startAgain);
        more.appendChild(again);
        line('From the start, any time, to remind yourself how it works. Nothing is saved, and no XP.');
      }
      head.addEventListener('click', function () { more.hidden = !more.hidden; head.setAttribute('aria-expanded', String(!more.hidden)); });
      item.appendChild(head);
      item.appendChild(more);
      box.appendChild(item);
    });
  }

  return {
    show: show,
    tick: tick,
    showQuests: showQuests,
    workshopOn: function () { return !!workshop; },
    syncWorkshopButton: syncWorkshopButton
  };
};
