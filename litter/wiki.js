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
  // The sections, in order, and each section's pages in order (S6-P9 round 2).
  function sections() { return (data && data.sections) || []; }
  function pagesIn(sectionId, but) {
    return data.pages.filter(function (p) { return p.section === sectionId && p.id !== but; })
      .sort(function (a, b) { return (a.place || 999) - (b.place || 999) || a.title.localeCompare(b.title); });
  }
  function sectionOf(p) { return sections().filter(function (s) { return s.id === p.section; })[0] || null; }
  // A page in the contents, a plain link, like Wikipedia's (S6-P9, |Q726 (a)).
  function pageButton(p, label) {
    var b = el('button', 'lt-wiki-item');
    b.type = 'button';
    b.id = 'wiki-go-' + p.id;
    if (label) b.appendChild(label); else b.textContent = p.title;
    b.addEventListener('click', function () { openPage(p.id); });
    return b;
  }
  function drawList() {
    app.show('v-wiki');
    var list = $('wiki-list');
    list.textContent = '';
    $('wiki-note').textContent = said || (data.pages.length ? 'How the litter page works, written by HABO\'s admins.' : 'No pages yet.');
    said = '';
    var q = String($('wiki-search').value || '').trim();
    if (q) drawResults(list, q);
    else {
      sections().forEach(function (s) {
        var box = el('div', 'lt-wiki-section');
        box.id = 'wiki-sec-' + s.id;
        box.appendChild(el('h3', null, s.name));
        var ps = pagesIn(s.id);
        if (!ps.length) box.appendChild(el('p', 'muted small', 'No pages yet.'));
        else box.appendChild(toc(ps));
        list.appendChild(box);
      });
      var known = {};
      sections().forEach(function (s) { known[s.id] = true; });
      var other = data.pages.filter(function (p) { return !known[p.section]; });
      if (other.length) {
        var box = el('div', 'lt-wiki-section');
        box.appendChild(el('h3', null, sections().length ? 'Other pages' : 'Pages'));
        box.appendChild(toc(other));
        list.appendChild(box);
      }
    }
    $('wiki-new').hidden = !admin();
    $('wiki-new-section').hidden = !admin();
    if (!admin()) $('wiki-sec-form').hidden = true;
    drawDrafts();
  }
  // Search: titles and text; each match with the line it's in, the words marked.
  function marked(text, q) {
    var span = el('span'), low = text.toLowerCase(), lq = q.toLowerCase(), i = 0, j;
    while ((j = low.indexOf(lq, i)) !== -1) {
      if (j > i) span.appendChild(document.createTextNode(text.slice(i, j)));
      span.appendChild(el('mark', null, text.slice(j, j + q.length)));
      i = j + q.length;
    }
    if (i < text.length) span.appendChild(document.createTextNode(text.slice(i)));
    return span;
  }
  function lineWith(text, q) {
    var lines = [];
    String(text || '').replace(/\{\{sources\}\}/g, '').split(/\n+/).forEach(function (l) { (l.match(/[^.!?]+[.!?]*/g) || []).forEach(function (x) { lines.push(x); }); });
    var lq = q.toLowerCase();
    for (var i = 0; i < lines.length; i++) if (lines[i].toLowerCase().indexOf(lq) !== -1) return lines[i].replace(/^- /, '').trim();
    return '';
  }
  function drawResults(list, q) {
    var lq = q.toLowerCase();
    var hits = data.pages.filter(function (p) { return p.title.toLowerCase().indexOf(lq) !== -1 || String(p.text).toLowerCase().indexOf(lq) !== -1; });
    var head = el('p', 'muted small lt-wiki-hits', hits.length ? hits.length + ' page' + (hits.length === 1 ? '' : 's') + ' with "' + q + '"' : 'No page has "' + q + '".');
    list.appendChild(head);
    var ul = el('ul', 'lt-wiki-toc lt-wiki-hits-list');
    hits.forEach(function (p) {
      var s = sectionOf(p);
      var label = el('span', 'lt-wiki-hit');
      label.appendChild(el('span', 'lt-wiki-hit-where', (s ? s.name + ' › ' : '')));
      label.appendChild(marked(p.title, q));
      var line = lineWith(p.text, q);
      if (line) { var l = el('span', 'lt-wiki-hit-line'); l.appendChild(marked(line, q)); label.appendChild(l); }
      var li = el('li');
      li.appendChild(pageButton(p, label));
      ul.appendChild(li);
    });
    list.appendChild(ul);
  }
  function toc(pages) {
    var ul = el('ul', 'lt-wiki-toc');
    pages.forEach(function (p) { var li = el('li'); li.appendChild(pageButton(p)); ul.appendChild(li); });
    return ul;
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
      var of = d.of ? (d.kind === 'section' ? sections() : data.pages).filter(function (p) { return p.id === d.of; })[0] : null;
      var sec = d.section ? sections().filter(function (s) { return s.id === d.section; })[0] : null;
      row.appendChild(el('p', 'lt-col-head', d.title));
      row.appendChild(el('p', 'small', (d.kind === 'section' ? (d.of ? 'Renaming the section ' + (of ? of.name : d.of) : 'A new section')
        : (d.of ? 'An edit to ' + (of ? of.title : d.of) : 'A new page') + (sec ? ', in ' + sec.name : '')) + ' · drafted ' + day(d.drafted)));
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
      // Where it is (Section › Page), and the pages before and after it in its section (S6-P9 round 2).
      var s = sectionOf(page);
      $('wiki-crumb').textContent = (s ? s.name : 'Wiki') + ' › ' + page.title;
      var ps = s ? pagesIn(s.id) : [], at = ps.map(function (p) { return p.id; }).indexOf(page.id);
      var prev = at > 0 ? ps[at - 1] : null, next = at !== -1 && at < ps.length - 1 ? ps[at + 1] : null;
      $('wiki-prev').hidden = !prev; $('wiki-next').hidden = !next;
      $('wiki-prev').textContent = prev ? '‹ Previous: ' + prev.title : '';
      $('wiki-next').textContent = next ? 'Next: ' + next.title + ' ›' : '';
      $('wiki-prev').dataset.go = prev ? prev.id : ''; $('wiki-next').dataset.go = next ? next.id : '';
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

  // A draft names its section and its place there; the Forum's vote approves both (S6-P9 round 2).
  function fillPlaces() {
    var sel = $('wd-place'), sec = $('wd-section').value;
    sel.textContent = '';
    var ps = pagesIn(sec, editing ? editing.id : '');
    var opt = function (v, t) { var o = el('option', null, t); o.value = String(v); sel.appendChild(o); };
    var here = editing && editing.section === sec ? pagesIn(sec).map(function (p) { return p.id; }).indexOf(editing.id) : -1;
    if (here !== -1) opt(here + 1, 'Where it is now');
    opt(0, 'At the end');
    opt(1, 'First');
    ps.forEach(function (p, i) { opt(i + 2, 'After: ' + p.title); });
    sel.value = here !== -1 ? String(here + 1) : '0';
  }
  function startDraft(of) {
    editing = of || null;
    app.show('v-wiki-draft');
    $('wd-head').textContent = of ? 'Draft an edit to ' + of.title : 'Draft a new page';
    $('wd-title').value = of ? of.title : '';
    $('wd-text').value = of ? of.text : '';
    $('wd-err').textContent = '';
    var sel = $('wd-section');
    sel.textContent = '';
    sections().forEach(function (s) { var o = el('option', null, s.name); o.value = s.id; sel.appendChild(o); });
    sel.value = of && of.section ? of.section : (sections()[0] ? sections()[0].id : '');
    fillPlaces();
    $('wd-title').focus();
  }
  function sendDraft() {
    var b = $('wd-send');
    return app.busy(b, 'wd-err', function () {
      return app.api('wikiDraft', { token: app.myToken(), of: editing ? editing.id : '', title: $('wd-title').value, text: $('wd-text').value,
        section: $('wd-section').value, place: Number($('wd-place').value) || 0 }).then(function (d) {
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

  // A section proposed: new, or one renamed (S6-P9 round 2, |Q692 (a)).
  function startSection() {
    var sel = $('wiki-sec-of');
    sel.textContent = '';
    var o = el('option', null, 'A new section, after the others'); o.value = ''; sel.appendChild(o);
    sections().forEach(function (s) { var r = el('option', null, 'Rename: ' + s.name); r.value = s.id; sel.appendChild(r); });
    $('wiki-sec-name').value = '';
    $('wiki-sec-err').textContent = '';
    $('wiki-sec-form').hidden = false;
    $('wiki-sec-name').focus();
  }
  function sendSection() {
    return app.busy($('wiki-sec-send'), 'wiki-sec-err', function () {
      return app.api('wikiSectionDraft', { token: app.myToken(), name: $('wiki-sec-name').value, of: $('wiki-sec-of').value }).then(function (d) {
        data = d;
        said = 'Sent to the Forum as ' + d.topic + '. The section is on the Wiki once its vote passes.';
        $('wiki-sec-form').hidden = true;
        drawList();
      });
    });
  }

  $('cl-sim').addEventListener('change', sync);
  $('wiki-search').addEventListener('input', function () { if (data) drawList(); });
  $('wiki-prev').addEventListener('click', function () { if (this.dataset.go) openPage(this.dataset.go); });
  $('wiki-next').addEventListener('click', function () { if (this.dataset.go) openPage(this.dataset.go); });
  $('wd-section').addEventListener('change', fillPlaces);
  $('wiki-new-section').addEventListener('click', startSection);
  $('wiki-sec-send').addEventListener('click', sendSection);
  $('wiki-sec-cancel').addEventListener('click', function () { $('wiki-sec-form').hidden = true; });
  $('me-go-wiki').addEventListener('click', open);
  $('wiki-back').addEventListener('click', function () { if (app.back) app.back(); });
  $('wiki-page-back').addEventListener('click', leavePage);
  $('wiki-new').addEventListener('click', function () { startDraft(null); });
  $('wiki-edit').addEventListener('click', function () { if (page) startDraft(page); });
  $('wd-send').addEventListener('click', sendDraft);
  $('wd-cancel').addEventListener('click', function () { if (editing) openPage(editing.id); else drawList(); editing = null; });

  return { open: open, openPage: openPage, link: link, sync: sync };
};
