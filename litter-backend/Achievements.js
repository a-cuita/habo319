/**
 * Streaks and achievements (S6-P6, |Q647 (a), |Q648, |M861, |Q663 (a)).
 *
 * A weekly streak: the weeks in a row, Monday to Sunday, with at least one
 * walk; a week not walked yet still keeps last week's streak going. It shows
 * by your handle.
 *
 * Achievements are rows admins make in Admin Mode (|M861), each counting
 * something the app already records (|Q663 (a)): a name, a badge (an emoji),
 * what it counts, the number to reach, and its XP. A badge earned stays
 * earned, with the XP it had then, even if the achievement changes or is
 * retired. The first twelve are seeded once (|Q648).
 *
 * What counts is what counts for XP: walks ended, not discarded, not
 * simulated, with their GPX track saved.
 */
var ACH_COL = { id: 1, name: 2, badge: 3, counts: 4, reach: 5, minutes: 6, xp: 7, state: 8, by: 9, made: 10 };
var BADGE_COL = { account: 1, achievement: 2, name: 3, badge: 4, earned: 5, xp: 6 };
var ACH_KINDS = ['Pounds', 'Miles', 'Walks', 'Different segments', 'The same segment', 'Segments collected first', 'Your segments made public',
  'First rates', 'Whole fields scanned', 'Walks near sunrise', 'Walks in one day'];
var ACH_MINUTES = { 'Walks near sunrise': 'within (minutes of sunrise)', 'Walks in one day': 'apart (minutes from the last one\'s end)' };
var ACH_APART_MI = 0.5;

function achievementsAll_() {
  return readRows_(TABS.achievements, ACH_COL).map(function (r) {
    var m = r.get('made');
    return { row: r.row, id: r.get('id'), name: r.get('name'), badge: r.get('badge'), counts: r.get('counts'), reach: Number(r.get('reach')) || 0,
      minutes: Number(r.get('minutes')) || 0, xp: Number(r.get('xp')) || 0, state: r.get('state') || 'Open', by: r.get('by'), made: m instanceof Date ? m.getTime() : 0 };
  }).filter(function (a) { return a.id; });
}
function badgesAll_() {
  return readRows_(TABS.badges, BADGE_COL).map(function (r) {
    var e = r.get('earned');
    return { account: r.get('account'), achievement: r.get('achievement'), name: r.get('name'), badge: r.get('badge'), earned: e instanceof Date ? e.getTime() : 0, xp: Number(r.get('xp')) || 0 };
  }).filter(function (b) { return b.account && b.achievement; });
}
// A player's badges' XP, for xpOf_.
function badgeXp_(accountId) {
  return badgesAll_().reduce(function (t, b) { return b.account === accountId ? t + b.xp : t; }, 0);
}

// What an achievement asks, in words.
function achSays_(a) {
  var n = a.reach, m = a.minutes, one = n === 1;
  switch (a.counts) {
    case 'Pounds': return 'Collect ' + n + ' lb in all.';
    case 'Miles': return 'Collect along ' + n + ' mi in all.';
    case 'Walks': return one ? 'Your first walk.' : n + ' walks.';
    case 'Different segments': return 'Collect all of ' + n + ' different public segments.';
    case 'The same segment': return 'Collect all of one public segment ' + n + ' times.';
    case 'Segments collected first': return one ? 'Be the first to collect all of a public segment.' : 'Be the first to collect all of ' + n + ' public segments.';
    case 'Your segments made public': return one ? 'A segment of yours made public.' : n + ' segments of yours made public.';
    case 'First rates': return one ? 'Give a segment its first rate.' : 'Give ' + n + ' segments their first rate.';
    case 'Whole fields scanned': return one ? 'Scan all of a field.' : 'Scan all of ' + n + ' fields.';
    case 'Walks near sunrise': return (one ? 'A walk' : n + ' walks') + ' started within ' + m + ' minutes of sunrise.';
    case 'Walks in one day': return n + ' walks in one day, each starting at least ' + m + ' minutes after the last one ended, and half a mile from where it started.';
  }
  return '';
}

/* ── What a player has done ── */

function achWalks_(accountId) {
  return readRows_(TABS.collections).filter(function (q) {
    return q.get('account') === accountId && q.get('status') !== 'Collecting' && q.get('status') !== COLLECTION_DISCARDED &&
      q.get('simulated') !== 'Yes' && String(q.get('track')).trim();
  }).map(function (q) {
    var s = q.get('started'), e = q.get('ended');
    return { id: q.get('id'), started: s instanceof Date ? s.getTime() : 0, ended: e instanceof Date ? e.getTime() : 0,
      pounds: Number(q.get('pounds')) || 0, miles: Number(q.get('miles')) || 0, cell: String(q.get('startCell') || '') };
  }).sort(function (a, b) { return a.started - b.started; });
}

// Each public segment's collections, oldest first, each with the walks that
// made it (a walk, or the pieces that added up), and what it gave (a rate, a
// start, …): the same working-out as its rates. Kept between requests.
function achSegEvents_() {
  return kept_('achievements:events', function () {
    var counted = rateCollections_(false), walks = worldWalks_(counted, readRows_(TABS.stretches)), k = segmentRules_();
    return segmentsAll_().filter(function (g) { return g.accepted && g.squares.length; }).map(function (g) {
      return { g: g.id, field: g.kind === 'Field', ev: pathSequence_(g, walks, k).events.map(function (e) {
        return { w: e.pieces && e.pieces.length ? e.pieces : [e.id], r: e.result };
      }) };
    });
  });
}

function achFacts_(accountId) {
  var walks = achWalks_(accountId), mine = {};
  walks.forEach(function (w) { mine[w.id] = true; });
  var f = { walks: walks, pounds: 0, miles: 0, segs: 0, same: 0, first: 0, rates: 0, fields: 0, made: 0 };
  walks.forEach(function (w) { f.pounds += w.pounds; f.miles += w.miles; });
  var me = function (e) { return e.w.some(function (id) { return mine[id]; }); };
  if (walks.length) achSegEvents_().forEach(function (s) {
    var n = s.ev.filter(me).length;
    if (n) { f.segs++; if (s.field) f.fields++; }
    if (n > f.same) f.same = n;
    if (s.ev.length && me(s.ev[0])) f.first++;
    var rate = s.ev.filter(function (e) { return e.r === 'rate'; })[0];
    if (rate && me(rate)) f.rates++;
  });
  // Your segments made public, as Reviews counts them for XP.
  var made = {};
  segmentsAll_().forEach(function (g) { if (g.by === accountId && g.accepted) made[g.id] = true; });
  additionsAll_().forEach(function (a) { if (a.by === accountId && a.state === 'Added') made[a.id] = true; });
  f.made = Object.keys(made).length;
  return f;
}

// How far a player is toward an achievement.
function achHave_(a, f) {
  switch (a.counts) {
    case 'Pounds': return round_(f.pounds, 2);
    case 'Miles': return round_(f.miles, 2);
    case 'Walks': return f.walks.length;
    case 'Different segments': return f.segs;
    case 'The same segment': return f.same;
    case 'Segments collected first': return f.first;
    case 'Your segments made public': return f.made;
    case 'First rates': return f.rates;
    case 'Whole fields scanned': return f.fields;
    case 'Walks near sunrise': return f.walks.filter(function (w) {
      if (!/^-?\d+_-?\d+$/.test(w.cell) || !w.started) return false;
      var after = w.started - sunFor_(w.cell, new Date(w.started)).sunrise;
      return after >= 0 && after <= a.minutes * 60000;
    }).length;
    case 'Walks in one day': return shiftsOf_(f.walks, a.minutes);
  }
  return 0;
}
// The most walks in one day, each starting at least `minutes` after the last
// one ended, and half a mile from where the last one started.
function shiftsOf_(walks, minutes) {
  var byDay = {}, best = 0;
  walks.forEach(function (w) { if (w.started) (byDay[dayOf_(new Date(w.started))] = byDay[dayOf_(new Date(w.started))] || []).push(w); });
  Object.keys(byDay).forEach(function (d) {
    var n = 0, last = null;
    byDay[d].forEach(function (w) {
      var apart = !last || (/^-?\d+_-?\d+$/.test(w.cell) && /^-?\d+_-?\d+$/.test(last.cell) &&
        LitterGeo.dist(LitterGeo.centerXY(w.cell), LitterGeo.centerXY(last.cell)) >= ACH_APART_MI * LitterGeo.MILE_M);
      if (!last || (w.started >= last.ended + minutes * 60000 && apart)) { n++; last = w; }
    });
    if (n > best) best = n;
  });
  return best;
}

/* ── The weekly streak (|Q647 (a)) ── */

// The Monday of a time's week, in HABO's time zone, as yyyy-MM-dd.
function weekOf_(ms) {
  var noon = Utilities.parseDate(dayOf_(new Date(ms)) + ' 12:00', Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm').getTime();
  return dayOf_(new Date(noon - ((new Date(noon).getUTCDay() + 6) % 7) * DAY_MS));
}
function weekBefore_(monday) {
  return dayOf_(new Date(Utilities.parseDate(monday + ' 12:00', Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm').getTime() - 7 * DAY_MS));
}
function streakOf_(accountId, walks) {
  var weeks = {};
  (walks || achWalks_(accountId)).forEach(function (w) { if (w.started) weeks[weekOf_(w.started)] = true; });
  var now = weekOf_(Date.now()), wk = weeks[now] ? now : weekBefore_(now), n = 0;
  while (weeks[wk]) { n++; wk = weekBefore_(wk); }
  // The longest it's been.
  var best = 0, run = 0, prev = null;
  Object.keys(weeks).sort().forEach(function (w) { run = prev && weekBefore_(w) === prev ? run + 1 : 1; prev = w; if (run > best) best = run; });
  return { weeks: n, best: best, thisWeek: !!weeks[now], week: now };
}

/* ── Earning ── */

function achView_(a, f, earned) {
  var have = f ? achHave_(a, f) : null;
  return { id: a.id, name: a.name, badge: a.badge, counts: a.counts, reach: a.reach, minutes: a.minutes, xp: earned ? earned.xp : a.xp,
    says: achSays_(a), state: a.state, earned: earned ? earned.earned : 0, have: have == null ? null : Math.min(have, a.reach) };
}
// The open achievements a player has reached and doesn't have yet.
function badgesDue_(account) {
  var have = {};
  badgesAll_().forEach(function (b) { if (b.account === account.id) have[b.achievement] = true; });
  var open = achievementsAll_().filter(function (a) { return a.state !== 'Retired' && !have[a.id] && a.reach > 0 && ACH_KINDS.indexOf(a.counts) !== -1; });
  if (!open.length) return [];
  var f = achFacts_(account.id);
  return open.filter(function (a) { return achHave_(a, f) >= a.reach; });
}
// Under the lock: each one reached, written as earned. Returns them.
function badgesEarn_(account) {
  var due = badgesDue_(account);
  if (!due.length) return [];
  var sheet = getDb_().getSheetByName(TABS.badges.name), now = new Date();
  var rows = due.map(function (a) {
    var row = blankRow_(TABS.badges);
    row[BADGE_COL.account - 1] = account.id; row[BADGE_COL.achievement - 1] = a.id; row[BADGE_COL.name - 1] = a.name;
    row[BADGE_COL.badge - 1] = a.badge; row[BADGE_COL.earned - 1] = now; row[BADGE_COL.xp - 1] = a.xp;
    return row;
  });
  sheet.getRange(lastRowWith_(sheet, BADGE_COL.account) + 1, 1, rows.length, rows[0].length).setValues(rows);
  forgetReads_();
  return due.map(function (a) { return achView_(a, null, { earned: now.getTime(), xp: a.xp }); });
}
// For a response: anything just earned, taking the lock only when there is.
function badgesNow_(account) {
  if (lockDepth_ > 0) return badgesEarn_(account);
  return badgesDue_(account).length ? withLock_(function () { return badgesEarn_(account); }) : [];
}

/* ── Your badges (the screen) ── */

function achievementsLoad_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var earnedNow = badgesNow_(account);
  var mine = {};
  badgesAll_().forEach(function (b) { if (b.account === account.id) mine[b.achievement] = b; });
  var f = achFacts_(account.id);
  var list = achievementsAll_().filter(function (a) { return a.state !== 'Retired' || mine[a.id]; }).map(function (a) { return achView_(a, f, mine[a.id]); });
  return { achievements: list, streak: streakOf_(account.id, f.walks), earnedNow: earnedNow };
}

/* ── Admin Mode: making them (|M861, |Q663 (a)) ── */

function achievementsAdmin_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!account.rank) throw new Error('Achievements are made by HABO\'s admins.');
  return achievementsAdminView_(account);
}
function achievementsAdminView_(account) {
  var earned = {};
  badgesAll_().forEach(function (b) { earned[b.achievement] = (earned[b.achievement] || 0) + 1; });
  return { achievements: achievementsAll_().map(function (a) { var v = achView_(a, null, null); v.earnedBy = earned[a.id] || 0; return v; }),
    canBuild: rankAtLeast_(account.rank, 'Builder'), kinds: ACH_KINDS, minutes: ACH_MINUTES };
}
function achievementSave_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!account.rank || !rankAtLeast_(account.rank, 'Builder')) throw new Error('A Builder or above makes achievements.');
  var x = req.achievement || {};
  var name = clean_(x.name, 60), badge = clean_(x.badge, 16), counts = ACH_KINDS.indexOf(x.counts) !== -1 ? x.counts : '';
  if (!name) throw new Error('Give it a name.');
  if (!badge) throw new Error('Give it a badge: an emoji, like 🏅.');
  if (!counts) throw new Error('Choose what it counts.');
  var num = function (k, label, max, whole) {
    var v = x[k] === '' || x[k] == null ? NaN : Number(x[k]);
    if (!isFinite(v) || v < 0 || v > max || (whole && Math.floor(v) !== v)) throw new Error(label + ' is ' + (whole ? 'a whole number ' : 'a number ') + 'from 0 to ' + max + '.');
    return v;
  };
  var whole = counts !== 'Pounds' && counts !== 'Miles';
  var reach = num('reach', 'The number to reach', 100000, whole);
  if (!(reach > 0)) throw new Error('The number to reach is more than 0.');
  var minutes = ACH_MINUTES[counts] ? num('minutes', 'Minutes', 1440, true) : '';
  var xp = num('xp', 'XP', 1000, false);
  return withLock_(function () {
    var sheet = getDb_().getSheetByName(TABS.achievements.name), all = achievementsAll_();
    var id = clean_(x.id, 20), had = id ? all.filter(function (a) { return a.id === id; })[0] : null;
    if (id && !had) throw new Error('That achievement isn\'t here any more.');
    var row = had ? sheet.getRange(had.row, 1, 1, TABS.achievements.header.length).getValues()[0] : blankRow_(TABS.achievements);
    row[ACH_COL.name - 1] = safeCell_(name); row[ACH_COL.badge - 1] = safeCell_(badge); row[ACH_COL.counts - 1] = counts;
    row[ACH_COL.reach - 1] = reach; row[ACH_COL.minutes - 1] = minutes; row[ACH_COL.xp - 1] = xp;
    if (!had) {
      row[ACH_COL.id - 1] = nextId_('A', all.map(function (a) { return a.id; }));
      row[ACH_COL.state - 1] = 'Open'; row[ACH_COL.by - 1] = account.handle || account.email; row[ACH_COL.made - 1] = new Date();
    }
    sheet.getRange(had ? had.row : lastRowWith_(sheet, ACH_COL.id) + 1, 1, 1, row.length).setValues([row]);
    logChange_(account.email, 'Achievement', row[ACH_COL.id - 1], had ? 'Changed' : 'Made', had ? had.name : '', name);
    return achievementsAdminView_(account);
  });
}
// Retire one, or open it again. A badge already earned stays earned.
function achievementRetire_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!account.rank || !rankAtLeast_(account.rank, 'Builder')) throw new Error('A Builder or above makes achievements.');
  return withLock_(function () {
    var a = achievementsAll_().filter(function (x) { return x.id === clean_(req.achievementId, 20); })[0];
    if (!a) throw new Error('That achievement isn\'t here any more.');
    var to = a.state === 'Retired' ? 'Open' : 'Retired';
    getDb_().getSheetByName(TABS.achievements.name).getRange(a.row, ACH_COL.state).setValue(to);
    logChange_(account.email, 'Achievement', a.id, to === 'Retired' ? 'Retired' : 'Opened again', a.state, to);
    return achievementsAdminView_(account);
  });
}

/* ── The first twelve, seeded once (|Q648 (a), |S5-U30 item 5) ── */

var ACH_SEED = [
  ['First 10 lb', '🛍️', 'Pounds', 10, '', 5],
  ['The 100 lb Club', '💯', 'Pounds', 100, '', 25],
  ['10 Miles', '🥾', 'Miles', 10, '', 15],
  ['Field Scanner', '🌾', 'Whole fields scanned', 1, '', 10],
  ['Pioneer', '🧭', 'Segments collected first', 1, '', 10],
  ['Rate Setter', '⏱️', 'First rates', 1, '', 10],
  ['Steward', '🛡️', 'The same segment', 5, '', 15],
  ['Explorer', '🗺️', 'Different segments', 10, '', 15],
  ['Cartographer', '📐', 'Your segments made public', 3, '', 15],
  ['Early Bird', '🌅', 'Walks near sunrise', 1, 60, 5],
  ['Double Shift', '✌️', 'Walks in one day', 2, 60, 5],
  ['Triple Shift', '🔱', 'Walks in one day', 3, 60, 10]
];
function achievementsOnce_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('ACHIEVEMENTS_SEEDED')) return;
  var sheet = getDb_().getSheetByName(TABS.achievements.name);
  if (lastRowWith_(sheet, ACH_COL.id) < 2) {
    var now = new Date();
    var rows = ACH_SEED.map(function (s, i) {
      var row = blankRow_(TABS.achievements);
      row[ACH_COL.id - 1] = 'A' + ('00' + (i + 1)).slice(-3); row[ACH_COL.name - 1] = s[0]; row[ACH_COL.badge - 1] = s[1]; row[ACH_COL.counts - 1] = s[2];
      row[ACH_COL.reach - 1] = s[3]; row[ACH_COL.minutes - 1] = s[4]; row[ACH_COL.xp - 1] = s[5]; row[ACH_COL.state - 1] = 'Open';
      row[ACH_COL.by - 1] = 'HABO'; row[ACH_COL.made - 1] = now;
      return row;
    });
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  props.setProperty('ACHIEVEMENTS_SEEDED', new Date().toISOString());
}
