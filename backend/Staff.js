/**
 * Staff sign-in from the public check-in pages: the small "Staff" link.
 * There are two kinds of code:
 *  - an admin PIN (People tab), for the program's admins. It works any time
 *    and opens the same admin tools as the Sheet's modal, plus the head
 *    count while an event's check-in is open.
 *  - an event's staff code (Events tab), for co-hosts and helpers. It opens
 *    that event's head count, and only while its check-in is open.
 * Signing in with an admin PIN starts a session the browser holds in memory;
 * the PIN itself is never sent back. Wrong codes count toward one shared
 * lockout (5 tries, then 15 minutes).
 */

var SIGNIN_SCOPE = 'signin';
var ADMIN_SESSION_SECONDS = 2 * 60 * 60;   // ends after two idle hours

/* ── Called from the site ── */

// req.pin is what was typed; req.code is the event page it was typed on,
// if any.
function staffSignIn_(req) {
  ensureSchema_();
  requireNotLocked_(SIGNIN_SCOPE);
  var pin = clean_(req.pin, 20);
  var ev = clean_(req.code, 20) ? findEventByCode_(req.code) : null;
  var open = !!ev && checkinWindow_(ev).status === 'open';

  var admin = pin && readAdminPins_().filter(function (a) { return a.active && a.pin === pin; })[0];
  if (admin) {
    var token = Utilities.getUuid();
    CacheService.getScriptCache().put('admin-session:' + token, admin.id, ADMIN_SESSION_SECONDS);
    return { role: 'admin', token: token, name: admin.name, headcount: open ? headcount_(ev) : null };
  }
  if (open && ev.staffCode && pin === ev.staffCode) {
    return { role: 'staff', headcount: headcount_(ev) };
  }
  noteWrongCode_(SIGNIN_SCOPE, open ? 'Wrong code.'
    : "That isn't an admin PIN. Event staff codes only work while check-in is open.");
}

function staffSignOut_(req) {
  if (req.token) CacheService.getScriptCache().remove('admin-session:' + clean_(req.token, 64));
  return { signedOut: true };
}

// The admin tools page (the Sheet's modal), for the site to show in a frame.
function adminPage_(req) {
  requireAdmin_(req.token);
  var template = HtmlService.createTemplateFromFile('AdminModal');
  template.startView = 'events';
  return { html: template.evaluate().getContent() };
}

// Runs one of the admin modal's server functions for a signed-in admin.
function adminCall_(req) {
  requireAdmin_(req.token);
  var fns = {
    adminLoad: adminLoad,
    adminSaveEvent: adminSaveEvent,
    adminSavePerson: adminSavePerson,
    adminSaveWaiver: adminSaveWaiver,
    adminSaveCard: adminSaveCard,
    adminListHeadshots: adminListHeadshots,
    adminListImages: adminListImages,
    adminGetImage: adminGetImage
  };
  if (!Object.prototype.hasOwnProperty.call(fns, req.fn)) throw new Error('Unknown admin function: ' + req.fn);
  return req.arg === undefined ? fns[req.fn]() : fns[req.fn](req.arg);
}

/* ── Sessions ── */

// The signed-in admin, checked against the People tab each time so that
// clearing someone's PIN or marking them inactive ends their sessions.
function requireAdmin_(token) {
  var cache = CacheService.getScriptCache();
  var key = 'admin-session:' + clean_(token, 64);
  var id = token ? cache.get(key) : null;
  var admin = id && readAdminPins_().filter(function (a) { return a.id === id && a.active; })[0];
  if (!admin) {
    if (id) cache.remove(key);
    throw new Error('Your admin sign-in has ended. Tap Staff and enter your PIN again.');
  }
  cache.put(key, id, ADMIN_SESSION_SECONDS);
  return admin;
}
