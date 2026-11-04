/**
 * Levels for the litter class (S5-P4, |Q588, |Q595, Nov 3): the Levels tab
 * holds ranges of levels, each with its XP for each level: 1 to 5, 100 XP
 * each; 6 to 10, 200 each; 11 and up, 300 each, to start. A level with no
 * range uses the nearest range below it. Below the first level is Level 0.
 * Rows are added and deleted by hand; the start is written only once.
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
