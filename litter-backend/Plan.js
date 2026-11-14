/**
 * Planning a collection, and its XP (Oct 24, 2026, in chat, field first).
 *
 * - Before collecting, a person plans the stretches they mean to collect, on
 *   the map: each stretch's cells, and where they'll turn around. Until they
 *   have as many collections as the break question waits for (10, a setting:
 *   enough to know their usual pace), Start needs a plan; after that, a plan
 *   is up to them. Start uses the plan picked on the main page, the one saved
 *   last to begin with, and a plan can start any number of collections (Oct
 *   31, field first). A plan can have a name, and can be deleted: its row
 *   stays, marked Deleted, so the collections that used it keep their record.
 * - A collection that started from a plan earns XP when it ends, if at least
 *   one of its stretches was weighed: 1 to start, a setting.
 * - A plan never changes a stretch: the stretches come from where the person
 *   actually went, as with a recorder's GPX file (Q228).
 */

var PLAN_COL = { id: 1, account: 2, created: 3, stretches: 4, cells: 5, turns: 6, miles: 7, collection: 8, updated: 9, name: 10, deleted: 11, kind: 12, outline: 13 };
var SETTING_PLAN_XP = 'XP for each planned collection';
// XP for each stretch (S3-P27, Q401, Q402, M409, Q424): its visual rating,
// by how close it is to the Litter Index, with a bonus as the Litter Index
// rises; and its litter types. Every number is a setting.
var SETTING_RATING_XP_1 = 'XP for a visual rating within 1';
var SETTING_RATING_XP_2 = 'XP for a visual rating within 2';
var SETTING_RATING_XP_3 = 'XP for a visual rating within 3';
var SETTING_RATING_BONUS = 'Rating XP bonus: the Litter Index divided by';
var SETTING_TYPES_XP = 'XP for a stretch\'s litter types';
// The time bonus (S6-P3 item 5, |Q679; from |Q481, item 1 of |S5-P4).
var SETTING_TIME_PEAK = 'Time bonus: XP multiplier a day after';
var SETTING_TIME_ENDS = 'Time bonus: gone after (days)';
// The left-alone bonus (S6-P3 item 4, |Q670, |Q690 (a)): a walk that collects
// squares of a public segment nobody has collected for this many days, or
// ever, multiplies its rating and litter-type XP by the other.
var SETTING_ALONE_DAYS = 'Left-alone bonus: after (days)';
var SETTING_ALONE_MULT = 'Left-alone bonus: XP multiplier';
var PLAN_REPLACED = 'Replaced';

/* ── Called from the page ── */

// Saves a plan: its stretches, each with its cells in order and its
// turnarounds, and their miles as the phone measured them, and its name.
// The plans saved before stay, to be picked again (Oct 31).
function planSave_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  requireCurrentWaiver_(account);
  // A Litter Class Skill each (S5-P29): ground kept from a walk, or one drawn.
  requireSkill_(account, req.from === 'walk' ? 'keep' : 'draw');
  var p = req.plan || {};
  var list = (Array.isArray(p.stretches) ? p.stretches : []).slice(0, 30).map(function (s) {
    var cells = cleanCells_(s && s.cells);
    var turns = cleanCells_(s && s.turns).filter(function (t) { return cells.indexOf(t) !== -1; });
    return { cells: cells, turns: turns, miles: milesValue_(Number(s && s.miles) || 0) };
  }).filter(function (s) { return s.cells.length; });
  // A field drawn by its corners (S5-P19, |C788): its squares and miles come
  // from the shape, as a public field's do.
  var field = /^\s*f/i.test(String(p.kind || '')), corners = [];
  if (field) {
    corners = fieldCorners_(p.outline);
    if (!corners.length) throw new Error('Tap the field\'s corners on the map first: 3 or more.');
    var ground = fieldGround_({ outline: corners, squares: [] }, segmentRules_());
    list = [{ cells: Object.keys(ground.cells).slice(0, 2000), turns: [], miles: milesValue_(ground.miles) }];
  }
  if (!list.length) throw new Error('A plan needs at least one cell: tap the cells you mean to cover.');
  var name = clean_(p.name, 60);
  return withLock_(function () {
    var sheet = getDb_().getSheetByName(TABS.plans.name);
    var now = new Date();
    var id = nextId_('P', readRows_(TABS.plans).map(function (r) { return r.values[0]; }));
    var miles = list.reduce(function (t, s) { return t + s.miles; }, 0);
    var row = blankRow_(TABS.plans);
    row[PLAN_COL.id - 1] = id;
    row[PLAN_COL.account - 1] = account.id;
    row[PLAN_COL.created - 1] = now;
    row[PLAN_COL.stretches - 1] = list.length;
    row[PLAN_COL.cells - 1] = squaresPack_(list.map(function (s) { return s.cells.join(' '); }).join(' / '));
    row[PLAN_COL.turns - 1] = list.map(function (s) { return s.turns.join(' '); }).join(' / ');
    row[PLAN_COL.miles - 1] = round_(miles, 2);
    row[PLAN_COL.updated - 1] = now;
    row[PLAN_COL.name - 1] = safeCell_(name);
    row[PLAN_COL.kind - 1] = field ? 'Field' : 'Path';
    row[PLAN_COL.outline - 1] = corners.length ? outlineText_(corners) : '';
    sheet.getRange(lastRowWith_(sheet, 1) + 1, 1, 1, row.length).setValues([row]);
    return { plan: planView_(planById_(id)), planNeeded: planNeeded_(account.id), plans: myPlans_(account.id) };
  });
}

// Deletes one of your plans (Oct 31, field first): it leaves your plans and
// the Plan menu; its row stays in the Plans tab, marked Deleted, so the
// collections and segments that used it keep their record.
function planDelete_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var id = clean_(req.planId, 20);
  return withLock_(function () {
    var r = readRows_(TABS.plans).filter(function (q) { return q.get('id') === id; })[0];
    if (!r || r.get('account') !== account.id) throw new Error('That plan isn\'t yours, or isn\'t here any more.');
    if (!r.get('deleted')) {
      var now = new Date();
      getDb_().getSheetByName(TABS.plans.name).getRange(r.row, PLAN_COL.updated).setValue(now);
      getDb_().getSheetByName(TABS.plans.name).getRange(r.row, PLAN_COL.deleted).setValue(now);
    }
    return { plans: myPlans_(account.id), plan: planView_(openPlan_(account.id)), planNeeded: planNeeded_(account.id) };
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
    miles: Number(r.get('miles')) || 0, collection: r.get('collection'), name: r.get('name'), deleted: !!r.get('deleted'),
    kind: r.get('kind') === 'Field' ? 'Field' : 'Path', outline: parseOutline_(r.get('outline'))
  };
}

function planView_(p) {
  if (!p) return null;
  return { id: p.id, created: p.created, stretches: p.stretches, miles: p.miles, name: p.name };
}

// The plan Start picks to begin with: the one saved last that isn't deleted,
// or null.
function openPlan_(accountId) {
  var r = readRows_(TABS.plans).filter(function (q) { return q.get('account') === accountId && !q.get('deleted'); }).pop();
  return r ? planOf_(r) : null;
}

// The plan a new collection starts from (Oct 31): the one picked on the main
// page, 'none' for no plan, or, when the page doesn't say, the one saved last.
function pickPlan_(accountId, planId) {
  if (planId === 'none') return null;
  if (planId == null || planId === '') return openPlan_(accountId);
  var p = planById_(clean_(planId, 20));
  if (!p || p.account !== accountId || p.deleted) throw coded_('plan-gone', 'That plan isn\'t yours, or was deleted. Pick another in the Plan menu.');
  return p;
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

// Every collection starts from a plan (S5-P9, M590): there's no "No plan".
function planNeeded_(accountId) {
  return true;
}

// A walk's plan (S5-P9, S5-P12, Q552, Q553): the segments chosen to collect
// on one walk, your private segments (P…, the Plans tab) and public ones
// (SG…, accepted in the Segments tab), kept with the collection as their ids,
// "P003 SG001". Not saved on its own. strict: a missing one is refused.
function walkPlan_(accountId, ids, strict) {
  var seen = {}, segs = null;
  ids = (Array.isArray(ids) ? ids : String(ids || '').split(/\s+/)).map(function (x) { return clean_(x, 20); })
    .filter(function (x) { return x && !seen[x] && (seen[x] = true); }).slice(0, 30);
  return ids.map(function (id) {
    if (/^P\d+$/.test(id)) {
      var p = planById_(id);
      if (!p || p.account !== accountId || p.deleted) {
        if (strict) throw coded_('plan-gone', 'One of the segments in your plan isn\'t yours, or was deleted. Choose your plan again.');
        return null;
      }
      var cells = [];
      p.stretches.forEach(function (s) { s.cells.forEach(function (c) { if (cells.indexOf(c) === -1) cells.push(c); }); });
      return { id: id, name: p.name || '', cells: cells, miles: p.miles };
    }
    segs = segs || segmentsAll_();
    var g = segs.filter(function (s) { return s.id === id && s.accepted; })[0];
    if (!g) {
      if (strict) throw coded_('plan-gone', 'One of the segments in your plan isn\'t public any more. Choose your plan again.');
      return null;
    }
    return { id: id, name: g.name, cells: g.squares, miles: g.miles };
  }).filter(Boolean);
}
// As the page shows it: one stretch per segment, and their names.
function walkPlanView_(parts) {
  if (!parts || !parts.length) return null;
  return { id: parts.map(function (p) { return p.id; }).join(' '), name: parts.map(function (p) { return p.name; }).filter(String).join(', '),
    stretches: parts.map(function (p) { return { cells: p.cells, turns: [] }; }), miles: round_(parts.reduce(function (t, p) { return t + (Number(p.miles) || 0); }, 0), 2),
    segments: parts.map(function (p) { return { id: p.id, name: p.name }; }) };
}
// Each private segment in a collection's plan, marked with that collection ('' gives it back).
function markWalkPlan_(planText, collectionId) {
  String(planText || '').split(/\s+/).filter(function (x) { return /^P\d+$/.test(x); }).forEach(function (id) { markPlan_(id, collectionId); });
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
// discard changes it, and your walk's counts (M410); and the first quest's
// (S5-P20, Q579).
function xpOf_(accountId) {
  // Only walks with their GPX track saved earn XP (Jeremy, Oct 29).
  var cols = readRows_(TABS.collections).filter(function (q) { return q.get('account') === accountId && String(q.get('track')).trim() && q.get('simulated') !== 'Yes'; });
  var plan = cols.reduce(function (t, q) { return t + (Number(q.get('xp')) || 0); }, 0);
  var ended = {};
  cols.forEach(function (q) { if (q.get('status') === 'Ended') ended[q.get('id')] = true; });
  var x = xpSettings_(), mult = walkMults_();
  var stretches = readRows_(TABS.stretches).reduce(function (t, q) {
    return q.get('account') === accountId && ended[q.get('collection')] ? t + stretchXp_(stretchOf_(q), x) * (mult[q.get('collection')] || 1) : t;
  }, 0);
  var me = readAccounts_().filter(function (a) { return a.id === accountId; })[0];
  return round_(plan + stretches + (me ? questXp_(me) : 0) + reviewXp_(accountId) + challengeXp_(accountId) + badgeXp_(accountId), 2);   // and Challenges' (S6-P8), and badges' (S6-P6)
}

// One walk's XP, line by line (S6-P3): for planning it, for its ratings, and
// for its litter types, counted as xpOf_ counts them: only once its GPX
// track is saved, and its weighings' only once it's Ended. `xp`: the
// player's whole XP, for the page to see what's new.
function walkXp_(collectionId, accountId) {
  var out = { plan: 0, ratings: 0, types: 0, mult: 1, bonus: 0, total: 0, counts: false, xp: xpOf_(accountId), math: [] };
  var q = readRows_(TABS.collections).filter(function (r) { return r.get('id') === collectionId; })[0];
  if (!q || !String(q.get('track')).trim() || q.get('simulated') === 'Yes') return out;
  out.counts = true;
  out.plan = Number(q.get('xp')) || 0;
  if (q.get('status') === 'Ended') {
    var x = xpSettings_();
    readRows_(TABS.stretches).forEach(function (r) {
      if (r.get('collection') !== collectionId) return;
      var st = stretchOf_(r), all = stretchXp_(st, x);
      var types = st.discarded ? 0 : (st.types.length || st.pounds === 0 ? x.types : 0);
      out.ratings += all - types;
      var line = ratingMath_(st, x, all - types);
      if (line) out.math.push(line);
      out.types += types;
    });
    // The time bonus on its ratings and litter types (S6-P3 item 5), or the
    // left-alone bonus (item 4), whichever is more.
    var b = walkBonuses_()[collectionId];
    out.mult = b ? b.mult : 1;
    out.kind = b ? b.kind : '';
    out.bonus = round_((out.ratings + out.types) * (out.mult - 1), 2);
  }
  out.total = round_(out.plan + out.ratings + out.types + out.bonus, 2);
  return out;
}

// The time bonus: collecting a segment again a day after its clock started
// multiplies the walk's rating and litter-type XP by the most (×2 to start),
// coming down evenly to none (×1) by its last day (4 to start). Under a day,
// none: those walks give no rate, and aren't to be encouraged (|Q481).
function timeBonus_() { return { peak: Math.max(1, minutesSetting_(SETTING_TIME_PEAK, 2)), ends: minutesSetting_(SETTING_TIME_ENDS, 4) }; }
function timeMult_(days, t) {
  if (days == null || !(days >= 1) || !(t.ends > 1) || days >= t.ends) return 1;
  return round_(t.peak - (t.peak - 1) * (days - 1) / (t.ends - 1), 2);
}
// Each walk's multiplier: the highest from the rates it gave, or the
// left-alone bonus, whichever is more. { id: { mult, kind: 'time' or 'alone' } }
function walkBonuses_() {
  var t = timeBonus_(), out = {};
  ratesAll_().forEach(function (r) {
    if (r.notCounted || r.simulated) return;
    var m = timeMult_(r.days, t);
    if (m > 1 && (!out[r.collection] || m > out[r.collection].mult)) out[r.collection] = { mult: m, kind: 'time' };
  });
  var a = aloneBonus_();
  if (a.days > 0 && a.mult > 1) {
    var alone = walksLeftAlone_();
    Object.keys(alone).forEach(function (id) {
      if (alone[id] >= a.days && (!out[id] || a.mult > out[id].mult)) out[id] = { mult: a.mult, kind: 'alone' };
    });
  }
  return out;
}
function walkMults_() {
  var b = walkBonuses_(), out = {};
  Object.keys(b).forEach(function (id) { out[id] = b[id].mult; });
  return out;
}

function aloneBonus_() { return { days: minutesSetting_(SETTING_ALONE_DAYS, 14), mult: Math.max(1, minutesSetting_(SETTING_ALONE_MULT, 1.5)) }; }
// For each real walk, ended or saved: the most days any public segment it
// collected squares of had gone with none of its squares collected by anyone
// before the walk started (Infinity: never). A walk touching none isn't listed.
function walksLeftAlone_() {
  var bySquare = {};
  segmentsAll_().forEach(function (g) { if (g.accepted) g.squares.forEach(function (c) { (bySquare[c] = bySquare[c] || []).push(g.id); }); });
  var walks = {}, ends = [];
  readRows_(TABS.collections).forEach(function (q) {
    if (q.get('simulated') === 'Yes' || q.get('status') === 'Collecting' || q.get('status') === COLLECTION_DISCARDED) return;
    var s = q.get('started');
    walks[q.get('id')] = { start: s instanceof Date ? s.getTime() : 0, segs: {} };
  });
  readRows_(TABS.stretches).forEach(function (r) {
    var w = walks[r.get('collection')], e = r.get('ended');
    if (!w || r.get('discarded') === 'Yes' || !(e instanceof Date)) return;
    var segs = {};
    String(r.get('cells')).split(/\s+/).forEach(function (c) { (bySquare[c] || []).forEach(function (id) { segs[id] = true; w.segs[id] = true; }); });
    if (Object.keys(segs).length) ends.push({ t: e.getTime(), segs: Object.keys(segs) });
  });
  ends.sort(function (a, b) { return a.t - b.t; });
  var last = {}, i = 0, out = {};
  Object.keys(walks).sort(function (a, b) { return walks[a].start - walks[b].start; }).forEach(function (id) {
    var w = walks[id];
    for (; i < ends.length && ends[i].t < w.start; i++) ends[i].segs.forEach(function (g) { last[g] = ends[i].t; });
    var most = null;
    Object.keys(w.segs).forEach(function (g) { var d = last[g] ? (w.start - last[g]) / DAY_MS : Infinity; if (most == null || d > most) most = d; });
    if (most != null) out[id] = most;
  });
  return out;
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
// Each rating's math, for under Your ratings (S6-P44 item 1): the rating,
// the Litter Index, how close, and the XP it earned.
function ratingMath_(s, x, xp) {
  if (s.discarded || s.rating == null) return '';
  var head = 'Weighing ' + s.n + ': you rated ' + s.rating;
  if (s.index == null) return head + ', with no Litter Index to compare with: 0 XP';
  var i = Math.round(s.index * 10) / 10, off = Math.abs(s.rating - s.index);
  var near = off <= 1 ? 1 : off <= 2 ? 2 : off <= 3 ? 3 : 0, base = near === 1 ? x.r1 : near === 2 ? x.r2 : near === 3 ? x.r3 : 0;
  if (!near || !base) return head + ', the Litter Index was ' + i + ', more than 3 apart: 0 XP';
  return head + ', the Litter Index was ' + i + ', within ' + near + ': ' + base + ' XP' + (x.bonus > 0 ? ' × (1 + ' + Math.min(10, i) + ' ÷ ' + x.bonus + ')' : '') + ' = ' + xp + ' XP';
}
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
