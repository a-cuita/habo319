/**
 * Litter Class Skills built from the toolbox (S6-P8's rework). Jeremy, in
 * chat, Nov 6: "the trash receptacle thing should be a litter skill, not a
 * challenge. the challenges are supposed to be built out of existing
 * skills." His answers to my list: skills built on a Skills screen in Admin
 * Mode; Challenges built from a skill and a goal; skills used from the Litter
 * Class Skills sheet, which a Skills button opens while collecting, Litter
 * pulse staying its own button; what was already sent moves to the skill.
 *
 * A Builder or above builds a skill from the toolbox (|M846): what players
 * send (a place from the phone's GPS, a photo, a note), what the screen says
 * and why, the XP for each one approved, the XP when it's within so many
 * metres of a public segment, and the level it opens at. Each one sent is
 * reviewed in Reviews; approved, it earns its XP.
 *
 * Round 3 (S7-P4 items 5 to 12, |Q732 to |Q743, |Q852, |Q853, |Q870):
 * - When it can be used, in any mix: only while collecting; only within so
 *   many metres of a public segment; only after a weighing (clean; with a
 *   litter type picked; or a Litter Index at or above a number), open until
 *   the next litter pulse; at most once in so many minutes for each player,
 *   and at the same spot by anyone (within SKILL_SPOT_M).
 * - What players send, in any mix: a place, a photo, a note; a count; a
 *   choice from a short list; a before and an after photo, the before at Use,
 *   the after once its weighing condition is met.
 * - A photo by chance: "also asks for a photo" so often; not taken, not sent.
 * - Its map pin, an emoji: approved ones with a place show on the map for
 *   everyone, without who sent them, and on a player's share picture of a
 *   walk when they choose it.
 * - Grab a location: the place first, then why, picked from the skills set
 *   as its whys; the why opens that skill, the place kept. No why, nothing kept.
 */
var SKILL_COL = { id: 1, name: 2, says: 3, why: 4, actions: 5, near: 6, xpEach: 7, xpNear: 8, level: 9, state: 10, by: 11, made: 12,
  collecting: 13, onlyNear: 14, after: 15, litterType: 16, indexAtLeast: 17, everyPlayer: 18, everySpot: 19, choices: 20, chance: 21, pin: 22, whyOf: 23, grab: 24 };
var SKILL_ACTIONS = ['Place', 'Photo', 'Note', 'Count', 'Choice', 'Before and after'];
var SKILL_AFTER = ['', 'Clean', 'Litter type', 'Litter Index'];
var SKILL_SPOT_M = 25;   // "the same spot", for Once at a spot
var SKILL_AFTER_DUE = 'After photo due';

function toolSkillsAll_() {
  return readRows_(TABS.toolSkills, SKILL_COL).map(function (r) {
    var n = function (k) { var v = Number(r.get(k)); return r.get(k) === '' || !isFinite(v) ? 0 : v; };
    var m = r.get('made'), after = String(r.get('after') || '').trim();
    return { row: r.row, id: r.get('id'), name: r.get('name'), says: r.get('says'), why: r.get('why'),
      actions: String(r.get('actions')).split(/\s*,\s*/).filter(function (a) { return SKILL_ACTIONS.indexOf(a) !== -1; }),
      near: n('near'), xpEach: n('xpEach'), xpNear: n('xpNear'), level: Math.max(0, Math.floor(n('level'))),
      state: /^\s*r/i.test(r.get('state')) ? 'Retired' : 'Open', by: r.get('by'), made: m instanceof Date ? m.getTime() : 0,
      collecting: /^\s*y/i.test(r.get('collecting')), onlyNear: n('onlyNear'), after: SKILL_AFTER.indexOf(after) !== -1 ? after : '',
      litterType: String(r.get('litterType') || '').trim(), indexAtLeast: n('indexAtLeast'), everyPlayer: n('everyPlayer'), everySpot: n('everySpot'),
      choices: String(r.get('choices') || '').split(/\s*,\s*/).filter(String), chance: Math.max(0, Math.min(100, n('chance'))),
      pin: String(r.get('pin') || '').trim(), whyOf: String(r.get('whyOf') || '').trim(), grab: /^\s*y/i.test(r.get('grab')) };
  }).filter(function (s) { return s.id; });
}

/* ── When a skill can be used (item 6) ── */

// The walk in progress, and its last weighing: what "after a weighing" reads.
function skillWalk_(accountId) {
  var col = openCollection_(accountId);
  if (!col) return { walk: '', last: null };
  var ws = stretchesOf_(col.id).filter(function (s) { return !s.discarded && s.pounds != null; });
  return { walk: col.id, last: ws.length ? ws[ws.length - 1] : null };
}
function weighingMeets_(s, last) {
  if (!last) return false;
  if (s.after === 'Clean') return last.pounds === 0 && (last.rating == null || last.rating === 0);   // |Q732, Jeremy's Perfectly Clean Photo
  if (s.after === 'Litter type') return last.types.indexOf(s.litterType) !== -1;   // |Q738
  if (s.after === 'Litter Index') return last.index != null && last.index >= s.indexAtLeast;   // |Q739
  return true;
}
function afterSay_(s) {
  var w = s.after === 'Clean' ? 'a clean weighing: no litter, rated 0' : s.after === 'Litter type' ? 'a weighing with ' + (s.litterType || 'its litter type') + ' picked'
    : 'a weighing with a Litter Index of ' + s.indexAtLeast + ' or more';
  return 'After ' + w + ', until your next litter pulse.';
}
// Why it can't be used now, or '' when it can. Its place's own checks come at Send.
function skillBlocked_(s, account, ctx) {
  if (s.collecting && !ctx.walk) return 'Only while collecting.';
  if (s.after && s.actions.indexOf('Before and after') === -1) {
    if (!ctx.walk) return 'Only while collecting. ' + afterSay_(s);
    if (!weighingMeets_(s, ctx.last)) return afterSay_(s);
  }
  if (s.everyPlayer > 0) {
    var last = ctx.items.filter(function (x) { return x.skill === s.id && x.account === account.id; }).reduce(function (m, x) { return Math.max(m, x.sent); }, 0);
    var left = Math.ceil((last + s.everyPlayer * 60000 - ctx.now) / 60000);
    if (last && left > 0) return 'Again in ' + left + (left === 1 ? ' minute.' : ' minutes.');
  }
  return '';
}
function skillCtx_(account) {
  var w = skillWalk_(account.id);
  return { walk: w.walk, last: w.last, items: challengeItemsAll_(), now: Date.now() };
}

/* ── The player's side: the Litter Class Skills sheet ── */

function toolSkillView_(s, account, level, items, why, ctx) {
  var mine = items.filter(function (x) { return x.skill === s.id && x.account === account.id; }).map(function (x) {
    return { id: x.id, sent: x.sent, state: x.state, xp: x.state === 'Approved' ? x.xp : 0, note: x.note, near: x.near, lat: x.lat, lon: x.lon,
      why: x.state === 'Declined' ? (why[x.id] || '') : '', count: x.count, choice: x.choice,
      // Its after photo, once the weighing it waits for is there (item 7, |Q743).
      afterReady: x.state === SKILL_AFTER_DUE && (!s.after || (!!ctx.walk && weighingMeets_(s, ctx.last))) };
  });
  return { id: s.id, name: s.name, says: s.says, why: s.why, actions: s.actions, near: s.near, xpEach: s.xpEach, xpNear: s.xpNear, level: s.level,
    state: s.state, locked: level < s.level, mine: mine, blocked: ctx ? skillBlocked_(s, account, ctx) : '',
    collecting: s.collecting, onlyNear: s.onlyNear, after: s.after, afterSay: s.after ? afterSay_(s) : '', choices: s.choices, chance: s.chance, pin: s.pin,
    whyOf: s.whyOf, grab: s.grab };
}
function toolSkillsLoad_(req) {
  ensureSchema_();
  return toolSkillsFor_(requireAccount_(req.token));
}
function toolSkillsFor_(account) {
  var ctx = skillCtx_(account), items = ctx.items, level = levelFor_(account.id);
  // A declined item's note, which the player sees.
  var why = {};
  reviewRows_().forEach(function (m) { if (/^CI\d+$/.test(m.segment) && m.move === REVIEW_DECIDE.decline) why[m.segment] = m.note; });
  var all = toolSkillsAll_();
  var list = all.filter(function (s) {
    return s.state === 'Open' || items.some(function (x) { return x.skill === s.id && x.account === account.id; });
  }).map(function (s) { return toolSkillView_(s, account, level, items, why, ctx); });
  // Grab a location's whys (item 11): each open skill set as one, that this player can use.
  var whys = list.filter(function (s) { return s.whyOf && s.state === 'Open' && !s.locked && !s.grab; }).map(function (s) { return { skill: s.id, why: s.whyOf, blocked: s.blocked }; });
  list.forEach(function (s) { if (s.grab) s.whys = whys; });
  return { skills: list, level: level, collecting: ctx.walk };
}

function skillPhotoFile_(s, account, photo, tag) {
  var type = /^data:image\/png/.test(photo) ? 'image/png' : 'image/jpeg';
  var blob = Utilities.newBlob(Utilities.base64Decode(photo.split(',')[1]), type, s.name + tag + ' ' + (account.handle || account.id) + ' ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HHmm') + (type === 'image/png' ? '.png' : '.jpg'));
  return challengePhotosFolder_().createFile(blob).getId();
}
// The after photo of a before-and-after (item 7, |Q743): once its weighing
// condition is met, like the weighing with Cigarette butts; then it's reviewed.
function toolSkillAfter_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var x = challengeItemsAll_().filter(function (i) { return i.id === clean_(req.itemId, 20) && i.account === account.id; })[0];
  if (!x || x.state !== SKILL_AFTER_DUE) throw new Error('That one isn\'t waiting for its after photo.');
  var s = toolSkillsAll_().filter(function (k) { return k.id === x.skill; })[0];
  if (!s) throw new Error('That skill isn\'t here any more.');
  var ctx = skillCtx_(account);
  if (s.after && !(ctx.walk && weighingMeets_(s, ctx.last))) throw new Error('Its after photo comes ' + afterSay_(s).charAt(0).toLowerCase() + afterSay_(s).slice(1));
  var photo = String(req.photo || '');
  if (!photo || photo.length > CHALLENGE_PHOTO_MAX || !/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(photo)) throw new Error('Add its after photo.');
  var fileId = skillPhotoFile_(s, account, photo, ' after');
  return withLock_(function () {
    var sheet = getDb_().getSheetByName(TABS.challengeItems.name);
    sheet.getRange(x.row, ITEM_COL.after).setValue(fileId);
    sheet.getRange(x.row, ITEM_COL.state).setValue('Waiting');
    forgetReads_();
    return toolSkillsFor_(account);
  });
}

// One sent with a skill: its place, its photo, its note.
function toolSkillSend_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var s = toolSkillsAll_().filter(function (x) { return x.id === clean_(req.skillId, 20); })[0];
  if (!s) throw new Error('That skill isn\'t here any more.');
  if (s.state !== 'Open') throw new Error(s.name + ' isn\'t open now.');
  var level = levelFor_(account.id);
  if (level < s.level) throw new Error(s.name + ' unlocks at Level ' + s.level + '. You\'re at Level ' + level + '.');
  if (s.grab) throw new Error('Pick why you grabbed it: the why is the skill that\'s sent.');
  var ctx = skillCtx_(account), blocked = skillBlocked_(s, account, ctx);
  if (blocked) throw new Error(s.name + ': ' + blocked);
  var lat = req.lat == null || req.lat === '' ? null : Number(req.lat), lon = req.lon == null || req.lon === '' ? null : Number(req.lon);
  var acc = req.acc == null || req.acc === '' ? null : Number(req.acc), note = clean_(req.note, 1000), photo = String(req.photo || '');
  if (s.actions.indexOf('Place') !== -1 && !(isFinite(lat) && isFinite(lon) && lat !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) throw new Error('Add its place: press Use my location.');
  var twoPhotos = s.actions.indexOf('Before and after') !== -1;
  if ((s.actions.indexOf('Photo') !== -1 || twoPhotos) && !photo) throw new Error(twoPhotos ? 'Add its before photo.' : 'Add its photo.');
  var count = '', choice = '';
  if (s.actions.indexOf('Count') !== -1) {
    count = Number(req.count);
    if (!(count >= 1 && count <= 999 && Math.floor(count) === count)) throw new Error('Say how many: a whole number, 1 or more.');
  }
  if (s.actions.indexOf('Choice') !== -1) {
    choice = clean_(req.choice, 80);
    if (s.choices.indexOf(choice) === -1) throw new Error('Pick one: ' + s.choices.join(', ') + '.');
  }
  // Only near a public segment (|Q737): within its metres of one.
  if (s.onlyNear > 0 && !(lat != null && nearSegment_(lat, lon, s.onlyNear))) throw new Error(s.name + ' is only for within ' + s.onlyNear + ' m of a public segment, and this place is farther.');
  // Once at a spot (|Q740's second reading): nobody sends it again within SKILL_SPOT_M so soon.
  if (s.everySpot > 0 && lat != null) {
    var p0 = LitterGeo.xy(lat, lon), cut = ctx.now - s.everySpot * 60000;
    var here = ctx.items.filter(function (x) { return x.skill === s.id && x.sent > cut && x.lat != null && LitterGeo.dist(p0, LitterGeo.xy(x.lat, x.lon)) <= SKILL_SPOT_M; })
      .reduce(function (m, x) { return Math.max(m, x.sent); }, 0);
    if (here) { var wait = Math.ceil((here + s.everySpot * 60000 - ctx.now) / 60000); throw new Error('One was sent here ' + Math.max(1, Math.round((ctx.now - here) / 60000)) + ' minutes ago: ' + s.name + ' can be sent here again in ' + wait + (wait === 1 ? ' minute.' : ' minutes.')); }
  }
  if (s.actions.indexOf('Note') !== -1 && s.actions.length === 1 && !note) throw new Error('Write its note.');
  if (photo && (photo.length > CHALLENGE_PHOTO_MAX || !/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(photo))) throw new Error('That photo can\'t be sent. Take it again.');
  var fileId = '';
  if (photo) {
    var type = /^data:image\/png/.test(photo) ? 'image/png' : 'image/jpeg';
    fileId = skillPhotoFile_(s, account, photo, twoPhotos ? ' before' : '');
  }
  var near = s.actions.indexOf('Place') !== -1 ? nearSegment_(lat, lon, s.near) : '';
  return withLock_(function () {
    var sheet = getDb_().getSheetByName(TABS.challengeItems.name);
    var row = blankRow_(TABS.challengeItems);
    row[ITEM_COL.id - 1] = nextId_('CI', challengeItemsAll_().map(function (x) { return x.id; })); row[ITEM_COL.skill - 1] = s.id; row[ITEM_COL.account - 1] = account.id; row[ITEM_COL.sent - 1] = new Date();
    row[ITEM_COL.lat - 1] = lat == null ? '' : round_(lat, 6); row[ITEM_COL.lon - 1] = lon == null ? '' : round_(lon, 6); row[ITEM_COL.acc - 1] = acc == null || !isFinite(acc) ? '' : Math.round(acc);
    row[ITEM_COL.photo - 1] = fileId; row[ITEM_COL.note - 1] = safeCell_(note); row[ITEM_COL.state - 1] = twoPhotos ? SKILL_AFTER_DUE : 'Waiting'; row[ITEM_COL.near - 1] = near; row[ITEM_COL.xp - 1] = '';
    row[ITEM_COL.count - 1] = count; row[ITEM_COL.choice - 1] = safeCell_(choice); row[ITEM_COL.walk - 1] = ctx.walk || '';
    // Sent through Grab a location (S7-P4): only a skill that's one of its whys can be.
    row[ITEM_COL.grabbed - 1] = req.grabbed && s.whyOf ? 'Yes' : '';
    sheet.getRange(lastRowWith_(sheet, ITEM_COL.id) + 1, 1, 1, row.length).setValues([row]);
    return toolSkillsFor_(account);
  });
}

/* ── Admin Mode: the Skills screen ── */

function toolSkillsAdmin_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!account.rank) throw new Error('Skills are built by HABO\'s admins.');
  return toolSkillsAdminView_(account);
}
function toolSkillsAdminView_(account) {
  var items = challengeItemsAll_();
  return { skills: toolSkillsAll_().map(function (s) {
    var out = {};
    Object.keys(s).forEach(function (k) { if (k !== 'row') out[k] = s[k]; });
    out.sent = items.filter(function (x) { return x.skill === s.id; }).length;
    out.waiting = items.filter(function (x) { return x.skill === s.id && x.state === 'Waiting'; }).length;
    return out;
  }), canBuild: rankAtLeast_(account.rank, 'Builder'), actions: SKILL_ACTIONS, afters: SKILL_AFTER,
    types: litterTypeNames_() };
}
function toolSkillSave_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!account.rank || !rankAtLeast_(account.rank, 'Builder')) throw new Error('A Builder or above builds skills.');
  var x = req.skill || {};
  var name = clean_(x.name, 80), says = clean_(x.says, 1000), why = clean_(x.why, 1000);
  if (!name) throw new Error('Give it a name.');
  if (!says) throw new Error('Say what the screen says: what to do.');
  var actions = (Array.isArray(x.actions) ? x.actions : []).filter(function (a) { return SKILL_ACTIONS.indexOf(a) !== -1; });
  if (!actions.length) throw new Error('Choose what the player sends: a place, a photo, a note, or more than one.');
  // Round 3 (items 6 to 9, 11).
  var after = SKILL_AFTER.indexOf(String(x.after || '')) !== -1 ? String(x.after || '') : '';
  var choices = String(x.choices || '').split(/\s*,\s*/).map(function (c) { return clean_(c, 40); }).filter(String);
  if (actions.indexOf('Choice') !== -1 && choices.length < 2) throw new Error('Give its choices, at least two, with commas between: like Small, Large.');
  var litterType = after === 'Litter type' ? clean_(x.litterType, 80) : '';
  if (after === 'Litter type' && litterTypeNames_().indexOf(litterType) === -1) throw new Error('Pick the litter type its weighing needs.');
  var pin = clean_(x.pin, 8);
  var num = function (k, label, max, whole) {
    var v = x[k] === '' || x[k] == null ? 0 : Number(x[k]);
    if (!isFinite(v) || v < 0 || v > max || (whole && Math.floor(v) !== v)) throw new Error(label + ' is ' + (whole ? 'a whole number ' : '') + 'from 0 to ' + max + '.');
    return v;
  };
  var fields = { name: name, says: says, why: why, actions: actions.join(', '), near: num('near', 'Near a segment (metres)', 500, false),
    xpEach: num('xpEach', 'XP each', 100, false), xpNear: num('xpNear', 'XP near a segment', 100, false), level: num('level', 'Opens at level', SKILL_LEVEL_MAX, true),
    collecting: x.collecting ? 'Yes' : '', onlyNear: num('onlyNear', 'Only near a segment (metres)', 500, false), after: after, litterType: litterType,
    indexAtLeast: after === 'Litter Index' ? num('indexAtLeast', 'Its Litter Index at least', 10, false) : '',
    everyPlayer: num('everyPlayer', 'Once for each player every (minutes)', 10080, true), everySpot: num('everySpot', 'Once at the same spot every (minutes)', 10080, true),
    choices: actions.indexOf('Choice') !== -1 ? choices.join(', ') : '', chance: actions.indexOf('Photo') !== -1 || actions.indexOf('Before and after') !== -1 ? 0 : num('chance', 'Photo by chance (%)', 100, true),
    pin: pin, whyOf: clean_(x.whyOf, 40) };
  if (after === 'Litter Index' && !(fields.indexAtLeast > 0)) throw new Error('Give the Litter Index its weighing needs, from 0.1 to 10.');
  return withLock_(function () {
    var sheet = getDb_().getSheetByName(TABS.toolSkills.name), all = toolSkillsAll_();
    var id = clean_(x.id, 20), had = id ? all.filter(function (s) { return s.id === id; })[0] : null;
    if (id && !had) throw new Error('That skill isn\'t here any more.');
    var row = had ? sheet.getRange(had.row, 1, 1, TABS.toolSkills.header.length).getValues()[0] : blankRow_(TABS.toolSkills);
    Object.keys(fields).forEach(function (k) { row[SKILL_COL[k] - 1] = typeof fields[k] === 'string' ? safeCell_(fields[k]) : fields[k]; });
    if (!had) {
      row[SKILL_COL.id - 1] = nextId_('SK', all.map(function (s) { return s.id; }));
      row[SKILL_COL.state - 1] = 'Open'; row[SKILL_COL.by - 1] = account.handle || account.email; row[SKILL_COL.made - 1] = new Date();
    }
    sheet.getRange(had ? had.row : lastRowWith_(sheet, SKILL_COL.id) + 1, 1, 1, row.length).setValues([row]);
    logChange_(account.email, 'Skill', row[SKILL_COL.id - 1], had ? 'Changed' : 'Made', had ? had.name : '', name);
    return toolSkillsAdminView_(account);
  });
}
// Retire a skill, or open it again. What it earned stays earned.
function toolSkillRetire_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!account.rank || !rankAtLeast_(account.rank, 'Builder')) throw new Error('A Builder or above builds skills.');
  return withLock_(function () {
    var s = toolSkillsAll_().filter(function (x) { return x.id === clean_(req.skillId, 20); })[0];
    if (!s) throw new Error('That skill isn\'t here any more.');
    var to = req.retire === false ? 'Open' : 'Retired';
    getDb_().getSheetByName(TABS.toolSkills.name).getRange(s.row, SKILL_COL.state).setValue(to);
    logChange_(account.email, 'Skill', s.id, 'State', s.state, to);
    return toolSkillsAdminView_(account);
  });
}

/* ── Once: the Items Challenges become skills (answer 5); or, on a new
   Sheet, Trash receptacles seeded as one (|Q655, |M669) ── */

function toolSkillsOnce_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('SKILLS_SPLIT')) return;
  var ss = getDb_(), skills = ss.getSheetByName(TABS.toolSkills.name), cs = ss.getSheetByName(TABS.challenges.name), is = ss.getSheetByName(TABS.challengeItems.name);
  var ids = toolSkillsAll_().map(function (s) { return s.id; }), moved = 0;
  var last = lastRowWith_(cs, CHALLENGE_COL.id);
  var rows = last < 2 ? [] : cs.getRange(2, 1, last - 1, TABS.challenges.header.length).getValues();
  rows.forEach(function (c, i) {
    if (String(c[CHALLENGE_COL.kind - 1]).trim() !== 'Items' || /^\s*moved/i.test(c[CHALLENGE_COL.state - 1])) return;
    var id = nextId_('SK', ids);
    ids.push(id);
    var row = blankRow_(TABS.toolSkills);
    ['name', 'says', 'why', 'actions', 'near', 'xpEach', 'xpNear', 'level', 'state', 'by', 'made'].forEach(function (k) { row[SKILL_COL[k] - 1] = c[CHALLENGE_COL[k] - 1]; });
    row[SKILL_COL.id - 1] = id;
    skills.getRange(lastRowWith_(skills, SKILL_COL.id) + 1, 1, 1, row.length).setValues([row]);
    // What was sent for it moves with it, with its reviews and XP.
    var n = lastRowWith_(is, ITEM_COL.id);
    if (n >= 2) {
      var col = is.getRange(2, ITEM_COL.skill, n - 1, 1).getValues();
      col.forEach(function (v, j) { if (String(v[0]) === String(c[CHALLENGE_COL.id - 1])) is.getRange(j + 2, ITEM_COL.skill).setValue(id); });
    }
    cs.getRange(i + 2, CHALLENGE_COL.state).setValue('Moved to ' + id);
    moved++;
  });
  if (!moved && lastRowWith_(skills, SKILL_COL.id) < 2) {
    var seed = blankRow_(TABS.toolSkills);
    var put = { id: 'SK001', name: 'Trash receptacles', actions: 'Place, Photo, Note',
      says: 'Find a public trash can or bin. Stand beside it, press Use my location, take its photo, and send it. An admin checks each one.',
      why: 'Where the bins are tells HABO where litter has somewhere to go, and where it doesn\'t.',
      near: 20, xpEach: 1, xpNear: 2, level: 1, state: 'Open', by: 'HABO', made: new Date() };
    Object.keys(put).forEach(function (k) { seed[SKILL_COL[k] - 1] = put[k]; });
    skills.getRange(2, 1, 1, seed.length).setValues([seed]);
  }
  // The items tab's second column now holds the skill.
  is.getRange(1, ITEM_COL.skill).setValue('Skill ID');
  forgetReads_();
  props.setProperty('SKILLS_SPLIT', new Date().toISOString());
}

/* ── The map's skill pins (item 9, |Q734 (a)) ── */

// Approved ones with a place, for everyone: no who, no photo. Each with its
// skill's emoji (📍 when none is set), and its count when one was sent.
function skillPins_() {
  var skills = {};
  toolSkillsAll_().forEach(function (s) { skills[s.id] = s; });
  return challengeItemsAll_().filter(function (x) { return x.state === 'Approved' && x.lat != null && x.lon != null && skills[x.skill]; }).map(function (x) {
    var s = skills[x.skill];
    return { lat: x.lat, lon: x.lon, pin: s.pin || '📍', name: s.name, count: x.count || 0, at: x.sent };
  });
}
// A walk's own pins, for its share picture when the player chooses them: what
// they sent on it, reviewed or not.
function walkPins_(accountId, collectionId) {
  var skills = {};
  toolSkillsAll_().forEach(function (s) { skills[s.id] = s; });
  // `collectionId` null: every walk's, each with its walk.
  return challengeItemsAll_().filter(function (x) { return x.account === accountId && x.walk && (collectionId == null || x.walk === collectionId) && x.lat != null && x.state !== 'Declined'; }).map(function (x) {
    var s = skills[x.skill] || {};
    return { lat: x.lat, lon: x.lon, pin: s.pin || '📍', count: x.count || 0, walk: x.walk };
  });
}

/* ── Once: Grab a location, and its first whys (items 10, 11, |Q853 (b)) ── */

// Grab a location; a skill for each first why, or the one already there: a
// bin (Trash receptacles), dog poop (a skill with 💩 in its name), a litter
// hotspot, a storm drain, and Other with a note. Each opens at Level 1 with 1
// XP, like Trash receptacles, for admins to change in Skill Builder.
function grabOnce_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('GRAB_SEEDED')) return;
  var sheet = getDb_().getSheetByName(TABS.toolSkills.name), all = toolSkillsAll_(), ids = all.map(function (s) { return s.id; });
  var put = function (row, f) { Object.keys(f).forEach(function (k) { row[SKILL_COL[k] - 1] = f[k]; }); };
  var make = function (f) {
    var row = blankRow_(TABS.toolSkills), id = nextId_('SK', ids);
    ids.push(id);
    put(row, { id: id, state: 'Open', by: 'HABO', made: new Date(), near: 20, xpEach: 1, xpNear: 0, level: 1 });
    put(row, f);
    sheet.getRange(lastRowWith_(sheet, SKILL_COL.id) + 1, 1, 1, row.length).setValues([row]);
  };
  var mark = function (s, f) { var row = sheet.getRange(s.row, 1, 1, TABS.toolSkills.header.length).getValues()[0]; put(row, f); sheet.getRange(s.row, 1, 1, row.length).setValues([row]); };
  if (!all.some(function (s) { return s.grab; })) make({ name: 'Grab a location', actions: 'Place', grab: 'Yes', xpEach: 0,
    says: 'Stand at the place and press Capture the place. Then pick why you grabbed it.', why: 'Each place and why builds the map of what\'s around our streets.' });
  var named = function (re) { return all.filter(function (s) { return s.state === 'Open' && !s.whyOf && re.test(s.name); })[0]; };
  var bin = named(/trash|bin|receptacle/i), poop = named(/💩|poop/i);
  if (bin) mark(bin, { whyOf: 'A bin' });
  else make({ name: 'A bin', actions: 'Place, Photo', whyOf: 'A bin', says: 'A public trash can or bin: take its photo.' });
  if (poop) mark(poop, { whyOf: 'Dog poop', pin: poop.pin || '💩' });
  else make({ name: 'Dog poop', actions: 'Place, Count', whyOf: 'Dog poop', pin: '💩', says: 'Dog poop here: say how many piles.' });
  make({ name: 'Litter hotspot', actions: 'Place, Photo', whyOf: 'A litter hotspot', says: 'A spot where litter gathers: take its photo before you collect it.' });
  make({ name: 'Storm drain', actions: 'Place, Photo', whyOf: 'A storm drain', says: 'A storm drain: take its photo, with what\'s in or around it.' });
  make({ name: 'Other', actions: 'Place, Note', whyOf: 'Other', says: 'Something else: say what in a note.' });
  forgetReads_();
  props.setProperty('GRAB_SEEDED', new Date().toISOString());
}

// The shared litter types, for "after a weighing with a litter type picked".
function litterTypeNames_() {
  return readRows_(TABS.types).filter(function (r) { return r.get('status') === TYPE_SHARED; }).map(function (r) { return String(r.get('type')); }).filter(String);
}
