/**
 * Settings in Admin Mode (S5-P19 A, |Q577 (a), |Q578 (a), Nov 3): the
 * Settings tab's groups 2 to 5, each changed from a Settings screen by the
 * ranks that may change it. The waiver's words and the links stay in the
 * Sheet, for HABO's staff (group 1). Ranks as in the Accounts tab:
 * Apprentice, Builder, Architect, Head Builder; a rank may change its own
 * groups and every group of the ranks below it.
 *   Collecting safety: Head Builder.
 *   XP, Levels and class skills, and Segments and rates: Architect and up.
 *   The map's look and the sayings: Builder and up.
 *   Forum (the digest's hour): Head Builder.
 * Every change goes in the Changes tab, with who made it.
 */

// Each setting: [its name in the Settings tab, plain words, one line on what
// it does, its kind (number, colour, choice, names or lines), its unit or
// choices, and for a number, its lowest and highest]. Made when first asked
// for, since the names come from the other files.
function settingGroups_() {
  // Categories, each its own screen (S6-P32, |Q727): a short list first, each
  // with a line on what's in it; tap one, and only its settings show.
  return [
  { key: 'safety', title: 'Safety', says: 'The waiver and gear renewal, sunset, when a walk starts and ends on its own, the "Did you mean" weight.', rank: 'Head Builder', items: [
    [SETTING_SUNSET_WARN, 'Sunset warning', 'How long before sunset the page warns you to wrap up.', 'number', 'minutes before sunset', 0, 240],
    [SETTING_NO_START, 'No new collection', 'From this long before sunset, Start collecting waits for morning.', 'number', 'minutes before sunset', 0, 240],
    [SETTING_AUTO_END, 'A collection left alone ends after', 'A collection with no litter pulse for this long ends by itself.', 'number', 'hours', 1, 48],
    [SETTING_EDIT_HOURS, 'A collection can be changed for', 'How long after it ends a player can still fix a collection.', 'number', 'hours', 1, 720],
    [SETTING_HEAVY_LB, 'Ask "Did you mean…?" above', 'A litter pulse whose scale shows more than this asks "Did you mean …?" before it goes on. Yes keeps it, for a big cleanup bag.', 'number', 'lb', 1, 10000],
    [SETTING_WAIVER_RENEW, 'Renew the waiver and safety gear every', 'Each player signs the waiver again, and confirms their safety gear, this often. 0: never.', 'number', 'months', 0, 24]] },
  { key: 'walks', title: 'Walks and weighing', says: 'Break questions, pieces that add up, when a weighing counts for a segment, paths and fields covered, how far a track scans.', rank: 'Architect', items: [
    [SETTING_BREAK_AFTER, 'Break question after', 'Once a player has this many collections, a weighing far slower than their usual pace asks if they took a break.', 'number', 'collections', 1, 100],
    [SETTING_PIECES, 'Pieces add up within', 'Walks that each clean part of a segment, each this soon after the one before, add up to one collection.', 'number', 'hours', 1, 168],
    [SETTING_INSIDE, 'A weighing counts for a segment when inside', 'A weighing\'s pounds count for a segment when this share of its squares is on it.', 'number', '%', 1, 100],
    [SETTING_NEAR, 'Near enough to a segment', 'How close to a segment\'s squares counts as on it.', 'number', 'm', 0, 100],
    [SETTING_COVER, 'Path collected when covered', 'A walk collects a path when it comes near this share of its squares.', 'number', '%', 1, 100],
    [SETTING_FIELD_COVER, 'Field collected when scanned', 'A walk collects a field when it scans this share of it.', 'number', '%', 1, 100],
    [SETTING_REACH, 'A track scans each side', 'On a field, how far either side of your track counts as scanned.', 'number', 'm', 1, 100],
    [SETTING_PART_M, 'Part of a segment', 'A segment is cut into parts this long, for how it was partly cleaned.', 'number', 'm', 10, 500],
    [SETTING_APART, 'Plan segments far apart', 'A plan with segments farther apart than this gets a notice.', 'number', 'mi', 0.1, 50]] },
  { key: 'rates', title: 'Rates', says: 'When a segment is due, the gap and window for a rate, how a rate shows, confidence, the rate map\'s top.', rank: 'Architect', items: [
    [SETTING_DUE_FROM, 'Segment due from', 'A segment shows on The Priority Segment List from this long after its clock started.', 'number', 'days', 0, 30],
    [SETTING_DUE_TO, 'Segment due until', 'Later than this, it\'s a Rate Reset: the next collection measures no rate and starts the clock again.', 'number', 'days', 1, 60],
    [SETTING_FINISH, 'Finish it shows from', 'A segment partly cleaned shows "Finish it" once this much of it is.', 'number', '% cleaned', 0, 100],
    [SETTING_MIN_GAP, 'Shortest gap for a rate', 'A collection sooner than this after the clock started is a pickup: no rate, and its pounds go into the next.', 'number', 'hours', 1, 168],
    [SETTING_RATE_WINDOW, 'Rate window', 'A segment\'s rate is from its rates in this many days.', 'number', 'days', 1, 365],
    [SETTING_RATE_SHOWS, 'Segment rate shows', 'Which of its rates a segment shows.', 'choice', ['Median', 'Average', 'Both']],
    [SETTING_CONF_LOW, 'Confidence Low up to', 'Up to this many rates in the window, its confidence is the second name below.', 'number', 'rates', 1, 100],
    [SETTING_CONF_MODERATE, 'Confidence Moderate up to', 'Up to this many, the third name; more, the fourth.', 'number', 'rates', 1, 100],
    [SETTING_CONF_NAMES, 'Confidence names', 'Four names, with commas between: for no rate in the window, then low, moderate and established.', 'names', 4],
    [SETTING_RATE_TOP, 'Rate map top', 'The rate the map\'s top colour stands for.', 'number', 'lb per mile per day', 0.1, 100]] },
  { key: 'xp', title: 'XP and bonuses', says: 'XP for planning, ratings and litter types; the time and left-alone bonuses; the first quest; a segment made public.', rank: 'Architect', items: [
    [SETTING_PLAN_XP, 'XP for each planned collection', 'A collection started from a plan earns this.', 'number', 'XP', 0, 100],
    [SETTING_RATING_XP_1, 'XP for a visual rating within 1', 'A visual rating within 1 of the Litter Index earns this.', 'number', 'XP', 0, 100],
    [SETTING_RATING_XP_2, 'XP for a visual rating within 2', 'Within 2 of the Litter Index.', 'number', 'XP', 0, 100],
    [SETTING_RATING_XP_3, 'XP for a visual rating within 3', 'Within 3 of the Litter Index.', 'number', 'XP', 0, 100],
    [SETTING_RATING_BONUS, 'Rating XP bonus', 'A close rating also earns the Litter Index divided by this.', 'number', '', 1, 100],
    [SETTING_TYPES_XP, 'XP for a stretch\'s litter types', 'A weighing with its litter types filled in earns this.', 'number', 'XP', 0, 100],
    [SETTING_TIME_PEAK, 'Time bonus a day after', 'Collecting a segment again a day after its clock started multiplies the walk\'s rating and litter-type XP by this; it comes down evenly to none by the day below.', 'number', '×', 1, 10],
    [SETTING_TIME_ENDS, 'Time bonus gone after', 'From a day, the time bonus comes down evenly to none by this many days.', 'number', 'days', 1, 60],
    [SETTING_ALONE_DAYS, 'Left-alone bonus after', 'A walk that collects squares of a public segment nobody has collected for this many days, or ever, earns the bonus below. 0: no left-alone bonus.', 'number', 'days', 0, 365],
    [SETTING_ALONE_MULT, 'Left-alone bonus', 'Multiplies that walk\'s rating and litter-type XP by this. Where the time bonus is more, it counts instead.', 'number', '×', 1, 10],
    [SETTING_QUEST_STEP_XP, 'XP for each first quest step', 'Each of the first quest\'s six steps earns this.', 'number', 'XP', 0, 100],
    [SETTING_QUEST_DONE_XP, 'XP for finishing the first quest', 'Finishing all six earns this more.', 'number', 'XP', 0, 100],
    [SETTING_REVIEW_XP, 'Most XP for a segment approved to be public', 'In Reviews, a segment approved to be public earns its submitter up to this.', 'number', 'XP', 0, 100]] },
  // Levels and class skills (S5-P29, |Q612 to |Q615): the Levels tab's
  // ranges and each Litter Class Skill's level, kept in their own tabs.
  { key: 'skills', title: 'Levels and skills', says: 'The level table, and the level each Litter Class Skill opens at.', rank: 'Architect', custom: true, items: [] },
  { key: 'look', title: 'The map\'s look', says: 'Its colours, how readings fade, the paused track, the rating marks.', rank: 'Builder', items: [
    [SETTING_COLOUR_0, 'Map colour at 0', 'The Litter Index scale\'s colour at 0.', 'colour'],
    [SETTING_COLOUR_5, 'Map colour at 5', 'At 5.', 'colour'],
    [SETTING_COLOUR_10, 'Map colour at 10', 'At 10 and above.', 'colour'],
    [SETTING_PLAN_COLOUR, 'Map colour: plan', 'The band around your chosen plan.', 'colour'],
    [SETTING_MAP_FADE, 'Readings fade out after', 'On the map, a square\'s Litter Index fades as it ages, and is gone after this many days. Its numbers stay in the pop-ups and the rates. The main page\'s map shows this many days; the Maps screen, the days each player chooses.', 'number', 'days', 1, 365],
    [SETTING_DIFF_MARK, 'Rating "on the mark" within', 'On the map\'s Rating against Litter Index layer: a weighing\'s Litter Index minus your rating, within this either way, is on the mark.', 'number', '±', 0, 10],
    [SETTING_DIFF_SLIGHT, 'Rating "slightly" off up to', 'Beyond on the mark and up to this either way: slightly lenient (you rated it cleaner than it measured) or slightly critical. Beyond this: lenient or critical.', 'number', '±', 0, 10],
    [SETTING_PAUSED_COLOUR, 'Paused track colour', 'Where a GPX track was paused.', 'colour']]
    .concat(DARK_SETTINGS.map(function (d) { return [d[1], d[1], 'The same, in Admin Mode\'s dark look.', 'colour']; })) },
  // What's on the share picture, one choice for everyone (S6-P5 round 2, |Q685 (a)):
  // a layout, then each part on or off on top of it (|Q686); the app's name (|Q687 (a)).
  { key: 'share', title: 'Sharing', says: 'The share picture, with its preview, and the app\'s name.', rank: 'Builder', items: [
    [SETTING_SHARE_LAYOUT, 'Layout', 'What the picture shows to start with. Full: everything. Map and numbers: no handle, date or times. Map only: the map, the date and times, and the app\'s name.', 'choice', SHARE_LAYOUTS]]
    .concat(SHARE_PARTS.map(function (p) { return [p[1], p[1].replace('Share picture: ', '').replace(/^./, function (c) { return c.toUpperCase(); }), 'On or off, whatever the layout; or as the layout has it.', 'choice', SHARE_PART_CHOICES]; }))
    .concat([[SETTING_SHARE_SHOWS, 'The map shows', 'The squares in each weighing\'s Litter Index colour, or in the accumulation rate of each segment the walk collected.', 'choice', SHARE_SHOWS]])
    .concat([[SETTING_APP_NAME, 'The app\'s name', 'On the share picture and the badges\' pictures. A new name needs no build.', 'text', 40]]) },
  // The Forum's email digest (S5-P28 round 2, |Q637 (a)): the hour it goes.
  { key: 'forum', title: 'Forum and email', says: 'The hour the Forum\'s digest goes, and its timer.', rank: 'Head Builder', items: [
    [SETTING_DIGEST_HOUR, 'Forum digest goes at', 'The hour each admin\'s Forum digest is sent, from 0 (midnight) to 23 (11 PM); a Weekly one goes on Monday at that hour.', 'number', 'o\'clock', 0, 23]] },
  // The rolling history for everyone (S6-P38, |Q762 to |Q766): what's
  // announced, gchat, and how often an open one looks for new lines.
  { key: 'realm', title: 'Street Talk', says: 'What everyone sees in it: the announcements, gchat, and how often it looks for new lines.', rank: 'Builder', items: [
    [SETTING_RH_START, 'Announce a walk started', 'Everyone sees "… started collecting." Where, only once it ends.', 'choice', RH_ONOFF],
    [SETTING_RH_END, 'Announce a walk ended', 'Everyone sees "… ended a walk: 1.6 lb on …", with the segments it planned.', 'choice', RH_ONOFF],
    [SETTING_RH_LEVEL, 'Announce a level reached', 'Everyone sees "… has gained a level! ---> Level 3!"', 'choice', RH_ONOFF],
    [SETTING_RH_BADGE, 'Announce a badge earned', 'Everyone sees "… earned the badge …!"', 'choice', RH_ONOFF],
    [SETTING_GCHAT, 'gchat', 'Any player types gchat and a line, for everyone signed in; any line can be reported to the Admins, and an admin removes it in Admin Mode.', 'choice', RH_ONOFF],
    [SETTING_RH_EVERY, 'New lines every', 'While Street Talk is open, it looks for new lines this often.', 'number', 'seconds', 5, 300],
    [SETTING_GCHAT_COLD, 'Cold storage after', 'Past this many gchat lines, the oldest move to the Gchat Sheet in the HABO Litter Cold Storage folder, the newest 1,000 staying.', 'number', 'lines', 1100, 100000]] },
  { key: 'sayings', title: 'Sayings', says: 'What the page says while a walk starts.', rank: 'Builder', items: [
    [SETTING_START_SAYINGS, 'Sayings while a collection starts', 'One shows at random while a collection starts.', 'lines', 50]] }
  ];
}
function aRank_(rank) { return (/^[AEIOU]/.test(rank) ? 'an ' : 'a ') + rank; }
function rankAtLeast_(rank, need) { return RANKS.indexOf(rank) >= 0 && RANKS.indexOf(rank) >= RANKS.indexOf(need); }

// The groups this account may change, with each setting's value now.
function settingsGroupsFor_(account) {
  return settingGroups_().filter(function (g) { return rankAtLeast_(account.rank, g.rank); }).map(function (g) {
    if (g.custom) return { key: g.key, title: g.title, says: g.says || '', rank: g.rank, custom: true, items: [],
      levels: levelRanges_().map(function (r) { return [r[0], r[1] == null ? '' : r[1], r[2]]; }), skills: classSkills_() };
    // The Forum's group says how many digest timers there are (S6-P16).
    var note = g.key === 'forum' ? digestTimerState_() : null;
    var out = { key: g.key, title: g.title, says: g.says || '', rank: g.rank, note: note ? note.say : '', noteWarn: !!note && !note.ok, items: g.items.map(function (it) {
      var v = getSetting_(it[0]), kind = it[3];
      return { name: it[0], label: it[1], say: it[2], kind: kind, unit: kind === 'number' ? it[4] : '', choices: kind === 'choice' ? it[4] : null,
        min: kind === 'number' ? it[5] : null, max: kind === 'number' ? it[6] : kind === 'text' ? it[4] : null,
        value: kind === 'lines' ? String(v).split(/\r?\n/).map(function (t) { return t.trim(); }).filter(String) : String(v).trim() };
    }) };
    // The share picture's preview (S6-P5, |C914): what each layout shows, and
    // which setting is which part, so the page draws it from the boxes as they are.
    if (g.key === 'share') out.preview = { layoutSetting: SETTING_SHARE_LAYOUT, nameSetting: SETTING_APP_NAME, showsSetting: SETTING_SHARE_SHOWS, rateTop: minutesSetting_(SETTING_RATE_TOP, 5) || 5, layouts: SHARE_LAYOUT_PARTS,
      parts: SHARE_PARTS.map(function (p) { return { key: p[0], setting: p[1] }; }), defaultName: DEFAULT_APP_NAME };
    return out;
  });
}

// The Settings screen's groups, for an admin.
function settingsLoad_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!account.rank) throw new Error('Settings are for HABO\'s admins.');
  return { groups: settingsGroupsFor_(account) };
}

// A group's settings saved: each checked, each change written and logged.
function settingsSave_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var g = settingGroups_().filter(function (x) { return x.key === String(req.group || ''); })[0];
  if (!g) throw new Error('That isn\'t a group of settings.');
  if (!rankAtLeast_(account.rank, g.rank)) throw new Error(g.title + ' can be changed by ' + aRank_(g.rank) + (g.rank === 'Head Builder' ? '' : ' or above') + '.');
  var values = req.values && typeof req.values === 'object' ? req.values : {};
  if (g.custom) {
    var made = skillsSave_(account, values);
    return { groups: settingsGroupsFor_(account), changed: made, settings: collectSettings_() };
  }
  var out = [];
  g.items.forEach(function (it) {
    if (!Object.prototype.hasOwnProperty.call(values, it[0])) return;
    out.push([it, settingValue_(it, values[it[0]])]);
  });
  var changed = withLock_(function () {
    var n = 0;
    out.forEach(function (x) {
      var before = String(getSetting_(x[0][0]));
      // A colour in capitals is the same colour (S5-P19, |C787): not a change.
      if (before.trim() === x[1] || (x[0][3] === 'colour' && before.trim().toLowerCase() === x[1])) return;
      setSetting_(x[0][0], x[1]);
      logChange_(account.email, 'Setting', x[0][0], 'Value', before, x[1]);
      n++;
    });
    return n;
  });
  return { groups: settingsGroupsFor_(account), changed: changed, settings: collectSettings_() };
}

// Levels and class skills saved (S5-P29): the Levels tab's ranges, written
// again when they change, and each skill's level in the Class Skills tab.
// Each change goes in the Changes tab. Returns how many changed.
function skillsSave_(account, values) {
  var ranges = levelRangesValue_(values.levels);
  var asked = values.skills && typeof values.skills === 'object' ? values.skills : {}, want = {};
  CLASS_SKILLS.forEach(function (s) {
    if (!Object.prototype.hasOwnProperty.call(asked, s[0])) return;
    var t = String(asked[s[0]] == null ? '' : asked[s[0]]).trim(), n = Number(t);
    if (t === '' || !isFinite(n) || Math.floor(n) !== n || n < 0 || n > SKILL_LEVEL_MAX) throw new Error(s[1] + ' needs a whole level, from 0 to ' + SKILL_LEVEL_MAX + '.');
    want[s[0]] = n;
  });
  return withLock_(function () {
    var n = 0, ss = getDb_();
    if (ranges) {
      var before = rangesText_(levelRanges_()), after = rangesText_(ranges);
      if (before !== after) {
        var lv = ss.getSheetByName(TABS.levels.name), last = lv.getLastRow();
        if (last >= 2) lv.getRange(2, 1, last - 1, 3).clearContent();
        lv.getRange(2, 1, ranges.length, 3).setValues(ranges.map(function (r) { return [r[0], r[1] == null ? '' : r[1], r[2]]; }));
        logChange_(account.email, 'Setting', 'Levels', 'Ranges', before, after);
        n++;
      }
    }
    var rows = classSkillRows_(), sk = ss.getSheetByName(TABS.skills.name);
    classSkills_().forEach(function (s) {
      if (!Object.prototype.hasOwnProperty.call(want, s.key) || want[s.key] === s.level) return;
      var r = rows.filter(function (x) { return x[0].toLowerCase() === s.name.toLowerCase(); })[0];
      if (r) sk.getRange(r[2], 2).setValue(want[s.key]);
      else sk.getRange(lastRowWith_(sk, 1) + 1, 1, 1, 3).setValues([[s.name, want[s.key], s.say]]);
      logChange_(account.email, 'Class skill', s.name, 'Level', String(s.level), String(want[s.key]));
      n++;
    });
    return n;
  });
}

// The level ranges from the page, checked: [from, to (null for "and up"),
// XP per level], lowest first. The first starts at Level 1, and no level is
// in two ranges. Null when the page sent none.
function levelRangesValue_(v) {
  if (v == null) return null;
  if (!Array.isArray(v) || !v.length) throw new Error('Levels need at least one range.');
  if (v.length > 50) throw new Error('Levels: at most 50 ranges.');
  var text = function (x) { return String(x == null ? '' : x).trim(); };
  var out = v.map(function (r, i) {
    var row = Array.isArray(r) ? r : [], f = text(row[0]), t = text(row[1]), x = text(row[2]);
    var from = Number(f), to = t === '' ? null : Number(t), xp = Number(x), say = 'Level range ' + (i + 1);
    if (f === '' || !isFinite(from) || Math.floor(from) !== from || from < 1) throw new Error(say + ' needs a whole From level, 1 or more.');
    if (to !== null && (!isFinite(to) || Math.floor(to) !== to || to < from)) throw new Error(say + ': its To level is a whole number, at least its From level, or blank for "and up".');
    if (x === '' || !isFinite(xp) || xp <= 0 || xp > 100000) throw new Error(say + ' needs its XP per level, more than 0 and at most 100000.');
    return [from, to, xp];
  }).sort(function (a, b) { return a[0] - b[0]; });
  if (out[0][0] !== 1) throw new Error('The first level range starts at Level 1.');
  for (var i = 1; i < out.length; i++) {
    if (out[i - 1][1] === null || out[i][0] <= out[i - 1][1]) throw new Error('Two level ranges both hold Level ' + out[i][0] + '.');
  }
  return out;
}
function rangesText_(list) {
  return list.map(function (r) { return 'Levels ' + r[0] + (r[1] == null ? ' and up' : ' to ' + r[1]) + ': ' + r[2] + ' XP each'; }).join('; ');
}

// A value from the page, checked for its kind; throws with what's wrong.
function settingValue_(it, v) {
  var label = it[1], kind = it[3];
  if (kind === 'number') {
    var t = String(v == null ? '' : v).trim(), n = Number(t);
    if (t === '' || !isFinite(n)) throw new Error(label + ' needs a number.');
    if (n < it[5] || n > it[6]) throw new Error(label + ' must be from ' + it[5] + ' to ' + it[6] + (it[4] ? ' ' + it[4] : '') + '.');
    return String(n);
  }
  if (kind === 'colour') {
    var c = String(v || '').trim();
    if (!/^#[0-9a-f]{6}$/i.test(c)) throw new Error(label + ' needs a colour, like #7c3aed.');
    return c.toLowerCase();
  }
  if (kind === 'text') {
    var words = String(v == null ? '' : v).replace(/\s+/g, ' ').trim();
    if (!words) throw new Error(label + ' can\'t be empty.');
    if (words.length > it[4]) throw new Error(label + ': at most ' + it[4] + ' letters.');
    return words;
  }
  if (kind === 'choice') {
    var pick = String(v || '').trim();
    if (it[4].indexOf(pick) === -1) throw new Error(label + ' is one of: ' + it[4].join(', ') + '.');
    return pick;
  }
  if (kind === 'names') {
    var names = String(v || '').split(',').map(function (x) { return x.trim(); });
    if (names.length !== it[4] || names.some(function (x) { return !x || x.length > 30; })) throw new Error(label + ' needs ' + it[4] + ' names, with commas between.');
    return names.join(', ');
  }
  if (kind === 'lines') {
    var lines = (Array.isArray(v) ? v : String(v || '').split(/\r?\n/)).map(function (x) { return String(x).trim(); }).filter(String);
    if (lines.length > it[4]) throw new Error(label + ': at most ' + it[4] + '.');
    if (lines.some(function (x) { return x.length > 300; })) throw new Error(label + ': each at most 300 letters.');
    return lines.join('\n');
  }
  throw new Error(label + ' can\'t be changed here.');
}

// What it does (S5-P13, |C762, Nov 4): a third column in the Settings tab,
// explaining each setting in plain words, with where it's changed. Filled
// in only where the cell is blank, so a note of your own is kept.
function settingNotes_() {
  var out = {};
  var sheetOnly = ' Changed here in the Sheet only.';
  [[SETTING_WAIVER_TITLE, 'The waiver\'s title, above its words at sign-up and on each signed copy.'],
   [SETTING_WAIVER_TEXT, 'The waiver\'s words, which every player signs at sign-up. A change to them, or to the title, asks every player to sign again.'],
   [SETTING_EMAILS_FROM, 'The address the sign-up codes and the signed waivers are emailed from.'],
   [SETTING_CHECKIN_SHEET, 'The volunteer check-in\'s Sheet: a new account is matched to its volunteer there by email, and a collection to the event it was during.'],
   [SETTING_SIGNATURES_FOLDER, 'The Drive folder each signed waiver is saved to. Blank: one is made the first time.'],
   [SETTING_CHALLENGE_PHOTOS, 'The Drive folder each photo sent for a Challenge is saved to (S6-P8). Blank: one is made the first time.'],
   [SETTING_COLD_FOLDER, 'The Drive folder, HABO Litter Cold Storage, that old records move to, a Google Sheet for each kind, Gchat first (S6-P50). Blank: one is made beside the litter Sheet the first time.'],
   [SETTING_PUBLIC_URL, 'The litter page\'s public address, for HABO\'s records. Nothing in the app reads it today.']
  ].forEach(function (x) { out[x[0]] = x[1] + sheetOnly; });
  settingGroups_().forEach(function (g) {
    g.items.forEach(function (it) {
      var unit = it[3] === 'number' && it[4] ? ' In ' + it[4] + '.' : '';
      out[it[0]] = it[2] + unit + ' In Admin Mode: Settings, ' + g.title + ', by ' + aRank_(g.rank) + (g.rank === 'Head Builder' ? '' : ' or above') + '.';
    });
  });
  return out;
}

function fillSettingNotes_(ss) {
  var sheet = ss.getSheetByName(TABS.settings.name);
  var last = sheet.getLastRow();
  if (last < 2) return;
  var rows = sheet.getRange(2, 1, last - 1, 3).getValues(), notes = settingNotes_(), changed = false;
  var col = rows.map(function (r) {
    var note = notes[String(r[0]).trim()], had = String(r[2]).trim();
    if (note && !had) { changed = true; return [note]; }
    // One the app wrote, naming where it's changed, follows Settings' categories
    // when they're renamed (S6-P32); a note of your own is kept.
    if (note && had !== note && / In Admin Mode: Settings, [^.]+, by an? [A-Za-z ]+\.$/.test(had)) { changed = true; return [note]; }
    return [r[2]];
  });
  if (changed) sheet.getRange(2, 3, col.length, 1).setWrap(true).setValues(col);
  settingsMemo_ = null;
}
