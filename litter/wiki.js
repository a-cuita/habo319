// The Wiki (S6-P9, |M862, |Q664 (a), |Q665 (a)): pages for everyone, from
// the top panel, each opening full screen with ←. In Admin Mode, any admin
// rank drafts a new page, or an edit to one; it goes to the Forum as a
// Decision, and once its vote passes it goes live for players (|Q664's
// addendum). The three ℹ️ (the map's, each segment's line, Admin Mode's)
// each also link to their page (|Q665 (a)).
//
// A page's text: a blank line between paragraphs; a line starting "- " is a
// point in a list; {{sources}} shows the Sources tab's sources.
window.LitterWiki = function (app) {
  'use strict';
  var $ = app.$;
  var data = null, page = null, editing = null, back = null, said = '';

  // The seeded pages the ℹ️ link to (wikiOnce_ on the backend).
  var PAGES = { rate: 'W001', map: 'W003', admin: 'W006' };

  function el(tag, cls, text) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function day(ms) { return ms ? new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }) : ''; }
  // Admin Mode on, for an admin: drafting shows.
  function admin() { var a = app.me && app.me(); return !!(a && a.rank && $('cl-sim').checked && data && data.admin); }

  function load() {
    return app.api('wikiLoad', { token: app.myToken() || '' }).then(function (d) { data = d; return d; });
  }
  function failed(err, box) {
    if (err.code === 'signed-out') return app.signedOut();
    $(box).textContent = err.message;
  }

  /* ── The list of pages ── */

  function open() {
    if (app.closePanel) app.closePanel();
    back = null;
    app.show('v-wiki');
    $('wiki-note').textContent = 'Loading…';
    $('wiki-list').textContent = '';
    return load().then(drawList, function (err) { failed(err, 'wiki-note'); });
  }
  function drawList() {
    app.show('v-wiki');
    var list = $('wiki-list');
    list.textContent = '';
    $('wiki-note').textContent = said || (data.pages.length ? 'How the litter page works, written by HABO\'s admins.' : 'No pages yet.');
    said = '';
    data.pages.forEach(function (p) {
      var b = el('button', 'btn btn-secondary lt-wiki-item', p.title);
      b.type = 'button';
      b.id = 'wiki-go-' + p.id;
      b.addEventListener('click', function () { openPage(p.id); });
      list.appendChild(b);
    });
    $('wiki-new').hidden = !admin();
    drawDrafts();
  }
  // In Admin Mode: the drafts, newest first, each with its Forum vote.
  function drawDrafts() {
    var box = $('wiki-drafts');
    box.textContent = '';
    box.hidden = !admin() || !(data.drafts || []).length;
    if (box.hidden) return;
    box.appendChild(el('h2', null, 'Drafts'));
    data.drafts.forEach(function (d) {
      var row = el('div', 'lt-wiki-draft');
      row.id = 'wiki-draft-' + d.id;
      var of = d.of ? data.pages.filter(function (p) { return p.id === d.of; })[0] : null;
      row.appendChild(el('p', 'lt-col-head', d.title));
      row.appendChild(el('p', 'small', (d.of ? 'An edit to ' + (of ? of.title : d.of) : 'A new page') + ' · drafted ' + day(d.drafted)));
      var state = d.state === 'Draft' ? 'Waiting on the Forum: ' + (d.vote || 'Discussing') + '.' : d.state === 'Taken in' ? 'Its vote passed: the page is changed.' : d.state === 'Live' ? 'Its vote passed: it\'s live.' : 'Not taken: its vote didn\'t pass.';
      row.appendChild(el('p', 'small lt-wiki-state', state));
      if (d.topic) {
        var t = el('button', 'link-btn', 'Open its Forum topic');
        t.type = 'button';
        t.addEventListener('click', function () { app.openTopic(d.topic); });
        row.appendChild(t);
      }
      box.appendChild(row);
    });
  }

  /* ── A page ── */

  // `from`: where ← goes (a ℹ️'s screen); the list when it's left out.
  function openPage(id, from) {
    if (from !== undefined) back = from;
    var go = function () {
      page = data.pages.filter(function (p) { return p.id === id; })[0] || null;
      app.show('v-wiki-page');
      if (!page) { $('wiki-title').textContent = 'That page isn\'t here any more.'; $('wiki-body').textContent = ''; $('wiki-edit').hidden = true; return; }
      $('wiki-title').textContent = page.title;
      $('wiki-when').textContent = page.live ? 'As of ' + day(page.live) : '';
      render($('wiki-body'), page.text);
      $('wiki-edit').hidden = !admin();
    };
    if (data && from === undefined) return Promise.resolve(go());
    app.show('v-wiki-page');
    $('wiki-title').textContent = 'Loading…';
    $('wiki-body').textContent = '';
    return load().then(go, function (err) { failed(err, 'wiki-title'); });
  }

  // The text, as paragraphs, lists, and the sources.
  function render(box, text) {
    box.textContent = '';
    String(text || '').split(/\n\s*\n/).forEach(function (para) {
      para = para.replace(/^\s+|\s+$/g, '');
      if (!para) return;
      if (para === '{{sources}}') { box.appendChild(sources()); return; }
      var ul = null, p = null;
      para.split('\n').forEach(function (line) {
        if (/^- /.test(line)) {
          if (!ul) { ul = el('ul', 'lt-wiki-list'); box.appendChild(ul); p = null; }
          ul.appendChild(el('li', null, line.slice(2)));
        } else {
          if (!p) { p = el('p'); box.appendChild(p); ul = null; p.textContent = line; }
          else p.textContent += ' ' + line;
        }
      });
    });
  }
  // Each source: its title, what we took from it, and its link.
  function sources() {
    var box = el('div', 'lt-wiki-sources');
    var list = (data && data.sources) || [];
    if (!list.length) { box.appendChild(el('p', 'muted small', 'No sources are saved yet.')); return box; }
    list.forEach(function (s) {
      var item = el('div', 'lt-wiki-source');
      item.appendChild(el('p', 'lt-col-head', s.source));
      if (s.usedFor) item.appendChild(el('p', 'small', 'What we took from it: ' + s.usedFor));
      if (/^https?:\/\//i.test(s.link)) {
        var a = el('a', 'small', s.link);
        a.href = s.link; a.target = '_blank'; a.rel = 'noopener noreferrer';
        item.appendChild(a);
      }
      box.appendChild(item);
    });
    return box;
  }

  function leavePage() {
    if (back) { var b = back; back = null; b(); return; }
    drawList();
  }

  /* ── A draft (Admin Mode) ── */

  function startDraft(of) {
    editing = of || null;
    app.show('v-wiki-draft');
    $('wd-head').textContent = of ? 'Draft an edit to ' + of.title : 'Draft a new page';
    $('wd-title').value = of ? of.title : '';
    $('wd-text').value = of ? of.text : '';
    $('wd-err').textContent = '';
    $('wd-title').focus();
  }
  function sendDraft() {
    var b = $('wd-send');
    return app.busy(b, 'wd-err', function () {
      return app.api('wikiDraft', { token: app.myToken(), of: editing ? editing.id : '', title: $('wd-title').value, text: $('wd-text').value }).then(function (d) {
        data = d;
        said = 'Sent to the Forum as ' + d.topic + '. It goes live for players once its vote passes.';
        editing = null;
        back = null;
        drawList();
      });
    });
  }

  // Admin Mode turned on or off: drafting shows or hides at once.
  function sync() {
    if (!data) return;
    if (!$('v-wiki').hidden) drawList();
    if (!$('v-wiki-page').hidden && page) $('wiki-edit').hidden = !admin();
  }

  // A ℹ️'s link to its page; ← comes back to where it was pressed.
  function link(which) {
    var b = el('button', 'link-btn lt-wiki-link', 'Read more in the Wiki');
    b.type = 'button';
    b.addEventListener('click', function (e) {
      e.stopPropagation();
      var from = app.here ? app.here() : null;
      if (app.closePanel) app.closePanel();
      openPage(PAGES[which], from);
    });
    return b;
  }

  $('cl-sim').addEventListener('change', sync);
  $('me-go-wiki').addEventListener('click', open);
  $('wiki-back').addEventListener('click', function () { if (app.back) app.back(); });
  $('wiki-page-back').addEventListener('click', leavePage);
  $('wiki-new').addEventListener('click', function () { startDraft(null); });
  $('wiki-edit').addEventListener('click', function () { if (page) startDraft(page); });
  $('wd-send').addEventListener('click', sendDraft);
  $('wd-cancel').addEventListener('click', function () { if (editing) openPage(editing.id); else drawList(); editing = null; });

  return { open: open, openPage: openPage, link: link, sync: sync };
};
