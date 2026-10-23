// HABO's litter page, step 1 (S3-P20): setting up an account with the
// waiver, signing in on a new phone, and the account page. Load config.js
// first. Opened on the litter web app's own link (its dev link, while it's
// tried), the page calls the backend through google.script.run; on the
// public site, it POSTs to config.js's API_URL.
(function () {
  'use strict';

  var config = window.LITTER_CONFIG || {};
  var inAppsScript = typeof google !== 'undefined' && google.script && google.script.run;
  var TOKEN_KEY = 'habo-litter-token';
  var SHOWS_WORDS = { Handle: 'My handle', Name: 'My name', Neither: 'Neither' };

  var state = { waiver: null, mapShows: ['Handle', 'Name', 'Neither'], account: null, contact: '' };
  var sig = null;

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

  function token() {
    try { return localStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  function keepToken(t) {
    try {
      if (t) localStorage.setItem(TOKEN_KEY, t);
      else localStorage.removeItem(TOKEN_KEY);
    } catch (e) { /* private window: signed in until the page closes */ }
    memoryToken = t || '';
  }
  var memoryToken = '';
  function myToken() { return token() || memoryToken; }

  /* ── Screens ── */

  var VIEWS = ['v-loading', 'v-soon', 'v-trouble', 'v-welcome', 'v-setup', 'v-signin', 'v-account'];

  function $(id) { return document.getElementById(id); }

  function show(id) {
    VIEWS.forEach(function (v) { $(v).hidden = v !== id; });
    window.scrollTo(0, 0);
    if (id === 'v-setup' && !sig) setupSignature();   // the signature box can only be measured once it's showing
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
    notice('This phone isn\'t signed in anymore. Sign in again with your email or phone.');
    show('v-welcome');
  }

  /* ── Opening the page ── */

  function open() {
    if (!inAppsScript && !config.API_URL) return show('v-soon');
    show('v-loading');
    api('start', { token: myToken() }).then(function (d) {
      state.waiver = d.waiver;
      state.mapShows = d.mapShows || state.mapShows;
      if (d.account) return showAccount(d.account);
      if (d.signedOut) {
        keepToken('');
        notice('This phone isn\'t signed in anymore. Sign in again with your email or phone.');
      }
      show('v-welcome');
    }, function (err) {
      $('trouble-msg').textContent = err.message;
      show('v-trouble');
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

  /* ── Setting up ── */

  function startSetup() {
    notice('');
    var w = state.waiver || {};
    $('su-waiver-title').textContent = w.title || 'Waiver';
    $('su-waiver-text').textContent = w.text || 'The waiver isn\'t ready yet, so accounts can\'t be set up. Please try again later.';
    if (!$('su-shows').childNodes.length) showsChoices('su-shows', 'su-shows', 'Handle');
    signedAs();
    show('v-setup');
  }

  function signedAs() {
    var name = ($('su-first').value.trim() + ' ' + $('su-last').value.trim()).trim();
    var today = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
    $('su-signed-as').textContent = name ? 'Signed as ' + name + ', ' + today + '.' : 'Your name and today\'s date go with your signature.';
  }

  function submitSetup(e) {
    e.preventDefault();
    var err = $('su-err');
    var ask = {
      firstName: $('su-first').value, lastName: $('su-last').value, email: $('su-email').value, phone: $('su-phone').value,
      handle: $('su-handle').value, mapShows: picked('su-shows') || 'Handle', adult: $('su-adult').checked,
      agree: $('su-agree').checked, waiverPrint: (state.waiver || {}).fingerprint || ''
    };
    if (!ask.firstName.trim() || !ask.lastName.trim()) { err.textContent = 'Please enter your first and last name.'; return; }
    if (!ask.email.trim() && !ask.phone.trim()) { err.textContent = 'Please enter your email or phone number.'; return; }
    if (!ask.handle.trim()) { err.textContent = 'Please pick a handle.'; return; }
    if (!ask.adult) { err.textContent = 'Accounts are for people 18 or older. A family collects under a parent\'s account.'; return; }
    if (!ask.agree) { err.textContent = 'Please read the waiver and tick "I\'ve read this, and I agree".'; return; }
    if (!sig || sig.ink < 40) { err.textContent = 'Please sign with your finger in the signature box.'; return; }
    ask.signature = sig.canvas.toDataURL('image/png');
    busy($('su-submit'), 'su-err', function () {
      return api('setUp', ask).then(function (d) {
        keepToken(d.token);
        $('v-setup').reset();
        clearSignature();
        showAccount(d.account);
        notice('Your account is set up.');
      }, function (er) {
        if (er.code !== 'waiver-changed') throw er;
        // Shows the new words, to be read and signed again.
        return api('start', {}).then(function (d) {
          state.waiver = d.waiver;
          $('su-agree').checked = false;
          clearSignature();
          startSetup();
          notice(er.message);
        });
      });
    });
  }

  /* ── Signature pad (as at the check-in) ── */

  function setupSignature() {
    var canvas = $('su-sig');
    var ratio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
    var w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    var ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.strokeStyle = ctx.fillStyle = '#111';
    sig = { canvas: canvas, ctx: ctx, w: w, h: h, ink: 0 };
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
    $('su-sig-clear').addEventListener('click', clearSignature);
  }

  function clearSignature() {
    if (!sig) return;
    sig.ctx.clearRect(0, 0, sig.w, sig.h);
    sig.ink = 0;
  }

  /* ── Signing in on a new phone ── */

  function startSignin() {
    notice('');
    $('si-code-box').hidden = true;
    $('si-resend-row').hidden = true;
    $('si-contact').disabled = false;
    $('si-code').value = '';
    $('si-err').textContent = '';
    $('si-submit').textContent = 'Continue';
    show('v-signin');
    $('si-contact').focus();
  }

  function signedIn(d) {
    keepToken(d.token);
    showAccount(d.account);
    notice('You\'re signed in on this phone.');
  }

  function askForCode(button) {
    state.contact = $('si-contact').value;
    return api('signInStart', { contact: state.contact }).then(function (d) {
      if (!d.needsCode) return signedIn(d);
      $('si-sent').textContent = 'We sent a 6-digit code to ' + d.sentTo + '. It works for ' + d.minutes + ' minutes.';
      $('si-code-box').hidden = false;
      $('si-resend-row').hidden = false;
      $('si-contact').disabled = true;
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
      return api('signInCode', { contact: state.contact, code: $('si-code').value }).then(signedIn);
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
    $('me-handle').textContent = a.handle;
    $('me-name').textContent = a.firstName + ' ' + a.lastName;
    $('me-shows').textContent = { Handle: 'Your handle', Name: 'Your name', Neither: 'Neither your name nor your handle' }[a.mapShows] || a.mapShows;
    $('me-email').textContent = a.email || 'None';
    $('me-phone').textContent = a.phone || 'None';
    $('me-waiver').textContent = 'Signed ' + niceDate(a.waiverSigned);
    $('me-match').textContent = a.matched
      ? 'Matched to your HABO volunteer record.'
      : 'Not matched yet. It will be when you check in at a HABO event with the same email or phone.';
    $('me-form').hidden = true;
    $('me-edit').hidden = false;
    show('v-account');
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
    var t = myToken();
    keepToken('');
    state.account = null;
    api('signOut', { token: t }).catch(function () { /* this phone forgets it either way */ });
    notice('You\'re signed out on this phone.');
    show('v-welcome');
  }

  /* ── Wiring ── */

  $('go-setup').addEventListener('click', startSetup);
  $('go-signin').addEventListener('click', startSignin);
  $('trouble-retry').addEventListener('click', open);
  Array.prototype.forEach.call(document.querySelectorAll('[data-back]'), function (b) {
    b.addEventListener('click', function () { notice(''); show('v-welcome'); });
  });
  $('v-setup').addEventListener('submit', submitSetup);
  $('su-first').addEventListener('input', signedAs);
  $('su-last').addEventListener('input', signedAs);
  watchHandle('su-handle', 'su-handle-msg', false);
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
