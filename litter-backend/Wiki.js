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
var WIKI_COL = { id: 1, title: 2, text: 3, state: 4, of: 5, by: 6, drafted: 7, topic: 8, live: 9, section: 10, place: 11 };
var WSEC_COL = { id: 1, name: 2, place: 3, state: 4, of: 5, by: 6, drafted: 7, topic: 8, live: 9 };
var WSEC_NAME_MAX = 40;
var WIKI_TEXT_MAX = 8000, WIKI_TITLE_MAX = 80;

function wikiRows_() {
  return readRows_(TABS.wiki, WIKI_COL).map(function (r) {
    var d = function (k) { var v = r.get(k); return v instanceof Date ? v.getTime() : 0; };
    return { row: r.row, id: r.get('id'), title: r.get('title'), text: String(r.get('text')), state: r.get('state') || 'Draft', of: r.get('of'), by: r.get('by'),
      drafted: d('drafted'), topic: r.get('topic'), live: d('live'), section: r.get('section'), place: Number(r.get('place')) || 0 };
  }).filter(function (p) { return p.id; });
}

// The sections (S6-P9 round 2): live ones, and drafts waiting on the Forum.
function wikiSectionRows_() {
  return readRows_(TABS.wikiSections, WSEC_COL).map(function (r) {
    var d = function (k) { var v = r.get(k); return v instanceof Date ? v.getTime() : 0; };
    return { row: r.row, id: r.get('id'), name: r.get('name'), place: Number(r.get('place')) || 0, state: r.get('state') || 'Draft', of: r.get('of'), by: r.get('by'),
      drafted: d('drafted'), topic: r.get('topic'), live: d('live') };
  }).filter(function (s) { return s.id; });
}
function liveSections_() {
  return wikiSectionRows_().filter(function (s) { return s.state === 'Live'; }).sort(function (a, b) { return a.place - b.place || a.name.localeCompare(b.name); });
}

// A page put at `place` in its section (0: at the end), the section's other
// live pages moving down one to make room; places kept 1, 2, 3…
function wikiPlace_(sheet, pageId, sectionId, place) {
  var pages = wikiRows_().filter(function (p) { return p.state === 'Live'; });
  var page = pages.filter(function (p) { return p.id === pageId; })[0];
  if (!page) return;
  var rest = pages.filter(function (p) { return p.section === sectionId && p.id !== pageId; }).sort(function (a, b) { return (a.place || 999) - (b.place || 999) || a.title.localeCompare(b.title); });
  var at = place > 0 ? Math.min(place - 1, rest.length) : rest.length;
  rest.splice(at, 0, page);
  sheet.getRange(page.row, WIKI_COL.section).setValue(sectionId);
  rest.forEach(function (p, i) { sheet.getRange(p.row, WIKI_COL.place).setValue(i + 1); });
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
// it edits, changed), or not. A page goes where its draft said, in its
// section and its place (S6-P9 round 2); a section draft adds or renames one.
function wikiSync_() {
  var drafts = wikiRows_().filter(function (p) { return p.state === 'Draft' && p.topic; });
  var secDrafts = wikiSectionRows_().filter(function (s) { return s.state === 'Draft' && s.topic; });
  if (!drafts.length && !secDrafts.length) return;
  var topics = {};
  forumTopics_().forEach(function (t) { topics[t.id] = t; });
  var closed = function (t) { return t && (t.state === 'Passed' || t.state === 'Failed' || t.state === 'Withdrawn'); };
  var sheet = getDb_().getSheetByName(TABS.wiki.name), pages = wikiRows_();
  drafts.forEach(function (d) {
    var t = topics[d.topic];
    if (!closed(t)) return;
    if (t.state !== 'Passed') { sheet.getRange(d.row, WIKI_COL.state).setValue('Not taken'); return; }
    var page = d.of ? pages.filter(function (p) { return p.id === d.of && p.state === 'Live'; })[0] : null;
    if (page) {
      sheet.getRange(page.row, WIKI_COL.title, 1, 2).setValues([[safeCell_(d.title), safeCell_(d.text)]]);
      sheet.getRange(page.row, WIKI_COL.live).setValue(new Date());
      sheet.getRange(d.row, WIKI_COL.state).setValue('Taken in');
      if (d.section && (d.section !== page.section || d.place)) wikiPlace_(sheet, page.id, d.section, d.place);
    } else {
      // A new page: the draft's own row goes live, in its place.
      sheet.getRange(d.row, WIKI_COL.state).setValue('Live');
      sheet.getRange(d.row, WIKI_COL.live).setValue(new Date());
      if (d.section) wikiPlace_(sheet, d.id, d.section, d.place);
    }
  });
  var ss = getDb_().getSheetByName(TABS.wikiSections.name), live = liveSections_();
  secDrafts.forEach(function (d) {
    var t = topics[d.topic];
    if (!closed(t)) return;
    if (t.state !== 'Passed') { ss.getRange(d.row, WSEC_COL.state).setValue('Not taken'); return; }
    var was = d.of ? live.filter(function (s) { return s.id === d.of; })[0] : null;
    if (was) {
      ss.getRange(was.row, WSEC_COL.name).setValue(safeCell_(d.name));
      ss.getRange(d.row, WSEC_COL.state).setValue('Taken in');
    } else {
      ss.getRange(d.row, WSEC_COL.state).setValue('Live');
      ss.getRange(d.row, WSEC_COL.place).setValue(live.reduce(function (m, s) { return Math.max(m, s.place); }, 0) + 1);
      ss.getRange(d.row, WSEC_COL.live).setValue(new Date());
    }
  });
}

// The Wiki: its live pages, for anyone (the public map's ℹ️ links here too);
// for admins, the drafts as well.
function wikiLoad_(req) {
  ensureSchema_();
  var account = req.token ? requireAccount_(req.token) : null;
  if (wikiRows_().some(function (p) { return p.state === 'Draft' && p.topic; }) || wikiSectionRows_().some(function (x) { return x.state === 'Draft' && x.topic; })) {
    forumLock_(function () { closeVotes_(); });
    withLock_(function () { wikiSync_(); });
  }
  return wikiView_(account);
}
function wikiView_(account) {
  var rows = wikiRows_(), topics = {};
  forumTopics_().forEach(function (t) { topics[t.id] = t; });
  var pages = rows.filter(function (p) { return p.state === 'Live'; }).map(function (p) { return { id: p.id, title: p.title, text: p.text, live: p.live, section: p.section, place: p.place }; });
  var secRows = wikiSectionRows_();
  var sections = secRows.filter(function (s) { return s.state === 'Live'; }).sort(function (a, b) { return a.place - b.place; }).map(function (s) { return { id: s.id, name: s.name, place: s.place }; });
  var out = { pages: pages, sections: sections, sources: wikiSources_(), admin: !!(account && account.rank) };
  if (out.admin) {
    out.drafts = rows.filter(function (p) { return p.state !== 'Live'; }).map(function (p) {
      var t = topics[p.topic];
      return { kind: 'page', id: p.id, title: p.title, of: p.of, state: p.state, topic: p.topic, vote: t ? t.state : '', drafted: p.drafted, section: p.section, place: p.place };
    }).concat(secRows.filter(function (s) { return s.state !== 'Live'; }).map(function (s) {
      var t = topics[s.topic];
      return { kind: 'section', id: s.id, title: s.name, of: s.of, state: s.state, topic: s.topic, vote: t ? t.state : '', drafted: s.drafted };
    })).sort(function (a, b) { return b.drafted - a.drafted; });
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
  // Its section and its place in it (S6-P9 round 2): the Forum's vote approves both.
  var sections = liveSections_();
  var sectionId = clean_(req.section, 10) || (page ? page.section : '');
  var section = sections.filter(function (s) { return s.id === sectionId; })[0];
  if (!section) throw new Error('Pick the section it goes in.');
  var place = Math.max(0, Math.floor(Number(req.place) || 0));
  var where = 'in the section "' + section.name + '", ' + (place ? 'at place ' + place : 'at the end');
  return withLock_(function () {
    var sheet = getDb_().getSheetByName(TABS.wiki.name), ids = wikiRows_().map(function (p) { return p.id; });
    var id = nextId_('W', ids);
    var topic = topicNew_(account, 'Decision', 'Wiki: ' + (page ? 'an edit to ' + page.title : 'a new page, ' + title),
      (page ? 'An edit to the Wiki page "' + page.title + '"' : 'A new Wiki page, "' + title + '"') + ', drafted as ' + id + ', ' + where + '. Once this vote passes, it goes live for players.\n\n' + title + '\n\n' + text,
      FORUM_STATES.Decision[0], '', 'wiki:' + id);
    var row = blankRow_(TABS.wiki);
    row[WIKI_COL.id - 1] = id; row[WIKI_COL.title - 1] = safeCell_(title); row[WIKI_COL.text - 1] = safeCell_(text); row[WIKI_COL.state - 1] = 'Draft';
    row[WIKI_COL.of - 1] = page ? page.id : ''; row[WIKI_COL.by - 1] = account.handle || account.email; row[WIKI_COL.drafted - 1] = new Date(); row[WIKI_COL.topic - 1] = topic;
    row[WIKI_COL.section - 1] = section.id; row[WIKI_COL.place - 1] = place || '';
    sheet.getRange(lastRowWith_(sheet, WIKI_COL.id) + 1, 1, 1, row.length).setValues([row]);
    var out = wikiView_(account);
    out.topic = topic;
    return out;
  });
}

// A section added, or one renamed (`of`), by any admin rank: a Forum
// Decision, like a page (S6-P9 round 2, |Q692 (a)).
function wikiSectionDraft_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!account.rank) throw new Error('Wiki sections are drafted by HABO\'s admins.');
  var name = clean_(req.name, WSEC_NAME_MAX);
  if (name.length < 2) throw new Error('Give the section a name.');
  var sections = liveSections_();
  var of = clean_(req.of, 10);
  var was = of ? sections.filter(function (s) { return s.id === of; })[0] : null;
  if (of && !was) throw new Error('That section isn\'t here any more.');
  if (sections.some(function (s) { return s.name.toLowerCase() === name.toLowerCase() && s !== was; })) throw new Error('There\'s a section called that already.');
  return withLock_(function () {
    var sheet = getDb_().getSheetByName(TABS.wikiSections.name);
    var id = nextId_('WS', wikiSectionRows_().map(function (s) { return s.id; }));
    var topic = topicNew_(account, 'Decision', 'Wiki: ' + (was ? 'rename the section "' + was.name + '" to "' + name + '"' : 'a new section, ' + name),
      (was ? 'The Wiki section "' + was.name + '" renamed "' + name + '"' : 'A new Wiki section, "' + name + '", after the others') + ', drafted as ' + id + '. Once this vote passes, it\'s on the Wiki for players.',
      FORUM_STATES.Decision[0], '', 'wiki:' + id);
    var row = blankRow_(TABS.wikiSections);
    row[WSEC_COL.id - 1] = id; row[WSEC_COL.name - 1] = safeCell_(name); row[WSEC_COL.state - 1] = 'Draft'; row[WSEC_COL.of - 1] = was ? was.id : '';
    row[WSEC_COL.by - 1] = account.handle || account.email; row[WSEC_COL.drafted - 1] = new Date(); row[WSEC_COL.topic - 1] = topic;
    sheet.getRange(lastRowWith_(sheet, WSEC_COL.id) + 1, 1, 1, row.length).setValues([row]);
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

// The six sections to start (S6-P9 round 2, |Q708 (a)), seeded once, with
// the first pages placed in them; a page with a section already keeps it.
var WIKI_SECTION_SEED = ['Getting started', 'Collecting', 'Measuring', 'The map', 'XP, levels and skills', 'For admins'];
var WIKI_SEED_PLACES = { W001: ['WS003', 2], W002: ['WS003', 1], W003: ['WS004', 1], W004: ['WS005', 2], W005: ['WS005', 1], W006: ['WS006', 1] };
function wikiSectionsOnce_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('WIKI_SECTIONS_SEEDED')) return;
  var ss = getDb_().getSheetByName(TABS.wikiSections.name), now = new Date();
  if (lastRowWith_(ss, WSEC_COL.id) < 2) {
    var rows = WIKI_SECTION_SEED.map(function (name, i) {
      var row = blankRow_(TABS.wikiSections);
      row[WSEC_COL.id - 1] = 'WS' + ('00' + (i + 1)).slice(-3); row[WSEC_COL.name - 1] = name; row[WSEC_COL.place - 1] = i + 1; row[WSEC_COL.state - 1] = 'Live';
      row[WSEC_COL.by - 1] = 'HABO'; row[WSEC_COL.drafted - 1] = now; row[WSEC_COL.live - 1] = now;
      return row;
    });
    ss.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  var sheet = getDb_().getSheetByName(TABS.wiki.name);
  wikiRows_().forEach(function (p) {
    var at = WIKI_SEED_PLACES[p.id];
    if (at && !p.section && p.state === 'Live') sheet.getRange(p.row, WIKI_COL.section, 1, 2).setValues([[at[0], at[1]]]);
  });
  props.setProperty('WIKI_SECTIONS_SEEDED', new Date().toISOString());
}

// Temporal confidence (S6-P34, |C963): a page of its own, linked from a
// square's pop-up. Added once, in Measuring, after the rate's page; never
// over a page of that title an admin has made.
var WIKI_CONFIDENCE_TITLE = 'Temporal confidence';
var WIKI_CONFIDENCE_TEXT = [
  'A segment\'s temporal confidence says how far to trust its accumulation rate right now: how many rates it has from recent days.',
  '',
  '- No recent rate: none in the window (60 days to start, a setting).',
  '- Low: 1 or 2 rates in the window.',
  '- Moderate: 3 to 5.',
  '- Established: 6 or more.',
  '',
  'The arrow compares that count with the count two weeks ago, over a window as long: ↑ more rates now, ↓ fewer, → the same.',
  '',
  'The window, the counts and the names are settings, in Admin Mode\'s Settings, Rates.'].join('\n');
// Why a walk gives a segment no rate (S6-P34, |Q782 and your addendum): the
// page the pop-up's greyed rows link to. Added once, like Temporal confidence.
var WIKI_NO_RATE_TITLE = 'Why a walk gives no rate';
var WIKI_NO_RATE_TEXT = ['A segment\'s rate is how fast litter comes back to it: the pounds collected, divided by its miles and by the days since it was last cleaned. Some walks collect a segment without giving it a rate. On a square\'s pop-up they\'re listed greyed, each with one of these reasons.',
  '',
  'Under 24 hours after the clock started: too little time for litter to come back and be measured. The pounds aren\'t lost: they go into the segment\'s next rate, which counts them over the whole time. The 24 hours is Shortest gap for a rate, in Admin Mode\'s Settings, Rates.',
  '',
  'It started the clock: the first collection of a segment, with no earlier one to measure from. The next collection gives its first rate.',
  '',
  'Rate Reset: more than the days in Segment due until after the clock started (Settings, Rates). After that long, the clock starts again from this walk.',
  '',
  'Not all its pounds were weighed inside the segment: a weighing crossed into another segment, so its pounds can\'t be split between them.',
  '',
  'A piece: walks that each collected part of the segment add up to one collection; the last piece holds the pounds and gives the rate.',
  '',
  'How the clock is timed: each walk counts at its last weighing. So a walk at the same time the next day can come a little under 24 hours after the last one, if it ends a little earlier.'].join('\n');
function wikiNoRateOnce_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('WIKI_NO_RATE')) return;
  var sheet = getDb_().getSheetByName(TABS.wiki.name);
  var have = readRows_(TABS.wiki, WIKI_COL);
  if (!have.some(function (r) { return String(r.get('title')).toLowerCase() === WIKI_NO_RATE_TITLE.toLowerCase(); })) {
    var now = new Date(), row = blankRow_(TABS.wiki);
    row[WIKI_COL.id - 1] = nextId_('W', have.map(function (r) { return r.get('id'); }));
    row[WIKI_COL.title - 1] = WIKI_NO_RATE_TITLE; row[WIKI_COL.text - 1] = WIKI_NO_RATE_TEXT; row[WIKI_COL.state - 1] = 'Live';
    row[WIKI_COL.by - 1] = 'HABO'; row[WIKI_COL.drafted - 1] = now; row[WIKI_COL.live - 1] = now;
    row[WIKI_COL.section - 1] = 'WS003'; row[WIKI_COL.place - 1] = 4;
    sheet.getRange(lastRowWith_(sheet, WIKI_COL.id) + 1, 1, 1, row.length).setValues([row]);
    forgetReads_();
  }
  props.setProperty('WIKI_NO_RATE', new Date().toISOString());
}
function wikiConfidenceOnce_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('WIKI_CONFIDENCE')) return;
  var sheet = getDb_().getSheetByName(TABS.wiki.name);
  var have = readRows_(TABS.wiki, WIKI_COL);
  if (!have.some(function (r) { return String(r.get('title')).toLowerCase() === WIKI_CONFIDENCE_TITLE.toLowerCase(); })) {
    var now = new Date(), row = blankRow_(TABS.wiki);
    row[WIKI_COL.id - 1] = nextId_('W', have.map(function (r) { return r.get('id'); }));
    row[WIKI_COL.title - 1] = WIKI_CONFIDENCE_TITLE; row[WIKI_COL.text - 1] = WIKI_CONFIDENCE_TEXT; row[WIKI_COL.state - 1] = 'Live';
    row[WIKI_COL.by - 1] = 'HABO'; row[WIKI_COL.drafted - 1] = now; row[WIKI_COL.live - 1] = now;
    row[WIKI_COL.section - 1] = 'WS003'; row[WIKI_COL.place - 1] = 3;
    sheet.getRange(lastRowWith_(sheet, WIKI_COL.id) + 1, 1, 1, row.length).setValues([row]);
    forgetReads_();
  }
  props.setProperty('WIKI_CONFIDENCE', new Date().toISOString());
}
