/**
 * Challenges (S6-P8, |Q661 (a), |M669, |M846): one task an admin builds in
 * Admin Mode that earns XP. A Quest groups Challenges (|Q661 (a)).
 *
 * Two kinds, built from a toolbox of what a phone can do:
 * - Items: the player sends things built from the toolbox's actions (a place
 *   from the phone's GPS, a photo, a note), each reviewed in Reviews. An
 *   approved one earns the Challenge's XP each, or its XP near a segment
 *   when it's within that many metres of a public segment.
 * - Walk goal: miles collected across different segments, between the
 *   Challenge's dates, counted from walks with their GPX track: XP per
 *   0.01 mi up to the goal, times the finishing multiplier once the miles
 *   and the segments are both met.
 * The fields an admin fills in say what the screen says (Says), when (From
 * and To, blank for any time), where (near a segment), and why (Why). An
 * Items Challenge opens at a level, a Litter Class Skill of its own (0 opens
 * it to everyone). The first, seeded once, is trash receptacles (|Q655).
 */
var CHALLENGE_COL = { id: 1, name: 2, says: 3, why: 4, kind: 5, actions: 6, near: 7, xpEach: 8, xpNear: 9, milesGoal: 10, segGoal: 11, xpPer: 12, mult: 13,
  from: 14, to: 15, level: 16, state: 17, by: 18, made: 19 };
var ITEM_COL = { id: 1, challenge: 2, account: 3, sent: 4, lat: 5, lon: 6, acc: 7, photo: 8, note: 9, state: 10, near: 11, xp: 12 };
var CHALLENGE_KINDS = ['Items', 'Walk goal'];
var CHALLENGE_ACTIONS = ['Place', 'Photo', 'Note'];
var SETTING_CHALLENGE_PHOTOS = 'Challenge photos folder';
var CHALLENGE_PHOTO_MAX = 2500000;   // characters of a photo sent, about 1.8 MB

/* ── Reading ── */

function challengesAll_() {
  return readRows_(TABS.challenges, CHALLENGE_COL).map(function (r) {
    var d = function (k) { var v = r.get(k); return v instanceof Date ? v.getTime() : 0; };
    var n = function (k) { var v = Number(r.get(k)); return r.get(k) === '' || !isFinite(v) ? 0 : v; };
    return { row: r.row, id: r.get('id'), name: r.get('name'), says: r.get('says'), why: r.get('why'), kind: r.get('kind') === 'Walk goal' ? 'Walk goal' : 'Items',
      actions: String(r.get('actions')).split(/\s*,\s*/).filter(function (a) { return CHALLENGE_ACTIONS.indexOf(a) !== -1; }),
      near: n('near'), xpEach: n('xpEach'), xpNear: n('xpNear'), milesGoal: n('milesGoal'), segGoal: Math.floor(n('segGoal')), xpPer: n('xpPer'), mult: n('mult') || 1,
      from: d('from'), to: d('to'), level: Math.max(0, Math.floor(n('level'))), state: /^\s*r/i.test(r.get('state')) ? 'Retired' : 'Open', by: r.get('by'), made: d('made') };
  }).filter(function (c) { return c.id; });
}

function challengeItemsAll_() {
  return readRows_(TABS.challengeItems, ITEM_COL).map(function (r) {
    var t = r.get('sent');
    return { row: r.row, id: r.get('id'), challenge: r.get('challenge'), account: r.get('account'), sent: t instanceof Date ? t.getTime() : 0,
      lat: r.get('lat') === '' ? null : Number(r.get('lat')), lon: r.get('lon') === '' ? null : Number(r.get('lon')), acc: r.get('acc') === '' ? null : Number(r.get('acc')),
      photo: r.get('photo'), note: r.get('note'), state: r.get('state') || 'Waiting', near: r.get('near'), xp: Number(r.get('xp')) || 0 };
  }).filter(function (x) { return x.id; });
}

// Between its dates: From's day from its start, To's day to its end.
function challengeLive_(c, at) {
  return c.state === 'Open' && (!c.from || at >= c.from) && (!c.to || at < c.to + DAY_MS);
}

// The public segment nearest a place, within `metres` of one of its squares.
function nearSegment_(lat, lon, metres) {
  if (!(metres > 0) || lat == null || lon == null) return '';
  var p = LitterGeo.xy(lat, lon), best = null;
  segmentsAll_().forEach(function (g) {
    if (!g.accepted) return;
    g.squares.forEach(function (cell) {
      var c = LitterGeo.cellCenter(cell), d = LitterGeo.dist(p, LitterGeo.xy(c.lat, c.lon)) - LitterGeo.CELL_M / 2;
      if (d <= metres && (!best || d < best.d)) best = { id: g.id, d: d };
    });
  });
  return best ? best.id : '';
}

// A walk goal's progress for one player: miles and different segments in its dates.
function walkGoal_(c, accountId) {
  var from = c.from || 0, to = c.to ? c.to + DAY_MS : Infinity, ids = {}, miles = 0;
  readRows_(TABS.collections).forEach(function (q) {
    if (q.get('account') !== accountId || q.get('simulated') === 'Yes' || !String(q.get('track')).trim() || q.get('status') !== 'Ended') return;
    var e = q.get('ended'), at = e instanceof Date ? e.getTime() : 0;
    if (at < from || at >= to) return;
    ids[q.get('id')] = true;
    miles += Number(q.get('miles')) || 0;
  });
  var segs = {};
  ratesAll_().forEach(function (r) { if (ids[r.collection] && !r.simulated) segs[r.segment] = true; });
  var n = Object.keys(segs).length, done = miles >= c.milesGoal && n >= c.segGoal && c.milesGoal > 0;
  var counted = c.milesGoal > 0 ? Math.min(miles, c.milesGoal) : miles;
  var xp = Math.floor(counted / 0.01 + 1e-9) * c.xpPer * (done ? c.mult : 1);
  return { miles: round_(miles, 3), segments: n, done: done, xp: round_(xp, 2) };
}

// The XP a player's Challenges earned: approved items, and walk goals.
function challengeXp_(accountId) {
  var xp = 0;
  challengeItemsAll_().forEach(function (x) { if (x.account === accountId && x.state === 'Approved') xp += x.xp; });
  challengesAll_().forEach(function (c) { if (c.kind === 'Walk goal') xp += walkGoal_(c, accountId).xp; });
  return round_(xp, 2);
}

// What an approved item earns, by its Challenge's fields.
function itemXp_(c, item) { return item.near && c.xpNear ? c.xpNear : c.xpEach; }

/* ── The player's side ── */

function challengeView_(c, account, level, items, now) {
  var mine = items.filter(function (x) { return x.challenge === c.id && x.account === account.id; }).map(function (x) {
    return { id: x.id, sent: x.sent, state: x.state, xp: x.state === 'Approved' ? x.xp : 0, note: x.note, near: x.near, lat: x.lat, lon: x.lon };
  });
  return { id: c.id, name: c.name, says: c.says, why: c.why, kind: c.kind, actions: c.actions, near: c.near, xpEach: c.xpEach, xpNear: c.xpNear,
    milesGoal: c.milesGoal, segGoal: c.segGoal, xpPer: c.xpPer, mult: c.mult, from: c.from, to: c.to, level: c.kind === 'Items' ? c.level : 0,
    live: challengeLive_(c, now), locked: c.kind === 'Items' && level < c.level, state: c.state, mine: mine,
    goal: c.kind === 'Walk goal' ? walkGoal_(c, account.id) : null };
}

// Your Challenges: each one open now, and any you've sent something to.
function challengesLoad_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  return challengesFor_(account);
}
function challengesFor_(account) {
  var now = Date.now(), items = challengeItemsAll_(), level = levelOf_(xpOf_(account.id), levelRanges_());
  var list = challengesAll_().filter(function (c) {
    return challengeLive_(c, now) || items.some(function (x) { return x.challenge === c.id && x.account === account.id; });
  }).map(function (c) { return challengeView_(c, account, level, items, now); });
  return { challenges: list, level: level, canBuild: !!account.rank && rankAtLeast_(account.rank, 'Builder') };
}

// An item sent for a Challenge: its place, its photo, its note.
function challengeSend_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var c = challengesAll_().filter(function (x) { return x.id === clean_(req.challengeId, 20); })[0];
  if (!c) throw new Error('That Challenge isn\'t here any more.');
  if (c.kind !== 'Items') throw new Error(c.name + ' is counted from your walks: there\'s nothing to send.');
  if (!challengeLive_(c, Date.now())) throw new Error(c.name + ' isn\'t open now.');
  var level = levelOf_(xpOf_(account.id), levelRanges_());
  if (level < c.level) throw new Error(c.name + ' unlocks at Level ' + c.level + '. You\'re at Level ' + level + '.');
  var lat = req.lat == null || req.lat === '' ? null : Number(req.lat), lon = req.lon == null || req.lon === '' ? null : Number(req.lon);
  var acc = req.acc == null || req.acc === '' ? null : Number(req.acc), note = clean_(req.note, 1000), photo = String(req.photo || '');
  if (c.actions.indexOf('Place') !== -1 && !(isFinite(lat) && isFinite(lon) && lat !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) throw new Error('Add its place: press Use my location.');
  if (c.actions.indexOf('Photo') !== -1 && !photo) throw new Error('Add its photo.');
  if (c.actions.indexOf('Note') !== -1 && c.actions.length === 1 && !note) throw new Error('Write its note.');
  if (photo && (photo.length > CHALLENGE_PHOTO_MAX || !/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(photo))) throw new Error('That photo can\'t be sent. Take it again.');
  var fileId = '';
  if (photo) {
    var type = /^data:image\/png/.test(photo) ? 'image/png' : 'image/jpeg';
    var blob = Utilities.newBlob(Utilities.base64Decode(photo.split(',')[1]), type, c.name + ' ' + (account.handle || account.id) + ' ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HHmm') + (type === 'image/png' ? '.png' : '.jpg'));
    fileId = challengePhotosFolder_().createFile(blob).getId();
  }
  var near = c.actions.indexOf('Place') !== -1 ? nearSegment_(lat, lon, c.near) : '';
  return withLock_(function () {
    var sheet = getDb_().getSheetByName(TABS.challengeItems.name);
    var ids = challengeItemsAll_().map(function (x) { return x.id; });
    var row = blankRow_(TABS.challengeItems);
    row[ITEM_COL.id - 1] = nextId_('CI', ids); row[ITEM_COL.challenge - 1] = c.id; row[ITEM_COL.account - 1] = account.id; row[ITEM_COL.sent - 1] = new Date();
    row[ITEM_COL.lat - 1] = lat == null ? '' : round_(lat, 6); row[ITEM_COL.lon - 1] = lon == null ? '' : round_(lon, 6); row[ITEM_COL.acc - 1] = acc == null || !isFinite(acc) ? '' : Math.round(acc);
    row[ITEM_COL.photo - 1] = fileId; row[ITEM_COL.note - 1] = safeCell_(note); row[ITEM_COL.state - 1] = 'Waiting'; row[ITEM_COL.near - 1] = near; row[ITEM_COL.xp - 1] = '';
    sheet.getRange(lastRowWith_(sheet, ITEM_COL.id) + 1, 1, 1, row.length).setValues([row]);
    return challengesFor_(account);
  });
}

// Where the photos go: a folder beside the litter Sheet, made the first time.
function challengePhotosFolder_() {
  var link = getSetting_(SETTING_CHALLENGE_PHOTOS).trim();
  if (link) {
    try { return DriveApp.getFolderById(driveId_(link)); }
    catch (err) { throw new Error('The "' + SETTING_CHALLENGE_PHOTOS + '" link in Settings can\'t be opened. Fix or clear it, then try again.'); }
  }
  return withLock_(function () {
    settingsMemo_ = null;
    var again = getSetting_(SETTING_CHALLENGE_PHOTOS).trim();
    if (again) return DriveApp.getFolderById(driveId_(again));
    var parents = DriveApp.getFileById(getDb_().getId()).getParents();
    var folder = (parents.hasNext() ? parents.next() : DriveApp.getRootFolder()).createFolder('Litter challenge photos');
    setSetting_(SETTING_CHALLENGE_PHOTOS, folder.getUrl());
    return folder;
  });
}

// An item's photo, for its review or for the player who sent it.
function challengePhoto_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var x = challengeItemsAll_().filter(function (i) { return i.id === clean_(req.itemId, 20); })[0];
  if (!x || !x.photo) throw new Error('That photo isn\'t here.');
  if (x.account !== account.id && !account.rank) throw new Error('That photo isn\'t yours to see.');
  var blob = DriveApp.getFileById(x.photo).getBlob();
  return { photo: 'data:' + (blob.getContentType() || 'image/jpeg') + ';base64,' + Utilities.base64Encode(blob.getBytes()) };
}

/* ── Admin Mode: building them ── */

function challengesAdmin_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!account.rank) throw new Error('Challenges are built by HABO\'s admins.');
  return challengesAdminView_(account);
}
function challengesAdminView_(account) {
  var items = challengeItemsAll_();
  return { challenges: challengesAll_().map(function (c) {
    var out = {};
    Object.keys(c).forEach(function (k) { if (k !== 'row') out[k] = c[k]; });
    out.sent = items.filter(function (x) { return x.challenge === c.id; }).length;
    out.waiting = items.filter(function (x) { return x.challenge === c.id && x.state === 'Waiting'; }).length;
    return out;
  }), canBuild: rankAtLeast_(account.rank, 'Builder'), kinds: CHALLENGE_KINDS, actions: CHALLENGE_ACTIONS };
}

// A Challenge made or changed, by a Builder or above.
function challengeSave_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!account.rank || !rankAtLeast_(account.rank, 'Builder')) throw new Error('A Builder or above builds Challenges.');
  var x = req.challenge || {};
  var name = clean_(x.name, 80), says = clean_(x.says, 1000), why = clean_(x.why, 1000), kind = CHALLENGE_KINDS.indexOf(x.kind) !== -1 ? x.kind : '';
  if (!name) throw new Error('Give it a name.');
  if (!kind) throw new Error('Choose what kind it is: Items or Walk goal.');
  if (!says) throw new Error('Say what the screen says: what to do.');
  var num = function (k, label, max, whole) {
    var v = x[k] === '' || x[k] == null ? 0 : Number(x[k]);
    if (!isFinite(v) || v < 0 || v > max || (whole && Math.floor(v) !== v)) throw new Error(label + ' is ' + (whole ? 'a whole number ' : '') + 'from 0 to ' + max + '.');
    return v;
  };
  var actions = (Array.isArray(x.actions) ? x.actions : []).filter(function (a) { return CHALLENGE_ACTIONS.indexOf(a) !== -1; });
  if (kind === 'Items' && !actions.length) throw new Error('Choose what the player sends: a place, a photo, a note, or more than one.');
  var day = function (k, label) {
    var v = String(x[k] || '').trim();
    if (!v) return '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(label + ' is a date, like 2026-11-30.');
    return Utilities.parseDate(v + ' 00:00', Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  };
  var from = day('from', 'From'), to = day('to', 'To');
  if (from && to && to.getTime() < from.getTime()) throw new Error('To comes after From.');
  var fields = {
    name: name, says: says, why: why, kind: kind, actions: kind === 'Items' ? actions.join(', ') : '',
    near: kind === 'Items' ? num('near', 'Near a segment (metres)', 500, false) : '', xpEach: kind === 'Items' ? num('xpEach', 'XP each', 100, false) : '',
    xpNear: kind === 'Items' ? num('xpNear', 'XP near a segment', 100, false) : '', milesGoal: kind === 'Walk goal' ? num('milesGoal', 'Miles goal', 1000, false) : '',
    segGoal: kind === 'Walk goal' ? num('segGoal', 'Different segments', 100, true) : '', xpPer: kind === 'Walk goal' ? num('xpPer', 'XP per 0.01 mi', 100, false) : '',
    mult: kind === 'Walk goal' ? (num('mult', 'Finishing multiplier', 10, false) || 1) : '', from: from, to: to,
    level: kind === 'Items' ? num('level', 'Opens at level', SKILL_LEVEL_MAX, true) : ''
  };
  if (kind === 'Walk goal' && !(fields.milesGoal > 0)) throw new Error('Say the miles goal.');
  return withLock_(function () {
    var sheet = getDb_().getSheetByName(TABS.challenges.name), all = challengesAll_();
    var id = clean_(x.id, 20), had = id ? all.filter(function (c) { return c.id === id; })[0] : null;
    if (id && !had) throw new Error('That Challenge isn\'t here any more.');
    var row = had ? sheet.getRange(had.row, 1, 1, TABS.challenges.header.length).getValues()[0] : blankRow_(TABS.challenges);
    Object.keys(fields).forEach(function (k) { row[CHALLENGE_COL[k] - 1] = typeof fields[k] === 'string' ? safeCell_(fields[k]) : fields[k]; });
    if (!had) {
      row[CHALLENGE_COL.id - 1] = nextId_('CH', all.map(function (c) { return c.id; }));
      row[CHALLENGE_COL.state - 1] = 'Open'; row[CHALLENGE_COL.by - 1] = account.handle || account.email; row[CHALLENGE_COL.made - 1] = new Date();
    }
    var at = had ? had.row : lastRowWith_(sheet, CHALLENGE_COL.id) + 1;
    sheet.getRange(at, 1, 1, row.length).setValues([row]);
    logChange_(account.email, 'Challenge', row[CHALLENGE_COL.id - 1], had ? 'Changed' : 'Made', had ? had.name : '', name);
    return challengesAdminView_(account);
  });
}

// Retire a Challenge, or open it again. What it earned stays earned.
function challengeRetire_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!account.rank || !rankAtLeast_(account.rank, 'Builder')) throw new Error('A Builder or above builds Challenges.');
  return withLock_(function () {
    var c = challengesAll_().filter(function (x) { return x.id === clean_(req.challengeId, 20); })[0];
    if (!c) throw new Error('That Challenge isn\'t here any more.');
    var to = req.retire === false ? 'Open' : 'Retired';
    getDb_().getSheetByName(TABS.challenges.name).getRange(c.row, CHALLENGE_COL.state).setValue(to);
    logChange_(account.email, 'Challenge', c.id, 'State', c.state, to);
    return challengesAdminView_(account);
  });
}

/* ── Reviews: each item sent ── */

function challengeReviewItems_(handles, rows, now) {
  var byId = {};
  challengesAll_().forEach(function (c) { byId[c.id] = c; });
  return challengeItemsAll_().map(function (x) {
    var c = byId[x.challenge] || { name: x.challenge, xpEach: 0, xpNear: 0 };
    var moves = rows.filter(function (m) { return m.segment === x.id; });
    var decided = moves.filter(function (m) { return m.move === REVIEW_DECIDE.approve || m.move === REVIEW_DECIDE.decline; }).pop();
    var rec = moves.filter(function (m) { return m.move === REVIEW_RECOMMEND.Approve || m.move === REVIEW_RECOMMEND.Decline; }).pop();
    var open = x.state === 'Waiting';
    return { id: x.id, challengeItem: true, name: c.name + ': ' + x.id, challenge: c.id, kind: 'Item', squares: [], outline: [], miles: 0,
      by: handles[x.account] || x.account, proposed: x.sent, askNote: x.note, lat: x.lat, lon: x.lon, acc: x.acc, hasPhoto: !!x.photo, near: x.near,
      xpIf: itemXp_(c, x), state: open ? (rec ? 'Recommended' : 'New') : x.state, recommendedXp: rec ? rec.xp : null,
      decidedAt: decided ? decided.time : 0, open: open, moves: moves.map(function (m) { return { time: m.time, by: m.by, rank: m.rank, move: m.move, xp: m.xp, note: m.note }; }) };
  }).filter(function (r) { return r.open || (r.decidedAt && now - r.decidedAt <= REVIEW_SHOWN_DAYS * DAY_MS); });
}

// A move on an item: its XP is the Challenge's, not typed in.
function challengeItemMove_(account, id, kind, move, note) {
  return withLock_(function () {
    var x = challengeItemsAll_().filter(function (i) { return i.id === id; })[0];
    if (!x) throw new Error('That item isn\'t here any more.');
    if (x.state !== 'Waiting') throw new Error('That item was ' + x.state.toLowerCase() + ' already. Reload the screen.');
    var c = challengesAll_().filter(function (i) { return i.id === x.challenge; })[0] || { xpEach: 0, xpNear: 0 };
    var xp = itemXp_(c, x);
    var sheet = getDb_().getSheetByName(TABS.reviews.name);
    var row = blankRow_(TABS.reviews);
    row[REVIEW_COL.time - 1] = new Date(); row[REVIEW_COL.segment - 1] = x.id; row[REVIEW_COL.by - 1] = account.handle || account.email;
    row[REVIEW_COL.rank - 1] = account.rank; row[REVIEW_COL.move - 1] = move; row[REVIEW_COL.xp - 1] = kind === 'decline' || (kind === 'recommend' && move === REVIEW_RECOMMEND.Decline) ? '' : xp; row[REVIEW_COL.note - 1] = note;
    sheet.getRange(lastRowWith_(sheet, REVIEW_COL.segment) + 1, 1, 1, row.length).setValues([row]);
    if (kind === 'approve' || kind === 'decline') {
      var items = getDb_().getSheetByName(TABS.challengeItems.name);
      items.getRange(x.row, ITEM_COL.state).setValue(kind === 'approve' ? 'Approved' : 'Declined');
      items.getRange(x.row, ITEM_COL.xp).setValue(kind === 'approve' ? xp : '');
      logChange_(account.email, 'Challenge item', x.id, 'State', 'Waiting', (kind === 'approve' ? 'Approved (' + xp + ' XP)' : 'Declined') + ', in a review');
    }
    return reviewsView_(account);
  });
}

/* ── Seeded once: trash receptacles (|Q655, |M669) ── */

function challengesOnce_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('CHALLENGES_SEEDED')) return;
  var sheet = getDb_().getSheetByName(TABS.challenges.name);
  if (lastRowWith_(sheet, CHALLENGE_COL.id) < 2) {
    var row = blankRow_(TABS.challenges);
    var put = { id: 'CH001', name: 'Trash receptacles', kind: 'Items', actions: 'Place, Photo, Note',
      says: 'Find a public trash can or bin. Stand beside it, press Use my location, take its photo, and send it. An admin checks each one.',
      why: 'Where the bins are tells HABO where litter has somewhere to go, and where it doesn\'t.',
      near: 20, xpEach: 1, xpNear: 2, level: 1, state: 'Open', by: 'HABO', made: new Date() };
    Object.keys(put).forEach(function (k) { row[CHALLENGE_COL[k] - 1] = put[k]; });
    sheet.getRange(2, 1, 1, row.length).setValues([row]);
  }
  props.setProperty('CHALLENGES_SEEDED', new Date().toISOString());
}
