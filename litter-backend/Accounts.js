/**
 * Litter tracking accounts (S3-P20, items 2 to 6): an account is an email,
 * one account to an email, with no phone (Oct 23, in chat). Setting up sends
 * a code to the email, typed in before the account is made, so the person
 * can get their codes and their waiver copies there. A new phone signs in
 * with a code to the same email. Each account is matched to the volunteer
 * check-in's record by email.
 *
 * A phone or browser that's signed in keeps a random secret, sent with each
 * request; the Devices tab keeps only its fingerprint.
 */

var ACCOUNT_COL = { id: 1, created: 2, first: 3, last: 4, email: 5, handle: 6, shows: 7, adult: 8, signed: 9,
  waiver: 10, waiverPrint: 11, signedName: 12, signature: 13, volunteer: 14, updated: 15, status: 16 };
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

// Sets up an account, with the waiver signed. Sent first with no code: it
// checks everything and emails a code. Sent again with the code: it makes
// the account, signs this phone in, and emails a copy of the waiver.
function setUp_(req) {
  ensureSchema_();
  var a = validateAccount_(req);
  if (req.adult !== true) throw new Error('Accounts are for people 18 or older. A family collects under a parent\'s account.');
  var w = requireWaiverSigned_(req);
  var signature = signatureBytes_(req.signature);
  requireUnique_(readAccounts_(), a, '');
  var scope = 'setup:' + digestHex_(a.email).slice(0, 24);
  if (!String(req.code || '').trim()) {
    return Object.assign(sendCode_(scope, a.email, a.first, 'to finish setting up your account'), { needsCode: true });
  }
  checkCode_(scope, req.code);
  var volunteer = findVolunteer_(a);   // opens the check-in's Sheet, so before taking the lock

  var made = withLock_(function () {
    var accounts = readAccounts_();
    requireUnique_(accounts, a, '');
    var id = nextId_('A', accounts.map(function (x) { return x.id; }));
    var name = a.first + ' ' + a.last;
    var now = new Date();
    var row = [];
    row[ACCOUNT_COL.id - 1] = id;
    row[ACCOUNT_COL.created - 1] = now;
    row[ACCOUNT_COL.first - 1] = safeCell_(a.first);
    row[ACCOUNT_COL.last - 1] = safeCell_(a.last);
    row[ACCOUNT_COL.email - 1] = safeCell_(a.email);
    row[ACCOUNT_COL.handle - 1] = a.handle;
    row[ACCOUNT_COL.shows - 1] = a.shows;
    row[ACCOUNT_COL.adult - 1] = 'Yes';
    row[ACCOUNT_COL.volunteer - 1] = volunteer;
    row[ACCOUNT_COL.updated - 1] = now;
    row[ACCOUNT_COL.status - 1] = 'Active';
    var sheet = getDb_().getSheetByName(TABS.accounts.name);
    var at = lastRowWith_(sheet, ACCOUNT_COL.id) + 1;
    sheet.getRange(at, 1, 1, TABS.accounts.header.length).setValues([TABS.accounts.header.map(function (h, i) { return row[i] == null ? '' : row[i]; })]);
    logChange_(name, 'Set up', id + ' ' + a.handle, 'Account', '', a.email);
    if (volunteer) logChange_(name, 'Matched', id + ' ' + a.handle, 'Check-in volunteer', '', volunteer);
    var account = readAccounts_().filter(function (x) { return x.id === id; })[0];
    var signing = recordSignature_(account, w, signature, now);
    return { account: account, signing: signing, token: newDevice_(id, 'Set up', now) };
  });
  var copy = emailWaiverCopy_(made.account, made.signing);
  return { token: made.token, account: accountView_(readAccounts_().filter(function (x) { return x.id === made.account.id; })[0]), copySent: copy.ok };
}

// Signs the waiver's new words (Oct 23, in chat): asked for the next time
// someone opens the page after the words change, before anything else.
function signWaiver_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var w = requireWaiverSigned_(req);
  var signature = signatureBytes_(req.signature);
  var signing = withLock_(function () { return recordSignature_(account, w, signature, new Date()); });
  var copy = emailWaiverCopy_(account, signing);
  return { account: accountView_(readAccounts_().filter(function (x) { return x.id === account.id; })[0]), copySent: copy.ok };
}

// On a new phone: the email typed. A code is sent to it.
function signInStart_(req) {
  ensureSchema_();
  var account = accountByEmail_(req.email);
  return Object.assign(sendCode_('account:' + account.id, account.email, account.first, 'to sign in on your new phone'), { needsCode: true });
}

// The code from the email, typed in: signs this phone in.
function signInCode_(req) {
  ensureSchema_();
  var account = accountByEmail_(req.email);
  checkCode_('account:' + account.id, req.code);
  return withLock_(function () {
    return { token: newDevice_(account.id, 'Code by email', new Date()), account: accountView_(rematch_(account)) };
  });
}

// Changes the account page's name, handle and what the map shows (Q265).
function updateMe_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  requireCurrentWaiver_(account);
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
      row: i + 2, id: get('id'), first: get('first'), last: get('last'), email: get('email').toLowerCase(),
      handle: get('handle'), shows: get('shows'), signed: get('signed'), waiver: get('waiver'), waiverPrint: get('waiverPrint'),
      volunteer: get('volunteer'), created: get('created'), rank: rankOf_(get('status')), active: get('status') === 'Active' || !!rankOf_(get('status'))
    };
  }).filter(function (a) { return a.id; });
}

// An administrator's rank, typed by hand in the Status column instead of
// Active (S5-U2, M504): the ranks on S3-P30. A rank counts as Active.
var RANKS = ['Apprentice', 'Builder', 'Architect', 'Head Builder'];
function rankOf_(status) {
  return RANKS.indexOf(String(status || '').trim()) >= 0 ? String(status).trim() : '';
}

// What the page gets of an account.
function accountView_(a) {
  var w = currentWaiver_();
  return {
    id: a.id, firstName: a.first, lastName: a.last, email: a.email, handle: a.handle, mapShows: a.shows,
    created: a.created, waiverSigned: a.signed, waiverTitle: a.waiver, waiverCurrent: !!w.fingerprint && a.waiverPrint === w.fingerprint,
    matched: !!a.volunteer, rank: a.rank || ''
  };
}

function validateAccount_(req) {
  var a = {
    first: clean_(req.firstName, 60).replace(/\s+/g, ' '),
    last: clean_(req.lastName, 60).replace(/\s+/g, ' '),
    email: clean_(req.email, 200).toLowerCase(),
    handle: clean_(req.handle, 40),
    shows: MAP_SHOWS.indexOf(req.mapShows) === -1 ? 'Handle' : req.mapShows
  };
  if (!a.first || !a.last) throw new Error('Please enter your first and last name.');
  if (!a.email) throw new Error('Please enter your email. Your codes and your copy of the waiver come there.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(a.email)) throw new Error('That email address looks incomplete.');
  if (!HANDLE_RULE.test(a.handle)) throw new Error(handleRuleWords_());
  return a;
}

function handleRuleWords_() {
  return 'A handle is 3 to 24 letters and numbers, starting with one of them. It can have dots, dashes and underscores, but no spaces.';
}

// No two accounts share a handle (Q258), and no two open accounts share an
// email, so a new phone always finds the one account.
function requireUnique_(accounts, a, ownId) {
  // The email first: someone setting up again is pointed to signing in.
  var others = accounts.filter(function (x) { return x.id !== ownId; });
  if (others.some(function (x) { return x.active && x.email === a.email; })) {
    throw coded_('has-account', 'An account already uses that email. To use it on this phone, press Back, then I already have an account.');
  }
  if (others.some(function (x) { return x.handle.toLowerCase() === a.handle.toLowerCase(); })) {
    throw new Error('Someone already has that handle. Try another.');
  }
}

// The open account with this email.
function accountByEmail_(email) {
  var text = clean_(email, 200).toLowerCase();
  if (!text) throw new Error('Please enter your email.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text)) throw new Error('That email address looks incomplete.');
  var found = readAccounts_().filter(function (a) { return a.active && a.email === text; })[0];
  if (!found) throw coded_('no-account', 'No account has that email. Check it, or press Back to set one up.');
  return found;
}

/* ── The waiver, signed ── */

// The waiver the page showed, agreed to: it must still be the words now.
function requireWaiverSigned_(req) {
  var w = currentWaiver_();
  if (!w.text) throw new Error('The waiver isn\'t ready yet, so it can\'t be signed. Please try again later.');
  if (String(req.waiverPrint || '') !== w.fingerprint) {
    throw coded_('waiver-changed', 'The waiver\'s words changed while you were reading. Read it again, then sign.');
  }
  if (req.agree !== true) throw new Error('Please agree to the waiver.');
  return w;
}

// Nothing else on the page until the waiver's new words are signed.
function requireCurrentWaiver_(account) {
  if (!accountView_(account).waiverCurrent) throw coded_('waiver-new', 'The waiver has been updated. You must acknowledge and sign the new version.');
}

/* ── The check-in's volunteer record (item 4), read only ── */

// The check-in volunteer with the same email. When more than one has it (a
// family sharing an email), the one with the same name; when none of them
// has the same name, no match yet.
function findVolunteer_(a) {
  if (!a.email) return '';
  var rows;
  try {
    var link = getSetting_(SETTING_CHECKIN_SHEET).trim();
    var sheet = SpreadsheetApp.openById(driveId_(link)).getSheetByName('Volunteers');
    var last = sheet ? sheet.getLastRow() : 0;
    rows = last > 1 ? sheet.getRange(2, 1, last - 1, 4).getDisplayValues() : [];
  } catch (err) {
    console.warn('The check-in\'s Sheet couldn\'t be read: ' + err);
    return '';
  }
  var lower = function (s) { return String(s).trim().replace(/\s+/g, ' ').toLowerCase(); };
  var same = rows.filter(function (r) { return String(r[0]).trim() && lower(r[3]) === a.email; });
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

/* ── Codes by email ── */

// Emails a new code for `scope` (setting up an email, or signing in to an
// account), at most 5 an hour. The code is kept only as a fingerprint.
function sendCode_(scope, email, first, why) {
  var cache = CacheService.getScriptCache();
  var sendsKey = 'code-sends:' + scope;
  var hourAgo = Date.now() - 3600 * 1000;
  var sends = JSON.parse(cache.get(sendsKey) || '[]').filter(function (t) { return t > hourAgo; });
  if (sends.length >= MAX_CODES_AN_HOUR) {
    throw new Error('We\'ve sent ' + MAX_CODES_AN_HOUR + ' codes in the last hour. Use the newest one, or try again later.');
  }
  var code = newCode_();
  var plain = 'Hi ' + first + ',\n\n' +
    'Your code is ' + code + '. Type it on HABO\'s litter page ' + why + '. It works for ' + CODE_MINUTES + ' minutes.\n\n' +
    'If you didn\'t ask for it, you can ignore this email: no one can use it without the code.\n\n' +
    'Help A Brother Out Foundation';
  var html = '<p>Hi ' + htmlEscape_(first) + ',</p>' +
    '<p>Your code is <b style="font-size:20px;letter-spacing:2px">' + code + '</b>. Type it on HABO\'s litter page ' + why + '. ' +
    'It works for ' + CODE_MINUTES + ' minutes.</p>' +
    '<p>If you didn\'t ask for it, you can ignore this email: no one can use it without the code.</p>' +
    '<p>Help A Brother Out Foundation</p>';
  var sent = sendMail_(email, code + ' is your HABO litter page code', plain, html, null);
  if (!sent.ok) throw new Error('The code couldn\'t be sent just now (' + sent.why + '). Please try again in a few minutes.');
  cache.put('code:' + scope, digestHex_(code), CODE_MINUTES * 60);
  sends.push(Date.now());
  cache.put(sendsKey, JSON.stringify(sends), 3600);
  return { sentTo: maskEmail_(email), minutes: CODE_MINUTES };
}

// Checks a typed code for `scope`; it works once. Wrong codes lock out
// after 5 tries for 15 minutes.
function checkCode_(scope, typed) {
  requireNotLocked_(scope);
  var code = String(typed || '').replace(/\D/g, '');
  var cache = CacheService.getScriptCache();
  var want = cache.get('code:' + scope);
  if (!want) throw coded_('code-expired', 'That code has run out. Press Send a new code.');
  if (code.length !== 6 || digestHex_(code) !== want) noteWrongCode_(scope, 'That code isn\'t right. Check the email and try again.');
  cache.remove('code:' + scope);
  cache.remove('code-fails:' + scope);
}

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
