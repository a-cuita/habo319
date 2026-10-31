/**
 * The map and your collections (S3-P22, the litter class's step 3; S3-P7's
 * items 7, 10, 12, 13, 15 and 16).
 *
 * - The public map (item 10): every cell a saved collection covered, with
 *   its latest reading, the day, and who collected it as they chose (their
 *   name, their handle, or neither). Anyone can open it from the litter page,
 *   with no account (Q391 (a)). Cells nobody has covered aren't sent, a clean
 *   stretch's cells show their 0 (Q298), and a collection HABO's staff hid
 *   isn't on it (Q319). Earlier readings stay in the Stretches tab (Q233).
 * - The colours (items 12 and 16): HABO's default, set in the invoicing app,
 *   at 0, 5 and 10, blended between; MoCiSN's blue, sand and brown to start.
 *   The scale is fixed, so a colour means the same reading on every screen.
 * - Your collections (item 15): each with its date, pounds, miles and active
 *   time, and its stretches with their readings and visual ratings; no means.
 * - The break question (item 7): after 10 collections, a setting (Q392 (a)),
 *   the page compares a stretch's time with your usual pace; this works the
 *   usual pace out from your own stretches.
 */

var SETTING_COLOUR_0 = 'Map colour at 0';
var SETTING_COLOUR_5 = 'Map colour at 5';
var SETTING_COLOUR_10 = 'Map colour at 10';
var SETTING_BREAK_AFTER = 'Break question after (collections)';
// The paused part of a GPX track, drawn faded in this colour (S5-P1, Q507, M545).
var SETTING_PAUSED_COLOUR = 'Paused track colour';
var DEFAULT_PAUSED_COLOUR = '#9ca3af';
// MoCiSN's index colours (Coalition Builder, M127): blue, sand, brown.
var MOCISN_COLOURS = ['#2c7bb6', '#f6e8c3', '#8c510a'];
// Head Builder mode's own colours (S5-U2 round 3, Q528): the page goes dark
// while the Simulated walk switch is on, so the map's lines and the Litter
// Index scale have lighter versions, each a row in the Settings tab.
var DARK_SETTINGS = [
  ['track', 'Head Builder mode: track colour', '#f3f4f6'],
  ['paused', 'Head Builder mode: paused track colour', '#9ca3af'],
  ['sim', 'Head Builder mode: simulated walk colour', '#4ade80'],
  ['plan', 'Head Builder mode: plan colour', '#c4b5fd'],
  ['streets', 'Head Builder mode: streets colour', '#d1d5db'],
  ['colour0', 'Head Builder mode: map colour at 0', '#5aa9e6'],
  ['colour5', 'Head Builder mode: map colour at 5', '#f6e8c3'],
  ['colour10', 'Head Builder mode: map colour at 10', '#e08f3c']
];

/* ── Called from the page ── */

// The public map, for anyone: no account needed.
function mapLoad_() {
  ensureSchema_();
  var shown = {};
  readAccounts_().forEach(function (a) {
    shown[a.id] = a.shows === 'Name' ? (a.first + ' ' + a.last).trim() : a.shows === 'Neither' ? '' : a.handle;
  });
  var open = {};
  readRows_(TABS.collections).forEach(function (q) {
    if (q.get('status') !== 'Collecting' && q.get('status') !== COLLECTION_DISCARDED && !q.get('hidden') && q.get('simulated') !== 'Yes') open[q.get('id')] = true;
  });
  // Each cell's latest reading: the stretch that ended last.
  var latest = {};
  readRows_(TABS.stretches).forEach(function (q) {
    if (!open[q.get('collection')] || q.get('discarded') === 'Yes' || q.get('index') === '') return;
    var ended = q.get('ended') instanceof Date ? q.get('ended').getTime() : 0;
    String(q.get('cells')).split(/\s+/).filter(String).forEach(function (cell) {
      var was = latest[cell];
      if (was && was.ended > ended) return;
      latest[cell] = { ended: ended, index: Number(q.get('index')), who: shown[q.get('account')] || '' };
    });
  });
  var tz = Session.getScriptTimeZone();
  var cells = Object.keys(latest).map(function (cell) {
    var x = latest[cell];
    return [cell, round_(x.index, 1), Utilities.formatDate(new Date(x.ended), tz, 'yyyy-MM-dd'), x.who];
  });
  return { colours: mapColours_(), pausedColour: pausedColour_(), dark: darkColours_(), cells: cells,
    segments: segmentSummaries_(), rateTop: minutesSetting_(SETTING_RATE_TOP, 5) || 5 };
}

// This account's collections, newest first, each with its stretches.
function myCollections_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var editHours = minutesSetting_(SETTING_EDIT_HOURS, 48);
  var byCollection = {};
  readRows_(TABS.stretches).forEach(function (q) {
    if (q.get('account') === account.id) (byCollection[q.get('collection')] = byCollection[q.get('collection')] || []).push(q);
  });
  var list = readRows_(TABS.collections).filter(function (q) { return q.get('account') === account.id && q.get('status') !== 'Collecting' && q.get('status') !== COLLECTION_DISCARDED; })
    .map(function (q) {
      var col = collectionOf_(q);
      var ended = col.ended || col.lastPressed || col.started;
      col.editableUntil = ended + editHours * 3600000;
      col.editable = Date.now() < col.editableUntil;
      col.stretchList = (byCollection[col.id] || []).map(stretchOf_).sort(function (a, b) { return a.n - b.n; }).map(stretchViewOf_);
      delete col.row;
      return col;
    })
    .sort(function (a, b) { return b.started - a.started; });
  return { collections: list, colours: mapColours_(), pausedColour: pausedColour_(), dark: darkColours_(), editHours: editHours,
    plans: myPlans_(account.id) };
}

/* ── The colours ── */

// HABO's default colours at 0, 5 and 10 (item 16); MoCiSN's where a setting
// is blank or isn't a colour.
function mapColours_() {
  return [SETTING_COLOUR_0, SETTING_COLOUR_5, SETTING_COLOUR_10].map(function (name, i) {
    var v = String(getSetting_(name) || '').trim().toLowerCase();
    return /^#[0-9a-f]{6}$/.test(v) ? v : MOCISN_COLOURS[i];
  });
}
function pausedColour_() {
  var v = String(getSetting_(SETTING_PAUSED_COLOUR) || '').trim().toLowerCase();
  return /^#[0-9a-f]{6}$/.test(v) ? v : DEFAULT_PAUSED_COLOUR;
}
// Head Builder mode's colours, each its default where the setting is blank
// or isn't a colour.
function darkColours_() {
  var c = {};
  DARK_SETTINGS.forEach(function (s) {
    var v = String(getSetting_(s[1]) || '').trim().toLowerCase();
    c[s[0]] = /^#[0-9a-f]{6}$/.test(v) ? v : s[2];
  });
  return { track: c.track, paused: c.paused, sim: c.sim, plan: c.plan, streets: c.streets, colours: [c.colour0, c.colour5, c.colour10] };
}

/* ── The usual pace (item 7) ── */

// Minutes per mile over this account's own stretches (the middle value, so
// one long stop doesn't move it), and how many collections it has. The page
// asks the break question only once there are as many as the setting says.
function paceOf_(accountId) {
  var ended = {};
  var n = 0;
  readRows_(TABS.collections).forEach(function (q) {
    if (q.get('account') === accountId && q.get('status') !== 'Collecting' && q.get('status') !== COLLECTION_DISCARDED && q.get('simulated') !== 'Yes') { ended[q.get('id')] = true; n++; }
  });
  var paces = [];
  readRows_(TABS.stretches).forEach(function (q) {
    if (!ended[q.get('collection')] || q.get('discarded') === 'Yes') return;
    var miles = (Number(q.get('streetMi')) || 0) + (Number(q.get('offMi')) || 0), mins = Number(q.get('activeMin')) || 0;
    if (miles > 0 && mins > 0) paces.push(mins / miles);
  });
  paces.sort(function (a, b) { return a - b; });
  var mid = paces.length ? (paces.length % 2 ? paces[(paces.length - 1) / 2] : (paces[paces.length / 2 - 1] + paces[paces.length / 2]) / 2) : null;
  return { collections: n, minPerMile: mid == null ? null : round_(mid, 1), after: minutesSetting_(SETTING_BREAK_AFTER, 10) };
}
