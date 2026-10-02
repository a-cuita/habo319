/**
 * The rotating banner on an event's iPad screen. It cycles through the
 * event's hosts (when the event says to) and the active cards on the Banner
 * Cards tab, a few seconds each ("Banner seconds per card" in Settings).
 */

// Banner Cards tab columns (1-based), matching TABS.cards.header in Code.js.
var CARD_COL = { id: 1, title: 2, text: 3, active: 4, updated: 5 };

/* ── Called from the modal ── */

// Creates a card (input.id empty) or updates one.
function adminSaveCard(input) {
  ensureSchema_();
  input = input || {};
  var c = {
    id: clean_(input.id, 20),
    title: clean_(input.title, 80),
    text: clean_(input.text, 400),
    active: input.active !== false
  };
  if (!c.title && !c.text) throw new Error('Give the card a title or some text.');
  var savedId = withLock_(function () {
    var sheet = getDb_().getSheetByName(TABS.cards.name);
    var last = lastRowWith_(sheet, CARD_COL.id);
    var ids = columnValues_(sheet, CARD_COL.id, last);
    var row;
    if (c.id) {
      var i = ids.indexOf(c.id);
      if (i < 0) throw new Error('That card is no longer in the Sheet. Close this window and reopen it.');
      row = i + 2;
    } else {
      c.id = nextId_('B', ids);
      row = last + 1;
      sheet.getRange(row, CARD_COL.id).setValue(c.id);
    }
    sheet.getRange(row, CARD_COL.title, 1, 2).setValues([[safeCell_(c.title), safeCell_(c.text)]]).setWrap(true);
    sheet.getRange(row, CARD_COL.active).insertCheckboxes().setValue(c.active);
    sheet.getRange(row, CARD_COL.updated).setValue(new Date());
    return c.id;
  });
  var result = adminLoad();
  result.savedId = savedId;
  return result;
}

/* ── Banner Cards tab ── */

// Every card with a title or text, in Sheet order. A blank Active cell
// counts as active.
function readCards_() {
  var sheet = getDb_().getSheetByName(TABS.cards.name);
  var count = lastRowWith_(sheet, CARD_COL.id) - 1;
  if (count < 1) return [];
  var shown = sheet.getRange(2, 1, count, CARD_COL.active).getDisplayValues();
  backfillIds_(sheet, shown, CARD_COL.id, CARD_COL.title, 'B');
  return shown
    .map(function (r) {
      var activeCell = r[CARD_COL.active - 1].trim();
      return {
        id: r[CARD_COL.id - 1].trim(),
        title: r[CARD_COL.title - 1].trim(),
        text: r[CARD_COL.text - 1].trim(),
        active: !activeCell || isTrue_(activeCell)
      };
    })
    .filter(function (c) { return c.title || c.text; });
}

function bannerSeconds_() {
  var n = Number(getSetting_(SETTING_BANNER_SECONDS));
  return isFinite(n) && n >= 3 && n <= 120 ? n : 8;
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

// The banner for an event's iPad: host cards (if the event shows hosts
// there), then the active custom cards.
function eventBanner_(ev, hosts) {
  var cards = (ev.hostsInBanner ? hosts : []).map(function (h) {
    return { kind: 'host', role: h.role, name: h.name, title: h.title, bio: h.bio, photo: h.photo };
  });
  readCards_().forEach(function (c) {
    if (c.active) cards.push({ kind: 'card', title: c.title, text: c.text });
  });
  return { seconds: bannerSeconds_(), cards: cards };
}
