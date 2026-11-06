/**
 * Levels for the litter class (S5-P4, |Q588, |Q595, Nov 3): the Levels tab
 * holds ranges of levels, each with its XP for each level: 1 to 5, 100 XP
 * each; 6 to 10, 200 each; 11 and up, 300 each, to start. A level with no
 * range uses the nearest range below it. Below the first level is Level 0.
 * Rows are added and deleted by hand, or in Admin Mode's Settings, Levels
 * and class skills (S5-P29, |Q615 (a)); the start is written only once.
 * Later, with a second skill class: an overall level by an equation.
 */

function levelsOnce_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('LEVELS_SEEDED')) return;
  var sheet = getDb_().getSheetByName(TABS.levels.name);
  if (sheet.getLastRow() < 2) sheet.getRange(2, 1, 3, 3).setValues([[1, 5, 100], [6, 10, 200], [11, '', 300]]);
  props.setProperty('LEVELS_SEEDED', new Date().toISOString());
}

// The ranges, as [from, to (or null for "and up"), XP per level], lowest first.
function levelRanges_() {
  var sheet = getDb_().getSheetByName(TABS.levels.name);
  var last = sheet ? sheet.getLastRow() : 0;
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, 3).getValues().map(function (r) {
    var from = Number(r[0]), to = String(r[1]).trim() === '' ? null : Number(r[1]), xp = Number(r[2]);
    return from >= 1 && Math.floor(from) === from && xp > 0 && (to === null || to >= from) ? [from, to, xp] : null;
  }).filter(Boolean).sort(function (a, b) { return a[0] - b[0]; });
}

// A player's level from their XP, worked out as the page does (collect.js
// levelOf): each level costs its range's XP per level, on top of the last.
function levelOf_(xp, ranges) {
  var level = 0, need = 0;
  for (var n = 1; n < 1000 && ranges.length; n++) {
    var r = null, below = null;
    ranges.forEach(function (x) { if (x[0] <= n && (x[1] == null || n <= x[1])) r = x; if (x[0] <= n) below = x; });
    r = r || below;
    if (!r) break;
    need += r[2];
    if (xp < need) break;
    level = n;
  }
  return level;
}

/**
 * Litter Class Skills (S5-P29, |Q612 to |Q615, |Q631 (a), Nov 5): what a
 * player can do in the litter class, each opening at a level. Kept in the
 * Class Skills tab, one row for each, by its name; changed there by hand, or
 * in Admin Mode's Settings, Levels and class skills, by an Architect or above
 * (|Q613 (a)). 0 is open to everyone, and every skill starts at 0 (|Q605).
 * A player below a skill's level sees it greyed, "Unlocks at Level N"
 * (|Q614 (a)), and HABO refuses it too.
 * Each: [key, its name, what it does].
 */
var CLASS_SKILLS = [
  ['here', 'Start a segment while collecting', 'Off your plan, the page asks "Collecting here?", and you weigh to start a new segment.'],
  ['draw', 'Draw a private segment', 'Draw your own segment on the map, to put in a plan.'],
  ['keep', 'Keep ground off your plan', 'After a walk, keep ground you walked off your plan as a private segment.'],
  ['add', 'Ask to add ground to a public segment', 'After a walk, ask an admin to add ground you walked to a public segment it touches.'],
  ['submit', 'Submit as Public Segment', 'Send one of your private segments to the admins, to be made public.'],
  ['type', 'Add a litter type', 'Add a litter type that isn\'t on the list yet.']
];
var SKILL_LEVEL_MAX = 999;

// The first time: every skill, open to everyone.
function classSkillsOnce_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('CLASS_SKILLS_SEEDED')) return;
  var sheet = getDb_().getSheetByName(TABS.skills.name);
  if (sheet.getLastRow() < 2) sheet.getRange(2, 1, CLASS_SKILLS.length, 3).setValues(CLASS_SKILLS.map(function (s) { return [s[1], 0, s[2]]; }));
  props.setProperty('CLASS_SKILLS_SEEDED', new Date().toISOString());
}

// The Class Skills tab's rows: [name, level as written, its row].
function classSkillRows_() {
  var sheet = getDb_().getSheetByName(TABS.skills.name);
  var last = sheet ? sheet.getLastRow() : 0;
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, 2).getDisplayValues().map(function (r, i) { return [String(r[0]).trim(), String(r[1]).trim(), i + 2]; });
}

// Each skill with its level: from its row (a blank, or anything but a whole
// number from 0, counts as 0); a skill with no row is open to everyone.
function classSkills_() {
  var rows = classSkillRows_();
  return CLASS_SKILLS.map(function (s) {
    var r = rows.filter(function (x) { return x[0].toLowerCase() === s[1].toLowerCase(); })[0];
    var n = r && r[1] !== '' ? Number(r[1]) : 0;
    return { key: s[0], name: s[1], say: s[2], level: n >= 0 && Math.floor(n) === n ? Math.min(n, SKILL_LEVEL_MAX) : 0 };
  });
}

// Refuses a skill this player hasn't reached the level for.
function requireSkill_(account, key) {
  var s = classSkills_().filter(function (x) { return x.key === key; })[0];
  if (!s || !s.level) return;
  var have = levelOf_(xpOf_(account.id), levelRanges_());
  if (have < s.level) throw new Error(s.name + ' unlocks at Level ' + s.level + '. You\'re at Level ' + have + '.');
}
