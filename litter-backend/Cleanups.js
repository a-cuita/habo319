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
var CLEANUP_COL = { id: 1, name: 2, day: 3, starts: 4, ends: 5, segments: 6, until: 7, state: 8, by: 9, made: 10 };
var TEAM_COL = { id: 1, cleanup: 2, name: 3, leaders: 4, by: 5, made: 6 };
var PERSON_COL = { cleanup: 1, account: 2, team: 3, segment: 4, joined: 5 };
var CHECKIN_COL = { id: 1, cleanup: 2, team: 3, segment: 4, by: 5, inAt: 6, outAt: 7, there: 8, pounds: 9, collection: 10 };
var CLEANUP_STATES = ['Open', 'Retired'];

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
    var c = { row: r.row, id: r.get('id'), name: r.get('name'), day: day, starts: String(r.get('starts')), ends: String(r.get('ends')),
      segments: idList_(r.get('segments')), until: u instanceof Date ? u.getTime() : 0, state: r.get('state') === 'Retired' ? 'Retired' : 'Open', by: r.get('by') };
    c.startAt = cleanupTime_(c.day, c.starts); c.endAt = cleanupTime_(c.day, c.ends);
    return c;
  });
}
function cleanupTeamsAll_() {
  return readRows_(TABS.cleanupTeams, TEAM_COL).map(function (r) {
    return { row: r.row, id: r.get('id'), cleanup: r.get('cleanup'), name: r.get('name'), leaders: idList_(r.get('leaders')) };
  });
}
function cleanupPeopleAll_() {
  return readRows_(TABS.cleanupPeople, PERSON_COL).map(function (r) {
    // A member can have several segments (S6-P27, |C1012): their ids, space-separated, in the order given.
    var segsOf = String(r.get('segment') || '').split(/\s+/).filter(String);
    return { row: r.row, cleanup: r.get('cleanup'), account: r.get('account'), team: r.get('team'), segments: segsOf, segment: segsOf[0] || '' };
  });
}
function cleanupCheckinsAll_() {
  return readRows_(TABS.cleanupCheckins, CHECKIN_COL).map(function (r) {
    var t = function (k) { var v = r.get(k); return v instanceof Date ? v.getTime() : 0; };
    return { row: r.row, id: r.get('id'), cleanup: r.get('cleanup'), team: r.get('team'), segment: r.get('segment'), by: r.get('by'),
      inAt: t('inAt'), outAt: t('outAt'), there: idList_(r.get('there')), pounds: r.get('pounds') === '' ? null : Number(r.get('pounds')), collection: r.get('collection') };
  });
}
function isCleanupAdmin_(account) { return !!account.rank && rankAtLeast_(account.rank, 'Builder'); }
function cleanupFind_(id) {
  var c = cleanupsAll_().filter(function (x) { return x.id === id; })[0];
  if (!c || c.state !== 'Open') throw new Error('That cleanup isn\'t here any more.');
  return c;
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
    myTeam: mine ? mine.team : '', placeMe: !!mine && !mine.team, mySegment: mine ? mine.segment : '', mySegments: mine ? mine.segments : [], admin: admin };
  view.teams = myTeams.map(function (t) {
    var lead = t.leaders.indexOf(account.id) !== -1;
    var members = people.filter(function (p) { return p.cleanup === c.id && p.team === t.id; }).map(function (p) {
      var w = who(p.account); w.segment = p.segment; w.segments = p.segments; w.segmentName = p.segments.map(segName).join(', '); w.leader = t.leaders.indexOf(p.account) !== -1; return w;
    });
    return { id: t.id, name: t.name, leaders: t.leaders.map(who), members: members, mine: !!mine && mine.team === t.id, lead: lead };
  });
  var leads = view.teams.some(function (t) { return t.lead; });
  view.lead = leads;
  // Players asking to be placed: for a team's leaders and admins, who place them.
  view.unplaced = admin || leads ? people.filter(function (p) { return p.cleanup === c.id && !p.team; }).map(function (p) { return who(p.account); }) : [];
  view.checkins = ins.map(function (k) {
    return { id: k.id, team: k.team, segment: k.segment, segmentName: segName(k.segment), by: names[k.by] || '', inAt: k.inAt, outAt: k.outAt,
      there: k.there.map(who), pounds: k.pounds };
  });
  // After (item 5): pounds by segment and by team, and each member's hours.
  var bySeg = {}, byTeam = {}, hours = {};
  ins.forEach(function (k) {
    if (!k.outAt || k.pounds == null) return;
    bySeg[k.segment] = (bySeg[k.segment] || 0) + k.pounds;
    byTeam[k.team] = (byTeam[k.team] || 0) + k.pounds;
    var h = Math.max(0, k.outAt - k.inAt) / 3600000;
    k.there.forEach(function (a) { hours[a] = (hours[a] || 0) + h; });
  });
  view.results = {
    bySegment: Object.keys(bySeg).map(function (s) { return { segment: s, name: segName(s), pounds: round_(bySeg[s], 2) }; }),
    byTeam: Object.keys(byTeam).map(function (t) { var x = myTeams.filter(function (y) { return y.id === t; })[0]; return { team: t, name: x ? x.name : t, pounds: round_(byTeam[t], 2) }; }),
    hours: Object.keys(hours).map(function (a) { return { id: a, handle: names[a] || 'a volunteer', hours: round_(hours[a], 2) }; }),
    personHours: round_(Object.keys(hours).reduce(function (s, a) { return s + hours[a]; }, 0), 2) };
  return view;
}

function cleanupsLoad_(req) {
  ensureSchema_();
  return cleanupsFor_(requireAccount_(req.token));
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
    today = { cleanup: v.id, name: v.name, segment: seg, segmentName: segs[seg] ? segs[seg].name : seg,
      checkin: open ? open.id : '', inAt: open ? open.inAt : 0, done: isDone(seg),
      left: v.mySegments.filter(function (s) { return s !== seg && !isDone(s); }).map(function (s) { return segs[s] ? segs[s].name : s; }),
      members: team ? team.members.filter(function (m) { return m.segments.indexOf(seg) !== -1; }).map(function (m) { return { id: m.id, handle: m.handle }; }) : [] };
  });
  return { cleanups: views, segments: segList, admin: isCleanupAdmin_(account), me: account.id, today: today };
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
  return withLock_(function () {
    var sheet = getDb_().getSheetByName(TABS.cleanups.name), all = cleanupsAll_();
    var id = clean_(x.id, 20), had = id ? all.filter(function (c) { return c.id === id; })[0] : null;
    if (id && !had) throw new Error('That cleanup isn\'t here any more.');
    var row = had ? sheet.getRange(had.row, 1, 1, TABS.cleanups.header.length).getValues()[0] : blankRow_(TABS.cleanups);
    row[CLEANUP_COL.name - 1] = safeCell_(name); row[CLEANUP_COL.day - 1] = day; row[CLEANUP_COL.starts - 1] = starts; row[CLEANUP_COL.ends - 1] = ends;
    row[CLEANUP_COL.segments - 1] = segments.join(' '); row[CLEANUP_COL.until - 1] = until ? new Date(until) : '';
    if (!had) {
      row[CLEANUP_COL.id - 1] = nextId_('CU', all.map(function (c) { return c.id; }));
      row[CLEANUP_COL.state - 1] = 'Open'; row[CLEANUP_COL.by - 1] = account.handle || account.email; row[CLEANUP_COL.made - 1] = new Date();
    }
    sheet.getRange(had ? had.row : lastRowWith_(sheet, CLEANUP_COL.id) + 1, 1, 1, row.length).setValues([row]);
    logChange_(account.email, 'Cleanup', row[CLEANUP_COL.id - 1], had ? 'Changed' : 'Made', had ? had.name : '', name + ', ' + day + ' ' + starts + ' to ' + ends + ', ' + segments.join(' '));
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
  if (had) { sheet.getRange(had.row, PERSON_COL.team, 1, 2).setValues([[team, segment]]); return; }
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
    var teams = cleanupTeamsAll_().filter(function (t) { return t.cleanup === c.id; });
    if (teams.some(function (t) { return t.name.toLowerCase() === name.toLowerCase(); })) throw new Error('A team in this cleanup is called ' + name + ' already.');
    var busy = teams.filter(function (t) { return t.leaders.some(function (l) { return leaders.indexOf(l) !== -1; }); })[0];
    if (busy) throw new Error('One of those leaders leads ' + busy.name + ' already.');
    var sheet = getDb_().getSheetByName(TABS.cleanupTeams.name), row = blankRow_(TABS.cleanupTeams);
    var id = nextId_('TM', cleanupTeamsAll_().map(function (t) { return t.id; }));
    row[TEAM_COL.id - 1] = id; row[TEAM_COL.cleanup - 1] = c.id; row[TEAM_COL.name - 1] = safeCell_(name); row[TEAM_COL.leaders - 1] = leaders.join(' ');
    row[TEAM_COL.by - 1] = account.id; row[TEAM_COL.made - 1] = new Date();
    sheet.getRange(lastRowWith_(sheet, TEAM_COL.id) + 1, 1, 1, row.length).setValues([row]);
    // Its leaders are its first members, and so is whoever registered it.
    leaders.concat(leaders.indexOf(account.id) === -1 ? [account.id] : []).forEach(function (a) { cleanupPersonSet_(c.id, a, id, ''); });
    logChange_(account.email, 'Cleanup team', id, 'Registered', '', name + ' for ' + c.id + ', led by ' + leaders.join(' '));
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
      crew = people.filter(function (p) { return p.team === me.team && p.segments.indexOf(seg) !== -1; }).map(function (p) { return p.account; });
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
    logChange_(account.email, 'Cleanup check-in', id, 'In', '', c.id + ' ' + seg + ', ' + there.length + ' there' + (forTeam ? ', by an admin' : ''));
    return cleanupsFor_(account);
  });
}
function cleanupCheckOut_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var lbs = Number(String(req.pounds == null ? '' : req.pounds).replace(/[^\d.]/g, ''));
  if (String(req.pounds == null ? '' : req.pounds).trim() === '' || !(lbs >= 0) || lbs > 2000) throw new Error('Type the team\'s pounds for this segment, like 12.5.');
  return withLock_(function () {
    var k = cleanupCheckinsAll_().filter(function (x) { return x.id === clean_(req.checkinId, 20); })[0];
    if (!k || k.outAt) throw new Error('That check-in isn\'t open any more.');
    var c = cleanupFind_(k.cleanup);
    var me = cleanupPeopleAll_().filter(function (p) { return p.cleanup === c.id && p.account === account.id; })[0];
    if ((!me || me.team !== k.team) && !isCleanupAdmin_(account)) throw new Error('Someone on the team checks out.');
    var now = Date.now(), g = segmentsAll_().filter(function (x) { return x.id === k.segment; })[0];
    // Kept as a collection whose one weighing is the whole segment, for its rate (|Q721 (a)).
    var team = cleanupTeamsAll_().filter(function (t) { return t.id === k.team; })[0];
    var colId = cleanupCollection_(account, c, team, k, g, lbs, now);
    var sheet = getDb_().getSheetByName(TABS.cleanupCheckins.name);
    sheet.getRange(k.row, CHECKIN_COL.outAt).setValue(new Date(now));
    sheet.getRange(k.row, CHECKIN_COL.pounds).setValue(round_(lbs, 2));
    sheet.getRange(k.row, CHECKIN_COL.collection).setValue(colId);
    logChange_(account.email, 'Cleanup check-in', k.id, 'Out', '', round_(lbs, 2) + ' lb, ' + colId);
    forgetReads_();
    measureWorld_(false, '');
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
function cleanupCollection_(account, c, team, k, g, lbs, now) {
  var cols = getDb_().getSheetByName(TABS.collections.name);
  var id = nextId_('L', readRows_(TABS.collections).map(function (q) { return q.get('id'); }));
  var hours = Math.max(0, now - k.inAt) / 3600000, miles = g ? g.miles : 0;
  var row = blankRow_(TABS.collections), put = function (key, v) { row[COLLECTION_COL[key] - 1] = v; };
  put('id', id); put('account', account.id); put('handle', account.handle); put('started', new Date(k.inAt)); put('ended', new Date(now));
  put('status', 'Ended'); put('stretches', 1); put('pounds', round_(lbs, 2)); put('miles', round_(miles, 3));
  put('active', round_(hours * 60, 1)); put('hours', round_(hours, 2));
  put('hoursNote', 'Cleanup ' + c.id + ' (' + c.name + '), team ' + (team ? team.name : k.team) + ', ' + k.there.length + ' there: ' + round_(hours * k.there.length, 2) + ' person-hours');
  put('updated', new Date(now));
  cols.getRange(lastRowWith_(cols, COLLECTION_COL.id) + 1, 1, 1, row.length).setValues([row]);
  var st = getDb_().getSheetByName(TABS.stretches.name);
  var sid = nextId_('S', readRows_(TABS.stretches).map(function (q) { return q.get('id'); }));
  var s = blankRow_(TABS.stretches), sp = function (key, v) { s[STRETCH_COL[key] - 1] = v; };
  sp('id', sid); sp('collection', id); sp('account', account.id); sp('n', 1); sp('started', new Date(k.inAt)); sp('ended', new Date(now));
  sp('cells', squaresPack_(g ? g.squares.join(' ') : '')); sp('streetMi', round_(miles, 3)); sp('offMi', 0); sp('activeMin', round_(hours * 60, 1));
  sp('pounds', round_(lbs, 2)); sp('received', new Date(now));
  st.getRange(lastRowWith_(st, STRETCH_COL.id) + 1, 1, 1, s.length).setValues([s]);
  return id;
}
