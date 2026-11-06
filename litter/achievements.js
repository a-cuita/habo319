// Streaks and achievements (S6-P6, |Q647 (a), |Q648, |M861, |Q663 (a)).
// The weekly streak shows by your handle. The moment you earn a badge, or
// your streak grows, a card says so, with Share, on the main page and on the
// walk's summary (|Q647's addendum). Badges, from the top panel: your streak
// and every achievement, earned or not yet, each earned one shareable. In
// Admin Mode, Achievements: a Builder or above adds, changes and retires them.
window.LitterAchievements = function (app) {
  'use strict';
  var $ = app.$, S = window.LitterShare;
  var news = [], admin = null, editing = null;
  var TOLD = 'habo-litter-streak-told';

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function day(ms) { return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }); }
  function weeks(n) { return n + (n === 1 ? ' week' : ' weeks'); }
  function me() { return (app.me && app.me()) || {}; }
  function told() { try { return localStorage.getItem(TOLD) || ''; } catch (e) { return ''; } }
  function tell(w) { try { localStorage.setItem(TOLD, w); } catch (e) {} }

  // A Share (or Download picture) button for a badge or the streak.
  function shareButton(pic) {
    var b = el('button', 'btn btn-secondary lt-ach-share', S.label());
    b.type = 'button';
    b.addEventListener('click', function () {
      var was = b.textContent;
      b.disabled = true; b.textContent = 'Making the picture…';
      var p = pic();
      p.handle = me().handle || '';
      p.level = app.levelNow ? app.levelNow() : null;
      S.badgePicture(p).then(function (r) { b.disabled = false; b.textContent = r === 'downloaded' ? 'Downloaded' : was; }, function (err) {
        b.disabled = false; b.textContent = was; app.notice(err.message || 'The picture couldn\'t be made.');
      });
    });
    return b;
  }
  function badgePic(a) { return function () { return { badge: a.badge, title: a.name, line: a.says, when: a.earned }; }; }
  function streakPic(st) { return function () { return { badge: '🔥', title: 'Weekly streak: ' + weeks(st.weeks), line: 'At least one litter walk every week, ' + weeks(st.weeks) + ' in a row.', when: Date.now() }; }; }

  /* ── By your handle, and the moment it happens ── */

  function paintStreak(st) {
    var e = $('me-streak');
    if (!st || !st.weeks) { e.hidden = true; return; }
    e.hidden = false;
    e.textContent = '🔥' + st.weeks;
    e.title = 'Weekly streak: ' + weeks(st.weeks) + ' in a row with a walk';
    e.setAttribute('aria-label', e.title);
  }

  // From the main page's load, a walk ended, its track saved, a weighing fixed.
  function onEarned(d) {
    if (!d) return;
    if (d.streak) paintStreak(d.streak);
    var fresh = (d.earned || []).map(function (a) { return { badge: a }; });
    var st = d.streak;
    if (st && st.thisWeek && st.weeks > 0 && told() !== st.week) { tell(st.week); fresh.push({ streak: st }); }
    if (!fresh.length) return;
    news = news.concat(fresh);
    drawNews();
  }
  function drawNews() {
    ['ach-news', 'sm-badges'].forEach(function (id) {
      var box = $(id);
      box.textContent = '';
      box.hidden = !news.length;
      if (!news.length) return;
      var close = el('button', 'lt-sheet-close lt-ach-close', '×');
      close.type = 'button';
      close.setAttribute('aria-label', 'Close');
      close.addEventListener('click', function () { news = []; drawNews(); });
      box.appendChild(close);
      news.forEach(function (n) {
        var item = el('div', 'lt-ach-new');
        if (n.badge) {
          item.appendChild(el('div', 'lt-ach-badge', n.badge.badge));
          item.appendChild(el('p', 'lt-col-head', 'New badge: ' + n.badge.name));
          item.appendChild(el('p', 'small', n.badge.says + ' +' + n.badge.xp + ' XP'));
          item.appendChild(shareButton(badgePic(n.badge)));
        } else {
          item.appendChild(el('div', 'lt-ach-badge', '🔥'));
          item.appendChild(el('p', 'lt-col-head', 'Weekly streak: ' + weeks(n.streak.weeks)));
          item.appendChild(el('p', 'small', n.streak.weeks === 1 ? 'A walk this week starts your streak. Walk next week to keep it going.' : 'A walk every week, ' + weeks(n.streak.weeks) + ' in a row.'));
          item.appendChild(shareButton(streakPic(n.streak)));
        }
        box.appendChild(item);
      });
    });
  }

  /* ── Your badges ── */

  function open() {
    if (app.closePanel) app.closePanel();
    app.show('v-badges');
    $('badges-note').textContent = 'Loading…';
    $('badges-streak').textContent = '';
    $('badges-list').textContent = '';
    return app.api('achievementsLoad', { token: app.myToken() }).then(function (d) {
      onEarned({ earned: d.earnedNow, streak: d.streak });
      drawMine(d);
    }, function (err) {
      if (err.code === 'signed-out') return app.signedOut();
      $('badges-note').textContent = err.message;
    });
  }
  function unit(a) { return a.counts === 'Pounds' ? ' lb' : a.counts === 'Miles' ? ' mi' : ''; }
  function drawMine(d) {
    var list = d.achievements || [], got = list.filter(function (a) { return a.earned; }), not = list.filter(function (a) { return !a.earned; });
    $('badges-note').textContent = got.length + ' of ' + list.length + ' earned. Each earns its XP once.';
    var st = d.streak || { weeks: 0, best: 0 }, box = $('badges-streak');
    box.textContent = '';
    box.appendChild(el('div', 'lt-ach-badge', '🔥'));
    box.appendChild(el('p', 'lt-col-head', st.weeks ? 'Weekly streak: ' + weeks(st.weeks) : 'No streak yet'));
    box.appendChild(el('p', 'small', st.weeks ? (st.thisWeek ? 'You\'ve walked this week.' : 'Walk this week to keep it going.') + (st.best > st.weeks ? ' Your best: ' + weeks(st.best) + '.' : '')
      : 'A walk this week starts one: at least one walk every week keeps it going.'));
    if (st.weeks) box.appendChild(shareButton(streakPic(st)));
    var out = $('badges-list');
    out.textContent = '';
    [['Earned', got], ['Not yet', not]].forEach(function (g) {
      if (!g[1].length) return;
      var sec = el('section', 'card');
      sec.appendChild(el('h2', null, g[0]));
      g[1].forEach(function (a) {
        var row = el('div', 'lt-ach-item' + (a.earned ? '' : ' lt-locked'));
        row.id = 'ach-' + a.id;
        row.appendChild(el('div', 'lt-ach-badge', a.badge));
        var words = el('div', 'lt-ach-words');
        words.appendChild(el('p', 'lt-col-head', a.name));
        words.appendChild(el('p', 'small', a.says));
        if (a.earned) {
          words.appendChild(el('p', 'small muted', 'Earned ' + day(a.earned) + ' · +' + a.xp + ' XP'));
          words.appendChild(shareButton(badgePic(a)));
        } else {
          var have = a.have || 0;
          words.appendChild(el('p', 'small muted', have + ' of ' + a.reach + unit(a) + ' · +' + a.xp + ' XP'));
          var bar = el('div', 'lt-ach-bar'), fill = el('div', 'lt-ach-fill');
          fill.style.width = Math.max(0, Math.min(100, have / a.reach * 100)) + '%';
          bar.appendChild(fill);
          words.appendChild(bar);
        }
        row.appendChild(words);
        sec.appendChild(row);
      });
      out.appendChild(sec);
    });
  }

  /* ── Admin Mode: Achievements (|M861, |Q663 (a)) ── */

  function openAdmin() {
    if (app.closePanel) app.closePanel();
    app.show('v-ach-admin');
    $('aa-form').hidden = true;
    $('aa-note').textContent = 'Loading…';
    return app.api('achievementsAdmin', { token: app.myToken() }).then(useAdmin, function (err) {
      if (err.code === 'signed-out') return app.signedOut();
      $('aa-note').textContent = err.message;
    });
  }
  function useAdmin(d) {
    admin = d;
    if (!$('aa-counts').options.length) {
      d.kinds.forEach(function (k) { var o = el('option', null, k); o.value = k; $('aa-counts').appendChild(o); });
    }
    $('aa-note').textContent = d.canBuild ? 'Each counts something the app already records. A badge already earned stays earned, with its XP, if one is changed or retired.'
      : 'A Builder or above adds, changes and retires achievements.';
    $('aa-add').hidden = !d.canBuild;
    var list = $('aa-list');
    list.textContent = '';
    d.achievements.forEach(function (a) {
      var row = el('section', 'card lt-ach-item' + (a.state === 'Retired' ? ' lt-locked' : ''));
      row.id = 'aa-' + a.id;
      row.appendChild(el('div', 'lt-ach-badge', a.badge));
      var words = el('div', 'lt-ach-words');
      words.appendChild(el('p', 'lt-col-head', a.name + (a.state === 'Retired' ? ' · Retired' : '')));
      words.appendChild(el('p', 'small', a.says + ' +' + a.xp + ' XP'));
      words.appendChild(el('p', 'small muted', 'Counts: ' + a.counts + ' · earned by ' + a.earnedBy));
      if (d.canBuild) {
        var ch = el('button', 'btn btn-secondary', 'Change');
        ch.type = 'button';
        ch.addEventListener('click', function () { edit(a); });
        var rt = el('button', 'btn btn-secondary', a.state === 'Retired' ? 'Open again' : 'Retire');
        rt.type = 'button';
        rt.addEventListener('click', function () {
          rt.disabled = true;
          app.api('achievementRetire', { token: app.myToken(), achievementId: a.id }).then(useAdmin, function (err) { rt.disabled = false; app.notice(err.message); });
        });
        words.appendChild(ch);
        words.appendChild(rt);
      }
      row.appendChild(words);
      list.appendChild(row);
    });
  }
  function minutesBox() {
    var label = admin && admin.minutes[$('aa-counts').value];
    $('aa-minutes-box').hidden = !label;
    if (label) $('aa-minutes-label').textContent = 'Minutes: ' + label;
  }
  function edit(a) {
    editing = a || null;
    $('aa-form').hidden = false;
    $('aa-form-title').textContent = a ? 'Change ' + a.name : 'Add an achievement';
    $('aa-name').value = a ? a.name : '';
    $('aa-badge').value = a ? a.badge : '';
    $('aa-counts').value = a ? a.counts : admin.kinds[0];
    $('aa-reach').value = a ? a.reach : '';
    $('aa-minutes').value = a && a.minutes ? a.minutes : 60;
    $('aa-xp').value = a ? a.xp : '';
    $('aa-err').textContent = '';
    minutesBox();
    $('aa-form').scrollIntoView({ block: 'start' });
    $('aa-name').focus();
  }
  function save() {
    return app.busy($('aa-save'), 'aa-err', function () {
      return app.api('achievementSave', { token: app.myToken(), achievement: { id: editing ? editing.id : '', name: $('aa-name').value, badge: $('aa-badge').value,
        counts: $('aa-counts').value, reach: $('aa-reach').value, minutes: $('aa-minutes').value, xp: $('aa-xp').value } }).then(function (d) {
        $('aa-form').hidden = true;
        editing = null;
        useAdmin(d);
      });
    });
  }

  function sync() { $('me-go-achievements').hidden = !$('cl-sim').checked; }

  $('cl-sim').addEventListener('change', sync);
  $('me-go-badges').addEventListener('click', open);
  $('badges-back').addEventListener('click', function () { if (app.back) app.back(); });
  $('me-go-achievements').addEventListener('click', openAdmin);
  $('aa-back').addEventListener('click', function () { if (app.back) app.back(); });
  $('aa-add').addEventListener('click', function () { edit(null); });
  $('aa-counts').addEventListener('change', minutesBox);
  $('aa-save').addEventListener('click', save);
  $('aa-cancel').addEventListener('click', function () { $('aa-form').hidden = true; editing = null; });

  return { onEarned: onEarned, open: open, openAdmin: openAdmin, sync: sync, paintStreak: paintStreak };
};
