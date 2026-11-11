// HABO's litter page, step 1 (S3-P20): setting up an account with the
// waiver, signing in on a new phone, and the account page. Collecting
// (S3-P21) is in collect.js; the map and your collections (S3-P22) in map.js. An account is
// an email: setting up and each new phone get a code there, and each
// signed waiver is emailed as a copy. When the waiver's words change,
// they're signed again before anything else (Oct 23, in chat).
// Load config.js first. Opened on the litter web app's own link (its dev
// link, while it's tried), the page calls the backend through
// google.script.run; on the public site, it POSTs to config.js's API_URL.
(function () {
  'use strict';

  var config = window.LITTER_CONFIG || {};
  var inAppsScript = typeof google !== 'undefined' && google.script && google.script.run;
  var TOKEN_KEY = 'habo-litter-token';
  var SHOWS_WORDS = { Handle: 'My handle', Name: 'My name', Neither: 'Neither' };

  var state = { waiver: null, mapShows: ['Handle', 'Name', 'Neither'], account: null, email: '', setup: null };
  var sigs = {};

  /* ── Backend ── */

  // Calls one backend action and resolves with its data. An error keeps the
  // backend's code, like "signed-out".
  // quiet: sent in the background (the walk's queue, check-ins, the handle
  // check), with no working bar, so it never stops a press (S5-P16).
  // What the main page shows changes only when something is written (S6-P2,
  // |Q642 (a)): these only read, or write only the Forum. Any other action
  // marks the main page to load again the next time it shows.
  var SAME_MAIN = ['collectLoad', 'start', 'mapLoad', 'settingsLoad', 'reviewsLoad', 'myCollections', 'handleFree', 'forumUnread', 'forumTopic',
    'forumLoad', 'forumVote', 'forumReview', 'forumReply', 'forumOpen', 'forumMove', 'forumDigestSave', 'reportSend',
    // S6's screens that only read (S6-P2 round 2, |M890).
    'challengesLoad', 'challengesAdmin', 'toolSkillsLoad', 'toolSkillsAdmin', 'achievementsAdmin', 'wikiLoad', 'challengePhoto',
    // The rolling history only reads (S6-P3).
    'scroll'];
  var changedAt = Date.now();
  function marks(action, d) {
    // Badges only reads, unless it just earned one: that changes your XP.
    if (action === 'achievementsLoad' && !(d && d.earnedNow && d.earnedNow.length)) return;
    if (SAME_MAIN.indexOf(action) === -1) changedAt = Date.now();
  }
  function api(action, data, quiet) {
    if (!quiet) workStart();
    return ask(action, data).then(function (d) { marks(action, d); if (!quiet) workEnd(); return d; }, function (err) { marks(action); if (!quiet) workEnd(); throw err; });
  }
  function ask(action, data) {
    var body = JSON.stringify(Object.assign({ action: action }, data || {}));
    var asked = inAppsScript
      ? new Promise(function (resolve, reject) {
        google.script.run.withSuccessHandler(function (s) { resolve(JSON.parse(s)); }).withFailureHandler(reject).api(body);
      })
      : fetch(config.API_URL, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=utf-8' }, body: body })
        .then(function (res) {
          if (!res.ok) throw new Error('The litter page\'s server didn\'t answer (' + res.status + '). Please try again.');
          return res.json();
        });
    return asked.then(function (res) {
      if (res.success) return res.data;
      var err = new Error(res.error || 'Something went wrong. Please try again.');
      err.code = res.code || '';
      throw err;
    }, function (err) {
      if (err && err.code) throw err;
      throw new Error(/Failed to fetch|NetworkError|Load failed/i.test(String(err && err.message))
        ? 'The page couldn\'t reach HABO. Check your signal, then try again.' : (err && err.message) || String(err));
    });
  }

  // The secret that keeps this phone signed in. In a private window, where
  // it can't be kept, it lasts until the page closes.
  var memoryToken = '';
  function myToken() {
    try { return localStorage.getItem(TOKEN_KEY) || memoryToken; } catch (e) { return memoryToken; }
  }
  function keepToken(t) {
    memoryToken = t || '';
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* kept in memory only */ }
  }

  /* ── Screens ── */

  var VIEWS = ['v-loading', 'v-soon', 'v-trouble', 'v-welcome', 'v-setup', 'v-setup-code', 'v-resign', 'v-signin', 'v-account', 'v-collections', 'v-plans', 'v-quests', 'v-settings', 'v-reviews', 'v-forum', 'v-forum-topic', 'v-report', 'v-challenges-admin', 'v-wiki', 'v-wiki-page', 'v-wiki-draft', 'v-badges', 'v-ach-admin', 'v-collect', 'v-plan', 'v-summary', 'v-map'];

  function $(id) { return document.getElementById(id); }

  // The top bar on every screen once you're signed in (S6-P4, |Q644): not
  // before, and not while a collection is going, where the collecting
  // screen stays as it was.
  var NO_BAR = ['v-loading', 'v-soon', 'v-trouble', 'v-welcome', 'v-setup', 'v-setup-code', 'v-resign', 'v-signin', 'v-collect'];
  // The bar's height, so notices start just under it (S6-P4).
  function barHeight() {
    var h = $('me-bar').hidden ? 0 : $('me-toggle').getBoundingClientRect().height;
    if (h) document.documentElement.style.setProperty('--bar-h', Math.round(h) + 'px');
  }
  // Admin screens (S6-P19, |M888): never shown outside Admin Mode, by any
  // button or back; asked for without it, the main page shows instead.
  var ADMIN_VIEWS = ['v-settings', 'v-reviews', 'v-forum', 'v-forum-topic', 'v-challenges-admin', 'v-ach-admin', 'v-wiki-draft'];
  function show(id) {
    if (ADMIN_VIEWS.indexOf(id) !== -1 && !adminMode()) {
      if (state.account) { showAccount(state.account); return; }
      id = 'v-welcome';
    }
    VIEWS.forEach(function (v) { $(v).hidden = v !== id; });
    // Settings' lock bar pads the page only on Settings (S6-P7).
    if (id !== 'v-settings') document.body.classList.remove('lt-has-lockbar');
    var bar = !!state.account && NO_BAR.indexOf(id) === -1;
    if (bar) fillBar(state.account);
    else if (!$('me-panel').hidden) panel(false);
    $('me-bar').hidden = !bar;
    document.body.classList.toggle('lt-has-bar', bar);
    // Its own class (S6-P4): lt-has-bar is also the litter pulse's bottom bar.
    document.body.classList.toggle('lt-has-topbar', bar);
    barHeight();
    // A screen with the floating Back (S5-U17): notices start below it, so it can always be pressed.
    document.body.classList.toggle('lt-has-back', !!$(id).querySelector('.lt-fab-back'));
    paintMode();
    window.scrollTo(0, 0);
    // A signature box can only be measured once it's showing.
    if (id === 'v-setup' && !sigs['su-sig']) setupSignature('su-sig', 'su-sig-clear');
    if (id === 'v-resign' && !sigs['rs-sig']) setupSignature('rs-sig', 'rs-sig-clear');
  }

  // Head Builder mode (S5-U2 round 3, M563): a Head Builder's Simulated walk
  // switch on, on this computer. The whole page goes dark while it's on, so
  // it's never mistaken for Player mode.
  var SIM_KEY = 'habo-litter-sim';
  function builderMode() {
    if (!state.account || state.account.rank !== 'Head Builder') return false;
    try { return JSON.parse(localStorage.getItem(SIM_KEY) || 'null') === true; } catch (e) { return false; }
  }
  // Admin Mode's dark look, for every rank (S5-P28, |Q639 (a)); builderMode()
  // above stays a Head Builder's, for simulated walks and Measure again.
  function adminMode() {
    if (!state.account || !state.account.rank) return false;
    try { return JSON.parse(localStorage.getItem(SIM_KEY) || 'null') === true; } catch (e) { return false; }
  }
  function paintMode() {
    document.documentElement.classList.toggle('lt-builder', adminMode());
    // Admin Mode turned off on an admin screen: straight to the main page (S6-P19, |M888).
    if (!adminMode() && state.account && ADMIN_VIEWS.some(function (v) { return !$(v).hidden; })) { showAccount(state.account); return; }
    if (typeof mapper !== 'undefined' && mapper && mapper.redraw) mapper.redraw();
  }

  /* ── Notices (S5-P16, C634): stacked at the top, newest at the bottom, each
     until it's closed, with Close all once there are two. The same words
     again, or the same key, replace the one already there. opt: { key,
     buttons: [{ label, go }] }. ── */

  function notice(text, opt) {
    if (!text) return;   // a notice stays until it's closed
    opt = opt || {};
    var stack = $('notice');
    Array.prototype.forEach.call(stack.querySelectorAll('.lt-nt:not(.working)'), function (n) {
      if (opt.key ? n.dataset.key === opt.key : n.dataset.text === text) n.remove();
    });
    var n = document.createElement('div');
    n.className = 'lt-nt' + (opt.cls ? ' ' + opt.cls : '');   // cls: 'quest', in the quest's blue (S5-P20, |C719)
    n.dataset.text = text;
    if (opt.key) n.dataset.key = opt.key;
    var t = document.createElement('span');
    t.className = 'lt-nt-text';
    t.textContent = text;
    n.appendChild(t);
    (opt.buttons || []).forEach(function (b) {
      var go = document.createElement('button');
      go.type = 'button';
      go.className = 'lt-nt-btn';
      go.textContent = b.label;
      go.addEventListener('click', function () { n.remove(); tidyNotices(); b.go(); });
      n.appendChild(go);
    });
    var x = document.createElement('button');
    x.type = 'button';
    x.className = 'lt-nt-close';
    x.textContent = '×';
    x.setAttribute('aria-label', 'Close');
    x.addEventListener('click', function () { n.remove(); tidyNotices(); });
    n.appendChild(x);
    stack.insertBefore(n, stack.querySelector('.lt-nt.working') || stack.querySelector('.lt-nt-all'));
    tidyNotices();
  }
  // A notice taken back when what it said no longer holds.
  function clearNotice(key) {
    Array.prototype.forEach.call($('notice').querySelectorAll('.lt-nt'), function (n) { if (n.dataset.key === key) n.remove(); });
    tidyNotices();
  }
  function tidyNotices() {
    var stack = $('notice');
    var count = stack.querySelectorAll('.lt-nt:not(.working)').length;
    var all = stack.querySelector('.lt-nt-all');
    if (count >= 2 && !all) {
      all = document.createElement('button');
      all.type = 'button';
      all.className = 'lt-nt-all';
      all.textContent = 'Close all';
      all.addEventListener('click', function () {
        Array.prototype.forEach.call(stack.querySelectorAll('.lt-nt:not(.working)'), function (n) { n.remove(); });
        tidyNotices();
      });
      stack.appendChild(all);
    } else if (count < 2 && all) {
      all.remove();
    }
  }

  // While HABO answers (S5-P16, C634): one "Working, please wait..." bar under
  // the notices however many waits there are, and nothing else can be pressed.
  // After 20 seconds the page lets presses through again, the bar still
  // showing, so a slow signal never leaves it stuck.
  var waits = 0, scrimTimer = null;
  function workStart() {
    waits++;
    if (waits === 1) {
      $('working-scrim').hidden = false;
      clearTimeout(scrimTimer);
      scrimTimer = setTimeout(function () { $('working-scrim').hidden = true; }, 20000);
    }
    showWorking();
  }
  function workEnd() {
    waits = Math.max(0, waits - 1);
    if (!waits) { clearTimeout(scrimTimer); $('working-scrim').hidden = true; }
    showWorking();
  }
  // It shows first in the middle of the screen, over the dimmed and blurred
  // page, for two pulses, then floats up to the notices (S6-U22).
  var workBar = null, floatTimer = null;
  var CENTER_MS = 2800;   // two pulses of the bar's 1.4-second fade
  function showWorking() {
    var stack = $('notice');
    if (waits && !workBar) {
      workBar = document.createElement('div');
      workBar.className = 'lt-nt working lt-work-center';
      workBar.setAttribute('role', 'status');
      workBar.textContent = 'Working, please wait...';
      document.body.appendChild(workBar);
      clearTimeout(floatTimer);
      floatTimer = setTimeout(function () { floatUp(workBar); }, CENTER_MS);
    } else if (!waits && workBar) {
      clearTimeout(floatTimer);
      workBar.remove();
      workBar = null;
    }
  }
  function floatUp(bar) {
    if (!bar || bar !== workBar || !bar.isConnected) return;
    var from = bar.getBoundingClientRect();
    var stack = $('notice');
    bar.classList.remove('lt-work-center');
    stack.insertBefore(bar, stack.querySelector('.lt-nt-all'));
    if (window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    var to = bar.getBoundingClientRect();
    bar.style.transition = 'none';
    bar.style.transform = 'translate(' + Math.round(from.left - to.left) + 'px, ' + Math.round(from.top - to.top) + 'px)';
    bar.getBoundingClientRect();
    bar.style.transition = 'transform 0.6s ease';
    bar.style.transform = '';
    setTimeout(function () { bar.style.transition = ''; }, 650);
  }

  // Disables a button while its request runs, and shows the error under it.
  function busy(button, errBox, work) {
    var label = button.textContent;
    button.disabled = true;
    button.textContent = 'One moment…';
    $(errBox).textContent = '';
    return work().catch(function (err) {
      if (err.code === 'signed-out') return signedOut();
      if (err.code === 'waiver-new') return reopen();
      $(errBox).textContent = err.message;
    }).then(function () {
      button.disabled = false;
      button.textContent = button.dataset.after || label;
      delete button.dataset.after;
    });
  }

  function signedOut() {
    keepToken('');
    state.account = null;
    show('v-welcome');
    notice('This phone isn\'t signed in anymore. Sign in again with your email.');
  }

  /* ── Opening the page ── */

  function open() {
    if (!inAppsScript && !config.API_URL) return show('v-soon');
    show('v-loading');
    return reopen().catch(function (err) {
      $('trouble-msg').textContent = err.message;
      show('v-trouble');
    });
  }

  function reopen() {
    return api('start', { token: myToken() }).then(function (d) {
      state.waiver = d.waiver;
      state.mapShows = d.mapShows || state.mapShows;
      if (d.account) {
        state.account = d.account;
        // A collection still going on this phone opens where it was (Q282);
        // the waiver's renewal coming due doesn't stop it (S6-P30).
        if ((d.account.waiverCurrent || d.account.waiverRenew) && collect.resume()) return;
        return showAccount(d.account);
      }
      if (d.signedOut) return signedOut();
      show('v-welcome');
    });
  }

  /* ── Choices for what the map shows ── */

  function showsChoices(boxId, name, picked) {
    var box = $(boxId);
    box.textContent = '';
    state.mapShows.forEach(function (v) {
      var label = document.createElement('label');
      label.className = 'choice-row';
      var input = document.createElement('input');
      input.type = 'radio';
      input.name = name;
      input.value = v;
      input.checked = v === picked;
      label.appendChild(input);
      label.appendChild(document.createTextNode(' ' + SHOWS_WORDS[v]));
      box.appendChild(label);
    });
  }

  function picked(name) {
    var on = document.querySelector('input[name="' + name + '"]:checked');
    return on ? on.value : '';
  }

  // Says whether a handle is free, a moment after typing stops.
  function watchHandle(inputId, msgId, withToken) {
    var timer = null, asked = '';
    $(inputId).addEventListener('input', function () {
      clearTimeout(timer);
      var msg = $(msgId);
      var h = $(inputId).value.trim();
      msg.textContent = '';
      msg.className = 'small lt-handle';
      if (!h || (state.account && withToken && h === state.account.handle)) return;
      timer = setTimeout(function () {
        asked = h;
        api('handleFree', { handle: h, token: withToken ? myToken() : '' }, true).then(function (d) {
          if (asked !== $(inputId).value.trim()) return;
          msg.textContent = d.free ? '✓ No one has it yet.' : d.why;
          msg.className = 'small lt-handle ' + (d.free ? 'ok' : 'no');
        }, function () { /* checked again when saved */ });
      }, 500);
    });
  }

  function showWaiver(prefix) {
    var w = state.waiver || {};
    $(prefix + '-waiver-title').textContent = w.title || 'Waiver';
    $(prefix + '-waiver-text').textContent = w.text || 'The waiver isn\'t ready yet, so it can\'t be signed. Please try again later.';
  }

  function signedAs(boxId, name) {
    var today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    $(boxId).textContent = name ? 'Signed as ' + name + ', ' + today + '.' : 'Your name and today\'s date go with your signature.';
  }

  /* ── Your safety gear, with the waiver (S6-P30) ── */

  // Each piece, and how to find what the waiver says of it (|Q414, |Q417).
  var GEAR = [['gloves', 'gloves', /glove/i], ['shoes', 'closed-toe shoes', /shoe|footwear/i], ['visible', 'a safety vest or a brightly coloured shirt', /vest|bright|visib|reflective/i]];

  function gearReset(p) {
    GEAR.forEach(function (g) { $(p + '-gear-' + g[0]).checked = false; });
    $(p + '-gear-understand').checked = false;
    delete $(p + '-gear').dataset.touched;
    gearShow(p);
  }

  // The waiver's own sentences on it, word for word; none found, nothing quoted.
  function waiverSays(re) {
    var t = String((state.waiver || {}).text || '').replace(/\s+/g, ' ');
    return (t.match(/[^.!?]+[.!?]+/g) || []).map(function (x) { return x.trim().replace(/^[-•]\s*/, ''); }).filter(function (x) { return re.test(x); });
  }

  // Anything not ticked: the waiver's words for it, and I understand; shown
  // once they've ticked something, or pressed to sign.
  function gearShow(p) {
    var not = $(p + '-gear').dataset.touched ? GEAR.filter(function (g) { return !$(p + '-gear-' + g[0]).checked; }) : [];
    var box = $(p + '-gear-words');
    box.textContent = '';
    not.forEach(function (g) {
      var say = waiverSays(g[2]);
      var line = document.createElement('p');
      line.className = 'lt-gear-say';
      line.textContent = 'Without ' + g[1] + ': ' + (say.length ? 'your waiver says, "' + say.join(' ') + '"' : 'going without is at your own risk.');
      box.appendChild(line);
    });
    $(p + '-gear-without').hidden = !not.length;
  }

  function gearAsk(p) {
    var g = {};
    GEAR.forEach(function (x) { g[x[0]] = $(p + '-gear-' + x[0]).checked; });
    g.understood = $(p + '-gear-understand').checked;
    return g;
  }

  function gearProblem(p) {
    var g = gearAsk(p);
    if (GEAR.every(function (x) { return g[x[0]]; }) || g.understood) return '';
    $(p + '-gear').dataset.touched = '1';
    gearShow(p);
    return 'Tick what you have, or tick "I understand" under your safety gear.';
  }

  /* ── Setting up ── */

  function startSetup() {
    notice('');
    showWaiver('su');
    gearShow('su');
    if (!$('su-shows').childNodes.length) showsChoices('su-shows', 'su-shows', 'Handle');
    setupSignedAs();
    show('v-setup');
  }

  function setupSignedAs() {
    signedAs('su-signed-as', ($('su-first').value.trim() + ' ' + $('su-last').value.trim()).trim());
  }

  // The form, checked here first; the backend checks it all again.
  function submitSetup(e) {
    e.preventDefault();
    var err = $('su-err');
    var ask = {
      firstName: $('su-first').value, lastName: $('su-last').value, email: $('su-email').value,
      handle: $('su-handle').value, mapShows: picked('su-shows') || 'Handle', adult: $('su-adult').checked,
      agree: $('su-agree').checked, waiverPrint: (state.waiver || {}).fingerprint || '', gear: gearAsk('su')
    };
    if (!ask.firstName.trim() || !ask.lastName.trim()) { err.textContent = 'Please enter your first and last name.'; return; }
    if (!ask.email.trim()) { err.textContent = 'Please enter your email. Your codes and your copy of the waiver come there.'; return; }
    if (!ask.handle.trim()) { err.textContent = 'Please pick a handle.'; return; }
    if (!ask.adult) { err.textContent = 'Accounts are for people 18 or older. A family collects under a parent\'s account.'; return; }
    if (!ask.agree) { err.textContent = 'Please read the waiver and tick "I\'ve read this, and I agree".'; return; }
    if (gearProblem('su')) { err.textContent = gearProblem('su'); return; }
    var sig = sigs['su-sig'];
    if (!sig || sig.ink < 40) { err.textContent = 'Please sign with your finger in the signature box.'; return; }
    ask.signature = sig.canvas.toDataURL('image/png');
    busy($('su-submit'), 'su-err', function () {
      return api('setUp', ask).then(function (d) {
        state.setup = ask;
        codeSent('sc-sent', d);
        $('sc-code').value = '';
        $('sc-err').textContent = '';
        show('v-setup-code');
        $('sc-code').focus();
      }, function (er) { return waiverChanged(er, 'su'); });
    });
  }

  function codeSent(boxId, d) {
    $(boxId).textContent = 'We sent a 6-digit code to ' + d.sentTo + '. It works for ' + d.minutes + ' minutes.';
  }

  function submitSetupCode(e) {
    e.preventDefault();
    busy($('sc-submit'), 'sc-err', function () {
      return api('setUp', Object.assign({}, state.setup, { code: $('sc-code').value })).then(function (d) {
        keepToken(d.token);
        state.setup = null;
        $('v-setup').reset();
        clearSignature('su-sig');
        showAccount(d.account);
        notice(d.copySent ? 'Your account is set up. A copy of the waiver you signed is on its way to your email.'
          : 'Your account is set up. Your copy of the waiver couldn\'t be emailed just now; HABO keeps it.');
      }, function (er) {
        if (er.code !== 'waiver-changed') throw er;
        // The words changed while the code was on its way: back to the form.
        return waiverChanged(er, 'su').then(function () { startSetup(); notice(er.message); });
      });
    });
  }

  // The waiver's words changed while they read: shows the new ones, to be
  // read and signed again from the top.
  function waiverChanged(er, prefix) {
    if (er.code !== 'waiver-changed') throw er;
    return api('start', {}).then(function (d) {
      state.waiver = d.waiver;
      $(prefix + '-agree').checked = false;
      clearSignature(prefix + '-sig');
      showWaiver(prefix);
      window.scrollTo(0, 0);
      notice(er.message);
    });
  }

  /* ── Signing the waiver's new words ── */

  function startResign() {
    showWaiver('rs');
    // Renewing it, every so many months (S6-P30, |Q716), or its words changed.
    var renew = !!(state.account && state.account.waiverRenew), months = (state.account || {}).renewMonths;
    $('rs-head').textContent = renew ? 'Time to renew your waiver' : 'The waiver has been updated.';
    $('rs-say').textContent = renew ? 'Every ' + (months === 1 ? 'month' : months + ' months') + ', each player signs the waiver again and confirms their safety gear. We\'ll email you a copy.'
      : 'You must acknowledge and sign the new version. We\'ll email you a copy.';
    $('rs-submit').textContent = renew ? 'Sign the waiver again' : 'Sign the new waiver';
    gearReset('rs');
    $('rs-agree').checked = false;
    $('rs-err').textContent = '';
    show('v-resign');
    clearSignature('rs-sig');
    var a = state.account;
    signedAs('rs-signed-as', a.firstName + ' ' + a.lastName);
  }

  function submitResign(e) {
    e.preventDefault();
    var err = $('rs-err');
    if (!$('rs-agree').checked) { err.textContent = 'Please read the waiver and tick "I\'ve read this, and I agree".'; return; }
    if (gearProblem('rs')) { err.textContent = gearProblem('rs'); return; }
    var sig = sigs['rs-sig'];
    if (!sig || sig.ink < 40) { err.textContent = 'Please sign with your finger in the signature box.'; return; }
    var ask = { token: myToken(), agree: true, waiverPrint: (state.waiver || {}).fingerprint || '', signature: sig.canvas.toDataURL('image/png'), gear: gearAsk('rs') };
    busy($('rs-submit'), 'rs-err', function () {
      return api('signWaiver', ask).then(function (d) {
        showAccount(d.account);
        notice(d.copySent ? 'Signed. A copy is on its way to your email.' : 'Signed. Your copy couldn\'t be emailed just now; HABO keeps it.');
      }, function (er) { return waiverChanged(er, 'rs'); });
    });
  }

  /* ── Signature pads (as at the check-in) ── */

  function setupSignature(canvasId, clearId) {
    var canvas = $(canvasId);
    var ratio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
    var w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    var ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.strokeStyle = ctx.fillStyle = '#111';
    var sig = sigs[canvasId] = { canvas: canvas, ctx: ctx, w: w, h: h, ink: 0 };
    var last = null;
    // In the canvas's own coordinates, even if the screen has since rotated.
    var pos = function (e) {
      var r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * w / r.width, y: (e.clientY - r.top) * h / r.height };
    };
    canvas.addEventListener('pointerdown', function (e) {
      e.preventDefault();
      if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
      last = pos(e);
      ctx.beginPath();
      ctx.arc(last.x, last.y, 1.2, 0, Math.PI * 2);
      ctx.fill();
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!last) return;
      e.preventDefault();
      var p = pos(e);
      ctx.beginPath();
      ctx.moveTo(last.x, last.y);
      ctx.lineTo(p.x, p.y);
      ctx.stroke();
      sig.ink += Math.abs(p.x - last.x) + Math.abs(p.y - last.y);
      last = p;
    });
    ['pointerup', 'pointercancel', 'pointerleave'].forEach(function (t) {
      canvas.addEventListener(t, function () { last = null; });
    });
    $(clearId).addEventListener('click', function () { clearSignature(canvasId); });
  }

  function clearSignature(canvasId) {
    var sig = sigs[canvasId];
    if (!sig) return;
    sig.ctx.clearRect(0, 0, sig.w, sig.h);
    sig.ink = 0;
  }

  /* ── Signing in on a new phone ── */

  function startSignin() {
    notice('');
    $('si-code-box').hidden = true;
    $('si-resend-row').hidden = true;
    $('si-email').disabled = false;
    $('si-code').value = '';
    $('si-err').textContent = '';
    $('si-submit').textContent = 'Continue';
    show('v-signin');
    $('si-email').focus();
  }

  function askForCode(button) {
    state.email = $('si-email').value;
    return api('signInStart', { email: state.email }).then(function (d) {
      codeSent('si-sent', d);
      $('si-code-box').hidden = false;
      $('si-resend-row').hidden = false;
      $('si-email').disabled = true;
      $('si-code').value = '';
      $('si-code').focus();
      button.dataset.after = 'Sign in';
    });
  }

  function submitSignin(e) {
    e.preventDefault();
    var button = $('si-submit');
    if ($('si-code-box').hidden) {
      busy(button, 'si-err', function () { return askForCode(button); });
      return;
    }
    busy(button, 'si-err', function () {
      return api('signInCode', { email: state.email, code: $('si-code').value }).then(function (d) {
        keepToken(d.token);
        showAccount(d.account);
        notice('You\'re signed in on this phone.');
      });
    });
  }

  /* ── The account page ── */

  function niceDate(text) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(text || ''));
    if (!m) return String(text || '');
    return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  }

  // A plan's name in lists and the Plan menu (Oct 31): its own, or its
  // segment's, or when it was saved.
  function planLabel(p) {
    if (p.name) return p.name;
    if (p.segment && p.segment.name) return p.segment.name;
    return p.created ? new Date(p.created).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Plan ' + p.id;
  }

  // The top bar's words (S6-P4): closed, it shows your public map name; with
  // Neither, your handle (only you see it).
  function fillBar(a) {
    if (!a) return;
    $('me-public').textContent = a.mapShows === 'Name' ? a.firstName + ' ' + a.lastName : a.handle;
    $('me-handle').textContent = a.handle;
    $('me-name').textContent = a.firstName + ' ' + a.lastName;
    $('me-handle-star').hidden = a.mapShows !== 'Handle';
    $('me-name-star').hidden = a.mapShows !== 'Name';
    $('me-email').textContent = a.email;
    $('me-waiver').textContent = 'Signed ' + niceDate(a.waiverSigned);
  }

  // The panel at the top of every screen (Oct 31, field first; S6-P4).
  function panel(open) {
    $('me-panel').hidden = !open;
    $('me-toggle').setAttribute('aria-expanded', open ? 'true' : 'false');
    $('me-caret').textContent = open ? '▴' : '▾';
    // The panel scrolls on its own, to Admin Mode and Sign out, and the page
    // behind it stays still (|C665).
    document.documentElement.classList.toggle('lt-panel-open', !!open);
    if (open) fitPanel();
    else $('me-star-say').hidden = true;
  }
  function fitPanel() {
    var p = $('me-panel');
    if (p.hidden) return;
    var top = $('me-bar').getBoundingClientRect().bottom + 6;
    p.style.maxHeight = Math.max(200, window.innerHeight - top - 12) + 'px';
  }

  // The main page as it was (S6-P2, |Q642 (a)): back on it within 5 minutes
  // with nothing written since it loaded, it isn't asked of HABO again, and
  // its map isn't redrawn. Anything written, or longer away, loads it again.
  var MAIN_KEEP_MS = 5 * 60000, mainAt = 0, mainOf = null;
  function showAccount(a) {
    var quick = mainAt > changedAt && Date.now() - mainAt < MAIN_KEEP_MS && mainOf === a;
    if (!quick) { mainAt = Date.now(); mainOf = a; }
    state.account = a;
    notice('');
    if (!a.waiverCurrent) return startResign();
    fillBar(a);
    panel(false);
    // Every player is a HABO volunteer from sign-up (S5-P26): the Volunteer record line is gone (|Q571).
    $('me-form').hidden = true;
    $('me-edit').hidden = false;
    show('v-account');
    collect.onAccount(quick);
    if (!quick) mapper.showMine();
    mapper.inline(quick);
  }

  function startEdit() {
    var a = state.account;
    $('ed-first').value = a.firstName;
    $('ed-last').value = a.lastName;
    $('ed-handle').value = a.handle;
    $('ed-handle-msg').textContent = '';
    $('ed-err').textContent = '';
    showsChoices('ed-shows', 'ed-shows', a.mapShows);
    $('me-form').hidden = false;
    $('me-edit').hidden = true;
    $('ed-first').focus();
  }

  function submitEdit(e) {
    e.preventDefault();
    busy($('ed-save'), 'ed-err', function () {
      return api('updateMe', {
        token: myToken(), firstName: $('ed-first').value, lastName: $('ed-last').value,
        handle: $('ed-handle').value, mapShows: picked('ed-shows')
      }).then(function (a) {
        showAccount(a);
        notice('Saved.');
      });
    });
  }

  function signOut() {
    if (collect.busyHere() && !window.confirm('A collection is going on this phone. Signing out ends it here, and litter pulses not yet sent are lost. Sign out anyway?')) return;
    collect.forget();
    var t = myToken();
    keepToken('');
    state.account = null;
    scroll.signedOut();
    api('signOut', { token: t }, true).catch(function () { /* this phone forgets it either way */ });
    show('v-welcome');
    notice('You\'re signed out on this phone.');
  }

  /* ── Collecting (S3-P21, collect.js) ── */

  var collect = window.LitterCollect({
    $: $, api: api, show: show, notice: notice, clearNotice: clearNotice, busy: busy, myToken: myToken, signedOut: signedOut,
    me: function () { return state.account; },
    builderMode: builderMode, paintMode: paintMode,
    // Badges just earned, and the weekly streak (S6-P6, achievements.js).
    onEarned: function (d) { if (achievements) achievements.onEarned(d); },
    // The rolling history (S6-P3, scroll.js): fresh once the main page loads, and where "+N XP" lands.
    onMainLoaded: function () { if (scroll) scroll.refresh(); },
    xpTarget: function () { return scroll ? scroll.target() : null; },
    onXpLanded: function (n) { if (scroll) scroll.landed(n); },
    // A skill built from the toolbox, in the Litter Class Skills sheet: its Send form (S6-P8's rework, challenges.js).
    onSkillsShown: function (fresh) { if (challenges) challenges.skillsShown(fresh); },
    showAccount: function () { showAccount(state.account); },
    openMap: function (cells, back) { mapper.open({ focus: cells, back: back }); },
    planLabel: planLabel,
    onPlanPicked: function (cells) { mapper.showPlan(cells); },
    // Choose your plan (S5-P12, Q553): the Segments screen, selecting.
    chooseWalkPlan: function (ids) { show('v-plans'); window.scrollTo(0, 0); mapper.showSegments(ids, true); },
    // The first quest (S5-P20, quest.js): its card, a step ticked, and a workshop run.
    onQuest: function (q, list) { quest.show(q, list); },
    questTick: function (n, auto) { return quest.tick(n, auto); },
    questWorkshop: function () { return quest.workshopOn(); },
    syncWorkshop: function () { quest.syncWorkshopButton(); settings.sync(); reviews.sync(); forum.sync(); if (challenges) challenges.sync(); if (wiki) wiki.sync(); if (achievements) achievements.sync(); }
  });

  /* ── The first quest (S5-P20, quest.js) ── */

  var quest = window.LitterQuest({
    $: $, api: api, notice: notice, clearNotice: clearNotice, myToken: myToken, signedOut: signedOut,
    waiver: function () { return state.waiver; },
    practice: function () { collect.practice(); },
    onQuestChanged: function (d) { collect.onQuestChanged(d); },
    chooseWalkPlan: function () { show('v-plans'); window.scrollTo(0, 0); mapper.showSegments(collect.walkIds(), true); },
    closePanel: function () { panel(false); },
    showAccount: function () { showAccount(state.account); }
  });

  /* ── Settings in Admin Mode (S5-P19 A, settings.js) ── */

  var settings = window.LitterSettings({
    $: $, api: api, notice: notice, busy: busy, show: show, myToken: myToken, signedOut: signedOut,
    closePanel: function () { panel(false); },
    back: function () { showAccount(state.account); }
  });

  /* ── Reviews in Admin Mode (S5-P19 B, reviews.js) ── */

  var reviews = window.LitterReviews({
    $: $, api: api, notice: notice, busy: busy, show: show, myToken: myToken, signedOut: signedOut,
    closePanel: function () { panel(false); },
    back: function () { showAccount(state.account); },
    smallMap: function (title, cells, opts) { return mapper.smallMap(title, cells, opts); },
    drawSmallMaps: function (root) { mapper.drawSmallMaps(root); },
    openForum: function (id) { forum.openReview(id); },
    challengePhoto: function (id, img, button) { return challenges.photoInto(id, img, button); },
    cellOf: function (lat, lon) { return challenges.cellOf(lat, lon); }
  });

  /* ── Challenges (S6-P8, challenges.js) ── */

  var challenges = window.LitterChallenges({
    $: $, api: api, notice: notice, busy: busy, show: show, myToken: myToken, signedOut: signedOut,
    closePanel: function () { panel(false); },
    // A Quest's segments on the map; its skill's Challenge opens Skills; a skill's pending pin (S6-P8).
    openMap: function (cells) { mapper.open({ focus: cells, back: function () { show('v-quests'); } }); },
    openSkills: function (find) { collect.openSkills(find); },
    closeSkills: function () { collect.closeSkills(); },
    // On the map in view: the collecting screen's, or the main page's.
    pendingPin: function (lat, lon, label) { if (!collect.pendingPin(lat, lon, label)) mapper.pendingPin(lat, lon, label); else mapper.pendingPin(null); },
    back: function () { showAccount(state.account); }
  });

  /* ── Streaks and achievements (S6-P6, achievements.js) ── */

  var achievements = window.LitterAchievements({
    $: $, api: api, notice: notice, busy: busy, show: show, myToken: myToken, signedOut: signedOut,
    me: function () { return state.account; },
    levelNow: function () { return collect.levelNow(); },
    closePanel: function () { panel(false); },
    back: function () { showAccount(state.account); }
  });

  /* ── The rolling history (S6-P3, scroll.js) ── */

  var scroll = window.LitterScroll({ $: $, api: api, myToken: myToken });

  /* ── The Wiki (S6-P9, wiki.js) ── */

  var wiki = window.LitterWiki({
    $: $, api: api, notice: notice, busy: busy, show: show, myToken: myToken, signedOut: signedOut,
    me: function () { return state.account; },
    closePanel: function () { panel(false); },
    back: function () { showAccount(state.account); },
    openTopic: function (id) { forum.openTopic(id); },
    // Where a ℹ️'s link was pressed: ← on its Wiki page comes back to that screen, where it was.
    here: function () {
      var v = VIEWS.filter(function (x) { return !$(x).hidden; })[0], y = window.scrollY;
      return v ? function () { show(v); window.scrollTo(0, y); } : null;
    }
  });

  /* ── The admins' forum, and players' reports (S5-P28, forum.js) ── */

  var forum = window.LitterForum({
    $: $, api: api, notice: notice, busy: busy, show: show, myToken: myToken, signedOut: signedOut,
    me: function () { return state.account; },
    closePanel: function () { panel(false); },
    back: function () { showAccount(state.account); },
    openReviews: function () { reviews.open(); }
  });

  /* ── The map and your collections (S3-P22, map.js) ── */

  var mapper = window.LitterMap({
    $: $, api: api, show: show, notice: notice, clearNotice: clearNotice, myToken: myToken, signedOut: signedOut, builderMode: builderMode,
    me: function () { return state.account; },
    showAccount: function () { showAccount(state.account); },
    // Back from the map with no account: the welcome screen.
    showStart: function () { if (state.account) showAccount(state.account); else show('v-welcome'); },
    openSummary: function (id, button) { collect.openPast(id, button); },
    levelNow: function () { return collect.levelNow(); },
    wikiLink: function (which) { return wiki.link(which); },
    planLabel: planLabel,
    pickedPlanCells: function () { return collect.pickedCells(); },
    onPlans: function (d) { collect.onPlans(d); },
    walkIds: function () { return collect.walkIds(); },
    useWalkPlan: function (ids) { collect.setWalkPlan(ids); },
    gate: function (b, key) { return collect.gate(b, key); },
    showCollections: function () { notice(''); show('v-collections'); },
    showPlans: function () { show('v-plans'); mapper.showSegments(); }
  });

  /* ── Wiring ── */

  // The map's ℹ️ and Admin Mode's, each with a link to its Wiki page (S6-P9, |Q665 (a)).
  $('mp-info-say').appendChild(wiki.link('map'));
  $('cl-sim-wiki').appendChild(wiki.link('admin'));

  $('go-setup').addEventListener('click', startSetup);
  $('go-signin').addEventListener('click', startSignin);
  $('go-map').addEventListener('click', function () { mapper.open({ back: function () { show('v-welcome'); } }); });
  // Maps (S6-U26): the days you choose, and every layer.
  $('me-go-maps').addEventListener('click', function () { panel(false); notice(''); mapper.open({ back: function () { showAccount(state.account); } }); });
  $('me-toggle').addEventListener('click', function () { panel($('me-panel').hidden); });
  // The ⭐'s words show on mouse-over (its title), or on a tap (|C665).
  ['me-handle-star', 'me-name-star'].forEach(function (id) {
    $(id).addEventListener('click', function () { $('me-star-say').hidden = !$('me-star-say').hidden; });
  });
  window.addEventListener('resize', fitPanel);
  window.addEventListener('resize', barHeight);
  if (window.ResizeObserver) new ResizeObserver(barHeight).observe($('me-toggle'));
  document.addEventListener('click', function (e) { if (!$('me-panel').hidden && !$('me-bar').contains(e.target)) panel(false); });
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && !$('me-panel').hidden) panel(false); });
  $('me-go-collections').addEventListener('click', function () { panel(false); notice(''); show('v-collections'); window.scrollTo(0, 0); });
  $('me-go-plans').addEventListener('click', function () { panel(false); show('v-plans'); window.scrollTo(0, 0); mapper.showSegments(); });
  $('my-back').addEventListener('click', function () { showAccount(state.account); });
  $('me-go-quests').addEventListener('click', function () { panel(false); notice(''); quest.showQuests(); show('v-quests'); challenges.load(); });
  $('quests-back').addEventListener('click', function () { showAccount(state.account); });
  $('plans-back').addEventListener('click', function () { showAccount(state.account); });
  $('trouble-retry').addEventListener('click', open);
  Array.prototype.forEach.call(document.querySelectorAll('[data-back]'), function (b) {
    b.addEventListener('click', function () { notice(''); show('v-welcome'); });
  });
  $('v-setup').addEventListener('submit', submitSetup);
  $('su-first').addEventListener('input', setupSignedAs);
  $('su-last').addEventListener('input', setupSignedAs);
  watchHandle('su-handle', 'su-handle-msg', false);
  $('v-setup-code').addEventListener('submit', submitSetupCode);
  $('sc-resend').addEventListener('click', function () {
    busy($('sc-submit'), 'sc-err', function () {
      return api('setUp', state.setup).then(function (d) { codeSent('sc-sent', d); $('sc-code').value = ''; $('sc-code').focus(); });
    });
  });
  $('sc-back').addEventListener('click', function () { notice(''); show('v-setup'); });
  $('v-resign').addEventListener('submit', submitResign);
  ['su', 'rs'].forEach(function (p) {
    GEAR.forEach(function (g) { $(p + '-gear-' + g[0]).addEventListener('change', function () { $(p + '-gear').dataset.touched = '1'; gearShow(p); }); });
  });
  $('rs-signout').addEventListener('click', signOut);
  $('v-signin').addEventListener('submit', submitSignin);
  $('si-resend').addEventListener('click', function () {
    var button = $('si-submit');
    busy(button, 'si-err', function () { return askForCode(button); });
  });
  $('me-edit').addEventListener('click', startEdit);
  $('ed-cancel').addEventListener('click', function () { showAccount(state.account); });
  $('me-form').addEventListener('submit', submitEdit);
  watchHandle('ed-handle', 'ed-handle-msg', true);
  $('me-signout').addEventListener('click', signOut);

  open();
})();
