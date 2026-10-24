/**
 * Collecting (S3-P21, the litter class's step 2; S3-P7's items 2 to 6, 8, 9,
 * 14 and 20). The phone keeps the collection as it goes, so a litter pulse
 * works with no signal (Q242, Q255): each stretch is sent when it's done,
 * with a key, so sending one twice keeps one. Here each is checked and kept:
 *
 * - Collections: one row per collection, from Start to End.
 * - Stretches: one row per litter pulse, with its cells, its lengths, its
 *   active time, its pounds and its reading (item 8), its litter types and
 *   visual rating (item 9).
 * - Litter Types: MoCiSN's 15 to start (Q346), and any added in the field,
 *   each person's own until HABO's staff review it (Q243, Q256).
 *
 * A collection's active time counts as volunteer hours (item 14), but none
 * for a stretch that goes on past sunset (item 20, Q381), and none of its own
 * when it's during an event its collector checked in to (Q297).
 */

var COLLECTION_COL = { id: 1, account: 2, handle: 3, started: 4, startCell: 5, ended: 6, endCell: 7, status: 8, stretches: 9,
  pounds: 10, miles: 11, active: 12, hours: 13, hoursNote: 14, lastPressed: 15, updated: 16, key: 17, hidden: 18, hiddenBy: 19, plan: 20, xp: 21 };
var STRETCH_COL = { id: 1, collection: 2, account: 3, n: 4, started: 5, ended: 6, cells: 7, streetMi: 8, offMi: 9, activeMin: 10,
  pausedMin: 11, breakMin: 12, breakWhere: 13, scale: 14, newBag: 15, pounds: 16, cpue: 17, index: 18, types: 19, rating: 20,
  discarded: 21, pastSunset: 22, track: 23, received: 24, key: 25, asked: 26, turns: 27 };
var TYPE_COL = { type: 1, addedBy: 2, status: 3, added: 4 };

// MoCiSN's 15 litter types (Q346).
var SEED_LITTER_TYPES = ['Aluminum cans', 'Electronics, wires/cables', 'Fast food packaging', 'General litter', 'Glass', 'Hygiene/PPE products',
  'Paper', 'Pet Waste Bags', 'Plastic bottles', 'Small unidentifiable hard plastics', 'Small unidentifiable metals', 'Soft plastics',
  'Tobacco product waste', 'Utility / construction debris', 'Vehicle debris'];
var TYPE_SHARED = 'Shared';
var TYPE_WAITING = 'Waiting for review';

var SETTING_SUNSET_WARN = 'Sunset warning (minutes before)';
var SETTING_NO_START = 'No new collection (minutes before sunset)';
var SETTING_AUTO_END = 'A collection left alone ends after (hours)';
var SETTING_EDIT_HOURS = 'A collection can be changed for (hours)';
// The screen while a collection starts (Jeremy, Oct 24, on |C477): sayings
// staff add in the invoicing app, one per line, shown in turn under "Starting
// your collection, please wait...".
var SETTING_START_SAYINGS = 'Sayings while a collection starts';
// Discard this collection (Oct 24, in chat): kept on the record, with no
// hours, no XP and nothing on the map, and not counted.
var COLLECTION_DISCARDED = 'Discarded';

/* ── Called from the page ── */

// Starts a collection at the cell the phone is in, or the one tapped.
function collectStart_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  requireCurrentWaiver_(account);
  var cell = cleanCell_(req.cell);
  var now = new Date();
  var sun = sunFor_(cell, now);
  var noStart = minutesSetting_(SETTING_NO_START, 15);
  if (now.getTime() >= sun.sunset - noStart * 60000 || now.getTime() < sun.sunrise) {
    throw coded_('too-late', 'No new collection can start from ' + noStart + ' minutes before sunset until sunrise. Sunrise is at ' +
      clock_(now.getTime() < sun.sunrise ? sun.sunrise : sunFor_(cell, new Date(now.getTime() + 86400000)).sunrise) + '.');
  }
  return withLock_(function () {
    endLeftAlone_(account);
    var open = openCollection_(account.id);
    if (open) return { collection: collectionView_(open), settings: collectSettings_(), pace: paceOf_(account.id), already: true, plan: planView_(planById_(open.plan)) };
    // A plan first, until there are enough collections to know the usual pace (Plan.js).
    var plan = openPlan_(account.id);
    if (!plan && planNeeded_(account.id)) throw coded_('plan-first', 'Plan your collection first: press Plan a collection.');
    var sheet = getDb_().getSheetByName(TABS.collections.name);
    var rows = readRows_(TABS.collections);
    var id = nextId_('L', rows.map(function (r) { return r.values[0]; }));
    var row = blankRow_(TABS.collections);
    row[COLLECTION_COL.id - 1] = id;
    row[COLLECTION_COL.account - 1] = account.id;
    row[COLLECTION_COL.handle - 1] = account.handle;
    row[COLLECTION_COL.started - 1] = now;
    row[COLLECTION_COL.startCell - 1] = cell;
    row[COLLECTION_COL.status - 1] = 'Collecting';
    row[COLLECTION_COL.stretches - 1] = 0;
    row[COLLECTION_COL.lastPressed - 1] = now;
    row[COLLECTION_COL.updated - 1] = now;
    row[COLLECTION_COL.key - 1] = clean_(req.key, 80);
    row[COLLECTION_COL.plan - 1] = plan ? plan.id : '';
    sheet.getRange(lastRowWith_(sheet, 1) + 1, 1, 1, row.length).setValues([row]);
    if (plan) markPlan_(plan.id, id);
    return { collection: collectionView_(readCollection_(id)), settings: collectSettings_(), pace: paceOf_(account.id), already: false, plan: planView_(plan) };
  });
}

// One stretch, from its litter pulse (or End), as the phone kept it. Sent
// again with the same key, it changes nothing.
function collectStretch_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var s = req.stretch || {};
  return withLock_(function () {
    var col = readCollection_(clean_(req.collectionId, 20));
    if (!col || col.account !== account.id) throw new Error('That collection isn\'t yours, or isn\'t here any more.');
    var key = clean_(s.key, 80);
    if (!key) throw new Error('A litter pulse came with no key.');
    var mine = readRows_(TABS.stretches).filter(function (r) { return r.get('collection') === col.id; });
    var dup = mine.filter(function (r) { return r.get('key') === key; })[0];
    if (dup) return { stretch: stretchView_(dup), collection: collectionView_(col), duplicate: true };
    var x = checkStretch_(s, col, account);
    var prev = mine.filter(function (r) { return Number(r.get('n')) < x.n; }).sort(function (a, b) { return Number(a.get('n')) - Number(b.get('n')); });
    x.pounds = x.discarded ? '' : poundsOf_(x, prev);
    var sun = sunFor_(x.cells[x.cells.length - 1] || col.startCell, new Date(x.ended));
    x.pastSunset = x.ended > sun.sunset;
    var r = x.discarded || x.pounds === '' ? { cpue: null, index: null } : LitterGeo.reading(x.pounds, (x.streetMi + x.offMi) * LitterGeo.MILE_M, x.activeMin);
    var row = blankRow_(TABS.stretches);
    var id = nextId_('S', readRows_(TABS.stretches).map(function (q) { return q.values[0]; }));
    var put = function (k, v) { row[STRETCH_COL[k] - 1] = v; };
    put('id', id); put('collection', col.id); put('account', account.id); put('n', x.n);
    put('started', new Date(x.started)); put('ended', new Date(x.ended)); put('cells', x.cells.join(' '));
    put('streetMi', round_(x.streetMi, 3)); put('offMi', round_(x.offMi, 3)); put('activeMin', round_(x.activeMin, 1));
    put('pausedMin', round_(x.pausedMin, 1)); put('breakMin', round_(x.breakMin, 1)); put('breakWhere', x.breakWhere);
    put('scale', x.scale === '' ? '' : x.scale); put('newBag', x.newBag ? 'Yes' : ''); put('pounds', x.pounds === '' ? '' : round_(x.pounds, 2));
    put('cpue', r.cpue == null ? '' : round_(r.cpue, 3)); put('index', r.index == null ? '' : round_(r.index, 3));
    put('types', safeCell_(x.types.join('; '))); put('rating', x.rating); put('discarded', x.discarded ? 'Yes' : '');
    put('pastSunset', x.pastSunset ? 'Yes' : ''); put('track', ''); put('received', new Date()); put('key', key); put('asked', x.asked ? 'Asked' : '');
    put('turns', x.turns.join(' '));
    var sheet = getDb_().getSheetByName(TABS.stretches.name);
    sheet.getRange(lastRowWith_(sheet, 1) + 1, 1, 1, row.length).setValues([row]);
    var cs = getDb_().getSheetByName(TABS.collections.name);
    cs.getRange(col.row, COLLECTION_COL.lastPressed).setValue(new Date(x.ended));
    retotal_(col.id);
    return { stretch: stretchView_(readRows_(TABS.stretches).filter(function (q) { return q.get('key') === key; })[0]), collection: collectionView_(readCollection_(col.id)) };
  });
}

// End: the last litter pulse has already come as a stretch; this stops the
// clock at the time shown, which can be changed to an earlier one (Q285).
function collectEnd_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  return withLock_(function () {
    var col = readCollection_(clean_(req.collectionId, 20));
    if (!col || col.account !== account.id) throw new Error('That collection isn\'t yours, or isn\'t here any more.');
    if (col.status !== 'Collecting') return { collection: collectionView_(col), already: true };
    var stretches = stretchesOf_(col.id);
    var last = stretches[stretches.length - 1];
    var ended = Number(req.endedAt) || Date.now();
    if (last && ended < last.ended) ended = last.ended;
    var cs = getDb_().getSheetByName(TABS.collections.name);
    cs.getRange(col.row, COLLECTION_COL.ended).setValue(new Date(ended));
    cs.getRange(col.row, COLLECTION_COL.endCell).setValue(last ? last.cells[last.cells.length - 1] : col.startCell);
    cs.getRange(col.row, COLLECTION_COL.status).setValue('Ended');
    retotal_(col.id);
    setPlanXp_(col.id);
    return { collection: collectionView_(readCollection_(col.id)), stretches: stretchesOf_(col.id).map(stretchViewOf_) };
  });
}

// Discard this collection (Oct 24, in chat), while it's going: it ends here,
// marked Discarded, and stays on the record with its stretches, but has no
// hours, no XP and nothing on the map, and doesn't count toward the plans'
// and break question's number. Its plan can start the next collection.
function collectDiscard_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  return withLock_(function () {
    var col = readCollection_(clean_(req.collectionId, 20));
    if (!col || col.account !== account.id) throw new Error('That collection isn\'t yours, or isn\'t here any more.');
    if (col.status !== 'Collecting') throw new Error('That collection has already ended, so it can\'t be discarded.');
    var stretches = stretchesOf_(col.id);
    var last = stretches[stretches.length - 1];
    var cs = getDb_().getSheetByName(TABS.collections.name);
    cs.getRange(col.row, COLLECTION_COL.ended).setValue(new Date());
    cs.getRange(col.row, COLLECTION_COL.endCell).setValue(last ? last.cells[last.cells.length - 1] : col.startCell);
    cs.getRange(col.row, COLLECTION_COL.status).setValue(COLLECTION_DISCARDED);
    retotal_(col.id);
    if (col.plan) markPlan_(col.plan, '');
    logChange_(account.first + ' ' + account.last, 'Discarded', col.id, 'Status', 'Collecting', COLLECTION_DISCARDED);
    return { collection: collectionView_(readCollection_(col.id)), hours: hoursOf_(account.id), plan: planView_(openPlan_(account.id)),
      planNeeded: planNeeded_(account.id), xp: xpOf_(account.id) };
  });
}

// The summary's fixes, after End (Q252, Q253): a stretch's pounds, litter
// types, visual rating, and its cells with their lengths; or the track
// from a recorder's GPX file, when it's chosen (Q227, Q228). For 48 hours,
// a setting (Q294).
function collectFix_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  return withLock_(function () {
    var r = readRows_(TABS.stretches).filter(function (q) { return q.get('id') === clean_(req.stretchId, 20); })[0];
    if (!r || r.get('account') !== account.id) throw new Error('That stretch isn\'t yours, or isn\'t here any more.');
    var col = readCollection_(r.get('collection'));
    var hours = minutesSetting_(SETTING_EDIT_HOURS, 48);
    var from = col.ended ? new Date(col.ended).getTime() : Date.now();
    if (Date.now() - from > hours * 3600000) throw new Error('A collection can be changed for ' + hours + ' hours after it ends. After that, ask HABO\'s staff.');
    var f = req.fix || {};
    var sheet = getDb_().getSheetByName(TABS.stretches.name);
    var who = account.first + ' ' + account.last, item = r.get('id') + ' (' + col.id + ')';
    var set = function (k, label, v) {
      var before = r.get(k);
      if (String(before) === String(v)) return;
      sheet.getRange(r.row, STRETCH_COL[k]).setValue(v);
      logChange_(who, 'Fixed', item, label, before, v);
    };
    if (f.pounds != null && r.get('discarded') !== 'Yes') set('pounds', 'Pounds', round_(poundsValue_(f.pounds), 2));
    if (f.types) set('types', 'Litter types', safeCell_(cleanTypes_(f.types, account).join('; ')));
    if (f.rating !== undefined) set('rating', 'Visual rating', cleanRating_(f.rating));
    if (f.cells) {
      var cells = cleanCells_(f.cells);
      if (!cells.length) throw new Error('A stretch needs at least one cell.');
      set('cells', 'Cells', cells.join(' '));
      set('streetMi', 'Street miles', round_(milesValue_(f.streetMi), 3));
      set('offMi', 'Off-street miles', round_(milesValue_(f.offMi), 3));
      if (f.fromTrack) set('track', 'From the track', 'Yes');
    }
    // A break entered afterward comes off the stretch's time (item 6), once
    // the break question has asked about it (item 7, S3-P22).
    if (f.breakMin != null && r.get('discarded') !== 'Yes') {
      var brk = nonNegative_(f.breakMin);
      var whole = (new Date(r.get('ended')).getTime() - new Date(r.get('started')).getTime()) / 60000 - (Number(r.get('pausedMin')) || 0);
      if (brk > whole) throw new Error('The break is longer than the stretch (' + Math.round(whole) + ' minutes).');
      set('breakMin', 'Break minutes', round_(brk, 1));
      set('breakWhere', 'Break where', brk ? (f.breakWhere === 'Not sure' || !f.breakWhere ? 'Not sure' : cleanCell_(f.breakWhere)) : '');
      set('activeMin', 'Active minutes', round_(Math.max(0, whole - brk), 1));
    }
    if (f.breakAsked) set('asked', 'Break question', 'Asked');
    // The reading again, from what it has now.
    var now = readRows_(TABS.stretches).filter(function (q) { return q.get('id') === r.get('id'); })[0];
    var lbs = now.get('pounds') === '' ? null : Number(now.get('pounds'));
    var rd = lbs == null ? { cpue: null, index: null } : LitterGeo.reading(lbs, (Number(now.get('streetMi')) + Number(now.get('offMi'))) * LitterGeo.MILE_M, Number(now.get('activeMin')));
    sheet.getRange(r.row, STRETCH_COL.cpue, 1, 2).setValues([[rd.cpue == null ? '' : round_(rd.cpue, 3), rd.index == null ? '' : round_(rd.index, 3)]]);
    retotal_(col.id);
    return { stretch: stretchView_(readRows_(TABS.stretches).filter(function (q) { return q.get('id') === r.get('id'); })[0]), collection: collectionView_(readCollection_(col.id)) };
  });
}

// The collection open on this phone, or the last one, with its stretches,
// and the account's hours, for the page to open where it left off.
function collectLoad_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  withLock_(function () { endLeftAlone_(account); });
  var id = clean_(req.collectionId, 20);
  var col = id ? readCollection_(id) : openCollection_(account.id);
  if (col && col.account !== account.id) col = null;
  return {
    collection: col ? collectionView_(col) : null, stretches: col ? stretchesOf_(col.id).map(stretchViewOf_) : [],
    settings: collectSettings_(), types: typesFor_(account), hours: hoursOf_(account.id), pace: paceOf_(account.id),
    plan: planView_(openPlan_(account.id)), planNeeded: planNeeded_(account.id), xp: xpOf_(account.id)
  };
}

// A litter type added in the field: this person's to use until HABO's staff
// review it (Q243, Q256).
function addLitterType_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var name = clean_(req.type, 60).replace(/\s+/g, ' ');
  if (name.length < 2) throw new Error('Type the litter type\'s name.');
  return withLock_(function () {
    var have = typesFor_(account);
    var same = have.filter(function (t) { return t.toLowerCase() === name.toLowerCase(); })[0];
    if (same) return { types: have, added: same };
    var sheet = getDb_().getSheetByName(TABS.types.name);
    sheet.getRange(lastRowWith_(sheet, 1) + 1, 1, 1, 4).setValues([[safeCell_(name), account.id, TYPE_WAITING, new Date()]]);
    logChange_(account.first + ' ' + account.last, 'Added', 'Litter type', 'Type', '', name);
    return { types: typesFor_(account), added: name };
  });
}

/* ── Checking what the phone sent ── */

function checkStretch_(s, col, account) {
  var n = Math.floor(Number(s.n));
  if (!(n >= 1 && n <= 500)) throw new Error('A litter pulse came with no number.');
  var started = Number(s.startedAt), ended = Number(s.endedAt);
  var colStart = new Date(col.started).getTime();
  if (!(started >= colStart - 60000) || !(ended >= started) || ended > Date.now() + 5 * 60000) throw new Error('A litter pulse\'s times don\'t fit its collection.');
  var cells = cleanCells_(s.cells);
  if (!cells.length) throw new Error('A stretch needs at least one cell.');
  var pausedMin = nonNegative_(s.pausedMin), breakMin = nonNegative_(s.breakMin);
  var activeMin = Math.max(0, (ended - started) / 60000 - pausedMin - breakMin);
  var discarded = s.discarded === true;
  var scale = discarded ? '' : poundsValue_(s.scale);
  return {
    n: n, started: started, ended: ended, cells: cells, streetMi: milesValue_(s.streetMi), offMi: milesValue_(s.offMi),
    pausedMin: pausedMin, breakMin: breakMin, breakWhere: s.breakWhere === 'Not sure' ? 'Not sure' : s.breakWhere ? cleanCell_(s.breakWhere) : '',
    activeMin: activeMin, scale: scale, newBag: s.newBag === true, discarded: discarded, asked: s.breakAsked === true,
    turns: cleanCells_(s.turns).filter(function (t) { return cells.indexOf(t) !== -1; }).slice(0, 50),
    types: discarded ? [] : cleanTypes_(s.types || [], account), rating: discarded ? '' : cleanRating_(s.rating)
  };
}

// The stretch's pounds: what the scale shows now, less what it showed at the
// last weighing of the same bag (item 5). A new bag, or a discarded stretch
// just before (Discard starts a new bag, Q389), starts again from nothing.
function poundsOf_(x, prev) {
  var before = 0;
  for (var k = prev.length - 1; k >= 0; k--) {
    var p = prev[k];
    if (p.get('discarded') === 'Yes' || p.get('newBag') === 'Yes') break;
    if (p.get('scale') !== '') { before = Number(p.get('scale')); break; }
  }
  var lbs = x.scale - before;
  if (lbs < 0) throw new Error('The scale shows less than at your last litter pulse (' + before + ' lb). If you started a new bag, tick New bag at that pulse.');
  return lbs;
}

function poundsValue_(v) {
  var n = Number(String(v == null ? '' : v).replace(/[^\d.]/g, ''));
  if (String(v).trim() === '' || !(n >= 0) || n > 500) throw new Error('Type what the scale shows, in pounds, like 3.25.');
  return Math.round(n * 100) / 100;
}
function milesValue_(v) {
  var n = Number(v);
  if (!(n >= 0) || n > 50) throw new Error('A stretch\'s length doesn\'t look right.');
  return n;
}
function nonNegative_(v) { var n = Number(v); return n > 0 && n < 24 * 60 ? n : 0; }
function cleanCell_(v) {
  var c = String(v == null ? '' : v).trim();
  if (!/^-?\d{1,7}_-?\d{1,7}$/.test(c)) throw new Error('Tap the cell you\'re in on the map.');
  return c;
}
function cleanCells_(list) {
  var out = [];
  (Array.isArray(list) ? list : String(list || '').split(/\s+/)).forEach(function (c) { if (String(c).trim()) out.push(cleanCell_(c)); });
  return out.slice(0, 2000);
}
function cleanTypes_(list, account) {
  var known = account ? typesFor_(account) : null;
  var out = [];
  (list || []).forEach(function (t) {
    var v = clean_(t, 60).replace(/\s+/g, ' ');
    if (v && out.indexOf(v) === -1 && (!known || known.indexOf(v) !== -1)) out.push(v);
  });
  return out.slice(0, 40);
}
function cleanRating_(v) {
  if (v === '' || v == null) return '';
  var n = Math.round(Number(v));
  if (!(n >= 0 && n <= 10)) throw new Error('The visual rating is 0 to 10, or blank.');
  return n;
}

/* ── Reading and totals ── */

function readRows_(tab) {
  var sheet = getDb_().getSheetByName(tab.name);
  var last = lastRowWith_(sheet, 1);
  if (last < 2) return [];
  var cols = tab === TABS.collections ? COLLECTION_COL : tab === TABS.stretches ? STRETCH_COL : tab === TABS.plans ? PLAN_COL : TYPE_COL;
  return sheet.getRange(2, 1, last - 1, tab.header.length).getValues().map(function (values, i) {
    return { row: i + 2, values: values, get: function (k) { var v = values[cols[k] - 1]; return v instanceof Date ? v : String(v == null ? '' : v).trim(); } };
  }).filter(function (r) { return String(r.values[0]).trim(); });
}

function blankRow_(tab) { return tab.header.map(function () { return ''; }); }

function readCollection_(id) {
  var r = readRows_(TABS.collections).filter(function (q) { return q.get('id') === id; })[0];
  return r ? collectionOf_(r) : null;
}

// A Collections row as a collection, its times in milliseconds.
function collectionOf_(r) {
  var t = function (k) { var v = r.get(k); return v instanceof Date ? v.getTime() : v; };
  return { row: r.row, id: t('id'), account: t('account'), handle: t('handle'), started: t('started'), startCell: t('startCell'),
    ended: t('ended'), endCell: t('endCell'), status: t('status'), stretches: Number(t('stretches')) || 0, pounds: Number(t('pounds')) || 0,
    miles: Number(t('miles')) || 0, active: Number(t('active')) || 0, hours: Number(t('hours')) || 0, hoursNote: t('hoursNote'), lastPressed: t('lastPressed'),
    hidden: !!t('hidden'), plan: t('plan'), xp: Number(t('xp')) || 0 };
}

function openCollection_(accountId) {
  var r = readRows_(TABS.collections).filter(function (q) { return q.get('account') === accountId && q.get('status') === 'Collecting'; }).pop();
  return r ? readCollection_(r.get('id')) : null;
}

function stretchesOf_(collectionId) {
  return readRows_(TABS.stretches).filter(function (q) { return q.get('collection') === collectionId; })
    .sort(function (a, b) { return Number(a.get('n')) - Number(b.get('n')); })
    .map(stretchOf_);
}

// A Stretches row as a stretch, its times in milliseconds.
function stretchOf_(q) {
  var ms = function (k) { var v = q.get(k); return v instanceof Date ? v.getTime() : Number(v) || 0; };
  return { row: q.row, id: q.get('id'), n: Number(q.get('n')), started: ms('started'), ended: ms('ended'), cells: String(q.get('cells')).split(/\s+/).filter(String),
    streetMi: Number(q.get('streetMi')) || 0, offMi: Number(q.get('offMi')) || 0, activeMin: Number(q.get('activeMin')) || 0,
    pounds: q.get('pounds') === '' ? null : Number(q.get('pounds')), cpue: q.get('cpue') === '' ? null : Number(q.get('cpue')),
    index: q.get('index') === '' ? null : Number(q.get('index')), types: String(q.get('types')).split('; ').filter(String),
    rating: q.get('rating') === '' ? null : Number(q.get('rating')), discarded: q.get('discarded') === 'Yes', pastSunset: q.get('pastSunset') === 'Yes',
    newBag: q.get('newBag') === 'Yes', track: q.get('track') === 'Yes', key: q.get('key'),
    pausedMin: Number(q.get('pausedMin')) || 0, breakMin: Number(q.get('breakMin')) || 0, breakWhere: q.get('breakWhere'), asked: q.get('asked') === 'Asked',
    turns: String(q.get('turns')).split(/\s+/).filter(String) };
}

function stretchView_(q) { return stretchViewOf_(stretchesOf_(q.get('collection')).filter(function (s) { return s.id === q.get('id'); })[0]); }
function stretchViewOf_(s) {
  var out = {};
  Object.keys(s).forEach(function (k) { if (k !== 'row') out[k] = s[k]; });
  return out;
}
function collectionView_(c) {
  var out = {};
  Object.keys(c).forEach(function (k) { if (k !== 'row') out[k] = c[k]; });
  return out;
}

// A collection's totals and volunteer hours, from its stretches.
function retotal_(collectionId) {
  var col = readCollection_(collectionId);
  var list = stretchesOf_(collectionId);
  var pounds = 0, miles = 0, active = 0, counted = 0;
  list.forEach(function (s) {
    if (s.pounds != null) pounds += s.pounds;
    if (!s.discarded) miles += s.streetMi + s.offMi;
    active += s.activeMin;
    // A discarded stretch's time still counts (Q302); one past sunset none at all (Q381).
    if (!s.pastSunset) counted += s.activeMin;
  });
  var note = list.some(function (s) { return s.pastSunset; }) ? 'No hours for stretches past sunset' : '';
  var event = col.status === 'Collecting' || col.status === COLLECTION_DISCARDED ? null : eventDuring_(col);
  if (event) { counted = 0; note = 'During ' + event + ', checked in: its hours count'; }
  if (col.status === COLLECTION_DISCARDED) { counted = 0; note = 'Discarded: no hours'; }
  var sheet = getDb_().getSheetByName(TABS.collections.name);
  sheet.getRange(col.row, COLLECTION_COL.stretches, 1, 6).setValues([[list.length, round_(pounds, 2), round_(miles, 3), round_(active, 1), round_(counted / 60, 2), note]]);
  sheet.getRange(col.row, COLLECTION_COL.updated).setValue(new Date());
}

// The account's volunteer hours collecting litter (Q387 (a)).
function hoursOf_(accountId) {
  var cols = readRows_(TABS.collections).filter(function (q) { return q.get('account') === accountId && q.get('status') !== 'Collecting' && q.get('status') !== COLLECTION_DISCARDED; });
  return { collections: cols.length, hours: round_(cols.reduce(function (t, q) { return t + (Number(q.get('hours')) || 0); }, 0), 2) };
}

// A collection left alone ends by itself 12 hours (a setting) after the last
// thing pressed, keeping the stretches already sent (Q303).
function endLeftAlone_(account) {
  var hours = minutesSetting_(SETTING_AUTO_END, 12);
  readRows_(TABS.collections).filter(function (q) { return q.get('account') === account.id && q.get('status') === 'Collecting'; }).forEach(function (q) {
    var last = q.get('lastPressed');
    var at = last instanceof Date ? last.getTime() : 0;
    if (Date.now() - at < hours * 3600000) return;
    var sheet = getDb_().getSheetByName(TABS.collections.name);
    var list = stretchesOf_(q.get('id'));
    sheet.getRange(q.row, COLLECTION_COL.ended).setValue(new Date(at));
    sheet.getRange(q.row, COLLECTION_COL.endCell).setValue(list.length ? list[list.length - 1].cells.slice(-1)[0] : q.get('startCell'));
    sheet.getRange(q.row, COLLECTION_COL.status).setValue('Ended by itself');
    retotal_(q.get('id'));
    setPlanXp_(q.get('id'));
  });
}

// The check-in event this collection was during, that its collector checked
// in to, by name; or ''. Read only from the check-in's Sheet.
function eventDuring_(col) {
  var account = readAccounts_().filter(function (a) { return a.id === col.account; })[0];
  if (!account || !account.volunteer) return '';
  try {
    var book = SpreadsheetApp.openById(driveId_(getSetting_(SETTING_CHECKIN_SHEET).trim()));
    var ci = book.getSheetByName('Check-ins'), ev = book.getSheetByName('Events');
    if (!ci || !ev || ci.getLastRow() < 2) return '';
    var mine = {};
    ci.getRange(2, 1, ci.getLastRow() - 1, 5).getDisplayValues().forEach(function (r) { if (String(r[4]).trim() === account.volunteer) mine[String(r[2]).trim()] = true; });
    var rows = ev.getRange(2, 1, Math.max(1, lastRowWith_(ev, 1) - 1), 5).getDisplayValues();
    var a = col.started, b = col.ended || Date.now();
    for (var i = 0; i < rows.length; i++) {
      var r = rows[i], id = String(r[0]).trim();
      if (!mine[id]) continue;
      var w = eventWindow_(r[2], r[3], r[4]);
      if (w && a < w.end && b > w.start) return String(r[1]).trim();
    }
  } catch (err) {
    console.warn('The check-in\'s events couldn\'t be read: ' + err);
  }
  return '';
}

// An event's Date, Start and End as shown ("Fri, Oct 23, 2026", "9:00 AM").
function eventWindow_(date, start, end) {
  var MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var d = /([A-Z][a-z]{2}) (\d{1,2}), (\d{4})/.exec(String(date)) || [];
  var ymd = d[3] ? d[3] + '-' + ('0' + (MON.indexOf(d[1]) + 1)).slice(-2) + '-' + ('0' + d[2]).slice(-2) : (/^\d{4}-\d{2}-\d{2}/.exec(String(date)) || [''])[0];
  var hm = function (t) {
    var m = /(\d{1,2}):(\d{2})\s*([AP]M)?/i.exec(String(t));
    if (!m) return '';
    var h = Number(m[1]) % 12 + (m[3] && /p/i.test(m[3]) ? 12 : m[3] ? 0 : Number(m[1]) >= 12 ? 12 : 0);
    if (!m[3]) h = Number(m[1]);
    return ('0' + h).slice(-2) + ':' + m[2];
  };
  var s = hm(start), e = hm(end);
  if (!ymd || !s || !e) return null;
  var tz = Session.getScriptTimeZone();
  return { start: Utilities.parseDate(ymd + ' ' + s, tz, 'yyyy-MM-dd HH:mm').getTime(), end: Utilities.parseDate(ymd + ' ' + e, tz, 'yyyy-MM-dd HH:mm').getTime() };
}

/* ── Litter types ── */

// The shared list, and this person's own waiting for review.
function typesFor_(account) {
  var rows = readRows_(TABS.types);
  return rows.filter(function (r) { return r.get('status') === TYPE_SHARED || (r.get('status') === TYPE_WAITING && r.get('addedBy') === account.id); })
    .map(function (r) { return r.get('type'); });
}

/* ── Sunset, settings ── */

// Sunrise and sunset at a cell on the day of `at`, in Central (item 20).
function sunFor_(cell, at) {
  var c = LitterGeo.cellCenter(cell);
  var ymd = Utilities.formatDate(at, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  var noon = Utilities.parseDate(ymd + ' 12:00', Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm').getTime();
  return LitterGeo.sunTimes(noon, c.lat, c.lon);
}

function clock_(ms) { return Utilities.formatDate(new Date(ms), Session.getScriptTimeZone(), 'h:mm a'); }

function minutesSetting_(name, fallback) {
  var n = Number(getSetting_(name));
  return getSetting_(name).trim() !== '' && n >= 0 ? n : fallback;
}

function collectSettings_() {
  return { sunsetWarnMin: minutesSetting_(SETTING_SUNSET_WARN, 60), noStartMin: minutesSetting_(SETTING_NO_START, 15),
    autoEndHours: minutesSetting_(SETTING_AUTO_END, 12), editHours: minutesSetting_(SETTING_EDIT_HOURS, 48),
    breakAfter: minutesSetting_(SETTING_BREAK_AFTER, 10), planXp: minutesSetting_(SETTING_PLAN_XP, 1), colours: mapColours_(),
    sayings: String(getSetting_(SETTING_START_SAYINGS) || '').split(/\r?\n/).map(function (t) { return t.trim(); }).filter(String).slice(0, 50) };
}

function round_(n, places) { var f = Math.pow(10, places); return Math.round(Number(n) * f) / f; }
