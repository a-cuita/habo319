/**
 * Litter tracking accounts (S3-P20, items 2 to 6): set up once, with the
 * waiver signed; matched to the volunteer check-in's record by email or
 * phone; and signed in on a new phone with a code by email, or right away
 * for an account with only a phone (Q281).
 *
 * A phone or browser that's signed in keeps a random secret, sent with each
 * request; the Devices tab keeps only its fingerprint.
 */

var ACCOUNT_COL = { id: 1, created: 2, first: 3, last: 4, email: 5, phone: 6, handle: 7, shows: 8, adult: 9, signed: 10,
  waiver: 11, waiverPrint: 12, signedName: 13, signature: 14, volunteer: 15, updated: 16, status: 17 };
var DEVICE_COL = { id: 1, account: 2, secret: 3, at: 4, used: 5, how: 6, ended: 7 };

// What the public map shows for an account (Q244, Q259, Q318). The map
// itself comes in step 3.
var MAP_SHOWS = ['Handle', 'Name', 'Neither'];
var HANDLE_RULE = /^[A-Za-z0-9][A-Za-z0-9_.\-]{2,23}$/;

var CODE_MINUTES = 10;
var MAX_CODES_AN_HOUR = 5;

/* ── Called from the page ── */

// The first call when the page opens: the waiver, and the account this
// phone is signed in to, if it is.
function start_(req) {
  ensureSchema_();
  var out = { waiver: currentWaiver_(), mapShows: MAP_SHOWS, account: null, signedOut: false };
  if (req.token) {
    var found = deviceAccount_(req.token);
    if (found) out.account = accountView_(rematch_(found.account));
    else out.signedOut = true;
  }
  return out;
}

// Whether no one else has a handle yet, while it's being typed.
function handleFree_(req) {
  ensureSchema_();
  var handle = clean_(req.handle, 40);
  if (!HANDLE_RULE.test(handle)) return { free: false, why: handleRuleWords_() };
  var mine = req.token ? deviceAccount_(req.token) : null;
  var taken = readAccounts_().some(function (a) {
    return a.handle.toLowerCase() === handle.toLowerCase() && (!mine || a.id !== mine.account.id);
  });
  return { free: !taken, why: taken ? 'Someone already has that handle. Try another.' : '' };
}

// Sets up an account, with the waiver signed, and signs this phone in.
function setUp_(req) {
  ensureSchema_();
  var a = validateAccount_(req);
  if (req.adult !== true) throw new Error('Accounts are for people 18 or older. A family collects under a parent\'s account.');
  var w = currentWaiver_();
  if (!w.text) throw new Error('The waiver isn\'t ready yet, so accounts can\'t be set up. Please try again later.');
  if (String(req.waiverPrint || '') !== w.fingerprint) {
    throw coded_('waiver-changed', 'The waiver\'s words changed while you were reading. Read it again, then sign.');
  }
  if (req.agree !== true) throw new Error('Please agree to the waiver to set up your account.');
  var signature = signatureBytes_(req.signature);
  var volunteer = findVolunteer_(a);   // opens the check-in's Sheet, so before taking the lock

  return withLock_(function () {
    var accounts = readAccounts_();
    requireUnique_(accounts, a, '');
    var id = nextId_('A', accounts.map(function (x) { return x.id; }));
    var name = a.first + ' ' + a.last;
    var link = saveSignature_(id, name, signature);
    var now = new Date();
    var row = [];
    row[ACCOUNT_COL.id - 1] = id;
    row[ACCOUNT_COL.created - 1] = now;
    row[ACCOUNT_COL.first - 1] = safeCell_(a.first);
    row[ACCOUNT_COL.last - 1] = safeCell_(a.last);
    row[ACCOUNT_COL.email - 1] = safeCell_(a.email);
    row[ACCOUNT_COL.phone - 1] = a.phone;
    row[ACCOUNT_COL.handle - 1] = safeCell_(a.handle);
    row[ACCOUNT_COL.shows - 1] = a.shows;
    row[ACCOUNT_COL.adult - 1] = 'Yes';
    row[ACCOUNT_COL.signed - 1] = now;
    row[ACCOUNT_COL.waiver - 1] = safeCell_(w.title);
    row[ACCOUNT_COL.waiverPrint - 1] = w.fingerprint;
    row[ACCOUNT_COL.signedName - 1] = safeCell_(name);
    row[ACCOUNT_COL.signature - 1] = link;
    row[ACCOUNT_COL.volunteer - 1] = volunteer;
    row[ACCOUNT_COL.updated - 1] = now;
    row[ACCOUNT_COL.status - 1] = 'Active';
    var sheet = getDb_().getSheetByName(TABS.accounts.name);
    sheet.getRange(lastRowWith_(sheet, ACCOUNT_COL.id) + 1, 1, 1, row.length).setValues([row]);
    logChange_(name, 'Set up', id + ' ' + a.handle, 'Account', '', [a.email, a.phone].filter(String).join(', '));
    if (volunteer) logChange_(name, 'Matched', id + ' ' + a.handle, 'Check-in volunteer', '', volunteer);
    var account = readAccounts_().filter(function (x) { return x.id === id; })[0];
    return { token: newDevice_(id, 'Set up', now), account: accountView_(account) };
  });
}

// On a new phone: the email or phone typed. An account with an email is
// sent a code to type in; one with only a phone is signed in now (Q281).
function signInStart_(req) {
  ensureSchema_();
  var account = accountByContact_(req.contact);
  if (!account.email) {
    return withLock_(function () {
      return { token: newDevice_(account.id, 'Phone, no code', new Date()), account: accountView_(rematch_(account)) };
    });
  }
  var cache = CacheService.getScriptCache();
  var sendsKey = 'code-sends:' + account.id;
  var hourAgo = Date.now() - 3600 * 1000;
  var sends = JSON.parse(cache.get(sendsKey) || '[]').filter(function (t) { return t > hourAgo; });
  if (sends.length >= MAX_CODES_AN_HOUR) {
    throw new Error('We\'ve sent ' + MAX_CODES_AN_HOUR + ' codes in the last hour. Use the newest one, or try again later.');
  }
  var code = newCode_();
  var sent = sendCode_(account, code);
  if (!sent.ok) throw new Error('The code couldn\'t be sent just now (' + sent.why + '). Please try again in a few minutes.');
  cache.put('code:' + account.id, digestHex_(code), CODE_MINUTES * 60);
  sends.push(Date.now());
  cache.put(sendsKey, JSON.stringify(sends), 3600);
  return { needsCode: true, sentTo: maskEmail_(account.email), minutes: CODE_MINUTES };
}

// The code from the email, typed in: signs this phone in.
function signInCode_(req) {
  ensureSchema_();
  var account = accountByContact_(req.contact);
  var scope = 'account:' + account.id;
  requireNotLocked_(scope);
  var code = String(req.code || '').replace(/\D/g, '');
  var cache = CacheService.getScriptCache();
  var want = cache.get('code:' + account.id);
  if (!want) throw coded_('code-expired', 'That code has run out. Press Send a new code.');
  if (code.length !== 6 || digestHex_(code) !== want) noteWrongCode_(scope, 'That code isn\'t right. Check the email and try again.');
  cache.remove('code:' + account.id);
  cache.remove('code-fails:' + scope);
  return withLock_(function () {
    return { token: newDevice_(account.id, 'Code by email', new Date()), account: accountView_(rematch_(account)) };
  });
}

// Changes the account page's name, handle and what the map shows (Q265).
function updateMe_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var next = {
    first: clean_(req.firstName, 60).replace(/\s+/g, ' '),
    last: clean_(req.lastName, 60).replace(/\s+/g, ' '),
    handle: clean_(req.handle, 40),
    shows: MAP_SHOWS.indexOf(req.mapShows) === -1 ? '' : req.mapShows
  };
  if (!next.first || !next.last) throw new Error('Please enter your first and last name.');
  if (!HANDLE_RULE.test(next.handle)) throw new Error(handleRuleWords_());
  if (!next.shows) throw new Error('Please pick what the map shows.');
  return withLock_(function () {
    var accounts = readAccounts_();
    var now = accounts.filter(function (x) { return x.id === account.id; })[0];
    if (accounts.some(function (x) { return x.id !== now.id && x.handle.toLowerCase() === next.handle.toLowerCase(); })) {
      throw new Error('Someone already has that handle. Try another.');
    }
    var sheet = getDb_().getSheetByName(TABS.accounts.name);
    var who = now.first + ' ' + now.last;
    var changed = false;
    [['first', 'First name'], ['last', 'Last name'], ['handle', 'Handle'], ['shows', 'Map shows']].forEach(function (f) {
      if (next[f[0]] === now[f[0]]) return;
      sheet.getRange(now.row, ACCOUNT_COL[f[0]]).setValue(safeCell_(next[f[0]]));
      logChange_(who, 'Changed', now.id + ' ' + now.handle, f[1], now[f[0]], next[f[0]]);
      changed = true;
    });
    if (changed) sheet.getRange(now.row, ACCOUNT_COL.updated).setValue(new Date());
    return accountView_(readAccounts_().filter(function (x) { return x.id === account.id; })[0]);
  });
}

// Signs this phone out. Its secret is no good after this.
function signOut_(req) {
  ensureSchema_();
  var found = req.token ? deviceAccount_(req.token) : null;
  if (!found) return { signedOut: true };
  withLock_(function () {
    getDb_().getSheetByName(TABS.devices.name).getRange(found.row, DEVICE_COL.ended).setValue(new Date());
  });
  return { signedOut: true };
}

/* ── Accounts ── */

// Every account, with its row in the Sheet.
function readAccounts_() {
  var sheet = getDb_().getSheetByName(TABS.accounts.name);
  var last = lastRowWith_(sheet, ACCOUNT_COL.id);
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, TABS.accounts.header.length).getDisplayValues().map(function (r, i) {
    var get = function (k) { return String(r[ACCOUNT_COL[k] - 1]).trim(); };
    return {
      row: i + 2, id: get('id'), first: get('first'), last: get('last'), email: get('email').toLowerCase(), phone: get('phone'),
      handle: get('handle'), shows: get('shows'), signed: get('signed'), waiver: get('waiver'), waiverPrint: get('waiverPrint'),
      volunteer: get('volunteer'), created: get('created'), active: get('status') === 'Active'
    };
  }).filter(function (a) { return a.id; });
}

// What the page gets of an account.
function accountView_(a) {
  var w = currentWaiver_();
  return {
    id: a.id, firstName: a.first, lastName: a.last, email: a.email, phone: a.phone, handle: a.handle, mapShows: a.shows,
    created: a.created, waiverSigned: a.signed, waiverTitle: a.waiver, waiverCurrent: a.waiverPrint === w.fingerprint,
    matched: !!a.volunteer
  };
}

function validateAccount_(req) {
  var a = {
    first: clean_(req.firstName, 60).replace(/\s+/g, ' '),
    last: clean_(req.lastName, 60).replace(/\s+/g, ' '),
    email: clean_(req.email, 200).toLowerCase(),
    phone: '',
    handle: clean_(req.handle, 40),
    shows: MAP_SHOWS.indexOf(req.mapShows) === -1 ? 'Handle' : req.mapShows
  };
  var digits = normalizePhone_(req.phone);
  if (!a.first || !a.last) throw new Error('Please enter your first and last name.');
  if (!a.email && !digits) throw new Error('Please enter your email or phone number.');
  if (a.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) throw new Error('That email address looks incomplete.');
  if (clean_(req.phone, 40) && (digits.length < 7 || digits.length > 15)) throw new Error('That phone number looks incomplete.');
  if (!HANDLE_RULE.test(a.handle)) throw new Error(handleRuleWords_());
  a.phone = formatPhone_(digits);
  return a;
}

function handleRuleWords_() {
  return 'A handle is 3 to 24 letters and numbers, starting with one of them. It can have dots, dashes and underscores, but no spaces.';
}

// No two accounts share a handle (Q258), and no two open accounts share an
// email or a phone, so a new phone always finds the one account.
function requireUnique_(accounts, a, ownId) {
  var others = accounts.filter(function (x) { return x.id !== ownId; });
  if (others.some(function (x) { return x.handle.toLowerCase() === a.handle.toLowerCase(); })) {
    throw new Error('Someone already has that handle. Try another.');
  }
  var open = others.filter(function (x) { return x.active; });
  if (a.email && open.some(function (x) { return x.email === a.email; })) {
    throw coded_('has-account', 'An account already uses that email. To use it on this phone, press Back, then I already have an account.');
  }
  var digits = normalizePhone_(a.phone);
  if (digits && open.some(function (x) { return normalizePhone_(x.phone) === digits; })) {
    throw coded_('has-account', 'An account already uses that phone number. To use it on this phone, press Back, then I already have an account.');
  }
}

// The open account with this email or phone.
function accountByContact_(contact) {
  var text = clean_(contact, 200);
  if (!text) throw new Error('Please enter your email or phone number.');
  var email = text.indexOf('@') !== -1 ? text.toLowerCase() : '';
  var digits = email ? '' : normalizePhone_(text);
  if (!email && digits.length < 7) throw new Error('That doesn\'t look like an email or a phone number.');
  var found = readAccounts_().filter(function (a) {
    return a.active && (email ? a.email === email : normalizePhone_(a.phone) === digits);
  })[0];
  if (!found) throw coded_('no-account', 'No account has that ' + (email ? 'email' : 'phone number') + '. Check it, or press Back to set one up.');
  return found;
}

// Digits only, without a leading US country code (as at the check-in).
function normalizePhone_(phone) {
  var d = String(phone || '').replace(/\D/g, '');
  return d.length === 11 && d.charAt(0) === '1' ? d.slice(1) : d;
}

function formatPhone_(digits) {
  return digits.length === 10 ? '(' + digits.slice(0, 3) + ') ' + digits.slice(3, 6) + '-' + digits.slice(6) : digits;
}

/* ── The check-in's volunteer record (item 4), read only ── */

// The check-in volunteer with the same email or phone. When more than one
// has it (a family sharing a phone), the one with the same name; when none
// of them has the same name, no match yet.
function findVolunteer_(a) {
  var digits = normalizePhone_(a.phone);
  if (!a.email && !digits) return '';
  var rows;
  try {
    var link = getSetting_(SETTING_CHECKIN_SHEET).trim();
    var sheet = SpreadsheetApp.openById(driveId_(link)).getSheetByName('Volunteers');
    var last = sheet ? sheet.getLastRow() : 0;
    rows = last > 1 ? sheet.getRange(2, 1, last - 1, 5).getDisplayValues() : [];
  } catch (err) {
    console.warn('The check-in\'s Sheet couldn\'t be read: ' + err);
    return '';
  }
  var lower = function (s) { return String(s).trim().replace(/\s+/g, ' ').toLowerCase(); };
  var same = rows.filter(function (r) {
    if (!String(r[0]).trim()) return false;
    return (a.email && lower(r[3]) === a.email) || (digits && normalizePhone_(r[4]) === digits);
  });
  var named = same.filter(function (r) { return lower(r[1]) === lower(a.first) && lower(r[2]) === lower(a.last); });
  var pick = named.length === 1 ? named[0] : !named.length && same.length === 1 ? same[0] : null;
  return pick ? String(pick[0]).trim() : '';
}

// An account with no match yet tries again, at most twice an hour, so one
// that checks in at an event later is matched then (item 4).
function rematch_(account) {
  if (account.volunteer) return account;
  var cache = CacheService.getScriptCache();
  var key = 'rematch:' + account.id;
  if (cache.get(key)) return account;
  cache.put(key, '1', 1800);
  var volunteer = findVolunteer_(account);
  if (!volunteer) return account;
  withLock_(function () {
    var sheet = getDb_().getSheetByName(TABS.accounts.name);
    sheet.getRange(account.row, ACCOUNT_COL.volunteer).setValue(volunteer);
    logChange_(account.first + ' ' + account.last, 'Matched', account.id + ' ' + account.handle, 'Check-in volunteer', '', volunteer);
  });
  account.volunteer = volunteer;
  return account;
}

/* ── Signed-in phones ── */

// Signs a phone in to an account: a new secret, kept on the phone, and its
// fingerprint, kept here. Call while holding the lock.
function newDevice_(accountId, how, now) {
  var secret = (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '');
  var sheet = getDb_().getSheetByName(TABS.devices.name);
  var last = lastRowWith_(sheet, DEVICE_COL.id);
  var ids = last > 1 ? sheet.getRange(2, 1, last - 1, 1).getDisplayValues().map(function (r) { return r[0]; }) : [];
  sheet.getRange(last + 1, 1, 1, 7).setValues([[nextId_('D', ids), accountId, digestHex_(secret), now, now, how, '']]);
  return secret;
}

// The open account a phone's secret is signed in to, or null.
function deviceAccount_(token) {
  var print = digestHex_(String(token));
  var sheet = getDb_().getSheetByName(TABS.devices.name);
  var last = lastRowWith_(sheet, DEVICE_COL.id);
  if (last < 2) return null;
  var rows = sheet.getRange(2, 1, last - 1, 7).getValues();
  for (var i = 0; i < rows.length; i++) {
    var r = rows[i];
    if (String(r[DEVICE_COL.secret - 1]) !== print || String(r[DEVICE_COL.ended - 1]).trim()) continue;
    var account = readAccounts_().filter(function (a) { return a.id === String(r[DEVICE_COL.account - 1]).trim() && a.active; })[0];
    if (!account) return null;
    // Last used, kept to the hour or so, to save writes.
    var used = r[DEVICE_COL.used - 1];
    if (!(used instanceof Date) || Date.now() - used.getTime() > 3600 * 1000) sheet.getRange(i + 2, DEVICE_COL.used).setValue(new Date());
    return { row: i + 2, account: account };
  }
  return null;
}

function requireAccount_(token) {
  var found = token ? deviceAccount_(token) : null;
  if (!found) throw coded_('signed-out', 'This phone isn\'t signed in anymore. Sign in again.');
  return found.account;
}

/* ── The code email ── */

// Six digits, from a random id rather than Math.random.
function newCode_() {
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid());
  var n = ((bytes[0] & 0xff) * 65536 + (bytes[1] & 0xff) * 256 + (bytes[2] & 0xff)) % 1000000;
  return ('00000' + n).slice(-6);
}

function maskEmail_(email) {
  var at = email.indexOf('@');
  return email.charAt(0) + '•••' + email.slice(at);
}

// Sends the code from HABO's address (Q384 (a)): { ok } or { ok: false, why }.
function sendCode_(account, code) {
  var from = getSetting_(SETTING_CODE_FROM).trim() || DEFAULT_CODE_FROM;
  var subject = code + ' is your HABO litter page code';
  var plain = 'Hi ' + account.first + ',\n\n' +
    'Your code is ' + code + '. Type it on HABO\'s litter page to sign in on your new phone. It works for ' + CODE_MINUTES + ' minutes.\n\n' +
    'If you didn\'t ask for it, you can ignore this email: no one can sign in without the code.\n\n' +
    'Help A Brother Out Foundation';
  var html = '<p>Hi ' + htmlEscape_(account.first) + ',</p>' +
    '<p>Your code is <b style="font-size:20px;letter-spacing:2px">' + code + '</b>. Type it on HABO\'s litter page to sign in on your new phone. ' +
    'It works for ' + CODE_MINUTES + ' minutes.</p>' +
    '<p>If you didn\'t ask for it, you can ignore this email: no one can sign in without the code.</p>' +
    '<p>Help A Brother Out Foundation</p>';
  try {
    Gmail.Users.Messages.send({ raw: mimeMessage_(from, account.email, subject, plain, html) }, 'me');
    return { ok: true };
  } catch (e) {
    console.error(e);
    return { ok: false, why: String((e && e.message) || e).replace(/^.*?failed with error:\s*/, '') };
  }
}

// The email as Gmail's API takes it: a MIME message, plain and formatted.
function mimeMessage_(from, to, subject, plain, html) {
  var b = 'habo' + Utilities.getUuid().replace(/-/g, '');
  var word = function (s) { return '=?UTF-8?B?' + Utilities.base64Encode(s, Utilities.Charset.UTF_8) + '?='; };
  var b64 = function (s) { return Utilities.base64Encode(s, Utilities.Charset.UTF_8).replace(/(.{76})/g, '$1\r\n'); };
  var mime = ['From: ' + word('Help A Brother Out Foundation') + ' <' + from + '>', 'To: ' + to, 'Subject: ' + word(subject),
    'MIME-Version: 1.0', 'Content-Type: multipart/alternative; boundary="' + b + '"', '',
    '--' + b, 'Content-Type: text/plain; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(plain),
    '--' + b, 'Content-Type: text/html; charset=UTF-8', 'Content-Transfer-Encoding: base64', '', b64(html),
    '--' + b + '--', ''].join('\r\n');
  return Utilities.base64EncodeWebSafe(mime);
}

function htmlEscape_(s) {
  return String(s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; });
}
