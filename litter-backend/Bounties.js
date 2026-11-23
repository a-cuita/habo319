/**
 * Bounties from businesses (S7-P11, |S6-U37 item 5, |Q171, |Q770 to |Q773,
 * |Q784, |Q786, |Q788, |M1138 to |M1141, |Q791, |Q792). For Jeremy's BNI talk on Dec 10.
 *
 * A sponsor is a player whose account has the Business/Organization flag:
 * they sign up like everyone (|Q788 (a)), ask for the flag at the foot of
 * Change my details with the business's name (|M1138), and an admin approves
 * it in Reviews (|Q784 (b)). A sponsor then sponsors a bounty from their
 * Sponsorship part of the top panel (|Q792): its name, segments picked from the
 * public ones, its dates, how many players can earn it, the reward (a line
 * they write), its bonus XP within Settings' least and most (|Q786 (b)), and
 * "Free for now" where a donation will go (|Q770). An admin approves each
 * bounty in Reviews before players see it (|Q171).
 *
 * A player earns it by collecting every one of its segments while it runs (each
 * mostly covered, the rate's share, by walks with their GPX track), up to its
 * number of players, first come (|Q772 (a)): its bonus XP, written to their XP
 * tab, and its reward (|Q771 (c)), handed out by HABO from the list in Admin Mode.
 *
 * A test bounty (Jeremy in chat, Nov 22, (a)), marked by an admin in Admin
 * Mode, like a test Quest: only admins see it, its sponsor can earn it too,
 * and it pays no XP. Real bounties keep the rule that a sponsor can't earn
 * their own.
 */
var BOUNTY_COL = { id: 1, account: 2, sponsor: 3, name: 4, segments: 5, from: 6, to: 7, players: 8, reward: 9, xp: 10, donation: 11, state: 12, made: 13, by: 14, decided: 15, note: 16, test: 17, finalPounds: 18, finalMiles: 19 };
var EARNED_COL = { bounty: 1, account: 2, earned: 3, xp: 4, reward: 5, handed: 6, handedBy: 7 };
var SETTING_BOUNTY_XP_MIN = 'Bounties: bonus XP at least';
var SETTING_BOUNTY_XP_MAX = 'Bounties: bonus XP at most';
var SPONSOR_ASKED = 'Asked', SPONSOR_YES = 'Yes', SPONSOR_NO = 'Declined';
var BOUNTY_DONATION = 'Free for now';

function bountiesAll_() {
  return readRows_(TABS.bounties, BOUNTY_COL).map(function (r) {
    var d = function (k) { var v = r.get(k); return v instanceof Date ? v.getTime() : 0; };
    return { row: r.row, id: String(r.get('id')).trim(), account: String(r.get('account')).trim(), sponsor: String(r.get('sponsor')), name: String(r.get('name')),
      segments: String(r.get('segments')).split(/[\s,]+/).filter(String), from: d('from'), to: d('to'), players: Math.max(1, Math.floor(Number(r.get('players')) || 1)),
      reward: String(r.get('reward')), xp: Number(r.get('xp')) || 0, donation: String(r.get('donation') || ''), state: String(r.get('state') || 'Waiting').trim(),
      made: d('made'), by: String(r.get('by') || ''), decided: d('decided'), note: String(r.get('note') || ''), test: /^\s*y/i.test(r.get('test')),
      finalPounds: String(r.get('finalPounds') == null ? '' : r.get('finalPounds')).trim(), finalMiles: String(r.get('finalMiles') == null ? '' : r.get('finalMiles')).trim() };
  }).filter(function (b) { return b.id; });
}
function bountyEarnedAll_() {
  return readRows_(TABS.bountyEarned, EARNED_COL).map(function (r) {
    var e = r.get('earned'), h = r.get('handed');
    return { row: r.row, bounty: String(r.get('bounty')).trim(), account: String(r.get('account')).trim(), earned: e instanceof Date ? e.getTime() : 0,
      xp: Number(r.get('xp')) || 0, reward: String(r.get('reward')), handed: h instanceof Date ? h.getTime() : 0, handedBy: String(r.get('handedBy') || '') };
  }).filter(function (x) { return x.bounty && x.account; });
}
// Running now: approved, between its dates (From's day from its start, To's day to its end).
function bountyLive_(b, at) { return b.state === 'Approved' && (!b.from || at >= b.from) && (!b.to || at < b.to + DAY_MS); }
function bountyXpRange_() {
  var lo = minutesSetting_(SETTING_BOUNTY_XP_MIN, 5), hi = minutesSetting_(SETTING_BOUNTY_XP_MAX, 50);
  return { min: Math.min(lo, hi), max: Math.max(lo, hi) };
}
function isSponsor_(account) { return account && account.sponsorState === SPONSOR_YES; }

/* ── Asking for the flag (items 1 to 3, 6) ── */

function sponsorAsk_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  var name = clean_(req.name, 80);
  if (!name) throw new Error('Give the business\'s or organization\'s name.');
  if (account.sponsorState === SPONSOR_YES) throw new Error('Your account has the Business/Organization flag already.');
  return withLock_(function () {
    setAccountCells_(account.row, { sponsorName: safeCell_(name), sponsorState: SPONSOR_ASKED });
    topicNew_(account, 'Report', 'Business/Organization account asked for: ' + name,
      (account.handle || account.id) + ' asks for a Business/Organization account, for ' + name + '.\nTo approve it: in Admin Mode, open Reviews.', 'New', 'Idea');
    forgetReads_();
    return { sponsorName: name, sponsorState: SPONSOR_ASKED };
  });
}

/* ── Sponsoring a bounty (item 4) ── */

function bountySave_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!isSponsor_(account)) throw new Error('Sponsoring a bounty is for an account with the Business/Organization flag.');
  var x = req.bounty || {};
  var name = clean_(x.name, 80), reward = clean_(x.reward, 200);
  if (!name) throw new Error('Give the bounty a name.');
  if (!reward) throw new Error('Say the reward, like "10% off a coffee".');
  var day = function (k, label) {
    var v = String(x[k] || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) throw new Error(label + ' is a date, like 2026-12-10.');
    return Utilities.parseDate(v + ' 00:00', Session.getScriptTimeZone(), 'yyyy-MM-dd HH:mm');
  };
  var from = day('from', 'From'), to = day('to', 'To');
  if (to.getTime() < from.getTime()) throw new Error('To comes after From.');
  var players = Number(x.players);
  if (!(players >= 1 && players <= 1000 && Math.floor(players) === players)) throw new Error('How many players can earn it: a whole number, 1 or more.');
  var r = bountyXpRange_(), xp = Number(x.xp);
  if (!(xp >= r.min && xp <= r.max)) throw new Error('Its bonus XP is from ' + r.min + ' to ' + r.max + '.');
  var accepted = {};
  segmentsAll_().forEach(function (g) { if (g.accepted) accepted[g.id] = true; });
  var segs = (Array.isArray(x.segments) ? x.segments : []).map(function (s) { return clean_(s, 20); }).filter(function (s, i, a) { return accepted[s] && a.indexOf(s) === i; });
  if (!segs.length) throw new Error('Pick its segments on the map: at least one public segment.');
  return withLock_(function () {
    var sheet = getDb_().getSheetByName(TABS.bounties.name), all = bountiesAll_();
    var id = clean_(x.id, 20), had = id ? all.filter(function (b) { return b.id === id && b.account === account.id; })[0] : null;
    if (id && !had) throw new Error('That bounty isn\'t here any more.');
    if (had && had.state === 'Approved') throw new Error('It\'s approved and running: ask an admin to change it.');
    var row = had ? sheet.getRange(had.row, 1, 1, TABS.bounties.header.length).getValues()[0] : blankRow_(TABS.bounties);
    var put = { account: account.id, sponsor: safeCell_(account.sponsorName), name: safeCell_(name), segments: segs.join(' '), from: from, to: to, players: players,
      reward: safeCell_(reward), xp: xp, donation: BOUNTY_DONATION, state: 'Waiting', made: new Date() };
    if (!had) put.id = nextId_('BT', all.map(function (b) { return b.id; }));
    Object.keys(put).forEach(function (k) { row[BOUNTY_COL[k] - 1] = put[k]; });
    sheet.getRange(had ? had.row : lastRowWith_(sheet, BOUNTY_COL.id) + 1, 1, 1, row.length).setValues([row]);
    if (!had) topicNew_(account, 'Report', 'A bounty to approve: ' + name, account.sponsorName + ' sponsors "' + name + '": ' + reward + ', +' + xp + ' XP, for ' + players + (players === 1 ? ' player' : ' players') + '.\nTo approve it: in Admin Mode, open Reviews.', 'New', 'Idea');
    forgetReads_();
    return sponsorView_(account);
  });
}

// The sponsor's own: each bounty, its state, and what came of it (item 5):
// pounds and miles on its segments in its dates, and how many earned it.
function sponsorView_(account) {
  var earned = bountyEarnedAll_(), now = Date.now();
  var list = bountiesAll_().filter(function (b) { return b.account === account.id; }).map(function (b) {
    var o = bountyOut_(b, now);
    // Over, its pounds and miles are kept on its row (S7-P3): its walks may be in the archive.
    var m = b.finalPounds !== '' ? { pounds: Number(b.finalPounds) || 0, miles: Number(b.finalMiles) || 0 } : bountyMeasure_(b);
    o.pounds = m.pounds; o.miles = m.miles;
    o.earnedBy = earned.filter(function (e) { return e.bounty === b.id; }).length;
    o.note = b.state === 'Declined' ? b.note : '';
    return o;
  }).sort(function (p, q) { return q.made - p.made; });
  return { bounties: list, xpRange: bountyXpRange_(), sponsorName: account.sponsorName, donation: BOUNTY_DONATION };
}
function sponsorLoad_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!isSponsor_(account)) throw new Error('This is for an account with the Business/Organization flag.');
  var out = sponsorView_(account);
  out.segments = segmentsAll_().filter(function (g) { return g.accepted && g.squares.length; }).map(function (g) { return { id: g.id, name: g.name, kind: g.kind, squares: g.squares, outline: g.outline || [] }; });
  return out;
}
// Pounds and miles on its segments while it runs: each weighing's, for its share of squares on them.
function bountyMeasure_(b) {
  var on = squaresOf_(b.segments), lb = 0, mi = 0, from = b.from || 0, to = b.to ? b.to + DAY_MS : Infinity;
  var ended = {};
  readRows_(TABS.collections).forEach(function (q) {
    if (q.get('simulated') === 'Yes' || q.get('status') !== 'Ended') return;
    var e = q.get('ended'), at = e instanceof Date ? e.getTime() : 0;
    if (at >= from && at < to) ended[q.get('id')] = true;
  });
  readRows_(TABS.stretches).forEach(function (r) {
    if (!ended[r.get('collection')] || r.get('discarded') === 'Yes') return;
    var cells = String(r.get('cells')).split(/\s+/).filter(String);
    if (!cells.length) return;
    var share = cells.filter(function (c) { return on[c]; }).length / cells.length;
    if (!share) return;
    lb += (Number(r.get('pounds')) || 0) * share;
    mi += (Number(r.get('streetMi')) || 0) * share;
  });
  return { pounds: round_(lb, 2), miles: round_(mi, 2) };
}
function bountyOut_(b, now, earned) {
  var n = earned ? earned.filter(function (e) { return e.bounty === b.id; }).length : null;
  var o = { id: b.id, name: b.name, sponsor: b.sponsor, segments: b.segments, from: b.from, to: b.to, players: b.players, reward: b.reward, xp: b.xp,
    donation: b.donation, state: b.state, live: bountyLive_(b, now), made: b.made, test: b.test };
  if (n != null) o.left = Math.max(0, b.players - n);
  return o;
}

/* ── What players see (items 8, 9) ── */

// Bounties running now, for The Priority Segment List and the map: each with
// how many can still earn it, and whether you've earned it.
function bountiesFor_(account) {
  var now = Date.now(), earned = bountyEarnedAll_();
  // A test bounty only for admins, like a test Quest.
  return bountiesAll_().filter(function (b) { return bountyLive_(b, now) && (!b.test || (account && account.rank)); }).map(function (b) {
    var o = bountyOut_(b, now, earned);
    o.mine = !!account && earned.some(function (e) { return e.bounty === b.id && e.account === account.id; });
    o.yours = !!account && b.account === account.id;
    return o;
  });
}

/* ── Earning (item 10): checked when a player's XP is settled ── */

// Each bounty this player has now collected all of, while it runs, with room
// left: written as earned, first come. Under the lock (xpSettle_'s).
function bountyCheck_(accountId) {
  // A sponsor can't earn their own, except a test bounty, which only admins see and earn.
  var me = readAccounts_().filter(function (a) { return a.id === accountId; })[0], admin = !!(me && me.rank);
  var now = Date.now(), all = bountiesAll_().filter(function (b) { return b.state === 'Approved' && (b.test ? admin : b.account !== accountId); });
  if (!all.length) return;
  var earned = bountyEarnedAll_();
  var open = all.filter(function (b) { return !earned.some(function (e) { return e.bounty === b.id && e.account === accountId; }) && earned.filter(function (e) { return e.bounty === b.id; }).length < b.players; });
  if (!open.length) return;
  // This player's walks with a GPX track, and each one's squares.
  var walks = {};
  readRows_(TABS.collections).forEach(function (q) {
    if (q.get('account') !== accountId || q.get('simulated') === 'Yes' || q.get('status') !== 'Ended' || !String(q.get('track')).trim()) return;
    var e = q.get('ended');
    walks[q.get('id')] = { at: e instanceof Date ? e.getTime() : 0, cells: {} };
  });
  readRows_(TABS.stretches).forEach(function (r) {
    var w = walks[r.get('collection')];
    if (!w || r.get('discarded') === 'Yes') return;
    String(r.get('cells')).split(/\s+/).filter(String).forEach(function (c) { w.cells[c] = true; });
  });
  var cover = segmentRules_().cover, segs = {};
  segmentsAll_().forEach(function (g) { segs[g.id] = g; });
  var sheet = getDb_().getSheetByName(TABS.bountyEarned.name), wrote = false;
  open.forEach(function (b) {
    var from = b.from || 0, to = b.to ? b.to + DAY_MS : Infinity, walked = {};
    Object.keys(walks).forEach(function (id) { var w = walks[id]; if (w.at >= from && w.at < to) Object.keys(w.cells).forEach(function (c) { walked[c] = true; }); });
    var all = b.segments.every(function (id) {
      var g = segs[id];
      return g && g.squares.length && g.squares.filter(function (c) { return walked[c]; }).length / g.squares.length >= cover;
    });
    if (!all) return;
    var row = blankRow_(TABS.bountyEarned);
    row[EARNED_COL.bounty - 1] = b.id; row[EARNED_COL.account - 1] = accountId; row[EARNED_COL.earned - 1] = new Date(Math.min(now, to - 1));
    row[EARNED_COL.xp - 1] = b.test ? 0 : b.xp; row[EARNED_COL.reward - 1] = safeCell_(b.reward);   // a test pays no XP
    sheet.getRange(lastRowWith_(sheet, EARNED_COL.bounty) + 1, 1, 1, row.length).setValues([row]);
    wrote = true;
  });
  if (wrote) forgetReads_();
}
// A bounty earned, told (S7-P11, |Q914 (a)): a line in Street Talk, like a
// Quest finished, and a notice on the walk's summary. A test bounty's line
// reaches admins only, as the bounty does.
function bountyAnnounceLines_(shown) {
  var bs = {};
  bountiesAll_().forEach(function (b) { bs[b.id] = b; });
  return bountyEarnedAll_().filter(function (e) { return bs[e.bounty] && e.earned; }).map(function (e) {
    var b = bs[e.bounty];
    return { at: e.earned, who: shown[e.account] || 'A volunteer', account: e.account, kind: 'bounty', adminOnly: !!b.test,
      text: 'earned ' + b.sponsor + '\'s bounty ' + b.name + (b.test ? ' (a test)' : '') + '!' };
  });
}
// The bounties this settle earned, for the walk's summary: the earned rows after `before`.
function bountiesNews_(accountId, before) {
  var bs = {};
  bountiesAll_().forEach(function (b) { bs[b.id] = b; });
  return bountyEarnedAll_().slice(before).filter(function (e) { return e.account === accountId && bs[e.bounty]; }).map(function (e) {
    var b = bs[e.bounty];
    return { name: b.name, sponsor: b.sponsor, reward: b.reward, xp: e.xp, test: !!b.test };
  });
}

// Its XP, for the XP tab: each bounty earned, with the XP it had then.
function bountyDues_(accountId) {
  var names = {};
  bountiesAll_().forEach(function (b) { names[b.id] = b; });
  return bountyEarnedAll_().filter(function (e) { return e.account === accountId; }).map(function (e) {
    var b = names[e.bounty] || {};
    return { key: 'bounty:' + e.bounty, kind: 'Bounty', xp: e.xp, at: e.earned, say: 'The bounty "' + (b.name || e.bounty) + '" from ' + (b.sponsor || 'a sponsor') };
  });
}

/* ── Admin Mode: approving, and the rewards to hand out (items 6, 7) ── */

// Reviews: each sponsor asking, and each bounty waiting.
function bountyReviewItems_(handles) {
  var out = [];
  readAccounts_().forEach(function (a) {
    if (a.sponsorState === SPONSOR_ASKED) out.push({ id: 'SP-' + a.id, sponsorAsk: true, name: 'Business/Organization account: ' + a.sponsorName, by: handles[a.id] || a.id, open: true, state: 'New', squares: [], outline: [], moves: [] });
  });
  bountiesAll_().forEach(function (b) {
    if (b.state !== 'Waiting') return;
    out.push({ id: b.id, bounty: true, name: 'Bounty: ' + b.name, by: handles[b.account] || b.account, sponsor: b.sponsor, reward: b.reward, xpIf: b.xp, players: b.players,
      from: b.from, to: b.to, segments: b.segments, open: true, state: 'New', proposed: b.made, squares: squaresList_(b.segments), outline: [], moves: [] });
  });
  return out;
}
function squaresList_(ids) { return Object.keys(squaresOf_(ids)); }
function bountyDecide_(account, id, approve, note) {
  if (!account.rank) throw new Error('Approving is for HABO\'s admins.');
  return withLock_(function () {
    if (/^SP-/.test(id)) {
      var a = readAccounts_().filter(function (x) { return 'SP-' + x.id === id; })[0];
      if (!a || a.sponsorState !== SPONSOR_ASKED) throw new Error('That isn\'t waiting any more. Reload the screen.');
      setAccountCells_(a.row, { sponsorState: approve ? SPONSOR_YES : SPONSOR_NO });
      logChange_(account.email, 'Sponsor', a.id, 'Flag', SPONSOR_ASKED, approve ? SPONSOR_YES : SPONSOR_NO);
    } else {
      var b = bountiesAll_().filter(function (x) { return x.id === id; })[0];
      if (!b || b.state !== 'Waiting') throw new Error('That bounty isn\'t waiting any more. Reload the screen.');
      var sheet = getDb_().getSheetByName(TABS.bounties.name);
      sheet.getRange(b.row, BOUNTY_COL.state).setValue(approve ? 'Approved' : 'Declined');
      sheet.getRange(b.row, BOUNTY_COL.by, 1, 3).setValues([[account.handle || account.email, new Date(), safeCell_(clean_(note, 500))]]);
      logChange_(account.email, 'Bounty', b.id, 'State', 'Waiting', approve ? 'Approved' : 'Declined');
    }
    forgetReads_();
    return reviewsView_(account);
  });
}
// Who earned which reward, for handing them out.
function bountyRewards_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!account.rank) throw new Error('This is for HABO\'s admins.');
  return bountyRewardsView_();
}
function bountyRewardsView_() {
  var handles = {}, names = {};
  readAccounts_().forEach(function (a) { handles[a.id] = a.handle; });
  bountiesAll_().forEach(function (b) { names[b.id] = b; });
  return { rewards: bountyEarnedAll_().map(function (e) {
    var b = names[e.bounty] || {};
    return { bounty: e.bounty, name: b.name || e.bounty, sponsor: b.sponsor || '', who: handles[e.account] || e.account, account: e.account, earned: e.earned, reward: e.reward, xp: e.xp, handed: e.handed, handedBy: e.handedBy, test: !!b.test };
  }).sort(function (p, q) { return (p.handed ? 1 : 0) - (q.handed ? 1 : 0) || q.earned - p.earned; }) };
}
function bountyHanded_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!account.rank) throw new Error('This is for HABO\'s admins.');
  return withLock_(function () {
    var e = bountyEarnedAll_().filter(function (x) { return x.bounty === String(req.bounty) && x.account === String(req.account); })[0];
    if (!e) throw new Error('That reward isn\'t here any more.');
    getDb_().getSheetByName(TABS.bountyEarned.name).getRange(e.row, EARNED_COL.handed, 1, 2).setValues([[req.undo ? '' : new Date(), req.undo ? '' : account.handle || account.email]]);
    forgetReads_();
    return bountyRewardsView_();
  });
}
// An admin marks a bounty a test, or not (Jeremy in chat, Nov 22, (a)).
function bountyTest_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  if (!account.rank) throw new Error('Marking a bounty a test is for HABO\'s admins.');
  return withLock_(function () {
    var b = bountiesAll_().filter(function (x) { return x.id === clean_(req.bountyId, 20); })[0];
    if (!b) throw new Error('That bounty isn\'t here any more.');
    var test = !!req.test;
    getDb_().getSheetByName(TABS.bounties.name).getRange(b.row, BOUNTY_COL.test).setValue(test ? 'Yes' : '');
    logChange_(account.email, 'Bounty', b.id, 'A test', b.test ? 'Yes' : '', test ? 'Yes' : '');
    forgetReads_();
    return isSponsor_(account) ? sponsorView_(account) : { bounties: [] };
  });
}
