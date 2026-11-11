/**
 * The rolling history (S6-P3 item 3, |Q705 (a), |Q706, |Q707, |Q712 (a),
 * |Q713 (a)): a scroll like MORDORMUD.net's, starting with what the app has.
 * Public lines start with the player's name as the public map shows it, like
 * a chat room: "bio.browning has gained a level! ---> Level 3!". Your own
 * lines have no name: each XP you earned, with what earned it, and each walk's
 * summary as it ended. Nothing new is kept for it: every line is worked out
 * from the walks, weighings, reviews, Challenges, badges and the first quest
 * as they are now, so a fix or a discard changes it, as it changes your XP.
 * Commands typed at its prompt print their answers in it: help, xp history,
 * level, walks and due.
 */

var SCROLL_LINES = 150;
var SCROLL_COMMANDS = [
  ['help', 'these commands'],
  ['xp history', 'each XP you\'ve earned, newest first'],
  ['level', 'your level, and the XP to the next'],
  ['walks', 'your last walks, a line each'],
  ['due', 'segments due now, from The Priority Segment List, with their bonus']
];

// Each player's XP, piece by piece, with when and what earned it, counted
// as xpOf_ counts it. { accountId: [{ at, xp, say, walk }] }
function xpEventsAll_() {
  var out = {};
  var add = function (acc, at, xp, say, walk) { if (xp) (out[acc] = out[acc] || []).push({ at: at, xp: round_(xp, 2), say: say, walk: walk || '' }); };
  var ms = function (v) { return v instanceof Date ? v.getTime() : 0; };
  var x = xpSettings_(), bonus = walkBonuses_(), cols = {};
  // Walks: planning each, once its GPX track is saved (Jeremy, Oct 29).
  readRows_(TABS.collections).forEach(function (q) {
    if (!String(q.get('track')).trim() || q.get('simulated') === 'Yes') return;
    var id = q.get('id'), at = ms(q.get('ended')) || ms(q.get('started'));
    cols[id] = { account: q.get('account'), at: at, ended: q.get('status') === 'Ended', sum: 0 };
    add(q.get('account'), at, Number(q.get('xp')) || 0, 'planning walk ' + id, id);
  });
  // Its weighings, once it's Ended: each rating, and each one's litter types.
  readRows_(TABS.stretches).forEach(function (r) {
    var c = cols[r.get('collection')];
    if (!c || !c.ended) return;
    var st = stretchOf_(r), all = stretchXp_(st, x);
    var types = st.discarded ? 0 : (st.types.length || st.pounds === 0 ? x.types : 0);
    add(c.account, c.at, all - types, 'weighing ' + st.n + ', your rating near its Litter Index', r.get('collection'));
    add(c.account, c.at, types, 'weighing ' + st.n + ', its litter types', r.get('collection'));
    c.sum += all;
  });
  // Its time bonus, or left-alone bonus.
  Object.keys(cols).forEach(function (id) {
    var c = cols[id], b = bonus[id];
    if (b && c.sum) add(c.account, c.at, c.sum * (b.mult - 1), (b.kind === 'alone' ? 'the left-alone bonus' : 'the time bonus') + ' (×' + b.mult + ') on walk ' + id, id);
  });
  // The first quest: its steps, and finishing it (S5-P20).
  var stepXp = minutesSetting_(SETTING_QUEST_STEP_XP, 1), doneXp = minutesSetting_(SETTING_QUEST_DONE_XP, 5);
  readRows_(TABS.quests, QUEST_COL).forEach(function (q) {
    if (q.get('quest') !== FIRST_QUEST) return;
    var steps = stepsOf_(q.get('steps')), started = ms(q.get('started')), finished = ms(q.get('finished'));
    add(q.get('account'), started, steps.length * stepXp, 'your first quest: ' + steps.length + (steps.length === 1 ? ' step' : ' steps'));
    if (steps.length === QUEST_STEPS) add(q.get('account'), finished || started, doneXp, 'your first quest, finished');
  });
  // Segments of yours made public, and ground you asked to add, approved in a review.
  var mine = {};
  segmentsAll_().forEach(function (g) { if (g.by && g.accepted) mine[g.id] = { account: g.by, say: 'your segment "' + g.name + '" made public' }; });
  additionsAll_().forEach(function (a) { if (a.by && a.state === 'Added') mine[a.id] = { account: a.by, say: 'your ground added to ' + a.segment }; });
  var given = {};
  reviewRows_().forEach(function (r) { if (mine[r.segment] && r.move === REVIEW_DECIDE.approve) given[r.segment] = r; });
  Object.keys(given).forEach(function (id) { add(mine[id].account, given[id].time, given[id].xp || 0, mine[id].say); });
  // Skills and Challenges (S6-P8): each item approved, and each goal's XP so far.
  var items = challengeItemsAll_(), names = {};
  toolSkillsAll_().forEach(function (s) { names[s.id] = s.name; });
  items.forEach(function (it) { if (it.state === 'Approved') add(it.account, it.sent, it.xp, (names[it.skill] || 'a skill') + ', sent and approved'); });
  var challenges = challengesAll_();
  if (challenges.length) {
    readAccounts_().forEach(function (a) {
      challenges.forEach(function (c) {
        var got = c.kind === 'Walk goal' ? walkGoal_(c, a.id) : skillGoal_(c, a.id, items);
        if (!got.xp) return;
        var at = Math.min(Date.now(), c.to ? c.to + DAY_MS - 1 : Date.now());
        (out[a.id] || []).forEach(function (e) { if (e.at >= (c.from || 0) && e.at <= at) at = Math.max(c.from || 0, e.at); });
        add(a.id, at, got.xp, 'the Challenge "' + c.name + '"');
      });
    });
  }
  // Badges (S6-P6).
  badgesAll_().forEach(function (b) { add(b.account, b.earned, b.xp, 'the badge "' + b.name + '"'); });
  Object.keys(out).forEach(function (k) { out[k].sort(function (a, b) { return a.at - b.at; }); });
  return out;
}

// Public lines: each level any player reached, when their XP reached it.
function levelLines_(events) {
  var ranges = levelRanges_(), lines = [];
  if (!ranges.length) return lines;
  var shown = {};
  readAccounts_().forEach(function (a) { shown[a.id] = a.shows === 'Name' ? (a.first + ' ' + a.last).trim() : a.shows === 'Neither' ? '' : a.handle; });
  Object.keys(events).forEach(function (acc) {
    var xp = 0, level = 0;
    events[acc].forEach(function (e) {
      xp += e.xp;
      var now = levelOf_(round_(xp, 2), ranges);
      for (var n = level + 1; n <= now; n++) lines.push({ at: e.at, who: shown[acc] || 'A volunteer', text: 'has gained a level! ---> Level ' + n + '!', account: acc, kind: 'level' });
      if (now > level) level = now;
    });
  });
  return lines;
}

// Your walks' summaries: pounds, miles, and each weighing's Litter Index.
function walkLines_(accountId) {
  var byWalk = {};
  readRows_(TABS.stretches).forEach(function (r) {
    if (r.get('discarded') === 'Yes') return;
    (byWalk[r.get('collection')] = byWalk[r.get('collection')] || []).push(stretchOf_(r));
  });
  return readRows_(TABS.collections).filter(function (q) {
    return q.get('account') === accountId && q.get('status') === 'Ended' && q.get('simulated') !== 'Yes';
  }).map(function (q) {
    var id = q.get('id'), e = q.get('ended'), sts = (byWalk[id] || []).sort(function (a, b) { return a.n - b.n; });
    var idx = sts.filter(function (s) { return s.index != null; }).map(function (s) { return round_(s.index, 1); });
    return { at: e instanceof Date ? e.getTime() : 0, mine: true, kind: 'walk', walk: id,
      text: 'Walk ' + id + ' ended: ' + round_(Number(q.get('pounds')) || 0, 2) + ' lb · ' + round_(Number(q.get('miles')) || 0, 2) + ' mi · '
        + sts.length + (sts.length === 1 ? ' weighing' : ' weighings') + (idx.length ? ' · Litter Index ' + idx.join(', ') : '') };
  });
}

// The scroll for one player: public lines and their own, oldest first, the newest SCROLL_LINES.
function scrollLines_(account) {
  var events = xpEventsAll_();
  var lines = levelLines_(events).map(function (l) { return { at: l.at, who: l.who, text: l.text, mine: l.account === account.id, kind: 'level' }; });
  lines = lines.concat(walkLines_(account.id));
  (events[account.id] || []).forEach(function (e, i) {
    lines.push({ at: e.at, mine: true, kind: 'xp', walk: e.walk, text: '+' + e.xp + ' XP: ' + e.say, seq: i });
  });
  // At the same moment: a walk's summary, then its XP, then any level it reached.
  var rank = { walk: 0, xp: 1, level: 2 };
  lines.sort(function (a, b) { return a.at - b.at || rank[a.kind] - rank[b.kind] || (a.seq || 0) - (b.seq || 0); });
  return { lines: lines.slice(-SCROLL_LINES).map(function (l) { return { at: l.at, who: l.who || '', text: l.text, mine: !!l.mine, kind: l.kind }; }), events: events[account.id] || [] };
}

function scrollWhen_(ms) { return Utilities.formatDate(new Date(ms), Session.getScriptTimeZone(), 'EEE, MMM d, h:mm a'); }

// A command typed at the prompt, and its answer, a line each.
function scrollCommand_(account, typed, got) {
  var c = String(typed || '').trim().toLowerCase().replace(/\s+/g, ' ');
  if (c === 'help' || c === '?') return ['Commands:'].concat(SCROLL_COMMANDS.map(function (x) { return '  ' + x[0] + ': ' + x[1]; }));
  if (c === 'xp history' || c === 'xp') {
    var ev = got.events.slice().reverse();
    if (!ev.length) return ['No XP yet. A walk with your GPX track saved earns your first.'];
    var total = round_(ev.reduce(function (t, e) { return t + e.xp; }, 0), 2);
    return ['Your XP, newest first (' + total + ' XP in all):'].concat(ev.slice(0, 100).map(function (e) { return '  +' + e.xp + ' XP · ' + scrollWhen_(e.at) + ' · ' + e.say; }))
      .concat(ev.length > 100 ? ['  …and ' + (ev.length - 100) + ' more before these.'] : []);
  }
  if (c === 'level') {
    var ranges = levelRanges_(), xp = xpOf_(account.id);
    if (!ranges.length) return ['Levels aren\'t set up yet. You have ' + xp + ' XP.'];
    var level = levelOf_(xp, ranges), need = 0;
    for (var n = 1; n <= level + 1 && n < 1000; n++) {
      var r = null, below = null;
      ranges.forEach(function (x) { if (x[0] <= n && (x[1] == null || n <= x[1])) r = x; if (x[0] <= n) below = x; });
      r = r || below;
      if (!r) { need = null; break; }
      need += r[2];
    }
    return ['Level ' + level + ', with ' + xp + ' XP.' + (need != null && need > xp ? ' ' + round_(need - xp, 2) + ' XP to Level ' + (level + 1) + '.' : '')];
  }
  if (c === 'walks') {
    var mult = walkMults_(), x = xpSettings_(), sts = {};
    readRows_(TABS.stretches).forEach(function (r) { (sts[r.get('collection')] = sts[r.get('collection')] || []).push(stretchOf_(r)); });
    var walks = readRows_(TABS.collections).filter(function (q) {
      return q.get('account') === account.id && q.get('simulated') !== 'Yes' && q.get('status') !== COLLECTION_DISCARDED && q.get('status') !== 'Collecting';
    }).sort(function (p, q) { return (q.get('started') instanceof Date ? q.get('started').getTime() : 0) - (p.get('started') instanceof Date ? p.get('started').getTime() : 0); }).slice(0, 10);
    if (!walks.length) return ['No walks yet. Press Start collecting on the main page for your first.'];
    return ['Your last ' + (walks.length === 1 ? 'walk' : walks.length + ' walks') + ', newest first:'].concat(walks.map(function (q) {
      var id = q.get('id'), counts = !!String(q.get('track')).trim();
      var xp = !counts ? 0 : round_((Number(q.get('xp')) || 0) + (q.get('status') === 'Ended' ? (sts[id] || []).reduce(function (t, s) { return t + stretchXp_(s, x); }, 0) * (mult[id] || 1) : 0), 2);
      return '  ' + id + ' · ' + scrollWhen_(q.get('started') instanceof Date ? q.get('started').getTime() : 0) + ' · ' + round_(Number(q.get('pounds')) || 0, 2) + ' lb · '
        + round_(Number(q.get('miles')) || 0, 2) + ' mi · ' + (counts ? '+' + xp + ' XP' : 'no XP until its GPX track is saved');
    }));
  }
  if (c === 'due') {
    var t = timeBonus_(), a = aloneBonus_(), segs = segmentSummaries_(false);
    var due = segs.filter(function (g) { return g.due; }).sort(function (p, q) { return p.left - q.left; });
    var alone = a.days > 0 && a.mult > 1 ? segs.filter(function (g) { return !g.due && (g.alone == null || g.alone >= a.days); }) : [];
    var out = [];
    if (due.length) {
      out.push('Due now, soonest first:');
      due.forEach(function (g) {
        var m = timeMult_(g.days, t);
        out.push('  ' + g.name + ' · ' + (g.left < 1 ? 'less than a day left' : round_(g.left, 1) + ' days left') + (m > 1 ? ' · ×' + m + ' XP now' : ''));
      });
    }
    if (alone.length) {
      out.push('Left alone, ×' + a.mult + ' XP now:');
      alone.slice(0, 15).forEach(function (g) { out.push('  ' + g.name + ' · ' + (g.alone == null ? 'never collected' : 'not collected in ' + Math.floor(g.alone) + ' days')); });
      if (alone.length > 15) out.push('  …and ' + (alone.length - 15) + ' more.');
    }
    return out.length ? out : ['Nothing\'s due right now.'];
  }
  return ['"' + String(typed).trim().slice(0, 40) + '" isn\'t a command. Type help for the commands.'];
}

// Called from the page: the scroll, and a command's answer when one was typed.
function scroll_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var got = scrollLines_(account);
  var out = { lines: got.lines };
  if (req.command != null && String(req.command).trim()) out.answer = scrollCommand_(account, req.command, got);
  return out;
}
