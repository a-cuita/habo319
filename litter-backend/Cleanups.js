/**
 * Team mode (S6-P27, |Q667, |M962, |Q721 (a), |M1002): cleanups on assigned
 * segments. An admin makes a cleanup: its name, day and times, its segments,
 * and until when teams can register. Players register a team (its name and
 * a leader or more, by handle: one is enough, from |S6-U47) or join one, or ask to be placed. A team's
 * leaders assign each member to a segment. On the day, one member checks in
 * at the segment, unticking anyone who isn't there, and checks out with the
 * team's pounds. No GPX track: the check-out is kept as a collection whose one
 * weighing is the whole segment, so the segment's rate and its clock work as
 * for any walk (|Q721 (a)), with no Litter Index and no XP; its time is kept
 * as person-hours (members there × hours), shown on the cleanup on its own.
 */
var CLEANUP_COL = { id: 1, name: 2, day: 3, starts: 4, ends: 5, segments: 6, until: 7, state: 8, by: 9, made: 10, templates: 11, need: 12 };
var TEAM_COL = { id: 1, cleanup: 2, name: 3, leaders: 4, by: 5, made: 6, template: 7, need: 8 };
var PERSON_COL = { cleanup: 1, account: 2, team: 3, segment: 4, joined: 5, state: 6, note: 7, stateAt: 8, seen: 9, hoursTo: 10, hoursWhy: 11, minors: 12 };
// A member's state set on the day (item 8): Not here today (the Team Leader's menu), Gone home
// (I'm leaving, or the leader), Unknown (the leader, with a note), Removed (from the team).
var CLEANUP_SET_STATES = ['Not here today', 'Gone home', 'Unknown', 'Removed'];
var CHECKIN_COL = { id: 1, cleanup: 2, team: 3, segment: 4, by: 5, inAt: 6, outAt: 7, there: 8, pounds: 9, collection: 10, withNext: 11 };
// S7-P14: a crew weighs on its segment as often as needed, all its bags together; a bag
// carried on is weighed whole, and what was weighed before is taken away (|Q891 (a)).
var WEIGH_COL = { id: 1, cleanup: 2, checkin: 3, team: 4, segment: 5, by: 6, at: 7, reading: 8, fresh: 9, pounds: 10 };
// Where a crew left its bags (item 4, |Q890): its pin, and why, like Grab a location's whys.
var BAG_COL = { id: 1, cleanup: 2, team: 3, segment: 4, by: 5, at: 6, lat: 7, lon: 8, why: 9 };
var CLEANUP_BAG_WHYS = ['Left for pickup', 'In a bin', 'In a dumpster that was there'];
var CLEANUP_WEIGH_WORD = 'Weigh before you leave this segment: all the crew\'s bags together.';   // |M1215, item 6
var CLEANUP_STATES = ['Open', 'Retired'];

// Templates (S7-P14 round 2, items 1 to 5, |Q985 (a), |Q992): how a team runs its day. An
// admin allows some when making a cleanup; each Team Leader picks one when registering.
// weighs: who weighs (the crew on its segment, the floating Team Leader for any of the
// team's segments, the pickup, or the leader at the table); checkin: each crew, or the
// table; need: whether its Need button starts on (|Q1021 (a)); miles: whether drive miles are kept.
var CLEANUP_TEMPLATES = [
  { key: 'every-hand', name: 'Every hand a bag', weighs: 'crew', checkin: 'crew', need: false, miles: false,
    says: 'Everyone carries a bag, and the Team Leader the scale. The crew weighs on each segment. No pickup.' },
  { key: 'leapfrog', name: 'Leapfrog', weighs: 'leader', checkin: 'crew', need: true, miles: false,
    says: 'Pairs on neighbouring segments. The Team Leader floats with the scale and weighs for any of the team\'s segments, picking which.' },
  { key: 'truck', name: 'Truck pickup', weighs: 'pickup', checkin: 'crew', need: true, miles: true,
    says: 'Crews don\'t weigh: they leave piles with a pin. The pickup, with no segment of their own, sees every pile not yet picked up, nearest first, and weighs each as they pick it up.' },
  { key: 'base-table', name: 'Base table', weighs: 'table', checkin: 'table', need: false, miles: false,
    says: 'The Team Leader, at a table, checks each group in and out, and weighs their bags for their segment. A walk-in signs the waiver on the leader\'s phone.' }
];
var CLEANUP_TEMPLATE_KEYS = CLEANUP_TEMPLATES.map(function (t) { return t.key; });
// What Need can ask for (|Q1022 (a)): one list, in Settings; each template ticks which it offers.
var SETTING_CLEANUP_NEEDS = 'Cleanup needs';
var CLEANUP_NEEDS_SEED = ['Water', 'Gloves', 'Bags', 'First aid'];
function needsOfferedSetting_(t) { return 'Needs offered: ' + t.name; }
function cleanupTemplate_(key) { return CLEANUP_TEMPLATES.filter(function (t) { return t.key === key; })[0] || CLEANUP_TEMPLATES[0]; }
function cleanupNeeds_() { return String(getSetting_(SETTING_CLEANUP_NEEDS) || '').split(/\r?\n/).map(function (x) { return x.trim(); }).filter(String); }
function needsOffered_(t) {
  var list = cleanupNeeds_();
  return String(getSetting_(needsOfferedSetting_(t)) || '').split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x && list.indexOf(x) !== -1; });
}
// Whether a team's Need button is on: the Team Leader's switch on the day, else the cleanup's,
// else the template's (|Q1021 (a)).
function needOn_(c, t) {
  var v = (t && t.need) || c.need;
  return v === 'On' ? true : v === 'Off' ? false : cleanupTemplate_(t && t.template).need;
}

function cleanupTime_(day, hm) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day) || !/^\d{1,2}:\d{2}$/.test(hm)) return 0;
  return Utilities.parseDate(day + ' ' + hm, Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm').getTime();
}
function cleanupDayOf_(ms) { return Utilities.formatDate(new Date(ms), Session.getScriptTimeZone(), 'yyyy-MM-dd'); }
function idList_(v) { return String(v || '').split(/[\s,]+/).filter(String); }

function cleanupsAll_() {
  return readRows_(TABS.cleanups, CLEANUP_COL).map(function (r) {
    var day = r.get('day') instanceof Date ? cleanupDayOf_(r.get('day').getTime()) : String(r.get('day'));
    var u = r.get('until');
    var allowed = idList_(r.get('templates')).filter(function (k) { return CLEANUP_TEMPLATE_KEYS.indexOf(k) !== -1; });
    var c = { row: r.row, id: r.get('id'), name: r.get('name'), day: day, starts: String(r.get('starts')), ends: String(r.get('ends')),
      segments: idList_(r.get('segments')), until: u instanceof Date ? u.getTime() : 0, state: r.get('state') === 'Retired' ? 'Retired' : 'Open', by: r.get('by'),
      // A cleanup made before templates allows them all.
      templates: allowed.length ? allowed : CLEANUP_TEMPLATE_KEYS.slice(), need: /^(On|Off)$/.test(r.get('need')) ? r.get('need') : '' };
    c.startAt = cleanupTime_(c.day, c.starts); c.endAt = cleanupTime_(c.day, c.ends);
    return c;
  });
}
function cleanupTeamsAll_() {
  return readRows_(TABS.cleanupTeams, TEAM_COL).map(function (r) {
    var tk = String(r.get('template') || '');
    return { row: r.row, id: r.get('id'), cleanup: r.get('cleanup'), name: r.get('name'), leaders: idList_(r.get('leaders')),
      // A team registered before templates runs as Every hand a bag, as teams did.
      template: CLEANUP_TEMPLATE_KEYS.indexOf(tk) !== -1 ? tk : 'every-hand', need: /^(On|Off)$/.test(r.get('need')) ? r.get('need') : '' };
  });
}
function cleanupPeopleAll_() {
  return readRows_(TABS.cleanupPeople, PERSON_COL).map(function (r) {
    // A member can have several segments (S6-P27, |C1012): their ids, space-separated, in the order given.
    var segsOf = String(r.get('segment') || '').split(/\s+/).filter(String);
    var t = function (k) { var v = r.get(k); return v instanceof Date ? v.getTime() : 0; };
    var st = String(r.get('state') || '');
    return { row: r.row, cleanup: r.get('cleanup'), account: r.get('account'), team: r.get('team'), segments: segsOf, segment: segsOf[0] || '',
      state: CLEANUP_SET_STATES.indexOf(st) !== -1 ? st : '', note: String(r.get('note') || ''), stateAt: t('stateAt'), seen: t('seen'),
      hoursTo: t('hoursTo'), hoursWhy: String(r.get('hoursWhy') || ''), minors: Math.max(0, Math.round(Number(r.get('minors')) || 0)) };
  });
}
function cleanupCheckinsAll_() {
  return readRows_(TABS.cleanupCheckins, CHECKIN_COL).map(function (r) {
    var t = function (k) { var v = r.get(k); return v instanceof Date ? v.getTime() : 0; };
    return { row: r.row, id: r.get('id'), cleanup: r.get('cleanup'), team: r.get('team'), segment: r.get('segment'), by: r.get('by'),
      inAt: t('inAt'), outAt: t('outAt'), there: idList_(r.get('there')), pounds: r.get('pounds') === '' ? null : Number(r.get('pounds')), collection: r.get('collection'),
      withNext: String(r.get('withNext') || '') };
  });
}
function cleanupWeighingsAll_() {
  return readRows_(TABS.cleanupWeighings, WEIGH_COL).map(function (r) {
    var at = r.get('at');
    return { row: r.row, id: r.get('id'), cleanup: r.get('cleanup'), checkin: r.get('checkin'), team: r.get('team'), segment: r.get('segment'), by: r.get('by'),
      at: at instanceof Date ? at.getTime() : 0, reading: Number(r.get('reading')) || 0, fresh: /^\s*y/i.test(r.get('fresh')), pounds: Number(r.get('pounds')) || 0 };
  }).filter(function (x) { return x.id; });
}
function cleanupBagsAll_() {
  return readRows_(TABS.cleanupBags, BAG_COL).map(function (r) {
    var at = r.get('at');
    return { row: r.row, id: r.get('id'), cleanup: r.get('cleanup'), team: r.get('team'), segment: r.get('segment'), by: r.get('by'),
      at: at instanceof Date ? at.getTime() : 0, lat: Number(r.get('lat')), lon: Number(r.get('lon')), why: String(r.get('why')) };
  }).filter(function (x) { return x.id; });
}
function isCleanupAdmin_(account) { return !!account.rank && rankAtLeast_(account.rank, 'Builder'); }
function cleanupFind_(id) {
  var c = cleanupsAll_().filter(function (x) { return x.id === id; })[0];
  if (!c || c.state !== 'Open') throw new Error('That cleanup isn\'t here any more.');
  return c;
}

/* ── A member on the day (items 7 to 9) ── */

// A member's chip on the roster (item 8): set on the day (Gone home, Unknown, Not here today), or
// from the team's check-ins: Not here yet, On segment N, Checked in (between segments), Done.
function memberChip_(p, ins) {
  if (p.state === 'Removed') return null;
  if (p.state) return { chip: p.state, note: p.note, at: p.stateAt };
  var mine = ins.filter(function (k) { return k.team === p.team && k.there.indexOf(p.account) !== -1; });
  var open = mine.filter(function (k) { return !k.outAt; })[0];
  if (open) { var n = p.segments.indexOf(open.segment) + 1; return { chip: n ? 'On segment ' + n : 'Checked in' }; }
  if (!mine.length) return { chip: 'Not here yet' };
  var done = p.segments.length > 0 && p.segments.every(function (s) { return mine.some(function (k) { return k.segment === s && k.outAt; }); });
  return { chip: done ? 'Done' : 'Checked in' };
}
// A member's hours (item 8): on each segment from check-in to check-out (or now, while it's open),
// stopping when they went home; an Unknown member's stop when they were last seen in the app,
// unless an admin changed it, with a reason (|M1545).
function memberStop_(p) { return p.hoursTo || (p.state === 'Gone home' && p.stateAt) || (p.state === 'Unknown' && (p.seen || p.stateAt)) || 0; }
function memberHours_(p, ins, now) {
  var stop = memberStop_(p);
  return ins.filter(function (k) { return k.team === p.team && k.there.indexOf(p.account) !== -1; }).reduce(function (h, k) {
    var end = k.outAt || now;
    if (stop) end = Math.min(end, stop);
    return h + Math.max(0, end - k.inAt) / 3600000;
  }, 0);
}

/* ── What a player sees ── */

function cleanupView_(c, account, names, segs, teams, people, checkins, now) {
  var admin = isCleanupAdmin_(account);
  var mine = people.filter(function (p) { return p.cleanup === c.id && p.account === account.id; })[0] || null;
  var segName = function (id) { return segs[id] ? segs[id].name : id; };
  var who = function (id) { return { id: id, handle: names[id] || 'a volunteer' }; };
  var myTeams = teams.filter(function (t) { return t.cleanup === c.id; });
  var ins = checkins.filter(function (k) { return k.cleanup === c.id; });
  var view = { id: c.id, name: c.name, day: c.day, starts: c.starts, ends: c.ends, segments: c.segments, until: c.until, state: c.state,
    registerOpen: now < (c.until || c.endAt), joinOpen: now < c.endAt, past: now >= c.endAt, today: cleanupDayOf_(now) === c.day,
    myTeam: mine ? mine.team : '', placeMe: !!mine && !mine.team, mySegment: mine ? mine.segment : '', mySegments: mine ? mine.segments : [], admin: admin,
    templates: c.templates.map(function (k) { var t = cleanupTemplate_(k); return { key: t.key, name: t.name, says: t.says }; }), need: c.need,
    myChip: mine ? (memberChip_(mine, checkins.filter(function (k) { return k.cleanup === c.id; })) || {}).chip || '' : '' };
  view.teams = myTeams.map(function (t) {
    var lead = t.leaders.indexOf(account.id) !== -1;
    var members = people.filter(function (p) { return p.cleanup === c.id && p.team === t.id && p.state !== 'Removed'; }).map(function (p) {
      var w = who(p.account); w.segment = p.segment; w.segments = p.segments; w.segmentName = p.segments.map(segName).join(', '); w.leader = t.leaders.indexOf(p.account) !== -1;
      // Numbered, in the order they'll be done (item 6, |C1027); its chip and hours so far (item 8); under 18 with them (item 9).
      w.numbered = p.segments.map(function (s, i) { return { n: i + 1, id: s, name: segName(s) }; });
      var chip = memberChip_(p, ins);
      w.chip = chip ? chip.chip : ''; w.chipNote = chip && chip.note || ''; w.chipAt = chip && chip.at || 0;
      w.hours = round_(memberHours_(p, ins, now), 2); w.minors = p.minors; w.seen = p.seen;
      w.hoursTo = p.hoursTo; w.hoursWhy = p.hoursWhy;
      return w;
    });
    var tp = cleanupTemplate_(t.template);
    return { id: t.id, name: t.name, leaders: t.leaders.map(who), members: members, mine: !!mine && mine.team === t.id, lead: lead,
      template: tp.key, templateName: tp.name, weighs: tp.weighs, checkin: tp.checkin, needOn: needOn_(c, t), needSet: t.need, needs: needsOffered_(tp) };
  });
  var leads = view.teams.some(function (t) { return t.lead; });
  view.lead = leads;
  // Players asking to be placed: for a team's leaders and admins, who place them.
  view.unplaced = admin || leads ? people.filter(function (p) { return p.cleanup === c.id && !p.team && p.state !== 'Removed'; }).map(function (p) { return who(p.account); }) : [];
  var ws = cleanupWeighingsAll_().filter(function (x) { return x.cleanup === c.id; });
  view.checkins = ins.map(function (k) {
    var mine = ws.filter(function (x) { return x.checkin === k.id; }).sort(function (a, b) { return a.at - b.at; });
    return { id: k.id, team: k.team, segment: k.segment, segmentName: segName(k.segment), by: names[k.by] || '', inAt: k.inAt, outAt: k.outAt,
      there: k.there.map(who), pounds: k.pounds, withNext: k.withNext,
      weighings: mine.map(function (x) { return { at: x.at, reading: x.reading, fresh: x.fresh, pounds: x.pounds, by: names[x.by] || '' }; }),
      weighed: round_(mine.reduce(function (t, x) { return t + x.pounds; }, 0), 2) };
  });
  view.bags = cleanupBagsAll_().filter(function (x) { return x.cleanup === c.id; }).map(function (x) {
    return { id: x.id, team: x.team, segment: x.segment, segmentName: segName(x.segment), lat: x.lat, lon: x.lon, why: x.why, at: x.at, by: names[x.by] || '' };
  });
  view.weighWord = CLEANUP_WEIGH_WORD;
  view.bagWhys = CLEANUP_BAG_WHYS;
  // After (item 5): pounds by segment and by team, and each member's hours.
  var bySeg = {}, byTeam = {};
  ins.forEach(function (k) {
    if (!k.outAt || k.pounds == null) return;
    bySeg[k.segment] = (bySeg[k.segment] || 0) + k.pounds;
    byTeam[k.team] = (byTeam[k.team] || 0) + k.pounds;
  });
  // Hours (item 8): each member's, on closed check-ins, stopping where they went home or were last
  // seen; anyone under 18 with them counts their hours too, under the adult, unnamed (item 9).
  var hrs = people.filter(function (p) { return p.cleanup === c.id && p.team; }).map(function (p) {
    var h = memberHours_(p, ins.filter(function (k) { return k.outAt; }), now);
    return { id: p.account, handle: names[p.account] || 'a volunteer', hours: round_(h, 2), minors: p.minors, personHours: round_(h * (1 + p.minors), 2) };
  }).filter(function (x) { return x.hours > 0; });
  view.results = {
    bySegment: Object.keys(bySeg).map(function (s) { return { segment: s, name: segName(s), pounds: round_(bySeg[s], 2) }; }),
    byTeam: Object.keys(byTeam).map(function (t) { var x = myTeams.filter(function (y) { return y.id === t; })[0]; return { team: t, name: x ? x.name : t, pounds: round_(byTeam[t], 2) }; }),
    hours: hrs,
    personHours: round_(hrs.reduce(function (s, x) { return s + x.personHours; }, 0), 2),
    minors: hrs.reduce(function (s, x) { return s + x.minors; }, 0) };
  return view;
}

function cleanupsLoad_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  cleanupSeen_(account);
  return cleanupsFor_(account);
}
// When a member was last seen in the app on a cleanup's day (item 8): an Unknown member's hours stop there.
function cleanupSeen_(account) {
  var now = Date.now(), today = cleanupDayOf_(now);
  var open = cleanupsAll_().filter(function (c) { return c.state === 'Open' && c.day === today && now >= c.startAt - 3600000 && now <= c.endAt + 3 * 3600000; });
  if (!open.length) return;
  var ids = open.map(function (c) { return c.id; });
  var stale = cleanupPeopleAll_().filter(function (p) { return ids.indexOf(p.cleanup) !== -1 && p.account === account.id && p.team && now - p.seen > 5 * 60000; });
  if (!stale.length) return;
  withLock_(function () { stale.forEach(function (p) { cleanupPersonPut_(p, { seen: now }); }); });
  forgetReads_();
}
function cleanupsFor_(account) {
  var now = Date.now(), names = {};
  readAccounts_().forEach(function (a) { names[a.id] = a.handle; });
  var segs = {}, segList = [];
  segmentsAll_().filter(function (g) { return g.accepted; }).forEach(function (g) {
    segs[g.id] = g;
    segList.push({ id: g.id, name: g.name, kind: g.kind, squares: g.squares, outline: g.outline, miles: g.miles });
  });
  var teams = cleanupTeamsAll_(), people = cleanupPeopleAll_(), checkins = cleanupCheckinsAll_();
  // Open ones, and the last 30 days' for their results; soonest first, then the latest past.
  var list = cleanupsAll_().filter(function (c) { return c.state === 'Open' && c.endAt > now - 30 * DAY_MS; });
  list.sort(function (a, b) { var pa = a.endAt <= now, pb = b.endAt <= now; return pa !== pb ? (pa ? 1 : -1) : pa ? b.startAt - a.startAt : a.startAt - b.startAt; });
  var views = list.map(function (c) { return cleanupView_(c, account, names, segs, teams, people, checkins, now); });
  // Today's, for the main page (item 4): yours, with your segment, and its check-in.
  var today = null;
  views.forEach(function (v) {
    if (today || !v.today || v.past || !v.mySegments.length || !v.myTeam) return;
    // With several segments: the one your team is checked in on, else the next not done, else the last (S6-P27, |C1012).
    var mineK = v.checkins.filter(function (k) { return k.team === v.myTeam; });
    var isOpen = function (s) { return mineK.some(function (k) { return k.segment === s && !k.outAt; }); };
    var isDone = function (s) { return mineK.some(function (k) { return k.segment === s && k.outAt; }); };
    var seg = v.mySegments.filter(isOpen)[0] || v.mySegments.filter(function (s) { return !isDone(s); })[0] || v.mySegments[v.mySegments.length - 1];
    var open = mineK.filter(function (k) { return k.segment === seg && !k.outAt; })[0];
    var team = v.teams.filter(function (t) { return t.id === v.myTeam; })[0];
    var nameOf = function (s) { return segs[s] ? segs[s].name : s; };
    today = { cleanup: v.id, name: v.name, segment: seg, segmentName: nameOf(seg), chip: v.myChip,
      checkin: open ? open.id : '', inAt: open ? open.inAt : 0, done: isDone(seg),
      // Numbered, in the order they're done (S7-P14 item 7, |C1027).
      number: v.mySegments.indexOf(seg) + 1, of: v.mySegments.length,
      left: v.mySegments.map(function (s, i) { return { n: i + 1, s: s }; }).filter(function (x) { return x.s !== seg && !isDone(x.s); }).map(function (x) { return x.n + '. ' + nameOf(x.s); }),
      // The crew's weighings here (items 1, 2), and an earlier segment waiting to be weighed with this one (item 3).
      weighings: open ? open.weighings : [], weighed: open ? open.weighed : 0,
      withNext: mineK.some(function (k) { return k.withNext === 'Next'; }), word: CLEANUP_WEIGH_WORD, bagWhys: CLEANUP_BAG_WHYS,
      members: team ? team.members.filter(function (m) { return m.segments.indexOf(seg) !== -1; }).map(function (m) { return { id: m.id, handle: m.handle }; }) : [] };
  });
  return { cleanups: views, segments: segList, admin: isCleanupAdmin_(account), me: account.id, today: today,
    // Every template, for New cleanup's ticks (S7-P14 round 2, item 1).
    templates: CLEANUP_TEMPLATES.map(function (t) { return { key: t.key, name: t.name, says: t.says, need: t.need }; }) };
}

/* ── An admin's: making a cleanup ── */

function cleanupSave_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!isCleanupAdmin_(account)) throw new Error('A Builder or above makes cleanups.');
  var x = req.cleanup || {};
  var name = clean_(x.name, 80), day = String(x.day || '').trim(), starts = String(x.starts || '').trim(), ends = String(x.ends || '').trim();
  if (!name) throw new Error('Give the cleanup a name.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw new Error('Its day is a date, like 2026-11-21.');
  if (!/^\d{1,2}:\d{2}$/.test(starts) || !/^\d{1,2}:\d{2}$/.test(ends)) throw new Error('Give its start and end times.');
  var startAt = cleanupTime_(day, starts), endAt = cleanupTime_(day, ends);
  if (endAt <= startAt) throw new Error('It ends after it starts.');
  var until = 0, u = String(x.until || '').trim();
  if (u) {
    var m = /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}:\d{2})$/.exec(u);
    if (!m) throw new Error('Teams can register until a date and time.');
    until = cleanupTime_(m[1], m[2]);
    if (until > endAt) throw new Error('Registering closes by the time the cleanup ends.');
  }
  var accepted = {};
  segmentsAll_().forEach(function (g) { if (g.accepted) accepted[g.id] = true; });
  var segments = (Array.isArray(x.segments) ? x.segments : []).map(String).filter(function (id, i, a) { return accepted[id] && a.indexOf(id) === i; });
  if (!segments.length) throw new Error('Pick its segments on the map.');
  // The templates its teams may pick (item 1), and its Need button (|Q1021 (a)): as each template has it, or on or off for all.
  var templates = (Array.isArray(x.templates) ? x.templates : CLEANUP_TEMPLATE_KEYS).map(String).filter(function (k, i, a) { return CLEANUP_TEMPLATE_KEYS.indexOf(k) !== -1 && a.indexOf(k) === i; });
  if (!templates.length) throw new Error('Allow at least one template.');
  var need = String(x.need || '');
  if (need && !/^(On|Off)$/.test(need)) throw new Error('The Need button is as each template has it, On, or Off.');
  return withLock_(function () {
    var sheet = getDb_().getSheetByName(TABS.cleanups.name), all = cleanupsAll_();
    var id = clean_(x.id, 20), had = id ? all.filter(function (c) { return c.id === id; })[0] : null;
    if (id && !had) throw new Error('That cleanup isn\'t here any more.');
    var row = had ? sheet.getRange(had.row, 1, 1, TABS.cleanups.header.length).getValues()[0] : blankRow_(TABS.cleanups);
    row[CLEANUP_COL.name - 1] = safeCell_(name); row[CLEANUP_COL.day - 1] = day; row[CLEANUP_COL.starts - 1] = starts; row[CLEANUP_COL.ends - 1] = ends;
    row[CLEANUP_COL.segments - 1] = segments.join(' '); row[CLEANUP_COL.until - 1] = until ? new Date(until) : '';
    row[CLEANUP_COL.templates - 1] = templates.join(' '); row[CLEANUP_COL.need - 1] = need;
    if (!had) {
      row[CLEANUP_COL.id - 1] = nextId_('CU', all.map(function (c) { return c.id; }));
      row[CLEANUP_COL.state - 1] = 'Open'; row[CLEANUP_COL.by - 1] = account.handle || account.email; row[CLEANUP_COL.made - 1] = new Date();
    }
    sheet.getRange(had ? had.row : lastRowWith_(sheet, CLEANUP_COL.id) + 1, 1, 1, row.length).setValues([row]);
    logChange_(account.email, 'Cleanup', row[CLEANUP_COL.id - 1], had ? 'Changed' : 'Made', had ? had.name : '', name + ', ' + day + ' ' + starts + ' to ' + ends + ', ' + segments.join(' ') +
      '; templates ' + templates.join(' ') + (need ? '; Need ' + need : ''));
    return cleanupsFor_(account);
  });
}
function cleanupRetire_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!isCleanupAdmin_(account)) throw new Error('A Builder or above retires cleanups.');
  return withLock_(function () {
    var c = cleanupFind_(clean_(req.id, 20));
    getDb_().getSheetByName(TABS.cleanups.name).getRange(c.row, CLEANUP_COL.state).setValue('Retired');
    logChange_(account.email, 'Cleanup', c.id, 'State', 'Open', 'Retired');
    return cleanupsFor_(account);
  });
}

/* ── A player's: registering a team, joining one ── */

// `segment`: their segments, a list or space-separated.
function cleanupPersonSet_(cleanupId, accountId, team, segment) {
  if (Array.isArray(segment)) segment = segment.join(' ');
  var sheet = getDb_().getSheetByName(TABS.cleanupPeople.name);
  var had = cleanupPeopleAll_().filter(function (p) { return p.cleanup === cleanupId && p.account === accountId; })[0];
  if (had) {
    sheet.getRange(had.row, PERSON_COL.team, 1, 2).setValues([[team, segment]]);
    // Removed from a team, then in one again (S7-P14 round 2, item 7): no longer Removed.
    if (had.state === 'Removed' && team) sheet.getRange(had.row, PERSON_COL.state, 1, 3).setValues([['', '', '']]);
    return;
  }
  var row = blankRow_(TABS.cleanupPeople);
  row[PERSON_COL.cleanup - 1] = cleanupId; row[PERSON_COL.account - 1] = accountId; row[PERSON_COL.team - 1] = team;
  row[PERSON_COL.segment - 1] = segment; row[PERSON_COL.joined - 1] = new Date();
  sheet.getRange(lastRowWith_(sheet, PERSON_COL.cleanup) + 1, 1, 1, row.length).setValues([row]);
}
function cleanupRegister_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var name = clean_(req.name, 60);
  if (!name) throw new Error('Give your team a name.');
  var handles = (Array.isArray(req.leaders) ? req.leaders : []).map(function (h) { return String(h || '').trim().replace(/^@/, ''); }).filter(String);
  return withLock_(function () {
    var c = cleanupFind_(clean_(req.cleanupId, 20)), now = Date.now();
    if (now >= (c.until || c.endAt)) throw new Error('Registering for ' + c.name + ' has closed.');
    var accounts = readAccounts_(), leaders = [];
    handles.forEach(function (h) {
      var a = accounts.filter(function (x) { return x.handle && x.handle.toLowerCase() === h.toLowerCase(); })[0];
      if (!a) throw new Error('Nobody has the handle "' + h + '".');
      if (leaders.indexOf(a.id) === -1) leaders.push(a.id);
    });
    // One leader is enough (Jeremy, |S6-U47: there won't always be two).
    if (!leaders.length) throw new Error('A team needs a leader: give their handle.');
    // The template its Team Leader picks, from those the cleanup allows (item 1).
    var template = String(req.template || '') || c.templates[0];
    if (c.templates.indexOf(template) === -1) throw new Error('Pick one of ' + c.name + '\'s templates: ' + c.templates.map(function (k) { return cleanupTemplate_(k).name; }).join(', ') + '.');
    var teams = cleanupTeamsAll_().filter(function (t) { return t.cleanup === c.id; });
    if (teams.some(function (t) { return t.name.toLowerCase() === name.toLowerCase(); })) throw new Error('A team in this cleanup is called ' + name + ' already.');
    var busy = teams.filter(function (t) { return t.leaders.some(function (l) { return leaders.indexOf(l) !== -1; }); })[0];
    if (busy) throw new Error('One of those leaders leads ' + busy.name + ' already.');
    var sheet = getDb_().getSheetByName(TABS.cleanupTeams.name), row = blankRow_(TABS.cleanupTeams);
    var id = nextId_('TM', cleanupTeamsAll_().map(function (t) { return t.id; }));
    row[TEAM_COL.id - 1] = id; row[TEAM_COL.cleanup - 1] = c.id; row[TEAM_COL.name - 1] = safeCell_(name); row[TEAM_COL.leaders - 1] = leaders.join(' ');
    row[TEAM_COL.by - 1] = account.id; row[TEAM_COL.made - 1] = new Date(); row[TEAM_COL.template - 1] = template;
    sheet.getRange(lastRowWith_(sheet, TEAM_COL.id) + 1, 1, 1, row.length).setValues([row]);
    // Its leaders are its first members, and so is whoever registered it.
    leaders.concat(leaders.indexOf(account.id) === -1 ? [account.id] : []).forEach(function (a) { cleanupPersonSet_(c.id, a, id, ''); });
    logChange_(account.email, 'Cleanup team', id, 'Registered', '', name + ' for ' + c.id + ', led by ' + leaders.join(' ') + ', ' + cleanupTemplate_(template).name);
    return cleanupsFor_(account);
  });
}
function cleanupJoin_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  return withLock_(function () {
    var c = cleanupFind_(clean_(req.cleanupId, 20));
    if (Date.now() >= c.endAt) throw new Error(c.name + ' is over.');
    var teams = cleanupTeamsAll_().filter(function (t) { return t.cleanup === c.id; });
    var leading = teams.filter(function (t) { return t.leaders.indexOf(account.id) !== -1; })[0];
    if (leading) throw new Error('You lead ' + leading.name + ', so you stay with it.');
    var teamId = clean_(req.teamId, 20);
    var team = teamId ? teams.filter(function (t) { return t.id === teamId; })[0] : null;
    if (teamId && !team) throw new Error('That team isn\'t here any more.');
    cleanupPersonSet_(c.id, account.id, team ? team.id : '', '');
    logChange_(account.email, 'Cleanup', c.id, 'Joined', '', team ? team.name : 'Asked to be placed');
    return cleanupsFor_(account);
  });
}

// A Team Leader turns the team's Need button on or off on the day; an admin can too (|Q1021 (a)).
function cleanupNeedSwitch_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  return withLock_(function () {
    var c = cleanupFind_(clean_(req.cleanupId, 20));
    var t = cleanupTeamsAll_().filter(function (x) { return x.id === clean_(req.teamId, 20) && x.cleanup === c.id; })[0];
    if (!t) throw new Error('That team isn\'t in this cleanup.');
    if (t.leaders.indexOf(account.id) === -1 && !isCleanupAdmin_(account)) throw new Error('Only ' + t.name + '\'s leaders turn its Need button on or off.');
    var v = req.on ? 'On' : 'Off';
    getDb_().getSheetByName(TABS.cleanupTeams.name).getRange(t.row, TEAM_COL.need).setValue(v);
    logChange_(account.email, 'Cleanup team', t.id, 'Need button', t.need || (needOn_(c, t) ? 'On' : 'Off'), v);
    forgetReads_();
    return cleanupsFor_(account);
  });
}

/* ── A Team Leader's menu for a member (item 7), and their state on the day (item 8) ── */

// Writes some of a member's columns: { state, note, stateAt, team, segments, hoursTo, hoursWhy, minors, seen }.
function cleanupPersonPut_(p, fields) {
  var sheet = getDb_().getSheetByName(TABS.cleanupPeople.name);
  Object.keys(fields).forEach(function (k) {
    var col = k === 'segments' ? PERSON_COL.segment : PERSON_COL[k], v = fields[k];
    if (k === 'segments') v = (v || []).join(' ');
    if ((k === 'stateAt' || k === 'hoursTo' || k === 'seen') && v) v = new Date(v);
    sheet.getRange(p.row, col).setValue(v == null ? '' : v);
  });
}
var CLEANUP_MEMBER_ACTS = ['promote', 'stepDown', 'notHere', 'here', 'unknown', 'goneHome', 'remove', 'move', 'hoursTo'];
function cleanupMember_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var act = String(req.act || '');
  if (CLEANUP_MEMBER_ACTS.indexOf(act) === -1) throw new Error('That isn\'t something to do for a member.');
  return withLock_(function () {
    var c = cleanupFind_(clean_(req.cleanupId, 20)), now = Date.now();
    var who = clean_(req.accountId, 20);
    var p = cleanupPeopleAll_().filter(function (x) { return x.cleanup === c.id && x.account === who && x.state !== 'Removed'; })[0];
    if (!p || !p.team) throw new Error('They aren\'t in a team in this cleanup.');
    var teams = cleanupTeamsAll_().filter(function (t) { return t.cleanup === c.id; });
    var t = teams.filter(function (x) { return x.id === p.team; })[0];
    var admin = isCleanupAdmin_(account), lead = t && t.leaders.indexOf(account.id) !== -1;
    // Changing an Unknown member's hours is an admin's, with a reason (|M1545); the rest, the team's leaders' or an admin's.
    if (act === 'hoursTo' ? !admin : (!lead && !admin)) throw new Error(act === 'hoursTo' ? 'Changing someone\'s hours is for HABO\'s admins.' : 'Only ' + t.name + '\'s leaders do that.');
    var isLeader = t.leaders.indexOf(who) !== -1, teamSheet = getDb_().getSheetByName(TABS.cleanupTeams.name);
    var name = (readAccounts_().filter(function (a) { return a.id === who; })[0] || {}).handle || who;
    var before = p.state || '', after = '';
    if (act === 'promote') {
      if (isLeader) throw new Error(name + ' leads ' + t.name + ' already.');
      teamSheet.getRange(t.row, TEAM_COL.leaders).setValue(t.leaders.concat([who]).join(' '));
      before = 'Member'; after = 'Team Leader';
    } else if (act === 'stepDown') {
      if (!isLeader) throw new Error(name + ' isn\'t one of ' + t.name + '\'s leaders.');
      if (t.leaders.length < 2) throw new Error(t.name + ' needs a leader: promote someone else first.');
      teamSheet.getRange(t.row, TEAM_COL.leaders).setValue(t.leaders.filter(function (x) { return x !== who; }).join(' '));
      before = 'Team Leader'; after = 'Member';
    } else if (act === 'notHere' || act === 'goneHome') {
      after = act === 'notHere' ? 'Not here today' : 'Gone home';
      cleanupPersonPut_(p, { state: after, note: clean_(req.note, 300), stateAt: now });
    } else if (act === 'unknown') {
      // Unknown asks for a note before it saves (item 8): what's known, so someone can follow up.
      var note = clean_(req.note, 300);
      if (!note) throw new Error('Say what you know before marking them Unknown: when and where they were last seen.');
      after = 'Unknown';
      cleanupPersonPut_(p, { state: after, note: note, stateAt: now });
    } else if (act === 'here') {
      cleanupPersonPut_(p, { state: '', note: '', stateAt: '' });
    } else if (act === 'remove' || act === 'move') {
      if (isLeader) throw new Error(name + ' leads ' + t.name + ': step them down first.');
      if (act === 'remove') {
        cleanupPersonPut_(p, { state: 'Removed', team: '', segments: [], stateAt: now });
        before = t.name; after = 'Removed';
      } else {
        var to = teams.filter(function (x) { return x.id === clean_(req.teamId, 20) && x.id !== t.id; })[0];
        if (!to) throw new Error('Pick another team in this cleanup.');
        cleanupPersonPut_(p, { team: to.id, segments: [], state: '', note: '', stateAt: '' });
        before = t.name; after = to.name;
      }
    } else if (act === 'hoursTo') {
      var m = /^(\d{4}-\d{2}-\d{2})[T ](\d{1,2}:\d{2})$/.exec(String(req.hoursTo || ''));
      var why = clean_(req.why, 300);
      if (!m) throw new Error('Give the time their hours stop, like ' + c.day + ' 11:30.');
      if (!why) throw new Error('Say why their hours stop then.');
      var stop = cleanupTime_(m[1], m[2]);
      cleanupPersonPut_(p, { hoursTo: stop, hoursWhy: why });
      before = p.hoursTo ? Utilities.formatDate(new Date(p.hoursTo), Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm') : (memberStop_(p) ? 'last seen' : '');
      after = m[1] + ' ' + m[2] + ': ' + why;
    }
    logChange_(account.email, 'Cleanup member', c.id + ' ' + who, act === 'hoursTo' ? 'Hours to' : act === 'promote' || act === 'stepDown' ? 'Role' : act === 'remove' || act === 'move' ? 'Team' : 'State', before, after);
    forgetReads_();
    return cleanupsFor_(account);
  });
}
// I'm leaving, on a member's own phone (item 8): Gone home, now.
function cleanupLeave_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  return withLock_(function () {
    var c = cleanupFind_(clean_(req.cleanupId, 20)), now = Date.now();
    var p = cleanupPeopleAll_().filter(function (x) { return x.cleanup === c.id && x.account === account.id && x.team && x.state !== 'Removed'; })[0];
    if (!p) throw new Error('You aren\'t in a team in ' + c.name + '.');
    cleanupPersonPut_(p, { state: 'Gone home', note: 'Said so in the app', stateAt: now });
    logChange_(account.email, 'Cleanup member', c.id + ' ' + account.id, 'State', p.state || '', 'Gone home');
    forgetReads_();
    return cleanupsFor_(account);
  });
}

/* ── A leader's: placing and assigning ── */

function cleanupAssign_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  return withLock_(function () {
    var c = cleanupFind_(clean_(req.cleanupId, 20));
    if (Date.now() >= c.endAt) throw new Error(c.name + ' is over.');
    var who = clean_(req.accountId, 20), teams = cleanupTeamsAll_().filter(function (t) { return t.cleanup === c.id; });
    var person = cleanupPeopleAll_().filter(function (p) { return p.cleanup === c.id && p.account === who; })[0];
    if (!person) throw new Error('They aren\'t in this cleanup.');
    // An admin can move someone to another team (S6-P27 item 1, |Q781 (a)); a leader places only the unplaced.
    var teamId = isCleanupAdmin_(account) && clean_(req.teamId, 20) ? clean_(req.teamId, 20) : person.team || clean_(req.teamId, 20);
    var team = teams.filter(function (t) { return t.id === teamId; })[0];
    if (!team) throw new Error('Place them in a team first.');
    if (team.leaders.indexOf(account.id) === -1 && !isCleanupAdmin_(account)) throw new Error('Only ' + team.name + '\'s leaders assign its members.');
    var seg = clean_(req.segmentId, 20);
    if (seg && c.segments.indexOf(seg) === -1) throw new Error('That segment isn\'t in this cleanup.');
    // Several segments each (S6-P27, |C1012): a segment tapped is added, or taken off if they have it; No segment clears them.
    // Moved to another team: that team's segment, or none yet.
    var list = team.id !== person.team ? (seg ? [seg] : []) : !seg ? []
      : person.segments.indexOf(seg) !== -1 ? person.segments.filter(function (s) { return s !== seg; }) : person.segments.concat([seg]);
    cleanupPersonSet_(c.id, who, team.id, list);
    logChange_(account.email, 'Cleanup', c.id, 'Assigned', who, (team.name) + (list.length ? ': ' + list.join(' ') : ''));
    return cleanupsFor_(account);
  });
}

/* ── On the day: checking in and out ── */

function cleanupCheckIn_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  return withLock_(function () {
    var c = cleanupFind_(clean_(req.cleanupId, 20)), now = Date.now();
    if (cleanupDayOf_(now) !== c.day) throw new Error('Check in on the day of ' + c.name + ', ' + c.day + '.');
    var people = cleanupPeopleAll_().filter(function (p) { return p.cleanup === c.id; });
    var me = people.filter(function (p) { return p.account === account.id; })[0];
    var forTeam = isCleanupAdmin_(account) && clean_(req.teamId, 20);
    var seg, crew;
    if (forTeam) {
      // An admin, for a team with no phone there (S6-P27 item 3, |Q781 (a)): any of its members, on any of the cleanup's segments.
      if (!cleanupTeamsAll_().some(function (t) { return t.id === forTeam && t.cleanup === c.id; })) throw new Error('That team isn\'t in this cleanup.');
      seg = clean_(req.segmentId, 20);
      if (c.segments.indexOf(seg) === -1) throw new Error('Choose one of the cleanup\'s segments.');
      me = { team: forTeam, segment: seg };
      crew = people.filter(function (p) { return p.team === forTeam; }).map(function (p) { return p.account; });
    } else {
      if (!me || !me.team || !me.segments.length) throw new Error('Your team\'s leaders haven\'t assigned you a segment yet.');
      seg = clean_(req.segmentId, 20) || me.segment;
      if (me.segments.indexOf(seg) === -1) throw new Error('That isn\'t one of your segments.');
      crew = people.filter(function (p) { return p.team === me.team && p.segments.indexOf(seg) !== -1 && p.state !== 'Removed'; }).map(function (p) { return p.account; });
    }
    var there = (Array.isArray(req.there) ? req.there : crew).map(String).filter(function (a, i, arr) { return crew.indexOf(a) !== -1 && arr.indexOf(a) === i; });
    if (!there.length) throw new Error('Tick who\'s there.');
    if (cleanupCheckinsAll_().some(function (k) { return k.cleanup === c.id && k.team === me.team && k.segment === seg && !k.outAt; })) throw new Error('Your team is checked in here already.');
    var sheet = getDb_().getSheetByName(TABS.cleanupCheckins.name), row = blankRow_(TABS.cleanupCheckins);
    var id = nextId_('CK', cleanupCheckinsAll_().map(function (k) { return k.id; }));
    row[CHECKIN_COL.id - 1] = id; row[CHECKIN_COL.cleanup - 1] = c.id; row[CHECKIN_COL.team - 1] = me.team; row[CHECKIN_COL.segment - 1] = seg;
    row[CHECKIN_COL.by - 1] = account.id; row[CHECKIN_COL.inAt - 1] = new Date(now); row[CHECKIN_COL.there - 1] = there.join(' ');
    sheet.getRange(lastRowWith_(sheet, CHECKIN_COL.id) + 1, 1, 1, row.length).setValues([row]);
    // They're on that segment now, with any others they had in that team.
    if (forTeam) there.forEach(function (a) {
      var p = people.filter(function (x) { return x.account === a; })[0], had = p && p.team === forTeam ? p.segments : [];
      cleanupPersonSet_(c.id, a, forTeam, had.indexOf(seg) === -1 ? had.concat([seg]) : had);
    });
    // Anyone under 18 with a member (item 9): a number beside each, counted under them.
    var minors = req.minors && typeof req.minors === 'object' ? req.minors : {};
    people.forEach(function (p) {
      if (there.indexOf(p.account) === -1) return;
      var fields = {};
      if (Object.prototype.hasOwnProperty.call(minors, p.account)) {
        var n = Math.round(Number(minors[p.account]));
        if (!(n >= 0 && n <= 30)) throw new Error('Under 18 with someone: a number from 0 to 30.');
        fields.minors = n;
      }
      // Ticked at check-in: here after all.
      if (p.state === 'Not here today' || p.state === 'Unknown') { fields.state = ''; fields.note = ''; fields.stateAt = ''; }
      if (Object.keys(fields).length) cleanupPersonPut_(p, fields);
    });
    logChange_(account.email, 'Cleanup check-in', id, 'In', '', c.id + ' ' + seg + ', ' + there.length + ' there' + (forTeam ? ', by an admin' : ''));
    return cleanupsFor_(account);
  });
}
// Check out: the segment's pounds are its weighings' (S7-P14 item 1); with none, it's
// weighed with the team's next segment, one reading for both, and neither gets a rate
// (item 3, |Q892 (a)). Pounds typed here still work, as before the weighings.
function cleanupCheckOut_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var typed = String(req.pounds == null ? '' : req.pounds).trim(), lbsTyped = Number(typed.replace(/[^\d.]/g, ''));
  if (typed !== '' && (!/\d/.test(typed) || !(lbsTyped >= 0) || lbsTyped > 2000)) throw new Error('Type the team\'s pounds for this segment, like 12.5.');
  return withLock_(function () {
    var all = cleanupCheckinsAll_(), k = all.filter(function (x) { return x.id === clean_(req.checkinId, 20); })[0];
    if (!k || k.outAt) throw new Error('That check-in isn\'t open any more.');
    var c = cleanupFind_(k.cleanup);
    var me = cleanupPeopleAll_().filter(function (p) { return p.cleanup === c.id && p.account === account.id; })[0];
    if ((!me || me.team !== k.team) && !isCleanupAdmin_(account)) throw new Error('Someone on the team checks out.');
    var now = Date.now(), sheet = getDb_().getSheetByName(TABS.cleanupCheckins.name);
    var ws = cleanupWeighingsAll_().filter(function (x) { return x.checkin === k.id; });
    if (!ws.length && typed === '') {
      sheet.getRange(k.row, CHECKIN_COL.outAt).setValue(new Date(now));
      sheet.getRange(k.row, CHECKIN_COL.withNext).setValue('Next');
      logChange_(account.email, 'Cleanup check-in', k.id, 'Out', '', 'no weighing: with the next segment');
      forgetReads_();
      return cleanupsFor_(account);
    }
    var lbs = ws.length ? ws.reduce(function (t, x) { return t + x.pounds; }, 0) : lbsTyped;
    // Earlier segments of this team left without a weighing: in with this one.
    var waiting = all.filter(function (x) { return x.cleanup === c.id && x.team === k.team && x.outAt && x.withNext === 'Next'; });
    var segs = segmentsAll_(), segOf = function (id) { return segs.filter(function (x) { return x.id === id; })[0]; };
    var parts = waiting.concat([k]);
    // Kept as a collection whose one weighing covers its segments, for their rates (|Q721 (a)).
    var team = cleanupTeamsAll_().filter(function (t) { return t.id === k.team; })[0];
    var colId = cleanupCollection_(account, c, team, k, parts.map(function (x) { return segOf(x.segment); }).filter(Boolean), lbs, now, Math.min.apply(null, parts.map(function (x) { return x.inAt; })));
    sheet.getRange(k.row, CHECKIN_COL.outAt).setValue(new Date(now));
    sheet.getRange(k.row, CHECKIN_COL.pounds).setValue(round_(lbs, 2));
    sheet.getRange(k.row, CHECKIN_COL.collection).setValue(colId);
    waiting.forEach(function (x) { sheet.getRange(x.row, CHECKIN_COL.withNext).setValue(k.id); sheet.getRange(x.row, CHECKIN_COL.collection).setValue(colId); });
    logChange_(account.email, 'Cleanup check-in', k.id, 'Out', '', round_(lbs, 2) + ' lb, ' + colId + (waiting.length ? ', with ' + waiting.map(function (x) { return x.id; }).join(' ') : ''));
    forgetReads_();
    measureWorld_(false, '');
    return cleanupsFor_(account);
  });
}

// A weighing on the crew's open check-in (items 1 and 2): all its bags together. A
// bag carried on is weighed whole, and the team's last reading is taken away; New
// bags, since that reading, count whole.
function cleanupWeigh_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var reading = Number(String(req.reading == null ? '' : req.reading).replace(/[^\d.]/g, ''));
  if (String(req.reading == null ? '' : req.reading).trim() === '' || !(reading > 0) || reading > 2000) throw new Error('Type what the scale shows for all the crew\'s bags, like 12.5.');
  return withLock_(function () {
    var k = cleanupCheckinsAll_().filter(function (x) { return x.id === clean_(req.checkinId, 20); })[0];
    if (!k || k.outAt) throw new Error('Check in on the segment first.');
    var c = cleanupFind_(k.cleanup);
    var me = cleanupPeopleAll_().filter(function (p) { return p.cleanup === c.id && p.account === account.id; })[0];
    if ((!me || me.team !== k.team) && !isCleanupAdmin_(account)) throw new Error('Someone on the team weighs.');
    var fresh = !!req.fresh, before = cleanupWeighingsAll_().filter(function (x) { return x.cleanup === c.id && x.team === k.team; }).sort(function (a, b) { return a.at - b.at; }).pop();
    var lbs = fresh || !before ? reading : reading - before.reading;
    if (lbs < 0) throw new Error('Less than your last reading (' + before.reading + ' lb). Started new bags? Tick New bags since the last weighing.');
    var sheet = getDb_().getSheetByName(TABS.cleanupWeighings.name), row = blankRow_(TABS.cleanupWeighings), now = Date.now();
    var id = nextId_('CW', cleanupWeighingsAll_().map(function (x) { return x.id; }));
    row[WEIGH_COL.id - 1] = id; row[WEIGH_COL.cleanup - 1] = c.id; row[WEIGH_COL.checkin - 1] = k.id; row[WEIGH_COL.team - 1] = k.team; row[WEIGH_COL.segment - 1] = k.segment;
    row[WEIGH_COL.by - 1] = account.id; row[WEIGH_COL.at - 1] = new Date(now); row[WEIGH_COL.reading - 1] = round_(reading, 2); row[WEIGH_COL.fresh - 1] = fresh ? 'Yes' : ''; row[WEIGH_COL.pounds - 1] = round_(lbs, 2);
    sheet.getRange(lastRowWith_(sheet, WEIGH_COL.id) + 1, 1, 1, row.length).setValues([row]);
    logChange_(account.email, 'Cleanup weighing', id, 'Weighed', '', k.id + ' ' + round_(reading, 2) + ' lb read, ' + round_(lbs, 2) + ' lb new');
    forgetReads_();
    return cleanupsFor_(account);
  });
}

// Where the crew left its bags (item 4): a pin, and why.
function cleanupBag_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var why = String(req.why || ''), lat = Number(req.lat), lon = Number(req.lon);
  if (CLEANUP_BAG_WHYS.indexOf(why) === -1) throw new Error('Pick where the bags are: ' + CLEANUP_BAG_WHYS.join(', ') + '.');
  if (!(isFinite(lat) && isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && (lat || lon))) throw new Error('Add its place: press Use my location.');
  return withLock_(function () {
    var k = cleanupCheckinsAll_().filter(function (x) { return x.id === clean_(req.checkinId, 20); })[0];
    if (!k) throw new Error('That check-in isn\'t here any more.');
    var c = cleanupFind_(k.cleanup);
    var me = cleanupPeopleAll_().filter(function (p) { return p.cleanup === c.id && p.account === account.id; })[0];
    if ((!me || me.team !== k.team) && !isCleanupAdmin_(account)) throw new Error('Someone on the team marks where the bags are.');
    var sheet = getDb_().getSheetByName(TABS.cleanupBags.name), row = blankRow_(TABS.cleanupBags);
    var id = nextId_('CB', cleanupBagsAll_().map(function (x) { return x.id; }));
    row[BAG_COL.id - 1] = id; row[BAG_COL.cleanup - 1] = c.id; row[BAG_COL.team - 1] = k.team; row[BAG_COL.segment - 1] = k.segment; row[BAG_COL.by - 1] = account.id;
    row[BAG_COL.at - 1] = new Date(); row[BAG_COL.lat - 1] = round_(lat, 6); row[BAG_COL.lon - 1] = round_(lon, 6); row[BAG_COL.why - 1] = why;
    sheet.getRange(lastRowWith_(sheet, BAG_COL.id) + 1, 1, 1, row.length).setValues([row]);
    logChange_(account.email, 'Cleanup bags', id, 'Left', '', k.id + ': ' + why);
    forgetReads_();
    return cleanupsFor_(account);
  });
}
// An admin enters or fixes a team's pounds after the day (S6-P27 item 4, |Q781 (a)), from a weigh-in at the end:
// the check-in's pounds, and its collection's and weighing's, then the rates again.
function cleanupPounds_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!isCleanupAdmin_(account)) throw new Error('Fixing a team\'s pounds is for HABO\'s admins.');
  var lbs = Number(String(req.pounds == null ? '' : req.pounds).replace(/[^\d.]/g, ''));
  if (String(req.pounds == null ? '' : req.pounds).trim() === '' || !(lbs >= 0) || lbs > 2000) throw new Error('Type the team\'s pounds for this segment, like 12.5.');
  return withLock_(function () {
    var k = cleanupCheckinsAll_().filter(function (x) { return x.id === clean_(req.checkinId, 20); })[0];
    if (!k) throw new Error('That check-in isn\'t there any more.');
    if (!k.outAt) throw new Error('Check it out first: Check out asks its pounds.');
    getDb_().getSheetByName(TABS.cleanupCheckins.name).getRange(k.row, CHECKIN_COL.pounds).setValue(round_(lbs, 2));
    var q = readRows_(TABS.collections).filter(function (r) { return r.get('id') === k.collection; })[0];
    if (q) getDb_().getSheetByName(TABS.collections.name).getRange(q.row, COLLECTION_COL.pounds).setValue(round_(lbs, 2));
    var st = readRows_(TABS.stretches).filter(function (r) { return r.get('collection') === k.collection; })[0];
    if (st) getDb_().getSheetByName(TABS.stretches.name).getRange(st.row, STRETCH_COL.pounds).setValue(round_(lbs, 2));
    logChange_(account.email, 'Cleanup check-in', k.id, 'Pounds', k.pounds == null ? '' : String(k.pounds), String(round_(lbs, 2)));
    forgetReads_();
    measureWorld_(false, '');
    return cleanupsFor_(account);
  });
}
function cleanupCollection_(account, c, team, k, g, lbs, now, from) {
  var gs = Array.isArray(g) ? g : (g ? [g] : []), inAt = from || k.inAt;
  var cols = getDb_().getSheetByName(TABS.collections.name);
  var id = nextId_('L', readRows_(TABS.collections).map(function (q) { return q.get('id'); }));
  var hours = Math.max(0, now - inAt) / 3600000, miles = gs.reduce(function (t, x) { return t + (x.miles || 0); }, 0);
  var cells = [];
  gs.forEach(function (x) { x.squares.forEach(function (q) { if (cells.indexOf(q) === -1) cells.push(q); }); });
  var row = blankRow_(TABS.collections), put = function (key, v) { row[COLLECTION_COL[key] - 1] = v; };
  put('id', id); put('account', account.id); put('handle', account.handle); put('started', new Date(inAt)); put('ended', new Date(now));
  put('status', 'Ended'); put('stretches', 1); put('pounds', round_(lbs, 2)); put('miles', round_(miles, 3));
  put('active', round_(hours * 60, 1)); put('hours', round_(hours, 2));
  put('hoursNote', 'Cleanup ' + c.id + ' (' + c.name + '), team ' + (team ? team.name : k.team) + ', ' + k.there.length + ' there: ' + round_(hours * k.there.length, 2) + ' person-hours');
  put('updated', new Date(now));
  cols.getRange(lastRowWith_(cols, COLLECTION_COL.id) + 1, 1, 1, row.length).setValues([row]);
  var st = getDb_().getSheetByName(TABS.stretches.name);
  var sid = nextId_('S', readRows_(TABS.stretches).map(function (q) { return q.get('id'); }));
  var s = blankRow_(TABS.stretches), sp = function (key, v) { s[STRETCH_COL[key] - 1] = v; };
  sp('id', sid); sp('collection', id); sp('account', account.id); sp('n', 1); sp('started', new Date(inAt)); sp('ended', new Date(now));
  sp('cells', squaresPack_(cells.join(' '))); sp('streetMi', round_(miles, 3)); sp('offMi', 0); sp('activeMin', round_(hours * 60, 1));
  sp('pounds', round_(lbs, 2)); sp('received', new Date(now));
  st.getRange(lastRowWith_(st, STRETCH_COL.id) + 1, 1, 1, s.length).setValues([s]);
  return id;
}
