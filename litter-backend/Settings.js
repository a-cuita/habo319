/**
 * Settings in Admin Mode (S5-P19 A, |Q577 (a), |Q578 (a), Nov 3): the
 * Settings tab's groups 2 to 5, each changed from a Settings screen by the
 * ranks that may change it. The waiver's words and the links stay in the
 * Sheet, for HABO's staff (group 1). Ranks as in the Accounts tab:
 * Apprentice, Builder, Architect, Head Builder; a rank may change its own
 * groups and every group of the ranks below it.
 *   Collecting safety: Head Builder.
 *   XP, and Segments and rates: Architect and up.
 *   The map's look and the sayings: Builder and up.
 * Every change goes in the Changes tab, with who made it.
 */

// Each setting: [its name in the Settings tab, plain words, one line on what
// it does, its kind (number, colour, choice, names or lines), its unit or
// choices, and for a number, its lowest and highest]. Made when first asked
// for, since the names come from the other files.
function settingGroups_() {
  return [
  { key: 'safety', title: 'Collecting safety', rank: 'Head Builder', items: [
    [SETTING_SUNSET_WARN, 'Sunset warning', 'How long before sunset the page warns you to wrap up.', 'number', 'minutes before sunset', 0, 240],
    [SETTING_NO_START, 'No new collection', 'From this long before sunset, Start collecting waits for morning.', 'number', 'minutes before sunset', 0, 240],
    [SETTING_AUTO_END, 'A collection left alone ends after', 'A collection with no litter pulse for this long ends by itself.', 'number', 'hours', 1, 48],
    [SETTING_EDIT_HOURS, 'A collection can be changed for', 'How long after it ends a player can still fix a collection.', 'number', 'hours', 1, 720]] },
  { key: 'xp', title: 'XP', rank: 'Architect', items: [
    [SETTING_PLAN_XP, 'XP for each planned collection', 'A collection started from a plan earns this.', 'number', 'XP', 0, 100],
    [SETTING_RATING_XP_1, 'XP for a visual rating within 1', 'A visual rating within 1 of the Litter Index earns this.', 'number', 'XP', 0, 100],
    [SETTING_RATING_XP_2, 'XP for a visual rating within 2', 'Within 2 of the Litter Index.', 'number', 'XP', 0, 100],
    [SETTING_RATING_XP_3, 'XP for a visual rating within 3', 'Within 3 of the Litter Index.', 'number', 'XP', 0, 100],
    [SETTING_RATING_BONUS, 'Rating XP bonus', 'A close rating also earns the Litter Index divided by this.', 'number', '', 1, 100],
    [SETTING_TYPES_XP, 'XP for a stretch\'s litter types', 'A weighing with its litter types filled in earns this.', 'number', 'XP', 0, 100],
    [SETTING_QUEST_STEP_XP, 'XP for each first quest step', 'Each of the first quest\'s six steps earns this.', 'number', 'XP', 0, 100],
    [SETTING_QUEST_DONE_XP, 'XP for finishing the first quest', 'Finishing all six earns this more.', 'number', 'XP', 0, 100],
    [SETTING_BREAK_AFTER, 'Break question after', 'Once a player has this many collections, a weighing far slower than their usual pace asks if they took a break.', 'number', 'collections', 1, 100]] },
  { key: 'segments', title: 'Segments and rates', rank: 'Architect', items: [
    [SETTING_DUE_FROM, 'Segment due from', 'A segment shows on The Priority Segment List from this long after its clock started.', 'number', 'days', 0, 30],
    [SETTING_DUE_TO, 'Segment due until', 'Later than this, it\'s a Rate Reset: the next collection measures no rate and starts the clock again.', 'number', 'days', 1, 60],
    [SETTING_MIN_GAP, 'Shortest gap for a rate', 'A collection sooner than this after the clock started is a pickup: no rate, and its pounds go into the next.', 'number', 'hours', 1, 168],
    [SETTING_PIECES, 'Pieces add up within', 'Walks that each clean part of a segment, each this soon after the one before, add up to one collection.', 'number', 'hours', 1, 168],
    [SETTING_FINISH, 'Finish it shows from', 'A segment partly cleaned shows "Finish it" once this much of it is.', 'number', '% cleaned', 0, 100],
    [SETTING_COVER, 'Path collected when covered', 'A walk collects a path when it comes near this share of its squares.', 'number', '%', 1, 100],
    [SETTING_REACH, 'A track scans each side', 'On a field, how far either side of your track counts as scanned.', 'number', 'm', 1, 100],
    [SETTING_FIELD_COVER, 'Field collected when scanned', 'A walk collects a field when it scans this share of it.', 'number', '%', 1, 100],
    [SETTING_INSIDE, 'A weighing counts for a segment when inside', 'A weighing\'s pounds count for a segment when this share of its squares is on it.', 'number', '%', 1, 100],
    [SETTING_NEAR, 'Near enough to a segment', 'How close to a segment\'s squares counts as on it.', 'number', 'm', 0, 100],
    [SETTING_PART_M, 'Part of a segment', 'A segment is cut into parts this long, for how it was partly cleaned.', 'number', 'm', 10, 500],
    [SETTING_RATE_WINDOW, 'Rate window', 'A segment\'s rate is from its rates in this many days.', 'number', 'days', 1, 365],
    [SETTING_RATE_SHOWS, 'Segment rate shows', 'Which of its rates a segment shows.', 'choice', ['Median', 'Average', 'Both']],
    [SETTING_CONF_LOW, 'Confidence Low up to', 'Up to this many rates in the window, its confidence is the second name below.', 'number', 'rates', 1, 100],
    [SETTING_CONF_MODERATE, 'Confidence Moderate up to', 'Up to this many, the third name; more, the fourth.', 'number', 'rates', 1, 100],
    [SETTING_CONF_NAMES, 'Confidence names', 'Four names, with commas between: for no rate in the window, then low, moderate and established.', 'names', 4],
    [SETTING_RATE_TOP, 'Rate map top', 'The rate the map\'s top colour stands for.', 'number', 'lb per mile per day', 0.1, 100],
    [SETTING_APART, 'Plan segments far apart', 'A plan with segments farther apart than this gets a notice.', 'number', 'mi', 0.1, 50]] },
  { key: 'look', title: 'The map\'s look and the sayings', rank: 'Builder', items: [
    [SETTING_COLOUR_0, 'Map colour at 0', 'The Litter Index scale\'s colour at 0.', 'colour'],
    [SETTING_COLOUR_5, 'Map colour at 5', 'At 5.', 'colour'],
    [SETTING_COLOUR_10, 'Map colour at 10', 'At 10 and above.', 'colour'],
    [SETTING_PLAN_COLOUR, 'Map colour: plan', 'The band around your chosen plan.', 'colour'],
    [SETTING_PAUSED_COLOUR, 'Paused track colour', 'Where a GPX track was paused.', 'colour']]
    .concat(DARK_SETTINGS.map(function (d) { return [d[1], d[1], 'The same, in Admin Mode\'s dark look.', 'colour']; }))
    .concat([[SETTING_START_SAYINGS, 'Sayings while a collection starts', 'One shows at random while a collection starts.', 'lines', 50]]) }
  ];
}

function rankAtLeast_(rank, need) { return RANKS.indexOf(rank) >= 0 && RANKS.indexOf(rank) >= RANKS.indexOf(need); }

// The groups this account may change, with each setting's value now.
function settingsGroupsFor_(account) {
  return settingGroups_().filter(function (g) { return rankAtLeast_(account.rank, g.rank); }).map(function (g) {
    return { key: g.key, title: g.title, rank: g.rank, items: g.items.map(function (it) {
      var v = getSetting_(it[0]), kind = it[3];
      return { name: it[0], label: it[1], say: it[2], kind: kind, unit: kind === 'number' ? it[4] : '', choices: kind === 'choice' ? it[4] : null,
        min: kind === 'number' ? it[5] : null, max: kind === 'number' ? it[6] : null,
        value: kind === 'lines' ? String(v).split(/\r?\n/).map(function (t) { return t.trim(); }).filter(String) : String(v).trim() };
    }) };
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
  if (!rankAtLeast_(account.rank, g.rank)) throw new Error(g.title + ' can be changed by a ' + g.rank + (g.rank === 'Head Builder' ? '' : ' or above') + '.');
  var values = req.values && typeof req.values === 'object' ? req.values : {};
  var out = [];
  g.items.forEach(function (it) {
    if (!Object.prototype.hasOwnProperty.call(values, it[0])) return;
    out.push([it, settingValue_(it, values[it[0]])]);
  });
  var changed = withLock_(function () {
    var n = 0;
    out.forEach(function (x) {
      var before = String(getSetting_(x[0][0]));
      if (before.trim() === x[1]) return;
      setSetting_(x[0][0], x[1]);
      logChange_(account.email, 'Setting', x[0][0], 'Value', before, x[1]);
      n++;
    });
    return n;
  });
  return { groups: settingsGroupsFor_(account), changed: changed, settings: collectSettings_() };
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
