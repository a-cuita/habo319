// Event check-in, for an event's page (?e=CODE). Two layouts:
//  - phone: one volunteer on their own phone; remembers their details there.
//  - kiosk (&kiosk=1): the event iPad. A big QR code for phones beside a
//    sign-in form; resets after each check-in and never remembers anyone.
// &preview=1 (the admin modal's preview) shows everything but can't save.
window.CheckIn = { start: function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var code = (params.get('e') || '').trim();
  var kiosk = params.get('kiosk') === '1';
  var preview = params.get('preview') === '1';
  var REMEMBER_KEY = 'habo319.volunteer';
  var KIOSK_DONE_SECONDS = 10;
  var KIOSK_IDLE_MS = 3 * 60 * 1000;

  var root = document.getElementById('checkin');
  var esc = App.esc;
  var event = null;
  var idleTimer = null;

  ['gate', 'survey', 'thanks'].forEach(function (id) { document.getElementById(id).hidden = true; });
  root.hidden = false;
  if (kiosk) document.body.classList.add('kiosk');

  /* ── Formatting ── */

  function fmtDate(ymd) {
    var p = ymd.split('-').map(Number);
    return new Date(p[0], p[1] - 1, p[2]).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' });
  }
  function fmtTime(hm) {
    var p = hm.split(':').map(Number);
    return (p[0] % 12 || 12) + ':' + ('0' + p[1]).slice(-2) + (p[0] < 12 ? ' AM' : ' PM');
  }
  function fmtHours(h) {
    var n = Math.round(Number(h) * 100) / 100;
    return n + (n === 1 ? ' hour' : ' hours');
  }
  function ordinal(n) {
    var s = ['th', 'st', 'nd', 'rd'], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }
  // The phone check-in link: what the kiosk's QR code opens.
  function phoneUrl() {
    var url = new URL(location.href);
    url.search = '';
    url.searchParams.set('e', event.code);
    return url.toString();
  }

  /* ── Screens ── */

  function show(html) {
    root.innerHTML = (preview ? '<div class="preview-banner">Preview: check-in is turned off here.</div>' : '') + html;
    window.scrollTo(0, 0);
  }

  function eventHeader() {
    var when = event.date ? fmtDate(event.date) + (event.start ? ' · ' + fmtTime(event.start) + ' – ' + fmtTime(event.end) : '') : '';
    return '<section class="card event-card">' +
      '<h2>' + esc(event.name) + '</h2>' +
      (when ? '<p class="muted">' + esc(when) + '</p>' : '') +
      (event.location ? '<p class="muted">' + esc(event.location) + '</p>' : '') +
      (event.description ? '<p class="event-desc">' + esc(event.description) + '</p>' : '') +
      '</section>';
  }

  function message(title, text) {
    show((event ? eventHeader() : '') + '<section class="card"><h2>' + esc(title) + '</h2><p class="muted">' + esc(text) + '</p></section>');
  }

  function statusText() {
    if (event.status === 'upcoming' && event.opensAt) {
      var opens = new Date(event.opensAt).toLocaleString(undefined, {
        timeZone: event.timeZone, weekday: 'long', month: 'long', day: 'numeric', hour: 'numeric', minute: '2-digit'
      });
      return 'Check-in opens ' + opens + '.';
    }
    return { closed: 'Check-in for this event has closed.', unscheduled: "This event doesn't have a date and time yet." }[event.status] ||
      "Check-in isn't open right now.";
  }

  function formHtml() {
    var saved = kiosk || preview ? {} : remembered();
    var waivers = event.waivers.map(function (w) {
      var controls = w.type === 'Optional'
        ? '<label class="choice-row"><input type="radio" name="w-' + esc(w.id) + '" value="agree"> I agree</label>' +
          '<label class="choice-row"><input type="radio" name="w-' + esc(w.id) + '" value="decline"> No thanks</label>'
        : '<label class="choice-row"><input type="checkbox" name="w-' + esc(w.id) + '" value="agree"> I agree</label>';
      return '<section class="card waiver"><h3>' + esc(w.title) + (w.type === 'Optional' ? ' <span class="muted">(optional)</span>' : '') + '</h3>' +
        '<div class="waiver-text">' + esc(w.text) + '</div>' + controls + '</section>';
    }).join('');
    return '<form id="ci-form" novalidate>' +
      '<section class="card">' +
        '<h2>' + (kiosk ? 'Sign in' : 'Check in') + '</h2>' +
        (saved.firstName ? '<p class="muted">Welcome back! Your details are filled in. <button type="button" class="link-btn inline" id="ci-forget">Not you?</button></p>' : '') +
        '<div class="row2">' +
          field('ci-first', 'First name', 'given-name', saved.firstName) +
          field('ci-last', 'Last name', 'family-name', saved.lastName) +
        '</div>' +
        field('ci-email', 'Email', 'email', saved.email, 'email') +
        field('ci-phone', 'Phone', 'tel', saved.phone, 'tel') +
        '<p class="muted small">Email or phone, at least one, so we can recognize you next time.</p>' +
      '</section>' +
      waivers +
      (event.waivers.length ? '<section class="card">' + field('ci-sign', 'Type your full name to sign', 'off') + '</section>' : '') +
      '<button class="btn btn-accent" type="submit"' + (preview ? ' disabled' : '') + '>Check in</button>' +
      '<p class="err" id="ci-err" role="alert"></p>' +
      '</form>';
  }

  function field(id, label, autocomplete, value, type) {
    return '<div class="ig"><label for="' + id + '">' + esc(label) + '</label>' +
      '<input id="' + id + '" type="' + (type || 'text') + '" autocomplete="' + (kiosk ? 'off' : autocomplete) + '" value="' + esc(value || '') + '"' +
      (type === 'tel' ? ' inputmode="tel"' : '') + '></div>';
  }

  function renderForm() {
    if (kiosk) {
      show('<div class="kiosk-grid">' +
        '<div class="kiosk-left">' + eventHeader() +
          '<section class="card kiosk-qr"><div id="ci-qr"></div><h2>Scan to check in with your phone</h2>' +
          '<p class="muted">Or sign in here →</p></section></div>' +
        '<div class="kiosk-right">' + formHtml() + '</div>' +
        '</div>');
      drawQr();
      armIdleReset();
    } else {
      show(eventHeader() + formHtml());
    }
    var form = document.getElementById('ci-form');
    form.addEventListener('submit', submit);
    var forget = document.getElementById('ci-forget');
    if (forget) forget.addEventListener('click', function () { remember(null); renderForm(); });
  }

  function drawQr() {
    loadQrLib().then(function () {
      var qr = qrcode(0, 'M');
      qr.addData(phoneUrl());
      qr.make();
      document.getElementById('ci-qr').innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
    });
  }

  var qrLib = null;
  function loadQrLib() {
    if (!qrLib) {
      qrLib = new Promise(function (resolve, reject) {
        var s = document.createElement('script');
        s.src = 'assets/qrcode.js';
        s.onload = resolve;
        s.onerror = reject;
        document.head.appendChild(s);
      });
    }
    return qrLib;
  }

  /* ── Check-in ── */

  function submit(e) {
    e.preventDefault();
    if (preview) return;
    var err = document.getElementById('ci-err');
    var value = function (id) { var el = document.getElementById(id); return el ? el.value.trim() : ''; };
    var decisions = {};
    var missing = null;
    event.waivers.forEach(function (w) {
      var picked = document.querySelector('input[name="w-' + w.id + '"]:checked');
      if (picked) decisions[w.id] = picked.value;
      else if (!missing) missing = w;
    });
    var input = {
      code: event.code,
      firstName: value('ci-first'),
      lastName: value('ci-last'),
      email: value('ci-email'),
      phone: value('ci-phone'),
      signedName: value('ci-sign'),
      decisions: decisions,
      method: kiosk ? 'kiosk' : 'phone'
    };
    err.textContent = '';
    if (!input.firstName || !input.lastName) { err.textContent = 'Please enter your first and last name.'; return; }
    if (!input.email && !input.phone) { err.textContent = 'Please enter an email or phone number.'; return; }
    if (missing) {
      err.textContent = missing.type === 'Optional'
        ? 'Please choose yes or no for "' + missing.title + '".'
        : 'Please agree to "' + missing.title + '" to check in.';
      return;
    }
    if (event.waivers.length && !input.signedName) { err.textContent = 'Type your full name to sign.'; return; }

    var button = e.target.querySelector('button[type=submit]');
    button.disabled = true;
    button.textContent = 'Checking in…';
    App.api('checkIn', input)
      .then(function (res) {
        if (!kiosk) remember({ firstName: input.firstName, lastName: input.lastName, email: input.email, phone: input.phone });
        done(res);
      })
      .catch(function (error) {
        err.textContent = error.message;
        button.disabled = false;
        button.textContent = 'Check in';
      });
  }

  function done(res) {
    var greeting = res.already ? "You're already checked in, " + res.firstName + '.'
      : res.returning ? 'Welcome back, ' + res.firstName + '!' : 'Welcome, ' + res.firstName + '!';
    var detail = res.already ? 'No need to check in again.'
      : res.returning ? 'This is your ' + ordinal(res.eventCount) + ' event with us. Thank you!'
      : 'Thanks for joining us today.';
    var hours = res.hours ? '<p class="done-hours">' + esc(fmtHours(res.hours)) + ' of volunteer time for ' + esc(res.eventName) + '</p>' : '';
    show('<section class="card done"><div class="done-mark" aria-hidden="true">✓</div>' +
      '<h2>' + esc(greeting) + '</h2><p>' + esc(detail) + '</p>' + hours +
      (kiosk ? '<p class="muted">This screen resets in <span id="ci-count">' + KIOSK_DONE_SECONDS + '</span> seconds.</p>' +
        '<button class="btn btn-primary" type="button" id="ci-next">Next person</button>' : '') +
      '</section>');
    if (kiosk) {
      var left = KIOSK_DONE_SECONDS;
      var tick = setInterval(function () {
        left -= 1;
        var c = document.getElementById('ci-count');
        if (c) c.textContent = left;
        if (left <= 0) { clearInterval(tick); renderForm(); }
      }, 1000);
      document.getElementById('ci-next').addEventListener('click', function () { clearInterval(tick); renderForm(); });
    }
  }

  // On the kiosk, a half-filled form is cleared after a few idle minutes so
  // the next person never sees someone else's details.
  function armIdleReset() {
    var reset = function () {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(function () {
        if (document.getElementById('ci-form')) renderForm();
      }, KIOSK_IDLE_MS);
    };
    if (!armIdleReset.bound) {
      ['input', 'click', 'touchstart'].forEach(function (t) { document.addEventListener(t, reset, true); });
      armIdleReset.bound = true;
    }
    reset();
  }

  /* ── Remembered details (personal phones only) ── */

  function remembered() {
    try { return JSON.parse(localStorage.getItem(REMEMBER_KEY)) || {}; } catch (e) { return {}; }
  }
  function remember(details) {
    try {
      if (details) localStorage.setItem(REMEMBER_KEY, JSON.stringify(details));
      else localStorage.removeItem(REMEMBER_KEY);
    } catch (e) {}
  }

  /* ── Start ── */

  show('<section class="card"><p class="muted">Loading…</p></section>');
  if (!App.isConfigured) { message('Not available', 'Check-in is not set up yet.'); return; }
  App.api('getEvent', { code: code })
    .then(function (ev) {
      event = ev;
      document.title = ev.name + ' · Check-in';
      if (ev.status === 'open' || preview) renderForm();
      else message(ev.status === 'upcoming' ? 'Not open yet' : 'Check-in closed', statusText());
    })
    .catch(function (error) { message('Event not found', error.message); });
} };
