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
 */
var SKILL_COL = { id: 1, name: 2, says: 3, why: 4, actions: 5, near: 6, xpEach: 7, xpNear: 8, level: 9, state: 10, by: 11, made: 12 };
var SKILL_ACTIONS = ['Place', 'Photo', 'Note'];

function toolSkillsAll_() {
  return readRows_(TABS.toolSkills, SKILL_COL).map(function (r) {
    var n = function (k) { var v = Number(r.get(k)); return r.get(k) === '' || !isFinite(v) ? 0 : v; };
    var m = r.get('made');
    return { row: r.row, id: r.get('id'), name: r.get('name'), says: r.get('says'), why: r.get('why'),
      actions: String(r.get('actions')).split(/\s*,\s*/).filter(function (a) { return SKILL_ACTIONS.indexOf(a) !== -1; }),
      near: n('near'), xpEach: n('xpEach'), xpNear: n('xpNear'), level: Math.max(0, Math.floor(n('level'))),
      state: /^\s*r/i.test(r.get('state')) ? 'Retired' : 'Open', by: r.get('by'), made: m instanceof Date ? m.getTime() : 0 };
  }).filter(function (s) { return s.id; });
}

/* ── The player's side: the Litter Class Skills sheet ── */

function toolSkillView_(s, account, level, items, why) {
  var mine = items.filter(function (x) { return x.skill === s.id && x.account === account.id; }).map(function (x) {
    return { id: x.id, sent: x.sent, state: x.state, xp: x.state === 'Approved' ? x.xp : 0, note: x.note, near: x.near, lat: x.lat, lon: x.lon,
      why: x.state === 'Declined' ? (why[x.id] || '') : '' };
  });
  return { id: s.id, name: s.name, says: s.says, why: s.why, actions: s.actions, near: s.near, xpEach: s.xpEach, xpNear: s.xpNear, level: s.level,
    state: s.state, locked: level < s.level, mine: mine };
}
function toolSkillsLoad_(req) {
  ensureSchema_();
  return toolSkillsFor_(requireAccount_(req.token));
}
function toolSkillsFor_(account) {
  var items = challengeItemsAll_(), level = levelOf_(xpOf_(account.id), levelRanges_());
  // A declined item's note, which the player sees.
  var why = {};
  reviewRows_().forEach(function (m) { if (/^CI\d+$/.test(m.segment) && m.move === REVIEW_DECIDE.decline) why[m.segment] = m.note; });
  var list = toolSkillsAll_().filter(function (s) {
    return s.state === 'Open' || items.some(function (x) { return x.skill === s.id && x.account === account.id; });
  }).map(function (s) { return toolSkillView_(s, account, level, items, why); });
  return { skills: list, level: level };
}

// One sent with a skill: its place, its photo, its note.
function toolSkillSend_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var s = toolSkillsAll_().filter(function (x) { return x.id === clean_(req.skillId, 20); })[0];
  if (!s) throw new Error('That skill isn\'t here any more.');
  if (s.state !== 'Open') throw new Error(s.name + ' isn\'t open now.');
  var level = levelOf_(xpOf_(account.id), levelRanges_());
  if (level < s.level) throw new Error(s.name + ' unlocks at Level ' + s.level + '. You\'re at Level ' + level + '.');
  var lat = req.lat == null || req.lat === '' ? null : Number(req.lat), lon = req.lon == null || req.lon === '' ? null : Number(req.lon);
  var acc = req.acc == null || req.acc === '' ? null : Number(req.acc), note = clean_(req.note, 1000), photo = String(req.photo || '');
  if (s.actions.indexOf('Place') !== -1 && !(isFinite(lat) && isFinite(lon) && lat !== null && Math.abs(lat) <= 90 && Math.abs(lon) <= 180)) throw new Error('Add its place: press Use my location.');
  if (s.actions.indexOf('Photo') !== -1 && !photo) throw new Error('Add its photo.');
  if (s.actions.indexOf('Note') !== -1 && s.actions.length === 1 && !note) throw new Error('Write its note.');
  if (photo && (photo.length > CHALLENGE_PHOTO_MAX || !/^data:image\/(jpeg|png);base64,[A-Za-z0-9+/=]+$/.test(photo))) throw new Error('That photo can\'t be sent. Take it again.');
  var fileId = '';
  if (photo) {
    var type = /^data:image\/png/.test(photo) ? 'image/png' : 'image/jpeg';
    var blob = Utilities.newBlob(Utilities.base64Decode(photo.split(',')[1]), type, s.name + ' ' + (account.handle || account.id) + ' ' + Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd HHmm') + (type === 'image/png' ? '.png' : '.jpg'));
    fileId = challengePhotosFolder_().createFile(blob).getId();
  }
  var near = s.actions.indexOf('Place') !== -1 ? nearSegment_(lat, lon, s.near) : '';
  return withLock_(function () {
    var sheet = getDb_().getSheetByName(TABS.challengeItems.name);
    var row = blankRow_(TABS.challengeItems);
    row[ITEM_COL.id - 1] = nextId_('CI', challengeItemsAll_().map(function (x) { return x.id; })); row[ITEM_COL.skill - 1] = s.id; row[ITEM_COL.account - 1] = account.id; row[ITEM_COL.sent - 1] = new Date();
    row[ITEM_COL.lat - 1] = lat == null ? '' : round_(lat, 6); row[ITEM_COL.lon - 1] = lon == null ? '' : round_(lon, 6); row[ITEM_COL.acc - 1] = acc == null || !isFinite(acc) ? '' : Math.round(acc);
    row[ITEM_COL.photo - 1] = fileId; row[ITEM_COL.note - 1] = safeCell_(note); row[ITEM_COL.state - 1] = 'Waiting'; row[ITEM_COL.near - 1] = near; row[ITEM_COL.xp - 1] = '';
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
  }), canBuild: rankAtLeast_(account.rank, 'Builder'), actions: SKILL_ACTIONS };
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
  var num = function (k, label, max, whole) {
    var v = x[k] === '' || x[k] == null ? 0 : Number(x[k]);
    if (!isFinite(v) || v < 0 || v > max || (whole && Math.floor(v) !== v)) throw new Error(label + ' is ' + (whole ? 'a whole number ' : '') + 'from 0 to ' + max + '.');
    return v;
  };
  var fields = { name: name, says: says, why: why, actions: actions.join(', '), near: num('near', 'Near a segment (metres)', 500, false),
    xpEach: num('xpEach', 'XP each', 100, false), xpNear: num('xpNear', 'XP near a segment', 100, false), level: num('level', 'Opens at level', SKILL_LEVEL_MAX, true) };
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
