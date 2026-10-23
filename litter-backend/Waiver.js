/**
 * The litter page's own waiver (S3-P20, Q383 (b)): signed once, while
 * setting up an account, before the first collection (Q280). Its words are
 * the Settings tab's "Waiver title" and "Waiver text", changed from the
 * invoicing app's Litter screen (Q163) or by hand. Each signature is kept
 * with a fingerprint of the exact words shown, as at the check-in.
 *
 * The words below are only where it starts: the draft on S3-P20, under
 * Q383, for Jeremy to change, and for an Alabama attorney or HABO's insurer
 * to read before the page goes public.
 */

var SEED_WAIVER_TITLE = 'HABO Litter Collection: Waiver and Release';

var SEED_WAIVER_TEXT = [
  'Read this before you set up your account. You sign it once, and it covers every collection you make with HABO\'s litter page.',
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
  '9. My signature. I\'ve read this, I understand it, and I\'m signing it freely. My signature, with my typed name and the date, is my agreement, and it covers every collection I make.'
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

// Saves a signature in the Signatures folder beside the Sheet, made the
// first time it's needed, and returns its link.
function saveSignature_(accountId, name, bytes) {
  var fileName = accountId + ' ' + name.replace(/[\\/:*?"<>|]+/g, ' ').trim() + ' waiver signature.png';
  return signaturesFolder_().createFile(Utilities.newBlob(bytes, 'image/png', fileName)).getUrl();
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
