// Event check-in, for an event's page (?e=CODE), or on the home page for
// whichever event's check-in is open right now. Two layouts:
//  - phone: one volunteer on their own phone; remembers their details there.
//  - kiosk (&kiosk=1): the event iPad. A big QR code for phones and a
//    rotating banner beside a sign-in form; resets after each check-in and
//    never remembers anyone.
// The home page uses the iPad layout on wide screens and the phone layout on
// phones, and switches events on its own as check-in opens and closes.
// &preview=1 (the admin modal's preview) shows everything but can't save.
// A small "Staff" link signs in staff: an admin PIN opens the admin tools
// (and the head count during an event); an event's staff code opens its
// head count while check-in is open.
window.CheckIn = { start: function () {
  'use strict';

  var params = new URLSearchParams(location.search);
  var code = (params.get('e') || '').trim();
  var home = !code;
  var kiosk = params.get('kiosk') === '1' || (home && window.matchMedia('(min-width: 800px)').matches);
  var preview = params.get('preview') === '1';
  var REMEMBER_KEY = 'habo319.volunteer';
  var KIOSK_DONE_SECONDS = 10;
  var KIOSK_IDLE_MS = 3 * 60 * 1000;
  var STAFF_REFRESH_MS = 20 * 1000;
  var HOME_RECHECK_MS = 60 * 1000;

  var root = document.getElementById('checkin');
  var esc = App.esc;
  var event = null;
  var screen = null;          // 'form' | 'done' | 'status' | 'staff' | 'staff-code'
  var timers = { idle: null, banner: null, staff: null, done: null, recheck: null };
  var staff = null;           // signed-in staff, in memory only: { token, name } (admin) or { code } (event staff)
  var sig = null;             // the signature pad on the form: { canvas, ink }
  var adminHtml = null;       // the admin tools page, once loaded

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
    clearTimeout(timers.recheck);
    clearInterval(timers.banner);
    clearInterval(timers.staff);
    clearInterval(timers.done);
  }

  function show(name, html, withStaffLink) {
    stopTimers();
    screen = name;
    root.innerHTML = (preview ? '<div class="preview-banner">Preview: check-in is turned off here.</div>' : '') + html +
      (withStaffLink ? '<div class="staff-link"><button type="button" class="link-btn" id="ci-staff">Staff</button></div>' : '');
    var staff = document.getElementById('ci-staff');
    if (staff) staff.addEventListener('click', openStaffCode);
    window.scrollTo(0, 0);
    if (kiosk) armIdleReset();
  }

  // The event's name, time, place, and description. `inside` goes at the
  // bottom of the same card (the iPad's hosts banner).
  function eventHeader(inside) {
    var when = event.date ? fmtDate(event.date) + (event.start ? ' · ' + fmtTime(event.start) + ' – ' + fmtTime(event.end) : '') : '';
    return '<section class="card event-card">' +
      '<h2>' + esc(event.name) + '</h2>' +
      (when ? '<p class="muted">' + esc(when) + '</p>' : '') +
      (event.location ? '<p class="muted">' + esc(event.location) + '</p>' : '') +
      (event.description ? '<p class="event-desc">' + esc(event.description) + '</p>' : '') +
      (inside || '') +
      '</section>';
  }

  function message(title, text) {
    show('status', (event ? eventHeader() : '') +
      '<section class="card"><h2>' + esc(title) + '</h2><p class="muted">' + esc(text) + '</p></section>', !!event || home);
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
      (event.waivers.length ? '<section class="card"><div class="ig"><label>Sign here with your finger</label>' +
        '<div class="sig-box"><canvas id="ci-sig" class="sig-pad" aria-label="Signature box"></canvas>' +
        '<button type="button" class="link-btn sig-clear" id="ci-sig-clear">Clear</button></div>' +
        '<p class="muted small">Your signature applies to the waivers above.</p></div></section>' : '') +
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
      var banner = event.banner && event.banner.cards.length ? '<div class="banner" id="ci-banner"></div>' : '';
      show('form', '<div class="kiosk-grid">' +
        '<div class="kiosk-left">' + eventHeader(banner) +
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
    setupSignature();
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

  /* ── Signature pad ── */

  function setupSignature() {
    var canvas = document.getElementById('ci-sig');
    sig = null;
    if (!canvas) return;
    var ratio = Math.min(Math.max(window.devicePixelRatio || 1, 1), 2);
    var w = canvas.clientWidth, h = canvas.clientHeight;
    canvas.width = Math.round(w * ratio);
    canvas.height = Math.round(h * ratio);
    var ctx = canvas.getContext('2d');
    ctx.scale(ratio, ratio);
    ctx.lineWidth = 2.5;
    ctx.lineCap = ctx.lineJoin = 'round';
    ctx.strokeStyle = ctx.fillStyle = '#111';
    sig = { canvas: canvas, ink: 0 };
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
    document.getElementById('ci-sig-clear').addEventListener('click', function () {
      ctx.clearRect(0, 0, w, h);
      sig.ink = 0;
    });
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
    // A dot or two isn't a signature.
    if (event.waivers.length && !(sig && sig.ink > 40)) { err.textContent = 'Please sign in the signature box.'; return; }
    if (event.waivers.length) input.signature = sig.canvas.toDataURL('image/png');

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

  /* ── Staff ── */

  function eventOpen() { return !!event && event.status === 'open'; }
  function staffAuth() { return staff && staff.token ? { token: staff.token } : { staffCode: staff && staff.code }; }

  function openStaffCode() {
    var open = eventOpen();
    show('staff-code', (event ? eventHeader() : '') +
      '<form class="card" id="st-code-form" novalidate><h2>Staff</h2>' +
      '<p class="muted">' + (open ? "Enter your admin PIN or this event's staff code." : 'Enter your admin PIN.') + '</p>' +
      '<div class="ig"><label for="st-code">' + (open ? 'PIN or staff code' : 'Admin PIN') + '</label>' +
      '<input id="st-code" type="password" inputmode="numeric" autocomplete="off"></div>' +
      '<button class="btn btn-primary" type="submit">Open</button>' +
      '<button class="btn btn-secondary" type="button" id="st-back">Back to check-in</button>' +
      '<p class="err" id="st-err" role="alert"></p></form>', false);
    document.getElementById('st-back').addEventListener('click', signOut);
    document.getElementById('st-code').focus();
    document.getElementById('st-code-form').addEventListener('submit', function (e) {
      e.preventDefault();
      var entered = document.getElementById('st-code').value.trim();
      var button = e.target.querySelector('button[type=submit]');
      if (!entered) return;
      button.disabled = true;
      App.api('staffSignIn', { code: event ? event.code : '', pin: entered })
        .then(function (res) {
          if (res.role === 'admin') {
            staff = { token: res.token, name: res.name };
            if (res.headcount) renderStaffMenu(); else openAdmin();
          } else {
            staff = { code: entered };
            renderStaff(res.headcount);
          }
        })
        .catch(function (error) {
          document.getElementById('st-err').textContent = error.message;
          button.disabled = false;
        });
    });
  }

  // For an admin during an event: the head count or the admin tools.
  function renderStaffMenu() {
    show('staff-menu', eventHeader() +
      '<section class="card"><h2>Staff</h2><p class="muted">Signed in as ' + esc(staff.name) + '.</p></section>' +
      '<button class="btn btn-primary" type="button" id="st-menu-count">Head count</button>' +
      '<button class="btn btn-secondary" type="button" id="st-menu-admin">Admin tools: events, people, waivers, cards</button>' +
      '<button class="btn btn-secondary" type="button" id="st-menu-out">Sign out</button>' +
      '<p class="err" id="st-err" role="alert"></p>', false);
    document.getElementById('st-menu-count').addEventListener('click', function () {
      this.disabled = true;
      App.api('staffHeadcount', Object.assign({ code: event.code }, staffAuth()))
        .then(function (data) { renderStaff(data); })
        .catch(staffError);
    });
    document.getElementById('st-menu-admin').addEventListener('click', openAdmin);
    document.getElementById('st-menu-out').addEventListener('click', signOut);
  }

  function staffError(error) {
    var err = document.getElementById('st-err');
    if (err) err.textContent = error.message;
    Array.prototype.forEach.call(root.querySelectorAll('button'), function (b) { b.disabled = false; });
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
      '<div class="st-head"><h2>' + esc(data.eventName) + '</h2><button type="button" class="btn btn-secondary st-small" id="st-done">' +
        (staff && staff.token ? 'Back' : 'Done') + '</button></div>' +
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
    document.getElementById('st-done').addEventListener('click', staff && staff.token ? renderStaffMenu : signOut);
    document.getElementById('st-record').addEventListener('submit', recordCount);
    if (staff && staff.name) document.getElementById('st-name').value = staff.name;
    timers.staff = setInterval(refreshStaff, STAFF_REFRESH_MS);
  }

  function refreshStaff() {
    // Don't redraw while someone is typing a head count.
    var form = document.getElementById('st-record');
    var typed = form && Array.prototype.some.call(form.querySelectorAll('input'), function (i) {
      return i.value && !(i.id === 'st-name' && staff && i.value === staff.name);
    });
    if (typed || !staff) return;
    App.api('staffHeadcount', Object.assign({ code: event.code }, staffAuth()))
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
    var input = Object.assign({
      code: event.code,
      staffName: document.getElementById('st-name').value.trim(),
      counted: document.getElementById('st-counted').value.trim(),
      note: document.getElementById('st-note').value.trim()
    }, staffAuth());
    err.textContent = '';
    if (!input.staffName) { err.textContent = 'Enter your name.'; return; }
    if (input.counted === '') { err.textContent = 'Enter the number of people you counted.'; return; }
    button.disabled = true;
    App.api('staffRecordCount', input)
      .then(function (data) { renderStaff(data, data.lastRecorded); })
      .catch(function (error) { err.textContent = error.message; button.disabled = false; });
  }

  /* ── Admin tools ── */

  // The Sheet's admin modal, full screen in a frame. Its server calls
  // (google.script.run in the Sheet) go to the backend under this sign-in.
  var ADMIN_SHIM = '(' + function () {
    function runner(ok, fail) {
      return new Proxy({}, {
        get: function (_, name) {
          if (name === 'withSuccessHandler') return function (f) { return runner(f, fail); };
          if (name === 'withFailureHandler') return function (f) { return runner(ok, f); };
          return function (arg) {
            var bridge = parent.StaffAdmin;
            var call = bridge ? bridge.call(String(name), arg) : Promise.reject(new Error('Signed out.'));
            call.then(function (r) { if (ok) ok(r); }, function (e) { if (fail) fail(e); });
          };
        }
      });
    }
    window.google = { script: { run: runner(null, null) } };
    // Work in the admin tools counts as activity for the iPad's idle reset.
    ['input', 'click', 'touchstart', 'keydown'].forEach(function (t) {
      document.addEventListener(t, function () { parent.dispatchEvent(new Event('staff-activity')); }, true);
    });
  } + ')();';

  function openAdmin() {
    var duringEvent = eventOpen();
    show('admin', '<div class="admin-wrap"><div class="admin-bar">' +
      '<div><strong>HABO 319 Admin</strong> <span class="muted">· ' + esc(staff.name) + '</span></div>' +
      '<button type="button" class="btn btn-secondary st-small" id="ad-back">' + (duringEvent ? 'Back' : 'Sign out') + '</button></div>' +
      '<div class="admin-body" id="ad-body"><p class="muted center admin-loading">Loading admin tools…</p></div></div>', false);
    document.getElementById('ad-back').addEventListener('click', duringEvent ? renderStaffMenu : signOut);
    var token = staff.token;
    window.StaffAdmin = {
      call: function (fn, arg) {
        if (!staff || staff.token !== token) return Promise.reject(new Error('Signed out.'));
        return App.api('admin', { token: token, fn: fn, arg: arg });
      }
    };
    (adminHtml ? Promise.resolve(adminHtml) : App.api('adminPage', { token: token }).then(function (r) { return (adminHtml = r.html); }))
      .then(function (html) {
        var body = document.getElementById('ad-body');
        if (!body || screen !== 'admin') return;
        var frame = document.createElement('iframe');
        frame.className = 'admin-frame';
        frame.title = 'Admin tools';
        frame.srcdoc = html.replace(/<head>/i, function () { return '<head><script>' + ADMIN_SHIM + '<\/script>'; });
        body.textContent = '';
        body.appendChild(frame);
      })
      .catch(function (error) {
        var body = document.getElementById('ad-body');
        if (body) body.innerHTML = '<p class="err admin-loading">' + esc(error.message) + '</p>';
      });
  }

  // Ends any staff sign-in and goes back to check-in.
  function signOut() {
    endStaff();
    route();
  }

  function endStaff() {
    if (staff && staff.token) App.api('staffSignOut', { token: staff.token }).catch(function () {});
    staff = null;
    window.StaffAdmin = null;
  }

  /* ── Kiosk idle reset ── */

  // On the iPad, any screen other than a fresh form goes back to the form
  // after a few idle minutes, so the next person never sees someone else's
  // details or the staff head count.
  function armIdleReset() {
    var reset = function () {
      clearTimeout(timers.idle);
      timers.idle = setTimeout(function () {
        endStaff();
        if (home) location.reload();   // picks up whichever event is open now
        else if (event) route();
      }, KIOSK_IDLE_MS);
    };
    if (!armIdleReset.bound) {
      ['input', 'click', 'touchstart', 'keydown'].forEach(function (t) { document.addEventListener(t, reset, true); });
      window.addEventListener('staff-activity', reset);
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
    if (!event) {
      message('No events right now', 'There is no event coming up for check-in. Please check back later.');
      recheckLater();
      return;
    }
    if (event.status === 'open' || preview) renderForm();
    else {
      message(STATUS[event.status] || 'Check-in closed', statusText());
      recheckLater();
    }
  }

  // The home page looks again every minute while no check-in is open, so it
  // switches to the event by itself when check-in opens.
  function recheckLater() {
    if (home) timers.recheck = setTimeout(function () { location.reload(); }, HOME_RECHECK_MS);
  }

  function load(eventCode) {
    return App.api('getEvent', { code: eventCode, kiosk: kiosk }).then(function (ev) {
      event = ev;
      document.title = ev.name + ' · Check-in';
      route();
    });
  }

  show('loading', '<section class="card"><p class="muted">Loading…</p></section>', false);
  if (!App.isConfigured) { message('Not available', 'Check-in is not set up yet.'); return; }
  if (home) {
    App.api('activeEvent', {})
      .then(function (res) {
        if (res.code) return load(res.code);
        route();
      })
      .catch(function (error) { message('Not available', error.message); recheckLater(); });
  } else {
    load(code).catch(function (error) { message('Event not found', error.message); });
  }
} };
