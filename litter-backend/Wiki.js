/**
 * The Wiki (S6-P9, |M862, |Q664 (a), |Q665 (a)): pages for everyone, in the
 * top panel, in place of more ℹ️. Admins write them: any admin rank drafts a
 * page, or an edit to one, and it goes to the Forum as a Decision for
 * approval; once its vote passes, it goes live for players (|Q664's
 * addendum). The first pages are seeded once, from what the app does.
 *
 * A page's text: a blank line between paragraphs; a line starting "- " is a
 * point in a list; {{sources}} shows the Sources tab's sources.
 */
var WIKI_COL = { id: 1, title: 2, text: 3, state: 4, of: 5, by: 6, drafted: 7, topic: 8, live: 9 };
var WIKI_TEXT_MAX = 8000, WIKI_TITLE_MAX = 80;

function wikiRows_() {
  return readRows_(TABS.wiki, WIKI_COL).map(function (r) {
    var d = function (k) { var v = r.get(k); return v instanceof Date ? v.getTime() : 0; };
    return { row: r.row, id: r.get('id'), title: r.get('title'), text: String(r.get('text')), state: r.get('state') || 'Draft', of: r.get('of'), by: r.get('by'),
      drafted: d('drafted'), topic: r.get('topic'), live: d('live') };
  }).filter(function (p) { return p.id; });
}

// The Sources tab, for {{sources}}.
function wikiSources_() {
  var sheet = getDb_().getSheetByName(TABS.sources.name), last = sheet ? sheet.getLastRow() : 0;
  if (last < 2) return [];
  return sheet.getRange(2, 1, last - 1, 4).getDisplayValues().filter(function (r) { return String(r[0]).trim(); }).map(function (r) {
    return { source: r[0], link: String(r[1]).trim(), usedFor: r[2], reasoning: r[3] };
  });
}

// A draft whose Forum vote has closed: taken in (a new page, or the page
// it edits, changed), or not.
function wikiSync_() {
  var drafts = wikiRows_().filter(function (p) { return p.state === 'Draft' && p.topic; });
  if (!drafts.length) return;
  var topics = {};
  forumTopics_().forEach(function (t) { topics[t.id] = t; });
  var sheet = getDb_().getSheetByName(TABS.wiki.name), pages = wikiRows_();
  drafts.forEach(function (d) {
    var t = topics[d.topic];
    if (!t || (t.state !== 'Passed' && t.state !== 'Failed' && t.state !== 'Withdrawn')) return;
    if (t.state !== 'Passed') { sheet.getRange(d.row, WIKI_COL.state).setValue('Not taken'); return; }
    var page = d.of ? pages.filter(function (p) { return p.id === d.of && p.state === 'Live'; })[0] : null;
    if (page) {
      sheet.getRange(page.row, WIKI_COL.title, 1, 2).setValues([[safeCell_(d.title), safeCell_(d.text)]]);
      sheet.getRange(page.row, WIKI_COL.live).setValue(new Date());
      sheet.getRange(d.row, WIKI_COL.state).setValue('Taken in');
    } else {
      // A new page: the draft's own row goes live.
      sheet.getRange(d.row, WIKI_COL.state).setValue('Live');
      sheet.getRange(d.row, WIKI_COL.live).setValue(new Date());
    }
  });
}

// The Wiki: its live pages, for anyone (the public map's ℹ️ links here too);
// for admins, the drafts as well.
function wikiLoad_(req) {
  ensureSchema_();
  var account = req.token ? requireAccount_(req.token) : null;
  if (wikiRows_().some(function (p) { return p.state === 'Draft' && p.topic; })) {
    forumLock_(function () { closeVotes_(); });
    withLock_(function () { wikiSync_(); });
  }
  return wikiView_(account);
}
function wikiView_(account) {
  var rows = wikiRows_(), topics = {};
  forumTopics_().forEach(function (t) { topics[t.id] = t; });
  var pages = rows.filter(function (p) { return p.state === 'Live'; }).map(function (p) { return { id: p.id, title: p.title, text: p.text, live: p.live }; });
  var out = { pages: pages, sources: wikiSources_(), admin: !!(account && account.rank) };
  if (out.admin) {
    out.drafts = rows.filter(function (p) { return p.state !== 'Live'; }).map(function (p) {
      var t = topics[p.topic];
      return { id: p.id, title: p.title, of: p.of, state: p.state, topic: p.topic, vote: t ? t.state : '', drafted: p.drafted };
    }).reverse();
  }
  return out;
}

// A draft, by any admin rank: a new page, or an edit to one (`of`). It goes
// to the Forum as a Decision; once its vote passes, it's live.
function wikiDraft_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!account.rank) throw new Error('Wiki pages are drafted by HABO\'s admins.');
  var title = clean_(req.title, WIKI_TITLE_MAX), text = String(req.text == null ? '' : req.text).replace(/\r\n/g, '\n').trim().slice(0, WIKI_TEXT_MAX);
  if (title.length < 2) throw new Error('Give the page a title.');
  if (text.length < 2) throw new Error('Write what the page says.');
  var of = clean_(req.of, 20);
  var page = of ? wikiRows_().filter(function (p) { return p.id === of && p.state === 'Live'; })[0] : null;
  if (of && !page) throw new Error('That page isn\'t here any more.');
  return withLock_(function () {
    var sheet = getDb_().getSheetByName(TABS.wiki.name), ids = wikiRows_().map(function (p) { return p.id; });
    var id = nextId_('W', ids);
    var topic = topicNew_(account, 'Decision', 'Wiki: ' + (page ? 'an edit to ' + page.title : 'a new page, ' + title),
      (page ? 'An edit to the Wiki page "' + page.title + '"' : 'A new Wiki page, "' + title + '"') + ', drafted as ' + id + '. Once this vote passes, it goes live for players.\n\n' + title + '\n\n' + text,
      FORUM_STATES.Decision[0], '', 'wiki:' + id);
    var row = blankRow_(TABS.wiki);
    row[WIKI_COL.id - 1] = id; row[WIKI_COL.title - 1] = safeCell_(title); row[WIKI_COL.text - 1] = safeCell_(text); row[WIKI_COL.state - 1] = 'Draft';
    row[WIKI_COL.of - 1] = page ? page.id : ''; row[WIKI_COL.by - 1] = account.handle || account.email; row[WIKI_COL.drafted - 1] = new Date(); row[WIKI_COL.topic - 1] = topic;
    sheet.getRange(lastRowWith_(sheet, WIKI_COL.id) + 1, 1, 1, row.length).setValues([row]);
    var out = wikiView_(account);
    out.topic = topic;
    return out;
  });
}

/* ── The first pages, seeded once (S6-P9, items 2 and 3) ── */

var WIKI_SEED = [
  ['How the accumulation rate is worked out',
    'A segment\'s accumulation rate is how fast litter comes back to it, in pounds per mile per day (lb/mi·day⁻¹).\n\n' +
    '- A walk that collects all of a segment (90% of its squares, a setting) starts its clock: the segment is taken as clean.\n' +
    '- A walk that collects it again from 1 to 4 days later measures its rate: the pounds picked up on it, over its miles, over the days since its clock started. That walk starts the clock again.\n' +
    '- Under a day later, the pounds add to the next rate instead.\n' +
    '- More than 4 days later is a Rate Reset: no rate, and the clock starts again.\n' +
    '- A segment\'s rate is the median of its rates, or their average, or both (a setting).\n\n' +
    'The days and the share are settings, in Admin Mode\'s Settings, Segments and rates.\n\n' +
    'Where the method comes from:\n\n{{sources}}'],
  ['The Litter Index',
    'A weighing\'s Litter Index says how littered the ground was, on one scale for every street and field.\n\n' +
    'It comes from the weighing\'s pounds, its active minutes and its miles: pounds × active hours ÷ miles², and the Litter Index is the square root of that.\n\n' +
    'The miles come only from your GPX track, so a weighing has a Litter Index only when your track covers it from start to end, to within 2 minutes at each end. A pause in the middle doesn\'t count against it.\n\n' +
    '0 is clean. On the map, colours blend from the colour at 0, to the one at 5, to the one at 10 and above.'],
  ['The map\'s layers and colours',
    'The map has two layers; choose one with the layers button.\n\n' +
    '- Litter Index: each square\'s latest reading, in its colour. A reading fades as it ages, and is gone from the map after 30 days (a setting); its numbers stay.\n' +
    '- Accumulation rate: each public segment\'s squares in its rate\'s colour, grey while it has no rate yet.\n\n' +
    'Tap a square for its numbers. Each square is 1/160 of a mile (about 33 ft) on a side.'],
  ['Levels and Litter Class Skills',
    'Your XP adds up to your level. Each level costs the XP its range says, on top of the last; the ranges are set in Admin Mode\'s Settings, Levels and class skills.\n\n' +
    'Litter Class Skills open at a level. Until you reach it, a skill is greyed, with "Unlocks at Level N". See them all from the top panel, with Litter Class Skills.\n\n' +
    'A Challenge an admin builds can open at a level too, and is listed with the skills.'],
  ['XP',
    'You earn XP for:\n\n' +
    '- planning a walk;\n' +
    '- each weighing\'s rating close to its Litter Index: 3 within 1, 2 within 2, 1 within 3, more the higher the Litter Index;\n' +
    '- a weighing\'s litter types filled in;\n' +
    '- the first quest\'s steps, and finishing it;\n' +
    '- a segment of yours approved to be public;\n' +
    '- Challenges an admin builds.\n\n' +
    'The time bonus: collecting a segment again a day after its clock started multiplies a walk\'s rating and litter-type XP, ×2 to start, coming down to none by 4 days.\n\n' +
    'Only walks with their GPX track saved earn XP, and none is earned after sunset.'],
  ['Admin Mode',
    'Admin Mode is for HABO\'s admins, turned on in the top panel, on this computer only. While it\'s on, the page turns dark, and Settings, Reviews, the Forum and Challenges show in the top panel.\n\n' +
    'A Head Builder\'s Admin Mode also has simulated walks and Measure again. A simulated walk is marked Simulated, and nothing it does reaches the map, XP, volunteer hours or the grant.']
];

function wikiOnce_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('WIKI_SEEDED')) return;
  var sheet = getDb_().getSheetByName(TABS.wiki.name);
  if (lastRowWith_(sheet, WIKI_COL.id) < 2) {
    var now = new Date();
    var rows = WIKI_SEED.map(function (p, i) {
      var row = blankRow_(TABS.wiki);
      row[WIKI_COL.id - 1] = 'W' + ('00' + (i + 1)).slice(-3); row[WIKI_COL.title - 1] = p[0]; row[WIKI_COL.text - 1] = p[1]; row[WIKI_COL.state - 1] = 'Live';
      row[WIKI_COL.by - 1] = 'HABO'; row[WIKI_COL.drafted - 1] = now; row[WIKI_COL.live - 1] = now;
      return row;
    });
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  props.setProperty('WIKI_SEEDED', new Date().toISOString());
}
