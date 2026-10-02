/**
 * People (admins, staff, event hosts) and their headshots, managed from the
 * admin modal. Headshots live in a Drive folder next to the Sheet (its link
 * is the "Headshots folder" setting). The folder stays private: public pages
 * will get photos through the backend, never from Drive directly.
 */

// People tab columns (1-based), matching TABS.people.header in Code.js.
var PERSON_COL = {
  id: 1, name: 2, title: 3, bio: 4, email: 5, phone: 6, photo: 7,
  isPublic: 8, active: 9, created: 10, updated: 11
};

var SETTING_HEADSHOTS_FOLDER = 'Headshots folder';
var MAX_HEADSHOT_BYTES = 1024 * 1024;     // processed headshots are ~50 KB
var MAX_SOURCE_IMAGE_BYTES = 20 * 1024 * 1024;

/* ── Called from the modal ── */

// Creates a person (input.id empty) or updates one. input.photo says what to
// do with the headshot: { mode: 'keep' | 'remove' | 'upload' | 'link' }, with
// `data` (base64 JPEG, already cropped in the browser) for an upload, or
// `fileId` to use a file from the Headshots folder as it is.
function adminSavePerson(input) {
  ensureSchema_();
  var p = validatePerson_(input);
  var photo = (input && input.photo) || { mode: 'keep' };
  var photoUrl = null;
  if (photo.mode === 'upload') photoUrl = saveHeadshot_(p.name, photo.data);
  else if (photo.mode === 'link') photoUrl = imageFile_(photo.fileId).getUrl();
  else if (photo.mode === 'remove') photoUrl = '';

  var savedId = withLock_(function () {
    var sheet = getDb_().getSheetByName(TABS.people.name);
    var last = lastRowWith_(sheet, PERSON_COL.id);
    var ids = columnValues_(sheet, PERSON_COL.id, last);
    var now = new Date();
    var row;
    if (p.id) {
      var i = ids.indexOf(p.id);
      if (i < 0) throw new Error('That person is no longer in the Sheet. Close this window and reopen it.');
      row = i + 2;
    } else {
      p.id = nextId_('P', ids);
      row = last + 1;
      sheet.getRange(row, PERSON_COL.id).setValue(p.id);
      sheet.getRange(row, PERSON_COL.created).setValue(now);
    }
    sheet.getRange(row, PERSON_COL.name, 1, 5).setValues([[
      safeCell_(p.name), safeCell_(p.title), safeCell_(p.bio), safeCell_(p.email), safeCell_(p.phone)
    ]]);
    sheet.getRange(row, PERSON_COL.bio).setWrap(true);
    if (photoUrl !== null) sheet.getRange(row, PERSON_COL.photo).setValue(photoUrl);
    sheet.getRange(row, PERSON_COL.isPublic, 1, 2).insertCheckboxes().setValues([[p.isPublic, p.active]]);
    sheet.getRange(row, PERSON_COL.updated).setValue(now);
    return p.id;
  });
  var result = adminLoad();
  result.savedId = savedId;
  return result;
}

// Images in the Headshots folder, newest first, with small thumbnails.
function adminListHeadshots() {
  var folder = headshotsFolder_();
  var files = [];
  var it = folder.getFiles();
  while (it.hasNext()) {
    var f = it.next();
    if (/^image\//.test(f.getMimeType())) files.push(f);
  }
  files.sort(function (a, b) { return b.getLastUpdated() - a.getLastUpdated(); });
  return {
    folderUrl: folder.getUrl(),
    files: files.slice(0, 40).map(function (f) {
      return { id: f.getId(), name: f.getName(), thumb: thumbnailData_(f) };
    })
  };
}

// The full image, so the browser can crop it into a headshot.
function adminGetImage(fileId) {
  var file = imageFile_(fileId);
  if (file.getSize() > MAX_SOURCE_IMAGE_BYTES) throw new Error('That image is too large (over 20 MB).');
  var blob = file.getBlob();
  return { mimeType: blob.getContentType(), data: Utilities.base64Encode(blob.getBytes()) };
}

/* ── People tab ── */

// Every person with a name. Rows typed in by hand get an ID the first time
// they're read. A blank Active cell counts as active; a blank "Show publicly"
// cell counts as no.
function readPeople_() {
  var sheet = getDb_().getSheetByName(TABS.people.name);
  var count = lastRowWith_(sheet, PERSON_COL.id) - 1;
  if (count < 1) return [];
  var shown = sheet.getRange(2, 1, count, PERSON_COL.active).getDisplayValues();
  backfillIds_(sheet, shown, PERSON_COL.id, PERSON_COL.name, 'P');
  return shown
    .map(function (r) {
      var activeCell = r[PERSON_COL.active - 1].trim();
      return {
        id: r[PERSON_COL.id - 1].trim(),
        name: r[PERSON_COL.name - 1].trim(),
        title: r[PERSON_COL.title - 1].trim(),
        bio: r[PERSON_COL.bio - 1].trim(),
        email: r[PERSON_COL.email - 1].trim(),
        phone: r[PERSON_COL.phone - 1].trim(),
        photoId: driveId_(r[PERSON_COL.photo - 1]),
        isPublic: isTrue_(r[PERSON_COL.isPublic - 1]),
        active: !activeCell || isTrue_(activeCell)
      };
    })
    .filter(function (p) { return p.name; });
}

function validatePerson_(input) {
  input = input || {};
  var p = {
    id: clean_(input.id, 20),
    name: clean_(input.name, 100),
    title: clean_(input.title, 100),
    bio: clean_(input.bio, 600),
    email: clean_(input.email, 200),
    phone: clean_(input.phone, 40),
    isPublic: input.isPublic === true,
    active: input.active !== false
  };
  if (!p.name) throw new Error('Enter a name.');
  if (p.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(p.email)) throw new Error('That email address looks incomplete.');
  return p;
}

// How a person is written into an event's Host / Co-hosts cells.
function personRef_(person) {
  return person.name + ' (' + person.id + ')';
}

// Person IDs for a Host / Co-hosts cell such as "Ana Lee (P002); Sam Cole".
// Entries without an ID are matched by name, ignoring case.
function resolvePeople_(cell, people) {
  return String(cell || '').split(';')
    .map(function (part) {
      part = part.trim();
      if (!part) return '';
      var m = /\((P\d+)\)\s*$/.exec(part);
      if (m) return m[1];
      var name = part.toLowerCase();
      var match = people.filter(function (p) { return p.name.toLowerCase() === name; })[0];
      return match ? match.id : '';
    })
    .filter(Boolean);
}

/* ── Headshots ── */

// The Headshots folder, created next to the Sheet the first time it's needed.
function headshotsFolder_() {
  var link = getSetting_(SETTING_HEADSHOTS_FOLDER);
  if (link) {
    try {
      return DriveApp.getFolderById(driveId_(link));
    } catch (err) {
      throw new Error('The "Headshots folder" link in Settings can\'t be opened. Fix or clear it, then try again.');
    }
  }
  return withLock_(function () {
    var again = getSetting_(SETTING_HEADSHOTS_FOLDER);
    if (again) return DriveApp.getFolderById(driveId_(again));
    var parents = DriveApp.getFileById(getDb_().getId()).getParents();
    var folder = (parents.hasNext() ? parents.next() : DriveApp.getRootFolder()).createFolder('Headshots');
    setSetting_(SETTING_HEADSHOTS_FOLDER, folder.getUrl());
    return folder;
  });
}

function saveHeadshot_(personName, base64) {
  var bytes = Utilities.base64Decode(String(base64 || ''));
  if (!bytes.length) throw new Error('The photo was empty. Try choosing it again.');
  if (bytes.length > MAX_HEADSHOT_BYTES) throw new Error('That photo is too large.');
  var name = personName.replace(/[\\/:*?"<>|]+/g, ' ').trim() + ' headshot.jpg';
  return headshotsFolder_().createFile(Utilities.newBlob(bytes, 'image/jpeg', name)).getUrl();
}

function imageFile_(fileId) {
  var file;
  try {
    file = DriveApp.getFileById(clean_(fileId, 100));
  } catch (err) {
    throw new Error('That image can\'t be opened. It may have been moved or deleted.');
  }
  if (!/^image\//.test(file.getMimeType())) throw new Error('That file isn\'t an image.');
  return file;
}

// A person's headshot as a data URL, cached for six hours. Large images
// linked by hand fall back to Drive's thumbnail.
function headshotData_(fileId) {
  if (!fileId) return null;
  var cache = CacheService.getScriptCache();
  var cached = cache.get('headshot:' + fileId);
  if (cached) return cached;
  try {
    var file = DriveApp.getFileById(fileId);
    var data = file.getSize() <= 70 * 1024
      ? 'data:' + file.getMimeType() + ';base64,' + Utilities.base64Encode(file.getBlob().getBytes())
      : thumbnailData_(file);
    if (data && data.length < 100000) cache.put('headshot:' + fileId, data, 6 * 60 * 60);
    return data;
  } catch (err) {
    return null;
  }
}

function thumbnailData_(file) {
  try {
    var thumb = file.getThumbnail();
    return thumb ? 'data:' + thumb.getContentType() + ';base64,' + Utilities.base64Encode(thumb.getBytes()) : null;
  } catch (err) {
    return null;
  }
}

/* ── Helpers ── */

// The file or folder ID in a Drive link, or the ID itself.
function driveId_(link) {
  var s = String(link || '').trim();
  var m = /\/(?:d|folders)\/([\w-]{20,})/.exec(s) || /[?&]id=([\w-]{20,})/.exec(s) || /^([\w-]{20,})$/.exec(s);
  return m ? m[1] : '';
}

function isTrue_(value) {
  return /^(true|yes|y|x|1|✓|✔)$/i.test(String(value).trim());
}
