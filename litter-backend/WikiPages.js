/* ── S7-P20: the Getting started and Collecting pages, and five pages rewritten ──
 *
 * Read word by word on the board (|Q901 to |Q911) and put in the Wiki once,
 * by the Deploy (|S7-P20's "How they go in"); after that they're changed in
 * the Wiki's editor, as any page is.
 *
 * Tokens a page's text can hold, shown by the page as they are now:
 *   {{live:Setting name}}   a live value: that setting's value in Settings (|Q877 (a))
 *   [[Page title|words]]    a page link: the words, opening that page
 *   {{first quest|words}}   the words, going through your first quest again (|Q901 #1)
 *   {{store:address|words}} a button opening an app's store page (|Q889 (a))
 *   {{waiver:2}}            the waiver's section 2, in its current words (|Q888)
 *   {{me:agreed}}           the day you last agreed to the waiver
 */

var WIKI_S7P20_PROP = 'WIKI_S7P20';
var LIVE_ = function (name) { return '{{live:' + name + '}}'; };
var GAP_ = LIVE_('Shortest gap for a rate (hours)') + ' hours', RESET_ = LIVE_('Segment due until (days since cleaned)') + ' days';
var RENEW_ = LIVE_('Renew the waiver and safety gear every') + ' months';

// [title, section, place among the new pages there (0: keep its place), text]
var WIKI_S7P20 = [
  ['Your first walk', 'Getting started', 1, [
    '1. Set up your account and sign the waiver. Your {{first quest|first quest}} takes you through the rest.',
    '2. On the main page, press Choose your plan and pick the segments you mean to collect.',
    '3. Start your GPX recorder app. Then press Start collecting, and pick your bag and your scale.',
    // Litter types first, then the scale, then the rating, as the page asks (S6-U33 item 2; |Q901 #4).
    '4. At the end of each segment, press Litter pulse, then Weigh: pick the litter types if you like, then type what the scale shows for the whole bag, like 3.25 (the page works out what\'s new), and rate how littered it looked, 0 to 10. [[The litter pulse|More on the litter pulse]]',
    '5. A fresh bag: Litter pulse, then New bag. A break: Litter pulse, then Pause, and Resume when you\'re back.',
    '6. Done: Litter pulse, then End, and weigh your last bag. Then stop your GPX recorder.',
    '7. On your walk\'s summary, choose the GPX file: your walk shows on the map and earns its XP.'].join('\n\n')],
  ['Safety gear and the waiver', 'Getting started', 2, [
    'Have these on every walk: gloves, with you (worn or packed); closed-toe shoes; and a safety vest, or a brightly coloured shirt. Using them is your responsibility.',
    'Every ' + RENEW_ + ' you sign the waiver again and confirm your gear; you can ask for a new grabber or scale then too.',
    'Collect in daylight: the page warns you before sunset, and a new walk waits for morning.',
    '[[Safety rules|More on the safety rules]]'].join('\n\n')],
  ['Safety rules', 'Getting started', 3, [
    'These are the rules you agreed to in the waiver, its section 2, as they read today:',
    '{{waiver:2}}',
    'You last agreed to them on {{me:agreed}}.',
    'Why again every ' + RENEW_ + ': you sign the waiver again and confirm your safety gear, so the rules stay fresh, and HABO knows each player still has their gear and has agreed to the waiver as it reads now. If its words change sooner, you\'re asked to sign the new ones the next time you open the page.'].join('\n\n')],
  ['The litter pulse', 'Collecting', 1, [
    'One button, Litter pulse, opens four choices.',
    ['- Weigh: at the end of each segment, so each gets its own reading. Pick the litter types (you can skip this), then type what the scale shows for the whole bag, like 3.25; the page works out what\'s new since your last weighing. Then rate how littered it looked, 0 to 10.',
      '- New bag: when you start a fresh bag, so the page knows your next reading is the new bag\'s.',
      '- Pause: for a break; paused time isn\'t counted. Resume when you\'re back.',
      '- End: when you\'re done; you weigh your last bag.'].join('\n'),
    'Skills: its own button, beside Litter pulse while you\'re collecting, for the skills you\'ve unlocked.'].join('\n\n')],
  ['Your GPX track', 'Collecting', 2, [
    'Your GPX recorder records where you walked. Each weighing\'s miles come from it, so it gives your walk its Litter Index, its place on the map, and its XP: a walk with no GPX track earns no XP.',
    'Start the recorder before Start collecting; stop it after End. If the track misses either end by more than 2 minutes, the page names the weighing it missed and lets you choose another file.',
    'The apps we\'ve tried, each with a button that opens its store page:',
    '{{store:https://apps.apple.com/us/app/open-gpx-tracker/id984503772|iPhone: Open GPX Tracker}} It opens the App Store: press Open there, or Get if you don\'t have it yet.',
    '{{store:https://play.google.com/store/apps/details?id=com.garmin.android.apps.connectmobile|Android: Garmin Connect}} With a Garmin watch. It opens Google Play: press Open, or Install.'].join('\n\n')],
  ['How the accumulation rate is worked out', 'Measuring', 0, [
    'A segment\'s accumulation rate is how fast litter comes back to it, in pounds per mile per day (lb/mi·day⁻¹).',
    ['- A walk that collects all of a segment (' + LIVE_('Segment collected when covered (%)') + '% of its squares) starts its clock: the segment is taken as clean.',
      '- A walk that collects it again from ' + GAP_ + ' to ' + RESET_ + ' later measures its rate: the pounds picked up on it, over its miles, over the days since its clock started. That walk starts the clock again.',
      '- Sooner than ' + GAP_ + ', the pounds go into the next rate instead.',
      '- Later than ' + RESET_ + ' is a Rate Reset: no rate, and the clock starts again.',
      '- A segment\'s rate is the ' + LIVE_('Segment rate shows (Median, Average or Both)') + ' of its rates from the last ' + LIVE_('Rate window (days)') + ' days.'].join('\n'),
    'These are settings, in Admin Mode\'s Settings, Rates.',
    'Where the method comes from:',
    '{{sources}}'].join('\n\n')],
  ['XP', 'XP, levels and skills', 0, [
    'You earn XP for:',
    ['- a walk you planned: ' + LIVE_('XP for each planned collection') + ' XP;',
      '- each weighing\'s rating close to its Litter Index: ' + LIVE_('XP for a visual rating within 1') + ' within 1, ' + LIVE_('XP for a visual rating within 2') + ' within 2, ' + LIVE_('XP for a visual rating within 3') + ' within 3, and a little more the higher the Litter Index;',
      '- a weighing\'s litter types filled in: ' + LIVE_('XP for a stretch\'s litter types') + ' XP;',
      '- the first quest: ' + LIVE_('XP for each first quest step') + ' XP for each step, and ' + LIVE_('XP for finishing the first quest') + ' more for finishing it;',
      '- a segment of yours approved to be public: up to ' + LIVE_('Most XP for a segment approved to be public') + ' XP;',
      '- a skill you send, once it\'s approved: that skill\'s XP;',
      '- a badge: its XP;',
      '- a Quest you\'ve taken on: its Challenges\' XP, and its bonus when you finish it;',
      '- a bounty you earn: its bonus XP.'].join('\n'),
    'Recollection bonus: collecting a segment again a day after its clock started multiplies a walk\'s rating and litter-type XP by ' + LIVE_('Recollection bonus: XP multiplier a day after') + ', coming down evenly to none by ' + LIVE_('Recollection bonus: gone after (days)') + ' days.',
    'Rescue bonus: a walk that collects a public segment nobody has collected for ' + LIVE_('Rescue bonus: after (days)') + ' days, or ever, multiplies them by ' + LIVE_('Rescue bonus: XP multiplier') + '. Where the Recollection bonus is more, it counts instead.',
    'Only walks with their GPX track saved earn XP. To see each XP you\'ve earned, newest first, type xp history in Street Talk.'].join('\n\n')],
  ['The map\'s layers and colours', 'The map', 0, [
    'Choose a layer with the Map layers button.',
    ['- Litter Index: each square\'s latest reading, in its colour. A reading fades as it ages, and is gone from the map after ' + LIVE_('Map: readings fade out after (days)') + ' days; its numbers stay.',
      '- Accumulation rate: each public segment\'s squares in its rate\'s colour, grey while it has no rate yet.'].join('\n'),
    'Three more on the Maps screen, to compare your eye with the scale:',
    ['- Visual rating: yours, how littered you rated each square;',
      '- Visual rating: everyone\'s average;',
      '- Your rating against the Litter Index.'].join('\n'),
    'Skill pins: approved skills\' pins, on top of any layer, without who sent them; turn them off and on in the same menu.',
    'A bounty\'s segments show 🎯 while it runs.',
    'Tap a square for its numbers. Each square is 1/160 of a mile (about 33 ft) on a side.'].join('\n\n')],
  ['Levels and Litter Class Skills', 'XP, levels and skills', 0, [
    'Your XP adds up to your level. Each level costs the XP its range says, on top of the last; the ranges are in Admin Mode\'s Settings, Levels and skills. A level once reached is kept, even if the ranges change.',
    'Litter Class Skills open at a level. Until you reach it, a skill is greyed, with "Unlocks at Level N". See them all from the top panel, with Skills.',
    'Skills from the toolbox open at a level too, and are listed with them.'].join('\n\n')],
  ['Admin Mode', 'For admins', 0, [
    'Admin Mode is for HABO\'s admins, turned on in the top panel, on this phone or computer only. While it\'s on, the page turns dark, and the top panel adds Settings, Reviews, Forum, Skill Builder, Quest Drafting Bench, Achievements, Bounty rewards and Cleanups.',
    'Every admin rank sees Reviews and the Forum: an Apprentice recommends in Reviews; a Builder or above approves or declines, and votes in the Forum. Settings shows each group to the rank it\'s set for.',
    'A Head Builder\'s Admin Mode also has simulated walks and Measure again. A simulated walk is marked Simulated, and nothing it does reaches the map, XP, volunteer hours or the grant.'].join('\n\n')],
  // Its first lines rewritten after S7-P19 (|Q911); its reasons stay as they are, with the 24 hours live.
  ['Why a walk gives no rate', 'Measuring', 0, function (old) {
    var first = 'A segment\'s rate is how fast litter comes back to it: the pounds collected, divided by its miles and by the days since it was last cleaned. Some walks collect a segment without giving it a rate. On a square\'s pop-up they say No rate, and Why? on the newest opens this page. A walk under ' + GAP_ + ' after the clock started also has a * by its day, and the footnote under the table names the walk its pounds went into.';
    var rest = String(old || '').split(/\n\s*\n/).slice(1).join('\n\n').replace(/\b24 hours\b/g, GAP_);
    return rest ? first + '\n\n' + rest : first;
  }]
];

// Once, after the Deploy: the new pages added, in their places; a page that's
// there already (by its title) gets its new words, keeping its id and place.
function wikiS7P20Once_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty(WIKI_S7P20_PROP)) return;
  var sheet = getDb_().getSheetByName(TABS.wiki.name);
  if (!sheet) return;
  var have = wikiRows_(), secs = {}, now = new Date(), add = [];
  wikiSectionRows_().forEach(function (s) { if (s.state === 'Live') secs[s.name.toLowerCase()] = s.id; });
  var ids = have.map(function (p) { return p.id; });
  WIKI_S7P20.forEach(function (w) {
    var live = have.filter(function (p) { return p.state === 'Live' && p.title.toLowerCase() === w[0].toLowerCase(); })[0];
    var text = typeof w[3] === 'function' ? w[3](live ? live.text : '') : w[3];
    if (live) {
      sheet.getRange(live.row, WIKI_COL.text).setValue(safeCell_(text));
      sheet.getRange(live.row, WIKI_COL.live).setValue(now);
      return;
    }
    var row = blankRow_(TABS.wiki), id = nextId_('W', ids);
    ids.push(id);
    row[WIKI_COL.id - 1] = id; row[WIKI_COL.title - 1] = w[0]; row[WIKI_COL.text - 1] = safeCell_(text); row[WIKI_COL.state - 1] = 'Live';
    row[WIKI_COL.by - 1] = 'HABO'; row[WIKI_COL.drafted - 1] = now; row[WIKI_COL.live - 1] = now;
    row[WIKI_COL.section - 1] = secs[w[1].toLowerCase()] || ''; row[WIKI_COL.place - 1] = w[2] || '';
    add.push(row);
  });
  if (add.length) sheet.getRange(lastRowWith_(sheet, WIKI_COL.id) + 1, 1, add.length, add[0].length).setValues(add);
  forgetReads_();
  props.setProperty(WIKI_S7P20_PROP, now.toISOString());
}

// The live values the pages name, as Settings has them now (|Q877 (a)).
function wikiLive_(pages) {
  var out = {}, re = /\{\{live:([^}]+)\}\}/g, m;
  (pages || []).forEach(function (p) {
    re.lastIndex = 0;
    while ((m = re.exec(String(p.text || '')))) if (!(m[1] in out)) out[m[1]] = String(getSetting_(m[1]) || '').trim();
  });
  return out;
}

// A section of the waiver, in its current words: from the line starting
// with its number to the line starting with the next (|Q888's addendum).
function waiverSection_(n) {
  var lines = String(currentWaiver_().text || '').split('\n'), out = [], on = false;
  for (var i = 0; i < lines.length; i++) {
    var l = lines[i].trim();
    if (new RegExp('^' + n + '\\.\\s').test(l)) on = true;
    else if (on && new RegExp('^' + (n + 1) + '\\.\\s').test(l)) break;
    if (on && l) out.push(l);
  }
  return out.join('\n');
}
