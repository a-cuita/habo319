/**
 * The litter page's own waiver (S3-P20, Q383 (b)): signed while setting up
 * an account, before the first collection (Q280), and again whenever its
 * words change (Oct 23, in chat). Its words are the Settings tab's "Waiver
 * title" and "Waiver text", changed from the invoicing app's Litter screen
 * (Q163) or by hand. Each signature is kept with a fingerprint of the exact
 * words shown, as at the check-in, and the person is emailed a copy.
 *
 * The words below are only where it starts: the draft on S3-P20, under
 * Q383, for Jeremy to change, and for an Alabama attorney or HABO's insurer
 * to read before the page goes public.
 */

var SEED_WAIVER_TITLE = 'HABO Litter Collection: Waiver and Release';

var SEED_WAIVER_TEXT = [
  'Read this before you set up your account. It covers every collection you make with HABO\'s litter page. If its words change, you\'ll be asked to sign the new ones, and you\'re emailed a copy each time you sign.',
  '',
  '1. What this covers. I choose to collect litter on my own, or with people I bring, using HABO\'s litter page, at times and places I pick. When I collect this way, no one from Help A Brother Out Foundation ("HABO") is there to supervise me.',
  '',
  '2. Safety rules I\'ll follow.',
  '- I stay out of traffic: off roadways, highway medians, ramps and bridges, and off steep or unstable slopes and stream banks. Near traffic, I face oncoming cars and wear a bright safety vest.',
  '- I wear gloves and closed-toe shoes, and use a grabber when I have one.',
  '- I don\'t pick up needles or syringes, broken glass by hand, chemicals, batteries, sharp metal I can\'t handle safely, dead animals or waste. I leave them where they are and report them on the litter page.',
  '- I don\'t go onto private property without the owner\'s permission.',
  '- I collect in daylight only. The page won\'t start a collection from 15 minutes before sunset.',
  '- I stop to use my phone, and never use it while walking near traffic.',
  '- I watch for heat, weather, insects, snakes and poison ivy; I drink water, rest, and stop if I feel unwell.',
  '- Anyone under 18 who collects with me stays with me, follows these rules, and doesn\'t handle sharp or hazardous items. I\'m responsible for them.',
  '',
  '3. The risks. I understand that collecting litter has risks that can\'t all be removed, including being hit by a vehicle; cuts, punctures and needle-sticks; germs, chemicals and other harmful substances; slips, trips and falls; heat illness and bad weather; bites and stings; and encounters with other people.',
  '',
  '4. I take part by choice. I\'m a volunteer: I\'m not paid, I\'m not HABO\'s employee, and I\'m not covered by workers\' compensation. I accept the risks of my own collecting.',
  '',
  '5. Release. As far as the law allows, I release Help A Brother Out Foundation, its directors, officers, staff, volunteers, partners and sponsors from any claim for injury, illness, death or damage to property that comes from my litter collecting, including claims from their ordinary negligence. This release doesn\'t cover willful or wanton misconduct.',
  '',
  '6. Emergencies. In an emergency, I call 911. I\'m responsible for my own medical care and its cost.',
  '',
  '7. Photos. Photos I add are reviewed by HABO\'s staff before they reach the public map. I won\'t photograph people, license plates or the inside of homes without permission.',
  '',
  '8. Age. I\'m 18 or older.',
  '',
  '9. My signature. I\'ve read this, I understand it, and I\'m signing it freely. My signature, with my typed name and the date, is my agreement, and it covers every collection I make until I sign newer words.'
].join('\n');

var MAX_SIGNATURE_BYTES = 200 * 1024;

// The waiver as the page shows it: its title, its words and their fingerprint.
function currentWaiver_() {
  var title = getSetting_(SETTING_WAIVER_TITLE).trim();
  var text = getSetting_(SETTING_WAIVER_TEXT).replace(/\r\n?/g, '\n').trim();
  return { title: title, text: text, fingerprint: text ? fingerprint_(title + '\n' + text) : '' };
}

// The signature drawn on the page, sent as a PNG data URL.
function signatureBytes_(dataUrl) {
  var m = /^data:image\/png;base64,([A-Za-z0-9+\/=]+)$/.exec(String(dataUrl || ''));
  if (!m) throw new Error('Please sign with your finger in the signature box.');
  var bytes = Utilities.base64Decode(m[1]);
  var isPng = bytes.length > 8 && bytes[1] === 80 && bytes[2] === 78 && bytes[3] === 71;
  if (!isPng || bytes.length > MAX_SIGNATURE_BYTES) throw new Error('That signature couldn\'t be saved. Clear it and sign again.');
  return bytes;
}

// Records one signing, setting up or signing new words: the drawn
// signature saved in Drive, a row on Waiver Signatures, and the account's
// latest signing. Call while holding the lock.
function recordSignature_(account, w, bytes, now) {
  var name = account.first + ' ' + account.last;
  var link = saveSignature_(account.id, name, bytes, now);
  var sheet = getDb_().getSheetByName(TABS.signatures.name);
  var row = lastRowWith_(sheet, 2) + 1;
  sheet.getRange(row, 1, 1, 9).setValues([[now, account.id, safeCell_(name), safeCell_(account.email), safeCell_(w.title), w.fingerprint,
    safeCell_(name), link, '']]);
  var accounts = getDb_().getSheetByName(TABS.accounts.name);
  accounts.getRange(account.row, ACCOUNT_COL.signed, 1, 5).setValues([[now, safeCell_(w.title), w.fingerprint, safeCell_(name), link]]);
  accounts.getRange(account.row, ACCOUNT_COL.updated).setValue(now);
  logChange_(name, 'Signed', account.id + ' ' + account.handle, 'Waiver', account.waiverPrint, w.fingerprint);
  return { row: row, at: now, title: w.title, text: w.text, fingerprint: w.fingerprint, name: name, bytes: bytes };
}

// Saves a signature in the Signatures folder beside the Sheet, made the
// first time it's needed, and returns its link.
function saveSignature_(accountId, name, bytes, now) {
  var day = Utilities.formatDate(now, Session.getScriptTimeZone(), 'yyyy-MM-dd HHmm');
  var fileName = accountId + ' ' + name.replace(/[\\/:*?"<>|]+/g, ' ').trim() + ' waiver signature ' + day + '.png';
  return signaturesFolder_().createFile(Utilities.newBlob(bytes, 'image/png', fileName)).getUrl();
}

// Emails the person a copy of what they signed (Oct 23, in chat): the
// waiver's title and words, their name, the time, and their signature.
// Whether it went is kept on the signing's row; a failure doesn't undo it.
function emailWaiverCopy_(account, s) {
  var tz = Session.getScriptTimeZone();
  var when = Utilities.formatDate(s.at, tz, "MMM d, yyyy 'at' h:mm a");
  var plain = 'Hi ' + account.first + ',\n\n' +
    'Here is a copy of the waiver you signed on HABO\'s litter page. Keep it for your records.\n\n' +
    s.title + '\n\n' + s.text + '\n\n' +
    'Signed by ' + s.name + ' on ' + when + ', Central time. Your signature is in the formatted version of this email.\n' +
    'Waiver fingerprint: ' + s.fingerprint + '\n\n' +
    'Help A Brother Out Foundation';
  var html = '<p>Hi ' + htmlEscape_(account.first) + ',</p>' +
    '<p>Here is a copy of the waiver you signed on HABO\'s litter page. Keep it for your records.</p>' +
    '<div style="border:1px solid #d1d1d6;border-radius:10px;padding:14px 16px;margin:14px 0">' +
    '<h2 style="font-size:18px;margin:0 0 10px">' + htmlEscape_(s.title) + '</h2>' +
    '<div style="white-space:pre-wrap;font-size:14px;line-height:1.5">' + htmlEscape_(s.text) + '</div>' +
    '<p style="margin:16px 0 4px">Signed by <b>' + htmlEscape_(s.name) + '</b> on ' + htmlEscape_(when) + ', Central time.</p>' +
    '<img src="cid:signature" alt="Signature of ' + htmlEscape_(s.name) + '" style="display:block;max-width:320px;width:100%;border-bottom:1px solid #8e8e93">' +
    '<p style="color:#6e6e73;font-size:12px;margin:8px 0 0">Waiver fingerprint: ' + s.fingerprint + '</p>' +
    '</div>' +
    '<p>Help A Brother Out Foundation</p>';
  var sent = sendMail_(account.email, 'Your signed waiver: ' + s.title, plain, html,
    { cid: 'signature', name: 'signature.png', type: 'image/png', bytes: s.bytes });
  getDb_().getSheetByName(TABS.signatures.name).getRange(s.row, 9).setValue(sent.ok ? 'Sent ' + when : safeCell_('Not sent: ' + sent.why));
  return sent;
}

function signaturesFolder_() {
  var link = getSetting_(SETTING_SIGNATURES_FOLDER).trim();
  if (link) {
    try {
      return DriveApp.getFolderById(driveId_(link));
    } catch (err) {
      throw new Error('The "' + SETTING_SIGNATURES_FOLDER + '" link in Settings can\'t be opened. Fix or clear it, then try again.');
    }
  }
  return withLock_(function () {
    settingsMemo_ = null;
    var again = getSetting_(SETTING_SIGNATURES_FOLDER).trim();
    if (again) return DriveApp.getFolderById(driveId_(again));
    var parents = DriveApp.getFileById(getDb_().getId()).getParents();
    var folder = (parents.hasNext() ? parents.next() : DriveApp.getRootFolder()).createFolder('Litter waiver signatures');
    setSetting_(SETTING_SIGNATURES_FOLDER, folder.getUrl());
    return folder;
  });
}

function driveId_(link) {
  var m = /\/(?:d|folders)\/([\w-]{20,})/.exec(String(link)) || /[?&]id=([\w-]{20,})/.exec(String(link)) || /^([\w-]{20,})$/.exec(String(link).trim());
  return m ? m[1] : '';
}
