/**
 * Banner cards for the event iPad: short messages that rotate in their own
 * card beside the check-in QR code, a few seconds each ("Banner seconds per
 * card" in Settings). Each card has formatted title and text, a layout, and
 * optionally an image from the Banner Images folder next to the Sheet. The
 * site's assets/banner.js draws them; the modal previews them with a copy.
 * The event's hosts rotate separately, inside the event's own card.
 */

// Banner Cards tab columns (1-based), matching TABS.cards.header in Code.js.
var CARD_COL = { id: 1, title: 2, text: 3, active: 4, updated: 5, layout: 6, image: 7, position: 8, background: 9 };

var SETTING_BANNER_IMAGES_FOLDER = 'Banner images folder';
var MAX_BANNER_IMAGE_BYTES = 600 * 1024;   // uploads are resized in the browser well below this

// How layouts and text positions are written in the Sheet, by the key the
// site and modal use.
var CARD_LAYOUTS = { text: 'Text only', left: 'Image left', right: 'Image right', top: 'Image top',
  background: 'Image background', image: 'Image only' };
var CARD_POSITIONS = { top: 'Top', middle: 'Middle', bottom: 'Bottom' };

/* ── Called from the modal ── */

// Creates a card (input.id empty) or updates one. input.image says what to do
// with the card's image: { mode: 'keep' | 'remove' | 'upload' | 'link' },
// with `data` (base64 JPEG, already sized in the browser) for an upload or
// `fileId` for an image already in the Banner Images folder.
function adminSaveCard(input) {
  ensureSchema_();
  input = input || {};
  var c = {
    id: clean_(input.id, 20),
    title: clean_(input.title, 4000),
    text: clean_(input.text, 20000),
    layout: CARD_LAYOUTS.hasOwnProperty(input.layout) ? input.layout : 'text',
    position: CARD_POSITIONS.hasOwnProperty(input.position) ? input.position : 'middle',
    background: /^#[0-9a-f]{6}$/i.test(String(input.background || '')) ? String(input.background).toLowerCase() : '',
    active: input.active !== false
  };
  var image = input.image || { mode: 'keep' };
  var hasText = !!(plainText_(c.title) || plainText_(c.text));
  if (c.layout === 'text' && !hasText) throw new Error('Give the card a title or some text.');
  if (c.layout !== 'text' && image.mode === 'remove') throw new Error('Add an image, or pick the Text only layout.');
  if (c.layout !== 'text' && c.layout !== 'image' && !hasText) {
    throw new Error('Add some text, or pick the Image only layout.');
  }
  // Checked before saving anything when the card can't have an image yet.
  if (c.layout !== 'text' && image.mode === 'keep' && !c.id) throw new Error('Add an image, or pick the Text only layout.');

  var imageUrl = null;  // null: leave the Image cell as it is
  if (image.mode === 'upload') imageUrl = saveBannerImage_(plainText_(c.title) || 'Banner card', image.data);
  else if (image.mode === 'link') imageUrl = imageFile_(image.fileId).getUrl();
  else if (image.mode === 'remove') imageUrl = '';

  var savedId = withLock_(function () {
    var sheet = getDb_().getSheetByName(TABS.cards.name);
    var last = lastRowWith_(sheet, CARD_COL.id);
    var ids = columnValues_(sheet, CARD_COL.id, last);
    var row;
    if (c.id) {
      var i = ids.indexOf(c.id);
      if (i < 0) throw new Error('That card is no longer in the Sheet. Close this window and reopen it.');
      row = i + 2;
      var current = sheet.getRange(row, CARD_COL.image).getDisplayValue().trim();
      if (c.layout !== 'text' && !(imageUrl === null ? current : imageUrl)) {
        throw new Error('Add an image, or pick the Text only layout.');
      }
    } else {
      c.id = nextId_('B', ids);
      row = last + 1;
      sheet.getRange(row, CARD_COL.id).setValue(c.id);
    }
    sheet.getRange(row, CARD_COL.title, 1, 2).setValues([[safeCell_(c.title), safeCell_(c.text)]]).setWrap(true);
    sheet.getRange(row, CARD_COL.active).insertCheckboxes().setValue(c.active);
    sheet.getRange(row, CARD_COL.updated).setValue(new Date());
    sheet.getRange(row, CARD_COL.layout).setValue(CARD_LAYOUTS[c.layout]);
    if (imageUrl !== null) sheet.getRange(row, CARD_COL.image).setValue(imageUrl);
    sheet.getRange(row, CARD_COL.position, 1, 2).setValues([[CARD_POSITIONS[c.position], c.background]]);
    return c.id;
  });
  var result = adminLoad();
  result.savedId = savedId;
  return result;
}

/* ── Banner Cards tab ── */

// Every card with a title, text, or image, in Sheet order. A blank Active
// cell counts as active; a blank Layout or Text position gets the default.
function readCards_() {
  var sheet = getDb_().getSheetByName(TABS.cards.name);
  var count = lastRowWith_(sheet, CARD_COL.id) - 1;
  if (count < 1) return [];
  var shown = sheet.getRange(2, 1, count, CARD_COL.background).getDisplayValues();
  backfillIds_(sheet, shown, CARD_COL.id, CARD_COL.title, 'B');
  return shown
    .map(function (r) {
      var activeCell = r[CARD_COL.active - 1].trim();
      var background = r[CARD_COL.background - 1].trim();
      return {
        id: r[CARD_COL.id - 1].trim(),
        title: r[CARD_COL.title - 1].trim(),
        text: r[CARD_COL.text - 1].trim(),
        active: !activeCell || isTrue_(activeCell),
        layout: keyFor_(CARD_LAYOUTS, r[CARD_COL.layout - 1], 'text'),
        imageId: driveId_(r[CARD_COL.image - 1]),
        position: keyFor_(CARD_POSITIONS, r[CARD_COL.position - 1], 'middle'),
        background: /^#[0-9a-f]{6}$/i.test(background) ? background.toLowerCase() : ''
      };
    })
    .filter(function (c) { return c.title || c.text || c.imageId; });
}

// The key for a name as written in the Sheet ("Image left" → 'left'),
// ignoring case; the key itself also works.
function keyFor_(names, cell, fallback) {
  var s = String(cell || '').trim().toLowerCase();
  for (var key in names) {
    if (names.hasOwnProperty(key) && (key === s || names[key].toLowerCase() === s)) return key;
  }
  return fallback;
}

// Text without its formatting tags, to check that a card says something.
function plainText_(html) {
  return String(html || '').replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();
}

function bannerSeconds_() {
  var n = Number(getSetting_(SETTING_BANNER_SECONDS));
  return isFinite(n) && n >= 3 && n <= 120 ? n : 8;
}

function bannerImagesFolder_() {
  return sheetFolder_(SETTING_BANNER_IMAGES_FOLDER, 'Banner Images');
}

function saveBannerImage_(cardName, base64) {
  var bytes = Utilities.base64Decode(String(base64 || ''));
  if (!bytes.length) throw new Error('The image was empty. Try choosing it again.');
  if (bytes.length > MAX_BANNER_IMAGE_BYTES) throw new Error('That image is too large.');
  var name = cardName.replace(/[\\/:*?"<>|]+/g, ' ').slice(0, 60).trim() + ' banner.jpg';
  return bannerImagesFolder_().createFile(Utilities.newBlob(bytes, 'image/jpeg', name)).getUrl();
}

/* ── For the public pages ── */

// The event's hosts that may appear on public screens, host first. People
// who haven't agreed to appear ("Show publicly" unchecked) are left out; the
// rest keep their role (an event typed in with only co-hosts treats the
// first as its host, like the admin modal does).
function publicHosts_(ev, people) {
  var byId = {};
  people.forEach(function (p) { byId[p.id] = p; });
  return [ev.hostId].concat(ev.cohostIds)
    .filter(Boolean)
    .map(function (id, i) {
      var p = byId[id];
      if (!p || !p.isPublic) return null;
      return { role: i === 0 ? 'Host' : 'Co-host', name: p.name, title: p.title, bio: p.bio, photo: headshotData_(p.photoId) };
    })
    .filter(Boolean);
}

// The banner for the event iPad: the active cards, with their images.
function eventBanner_() {
  var cards = readCards_()
    .filter(function (c) { return c.active; })
    .map(function (c) {
      return { title: c.title, text: c.text, layout: c.layout, position: c.position, background: c.background,
        image: c.imageId ? imageData_(c.imageId, MAX_BANNER_IMAGE_BYTES) : null };
    });
  return { seconds: bannerSeconds_(), cards: cards };
}
