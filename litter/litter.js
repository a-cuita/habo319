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
  function api(action, data) {
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

  var VIEWS = ['v-loading', 'v-soon', 'v-trouble', 'v-welcome', 'v-setup', 'v-setup-code', 'v-resign', 'v-signin', 'v-account', 'v-collect', 'v-plan', 'v-summary', 'v-map'];

  function $(id) { return document.getElementById(id); }

  function show(id) {
    VIEWS.forEach(function (v) { $(v).hidden = v !== id; });
    window.scrollTo(0, 0);
    // A signature box can only be measured once it's showing.
    if (id === 'v-setup' && !sigs['su-sig']) setupSignature('su-sig', 'su-sig-clear');
    if (id === 'v-resign' && !sigs['rs-sig']) setupSignature('rs-sig', 'rs-sig-clear');
  }

  function notice(text) {
    $('notice').textContent = text || '';
    $('notice').hidden = !text;
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
        // A collection still going on this phone opens where it was (Q282).
        if (d.account.waiverCurrent && collect.resume()) return;
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
        api('handleFree', { handle: h, token: withToken ? myToken() : '' }).then(function (d) {
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

  /* ── Setting up ── */

  function startSetup() {
    notice('');
    showWaiver('su');
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
      agree: $('su-agree').checked, waiverPrint: (state.waiver || {}).fingerprint || ''
    };
    if (!ask.firstName.trim() || !ask.lastName.trim()) { err.textContent = 'Please enter your first and last name.'; return; }
    if (!ask.email.trim()) { err.textContent = 'Please enter your email. Your codes and your copy of the waiver come there.'; return; }
    if (!ask.handle.trim()) { err.textContent = 'Please pick a handle.'; return; }
    if (!ask.adult) { err.textContent = 'Accounts are for people 18 or older. A family collects under a parent\'s account.'; return; }
    if (!ask.agree) { err.textContent = 'Please read the waiver and tick "I\'ve read this, and I agree".'; return; }
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
    var sig = sigs['rs-sig'];
    if (!sig || sig.ink < 40) { err.textContent = 'Please sign with your finger in the signature box.'; return; }
    var ask = { token: myToken(), agree: true, waiverPrint: (state.waiver || {}).fingerprint || '', signature: sig.canvas.toDataURL('image/png') };
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

  function showAccount(a) {
    state.account = a;
    notice('');
    if (!a.waiverCurrent) return startResign();
    $('me-handle').textContent = a.handle;
    $('me-name').textContent = a.firstName + ' ' + a.lastName;
    $('me-shows').textContent = { Handle: 'Your handle', Name: 'Your name', Neither: 'Neither your name nor your handle' }[a.mapShows] || a.mapShows;
    $('me-email').textContent = a.email;
    $('me-waiver').textContent = 'Signed ' + niceDate(a.waiverSigned);
    $('me-match').textContent = a.matched
      ? 'Matched to your HABO volunteer record.'
      : 'Not matched yet. It will be when you check in at a HABO event with the same email.';
    $('me-form').hidden = true;
    $('me-edit').hidden = false;
    show('v-account');
    collect.onAccount();
    mapper.showMine();
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
    api('signOut', { token: t }).catch(function () { /* this phone forgets it either way */ });
    show('v-welcome');
    notice('You\'re signed out on this phone.');
  }

  /* ── Collecting (S3-P21, collect.js) ── */

  var collect = window.LitterCollect({
    $: $, api: api, show: show, notice: notice, busy: busy, myToken: myToken, signedOut: signedOut,
    me: function () { return state.account; },
    showAccount: function () { showAccount(state.account); },
    openMap: function (cells, back) { mapper.open({ focus: cells, back: back }); }
  });

  /* ── The map and your collections (S3-P22, map.js) ── */

  var mapper = window.LitterMap({
    $: $, api: api, show: show, notice: notice, myToken: myToken, signedOut: signedOut,
    showAccount: function () { showAccount(state.account); },
    // Back from the map with no account: the welcome screen.
    showStart: function () { if (state.account) showAccount(state.account); else show('v-welcome'); },
    openSummary: function (id, button) { collect.openPast(id, button); }
  });

  /* ── Wiring ── */

  $('go-setup').addEventListener('click', startSetup);
  $('go-signin').addEventListener('click', startSignin);
  $('go-map').addEventListener('click', function () { mapper.open({ back: function () { show('v-welcome'); } }); });
  $('cl-map-open').addEventListener('click', function () { mapper.open({ back: function () { showAccount(state.account); } }); });
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
