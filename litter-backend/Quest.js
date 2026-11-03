/**
 * The first quest (S5-P20, Q579 to Q581, Nov 3): a new player's way from
 * setting up an account to the first collection, as six steps the page ticks
 * as they're done, on the main page until they all are.
 *   1. Set up your account (done at sign-up, so it's always ticked).
 *   2. The safety rules: the waiver's, one screen at a time.
 *   3. Your gear: gloves, bags, a vest and a scale (a grabber if you have one).
 *   4. Your GPX recorder: a practice recording, read on the phone.
 *   5. The litter pulse, on a practice screen with nothing saved (Q581 (a)).
 *   6. Choose your plan.
 * XP: 1 for each step and 5 more for finishing (Q579 (a)), from the Settings
 * tab. Start collecting waits until every step is ticked (Q580 (a)), for an
 * account with no collection yet; one that collected before the quest
 * existed isn't stopped, and can do it for the XP.
 * The steps ticked are kept on the account, in First quest; the time the
 * last one was ticked in First quest finished.
 */

var QUEST_STEPS = 6;
var SETTING_QUEST_STEP_XP = 'XP for each first quest step';
var SETTING_QUEST_DONE_XP = 'XP for finishing the first quest';

// The steps ticked, in order. Step 1 is the account itself.
function questSteps_(account) {
  var done = [1];
  String(account.quest || '').split(/[\s,;]+/).forEach(function (x) {
    var n = Number(x);
    if (n >= 2 && n <= QUEST_STEPS && Math.floor(n) === n && done.indexOf(n) === -1) done.push(n);
  });
  return done.sort(function (a, b) { return a - b; });
}

function questXp_(account) {
  var steps = questSteps_(account);
  return steps.length * minutesSetting_(SETTING_QUEST_STEP_XP, 1) + (steps.length === QUEST_STEPS ? minutesSetting_(SETTING_QUEST_DONE_XP, 5) : 0);
}

// What the page gets: the steps ticked, whether it's done, and whether Start
// collecting waits for it.
function questView_(account) {
  var steps = questSteps_(account);
  var done = steps.length === QUEST_STEPS;
  return { steps: steps, done: done, needed: !done && countedCollections_(account.id) === 0, xp: questXp_(account),
    stepXp: minutesSetting_(SETTING_QUEST_STEP_XP, 1), doneXp: minutesSetting_(SETTING_QUEST_DONE_XP, 5) };
}

// A step ticked on the page (2 to 6). Ticking one again changes nothing.
function questTick_(req) {
  ensureSchema_();
  var account = requireAccount_(req.token);
  requireCurrentWaiver_(account);
  var step = Number(req.step);
  if (!(step >= 2 && step <= QUEST_STEPS && Math.floor(step) === step)) throw new Error('That isn\'t a step of the first quest.');
  var finished = withLock_(function () {
    var now = readAccounts_().filter(function (a) { return a.id === account.id; })[0];
    var steps = questSteps_(now);
    if (steps.indexOf(step) !== -1) return false;
    var before = steps.filter(function (n) { return n > 1; }).join(' ');
    steps.push(step);
    steps.sort(function (a, b) { return a - b; });
    var after = steps.filter(function (n) { return n > 1; }).join(' ');
    var sheet = getDb_().getSheetByName(TABS.accounts.name);
    sheet.getRange(now.row, ACCOUNT_COL.quest).setNumberFormat('@').setValue(after);
    var done = steps.length === QUEST_STEPS;
    if (done && !now.questDone) sheet.getRange(now.row, ACCOUNT_COL.questDone).setValue(new Date());
    logChange_(now.first + ' ' + now.last, 'Quest', now.id + ' ' + now.handle, 'First quest', before, after);
    return done;
  });
  var fresh = readAccounts_().filter(function (a) { return a.id === account.id; })[0];
  return { quest: questView_(fresh), xp: xpOf_(account.id), finished: finished };
}
