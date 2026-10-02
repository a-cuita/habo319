// Event check-in, for an event's page (?e=CODE). Two layouts:
//  - phone: one volunteer on their own phone; remembers their details there.
//  - kiosk (&kiosk=1): the event iPad. A big QR code for phones and a
//    rotating banner beside a sign-in form; resets after each check-in and
//    never remembers anyone.
// &preview=1 (the admin modal's preview) shows everything but can't save.
// A small "Staff" link opens the event's head count, behind its staff code.
window.CheckIn = { start: function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var code = (params.get('e') || '').trim();
  var kiosk = params.get('kiosk') === '1';
  var preview = params.get('preview') === '1';
  var REMEMBER_KEY = 'habo319.volunteer';
  var KIOSK_DONE_SECONDS = 10;
  var KIOSK_IDLE_MS = 3 * 60 * 1000;
  var STAFF_REFRESH_MS = 20 * 1000;

  var root = document.getElementById('checkin');
  var esc = App.esc;
  var event = null;
  var screen = null;          // 'form' | 'done' | 'status' | 'staff' | 'staff-code'
  var timers = { idle: null, banner: null, staff: null, done: null };
  var staffCode = null;       // kept in memory only, for refreshing the head count

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
  function initials(name) {
    var parts = String(name || '?').trim().split(/\s+/);
    return ((parts[0] || '?')[0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
  }
  function photo(p, cls) {
    return p.photo
      ? '<img class="' + cls + '" src="' + esc(p.photo) + '" alt="">'
      : '<span class="' + cls + ' initials">' + esc(initials(p.name)) + '</span>';
  }
  // The phone check-in link: what the kiosk's QR code opens.
  function phoneUrl() {
    var url = new URL(location.href);
    url.search = '';
    url.searchParams.set('e', event.code);
    return url.toString();
  }

  /* ── Screens ── */

  function stopTimers() {
    clearInterval(timers.banner);
    clearInterval(timers.staff);
    clearInterval(timers.done);
  }

  function show(name, html, withStaffLink) {
    stopTimers();
    screen = name;
    root.innerHTML = (preview ? '<div class="preview-banner">Preview: check-in is turned off here.</div>' : '') + html +
      (withStaffLink && event ? '<div class="staff-link"><button type="button" class="link-btn" id="ci-staff">Staff</button></div>' : '');
    var staff = document.getElementById('ci-staff');
    if (staff) staff.addEventListener('click', openStaffCode);
    window.scrollTo(0, 0);
    if (kiosk) armIdleReset();
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
    show('status', (event ? eventHeader() : '') +
      '<section class="card"><h2>' + esc(title) + '</h2><p class="muted">' + esc(text) + '</p></section>', !!event);
  }

  var STATUS = {
    upcoming: 'Not open yet',
    closed: 'Check-in closed',
    unscheduled: 'Not scheduled yet'
  };

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

  /* ── Check-in form ── */

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
      var banner = event.banner && event.banner.cards.length ? '<section class="card banner" id="ci-banner"></section>' : '';
      show('form', '<div class="kiosk-grid">' +
        '<div class="kiosk-left">' + eventHeader() + banner +
          '<section class="card kiosk-qr"><div id="ci-qr"></div>' +
          '<p class="kiosk-how"><strong>TO CHECK IN:</strong> Scan the QR code or fill in this form →</p></section></div>' +
        '<div class="kiosk-right">' + formHtml() + '</div>' +
        '</div>', true);
      drawQr();
      if (banner) startBanner();
    } else {
      show('form', eventHeader() + formHtml(), true);
    }
    document.getElementById('ci-form').addEventListener('submit', submit);
    var forget = document.getElementById('ci-forget');
    if (forget) forget.addEventListener('click', function () { remember(null); renderForm(); });
  }

  function drawQr() {
    loadQrLib().then(function () {
      var target = document.getElementById('ci-qr');
      if (!target) return;
      var qr = qrcode(0, 'M');
      qr.addData(phoneUrl());
      qr.make();
      target.innerHTML = qr.createSvgTag({ cellSize: 8, margin: 2, scalable: true });
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

  /* ── Rotating banner (iPad) ── */

  function startBanner() {
    var cards = event.banner.cards;
    var i = 0;
    var draw = function () {
      var box = document.getElementById('ci-banner');
      if (!box) return;
      var c = cards[i];
      var body = c.kind === 'host'
        ? '<div class="bn-host">' + photo(c, 'bn-photo') +
            '<div><div class="bn-label">' + (c.role === 'Host' ? 'Your host' : 'Co-host') + '</div>' +
            '<div class="bn-name">' + esc(c.name) + '</div>' +
            (c.title ? '<div class="muted">' + esc(c.title) + '</div>' : '') +
            (c.bio ? '<p class="bn-bio">' + esc(c.bio) + '</p>' : '') + '</div></div>'
        : '<div class="bn-card">' + (c.title ? '<div class="bn-title">' + esc(c.title) + '</div>' : '') +
            (c.text ? '<p class="bn-text">' + esc(c.text) + '</p>' : '') + '</div>';
      var dots = cards.length > 1 ? '<div class="bn-dots">' + cards.map(function (_, k) {
        return '<span class="' + (k === i ? 'on' : '') + '"></span>';
      }).join('') + '</div>' : '';
      box.innerHTML = body + dots;
    };
    draw();
    if (cards.length > 1) {
      timers.banner = setInterval(function () { i = (i + 1) % cards.length; draw(); }, event.banner.seconds * 1000);
    }
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
    var events = res.eventCount === 1 ? '1 event' : res.eventCount + ' events';
    var greeting = res.already ? "You're already checked in, " + res.firstName + '.'
      : res.returning ? 'Welcome back, ' + res.firstName + '!' : 'Welcome, ' + res.firstName + '!';
    var detail = res.already ? 'No need to check in again.'
      : res.returning ? 'This is your ' + ordinal(res.eventCount) + ' event with us. Thank you!'
      : 'Thanks for joining us today.';
    var today = res.hours ? '<p class="done-hours">' + esc(fmtHours(res.hours)) + ' of volunteer time for ' + esc(res.eventName) + '</p>' : '';
    var total = (res.returning || res.already) && res.totalHours
      ? '<div class="done-total"><div class="done-total-num">' + esc(fmtHours(res.totalHours)) + '</div>' +
        '<div class="muted">with us so far, across ' + esc(events) + ', counting today</div></div>'
      : '';
    var hosts = event.hostsOnConfirmation && event.hosts.length
      ? '<section class="card hosts"><h3>' + (event.hosts.length === 1 ? 'Your host today' : 'Your hosts today') + '</h3>' +
        event.hosts.map(function (h) {
          return '<div class="host-row">' + photo(h, 'host-photo') + '<div><div class="host-name">' + esc(h.name) + '</div>' +
            '<div class="muted">' + esc(h.role + (h.title ? ' · ' + h.title : '')) + '</div></div></div>';
        }).join('') + '</section>'
      : '';
    show('done', '<section class="card done"><div class="done-mark" aria-hidden="true">✓</div>' +
      '<h2>' + esc(greeting) + '</h2><p>' + esc(detail) + '</p>' + today + total +
      (kiosk ? '<p class="muted">This screen resets in <span id="ci-count">' + KIOSK_DONE_SECONDS + '</span> seconds.</p>' +
        '<button class="btn btn-primary" type="button" id="ci-next">Next person</button>' : '') +
      '</section>' + hosts, false);
    if (kiosk) {
      var left = KIOSK_DONE_SECONDS;
      timers.done = setInterval(function () {
        left -= 1;
        var c = document.getElementById('ci-count');
        if (c) c.textContent = left;
        if (left <= 0) renderForm();
      }, 1000);
      document.getElementById('ci-next').addEventListener('click', renderForm);
    }
  }

  /* ── Staff: head count ── */

  function openStaffCode() {
    show('staff-code', eventHeader() +
      '<form class="card" id="st-code-form" novalidate><h2>Staff</h2>' +
      '<p class="muted">Enter this event\'s staff code to see who has checked in.</p>' +
      '<div class="ig"><label for="st-code">Staff code</label>' +
      '<input id="st-code" type="password" inputmode="numeric" autocomplete="off"></div>' +
      '<button class="btn btn-primary" type="submit">Open</button>' +
      '<button class="btn btn-secondary" type="button" id="st-back">Back to check-in</button>' +
      '<p class="err" id="st-err" role="alert"></p></form>', false);
    document.getElementById('st-back').addEventListener('click', backToCheckin);
    document.getElementById('st-code').focus();
    document.getElementById('st-code-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var entered = document.getElementById('st-code').value.trim();
      var button = e.target.querySelector('button[type=submit]');
      if (!entered) return;
      button.disabled = true;
      App.api('staffHeadcount', { code: event.code, staffCode: entered })
        .then(function (data) { staffCode = entered; renderStaff(data); })
        .catch(function (error) {
          document.getElementById('st-err').textContent = error.message;
          button.disabled = false;
        });
    });
  }

  function renderStaff(data, saved) {
    var last = data.lastRecorded;
    var lastLine = last && !saved
      ? '<p class="muted">Last head count: ' + esc(last.counted) + ' counted by ' + esc(last.staffName) + ' at ' + esc(last.time) +
        ' (check-ins then: ' + esc(last.system) + ')</p>'
      : '';
    var list = data.people.length
      ? data.people.map(function (p) {
          return '<div class="st-row"><span>' + esc(p.name) + '</span><span class="muted">' + esc(p.time) + ' · ' + esc(p.method) + '</span></div>';
        }).join('')
      : '<p class="muted">No one has checked in yet.</p>';
    show('staff', '<section class="card staff">' +
      '<div class="st-head"><h2>' + esc(data.eventName) + '</h2><button type="button" class="btn btn-secondary st-small" id="st-done">Done</button></div>' +
      '<div class="st-count"><span class="st-num">' + esc(data.count) + '</span> checked in</div>' + lastLine +
      (saved ? '<p class="st-saved">Head count saved: ' + esc(saved.counted) + ' counted, ' + esc(saved.system) + ' checked in' +
        (saved.counted === saved.system ? ' ✓' : ' (difference ' + esc(saved.counted - saved.system) + ')') + '.</p>' : '') +
      '</section>' +
      '<form class="card" id="st-record" novalidate><h3>Record a head count</h3>' +
      '<div class="row2"><div class="ig"><label for="st-name">Your name</label><input id="st-name" autocomplete="off"></div>' +
      '<div class="ig"><label for="st-counted">People counted</label><input id="st-counted" type="number" inputmode="numeric" min="0"></div></div>' +
      '<div class="ig"><label for="st-note">Note (optional)</label><input id="st-note" autocomplete="off"></div>' +
      '<button class="btn btn-primary" type="submit">Save head count</button>' +
      '<p class="err" id="st-err" role="alert"></p></form>' +
      '<section class="card"><h3>Checked in</h3>' + list + '</section>', false);
    document.getElementById('st-done').addEventListener('click', backToCheckin);
    document.getElementById('st-record').addEventListener('submit', recordCount);
    timers.staff = setInterval(refreshStaff, STAFF_REFRESH_MS);
  }

  function refreshStaff() {
    // Don't redraw while someone is typing a head count.
    var form = document.getElementById('st-record');
    if (form && Array.prototype.some.call(form.querySelectorAll('input'), function (i) { return i.value; })) return;
    App.api('staffHeadcount', { code: event.code, staffCode: staffCode })
      .then(function (data) {
        if (screen !== 'staff') return;
        var y = window.scrollY;
        renderStaff(data);
        window.scrollTo(0, y);
      })
      .catch(function () {});
  }

  function recordCount(e) {
    e.preventDefault();
    var err = document.getElementById('st-err');
    var button = e.target.querySelector('button[type=submit]');
    var input = {
      code: event.code,
      staffCode: staffCode,
      staffName: document.getElementById('st-name').value.trim(),
      counted: document.getElementById('st-counted').value.trim(),
      note: document.getElementById('st-note').value.trim()
    };
    err.textContent = '';
    if (!input.staffName) { err.textContent = 'Enter your name.'; return; }
    if (input.counted === '') { err.textContent = 'Enter the number of people you counted.'; return; }
    button.disabled = true;
    App.api('staffRecordCount', input)
      .then(function (data) { renderStaff(data, data.lastRecorded); })
      .catch(function (error) { err.textContent = error.message; button.disabled = false; });
  }

  function backToCheckin() {
    staffCode = null;
    route();
  }

  /* ── Kiosk idle reset ── */

  // On the iPad, any screen other than a fresh form goes back to the form
  // after a few idle minutes, so the next person never sees someone else's
  // details or the staff head count.
  function armIdleReset() {
    var reset = function () {
      clearTimeout(timers.idle);
      timers.idle = setTimeout(function () {
        staffCode = null;
        if (event) route();
      }, KIOSK_IDLE_MS);
    };
    if (!armIdleReset.bound) {
      ['input', 'click', 'touchstart', 'keydown'].forEach(function (t) { document.addEventListener(t, reset, true); });
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

  function route() {
    if (event.status === 'open' || preview) renderForm();
    else message(STATUS[event.status] || 'Check-in closed', statusText());
  }

  show('loading', '<section class="card"><p class="muted">Loading…</p></section>', false);
  if (!App.isConfigured) { message('Not available', 'Check-in is not set up yet.'); return; }
  App.api('getEvent', { code: code, kiosk: kiosk })
    .then(function (ev) {
      event = ev;
      document.title = ev.name + ' · Check-in';
      route();
    })
    .catch(function (error) { message('Event not found', error.message); });
} };
