/**
 * Planning a collection, and its XP (Oct 24, 2026, in chat, field first).
 *
 * - Before collecting, a person plans the stretches they mean to collect, on
 *   the map: each stretch's cells, and where they'll turn around. Until they
 *   have as many collections as the break question waits for (10, a setting:
 *   enough to know their usual pace), Start needs a plan; after that, a plan
 *   is up to them. Start uses the plan saved last that hasn't started one.
 * - A collection that started from a plan earns XP when it ends, if at least
 *   one of its stretches was weighed: 1 to start, a setting.
 * - A plan never changes a stretch: the stretches come from where the person
 *   actually went, as with a recorder's GPX file (Q228).
 */

var PLAN_COL = { id: 1, account: 2, created: 3, stretches: 4, cells: 5, turns: 6, miles: 7, collection: 8, updated: 9 };
var SETTING_PLAN_XP = 'XP for each planned collection';
// XP for each stretch (S3-P27, Q401, Q402, M409, Q424): its visual rating,
// by how close it is to the Litter Index, with a bonus as the Litter Index
// rises; and its litter types. Every number is a setting.
var SETTING_RATING_XP_1 = 'XP for a visual rating within 1';
var SETTING_RATING_XP_2 = 'XP for a visual rating within 2';
var SETTING_RATING_XP_3 = 'XP for a visual rating within 3';
var SETTING_RATING_BONUS = 'Rating XP bonus: the Litter Index divided by';
var SETTING_TYPES_XP = 'XP for a stretch\'s litter types';
var PLAN_REPLACED = 'Replaced';

/* ── Called from the page ── */

// Saves a plan: its stretches, each with its cells in order and its
// turnarounds, and their miles as the phone measured them. A newer plan
// replaces one that hasn't started a collection yet.
function planSave_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  requireCurrentWaiver_(account);
  var p = req.plan || {};
  var list = (Array.isArray(p.stretches) ? p.stretches : []).slice(0, 30).map(function (s) {
    var cells = cleanCells_(s && s.cells);
    var turns = cleanCells_(s && s.turns).filter(function (t) { return cells.indexOf(t) !== -1; });
    return { cells: cells, turns: turns, miles: milesValue_(Number(s && s.miles) || 0) };
  }).filter(function (s) { return s.cells.length; });
  if (!list.length) throw new Error('A plan needs at least one cell: tap the cells you mean to cover.');
  return withLock_(function () {
    var sheet = getDb_().getSheetByName(TABS.plans.name);
    var now = new Date();
    readRows_(TABS.plans).forEach(function (r) {
      if (r.get('account') === account.id && !r.get('collection')) {
        sheet.getRange(r.row, PLAN_COL.collection, 1, 2).setValues([[PLAN_REPLACED, now]]);
      }
    });
    var id = nextId_('P', readRows_(TABS.plans).map(function (r) { return r.values[0]; }));
    var miles = list.reduce(function (t, s) { return t + s.miles; }, 0);
    var row = blankRow_(TABS.plans);
    row[PLAN_COL.id - 1] = id;
    row[PLAN_COL.account - 1] = account.id;
    row[PLAN_COL.created - 1] = now;
    row[PLAN_COL.stretches - 1] = list.length;
    row[PLAN_COL.cells - 1] = list.map(function (s) { return s.cells.join(' '); }).join(' / ');
    row[PLAN_COL.turns - 1] = list.map(function (s) { return s.turns.join(' '); }).join(' / ');
    row[PLAN_COL.miles - 1] = round_(miles, 2);
    row[PLAN_COL.updated - 1] = now;
    sheet.getRange(lastRowWith_(sheet, 1) + 1, 1, 1, row.length).setValues([row]);
    return { plan: planView_(openPlan_(account.id)), planNeeded: planNeeded_(account.id) };
  });
}

/* ── Reading ── */

// A Plans row as a plan: { id, created, stretches: [{ cells, turns }], miles, collection }.
// Stretches are kept apart by "/". A stretch with no turnarounds leaves a
// bare "/" at the end, which the Sheet keeps without its space, so the split
// allows for that, and only cells are kept (S3-P27, C540: "Not a cell: /").
function planOf_(r) {
  var cells = String(r.get('cells')).split(/\s*\/\s*/), turns = String(r.get('turns')).split(/\s*\/\s*/);
  var isCell = function (x) { return /^-?\d+_-?\d+$/.test(x); };
  var created = r.get('created');
  return {
    id: r.get('id'), account: r.get('account'), created: created instanceof Date ? created.getTime() : 0,
    stretches: cells.map(function (c, i) {
      return { cells: c.split(/\s+/).filter(isCell), turns: String(turns[i] || '').split(/\s+/).filter(isCell) };
    }).filter(function (s) { return s.cells.length; }),
    miles: Number(r.get('miles')) || 0, collection: r.get('collection')
  };
}

function planView_(p) {
  if (!p) return null;
  return { id: p.id, created: p.created, stretches: p.stretches, miles: p.miles };
}

// The plan saved last that hasn't started a collection, or null.
function openPlan_(accountId) {
  var r = readRows_(TABS.plans).filter(function (q) { return q.get('account') === accountId && !q.get('collection'); }).pop();
  return r ? planOf_(r) : null;
}

function planById_(id) {
  if (!id) return null;
  var r = readRows_(TABS.plans).filter(function (q) { return q.get('id') === id; })[0];
  return r ? planOf_(r) : null;
}

// Sets which collection a plan started ('' gives it back, unused).
function markPlan_(planId, collectionId) {
  var r = readRows_(TABS.plans).filter(function (q) { return q.get('id') === planId; })[0];
  if (!r) return;
  getDb_().getSheetByName(TABS.plans.name).getRange(r.row, PLAN_COL.collection, 1, 2).setValues([[collectionId, new Date()]]);
}

// Whether Start needs a plan: until the account has as many collections as
// the break question waits for (the same setting, 10 to start).
function planNeeded_(accountId) {
  return countedCollections_(accountId) < minutesSetting_(SETTING_BREAK_AFTER, 10);
}

// Collections that have ended and weren't discarded.
function countedCollections_(accountId) {
  return readRows_(TABS.collections).filter(function (q) {
    return q.get('account') === accountId && q.get('status') !== 'Collecting' && q.get('status') !== COLLECTION_DISCARDED && q.get('simulated') !== 'Yes';
  }).length;
}

/* ── XP ── */

// What an ended collection earns for its plan: the setting (1 to start), if
// it started from a plan and at least one stretch was weighed; else none.
function setPlanXp_(collectionId) {
  var col = readCollection_(collectionId);
  if (!col) return;
  var weighed = stretchesOf_(collectionId).some(function (s) { return !s.discarded && s.pounds != null; });
  // No GPX track, no XP (Jeremy, Oct 29).
  var xp = col.plan && weighed && col.status !== COLLECTION_DISCARDED && col.track.length > 1 && !col.simulated ? minutesSetting_(SETTING_PLAN_XP, 1) : '';
  getDb_().getSheetByName(TABS.collections.name).getRange(col.row, COLLECTION_COL.xp).setValue(xp);
}

// Your XP: each planned collection's, and each stretch's of your ended
// collections, worked out from the stretches as they are now, so a fix or a
// discard changes it, and your walk's counts (M410).
function xpOf_(accountId) {
  // Only walks with their GPX track saved earn XP (Jeremy, Oct 29).
  var cols = readRows_(TABS.collections).filter(function (q) { return q.get('account') === accountId && String(q.get('track')).trim() && q.get('simulated') !== 'Yes'; });
  var plan = cols.reduce(function (t, q) { return t + (Number(q.get('xp')) || 0); }, 0);
  var ended = {};
  cols.forEach(function (q) { if (q.get('status') === 'Ended') ended[q.get('id')] = true; });
  var x = xpSettings_();
  var stretches = readRows_(TABS.stretches).reduce(function (t, q) {
    return q.get('account') === accountId && ended[q.get('collection')] ? t + stretchXp_(stretchOf_(q), x) : t;
  }, 0);
  return round_(plan + stretches, 2);
}

function xpSettings_() {
  return { r1: minutesSetting_(SETTING_RATING_XP_1, 3), r2: minutesSetting_(SETTING_RATING_XP_2, 2), r3: minutesSetting_(SETTING_RATING_XP_3, 1),
    bonus: minutesSetting_(SETTING_RATING_BONUS, 5), types: minutesSetting_(SETTING_TYPES_XP, 1) };
}

// A stretch's XP: its rating's, by how far it is from the Litter Index
// (3 within 1, 2 within 2, 1 within 3), times 1 plus the Litter Index ÷ 5
// (counted as 10 past 10), rounded; and its litter types', when it has
// some, or weighed 0 lb, a clean stretch (Q423, Q424). A discarded stretch
// earns none.
function stretchXp_(s, x) {
  if (s.discarded) return 0;
  var xp = 0;
  if (s.rating != null && s.index != null) {
    var off = Math.abs(s.rating - s.index);
    var base = off <= 1 ? x.r1 : off <= 2 ? x.r2 : off <= 3 ? x.r3 : 0;
    xp += Math.round(base * (1 + (x.bonus > 0 ? Math.min(10, s.index) / x.bonus : 0)));
  }
  if (s.types.length || s.pounds === 0) xp += x.types;
  return xp;
}
