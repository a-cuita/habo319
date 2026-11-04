/**
 * The first quest (S5-P20, Q579 to Q581, Nov 3): a new player's way from
 * setting up an account to the first collection, as six steps the page ticks
 * as they're done, on the main page until they all are.
 *   1. Set up your account (done at sign-up, so it's always ticked).
 *   2. The safety rules: the waiver's, one screen at a time.
 *   3. Your gear: gloves, bags, a vest, a scale and a grabber (|C717).
 *   4. Your GPX recorder: a practice recording, read on the phone.
 *   5. The litter pulse, on a practice screen with nothing saved (Q581 (a)).
 *   6. Choose your plan.
 * XP: 1 for each step and 5 more for finishing (Q579 (a)), from the Settings
 * tab. Start collecting waits until every step is ticked (Q580 (a)), for an
 * account with no collection yet; one that collected before the quest
 * existed isn't stopped, and can do it for the XP (Q596 (a)).
 *
 * Round 2 (|C719, |C722): each player's quest is a row in the Quests tab:
 * when it started (sign-up, or the first step ticked by an account from
 * before), the steps ticked, when it finished, and the XP it gave. Your
 * quests, in the top panel, lists them. The Accounts tab's First quest
 * columns were copied here once and are no longer used.
 */

var QUEST_STEPS = 6;
var FIRST_QUEST = 'First quest';
var SETTING_QUEST_STEP_XP = 'XP for each first quest step';
var SETTING_QUEST_DONE_XP = 'XP for finishing the first quest';
var QUEST_COL = { account: 1, quest: 2, started: 3, steps: 4, finished: 5, xp: 6, updated: 7 };

// The account's row for a quest, or null.
function questRow_(accountId, quest) {
  var sheet = getDb_().getSheetByName(TABS.quests.name);
  var last = lastRowWith_(sheet, QUEST_COL.account);
  if (last < 2) return null;
  var rows = sheet.getRange(2, 1, last - 1, TABS.quests.header.length).getValues();
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === accountId && String(rows[i][1]).trim() === (quest || FIRST_QUEST)) {
      var r = rows[i];
      return { row: i + 2, steps: String(r[QUEST_COL.steps - 1]), started: r[QUEST_COL.started - 1], finished: r[QUEST_COL.finished - 1] };
    }
  }
  return null;
}

// The steps ticked, in order. Step 1 is the account itself.
function stepsOf_(text) {
  var done = [1];
  String(text || '').split(/[\s,;]+/).forEach(function (x) {
    var n = Number(x);
    if (n >= 2 && n <= QUEST_STEPS && Math.floor(n) === n && done.indexOf(n) === -1) done.push(n);
  });
  return done.sort(function (a, b) { return a - b; });
}

function questXpOf_(steps) {
  return steps.length * minutesSetting_(SETTING_QUEST_STEP_XP, 1) + (steps.length === QUEST_STEPS ? minutesSetting_(SETTING_QUEST_DONE_XP, 5) : 0);
}

function questXp_(account) {
  var q = questRow_(account.id);
  return questXpOf_(stepsOf_(q ? q.steps : ''));
}

function msOf_(v) { return v instanceof Date ? v.getTime() : null; }

// What the page gets: whose it is, the steps ticked, whether it's done,
// whether Start collecting waits for it, its XP, and when it started and
// finished.
function questView_(account) {
  var q = questRow_(account.id);
  var steps = stepsOf_(q ? q.steps : '');
  var done = steps.length === QUEST_STEPS;
  return { account: account.id, name: FIRST_QUEST, steps: steps, done: done, needed: !done && countedCollections_(account.id) === 0, xp: questXpOf_(steps),
    stepXp: minutesSetting_(SETTING_QUEST_STEP_XP, 1), doneXp: minutesSetting_(SETTING_QUEST_DONE_XP, 5),
    started: q ? msOf_(q.started) : null, finished: q ? msOf_(q.finished) : null };
}

// A new account's quest starts at sign-up, with step 1. Call while holding the lock.
function questStart_(accountId, now) {
  if (questRow_(accountId)) return;
  var sheet = getDb_().getSheetByName(TABS.quests.name);
  var row = [];
  row[QUEST_COL.account - 1] = accountId; row[QUEST_COL.quest - 1] = FIRST_QUEST; row[QUEST_COL.started - 1] = now;
  row[QUEST_COL.steps - 1] = '1'; row[QUEST_COL.finished - 1] = ''; row[QUEST_COL.xp - 1] = questXpOf_([1]); row[QUEST_COL.updated - 1] = now;
  sheet.getRange(lastRowWith_(sheet, QUEST_COL.account) + 1, 1, 1, row.length).setValues([row]);
}

// A step ticked on the page (2 to 6). Ticking one again changes nothing.
function questTick_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  requireCurrentWaiver_(account);
  var step = Number(req.step);
  if (!(step >= 2 && step <= QUEST_STEPS && Math.floor(step) === step)) throw new Error('That isn\'t a step of the first quest.');
  var finished = withLock_(function () {
    var now = new Date();
    questStart_(account.id, now);
    var q = questRow_(account.id);
    var steps = stepsOf_(q.steps);
    if (steps.indexOf(step) !== -1) return false;
    var before = steps.join(' ');
    steps.push(step);
    steps.sort(function (a, b) { return a - b; });
    var done = steps.length === QUEST_STEPS;
    var sheet = getDb_().getSheetByName(TABS.quests.name);
    sheet.getRange(q.row, QUEST_COL.steps).setNumberFormat('@').setValue(steps.join(' '));
    sheet.getRange(q.row, QUEST_COL.xp).setValue(questXpOf_(steps));
    sheet.getRange(q.row, QUEST_COL.updated).setValue(now);
    if (done && !(q.finished instanceof Date)) sheet.getRange(q.row, QUEST_COL.finished).setValue(now);
    logChange_(account.first + ' ' + account.last, 'Quest', account.id + ' ' + account.handle, FIRST_QUEST, before, steps.join(' '));
    return done;
  });
  return { quest: questView_(account), xp: xpOf_(account.id), finished: finished };
}

// Once (|C722): each account's First quest columns copied to the Quests tab.
// It started when its first step after the account was ticked (the Changes
// tab), and finished as the Accounts tab says. Nothing is cleared.
function questsOnce_() {
  var props = PropertiesService.getScriptProperties();
  if (props.getProperty('QUESTS_TAB')) return;
  var firstTick = {};
  readRows_(TABS.changes).forEach(function (q) {
    if (q.values[2] !== 'Quest') return;
    var id = String(q.values[3]).split(' ')[0], at = q.values[0];
    if (at instanceof Date && (!firstTick[id] || at < firstTick[id])) firstTick[id] = at;
  });
  var sheet = getDb_().getSheetByName(TABS.accounts.name);
  var last = lastRowWith_(sheet, ACCOUNT_COL.id);
  var rows = last < 2 ? [] : sheet.getRange(2, 1, last - 1, TABS.accounts.header.length).getValues();
  rows.forEach(function (r) {
    var id = String(r[ACCOUNT_COL.id - 1]).trim(), ticked = String(r[ACCOUNT_COL.quest - 1] || '').trim();
    if (!id || !ticked) return;
    var steps = stepsOf_(ticked), fin = r[ACCOUNT_COL.questDone - 1];
    var q = getDb_().getSheetByName(TABS.quests.name);
    var have = questRow_(id);
    if (have) {
      // A row already there: the steps from both, and the finish time if it has none.
      var both = stepsOf_(have.steps + ' ' + ticked);
      q.getRange(have.row, QUEST_COL.steps).setNumberFormat('@').setValue(both.join(' '));
      q.getRange(have.row, QUEST_COL.xp).setValue(questXpOf_(both));
      if (!(have.finished instanceof Date) && fin instanceof Date && both.length === QUEST_STEPS) q.getRange(have.row, QUEST_COL.finished).setValue(fin);
      if (firstTick[id] && have.started instanceof Date && firstTick[id] < have.started) q.getRange(have.row, QUEST_COL.started).setValue(firstTick[id]);
      return;
    }
    var row = [];
    row[QUEST_COL.account - 1] = id; row[QUEST_COL.quest - 1] = FIRST_QUEST; row[QUEST_COL.started - 1] = firstTick[id] || (fin instanceof Date ? fin : new Date());
    row[QUEST_COL.steps - 1] = steps.join(' '); row[QUEST_COL.finished - 1] = fin instanceof Date ? fin : ''; row[QUEST_COL.xp - 1] = questXpOf_(steps); row[QUEST_COL.updated - 1] = new Date();
    q.getRange(lastRowWith_(q, QUEST_COL.account) + 1, 1, 1, row.length).setValues([row]);
  });
  props.setProperty('QUESTS_TAB', new Date().toISOString());
}
